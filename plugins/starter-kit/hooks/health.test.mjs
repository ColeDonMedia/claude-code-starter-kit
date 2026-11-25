// Hook health: the canary, failing closed when a guard crashes on a shell command, the once-per-version self-check at
// session start, the CLAUDE.md tripwire, and the doctor. These exist because a silently broken hook looks exactly like a
// working one. Run: node --test plugins/starter-kit/hooks/health.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { diagnose } from "../scripts/doctor.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = join(HERE, "gate.mjs");
const SESSION = join(HERE, "session-start.mjs");

function box() {
  const dir = mkdtempSync(join(tmpdir(), "health-"));
  const data = mkdtempSync(join(tmpdir(), "healthdata-"));
  const env = { CLAUDE_PROJECT_DIR: dir, KIT_DATA_DIR: data, STARTER_KIT_FLIGHT_DIR: join(data, "flight") };
  return { dir, data, env, done: () => { rmSync(dir, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }); } };
}
const pre = (tool, command) => JSON.stringify({ hook_event_name: "PreToolUse", tool_name: tool, tool_use_id: "t", tool_input: tool === "Edit" ? { file_path: "a.js" } : { command } });

test("the canary is refused through every shell tool, and nothing else is affected", () => {
  const b = box();
  try {
    for (const tool of ["Bash", "PowerShell"]) {
      const r = spawnSync(process.execPath, [GATE, "pre"], { input: pre(tool, "starter-kit-canary"), encoding: "utf8", env: { ...process.env, ...b.env } });
      const h = JSON.parse(r.stdout).hookSpecificOutput;
      assert.equal(h.permissionDecision, "deny", tool);
      assert.match(h.permissionDecisionReason, /canary ok/);
    }
    const r = spawnSync(process.execPath, [GATE, "pre"], { input: pre("Bash", "echo starter-kit-canary"), encoding: "utf8", env: { ...process.env, ...b.env } });
    assert.equal(r.stdout, "", "a command that only mentions the canary runs normally");
  } finally {
    b.done();
  }
});

// A stub that runs the gate with a guard that does not exist, the same way a guard that crashes on load would behave.
function crashingGate(mode, names) {
  const d = mkdtempSync(join(tmpdir(), "crash-"));
  const stub = join(d, "stub.mjs");
  writeFileSync(stub, `import { main } from ${JSON.stringify(pathToFileURL(GATE).href)};\nawait main(${JSON.stringify(mode)}, ${JSON.stringify(names)});\n`);
  return { stub, done: () => rmSync(d, { recursive: true, force: true }) };
}
test("a guard that crashes on a shell command blocks it (fail closed) and says how to find out why", () => {
  const b = box();
  const g = crashingGate("pre", ["safety-guard", "no-such-guard"]);
  try {
    for (const tool of ["Bash", "PowerShell"]) {
      const r = spawnSync(process.execPath, [g.stub], { input: pre(tool, "git status"), encoding: "utf8", env: { ...process.env, ...b.env } });
      assert.equal(r.status, 2, `${tool}: an unchecked command must not run`);
      assert.match(r.stderr, /guard crashed, so this command was not checked/);
      assert.match(r.stderr, /doctor\.mjs/);
    }
    const denied = spawnSync(process.execPath, [g.stub], { input: pre("Bash", "rm -rf /"), encoding: "utf8", env: { ...process.env, ...b.env } });
    assert.equal(JSON.parse(denied.stdout).hookSpecificOutput.permissionDecision, "deny", "a guard that already refused keeps its own reason");
  } finally {
    g.done();
    b.done();
  }
});
test("a crash anywhere else only warns, so a bug can never lock a session", () => {
  const b = box();
  const edit = crashingGate("pre", ["no-such-guard"]);
  const post = crashingGate("post", ["no-such-guard"]);
  try {
    const e = spawnSync(process.execPath, [edit.stub], { input: pre("Edit"), encoding: "utf8", env: { ...process.env, ...b.env } });
    assert.notEqual(e.status, 2);
    const p = spawnSync(process.execPath, [post.stub], { input: pre("Bash", "ls"), encoding: "utf8", env: { ...process.env, ...b.env } });
    assert.notEqual(p.status, 2);
    assert.match(p.stderr, /a starter-kit hook crashed/);
  } finally {
    edit.done();
    post.done();
    b.done();
  }
});

test("the first session on a new version asks for the canary once; tests and later sessions do not", () => {
  const b = box();
  try {
    writeFileSync(join(b.dir, "package.json"), "{}");
    writeFileSync(join(b.dir, "CLAUDE.md"), "<!-- starter-kit:managed -->\n");
    const run = (extra) => JSON.parse(spawnSync(process.execPath, [SESSION], { input: JSON.stringify({ cwd: b.dir, source: "startup" }), encoding: "utf8", env: { ...process.env, ...b.env, ...extra } }).stdout).hookSpecificOutput.additionalContext;
    const noRoot = { CLAUDE_PLUGIN_ROOT: "" };
    assert.doesNotMatch(run(noRoot), /SELF-CHECK/, "outside a real hook run there is no self-check");
    assert.ok(!existsSync(join(b.data, "version-seen")), "and nothing is recorded");
    const real = { CLAUDE_PLUGIN_ROOT: join(HERE, "..") };
    const first = run(real);
    assert.match(first, /SELF-CHECK \(first session on starter-kit \d+\.\d+\.\d+\)/);
    assert.match(first, /starter-kit-canary/);
    assert.doesNotMatch(run(real), /SELF-CHECK/, "only once per version");
    writeFileSync(join(b.data, "version-seen"), "0.0.1");
    assert.match(run(real), /SELF-CHECK/, "a new version asks again");
  } finally {
    b.done();
  }
});

test("the project CLAUDE.md template carries the tripwire, and the session note says what the tripwire looks for", () => {
  const init = readFileSync(join(HERE, "..", "commands", "init.md"), "utf8");
  assert.match(init, /If no "STARTER KIT WORKFLOWS" note appeared at the start of this session/);
  assert.match(readFileSync(SESSION, "utf8"), /STARTER KIT WORKFLOWS/);
});

test("the doctor: healthy here, and it names a missing tripwire as a problem", async () => {
  const b = box();
  const saved = { ...process.env };
  Object.assign(process.env, b.env);
  try {
    const healthy = await diagnose(b.dir);
    assert.equal(healthy.healthy, true, JSON.stringify(healthy.checks.filter((c) => c.ok === false)));
    for (const name of ["Guards (Bash)", "Guards (PowerShell)", "Hooks registered", "Data folder"]) assert.ok(healthy.checks.some((c) => c.name === name && c.ok === true), name);
    writeFileSync(join(b.dir, "CLAUDE.md"), "<!-- starter-kit:managed -->\n# Project\n");
    const old = await diagnose(b.dir);
    assert.equal(old.healthy, false);
    assert.ok(old.checks.some((c) => c.name === "Project tripwire" && c.ok === false));
    mkdirSync(join(b.data, "flight"), { recursive: true });
    const cli = spawnSync(process.execPath, [join(HERE, "..", "scripts", "doctor.mjs"), "--project", b.dir], { encoding: "utf8", env: { ...process.env, ...b.env } });
    assert.equal(cli.status, 1);
    assert.match(cli.stdout, /PROBLEM Project tripwire/);
  } finally {
    process.env = saved;
    b.done();
  }
});

test("the session note says why tests are off when the project points at a remote database, and never shows the password", () => {
  const b = box();
  try {
    writeFileSync(join(b.dir, "package.json"), "{}");
    writeFileSync(join(b.dir, "CLAUDE.md"), "<!-- starter-kit:managed -->\n");
    writeFileSync(join(b.dir, ".env"), "DATABASE_URL=postgres://app:dummypw9@db.prod.example.com:5432/app\n");
    const ctx = JSON.parse(spawnSync(process.execPath, [SESSION], { input: JSON.stringify({ cwd: b.dir }), encoding: "utf8", env: { ...process.env, ...b.env, CLAUDE_PLUGIN_ROOT: "" } }).stdout).hookSpecificOutput.additionalContext;
    assert.match(ctx, /DATABASE: .*db\.prod\.example\.com.*does not run its tests automatically/);
    assert.ok(!ctx.includes("dummypw9"));
  } finally {
    b.done();
  }
});
