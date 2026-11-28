// Tests for lean-check.mjs: what a change leaves behind that a careful programmer would not (debugger statements, focused
// tests, conflict markers, a package nobody imports), and what it must only ask about (debug output, TODOs, commented-out code,
// skipped tests, silenced checks, empty catches, a new file nothing uses, a very long new file).
// Run: node --test plugins/starter-kit/scripts/lean-check.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { run, scanLines } from "./lean-check.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "lean-check.mjs");
const temps = [];
test.after(() => temps.forEach((d) => rmSync(d, { recursive: true, force: true })));

function repo(files = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "lean-")));
  temps.push(dir);
  const g = (...a) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...a], { cwd: dir, encoding: "utf8" });
  const put = (rel, text) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  };
  put("src/app.js", 'import { total } from "./money.js";\nexport const run = () => total([1, 2]);\n');
  put("src/money.js", "// Money sums.\nexport const total = (xs) => xs.reduce((a, b) => a + b, 0);\n");
  put("package.json", JSON.stringify({ name: "x", dependencies: {} }, null, 2));
  for (const [f, t] of Object.entries(files)) put(f, t);
  g("init", "-q", "-b", "main");
  g("add", "-A");
  g("commit", "-q", "-m", "base");
  const base = g("rev-parse", "HEAD").stdout.trim();
  return { dir, put, g, base, check: () => run(dir, { base }) };
}
const kinds = (list) => list.map((l) => l.kind).sort();
const lines = (text) => text.split("\n").map((t, i) => ({ n: i + 1, text: t }));

test("a clean change has nothing to report, and says how big it is", () => {
  const r = repo();
  r.put("src/tax.js", "// Tax on a total.\nexport const tax = (n) => Math.round(n * 0.2);\n");
  r.put("src/app.js", 'import { total } from "./money.js";\nimport { tax } from "./tax.js";\nexport const run = () => tax(total([1, 2]));\n');
  const out = r.check();
  assert.deepEqual(out.blocking, []);
  assert.deepEqual(out.checks, []);
  assert.equal(out.weight.files, 2);
  assert.equal(out.weight.newFiles, 1);
  assert.ok(out.weight.added >= 3);
});

test("BLOCKING: debugger statements in any language, focused tests and conflict markers", () => {
  assert.deepEqual(kinds(scanLines("src/a.js", lines("const a = 1;\n  debugger;\n")).blocking), ["DEBUGGER"]);
  assert.deepEqual(kinds(scanLines("api/a.py", lines("x = 1\n    breakpoint()\nimport pdb; pdb.set_trace()\n")).blocking), ["DEBUGGER", "DEBUGGER"]);
  assert.deepEqual(kinds(scanLines("lib/a.rb", lines("binding.pry\n")).blocking), ["DEBUGGER"]);
  assert.deepEqual(kinds(scanLines("src/a.rs", lines("let x = dbg!(y);\n")).blocking), ["DEBUGGER"]);
  assert.deepEqual(kinds(scanLines("src/a.php", lines("  var_dump($x);\n")).blocking), ["DEBUGGER"]);
  assert.deepEqual(kinds(scanLines("src/a.test.js", lines('test.only("x", () => {});\ndescribe.only("y", () => {});\nfit("z", () => {});\n')).blocking), ["FOCUSED TEST", "FOCUSED TEST", "FOCUSED TEST"]);
  assert.deepEqual(kinds(scanLines("src/a.js", lines("<<<<<<< HEAD\nconst a = 1;\n=======\nconst a = 2;\n>>>>>>> branch\n")).blocking), ["CONFLICT MARKER", "CONFLICT MARKER", "CONFLICT MARKER"]);
});

test("text that only mentions these words is not a finding", () => {
  const ok = scanLines("src/a.js", lines('const msg = "run the debugger";\n// the debugger is described in the docs\nconst only = items.only;\nconst s = "=======";\n'));
  assert.deepEqual(ok.blocking, []);
  assert.deepEqual(ok.checks, []);
  assert.deepEqual(scanLines("docs/guide.md", lines("debugger;\nconsole.log(1)\nTODO: write this\n")).blocking, [], "documents are not code");
  // Found by running the check on the kit itself: what a line says inside quotes is data.
  const quoted = scanLines("src/help.js", lines("const a = 'test.only(\"x\", fn)';\nconst b = \"// TODO: later\";\nconst c = `try { go(); } catch (e) {}`;\nconst d = \"it.skip('x')\";\n"));
  assert.deepEqual(quoted.blocking, []);
  assert.deepEqual(quoted.checks, []);
});

test("a command-line program's console output is its real output, not a leftover", () => {
  for (const f of ["scripts/seed.js", "bin/tool.mjs", "src/cli.js", "tools/main.py"]) assert.deepEqual(scanLines(f, lines(f.endsWith(".py") ? 'print("done")\n' : 'console.log("done");\n')).checks, [], f);
  assert.deepEqual(kinds(scanLines("src/checkout.js", lines('console.log("done");\n')).checks), ["DEBUG OUTPUT"]);
});

test("CHECK: debug output, TODOs, skipped tests, silenced checks and empty catches are questions, not blocks", () => {
  const src = scanLines("src/a.js", lines('console.log("here", x);\n// TODO: handle the empty case\nconst y = z as any; // @ts-ignore\ntry { go(); } catch (e) {}\n// eslint-disable-next-line no-unused-vars\n'));
  assert.deepEqual(src.blocking, []);
  assert.deepEqual(kinds(src.checks), ["DEBUG OUTPUT", "EMPTY CATCH", "SILENCED CHECK", "SILENCED CHECK", "TODO"]);
  assert.deepEqual(kinds(scanLines("api/a.py", lines('print("got here")\nx = f()  # type: ignore\ntry:\n    go()\nexcept Exception:\n    pass\n')).checks), ["DEBUG OUTPUT", "EMPTY CATCH", "SILENCED CHECK"]);
  assert.deepEqual(kinds(scanLines("src/a.test.js", lines('it.skip("later", () => {});\nxit("x", () => {});\nconsole.log("in a test this is fine");\n')).checks), ["SKIPPED TEST", "SKIPPED TEST"]);
  assert.deepEqual(scanLines("src/cli.js", lines("try { go(); } catch { /* the file may not exist yet */ }\n")).checks, [], "a catch that says why is not empty");
});

test("CHECK: three or more commented-out lines of code in a row; ordinary comments pass", () => {
  const dead = scanLines("src/a.js", lines("const a = 1;\n// const old = compute(a);\n// if (old > 2) {\n//   save(old);\n// }\nconst b = 2;\n"));
  assert.deepEqual(kinds(dead.checks), ["COMMENTED-OUT CODE"]);
  assert.match(dead.checks[0].text, /src\/a\.js:2-5/);
  const prose = scanLines("src/a.js", lines("// Works out the tax for one order.\n// The rate comes from the shop's country, because\n// shipping abroad is taxed where it lands.\nconst a = 1;\n"));
  assert.deepEqual(prose.checks, []);
  assert.deepEqual(kinds(scanLines("api/a.py", lines("# old = compute(a)\n# if old > 2:\n#     save(old)\n")).checks), ["COMMENTED-OUT CODE"]);
});

test("BLOCKING: a package added to package.json that nothing in the project mentions", () => {
  const r = repo();
  r.put("package.json", JSON.stringify({ name: "x", dependencies: { "left-pad": "1.3.0", "date-fns": "4.0.0" }, devDependencies: { vitest: "3.0.0" }, scripts: { test: "vitest run" } }, null, 2));
  r.put("src/app.js", 'import { total } from "./money.js";\nimport { format } from "date-fns";\nexport const run = () => format(total([1, 2]));\n');
  const out = r.check();
  assert.deepEqual(out.blocking.map((b) => b.kind), ["UNUSED DEPENDENCY"]);
  assert.match(out.blocking[0].text, /left-pad/);
  assert.equal(out.weight.newDependencies, 3);
});

test("CHECK: a new source file that nothing imports or names; entry points and tests are not asked about", () => {
  const r = repo();
  r.put("src/orphan.js", "// A helper nobody calls.\nexport const helper = () => 1;\n");
  r.put("src/routes/+page.js", "// The home page's data.\nexport const load = () => ({});\n");
  r.put("src/money.test.js", 'import { total } from "./money.js";\nimport test from "node:test";\ntest("sums", () => total([1]));\n');
  r.put("scripts/seed.js", "// Seeds the local database.\nexport {};\n");
  const out = r.check();
  assert.deepEqual(out.blocking, []);
  assert.deepEqual(out.checks.map((c) => c.kind), ["NOT REFERENCED"]);
  assert.match(out.checks[0].text, /src\/orphan\.js/);
});

test("CHECK: a very long new file; files that were already long are left alone", () => {
  const body = Array.from({ length: 450 }, (_, i) => `export const v${i} = ${i};`).join("\n");
  const r = repo({ "src/old-big.js": `// Old.\n${body}\n` });
  r.put("src/big.js", `// Many values.\n${body}\n`);
  r.put("src/app.js", 'import { total } from "./money.js";\nimport { v1 } from "./big.js";\nimport { v2 } from "./old-big.js";\nexport const run = () => total([v1, v2]);\n');
  r.put("src/old-big.js", `// Old.\n${body}\nexport const extra = 1;\n`);
  const out = r.check();
  assert.deepEqual(out.checks.map((c) => c.kind), ["LONG FILE"]);
  assert.match(out.checks[0].text, /src\/big\.js/);
});

test("only what the change added is judged: old problems are not this change's", () => {
  const r = repo({ "src/legacy.js": 'import "./app.js";\nconsole.log("old");\n// TODO: old\ndebugger;\n' });
  r.put("src/legacy.js", 'import "./app.js";\nconsole.log("old");\n// TODO: old\ndebugger;\nexport const fresh = 1;\n');
  const out = r.check();
  assert.deepEqual(out.blocking, []);
  assert.deepEqual(out.checks, []);
});

test("command line: exit 1 and BLOCKING lines when something blocks, exit 0 and LEAN OK when nothing does, --json for scripts", () => {
  const r = repo();
  r.put("src/app.js", 'import { total } from "./money.js";\nexport const run = () => {\n  debugger;\n  return total([1, 2]);\n};\n');
  const bad = spawnSync(process.execPath, [CLI, "--project", r.dir, "--base", r.base], { encoding: "utf8" });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /^BLOCKING DEBUGGER: src\/app\.js:3/m);
  assert.match(bad.stdout, /^WEIGHT: 1 file/m);
  r.put("src/app.js", 'import { total } from "./money.js";\nexport const run = () => total([1, 2, 3]);\n');
  const ok = spawnSync(process.execPath, [CLI, "--project", r.dir, "--base", r.base], { encoding: "utf8" });
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /LEAN OK/);
  const j = JSON.parse(spawnSync(process.execPath, [CLI, "--project", r.dir, "--base", r.base, "--json"], { encoding: "utf8" }).stdout);
  assert.deepEqual(j.blocking, []);
  assert.equal(spawnSync(process.execPath, [CLI, "--project", r.dir], { encoding: "utf8" }).status, 2, "a base commit is required");
});

test("the builder, the reviewer and the pre-ship scan all run it", () => {
  const read = (f) => readFileSync(join(HERE, "..", f), "utf8");
  assert.match(read("agents/implementer.md"), /lean-check\.mjs" --project \. --base <MAIN>/);
  assert.match(read("agents/reviewer.md"), /lean-check\.mjs" --project \. --base <MAIN>/);
  assert.match(read("agents/implementer.md"), /CUT LIST/);
  assert.match(read("agents/reviewer.md"), /CUT LIST/);
  assert.match(read("procedures/feature.md"), /CUT LIST/);
  assert.match(read("commands/full-scan.md"), /lean-check\.mjs" --project \. --base <last ship>/);
});

// The builder's instructions are loaded for every feature, so rules for one area live in sheets it reads only when needed.
test("the builder's area rules live in rule sheets it is pointed to, and its own instructions stay under their limit", () => {
  const read = (f) => readFileSync(join(HERE, "..", f), "utf8");
  const impl = read("agents/implementer.md");
  for (const s of ["screens", "speed", "security"]) {
    assert.match(impl, new RegExp(`\\$\\{CLAUDE_PLUGIN_ROOT\\}/rules/${s}\\.md`), `the builder is not pointed to rules/${s}.md`);
    assert.ok(read(`rules/${s}.md`).length > 400, `rules/${s}.md is empty`);
  }
  assert.match(read("rules/screens.md"), /ui-check\.mjs/);
  assert.match(read("rules/speed.md"), /api-check\.mjs/);
  assert.match(read("rules/security.md"), /migration-check\.mjs/);
  assert.match(impl, /Check who is asking on every endpoint/, "the security rules for every feature stay in the builder's own text");
  const words = impl.split(/\s+/).filter(Boolean).length;
  assert.ok(words <= 1900, `agents/implementer.md is ${words} words: move area rules into rules/, don't grow it`);
});
