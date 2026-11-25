// Scale rehearsal: a query that takes 2 ms on 100 test rows can take minutes on 10 million real ones, and a migration that is
// instant on an empty table can lock a full one. This fills a COPY of the database with realistic numbers of rows, then times
// the migration and checks how each query would run (a full table scan on a big table is the usual culprit).
// SQLite runs right here (Node's built-in driver); the original file is never opened for writing. For Postgres, run
// `EXPLAIN (FORMAT JSON) <query>` on a LOCAL copy and pass the saved output with --pg-plan; it flags sequential scans.
// Run: node db-rehearse.mjs (--sqlite <db> | --schema <file.sql>) [--seed table=rows ...] [--migrate <file.sql>]
//                           [--explain "<sql>" ...] [--keep] [--project <dir>] [--max-rows 2000000]
//      node db-rehearse.mjs --pg-plan <plan.json> [--min-rows 10000]
// Row counts can come from the scale profile (.claude/scale.json): `--seed users=users` (the planned number of people) and
// `--seed orders=per-user:200` (200 per person). Very large plans are capped at --max-rows so a rehearsal finishes, and the
// migration time is scaled up to estimate the real one.
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProfile } from "./scale-profile.mjs";

// "5000" -> 5000; "users" -> the planned number of people; "per-user:200" -> people x 200; "main" -> the planned main table.
export function seedCount(spec, profile, maxRows = 2000000) {
  let planned;
  if (/^\d+$/.test(String(spec))) planned = Number(spec);
  else if (spec === "users") planned = profile.usersTotal;
  else if (spec === "main") planned = profile.usersTotal * profile.recordsPerUser;
  else if (/^per-user:\d+(\.\d+)?$/.test(String(spec))) planned = Math.round(profile.usersTotal * Number(spec.split(":")[1]));
  else return { error: `"${spec}" is not a row count, "users", "main" or "per-user:N"` };
  const rows = Math.min(planned, maxRows);
  return { planned, rows, scale: rows ? planned / rows : 1 };
}

async function sqlite() {
  const prev = process.emitWarning;
  process.emitWarning = () => {}; // the driver announces itself as experimental on every load
  try {
    return (await import("node:sqlite")).DatabaseSync;
  } finally {
    process.emitWarning = prev;
  }
}

export async function openCopy({ db, schema }) {
  const DatabaseSync = await sqlite();
  const dir = mkdtempSync(join(tmpdir(), "rehearse-"));
  const path = join(dir, "copy.db");
  if (db) {
    if (/^[a-z][\w+.-]*:\/\//i.test(db)) throw new Error("rehearsals only run on a local database file, never a server address");
    if (!existsSync(db)) throw new Error(`no such database file: ${db}`);
    copyFileSync(db, path);
  }
  const conn = new DatabaseSync(path);
  if (schema) conn.exec(readFileSync(schema, "utf8"));
  conn.exec("PRAGMA foreign_keys = ON");
  return { conn, path, dir, close: () => { try { conn.close(); } catch {} rmSync(dir, { recursive: true, force: true }); } };
}

const quote = (n) => `"${String(n).replace(/"/g, '""')}"`;

export function seed(conn, table, rows, batch = 5000) {
  const cols = conn.prepare(`PRAGMA table_info(${quote(table)})`).all();
  if (!cols.length) throw new Error(`no table named ${table}`);
  const fks = conn.prepare(`PRAGMA foreign_key_list(${quote(table)})`).all();
  const parents = {};
  for (const fk of fks) {
    const ids = conn.prepare(`SELECT ${quote(fk.to ?? "rowid")} AS id FROM ${quote(fk.table)} LIMIT 100000`).all().map((r) => r.id);
    if (!ids.length) throw new Error(`seed ${fk.table} before ${table} (${table}.${fk.from} points to it)`);
    parents[fk.from] = ids;
  }
  const start = conn.prepare(`SELECT COUNT(*) AS n FROM ${quote(table)}`).get().n;
  const use = cols.filter((c) => !(c.pk && /INT/i.test(c.type) && !fks.some((f) => f.from === c.name)));
  const ins = conn.prepare(`INSERT INTO ${quote(table)} (${use.map((c) => quote(c.name)).join(",")}) VALUES (${use.map(() => "?").join(",")})`);
  const value = (c, i) => {
    if (parents[c.name]) return parents[c.name][i % parents[c.name].length];
    const t = (c.type || "").toUpperCase();
    const n = c.name.toLowerCase();
    if (/(^is_|^has_|bool)/.test(n) || /BOOL/.test(t)) return i % 2;
    if (/(_at|_on|date|time)$/.test(n) || /DATE|TIME/.test(t)) return new Date(Date.UTC(2020, 0, 1) + (i % 2000) * 86400000).toISOString();
    if (/INT/.test(t)) return start + i + 1;
    if (/REAL|FLOA|DOUB|NUM|DEC/.test(t)) return Math.round((start + i) * 1.37 * 100) / 100;
    if (/BLOB/.test(t)) return c.notnull ? Buffer.from([i % 256]) : null;
    if (/email/.test(n)) return `user${start + i}@example.com`;
    return `${c.name}-${start + i}`;
  };
  const t0 = Date.now();
  for (let i = 0; i < rows; i += batch) {
    conn.exec("BEGIN");
    for (let j = i; j < Math.min(rows, i + batch); j++) ins.run(...use.map((c) => value(c, j)));
    conn.exec("COMMIT");
  }
  return { table, rows, ms: Date.now() - t0 };
}

export function explain(conn, sql) {
  const plan = conn.prepare(`EXPLAIN QUERY PLAN ${sql}`).all().map((r) => r.detail);
  const problems = [];
  for (const d of plan) {
    const m = /^SCAN (?:TABLE )?(\S+)(.*)$/.exec(d);
    if (m && !/USING (COVERING )?INDEX/.test(m[2])) {
      let rows = null;
      try {
        rows = conn.prepare(`SELECT COUNT(*) AS n FROM ${quote(m[1])}`).get().n;
      } catch {}
      problems.push(`reads every row of ${m[1]}${rows !== null ? ` (${rows} rows)` : ""}: add an index on the columns it filters or joins on`);
    }
    if (/USE TEMP B-TREE FOR ORDER BY/.test(d)) problems.push("sorts the results without an index: an index on the ORDER BY columns avoids it");
  }
  const t0 = Date.now();
  let returned = 0;
  if (/^\s*(SELECT|WITH)\b/i.test(sql)) returned = conn.prepare(sql).all().length;
  return { plan, problems, ms: Date.now() - t0, returned };
}

export function timeMigration(conn, file) {
  const t0 = Date.now();
  conn.exec(readFileSync(file, "utf8"));
  return { ms: Date.now() - t0 };
}

// Postgres EXPLAIN (FORMAT JSON) output -> sequential scans over big tables, and the slowest steps.
export function pgSeqScans(planJson, minRows = 10000) {
  const root = Array.isArray(planJson) ? planJson[0]?.Plan : planJson?.Plan ?? planJson;
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    const rows = n["Actual Rows"] ?? n["Plan Rows"] ?? 0;
    if (n["Node Type"] === "Seq Scan" && rows >= minRows) out.push(`reads every row of ${n["Relation Name"]} (about ${rows} rows)${n.Filter ? ` to filter on ${n.Filter}` : ""}: add an index for that filter`);
    if (n["Node Type"] === "Sort" && /external/i.test(n["Sort Method"] ?? "")) out.push(`sorts on disk (${n["Sort Key"]?.join(", ")}): add an index for the ORDER BY, or raise work_mem`);
    for (const c of n.Plans ?? []) walk(c);
  };
  walk(root);
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  const get = (f) => (a.includes(f) ? a[a.indexOf(f) + 1] : undefined);
  const all = (f) => a.flatMap((x, i) => (x === f ? [a[i + 1]] : []));
  if (get("--pg-plan")) {
    const p = pgSeqScans(JSON.parse(readFileSync(get("--pg-plan"), "utf8")), Number(get("--min-rows")) || 10000);
    console.log(p.length ? p.map((x) => `- ${x}`).join("\n") : "No full-table scans over big tables in this plan.");
    process.exitCode = p.length ? 1 : 0;
  } else {
    const copy = await openCopy({ db: get("--sqlite"), schema: get("--schema") });
    let bad = false;
    try {
      const profile = loadProfile(resolve(get("--project") ?? "."));
      const maxRows = Number(get("--max-rows")) || 2000000;
      let scale = 1;
      for (const s of all("--seed")) {
        const [t, spec] = s.split("=");
        const c = seedCount(spec, profile, maxRows);
        if (c.error) throw new Error(c.error);
        scale = Math.max(scale, c.scale);
        const r = seed(copy.conn, t, c.rows);
        console.log(`Seeded ${r.rows} rows into ${t} in ${r.ms} ms${c.planned !== c.rows ? ` (the plan says ${c.planned}; capped at --max-rows ${maxRows})` : ""}.`);
      }
      if (get("--migrate")) {
        const r = timeMigration(copy.conn, get("--migrate"));
        const est = scale > 1 ? ` At the planned size (about ${Math.round(scale)}x more rows) expect roughly ${Math.round((r.ms * scale) / 1000)} s or more.` : "";
        console.log(`Migration took ${r.ms} ms on this data.${est}${r.ms * scale > 5000 ? " That is long enough to matter on a live database: plan it for a quiet time or split it." : ""}`);
      }
      for (const q of all("--explain")) {
        const r = explain(copy.conn, q);
        console.log(`Query (${r.ms} ms, ${r.returned} rows): ${q.slice(0, 100)}\n  plan: ${r.plan.join(" / ")}` + (r.problems.length ? "\n" + r.problems.map((x) => `  - ${x}`).join("\n") : "\n  - uses indexes; fine at this size"));
        bad ||= r.problems.length > 0;
      }
      if (a.includes("--keep")) console.log(`Copy kept at ${copy.path}`);
    } finally {
      if (!a.includes("--keep")) copy.close();
    }
    process.exitCode = bad ? 1 : 0;
  }
}
