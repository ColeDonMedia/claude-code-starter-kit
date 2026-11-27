// Big codebases: the code index, impact analysis, scoped test selection and the context pack's use of the index.
// Run: node --test plugins/starter-kit/scripts/index.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { parseFile, buildIndex, impact, findSymbol, hubs, areas, indexPath, isTestFile } from "./code-index.mjs";
import { selectTests } from "./scoped-tests.mjs";
import { buildPack } from "./context-pack.mjs";

function project(files, { git = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "idx-"));
  const store = mkdtempSync(join(tmpdir(), "idxstore-"));
  process.env.STARTER_KIT_INDEX_DIR = store;
  for (const [p, s] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), s);
  }
  if (git) spawnSync("git", ["-C", dir, "init", "-q"]);
  return { dir, store, put: (p, s) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), s); }, done: () => { for (const d of [dir, store]) { try { rmSync(d, { recursive: true, force: true, maxRetries: 5 }); } catch { /* a temp folder git is still writing to (seen on GitHub Linux): the system clears it */ } } } };
}

test("symbols and imports are read for each language", () => {
  const js = parseFile("import { a } from './a';\nexport { b } from \"../b.js\";\nconst c = require('./c')\nexport async function load() {}\nexport default class Store {}\nexport const add = (x) => x\ninterface Props {}\n", "js");
  assert.deepEqual(js.specs.sort(), ["../b.js", "./a", "./c"]);
  assert.deepEqual(js.symbols.map((s) => s[0]), ["load", "Store", "add", "Props"]);
  const py = parseFile("from .models import User, Order\nfrom app import utils\nimport os, app.db\nclass Repo:\n    def get(self):\n        pass\n", "py");
  for (const s of [".models", ".models.User", "app.utils", "os", "app.db"]) assert.ok(py.specs.includes(s), s);
  assert.deepEqual(py.symbols.map((s) => s[0]), ["Repo", "get"]);
  const go = parseFile('package x\nimport (\n  "fmt"\n  db "example.com/app/internal/db"\n)\nfunc (s *Server) Start() {}\ntype Server struct{}\n', "go");
  assert.deepEqual(go.specs.sort(), ["example.com/app/internal/db", "fmt"]);
  assert.deepEqual(go.symbols.map((s) => s[0]), ["Start", "Server"]);
  const rs = parseFile("mod auth;\nuse crate::db::pool;\npub fn run() {}\npub struct App;\n", "rs");
  assert.deepEqual(rs.specs.sort(), ["auth", "crate::db::pool"]);
  assert.deepEqual(parseFile("import com.shop.billing.Invoice;\npublic class Cart {\n  public void add(Item i) {\n", "java").symbols.map((s) => s[0]), ["Cart", "add"]);
  assert.deepEqual(parseFile("<?php\nuse App\\Models\\User;\nclass Ctl {\n  public function show() {}\n", "php").specs, ["App\\Models\\User"]);
  assert.deepEqual(parseFile("require_relative 'lib/thing'\ndef go!\nend\n", "rb").specs, ["lib/thing"]);
  assert.deepEqual(parseFile('#include "util.h"\n#include <stdio.h>\n', "c").specs, ["util.h"]);
});

test("keywords are not mistaken for function names, and a pathological line cannot hang the parser", () => {
  const c = parseFile("int main(void) {\n  if (x) {\n  while (y) {\n", "c");
  assert.deepEqual(c.symbols.map((s) => s[0]), ["main"]);
  const t0 = Date.now();
  parseFile("int " + "a ".repeat(5000) + "(" + "\n" + "x".repeat(200000), "c");
  parseFile("import " + "{ a, ".repeat(20000), "js");
  assert.ok(Date.now() - t0 < 3000, "parser is too slow on odd input");
});

test("imports are resolved to real files across languages", () => {
  const p = project({
    "src/app.ts": "import { db } from './db';\nimport { log } from '@/util/log';\n",
    "src/db/index.ts": "export const db = 1;\n",
    "src/util/log.ts": "export function log() {}\n",
    "app/services/orders.py": "from ..models import order\nfrom app.models.user import User\n",
    "app/models/order.py": "class Order: pass\n",
    "app/models/user.py": "class User: pass\n",
    "app/__init__.py": "",
    "go.mod": "module example.com/shop\n",
    "cmd/main.go": 'package main\nimport "example.com/shop/internal/pay"\nfunc main() {}\n',
    "internal/pay/pay.go": "package pay\nfunc Charge() {}\n",
    "src/main.rs": "mod auth;\nuse crate::billing::invoice;\n",
    "src/auth.rs": "pub fn login() {}\n",
    "src/billing/invoice.rs": "pub fn total() {}\n",
    "java/com/shop/Cart.java": "import com.shop.billing.Invoice;\npublic class Cart {}\n",
    "java/com/shop/billing/Invoice.java": "public class Invoice {}\n",
  });
  try {
    const { index } = buildIndex(p.dir);
    const deps = (f) => index.files[f].deps.sort();
    assert.deepEqual(deps("src/app.ts"), ["src/db/index.ts", "src/util/log.ts"]);
    assert.deepEqual(deps("app/services/orders.py"), ["app/models/order.py", "app/models/user.py"]);
    assert.deepEqual(deps("cmd/main.go"), ["internal/pay/pay.go"]);
    assert.deepEqual(deps("src/main.rs"), ["src/auth.rs", "src/billing/invoice.rs"]);
    assert.deepEqual(deps("java/com/shop/Cart.java"), ["java/com/shop/billing/Invoice.java"]);
  } finally {
    p.done();
  }
});

test("impact finds dependents through several steps, with distances, and survives import cycles", () => {
  const p = project({
    "a.js": "export const a = 1\n",
    "b.js": "import './a.js'\n",
    "c.js": "import './b.js'\nimport './d.js'\n",
    "d.js": "import './c.js'\n",
    "e.test.js": "import './c.js'\n",
    "x.js": "export const x = 1\n",
  });
  try {
    const { index } = buildIndex(p.dir);
    const hits = impact(index, ["a.js"]);
    assert.deepEqual(hits.map((h) => [h.file, h.distance]), [["b.js", 1], ["c.js", 2], ["d.js", 3], ["e.test.js", 3]]);
    assert.deepEqual(impact(index, ["x.js"]), []);
    assert.deepEqual(hubs(index)[0], { file: "c.js", dependents: 2 });
    assert.ok(findSymbol(index, "a")[0].file === "a.js");
  } finally {
    p.done();
  }
});

test("the index is incremental, lives outside the project, and notices new and deleted files", () => {
  const p = project({ "a.js": "import './b.js'\n", "c.js": "export function c() {}\n" });
  try {
    let r = buildIndex(p.dir);
    assert.equal(r.reread, 2);
    assert.deepEqual(r.index.files["a.js"].deps, [], "b.js does not exist yet");
    assert.ok(existsSync(indexPath(p.dir)) && !readdirSync(p.dir).some((f) => f.startsWith(".claude")));
    r = buildIndex(p.dir);
    assert.equal(r.reread, 0, "unchanged files must not be re-read");
    p.put("b.js", "export const b = 1\n");
    r = buildIndex(p.dir);
    assert.equal(r.reread, 1);
    assert.deepEqual(r.index.files["a.js"].deps, ["b.js"], "a new file turns an unresolved import into a link");
    p.put("c.js", "export function renamed() {}\n");
    utimesSync(join(p.dir, "c.js"), new Date(), new Date(Date.now() + 5000));
    r = buildIndex(p.dir);
    assert.equal(r.index.files["c.js"].symbols[0][0], "renamed");
    rmSync(join(p.dir, "b.js"));
    r = buildIndex(p.dir);
    assert.ok(!r.index.files["b.js"]);
    assert.deepEqual(r.index.files["a.js"].deps, []);
  } finally {
    p.done();
  }
});

test("in a git repository, a committed file that is then edited is re-read (git hashes, then the working copy)", () => {
  const p = project({ "a.js": "export function one() {}\n", "b.js": "export function two() {}\n" });
  try {
    const g = (...a) => spawnSync("git", ["-C", p.dir, ...a], { encoding: "utf8" });
    g("-c", "user.email=t@example.com", "-c", "user.name=t", "add", "-A");
    g("-c", "user.email=t@example.com", "-c", "user.name=t", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "x");
    let r = buildIndex(p.dir);
    assert.ok(r.index.files["a.js"].sig.startsWith("git:"));
    assert.equal(buildIndex(p.dir).reread, 0);
    p.put("a.js", "export function changed() {}\n");
    r = buildIndex(p.dir);
    assert.equal(r.reread, 1);
    assert.equal(r.index.files["a.js"].symbols[0][0], "changed");
    assert.equal(buildIndex(p.dir).reread, 0, "an edited but unchanged-since file is not re-read again");
  } finally {
    p.done();
  }
});

test("ignored, vendored and generated files stay out of the index", () => {
  const p = project({ ".gitignore": "secret/\n", "src/a.js": "x", "secret/b.js": "x", "node_modules/z/index.js": "x", "vendor/v.go": "x", "web/app.min.js": "x", "types.d.ts": "x" });
  try {
    assert.deepEqual(Object.keys(buildIndex(p.dir).index.files), ["src/a.js"]);
  } finally {
    p.done();
  }
});

test("areas summarise the codebase by top-level folder", () => {
  const p = project({ "api/a.py": "1\n2\n", "api/b.py": "1\n", "web/c.ts": "1\n" });
  try {
    const ar = areas(buildIndex(p.dir).index);
    assert.equal(ar[0].area, "api/");
    assert.equal(ar[0].files, 2);
  } finally {
    p.done();
  }
});

// ---- scoped tests ----
function shop() {
  return project({
    "src/price.js": "export function price() {}\n",
    "src/cart.js": "import { price } from './price.js'\n",
    "src/checkout.js": "import './cart.js'\n",
    "src/other.js": "export const other = 1\n",
    "test/cart.test.js": "import '../src/cart.js'\n",
    "test/checkout.test.js": "import '../src/checkout.js'\n",
    "test/other.test.js": "import '../src/other.js'\n",
    "src/price.spec.js": "// sits next to price.js\n",
    "src/lonely.js": "export const l = 1\n",
  });
}
test("scoped tests: a change selects the tests of everything that depends on it, and nothing else", () => {
  const p = shop();
  try {
    const { index } = buildIndex(p.dir);
    const r = selectTests(index, ["src/price.js"]);
    assert.equal(r.full, false);
    assert.deepEqual(r.tests, ["src/price.spec.js", "test/cart.test.js", "test/checkout.test.js"]);
  } finally {
    p.done();
  }
});
test("scoped tests: when it can't be sure, it says to run the full suite", () => {
  const p = shop();
  try {
    const { index } = buildIndex(p.dir);
    assert.match(selectTests(index, ["package.json"]).reason, /package\.json/);
    assert.equal(selectTests(index, ["scripts/deploy.sh"]).full, true);
    assert.match(selectTests(index, ["src/lonely.js"]).reason, /no test was found/);
    assert.equal(selectTests(index, ["src/price.js"], { max: 1 }).full, true);
    const docs = selectTests(index, ["README.md", "docs/a.md"]);
    assert.equal(docs.full, false);
    assert.deepEqual(docs.tests, []);
  } finally {
    p.done();
  }
});
test("test files are recognised in the usual layouts", () => {
  for (const f of ["test/a.js", "src/__tests__/a.ts", "a.test.ts", "a.spec.js", "pkg/a_test.go", "tests/test_a.py", "test_a.py", "src/CartTest.java", "e2e/login.ts"]) assert.ok(isTestFile(f), f);
  for (const f of ["src/latest.js", "contest.py", "src/testing.go"]) assert.ok(!isTestFile(f), f);
});

test("the context pack names the files that define related code when an index exists", () => {
  const p = project({ "src/billing/invoice.js": "export function createInvoice() {}\n", "src/app.js": "import './billing/invoice.js'\n" });
  try {
    buildIndex(p.dir);
    const pack = buildPack(p.dir, "send an invoice by email");
    assert.match(pack, /src\/billing\/invoice\.js:1 function createInvoice \(1 dependents\)/);
  } finally {
    p.done();
  }
});

test("a 10,000-file codebase indexes in reasonable time, and re-indexing is fast", { timeout: 240000 }, () => {
  const files = {};
  for (let i = 0; i < 10000; i++) {
    const d = `pkg${i % 100}`;
    files[`${d}/m${i}.js`] = `import './m${i - 100}.js'\nimport '../pkg${(i + 1) % 100}/m${i + 1}.js'\nexport function f${i}() {}\nexport class C${i} {}\n` + "// filler\n".repeat(30);
  }
  const p = project(files);
  try {
    const g = (...a) => spawnSync("git", ["-C", p.dir, "-c", "user.email=t@example.com", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...a], { encoding: "utf8" });
    g("add", "-A");
    g("commit", "-q", "-m", "x");
    let t = Date.now();
    const r = buildIndex(p.dir);
    const first = Date.now() - t;
    assert.equal(r.total, 10000);
    t = Date.now();
    const again = buildIndex(p.dir);
    const second = Date.now() - t;
    assert.equal(again.reread, 0);
    assert.ok(first < 120000, `first build took ${first} ms`);
    assert.ok(second < first, `re-index (${second} ms) should be faster than the first build (${first} ms)`);
    t = Date.now();
    const hits = impact(again.index, ["pkg0/m0.js"]);
    assert.ok(hits.length > 0 && Date.now() - t < 5000);
    console.log(`# 10k files: first ${first} ms, re-index ${second} ms, impact ${hits.length} dependents`);
  } finally {
    p.done();
  }
});
