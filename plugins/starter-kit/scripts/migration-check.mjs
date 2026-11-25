// Migration safety check. A database change that is instant on a test database can lock a big live table for minutes, break the
// running version of the app, or destroy data with no way back. This reads migration files (plain SQL, and the common frameworks:
// Rails, Django/Alembic, Knex, Prisma, Laravel, Sequelize, TypeORM, Ecto, Go and Rust tools that use SQL) and flags the known
// dangers, each with the safe way to do it.
// Run: node migration-check.mjs --project <dir> [--base <commit> | --all | --files a b]
// By default it checks migrations changed since the main branch (or all, when there is no git history).
// Exit 1 when there is a HIGH finding. A line with the comment `kit: accepted-risk` is reported as accepted, not blocking:
// only the owner may decide that, and the pre-ship scan tells them.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MIGRATION_PATH = /(^|\/)(migrations?|migrate|alembic\/versions|db\/migrate|database\/migrations|prisma\/migrations|supabase\/migrations|priv\/repo\/migrations|sql\/migrations|schema\/migrations)\//i;
const EXT = /\.(sql|py|rb|js|ts|mjs|cjs|php|exs|go|rs)$/i;

// [id, level, pattern, problem, safe way]
export const RULES = [
  ["drop-table", "HIGH", /\bDROP\s+TABLE\b|\bdrop_table\b|\.dropTable(IfExists)?\s*\(|Schema::drop(IfExists)?\s*\(|\bDeleteModel\s*\(|\bdropTable\s*\(/i,
    "drops a table and all its data", "first stop the code using it and ship that; take a backup; drop it in a later release"],
  ["drop-column", "HIGH", /\bDROP\s+COLUMN\b|\bremove_column\b|\bdrop_column\b|\.dropColumns?\s*\(|->dropColumn\s*\(|\bRemoveField\s*\(|\bremoveColumn\s*\(/i,
    "deletes a column and its data; the running app may still read it", "stop reading and writing the column in one release, then drop it in the next"],
  ["rename", "HIGH", /\bRENAME\s+(COLUMN|TO)\b|\brename_(column|table)\b|\.renameColumn\s*\(|->renameColumn\s*\(|\bRenameField\s*\(|\bRenameModel\s*\(|new_column_name\s*=|\brenameTable\s*\(/i,
    "renames a column or table, which breaks the version of the app that is running during the deploy", "add the new name, write to both, move reads, then remove the old one (expand, migrate, contract)"],
  ["not-null-no-default", "HIGH", null,
    "adds a required column with no default, which fails or rewrites the table when rows already exist", "add it as optional (or with a default), backfill in batches, then make it required"],
  ["unbounded-write", "HIGH", /\bDELETE\s+FROM\s+[\w."`\[\]]+\s*(;|$)|\bUPDATE\s+[\w."`\[\]]+\s+SET\b(?![^;]*\bWHERE\b)[^;]*;|\bTRUNCATE\b/im,
    "changes or deletes every row inside a migration, in one long transaction", "move data changes to a separate batched, resumable backfill (see /starter-kit:db)"],
  ["type-change", "MEDIUM", /\bALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b|\bMODIFY\s+(COLUMN\s+)?\S+\s+\w+|\bchange_column\b|\balter_column\s*\([^)]*type_\s*=|\bAlterField\s*\(|->change\s*\(\s*\)/i,
    "changes a column's type, which can rewrite the whole table and lock it", "add a new column of the new type, backfill, switch reads, drop the old one"],
  ["set-not-null", "MEDIUM", /\bALTER\s+COLUMN\s+\S+\s+SET\s+NOT\s+NULL\b|\bchange_column_null\b[^\n]*false/i,
    "makes an existing column required, which scans the whole table under a lock", "Postgres: add a CHECK (col IS NOT NULL) NOT VALID constraint, VALIDATE it, then set NOT NULL"],
  ["index-locks", "MEDIUM", /\bCREATE\s+(UNIQUE\s+)?INDEX\b(?!\s+CONCURRENTLY)|\badd_index\b(?![^\n]*algorithm:\s*:concurrently)|\.index\s*\(\s*\[|\bcreate_index\s*\((?![^)]*postgresql_concurrently)|->index\s*\(/i,
    "builds an index while blocking writes to the table", "Postgres: CREATE INDEX CONCURRENTLY (outside a transaction); MySQL: ALGORITHM=INPLACE, LOCK=NONE; or build it at a quiet time"],
  ["foreign-key-locks", "MEDIUM", /\bFOREIGN\s+KEY\b(?![^;]*\bNOT\s+VALID\b)[^;]*\bREFERENCES\b|\badd_foreign_key\b(?![^\n]*validate:\s*false)/i,
    "adds a foreign key that checks every existing row while locking both tables", "Postgres: add it NOT VALID, then VALIDATE CONSTRAINT separately"],
  ["backfill-in-schema", "MEDIUM", null,
    "mixes a schema change with a data change in one migration", "keep schema migrations fast; run data changes as a separate batched backfill"],
  ["no-rollback", "LOW", null,
    "has no way back (no down / downgrade step)", "write the reverse step, or say in a comment why it cannot be reversed and how to restore instead"],
];

const ACCEPT = /kit:\s*accepted-risk/i;

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

export function checkMigration(file, text) {
  const findings = [];
  const lines = text.split("\n");
  const add = (id, line) => {
    const [, level, , problem, fix] = RULES.find((r) => r[0] === id);
    const accepted = ACCEPT.test(lines[line - 1] ?? "") || ACCEPT.test(lines[line - 2] ?? "");
    findings.push({ file, line, id, level: accepted ? "ACCEPTED" : level, problem, fix });
  };
  // strip comments for matching (keep positions by replacing with spaces)
  const blank = (m) => (ACCEPT.test(m) ? m : m.replace(/[^\n]/g, " "));
  let code = text.replace(/\/\*[\s\S]*?\*\//g, blank);
  code = /\.sql$/i.test(file) ? code.replace(/--[^\n]*/g, blank) : code.replace(/^\s*(#|\/\/)[^\n]*/gm, blank);
  for (const [id, , re] of RULES) {
    if (!re) continue;
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    const seen = new Set();
    for (const m of code.matchAll(g)) {
      const ln = lineOf(code, m.index);
      if (!seen.has(ln)) add(id, ln);
      seen.add(ln);
    }
  }
  // required column with no default: SQL, Rails, Alembic, Knex/Laravel
  const nn = /\bADD\s+(COLUMN\s+)?[^;,]*?\bNOT\s+NULL\b[^;,]*/gi;
  for (const m of code.matchAll(nn)) if (!/\bDEFAULT\b/i.test(m[0]) && !/\bCREATE\s+TABLE\b/i.test(code.slice(Math.max(0, m.index - 200), m.index))) add("not-null-no-default", lineOf(code, m.index));
  for (const m of code.matchAll(/\badd_column\b[^\n]*null:\s*false[^\n]*/g)) if (!/default:/.test(m[0])) add("not-null-no-default", lineOf(code, m.index));
  for (const m of code.matchAll(/\bop\.add_column\s*\([^\n]*nullable\s*=\s*False[^\n]*/g)) if (!/server_default/.test(m[0])) add("not-null-no-default", lineOf(code, m.index));
  for (const m of code.matchAll(/(\$table|table)\s*(->|\.)\s*\w+\s*\([^)]*\)(?![^;\n]*(nullable|default))[^;\n]*\.notNullable\s*\(\s*\)/g)) add("not-null-no-default", lineOf(code, m.index));
  // schema change and data change together
  const schema = /\b(ALTER|CREATE)\s+TABLE\b|\badd_column\b|\bop\.(add|alter)_column\b|\.alterTable\s*\(|Schema::table\s*\(/i;
  const data = /\bUPDATE\s+[\w."`\[\]]+\s+SET\b|\bINSERT\s+INTO\b|\.update_all\b|\bRunPython\s*\(|\bop\.execute\s*\(\s*["']\s*(UPDATE|INSERT)/i;
  if (schema.test(code) && data.test(code)) add("backfill-in-schema", lineOf(code, code.search(data)));
  // no way back
  const hasUpOnly =
    (/\bdef\s+up\b/.test(code) && !/\bdef\s+down\b/.test(code) && !/\bdef\s+change\b/.test(code)) ||
    (/\bdef\s+upgrade\s*\(/.test(code) && (!/\bdef\s+downgrade\s*\(/.test(code) || /\bdef\s+downgrade\s*\([^)]*\)\s*(->\s*None\s*)?:\s*\n\s*pass\b/.test(code))) ||
    (/\bexports\.up\b|\bexport\s+(async\s+)?function\s+up\b/.test(code) && !/\bexports\.down\b|\bexport\s+(async\s+)?function\s+down\b/.test(code)) ||
    (/\bpublic\s+function\s+up\s*\(/.test(code) && !/\bpublic\s+function\s+down\s*\(/.test(code)) ||
    (/\basync\s+up\s*\(/.test(code) && !/\basync\s+down\s*\(/.test(code));
  if (hasUpOnly) add("no-rollback", 1);
  return findings.sort((a, b) => a.line - b.line);
}

export function migrationFiles(root, { base, all, files } = {}) {
  if (files?.length) return files.map((f) => f.split("\\").join("/"));
  const git = (...a) => spawnSync("git", ["-C", root, ...a], { encoding: "utf8" });
  let list = null;
  if (!all && git("rev-parse", "--git-dir").status === 0) {
    const b = base ?? (git("rev-parse", "--verify", "-q", "main").status === 0 ? "main" : git("rev-parse", "--verify", "-q", "master").status === 0 ? "master" : null);
    if (b) {
      const changed = new Set([...(git("diff", "--name-only", `${b}...HEAD`).stdout ?? "").split("\n"), ...(git("diff", "--name-only", "HEAD").stdout ?? "").split("\n"), ...(git("ls-files", "--others", "--exclude-standard").stdout ?? "").split("\n")].filter(Boolean));
      list = [...changed];
    }
  }
  if (!list) {
    list = [];
    const walk = (d) => {
      for (const e of readdirSync(join(root, d), { withFileTypes: true })) {
        if (e.isDirectory()) {
          if (!["node_modules", ".git", "vendor", "dist", "build", ".venv", "venv"].includes(e.name)) walk(d ? `${d}/${e.name}` : e.name);
        } else list.push(d ? `${d}/${e.name}` : e.name);
      }
    };
    walk("");
  }
  return list.filter((f) => MIGRATION_PATH.test(f) && EXT.test(f) && existsSync(join(root, f)));
}

export function checkProject(root, opts = {}) {
  const out = [];
  const files = migrationFiles(root, opts);
  for (const f of files) out.push(...checkMigration(f, readFileSync(join(root, f), "utf8")));
  // plain SQL "up" files need a matching "down"
  for (const f of files) if (/\.up\.sql$/i.test(f) && !existsSync(join(root, f.replace(/\.up\.sql$/i, ".down.sql")))) out.push({ file: f, line: 1, id: "no-rollback", level: "LOW", ...Object.fromEntries([["problem", RULES.find((r) => r[0] === "no-rollback")[3]], ["fix", RULES.find((r) => r[0] === "no-rollback")[4]]]) });
  return { files, findings: out };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  const get = (f) => (a.includes(f) ? a[a.indexOf(f) + 1] : undefined);
  const root = resolve(get("--project") ?? ".");
  const files = a.includes("--files") ? a.slice(a.indexOf("--files") + 1).filter((x) => !x.startsWith("--")) : null;
  const { files: checked, findings } = checkProject(root, { base: get("--base"), all: a.includes("--all"), files });
  if (!checked.length) console.log("No migration files to check.");
  else if (!findings.length) console.log(`Checked ${checked.length} migration file(s): nothing risky found.`);
  else console.log(findings.map((f) => `${f.level.padEnd(8)} ${f.file}:${f.line}  ${f.problem}.\n         Safer: ${f.fix}.`).join("\n"));
  process.exitCode = findings.some((f) => f.level === "HIGH") ? 1 : 0;
}
