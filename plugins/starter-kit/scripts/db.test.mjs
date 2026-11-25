// Databases: the database guard, the migration safety check, and the scale rehearsal (real SQLite, 100k+ rows).
// Run: node --test plugins/starter-kit/scripts/db.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assessDbCommand, hostOf } from "./db-lib.mjs";
import { checkMigration, checkProject } from "./migration-check.mjs";
import { openCopy, seed, explain, timeMigration, pgSeqScans } from "./db-rehearse.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HERE, "..", "hooks", "db-guard.mjs");

function dir(files = {}) {
  const d = mkdtempSync(join(tmpdir(), "db-"));
  for (const [p, s] of Object.entries(files)) {
    mkdirSync(dirname(join(d, p)), { recursive: true });
    writeFileSync(join(d, p), s);
  }
  return { d, done: () => rmSync(d, { recursive: true, force: true }) };
}

// ---- guard ----
const DENY = [
  `psql "postgres://app:s3cretpw@db.prod.example.com:5432/app" -c "select 1"`,
  `psql -h prod-db.internal -U app app`,
  `PGHOST=10.0.0.5 psql -U app`,
  `pg_dump postgresql://u:p@aws-0-us-east-1.pooler.supabase.com:6543/postgres > dump.sql`,
  `mongosh "mongodb+srv://admin:pw@cluster0.abcd.mongodb.net/shop"`,
  `redis-cli -h cache.example.com FLUSHALL`,
  `mysql --host=shop.cluster-xyz.rds.amazonaws.com -u admin -p`,
  `heroku pg:psql -a myapp`,
  `heroku run rails db:migrate -a myapp`,
  `fly postgres connect -a myapp-db`,
  `RAILS_ENV=production bin/rails db:migrate`,
  `NODE_ENV=production npx knex migrate:latest`,
  `DATABASE_URL=postgres://u:p@db.example.com/app npx prisma migrate deploy`,
  `npx supabase db push`,
  `python manage.py migrate --settings=app.settings && DJANGO_SETTINGS_MODULE=app.settings.prod python manage.py migrate`,
  `cd api && psql postgres://u@10.1.2.3/app -c "DELETE FROM users;"`,
];
const ALLOW = [
  `psql postgres://postgres:postgres@localhost:5432/dev -c "select count(*) from users"`,
  `psql -h 127.0.0.1 -U postgres dev`,
  `npx prisma migrate dev --name add_orders`,
  `bin/rails db:migrate`,
  `python manage.py migrate`,
  `docker compose up -d db`,
  `git commit -m "fix psql migration that did DROP TABLE users"`,
  `grep -rn "DELETE FROM users;" src/`,
  `cat migrations/001_init.sql`,
  `npm test`,
  `node scripts/migration-check.mjs --project .`,
  `echo "postgres://u:p@db.prod.example.com/app"`,
  `sqlite3 dev.db "select * from users limit 5"`,
  `npx supabase start`,
];
const ASK = [
  `psql -h localhost -U postgres dev -c "DROP TABLE users"`,
  `echo "DELETE FROM users;" | psql -h localhost dev`,
  `sqlite3 dev.db "DELETE FROM users;"`,
  `psql postgres://localhost/dev -c "UPDATE users SET plan = 'free';"`,
  `npx prisma migrate reset --force`,
  `redis-cli FLUSHALL`,
  `npx supabase db reset --local`,
];

test("the database guard denies anything that reaches a database that is not on this computer", () => {
  for (const c of DENY) assert.equal(assessDbCommand(c).decision, "deny", c);
});
test("the database guard leaves normal development alone (no false alarms)", () => {
  for (const c of ALLOW) assert.equal(assessDbCommand(c).decision, "allow", c);
});
test("the database guard asks before destroying data on a local database", () => {
  for (const c of ASK) assert.equal(assessDbCommand(c).decision, "ask", c);
});
test("a migration tool with no explicit target is judged by the project's .env, and a Compose service counts as local", () => {
  const remote = dir({ ".env": "DATABASE_URL=postgresql://app:pw@db.prod.example.com:5432/app\n" });
  const local = dir({ ".env": "DATABASE_URL=postgresql://app:pw@db:5432/app\n", "docker-compose.yml": "services:\n  db:\n    image: postgres\n  web:\n    build: .\n" });
  const unknown = dir({ ".env": "DATABASE_URL=postgresql://app:pw@db:5432/app\n" });
  try {
    const r = assessDbCommand("npx prisma migrate dev", remote.d);
    assert.equal(r.decision, "deny");
    assert.match(r.why, /db\.prod\.example\.com \(from the project's \.env\)/);
    assert.ok(!r.why.includes("pw"), "the password must never be repeated");
    assert.equal(assessDbCommand("npx prisma migrate dev", local.d).decision, "allow");
    assert.equal(assessDbCommand("npx prisma migrate dev", unknown.d).decision, "deny", "a bare name that is not a Compose service could be any server");
  } finally {
    remote.done();
    local.done();
    unknown.done();
  }
});
test("host names are read correctly from connection strings", () => {
  assert.deepEqual(hostOf("u:p@db.example.com:5432/app?ssl=true"), ["db.example.com"]);
  assert.deepEqual(hostOf("h1:27017,h2:27017/db"), ["h1", "h2"]);
  assert.deepEqual(hostOf("[::1]:5432/x"), ["::1"]);
});
test("the hook denies with a message that never repeats credentials, and its off switch needs approval", () => {
  const p = dir({ ".claude/kit.json": JSON.stringify({ dbGuard: false }) });
  try {
    const run = (command) => spawnSync(process.execPath, [GUARD], { input: JSON.stringify({ tool_input: { command }, cwd: p.d }), env: { ...process.env, CLAUDE_PROJECT_DIR: p.d, KIT_DATA_DIR: join(p.d, "kitdata") }, encoding: "utf8" });
    const r = run(DENY[0]);
    const out = JSON.parse(r.stdout).hookSpecificOutput;
    assert.equal(out.permissionDecision, "deny", "an unapproved off switch must not count");
    assert.ok(!out.permissionDecisionReason.includes("s3cretpw"));
    assert.match(out.permissionDecisionReason, /give the owner the exact command/);
    assert.equal(run("npm test").stdout, "");
    assert.equal(spawnSync(process.execPath, [GUARD], { input: "garbage", encoding: "utf8" }).status, 0);
  } finally {
    p.done();
  }
});

// ---- migration check ----
const ids = (f, t) => checkMigration(f, t).map((x) => `${x.level}:${x.id}`);
test("each dangerous migration pattern is caught, in SQL and in the common frameworks", () => {
  assert.ok(ids("db/migrations/1.sql", "DROP TABLE users;").includes("HIGH:drop-table"));
  assert.ok(ids("db/migrations/1.sql", "ALTER TABLE users DROP COLUMN age;").includes("HIGH:drop-column"));
  assert.ok(ids("db/migrations/1.sql", "ALTER TABLE users RENAME COLUMN name TO full_name;").includes("HIGH:rename"));
  assert.ok(ids("db/migrations/1.sql", "ALTER TABLE users ADD COLUMN plan text NOT NULL;").includes("HIGH:not-null-no-default"));
  assert.ok(ids("db/migrations/1.sql", "UPDATE users SET plan = 'free';").includes("HIGH:unbounded-write"));
  assert.ok(ids("db/migrations/1.sql", "ALTER TABLE users ALTER COLUMN age TYPE bigint;").includes("MEDIUM:type-change"));
  assert.ok(ids("db/migrations/1.sql", "ALTER TABLE users ALTER COLUMN email SET NOT NULL;").includes("MEDIUM:set-not-null"));
  assert.ok(ids("db/migrations/1.sql", "CREATE INDEX idx_orders_user ON orders(user_id);").includes("MEDIUM:index-locks"));
  assert.ok(ids("db/migrations/1.sql", "ALTER TABLE orders ADD CONSTRAINT fk FOREIGN KEY (user_id) REFERENCES users(id);").includes("MEDIUM:foreign-key-locks"));
  assert.ok(ids("db/migrations/1.sql", "ALTER TABLE users ADD COLUMN plan text;\nUPDATE users SET plan = 'free' WHERE plan IS NULL;").includes("MEDIUM:backfill-in-schema"));
  const rails = "class X < ActiveRecord::Migration[7.1]\n  def up\n    remove_column :users, :age\n    add_column :users, :plan, :string, null: false\n    add_index :orders, :user_id\n  end\nend\n";
  for (const id of ["HIGH:drop-column", "HIGH:not-null-no-default", "MEDIUM:index-locks", "LOW:no-rollback"]) assert.ok(ids("db/migrate/2024_x.rb", rails).includes(id), id);
  const alembic = "def upgrade():\n    op.drop_column('users', 'age')\n    op.add_column('users', sa.Column('plan', sa.String(), nullable=False))\n\ndef downgrade():\n    pass\n";
  for (const id of ["HIGH:drop-column", "HIGH:not-null-no-default", "LOW:no-rollback"]) assert.ok(ids("alembic/versions/a1.py", alembic).includes(id), id);
  const knex = "exports.up = (knex) => knex.schema.alterTable('users', (t) => { t.dropColumn('age'); t.renameColumn('name', 'full_name'); });\n";
  for (const id of ["HIGH:drop-column", "HIGH:rename", "LOW:no-rollback"]) assert.ok(ids("migrations/2024_x.js", knex).includes(id), id);
  const django = "operations = [\n    migrations.RemoveField(model_name='user', name='age'),\n    migrations.RenameField(model_name='user', old_name='a', new_name='b'),\n]\n";
  for (const id of ["HIGH:drop-column", "HIGH:rename"]) assert.ok(ids("app/migrations/0002_x.py", django).includes(id), id);
});
test("the safe versions of the same changes pass", () => {
  const safe = [
    "ALTER TABLE users ADD COLUMN plan text;",
    "ALTER TABLE users ADD COLUMN plan text NOT NULL DEFAULT 'free';",
    "CREATE INDEX CONCURRENTLY idx_orders_user ON orders(user_id);",
    "ALTER TABLE orders ADD CONSTRAINT fk FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;",
    "CREATE TABLE plans (id bigint PRIMARY KEY, name text NOT NULL);",
    "-- DROP TABLE users; (old note)\nSELECT 1;",
  ];
  for (const s of safe) assert.deepEqual(ids("db/migrations/1.sql", s), [], s);
  assert.deepEqual(ids("db/migrate/x.rb", "class X < ActiveRecord::Migration[7.1]\n  def change\n    add_column :users, :plan, :string\n    add_index :orders, :user_id, algorithm: :concurrently\n  end\nend\n"), []);
  assert.deepEqual(ids("migrations/x.js", "exports.up = (k) => k.schema.alterTable('t', (t) => { t.string('a'); for (let i = 3; i--;) {} });\nexports.down = (k) => k.schema.alterTable('t', (t) => { t.string('b'); });\n"), []);
});
test("an owner-accepted risk is reported as accepted, not blocking", () => {
  const r = checkMigration("db/migrations/1.sql", "-- kit: accepted-risk — owner said \"table is empty\"\nDROP TABLE legacy_events;\n");
  assert.deepEqual(r.map((x) => x.level), ["ACCEPTED"]);
});
test("the project check finds migration folders, ignores other code, and wants a down file for every up file", () => {
  const p = dir({
    "db/migrations/001_init.up.sql": "CREATE TABLE a (id int);",
    "db/migrations/002_more.up.sql": "ALTER TABLE a DROP COLUMN id;",
    "db/migrations/002_more.down.sql": "ALTER TABLE a ADD COLUMN id int;",
    "src/cleanup.sql": "DROP TABLE a;",
    "node_modules/x/migrations/1.sql": "DROP TABLE x;",
  });
  try {
    const { files, findings } = checkProject(p.d, { all: true });
    assert.deepEqual(files.sort(), ["db/migrations/001_init.up.sql", "db/migrations/002_more.down.sql", "db/migrations/002_more.up.sql"]);
    assert.ok(findings.some((f) => f.file === "db/migrations/001_init.up.sql" && f.id === "no-rollback"));
    assert.ok(findings.some((f) => f.file === "db/migrations/002_more.up.sql" && f.id === "drop-column"));
    assert.ok(!findings.some((f) => f.file.startsWith("src/")));
  } finally {
    p.done();
  }
});

// ---- rehearsal ----
const SCHEMA = "CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, created_at TEXT, is_admin INTEGER);\nCREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), total REAL, status TEXT);\n";
test("a rehearsal seeds realistic volumes into a copy, finds the missing index, and proves the fix", { timeout: 180000 }, async () => {
  const p = dir({ "schema.sql": SCHEMA, "add_index.sql": "CREATE INDEX idx_orders_user ON orders(user_id);" });
  const c = await openCopy({ schema: join(p.d, "schema.sql") });
  try {
    seed(c.conn, "users", 100000);
    const r = seed(c.conn, "orders", 200000);
    assert.equal(c.conn.prepare("SELECT COUNT(*) AS n FROM orders").get().n, 200000);
    assert.equal(c.conn.prepare("SELECT COUNT(*) AS n FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE u.id IS NULL").get().n, 0, "every order points to a real user");
    assert.ok(r.ms < 120000);
    const q = "SELECT * FROM orders WHERE user_id = 42";
    const before = explain(c.conn, q);
    assert.ok(before.problems.some((x) => /reads every row of orders \(200000 rows\)/.test(x)), before.plan.join("|"));
    const m = timeMigration(c.conn, join(p.d, "add_index.sql"));
    assert.ok(m.ms >= 0);
    const after = explain(c.conn, q);
    assert.deepEqual(after.problems, [], after.plan.join("|"));
    assert.ok(explain(c.conn, "SELECT * FROM users ORDER BY created_at LIMIT 10").problems.some((x) => /sorts the results without an index/.test(x)));
  } finally {
    c.close();
    p.done();
  }
});
test("a rehearsal never writes to the original database file, and refuses server addresses", async () => {
  const p = dir({ "schema.sql": SCHEMA });
  const DatabaseSync = (await import("node:sqlite")).DatabaseSync;
  const orig = join(p.d, "app.db");
  const db = new DatabaseSync(orig);
  db.exec(SCHEMA);
  db.close();
  const hash = () => createHash("sha1").update(readFileSync(orig)).digest("hex");
  const before = hash();
  const c = await openCopy({ db: orig });
  try {
    seed(c.conn, "users", 1000);
    c.conn.exec("DROP TABLE orders");
  } finally {
    c.close();
  }
  assert.equal(hash(), before);
  await assert.rejects(openCopy({ db: "postgres://u:p@db.example.com/app" }), /never a server address/);
  await assert.rejects(openCopy({ db: join(p.d, "missing.db") }), /no such database file/);
  const empty = await openCopy({ schema: join(p.d, "schema.sql") });
  try {
    assert.throws(() => seed(empty.conn, "orders", 10), /seed users before orders/);
  } finally {
    empty.close();
    p.done();
  }
});
test("Postgres plans: sequential scans over big tables and on-disk sorts are flagged, small ones are not", () => {
  const plan = [{ Plan: { "Node Type": "Nested Loop", Plans: [
    { "Node Type": "Seq Scan", "Relation Name": "orders", "Plan Rows": 2400000, Filter: "(user_id = 42)" },
    { "Node Type": "Seq Scan", "Relation Name": "plans", "Plan Rows": 4 },
    { "Node Type": "Sort", "Sort Method": "external merge", "Sort Key": ["created_at"], Plans: [{ "Node Type": "Index Scan", "Relation Name": "users" }] },
  ] } }];
  const p = pgSeqScans(plan);
  assert.equal(p.length, 2);
  assert.match(p[0], /orders \(about 2400000 rows\) to filter on \(user_id = 42\)/);
  assert.match(p[1], /sorts on disk \(created_at\)/);
  assert.deepEqual(pgSeqScans({ Plan: { "Node Type": "Index Scan", "Relation Name": "orders" } }), []);
});
