// Schema map: writes SCHEMA.md, one short page that shows the whole database (every table, column, key, index and relationship,
// plus a diagram), built from the migrations, so Claude doesn't have to read dozens of migration files to learn it and the page
// cannot go stale: a check compares it with what the migrations really produce.
// Sources, first one that yields tables wins: plain SQL migrations (replayed in order), prisma/schema.prisma, Rails db/schema.rb,
// or a local SQLite file (--sqlite, opened read-only). Django/Alembic/Knex migrations are code, not SQL: use a local database dump
// (--sql <file>) of a copy, or run /starter-kit:db's rehearsal copy and pass it with --sqlite.
// It reads migration files only (never connects to a server). Run:
//   node schema-map.mjs --project <dir> [--write | --check] [--sqlite <db>] [--sql <file>] [--print]
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MIGRATION_PATH } from "./migration-check.mjs";

// ---------- SQL ----------
export function stripSql(sql) {
  let out = "";
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'" || c === '"' || c === "`") {
      const q = c;
      out += c;
      for (i++; i < sql.length; i++) {
        out += sql[i];
        if (sql[i] === q) {
          if (sql[i + 1] === q) out += sql[++i];
          else break;
        }
      }
    } else if (c === "-" && sql[i + 1] === "-") while (i < sql.length && sql[i] !== "\n") i++;
    else if (c === "/" && sql[i + 1] === "*") {
      i += 2;
      while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
      i++;
    } else out += c;
  }
  return out;
}

// Split on `sep` at the top level only (not inside parentheses or quotes).
export function splitTop(text, sep) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "'" || c === '"' || c === "`") {
      const q = c;
      cur += c;
      for (i++; i < text.length; i++) {
        cur += text[i];
        if (text[i] === q) break;
      }
    } else if (c === "(") { depth++; cur += c; }
    else if (c === ")") { depth--; cur += c; }
    else if (c === sep && depth === 0) { parts.push(cur); cur = ""; }
    else cur += c;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

const unq = (s) => s.trim().replace(/^[`"\[]|[`"\]]$/g, "");
const ident = (s) => unq(s.trim().split(".").pop());
const cols = (s) => splitTop(s, ",").map((c) => unq(c.trim().split(/\s+/)[0]));
const key = (n) => n.toLowerCase();

const KW = /\b(NOT|NULL|DEFAULT|PRIMARY|UNIQUE|REFERENCES|CHECK|CONSTRAINT|GENERATED|AUTO_INCREMENT|AUTOINCREMENT|COLLATE|COMMENT|ON|IDENTITY)\b/i;

export function parseColumn(def) {
  const m = /^\s*([`"\[][^`"\]]+[`"\]]|[\w$]+)\s*(.*)$/s.exec(def);
  if (!m) return null;
  const rest = m[2];
  const at = rest.search(KW);
  const type = (at === -1 ? rest : rest.slice(0, at)).trim().replace(/\s+/g, " ") || "";
  const flags = at === -1 ? "" : rest.slice(at);
  const col = { name: unq(m[1]), type, notNull: /\bNOT\s+NULL\b/i.test(flags), pk: /\bPRIMARY\s+KEY\b/i.test(flags), unique: /\bUNIQUE\b/i.test(flags) && !/\bUNIQUE\s*\(/.test(flags), default: null, ref: null };
  const d = /\bDEFAULT\s+(\([^)]*\)|'[^']*'|[^\s,]+)/i.exec(flags);
  if (d) col.default = d[1];
  const r = /\bREFERENCES\s+([`"\[\w.$\]]+)\s*(?:\(([^)]*)\))?/i.exec(flags);
  if (r) col.ref = { table: ident(r[1]), cols: r[2] ? cols(r[2]) : ["id"] };
  if (/\bSERIAL\b|\bIDENTITY\b|AUTO_?INCREMENT/i.test(type + " " + flags) && col.pk) col.notNull = true;
  if (col.pk) col.notNull = true;
  return col;
}

export class Schema {
  constructor() {
    this.tables = new Map();
  }
  get(name) {
    return this.tables.get(key(name));
  }
  create(name) {
    const t = { name, columns: [], pk: [], fks: [], uniques: [], indexes: [] };
    this.tables.set(key(name), t);
    return t;
  }
  addColumn(t, col) {
    const i = t.columns.findIndex((c) => key(c.name) === key(col.name));
    if (i >= 0) t.columns[i] = col;
    else t.columns.push(col);
    if (col.pk && !t.pk.includes(col.name)) t.pk.push(col.name);
    if (col.ref) t.fks.push({ cols: [col.name], table: col.ref.table, refCols: col.ref.cols });
  }
  tableConstraint(t, text) {
    let m;
    if ((m = /\bPRIMARY\s+KEY\s*\(([^)]*)\)/i.exec(text))) {
      t.pk = cols(m[1]);
      for (const c of t.columns) if (t.pk.some((p) => key(p) === key(c.name))) { c.pk = true; c.notNull = true; }
    } else if ((m = /\bFOREIGN\s+KEY\s*\(([^)]*)\)\s*REFERENCES\s+([`"\[\w.$\]]+)\s*(?:\(([^)]*)\))?/i.exec(text))) t.fks.push({ cols: cols(m[1]), table: ident(m[2]), refCols: m[3] ? cols(m[3]) : ["id"] });
    else if ((m = /\bUNIQUE\s*(?:KEY|INDEX)?\s*(?:[`"\w]+\s*)?\(([^)]*)\)/i.exec(text))) t.uniques.push(cols(m[1]));
  }
  statement(st) {
    let m;
    if ((m = /^CREATE\s+(?:GLOBAL\s+|LOCAL\s+)?(?:TEMP(?:ORARY)?\s+|UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"\[\w.$\]]+)\s*\((.*)\)\s*[^)]*$/is.exec(st))) {
      const t = this.create(ident(m[1]));
      for (const part of splitTop(m[2], ",")) {
        if (/^(CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|INDEX|KEY|FULLTEXT|EXCLUDE|LIKE)\b/i.test(part)) this.tableConstraint(t, part.replace(/^CONSTRAINT\s+\S+\s+/i, ""));
        else {
          const c = parseColumn(part);
          if (c) this.addColumn(t, c);
        }
      }
    } else if ((m = /^ALTER\s+TABLE\s+(?:ONLY\s+)?(?:IF\s+EXISTS\s+)?([`"\[\w.$\]]+)\s+(.*)$/is.exec(st))) {
      const t = this.get(ident(m[1]));
      if (!t) return;
      for (const act of splitTop(m[2], ",")) this.alter(t, act);
    } else if ((m = /^CREATE\s+(UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?([`"\[\w.$\]]+)\s+ON\s+(?:ONLY\s+)?([`"\[\w.$\]]+)\s*(?:USING\s+\w+\s*)?\((.*)\)/is.exec(st))) {
      const t = this.get(ident(m[3]));
      if (t) t.indexes.push({ name: ident(m[2]), cols: splitTop(m[4], ",").map((c) => unq(c.trim().split(/\s+/)[0].replace(/\(.*$/, ""))), unique: !!m[1] });
    } else if ((m = /^DROP\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?([`"\[\w.$\]]+)/i.exec(st))) {
      for (const t of this.tables.values()) t.indexes = t.indexes.filter((i) => key(i.name) !== key(ident(m[1])));
    } else if ((m = /^DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(.*?)(?:\s+(?:CASCADE|RESTRICT))?$/is.exec(st))) {
      for (const n of splitTop(m[1], ",")) {
        this.tables.delete(key(ident(n)));
        for (const t of this.tables.values()) t.fks = t.fks.filter((f) => key(f.table) !== key(ident(n)));
      }
    } else if ((m = /^RENAME\s+TABLE\s+(\S+)\s+TO\s+(\S+)/i.exec(st))) this.renameTable(ident(m[1]), ident(m[2]));
  }
  renameTable(from, to) {
    const t = this.get(from);
    if (!t) return;
    this.tables.delete(key(from));
    t.name = to;
    this.tables.set(key(to), t);
    for (const o of this.tables.values()) for (const f of o.fks) if (key(f.table) === key(from)) f.table = to;
  }
  alter(t, act) {
    let m;
    if ((m = /^ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?!CONSTRAINT\b|PRIMARY\b|FOREIGN\b|UNIQUE\b|CHECK\b|INDEX\b|KEY\b)(.+)$/is.exec(act))) {
      const c = parseColumn(m[1]);
      if (c) this.addColumn(t, c);
    } else if (/^ADD\s+(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE)\b/i.test(act)) this.tableConstraint(t, act.replace(/^ADD\s+/i, "").replace(/^CONSTRAINT\s+\S+\s+/i, ""));
    else if ((m = /^DROP\s+(?:COLUMN\s+)?(?:IF\s+EXISTS\s+)?([`"\[\w$\]]+)\s*(?:CASCADE|RESTRICT)?$/is.exec(act)) && !/^(CONSTRAINT|PRIMARY|FOREIGN|INDEX|KEY)$/i.test(m[1])) {
      const n = unq(m[1]);
      t.columns = t.columns.filter((c) => key(c.name) !== key(n));
      t.pk = t.pk.filter((c) => key(c) !== key(n));
      t.fks = t.fks.filter((f) => !f.cols.some((c) => key(c) === key(n)));
      t.indexes = t.indexes.filter((i) => !i.cols.some((c) => key(c) === key(n)));
      t.uniques = t.uniques.filter((u) => !u.some((c) => key(c) === key(n)));
    } else if ((m = /^RENAME\s+COLUMN\s+([`"\[\w$\]]+)\s+TO\s+([`"\[\w$\]]+)/i.exec(act))) this.renameColumn(t, unq(m[1]), unq(m[2]));
    else if ((m = /^RENAME\s+(?:TO|AS)\s+([`"\[\w.$\]]+)/i.exec(act))) this.renameTable(t.name, ident(m[1]));
    else if ((m = /^CHANGE\s+(?:COLUMN\s+)?([`"\[\w$\]]+)\s+(.+)$/is.exec(act))) {
      const c = parseColumn(m[2]);
      if (c) {
        this.renameColumn(t, unq(m[1]), c.name);
        this.addColumn(t, c);
      }
    } else if ((m = /^(?:MODIFY|ALTER)\s+(?:COLUMN\s+)?([`"\[\w$\]]+)\s+(.+)$/is.exec(act))) {
      const col = t.columns.find((c) => key(c.name) === key(unq(m[1])));
      if (!col) return;
      const rest = m[2];
      let r;
      if ((r = /^(?:SET\s+DATA\s+)?TYPE\s+(.+?)(?:\s+USING\b.*)?$/is.exec(rest))) col.type = r[1].trim();
      else if (/^SET\s+NOT\s+NULL/i.test(rest)) col.notNull = true;
      else if (/^DROP\s+NOT\s+NULL/i.test(rest)) col.notNull = false;
      else if ((r = /^SET\s+DEFAULT\s+(.+)$/is.exec(rest))) col.default = r[1].trim();
      else if (/^DROP\s+DEFAULT/i.test(rest)) col.default = null;
      else if (!/^(SET|DROP|ADD)\b/i.test(rest)) {
        const c = parseColumn(`${m[1]} ${rest}`); // MySQL MODIFY: a full new definition
        if (c) Object.assign(col, { type: c.type, notNull: c.notNull, default: c.default });
      }
    }
  }
  renameColumn(t, from, to) {
    const c = t.columns.find((x) => key(x.name) === key(from));
    if (!c) return;
    c.name = to;
    t.pk = t.pk.map((p) => (key(p) === key(from) ? to : p));
    for (const f of t.fks) f.cols = f.cols.map((x) => (key(x) === key(from) ? to : x));
    t.indexes.forEach((i) => (i.cols = i.cols.map((x) => (key(x) === key(from) ? to : x))));
    t.uniques = t.uniques.map((u) => u.map((x) => (key(x) === key(from) ? to : x)));
    for (const o of this.tables.values()) for (const f of o.fks) if (key(f.table) === key(t.name)) f.refCols = f.refCols.map((x) => (key(x) === key(from) ? to : x));
  }
}

export function parseSql(sql, schema = new Schema()) {
  for (const st of splitTop(stripSql(sql), ";")) schema.statement(st.trim());
  return schema;
}

// ---------- other sources ----------
export function parsePrisma(text) {
  const schema = new Schema();
  const blocks = [...text.matchAll(/^\s*model\s+(\w+)\s*\{([\s\S]*?)^\s*\}/gm)];
  const enums = new Set([...text.matchAll(/^\s*enum\s+(\w+)\s*\{/gm)].map((m) => m[1]));
  const tableOf = new Map();
  for (const [, name, body] of blocks) tableOf.set(name, /@@map\(\s*"([^"]+)"\s*\)/.exec(body)?.[1] ?? name);
  for (const [, name, body] of blocks) {
    const t = schema.create(tableOf.get(name));
    const colName = new Map();
    for (const line of body.split("\n")) {
      const m = /^\s*(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(line);
      if (!m || line.trim().startsWith("@@") || line.trim().startsWith("//")) continue;
      const [, field, type, list, opt, attrs] = m;
      if (list || (tableOf.has(type) && !enums.has(type))) continue; // a relation field, not a column
      const col = { name: /@map\(\s*"([^"]+)"\s*\)/.exec(attrs)?.[1] ?? field, type, notNull: !opt, pk: /@id\b/.test(attrs), unique: /@unique\b/.test(attrs), default: /@default\(([^)]*(?:\([^)]*\))?[^)]*)\)/.exec(attrs)?.[1] ?? null, ref: null };
      colName.set(field, col.name);
      schema.addColumn(t, col);
    }
    for (const line of body.split("\n")) {
      const rel = /^\s*\w+\s+(\w+)\??\s+.*@relation\([^)]*fields:\s*\[([^\]]*)\][^)]*references:\s*\[([^\]]*)\]/.exec(line);
      if (rel && tableOf.has(rel[1])) t.fks.push({ cols: rel[2].split(",").map((s) => colName.get(s.trim()) ?? s.trim()), table: tableOf.get(rel[1]), refCols: rel[3].split(",").map((s) => s.trim()) });
    }
    let m;
    if ((m = /@@id\(\s*\[([^\]]*)\]/.exec(body))) {
      t.pk = m[1].split(",").map((s) => colName.get(s.trim()) ?? s.trim());
      for (const c of t.columns) if (t.pk.includes(c.name)) c.pk = c.notNull = true;
    }
    for (const u of body.matchAll(/@@unique\(\s*\[([^\]]*)\]/g)) t.uniques.push(u[1].split(",").map((s) => colName.get(s.trim()) ?? s.trim()));
    for (const i of body.matchAll(/@@index\(\s*\[([^\]]*)\]/g)) t.indexes.push({ name: "", cols: i[1].split(",").map((s) => colName.get(s.trim()) ?? s.trim()), unique: false });
  }
  return schema;
}

export function parseRailsSchema(text) {
  const schema = new Schema();
  for (const m of text.matchAll(/create_table\s+"([^"]+)"([^\n]*)do\s*\|t\|([\s\S]*?)^\s*end/gm)) {
    const t = schema.create(m[1]);
    if (!/id:\s*false/.test(m[2])) schema.addColumn(t, { name: "id", type: /id:\s*:(\w+)/.exec(m[2])?.[1] ?? "bigint", notNull: true, pk: true, unique: false, default: null, ref: null });
    for (const line of m[3].split("\n")) {
      const c = /^\s*t\.(\w+)\s+"([^"]+)"(.*)$/.exec(line);
      if (c && c[1] !== "index") schema.addColumn(t, { name: c[2], type: c[1], notNull: /null:\s*false/.test(c[3]), pk: false, unique: false, default: /default:\s*([^,]+)/.exec(c[3])?.[1]?.trim() ?? null, ref: null });
      const i = /^\s*t\.index\s+\[([^\]]*)\](.*)$/.exec(line);
      if (i) t.indexes.push({ name: /name:\s*"([^"]+)"/.exec(i[2])?.[1] ?? "", cols: i[1].split(",").map((s) => unq(s.trim())), unique: /unique:\s*true/.test(i[2]) });
    }
  }
  for (const f of text.matchAll(/add_foreign_key\s+"([^"]+)",\s*"([^"]+)"(?:,\s*column:\s*"([^"]+)")?/g)) {
    const t = schema.get(f[1]);
    if (t) t.fks.push({ cols: [f[3] ?? `${f[2].replace(/s$/, "")}_id`], table: f[2], refCols: ["id"] });
  }
  return schema;
}

export async function readSqlite(path) {
  const prev = process.emitWarning;
  process.emitWarning = () => {};
  let DatabaseSync;
  try {
    DatabaseSync = (await import("node:sqlite")).DatabaseSync;
  } finally {
    process.emitWarning = prev;
  }
  const db = new DatabaseSync(path, { readOnly: true });
  const schema = new Schema();
  try {
    for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()) {
      const t = schema.create(name);
      const q = `"${name.replace(/"/g, '""')}"`;
      for (const c of db.prepare(`PRAGMA table_info(${q})`).all()) schema.addColumn(t, { name: c.name, type: c.type, notNull: !!c.notnull || !!c.pk, pk: !!c.pk, unique: false, default: c.dflt_value, ref: null });
      const fks = new Map();
      for (const f of db.prepare(`PRAGMA foreign_key_list(${q})`).all()) {
        const e = fks.get(f.id) ?? { cols: [], table: f.table, refCols: [] };
        e.cols.push(f.from);
        e.refCols.push(f.to ?? "id");
        fks.set(f.id, e);
      }
      t.fks.push(...fks.values());
      for (const i of db.prepare(`PRAGMA index_list(${q})`).all()) {
        if (i.origin === "pk") continue;
        const cs = db.prepare(`PRAGMA index_info("${i.name.replace(/"/g, '""')}")`).all().map((c) => c.name);
        if (i.origin === "u") t.uniques.push(cs);
        else t.indexes.push({ name: i.name, cols: cs, unique: !!i.unique });
      }
    }
  } finally {
    db.close();
  }
  return schema;
}

// ---------- finding the source ----------
function walk(root, dir, out) {
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    const p = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!["node_modules", ".git", "vendor", "dist", "build", ".venv", "venv", "target"].includes(e.name)) walk(root, p, out);
    } else out.push(p);
  }
}
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true });

export async function buildSchema(root, opts = {}) {
  if (opts.sqlite) return { schema: await readSqlite(opts.sqlite), source: `a SQLite database (${opts.sqlite.split(/[\\/]/).pop()})` };
  return buildSchemaFromFiles(root, opts);
}

// Synchronous: migrations, Prisma, Rails or a SQL dump found in the project (used by the session-start drift check).
export function buildSchemaFromFiles(root, { sql } = {}) {
  if (sql) return { schema: parseSql(readFileSync(sql, "utf8")), source: `the SQL file ${sql.split(/[\\/]/).pop()}` };
  let all = [];
  const g = spawnSync("git", ["-C", root, "ls-files", "-co", "--exclude-standard", "-z"], { encoding: "utf8", maxBuffer: 1 << 28 });
  if (g.status === 0) all = g.stdout.split("\0").filter(Boolean).map((f) => f.split("\\").join("/"));
  else walk(root, "", all);
  const migrations = all.filter((f) => /\.sql$/i.test(f) && MIGRATION_PATH.test(f) && !/\.down\.sql$|(^|\/)down\.sql$/i.test(f)).sort(natural);
  if (migrations.length) {
    const s = new Schema();
    for (const f of migrations) parseSql(readFileSync(join(root, f), "utf8"), s);
    if (s.tables.size) return { schema: s, source: `${migrations.length} SQL migration file(s)` };
  }
  const prisma = all.find((f) => /(^|\/)schema\.prisma$/.test(f));
  if (prisma) return { schema: parsePrisma(readFileSync(join(root, prisma), "utf8")), source: prisma };
  const rails = all.find((f) => /(^|\/)db\/schema\.rb$/.test(f));
  if (rails) return { schema: parseRailsSchema(readFileSync(join(root, rails), "utf8")), source: rails };
  const dump = all.find((f) => /(^|\/)(db\/)?structure\.sql$|(^|\/)schema\.sql$/.test(f));
  if (dump) return { schema: parseSql(readFileSync(join(root, dump), "utf8")), source: dump };
  return { schema: new Schema(), source: "nothing (no SQL migrations, Prisma schema, Rails schema or schema.sql found)" };
}

// ---------- output ----------
const mm = (s) => String(s).replace(/[^A-Za-z0-9_]/g, "_") || "x";
const mmType = (t) => mm((t || "any").replace(/\(.*\)/, "").split(/\s+/)[0]) || "any";

export function render(schema, source) {
  const tables = [...schema.tables.values()].sort((a, b) => a.name.localeCompare(b.name));
  const L = ["# Database schema", "", `<!-- generated by schema-map.mjs from ${source}; do not edit by hand, regenerate with: node scripts/schema-map.mjs --project . --write -->`, `Built from ${source}. ${tables.length} table(s).`, ""];
  if (!tables.length) return L.concat(["No tables found.", ""]).join("\n");
  L.push("## Diagram", "", "```mermaid", "erDiagram");
  for (const t of tables) {
    L.push(`  ${mm(t.name)} {`);
    for (const c of t.columns) {
      const marks = [c.pk ? "PK" : "", t.fks.some((f) => f.cols.includes(c.name)) ? "FK" : "", c.unique || t.uniques.some((u) => u.length === 1 && u[0] === c.name) ? "UK" : ""].filter(Boolean).join(",");
      L.push(`    ${mmType(c.type)} ${mm(c.name)}${marks ? " " + marks : ""}`);
    }
    L.push("  }");
  }
  for (const t of tables) for (const f of t.fks) if (schema.get(f.table)) L.push(`  ${mm(f.table)} ||--o{ ${mm(t.name)} : "${f.cols.join(",").replace(/"/g, "")}"`);
  L.push("```", "", "## Tables", "");
  for (const t of tables) {
    L.push(`### ${t.name} {#T-${t.name}}`, "", "| column | type | null | key | default | references |", "|---|---|---|---|---|---|");
    for (const c of t.columns) {
      const fk = t.fks.find((f) => f.cols.includes(c.name));
      const keys = [c.pk ? "PK" : "", c.unique || t.uniques.some((u) => u.length === 1 && u[0] === c.name) ? "unique" : ""].filter(Boolean).join(", ");
      L.push(`| ${c.name} | ${c.type || ""} | ${c.notNull ? "no" : "yes"} | ${keys} | ${c.default ?? ""} | ${fk ? `[[T-${fk.table}]].${fk.refCols[fk.cols.indexOf(c.name)] ?? fk.refCols[0]}` : ""} |`);
    }
    const extra = [];
    if (t.pk.length > 1) extra.push(`primary key (${t.pk.join(", ")})`);
    for (const u of t.uniques.filter((u) => u.length > 1)) extra.push(`unique (${u.join(", ")})`);
    for (const i of t.indexes) extra.push(`${i.unique ? "unique " : ""}index ${i.name ? i.name + " " : ""}(${i.cols.join(", ")})`);
    for (const f of t.fks.filter((f) => f.cols.length > 1)) extra.push(`foreign key (${f.cols.join(", ")}) -> [[T-${f.table}]] (${f.refCols.join(", ")})`);
    if (extra.length) L.push("", ...extra.map((e) => `- ${e}`));
    const refBy = tables.filter((o) => o.fks.some((f) => key(f.table) === key(t.name))).map((o) => `[[T-${o.name}]]`);
    if (refBy.length) L.push("", `Referenced by: ${refBy.join(", ")}`);
    L.push("");
  }
  return L.join("\n");
}

export async function schemaStatus(root, opts = {}) {
  return statusOf(root, await buildSchema(root, opts));
}
export function schemaStatusSync(root) {
  return statusOf(root, buildSchemaFromFiles(root));
}
function statusOf(root, { schema, source }) {
  if (!schema.tables.size) return { state: "none", text: "" };
  const text = render(schema, source);
  const p = join(root, "SCHEMA.md");
  const current = existsSync(p) ? readFileSync(p, "utf8").replace(/\r/g, "") : null;
  return { state: current === null ? "missing" : current === text ? "current" : "stale", text, tables: schema.tables.size };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  const get = (f) => (a.includes(f) ? a[a.indexOf(f) + 1] : undefined);
  const root = resolve(get("--project") ?? ".");
  const st = await schemaStatus(root, { sqlite: get("--sqlite"), sql: get("--sql") });
  if (st.state === "none") console.log("No database schema found (no SQL migrations, Prisma schema or Rails schema).");
  else if (a.includes("--write")) {
    writeFileSync(join(root, "SCHEMA.md"), st.text);
    console.log(`SCHEMA.md written (${st.tables} tables).`);
  } else if (a.includes("--print")) console.log(st.text);
  else {
    console.log(st.state === "current" ? `SCHEMA.md is current (${st.tables} tables).` : `SCHEMA.md is ${st.state}: run schema-map.mjs --write.`);
    process.exitCode = st.state === "current" ? 0 : 1;
  }
}
