// Tests for the plan-first gate (plan-gate.mjs), found necessary by the first live trial: told to plan first, Claude built a whole
// app with no plan. Run: node --test plugins/starter-kit/hooks/plan-gate.test.mjs   (and with KIT_VIA_GATE=1)
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hookPath } from "../scripts/test-via-gate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = hookPath(HERE, "plan-gate.mjs");
const SESSION = hookPath(HERE, "session-start.mjs");

function sandbox() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "plan-")));
  const data = mkdtempSync(join(tmpdir(), "plan-data-"));
  const env = { ...process.env, CLAUDE_PROJECT_DIR: dir, KIT_DATA_DIR: data, STARTER_KIT_FLIGHT_DIR: join(data, "flight") };
  const put = (p, s = "x") => {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), s);
  };
  const run = (script, payload) => spawnSync(process.execPath, [script], { input: JSON.stringify({ cwd: dir, session_id: "s", ...payload }), encoding: "utf8", env });
  const write = (file, tool = "Write") => {
    const r = run(GATE, { hook_event_name: "PreToolUse", tool_name: tool, tool_use_id: "w", tool_input: { file_path: file, content: "x" } });
    return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : "allow";
  };
  const startEmpty = () => run(SESSION, { hook_event_name: "SessionStart", source: "startup" });
  return { dir, put, write, startEmpty, done: () => [dir, data].forEach((d) => rmSync(d, { recursive: true, force: true })) };
}

test("a project born in an empty folder gets no app code until a plan exists; setup, records and test config are fine", () => {
  const s = sandbox();
  try {
    assert.match(s.startEmpty().stdout, /A hook refuses app code here until the plan is approved/);
    s.put("CLAUDE.md", "<!-- starter-kit:managed -->\n");
    for (const f of ["index.html", "src/app.js", "src/calc.js", "sw.js", "tests/calc.test.cjs", join(s.dir, "src", "styles.css")]) assert.equal(s.write(f), "deny", f);
    assert.equal(s.write("src/app.js", "Edit"), "deny");
    for (const f of ["CLAUDE.md", "PROJECT.md", "README.md", "LICENSE", ".gitignore", ".claude/kit.json", ".github/workflows/checks.yml", "package.json", "package-lock.json", "e2e/a11y.spec.js", "e2e/playwright.config.js", "playwright.config.js", "tsconfig.json", "docs/screenshot.png"]) assert.equal(s.write(f), "allow", f);
    s.put("ROADMAP.md", "## Milestone 1\nAccepted: pending\n- [ ] Quote page [S] — build quotes\n");
    assert.equal(s.write("src/app.js"), "allow", "an approved plan opens the gate");
  } finally {
    s.done();
  }
});

test("existing projects, other folders and the owner's own switch are never blocked", () => {
  const s = sandbox();
  try {
    s.put("package.json", "{}"); // not empty: an existing project, no marker
    s.startEmpty();
    assert.equal(s.write("src/app.js"), "allow");
  } finally {
    s.done();
  }
  const t = sandbox();
  try {
    t.startEmpty();
    assert.equal(t.write(join(tmpdir(), "elsewhere.js")), "allow", "a file outside the project is not this gate's business");
    t.put(".claude/kit.json", JSON.stringify({ planGate: false }));
    assert.equal(t.write("src/app.js"), "allow", "the owner's own switch");
  } finally {
    t.done();
  }
});

test("the reason tells Claude exactly what to do, and odd input never fails", () => {
  const s = sandbox();
  try {
    s.startEmpty();
    const r = spawnSync(process.execPath, [GATE], { input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Write", cwd: s.dir, tool_input: { file_path: "index.html" } }), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: s.dir, KIT_DATA_DIR: join(dirname(s.dir), "nowhere") } });
    assert.equal(r.status, 0);
    assert.equal(spawnSync(process.execPath, [GATE], { input: "not json", encoding: "utf8" }).status, 0);
  } finally {
    s.done();
  }
});
