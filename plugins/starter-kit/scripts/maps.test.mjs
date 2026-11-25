// Memory maps: the schema map, linked notes (IDs, backlinks, decision status, Obsidian export) and the architecture map.
// Run: node --test plugins/starter-kit/scripts/maps.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { parseSql, parsePrisma, parseRailsSchema, readSqlite, render, schemaStatus, schemaStatusSync, buildSchemaFromFiles, splitTop, stripSql } from "./schema-map.mjs";
import { buildGraph, backlinks, nextId, exportVault } from "./notes-graph.mjs";
import { archStatus, buildArch } from "./arch-map.mjs";
import { buildIndex } from "./code-index.mjs";
import { checkDrift } from "./drift-check.mjs";
import { buildPack, lastDecisions } from "./context-pack.mjs";

function proj(files = {}, { git = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "maps-"));
  const store = mkdtempSync(join(tmpdir(), "mapsidx-"));
  process.env.STARTER_KIT_INDEX_DIR = store;
  const put = (p, s) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), s); };
  for (const [p, s] of Object.entries(files)) put(p, s);
  if (git) spawnSync("git", ["-C", dir, "init", "-q"]);
  return { dir, put, done: () => { rmSync(dir, { recursive: true, force: true }); rmSync(store, { recursive: true, force: true }); } };
}

// ---------------- schema map ----------------
const M1 = `-- first
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE orders (
  id bigint PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id),
  total numeric(10,2) DEFAULT 0,
  note text -- a trailing comment, with a comma
);
CREATE TABLE order_items (
  order_id bigint NOT NULL,
  sku text NOT NULL,
  qty int NOT NULL DEFAULT 1,
  PRIMARY KEY (order_id, sku),
  CONSTRAINT fk_o FOREIGN KEY (order_id) REFERENCES orders (id)
);
CREATE INDEX idx_orders_user ON orders (user_id);
`;
const M2 = `ALTER TABLE users ADD COLUMN plan text NOT NULL DEFAULT 'free', ADD COLUMN age int;
ALTER TABLE users RENAME COLUMN name TO full_name;
ALTER TABLE orders DROP COLUMN note;
ALTER TABLE orders ALTER COLUMN total TYPE numeric(12,2);
ALTER TABLE users ALTER COLUMN age SET NOT NULL;
CREATE UNIQUE INDEX CONCURRENTLY idx_users_plan_email ON users USING btree (plan, email);
CREATE TABLE temp_stuff (id int);
DROP TABLE temp_stuff;
ALTER TABLE orders RENAME TO purchases;
`;

test("schema map: migrations are replayed in order into the real current shape", () => {
  const s = parseSql(M1 + "\n" + M2);
  const users = s.get("users");
  assert.deepEqual(users.columns.map((c) => c.name), ["id", "email", "full_name", "created_at", "plan", "age"]);
  assert.equal(users.columns.find((c) => c.name === "plan").default, "'free'");
  assert.equal(users.columns.find((c) => c.name === "age").notNull, true);
  assert.equal(users.columns.find((c) => c.name === "email").unique, true);
  assert.equal(users.columns.find((c) => c.name === "id").pk, true);
  assert.equal(users.columns.find((c) => c.name === "created_at").type, "timestamp with time zone");
  const p = s.get("purchases");
  assert.ok(p && !s.get("orders"), "renamed table");
  assert.deepEqual(p.columns.map((c) => c.name), ["id", "user_id", "total"]);
  assert.equal(p.columns.find((c) => c.name === "total").type, "numeric(12,2)");
  assert.deepEqual(p.fks, [{ cols: ["user_id"], table: "users", refCols: ["id"] }]);
  assert.deepEqual(p.indexes[0].cols, ["user_id"]);
  assert.ok(users.indexes.some((i) => i.unique && i.cols.join() === "plan,email"));
  assert.ok(!s.get("temp_stuff"));
  const oi = s.get("order_items");
  assert.deepEqual(oi.pk, ["order_id", "sku"]);
  assert.equal(oi.fks[0].table, "purchases", "renaming a table updates the foreign keys that point at it");
});

test("schema map: renaming a table updates the foreign keys that point at it", () => {
  const s = parseSql("CREATE TABLE a (id int PRIMARY KEY);\nCREATE TABLE b (id int, a_id int REFERENCES a(id));\nALTER TABLE a RENAME TO alpha;\nALTER TABLE alpha RENAME COLUMN id TO key;");
  assert.equal(s.get("b").fks[0].table, "alpha");
  assert.deepEqual(s.get("b").fks[0].refCols, ["key"]);
});

test("schema map: comments, quotes and odd spacing do not confuse the parser", () => {
  const s = parseSql('/* header; with a semicolon */\nCREATE TABLE "Orders" ( "id" int, "a;b" text DEFAULT \'x;y\' );\n-- DROP TABLE "Orders";\n');
  assert.equal(s.get("Orders").columns.length, 2);
  assert.equal(s.get("Orders").columns[1].default, "'x;y'");
  assert.deepEqual(splitTop("a, (b, c), 'd,e'", ","), ["a", "(b, c)", "'d,e'"]);
  assert.equal(stripSql("a -- x\nb /* y */ c").replace(/\s+/g, " "), "a b c");
});

test("schema map: MySQL-style MODIFY and CHANGE, and drop table cleaning foreign keys", () => {
  const s = parseSql("CREATE TABLE t (id int PRIMARY KEY, name varchar(10));\nCREATE TABLE c (id int, t_id int REFERENCES t(id));\nALTER TABLE t MODIFY COLUMN name varchar(50) NOT NULL;\nALTER TABLE t CHANGE name title varchar(60);\nDROP TABLE t;");
  assert.ok(!s.get("t"));
  assert.deepEqual(s.get("c").fks, []);
  const s2 = parseSql("CREATE TABLE t (id int PRIMARY KEY, name varchar(10));\nALTER TABLE t MODIFY COLUMN name varchar(50) NOT NULL;\nALTER TABLE t CHANGE name title varchar(60);");
  assert.deepEqual(s2.get("t").columns.map((c) => [c.name, c.type]), [["id", "int"], ["title", "varchar(60)"]]);
});

test("schema map: Prisma and Rails schemas", () => {
  const prisma = `enum Role { USER ADMIN }
model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  role  Role   @default(USER)
  posts Post[]
  @@map("users")
}
model Post {
  id       Int     @id
  title    String
  body     String?
  authorId Int
  author   User    @relation(fields: [authorId], references: [id])
  @@index([authorId])
}`;
  const p = parsePrisma(prisma);
  assert.deepEqual(p.get("users").columns.map((c) => c.name), ["id", "email", "role"]);
  assert.equal(p.get("Post").columns.find((c) => c.name === "body").notNull, false);
  assert.deepEqual(p.get("Post").fks, [{ cols: ["authorId"], table: "users", refCols: ["id"] }]);
  assert.deepEqual(p.get("Post").indexes[0].cols, ["authorId"]);
  const rails = `ActiveRecord::Schema[7.1].define(version: 2024_01_01) do
  create_table "users", force: :cascade do |t|
    t.string "email", null: false
    t.index ["email"], name: "index_users_on_email", unique: true
  end
  create_table "orders", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.decimal "total", default: "0.0"
  end
  add_foreign_key "orders", "users"
end`;
  const r = parseRailsSchema(rails);
  assert.deepEqual(r.get("users").columns.map((c) => c.name), ["id", "email"]);
  assert.equal(r.get("users").indexes[0].unique, true);
  assert.deepEqual(r.get("orders").fks, [{ cols: ["user_id"], table: "users", refCols: ["id"] }]);
});

test("schema map: the page shows tables, keys, relationships and links, and is rebuilt identically", async () => {
  const p = proj({ "db/migrations/001_init.sql": M1, "db/migrations/002_more.sql": M2, "db/migrations/002_more.down.sql": "DROP TABLE users;" }, { git: true });
  try {
    const st = await schemaStatus(p.dir);
    assert.equal(st.state, "missing");
    assert.match(st.text, /^### users \{#T-users\}/m);
    assert.match(st.text, /\| user_id \| bigint \| no \| {2}\| {2}\| \[\[T-users\]\]\.id \|/);
    assert.match(st.text, /erDiagram/);
    assert.match(st.text, /users \|\|--o\{ purchases : "user_id"/);
    assert.match(st.text, /primary key \(order_id, sku\)/);
    assert.match(st.text, /Referenced by: \[\[T-purchases\]\]/);
    writeFileSync(join(p.dir, "SCHEMA.md"), st.text);
    assert.equal(schemaStatusSync(p.dir).state, "current");
    writeFileSync(join(p.dir, "db/migrations/003_x.sql"), "ALTER TABLE users ADD COLUMN extra text;");
    assert.equal(schemaStatusSync(p.dir).state, "stale");
    assert.ok(checkDrift(p.dir).some((x) => /SCHEMA\.md no longer matches/.test(x)));
  } finally {
    p.done();
  }
});

test("schema map: a local SQLite file is read read-only", async () => {
  const p = proj({});
  const { DatabaseSync } = await import("node:sqlite");
  const file = join(p.dir, "app.db");
  const db = new DatabaseSync(file);
  db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE); CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), title TEXT); CREATE INDEX idx_posts_user ON posts(user_id);");
  db.close();
  try {
    const s = await readSqlite(file);
    assert.deepEqual(s.get("posts").fks, [{ cols: ["user_id"], table: "users", refCols: ["id"] }]);
    assert.deepEqual(s.get("posts").indexes.map((i) => i.name), ["idx_posts_user"]);
    assert.ok(s.get("users").uniques.some((u) => u.join() === "email"));
    assert.match(render(s, "x"), /### posts/);
  } finally {
    p.done();
  }
});

test("schema map: a project with no database says so instead of writing an empty page", () => {
  const p = proj({ "src/a.js": "x" });
  try {
    assert.equal(schemaStatusSync(p.dir).state, "none");
    assert.equal(buildSchemaFromFiles(p.dir).schema.tables.size, 0);
  } finally {
    p.done();
  }
});

// ---------------- linked notes ----------------
const DEC = `# Decisions
- 2026-01-01 — use SQLite {#D-001}, because simple; rejected: Postgres; status: superseded by [[D-003]]
- 2026-01-05 — keep sessions in cookies {#D-002}, because no extra service
- 2026-02-01 — move to Postgres {#D-003}, because we need concurrent writes; builds on [[D-001]]
`;
test("notes: ids, links and backlinks are read; fenced code is ignored", () => {
  const p = proj({
    "DECISIONS.md": DEC,
    "ROADMAP.md": "## Milestone 1\n- [ ] Sign in {#F-001} (follows [[D-002]])\n  - [ ] wrong password is refused\n- [ ] Saved recipes {#F-002}\n  - [ ] stored per [[T-users]]\n",
    "SCHEMA.md": "### users {#T-users}\n```\n[[X-fake]] {#X-fake}\n```\n",
  });
  try {
    const g = buildGraph(p.dir);
    assert.deepEqual([...g.defs.keys()].sort(), ["D-001", "D-002", "D-003", "F-001", "F-002", "T-users"]);
    assert.equal(g.defs.get("D-001").status, "superseded");
    assert.equal(g.defs.get("D-001").supersededBy, "D-003");
    assert.deepEqual(backlinks(g, "D-002").map((l) => l.from), ["F-001"]);
    assert.deepEqual(backlinks(g, "T-users").map((l) => l.from), ["F-002"], "a criterion line belongs to the feature above it");
    assert.equal(nextId(g, "D"), "D-004");
    assert.equal(nextId(g, "F"), "F-003");
    assert.equal(nextId(g, "A"), "A-001");
    assert.deepEqual(g.problems, []);
  } finally {
    p.done();
  }
});

test("notes: broken links, duplicates and broken supersede chains are reported", () => {
  const p = proj({
    "DECISIONS.md": "- a {#D-001}, status: superseded by [[D-009]]\n- b {#D-002}\n- c {#D-002}\n",
    "PROJECT.md": "See [[D-404]].\n",
  });
  try {
    const m = buildGraph(p.dir).problems.map((x) => x.msg).join("\n");
    assert.match(m, /D-002 is defined twice/);
    assert.match(m, /\[\[D-404\]\], which is not defined/);
    assert.match(m, /D-001 says superseded by \[\[D-009\]\], which does not exist/);
  } finally {
    p.done();
  }
});

test("notes: work that still relies on a superseded or reversed decision is flagged; history is not", () => {
  const p = proj({
    "DECISIONS.md": DEC + "- 2026-03-01 — drop dark mode {#D-004}, because cost; status: reversed\n- 2026-03-02 — also drop themes {#D-005}, because [[D-004]]\n",
    "ROADMAP.md": "- [ ] Storage {#F-001} uses the database from [[D-001]]\n- [ ] Theme {#F-002} follows [[D-004]]\n- [ ] Live {#F-003} follows [[D-003]]\n",
    "CHANGELOG.md": "We used [[D-001]] back then.\n",
  });
  try {
    const m = buildGraph(p.dir).problems.map((x) => x.msg);
    assert.equal(m.length, 3, m.join("\n"));
    assert.ok(m.some((x) => /ROADMAP\.md:1 relies on \[\[D-001\]\], which is superseded by \[\[D-003\]\]/.test(x)));
    assert.ok(m.some((x) => /ROADMAP\.md:2 relies on \[\[D-004\]\], which is reversed/.test(x)));
    assert.ok(m.some((x) => /DECISIONS\.md:6 relies on \[\[D-004\]\]/.test(x)), "a live decision that builds on a reversed one is flagged");
    assert.ok(!m.some((x) => /relies on \[\[D-003\]\]/.test(x)), "relying on a live decision is fine");
    assert.ok(!m.some((x) => /DECISIONS\.md:4/.test(x)), "the replacement may point back at what it replaces");
    assert.ok(!m.some((x) => /CHANGELOG/.test(x)));
    assert.ok(!m.some((x) => /DECISIONS\.md:4/.test(x)), "a superseded decision may mention older context");
  } finally {
    p.done();
  }
});

test("notes: a superseded decision whose replacement was itself reversed is flagged", () => {
  const p = proj({ "DECISIONS.md": "- a {#D-001}, status: superseded by [[D-002]]\n- b {#D-002}, status: reversed\n" });
  try {
    assert.match(buildGraph(p.dir).problems.map((x) => x.msg).join("\n"), /D-001 is superseded by D-002, which is itself reversed/);
  } finally {
    p.done();
  }
});

test("notes: the Obsidian export gives every id a note with its links and backlinks", () => {
  const p = proj({ "DECISIONS.md": DEC, "ROADMAP.md": "- [ ] Sign in {#F-001} (follows [[D-002]])\n" });
  const out = join(p.dir, "vault");
  try {
    const r = exportVault(p.dir, out);
    assert.equal(r.notes, 4);
    assert.deepEqual(readdirSync(out).sort(), ["D-001.md", "D-002.md", "D-003.md", "F-001.md"]);
    const d2 = readFileSync(join(out, "D-002.md"), "utf8");
    assert.match(d2, /Status: active/);
    assert.match(d2, /## Linked from\n- \[\[F-001\]\]/);
    assert.match(readFileSync(join(out, "F-001.md"), "utf8"), /## Links to\n- \[\[D-002\]\]/);
    assert.match(readFileSync(join(out, "D-001.md"), "utf8"), /Status: superseded by \[\[D-003\]\]/);
  } finally {
    p.done();
  }
});

test("notes: the session drift check and the context pack honour decision status", () => {
  const p = proj({ "DECISIONS.md": DEC, "ROADMAP.md": "- [ ] Storage {#F-001} uses [[D-001]]\n" });
  try {
    assert.ok(checkDrift(p.dir).some((x) => /relies on \[\[D-001\]\]/.test(x)));
    const shown = lastDecisions(p.dir, 5).join("\n");
    assert.ok(!shown.includes("use SQLite"), "a superseded decision is not offered as guidance");
    assert.ok(shown.includes("move to Postgres"));
  } finally {
    p.done();
  }
});

test("the context pack includes the real columns of the tables a feature touches", () => {
  const p = proj({ "db/migrations/001.sql": M1, "ROADMAP.md": "- [ ] Order history [M] — list a user's orders\n" });
  try {
    writeFileSync(join(p.dir, "SCHEMA.md"), render(parseSql(M1), "test"));
    const pack = buildPack(p.dir, "order history page");
    assert.match(pack, /DATABASE TABLES THIS TOUCHES/);
    assert.match(pack, /### orders/);
    assert.match(pack, /user_id \| bigint \| no/);
    assert.ok(!/### users/.test(pack));
  } finally {
    p.done();
  }
});

// ---------------- architecture map ----------------
function app() {
  const files = {};
  for (const a of ["api", "web", "core", "db"]) for (let i = 0; i < 3; i++) files[`${a}/m${i}.js`] = `export const x${i} = 1\n`;
  files["web/m0.js"] = "import '../api/m0.js'\nimport '../core/m0.js'\n";
  files["api/m0.js"] = "import '../core/m0.js'\nimport '../db/m0.js'\n";
  files["api/m1.js"] = "import '../core/m1.js'\n";
  files["core/m1.js"] = "import '../api/m2.js'\n"; // core <-> api: a cycle between areas
  files["core/m0.js"] = "export const base = 1\n";
  return proj(files, { git: true });
}
test("architecture map: areas, dependencies, hubs and circular dependencies", () => {
  const p = app();
  try {
    const { index } = buildIndex(p.dir);
    const a = buildArch(index, 1);
    assert.deepEqual(a.shown.map((x) => x.area).sort(), ["api/", "core/", "db/", "web/"]);
    const e = (f, t) => a.edges.find((x) => x.from === f && x.to === t)?.n;
    assert.equal(e("api/", "core/"), 2);
    assert.equal(e("web/", "api/"), 1);
    assert.equal(e("core/", "api/"), 1);
    assert.deepEqual(a.mutual, [["api/", "core/"]]);
    assert.equal(a.hubs[0].file, "core/m0.js");
  } finally {
    p.done();
  }
});
test("architecture map: written page is stable, goes stale on change, and keeps the hand-written part", () => {
  const p = app();
  try {
    let st = archStatus(p.dir, 1);
    assert.equal(st.state, "missing");
    assert.match(st.text, /^<!-- arch:begin/);
    assert.match(st.text, /### api\/ \{#A-api\}/);
    assert.match(st.text, /Depends on: \[\[A-core\]\] \(2\)/);
    assert.match(st.text, /api\/ and core\/ depend on each other/);
    assert.match(st.text, /## Hand-written/);
    writeFileSync(join(p.dir, "ARCHITECTURE.md"), st.text.replace("- External services (payments, email, storage, AI) and what each is used for:", "- External services: Stripe for payments"));
    st = archStatus(p.dir, 1);
    assert.equal(st.state, "current", "the hand-written edit must not make it stale");
    p.put("web/m1.js", "import '../db/m1.js'\n");
    st = archStatus(p.dir, 1);
    assert.equal(st.state, "stale");
    assert.match(st.text, /External services: Stripe for payments/, "regenerating keeps the hand-written part");
    const g = buildGraph(p.dir);
    assert.ok(g.defs.has("A-api") && !g.problems.some((x) => x.kind === "broken"), g.problems.map((x) => x.msg).join("\n"));
  } finally {
    p.done();
  }
});
