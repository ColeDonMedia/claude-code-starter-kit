// Tests for shortening noisy command output (scripts/quiet-lib.mjs). Run: node --test plugins/starter-kit/scripts/quiet.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { isNoisy, MAX_LINES, programs, projectCommands, trimOutput } from "./quiet-lib.mjs";

const passing = (n) => [...Array.from({ length: n }, (_, i) => `  ✓ test number ${i} works (3 ms)`), "", "Test Files  42 passed (42)", "     Tests  812 passed (812)", "  Duration  9.12s"].join("\n");

test("short output is left exactly as it was", () => {
  const s = "ok\nall good\n";
  assert.deepEqual(trimOutput(s), { text: s, total: 2, kept: 2, trimmed: false });
});

test("a long passing run keeps its start and its summary, and says how many lines were left out", () => {
  const r = trimOutput(passing(800));
  assert.equal(r.trimmed, true);
  assert.ok(r.kept <= 15 + 30, `kept ${r.kept}`);
  assert.match(r.text, /test number 0 works/);
  assert.match(r.text, /Tests {2}812 passed/);
  assert.match(r.text, /\[… \d+ line\(s\) left out …\]/);
  assert.doesNotMatch(r.text, /test number 400 works/);
});

test("a failure in the middle of 5,000 lines is kept with the lines around it", () => {
  const lines = Array.from({ length: 5000 }, (_, i) => `  ✓ case ${i}`);
  lines[2500] = "  ✗ checkout adds tax";
  lines[2501] = "    AssertionError: expected 110 to equal 112";
  lines[2502] = "      at cart.test.js:41:7";
  const r = trimOutput(lines.join("\n"));
  for (const want of ["case 2498", "checkout adds tax", "expected 110 to equal 112", "cart.test.js:41:7", "case 2503"]) assert.match(r.text, new RegExp(want));
  assert.doesNotMatch(r.text, /case 1000\b/);
  assert.doesNotMatch(r.text, /case 2504\b/, "two lines of context after the last failure line, no more");
});

test("passing tests named after errors are not mistaken for failures; failure lines are capped", () => {
  const named = Array.from({ length: 400 }, (_, i) => `  ✓ shows an error message ${i}`).join("\n");
  assert.ok(trimOutput(named).kept <= 45);
  const many = Array.from({ length: 3000 }, (_, i) => `FAIL test ${i}`).join("\n");
  assert.ok(trimOutput(many).kept <= 15 + 30 + 120 + 4);
});

test("CRLF, unicode and one enormous line are handled", () => {
  const crlf = Array.from({ length: 300 }, (_, i) => `line ${i} — ✓ ünïcödé`).join("\r\n");
  const r = trimOutput(crlf);
  assert.equal(r.trimmed, true);
  assert.ok(!r.text.includes("\r"));
  const huge = "x".repeat(50_000);
  const h = trimOutput(huge);
  assert.equal(h.trimmed, true);
  assert.ok(h.text.length < 1000);
  assert.match(h.text, /more characters/);
});

test("only noisy programs are shortened: never git, file viewers or the kit's own scripts", () => {
  for (const c of ["npm test", "npx vitest run", "pytest -q", "cargo test", "go test ./...", "dotnet test", "cd web && pnpm build", "CI=1 npm run test", "node --test tests/", "python -m pytest", "C:\\tools\\npm.cmd install", "./gradlew build"]) assert.ok(isNoisy(c), c);
  for (const c of ["git diff main...feature", "git log -p", "cat package.json", "Get-Content big.log", "npm test 2>&1 | tail -n 40", "node \"C:/x/starter-kit/scripts/roadmap-check.mjs\" --project .", "node app.js", "ls -la", ""]) assert.ok(!isNoisy(c), c);
  assert.ok(isNoisy("bin/check-all --fast", ["bin/check-all"]), "a project's own command from CLAUDE.md counts");
  assert.deepEqual(programs("cd app && CI=1 npm test | tee out.txt"), ["cd", "npm", "tee"]);
});

test("the project's own commands are read from CLAUDE.md's Commands section only", () => {
  const md = "# P\n## Commands\n- Test: `bin/check-all`\n- Build: `make dist`\n## Other\n- `not-a-command`\n";
  assert.deepEqual(projectCommands(md), ["bin/check-all", "make dist"]);
  assert.deepEqual(projectCommands("# nothing"), []);
  assert.ok(MAX_LINES >= 100);
});
