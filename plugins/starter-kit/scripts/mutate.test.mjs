// Tests for mutate.mjs. Run: node --test plugins/starter-kit/scripts/mutate.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mutantsForLine, looksLikeBrokenBuild } from "./mutate.mjs";

const MUTATE = join(dirname(fileURLToPath(import.meta.url)), "mutate.mjs");
const SRC = "export const isAdult = (age) => age >= 18;\nexport const add = (a, b) => a + b;\n";
const WEAK = 'import test from "node:test";\nimport assert from "node:assert";\nimport { add } from "../src/calc.js";\ntest("add", () => assert.equal(add(1, 2), 3));\n';
const STRONG = WEAK + 'import { isAdult } from "../src/calc.js";\ntest("18 is an adult", () => assert.equal(isAdult(18), true));\ntest("17 is not", () => assert.equal(isAdult(17), false));\ntest("add negatives", () => assert.equal(add(-1, -2), -3));\n';

function project(testSource) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "mut-")));
  const g = (...a) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...a], { cwd: dir, encoding: "utf8" });
  const put = (rel, c) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); };
  g("init", "-q", "-b", "main");
  put("package.json", '{"type":"module","scripts":{"test":"node --test"}}');
  put("src/calc.js", SRC);
  put("test/calc.test.js", testSource);
  g("add", "-A");
  g("commit", "-q", "-m", "init");
  const wt = join(dir, "..", `wt-${Math.random().toString(36).slice(2, 8)}`);
  g("worktree", "add", "-q", "-b", "work", wt);
  return { dir, wt, cleanup: () => { spawnSync("git", ["worktree", "remove", "--force", wt], { cwd: dir }); rmSync(dir, { recursive: true, force: true }); rmSync(wt, { recursive: true, force: true }); } };
}
const run = (p, extra = []) => spawnSync("node", [MUTATE, "--project", p.wt, "--test", "node --test", "--files", "src/calc.js", ...extra], { encoding: "utf8" });

test("the mistakes it makes: comparisons, logic, arithmetic, booleans; comments and imports are left alone", () => {
  const labels = (l) => mutantsForLine(l).map((m) => m.label);
  assert.ok(labels("if (a >= 18) {").includes(">= to >"));
  assert.ok(labels("return a && b;").includes("&& to ||"));
  assert.ok(labels("const x = a + b;").includes("+ to -"));
  assert.ok(labels("const ok = true;").includes("true to false"));
  assert.ok(labels("if (!ready) return;").includes("removed a negation"));
  assert.deepEqual(mutantsForLine("// a >= b"), []);
  assert.deepEqual(mutantsForLine('import { a } from "./a.js";'), []);
  assert.deepEqual(mutantsForLine("# a >= b"), []);
});

test("a failing run that is only a broken build is not counted as the tests catching the bug", () => {
  assert.equal(looksLikeBrokenBuild("SyntaxError: Unexpected token '}'"), true);
  assert.equal(looksLikeBrokenBuild("error TS2304: Cannot find name"), true);
  assert.equal(looksLikeBrokenBuild("AssertionError: expected 3 to equal 4"), false);
});

test("weak tests: the missed behaviour is reported with file and line", () => {
  const p = project(WEAK);
  try {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /MISSED src\/calc\.js:1 \(>= to >\)/, "boundary at 18 is not tested");
    assert.match(r.stdout, /no test checks/);
  } finally {
    p.cleanup();
  }
});

test("strong tests: every mistake is caught", () => {
  const p = project(STRONG);
  try {
    const r = run(p);
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stdout, /MISSED/);
    assert.match(r.stdout, /Score 100%/);
  } finally {
    p.cleanup();
  }
});

test("the source files are restored exactly afterwards", () => {
  const p = project(WEAK);
  try {
    const before = readFileSync(join(p.wt, "src", "calc.js"), "utf8"); // git may have checked it out with CRLF line endings
    run(p);
    assert.equal(readFileSync(join(p.wt, "src", "calc.js"), "utf8"), before);
    assert.equal(spawnSync("git", ["status", "--porcelain"], { cwd: p.wt, encoding: "utf8" }).stdout.trim(), "", "worktree must be clean");
  } finally {
    p.cleanup();
  }
});

test("it refuses to edit the main checkout", () => {
  const p = project(WEAK);
  try {
    const r = spawnSync("node", [MUTATE, "--project", p.dir, "--test", "node --test", "--files", "src/calc.js"], { encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /Refusing to edit source files in the main checkout/);
    assert.equal(readFileSync(join(p.dir, "src", "calc.js"), "utf8"), SRC);
  } finally {
    p.cleanup();
  }
});

test("it will not judge tests that already fail", () => {
  const p = project('import test from "node:test";\ntest("broken", () => { throw new Error("nope"); });\n');
  try {
    const r = run(p);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /tests fail before any change/);
  } finally {
    p.cleanup();
  }
});

test("--diff limits the mistakes to lines changed since a base", () => {
  const p = project(WEAK);
  try {
    writeFileSync(join(p.wt, "src", "calc.js"), SRC + "export const isTeen = (age) => age >= 13 && age < 20;\n");
    spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-qam", "teen"], { cwd: p.wt });
    const r = spawnSync("node", [MUTATE, "--project", p.wt, "--test", "node --test", "--diff", "main"], { encoding: "utf8" });
    assert.match(r.stdout, /src\/calc\.js:3/);
    assert.doesNotMatch(r.stdout, /src\/calc\.js:1 /, "line 1 was not changed, so it is not mutated");
  } finally {
    p.cleanup();
  }
});
