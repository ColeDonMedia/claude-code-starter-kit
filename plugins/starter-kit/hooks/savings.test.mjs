// Tests for the token savings that need a hook: shortened command output, the notices about resuming and Fable, the count of
// whole-file rewrites, and the plugin report. Run: node --test plugins/starter-kit/hooks/savings.test.mjs (also with KIT_VIA_GATE=1)
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hookPath } from "../scripts/test-via-gate.mjs";
import { listPlugins, pluginReport } from "../scripts/doctor.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const QUIET = hookPath(HERE, "quiet-output.mjs");
const SESSION = hookPath(HERE, "session-start.mjs");
const RECORDER = hookPath(HERE, "flight-recorder.mjs");

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "savings-"));
  const data = mkdtempSync(join(tmpdir(), "savings-data-"));
  const logs = mkdtempSync(join(tmpdir(), "savings-log-"));
  const put = (p, s) => {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), s);
  };
  const run = (script, payload) =>
    spawnSync(process.execPath, [script], { input: JSON.stringify({ cwd: dir, session_id: "s", ...payload }), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: dir, KIT_DATA_DIR: data, STARTER_KIT_FLIGHT_DIR: logs } });
  const flight = () => readdirSync(logs).map((f) => readFileSync(join(logs, f), "utf8")).join("");
  return { dir, data, logs, put, run, flight, done: () => [dir, data, logs].forEach((d) => rmSync(d, { recursive: true, force: true })) };
}
const LONG = Array.from({ length: 900 }, (_, i) => `  ✓ test ${i} passes`).join("\n") + "\nTests  900 passed (900)\n";
const bash = (command, stdout, extra = {}) => ({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_use_id: "b", tool_input: { command }, tool_response: { stdout, stderr: "", interrupted: false, isImage: false }, ...extra });
const replaced = (r) => (r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput?.updatedToolOutput : undefined);

test("a long passing test run reaches Claude shortened, in the tool's own shape, with the full log saved and self-ignoring", () => {
  const s = sandbox();
  try {
    const out = replaced(s.run(QUIET, bash("npm test", LONG)));
    assert.ok(out, "expected a replacement");
    assert.deepEqual(Object.keys(out).sort(), ["interrupted", "isImage", "stderr", "stdout"]);
    assert.equal(out.interrupted, false);
    assert.match(out.stdout, /^\[starter-kit: \d+ of 901 lines shown .*Full output: \.claude\/logs\/npm-.*\.log\. Read the part you need\.\]/);
    assert.match(out.stdout, /Tests {2}900 passed/);
    assert.ok(out.stdout.split("\n").length < 60);
    const logDir = join(s.dir, ".claude", "logs");
    assert.equal(readFileSync(join(logDir, ".gitignore"), "utf8"), "*\n", "the log folder must ignore itself");
    const saved = readdirSync(logDir).filter((f) => f.endsWith(".log"));
    assert.equal(saved.length, 1);
    assert.equal(readFileSync(join(logDir, saved[0]), "utf8").split("\n").length, 902, "the full output is kept");
    assert.match(s.flight(), /"ev":"quiet","sid":"s","lines":"901","kept":"\d+"/);
  } finally {
    s.done();
  }
});

test("git, short output, unknown programs, other tools and unrecognised shapes are left alone", () => {
  const s = sandbox();
  try {
    assert.equal(replaced(s.run(QUIET, bash("git diff main...feature", LONG))), undefined);
    assert.equal(replaced(s.run(QUIET, bash("npm test", "1 passed\n"))), undefined);
    assert.equal(replaced(s.run(QUIET, bash("node app.js", LONG))), undefined);
    assert.equal(replaced(s.run(QUIET, { ...bash("npm test", LONG), tool_name: "Read" })), undefined);
    assert.equal(replaced(s.run(QUIET, { ...bash("npm test", LONG), tool_response: "Exit code 1\nfailed" })), undefined);
    assert.equal(spawnSync(process.execPath, [QUIET], { input: "not json", encoding: "utf8" }).status, 0);
    assert.ok(!existsSync(join(s.dir, ".claude", "logs")), "nothing saved when nothing was shortened");
  } finally {
    s.done();
  }
});

test("PowerShell is shortened too; only the newest ten logs are kept; { quietOutput: false } switches it off", () => {
  const s = sandbox();
  try {
    for (let i = 0; i < 12; i++) assert.ok(replaced(s.run(QUIET, { ...bash("dotnet test", LONG), tool_name: "PowerShell" })));
    assert.equal(readdirSync(join(s.dir, ".claude", "logs")).filter((f) => f.endsWith(".log")).length, 10);
    s.put(".claude/kit.json", JSON.stringify({ quietOutput: false }));
    assert.equal(replaced(s.run(QUIET, bash("npm test", LONG))), undefined);
  } finally {
    s.done();
  }
});

test("a secret in the output stays in the local log file and never reaches the flight log", () => {
  const s = sandbox();
  try {
    const secret = ["sk", "live", "SECRET".repeat(4)].join("_");
    s.run(QUIET, bash("npm test", LONG + `token=${secret}\n`));
    assert.ok(!s.flight().includes(secret));
  } finally {
    s.done();
  }
});

const managed = (s, roadmap) => {
  s.put("CLAUDE.md", "<!-- starter-kit:managed -->\n# Project\n");
  if (roadmap) s.put("ROADMAP.md", roadmap);
};
const note = (s, payload) => {
  const r = s.run(SESSION, { hook_event_name: "SessionStart", ...payload });
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : "";
};

test("a resumed chat whose cache expired and that is large gets one line about the cost; otherwise nothing at all", () => {
  const s = sandbox();
  try {
    managed(s, "- [ ] Recipe search [S] — find recipes\n");
    const big = { source: "resume", prompt_cache_likely_expired: true, context_tokens: 412_000 };
    assert.match(note(s, big), /^RESUMED CHAT: this conversation re-sends about 412K tokens/);
    assert.equal(note(s, { ...big, prompt_cache_likely_expired: false }), "");
    assert.equal(note(s, { ...big, context_tokens: 90_000 }), "");
    assert.equal(note(s, { source: "resume" }), "", "no fields: say nothing");
    assert.match(note(s, { ...big, source: "fork" }), /RESUMED CHAT/);
    assert.doesNotMatch(note(s, { source: "startup" }), /RESUMED CHAT/);
  } finally {
    s.done();
  }
});

test("a build on Fable gets one line suggesting Opus, once per project", () => {
  const s = sandbox();
  try {
    managed(s, "- [ ] Recipe search [S] — find recipes\n");
    assert.match(note(s, { source: "startup", model: "claude-fable-5-2" }), /runs on Fable, about twice the usage of Opus/);
    assert.doesNotMatch(note(s, { source: "startup", model: "claude-fable-5-2" }), /runs on Fable/, "said once");
    const t = sandbox();
    try {
      managed(t, "- [x] Done thing — x (merged abc1234)\n");
      assert.doesNotMatch(note(t, { source: "startup", model: "claude-fable-5-2" }), /runs on Fable/, "nothing left to build");
    } finally {
      t.done();
    }
  } finally {
    s.done();
  }
});

test("writing a whole existing file again is counted (never its path); a new file is not", () => {
  const s = sandbox();
  try {
    s.put("src/app.js", "x\n");
    s.run(RECORDER, { hook_event_name: "PreToolUse", tool_name: "Write", tool_use_id: "w1", tool_input: { file_path: "src/app.js", content: "y" } });
    s.run(RECORDER, { hook_event_name: "PreToolUse", tool_name: "Write", tool_use_id: "w2", tool_input: { file_path: join(s.dir, "src", "new.js"), content: "y" } });
    const text = s.flight();
    assert.equal((text.match(/"rw":"1"/g) ?? []).length, 1);
    assert.ok(!/app\.js|new\.js/.test(text));
  } finally {
    s.done();
  }
});

test("the plugin report lists other plugins switched on, project settings win, and nothing is changed", () => {
  const home = mkdtempSync(join(tmpdir(), "home-"));
  const s = sandbox();
  try {
    mkdirSync(join(home, ".claude"), { recursive: true });
    const user = JSON.stringify({ enabledPlugins: { "starter-kit@starter-kit-marketplace": true, "legal@x": true, "design@x": true, "old@x": false } });
    writeFileSync(join(home, ".claude", "settings.json"), user);
    s.put(".claude/settings.json", JSON.stringify({ enabledPlugins: { "design@x": false } }));
    const p = listPlugins(s.dir, home);
    assert.deepEqual(p.others.map((x) => x.name), ["legal@x"]);
    assert.match(pluginReport(s.dir, home), /legal@x \(your settings\)[\s\S]*"enabledPlugins": \{ "<name>": false \}/);
    assert.equal(readFileSync(join(home, ".claude", "settings.json"), "utf8"), user, "read only");
    rmSync(join(home, ".claude", "settings.json"));
    assert.match(pluginReport(s.dir, home), /no plugins are switched on/);
  } finally {
    s.done();
    rmSync(home, { recursive: true, force: true });
  }
});
