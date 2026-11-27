// The merged hook entry point: one process runs the individual hooks. These tests prove it keeps every decision (the whole
// hook test suite is also run through it with KIT_VIA_GATE=1), reports crashes, and is faster than starting each hook alone.
// Run: node --test plugins/starter-kit/hooks/gate.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { combine } from "../scripts/inprocess.mjs";
import { pipeline } from "./gate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = join(HERE, "gate.mjs");

function sandbox(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "gate-"));
  const logs = mkdtempSync(join(tmpdir(), "gatelog-"));
  for (const [p, s] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), s);
  }
  const run = (mode, payload, env = {}) => spawnSync(process.execPath, [GATE, mode], { input: JSON.stringify({ cwd: dir, session_id: "s", ...payload }), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: dir, STARTER_KIT_FLIGHT_DIR: logs, ...env } });
  return { dir, logs, run, done: () => { rmSync(dir, { recursive: true, force: true }); rmSync(logs, { recursive: true, force: true }); } };
}
const bash = (command) => ({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_use_id: "t", tool_input: { command } });
const decision = (r) => (r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : r.status === 2 ? "blocked" : "allow");

// ---- the runner ----
function tmpModule(code) {
  const d = mkdtempSync(join(tmpdir(), "mod-"));
  const f = join(d, "m.mjs");
  writeFileSync(f, code);
  return { url: pathToFileURL(f).href, done: () => rmSync(d, { recursive: true, force: true }) };
}

// The runner replaces stdout and exit while it works, so it is exercised in a child process (inside the test runner it would
// capture the test framework's own output).
function viaChild(moduleCode, input = "") {
  const m = tmpModule(moduleCode);
  const d = mkdtempSync(join(tmpdir(), "runner-"));
  const script = join(d, "run.mjs");
  const lib = pathToFileURL(join(HERE, "..", "scripts", "inprocess.mjs")).href;
  writeFileSync(script, `import { runHook } from ${JSON.stringify(lib)};\nconst realExit = process.exit; const realWrite = process.stdout.write;\nconst r = await runHook(${JSON.stringify(m.url)}, ${JSON.stringify(input)});\nconst restored = process.exit === realExit && process.stdout.write === realWrite;\nconsole.log(JSON.stringify({ code: r.code, out: r.out, err: r.err, crashed: r.crashed ? String(r.crashed.message) : null, restored, exitCode: process.exitCode ?? null }));\n`);
  const r = spawnSync(process.execPath, [script], { encoding: "utf8" });
  m.done();
  rmSync(d, { recursive: true, force: true });
  return JSON.parse(r.stdout);
}

test("runner: captures output and the exit code a hook asks for, and restores the real process afterwards", () => {
  const r = viaChild('let raw = ""; for await (const c of process.stdin) raw += c; process.stdout.write("got:" + raw); process.stderr.write("oops"); process.exit(2);', "hello");
  assert.deepEqual([r.code, r.out, r.err, r.crashed, r.restored], [2, "got:hello", "oops", null, true]);
});

test("runner: a hook that finishes without exiting is code 0; process.exitCode is honoured and not disturbed", () => {
  assert.equal(viaChild('process.stdout.write("fine");').code, 0);
  const b = viaChild("process.exitCode = 7;");
  assert.equal(b.code, 7);
  assert.equal(b.exitCode, null, "the gate's own exit code is not disturbed");
});

test("runner: the first exit wins even if the hook's own catch-all swallowed the signal", () => {
  assert.equal(viaChild('try { process.exit(2); } catch { process.stdout.write("kept going"); process.exit(0); }').code, 2);
});

test("runner: a hook that crashes is reported as a crash, never as an allow", () => {
  const r = viaChild('throw new Error("boom in hook");');
  assert.equal(r.crashed, "boom in hook");
  const c = combine([{ code: r.code, out: r.out, err: r.err, crashed: new Error(r.crashed) }]);
  assert.equal(c.code, 1);
  assert.match(c.stderr, /a starter-kit hook crashed: boom in hook/);
});

test("combine: a block beats a refusal beats a question beats an allow; context is joined", () => {
  const J = (level, reason) => ({ code: 0, out: JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: level, permissionDecisionReason: reason } }), err: "" });
  assert.equal(combine([J("ask", "a"), J("deny", "b")]).stdout.includes('"deny"'), true);
  assert.equal(JSON.parse(combine([J("ask", "a"), J("ask", "b")]).stdout).hookSpecificOutput.permissionDecision, "ask");
  assert.match(JSON.parse(combine([J("ask", "a"), J("ask", "b")]).stdout).hookSpecificOutput.permissionDecisionReason, /a\nb/);
  const blocked = combine([J("deny", "x"), { code: 2, out: "", err: "nope" }]);
  assert.equal(blocked.code, 2);
  assert.equal(blocked.stderr.trim(), "nope");
  assert.equal(combine([{ code: 0, out: "", err: "" }]).code, 0);
  const ctx = (t) => ({ code: 0, out: JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: t } }), err: "" });
  assert.equal(JSON.parse(combine([ctx("one"), ctx("two")]).stdout).hookSpecificOutput.additionalContext, "one\n\ntwo");
});

test("no hook calls process.exit or done() inside a try that has a catch (the merged runner could not stop it there)", () => {
  for (const f of readdirSync(HERE).filter((x) => x.endsWith(".mjs") && !x.endsWith(".test.mjs"))) {
    let inTry = false;
    let start = 0;
    readFileSync(join(HERE, f), "utf8").split("\n").forEach((line, i) => {
      if (/^\s*try \{\s*$/.test(line)) { inTry = true; start = i + 1; }
      else if (/^\s*\} catch/.test(line)) inTry = false;
      else if (inTry && /\b(process\.exit|done|allow)\(/.test(line) && !/=>\s*process\.exit/.test(line)) assert.fail(`${f}:${i + 1} exits inside the try opened at line ${start}`);
    });
  }
});

// ---- which hooks run when ----
test("pipeline: which hooks run for which events", () => {
  assert.deepEqual(pipeline("pre", { tool_name: "Bash", tool_input: { command: "ls" } }), ["flight-recorder", "safety-guard", "db-guard", "secret-guard", "push-gate", "package-guard"]);
  assert.deepEqual(pipeline("pre", { tool_name: "Edit", tool_input: { file_path: "a" } }), ["flight-recorder", "file-guard", "plan-gate"]);
  assert.deepEqual(pipeline("pre", { tool_name: "Read", tool_input: { file_path: "a" } }), ["flight-recorder"]);
  assert.deepEqual(pipeline("post", { tool_name: "Write", tool_input: { file_path: "a" } }), ["flight-recorder", "code-warn", "test-related"]);
  assert.deepEqual(pipeline("pre", { tool_name: "WebFetch", tool_input: { url: "https://x.example" } }), ["flight-recorder", "fetch-guard"]);
  assert.deepEqual(pipeline("pre", { tool_name: "WebSearch", tool_input: { query: "x" } }), ["flight-recorder"]);
  for (const t of ["WebFetch", "WebSearch", "mcp__github__get_issue"]) assert.deepEqual(pipeline("post", { tool_name: t, tool_input: {} }), ["flight-recorder", "inject-warn"]);
  assert.deepEqual(pipeline("post", { tool_name: "Bash", tool_input: { command: "ls" } }), ["flight-recorder", "quiet-output"]);
  assert.deepEqual(pipeline("post", { tool_name: "PowerShell", tool_input: { command: "npm test" } }), ["flight-recorder", "quiet-output"]);
  assert.deepEqual(pipeline("pre", { tool_name: "Agent", tool_input: { subagent_type: "x" } }), ["flight-recorder", "agent-route"]);
  assert.deepEqual(pipeline("stop", {}), ["flight-recorder", "verify-gate", "docs-gate"]);
  assert.deepEqual(pipeline("start", { source: "startup" }), ["session-start", "flight-recorder", "auto-update"]);
  assert.deepEqual(pipeline("start", { source: "clear" }), ["session-start", "flight-recorder"]);
  assert.deepEqual(pipeline("start", { source: "resume" }), ["session-start", "flight-recorder"]); // only the resume-cost line, when due
  assert.deepEqual(pipeline("subagent", { agent_type: "starter-kit:reviewer" }), ["subagent-start"]);
});

test("end to end: a starter-kit subagent is told where the kit's scripts are; other agents get nothing", () => {
  const s = sandbox();
  try {
    const r = s.run("subagent", { hook_event_name: "SubagentStart", agent_type: "starter-kit:implementer", agent_id: "a1" });
    const out = JSON.parse(r.stdout).hookSpecificOutput;
    assert.equal(out.hookEventName, "SubagentStart");
    const folder = /KIT SCRIPTS: (.+?)\. Wherever/.exec(out.additionalContext)[1];
    assert.ok(readdirSync(folder).includes("code-index.mjs"), "the folder named is the real scripts folder");
    assert.equal(s.run("subagent", { hook_event_name: "SubagentStart", agent_type: "general-purpose" }).stdout, "");
  } finally {
    s.done();
  }
});

// ---- end to end through the real entry point ----
test("end to end: dangerous is refused, risky asks, harmless passes, and the recorder still sees each attempt", () => {
  const s = sandbox();
  try {
    assert.equal(decision(s.run("pre", bash("rm -rf /"))), "deny");
    assert.equal(decision(s.run("pre", bash("git reset --hard HEAD~3"))), "ask");
    assert.equal(decision(s.run("pre", bash("git status"))), "allow");
    assert.equal(decision(s.run("pre", bash("psql postgres://u:p@db.example.com/app -c 'select 1'"))), "deny");
    const log = readFileSync(join(s.logs, readdirSync(s.logs)[0]), "utf8");
    assert.equal(log.trim().split("\n").length, 4);
    assert.ok(!log.includes("example.com"));
  } finally {
    s.done();
  }
});

test("end to end: the push gate blocks with exit 2 and its message; a refusal beats it with the guard's reason", () => {
  const s = sandbox({ "CLAUDE.md": "<!-- starter-kit:managed -->\n", "package.json": "{}" });
  try {
    for (const a of [["init", "-q"], ["config", "user.email", "t@example.com"], ["config", "user.name", "t"], ["config", "commit.gpgsign", "false"], ["add", "-A"], ["commit", "-q", "-m", "x"]]) spawnSync("git", ["-C", s.dir, ...a]);
    const r = s.run("pre", bash("git push origin main"));
    assert.equal(r.status, 2);
    assert.match(r.stderr, /full-scan/);
    const f = s.run("pre", bash("git push --force origin main"));
    assert.equal(decision(f), "deny");
  } finally {
    s.done();
  }
});

test("end to end: the push gate and the secret guard also stop the PowerShell tool", () => {
  const s = sandbox({ "CLAUDE.md": "<!-- starter-kit:managed -->\n", "package.json": "{}" });
  try {
    for (const a of [["init", "-q"], ["config", "user.email", "t@example.com"], ["config", "user.name", "t"], ["config", "commit.gpgsign", "false"], ["add", "-A"], ["commit", "-q", "-m", "x"]]) spawnSync("git", ["-C", s.dir, ...a]);
    const pwsh = (command) => ({ hook_event_name: "PreToolUse", tool_name: "PowerShell", tool_use_id: "t", tool_input: { command } });
    const push = s.run("pre", pwsh("git push origin main; Write-Host done"));
    assert.equal(push.status, 2, "an unscanned push is blocked from PowerShell too");
    writeFileSync(join(s.dir, "config.js"), 'const key = "sk_live_' + "a1B2c3D4e5F6g7H8i9J0kLmN" + '";\n');
    spawnSync("git", ["-C", s.dir, "add", "config.js"]);
    const commit = s.run("pre", pwsh('git commit -m "add config"'));
    assert.equal(decision(commit), "deny", "a staged secret is refused from PowerShell too");
    assert.ok(!commit.stdout.includes("a1B2c3D4e5F6g7H8i9J0kLmN"), "the secret is never repeated");
  } finally {
    s.done();
  }
});

test("end to end: the file guard protects the approval list through the gate", () => {
  const s = sandbox();
  try {
    const r = s.run("pre", { tool_name: "Write", tool_input: { file_path: join(s.dir, ".claude", "plugins", "data", "starter-kit", "trusted.json").replace(/\\/g, "/"), content: "{}" } });
    assert.equal(decision(r), "deny");
    assert.equal(decision(s.run("pre", { tool_name: "Write", tool_input: { file_path: join(s.dir, "src", "a.js") } })), "allow");
  } finally {
    s.done();
  }
});

test("end to end: session start gives the note, stop does nothing in a project without the kit", () => {
  const s = sandbox({ "package.json": "{}", "CLAUDE.md": "<!-- starter-kit:managed -->\n" });
  const plain = sandbox({ "notes.txt": "x" });
  try {
    const r = s.run("start", { hook_event_name: "SessionStart", source: "startup" }, { KIT_AUTOUPDATE_DRY_RUN: "1" });
    assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /STARTER KIT WORKFLOWS/);
    assert.equal(s.run("start", { hook_event_name: "SessionStart", source: "resume" }).stdout, "", "resume does not repeat the note");
    const st = plain.run("stop", { hook_event_name: "Stop" });
    assert.equal(st.status, 0);
    assert.equal(st.stdout, "");
  } finally {
    s.done();
    plain.done();
  }
});

test("a broken input never crashes the gate or blocks anything", () => {
  const s = sandbox();
  try {
    const r = spawnSync(process.execPath, [GATE, "pre"], { input: "not json at all", encoding: "utf8", env: { ...process.env, STARTER_KIT_FLIGHT_DIR: s.logs } });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
    assert.equal(spawnSync(process.execPath, [GATE, "nonsense"], { input: "{}", encoding: "utf8" }).status, 0);
  } finally {
    s.done();
  }
});

// ---- speed ----
function timeAll(commands) {
  return Promise.all(commands.map(([args, input, env]) => new Promise((resolve) => {
    const t = Date.now();
    const p = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: ["pipe", "ignore", "ignore"] });
    p.on("close", () => resolve(Date.now() - t));
    p.stdin.end(input);
  })));
}
test("speed: one merged process answers a shell command faster than the hooks started separately", { timeout: 120000 }, async () => {
  const s = sandbox({ "package.json": "{}", "CLAUDE.md": "<!-- starter-kit:managed -->\n" });
  try {
    const input = JSON.stringify({ ...bash("git status"), cwd: s.dir, session_id: "s" });
    const env = { CLAUDE_PROJECT_DIR: s.dir, STARTER_KIT_FLIGHT_DIR: s.logs };
    const names = ["flight-recorder", "safety-guard", "db-guard", "secret-guard", "push-gate", "package-guard"];
    const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    const merged = [];
    const separate = [];
    for (let i = 0; i < 5; i++) {
      const t = Date.now();
      await timeAll([[[GATE, "pre"], input, env]]);
      merged.push(Date.now() - t);
      const u = Date.now();
      await timeAll(names.map((n) => [[join(HERE, `${n}.mjs`)], input, env]));
      separate.push(Date.now() - u);
    }
    console.log(`# shell command overhead: merged ${median(merged)} ms, separate hooks ${median(separate)} ms`);
    assert.ok(median(merged) < median(separate), `merged ${median(merged)} ms should beat separate ${median(separate)} ms`);
    assert.ok(median(merged) < 3000, `merged hook took ${median(merged)} ms`);
  } finally {
    s.done();
  }
});
