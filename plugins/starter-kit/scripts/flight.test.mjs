// Tests for the flight recorder, its report, the design check and the context pack.
// Run: node --test plugins/starter-kit/scripts/flight.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { analyze, report } from "./flight-report.mjs";
import { readLog, logPath } from "./flight-lib.mjs";
import { checkDesign, contrast } from "./design-check.mjs";
import { buildPack, lastDecisions } from "./context-pack.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK = join(HERE, "..", "hooks", "flight-recorder.mjs");
const SESSION = join(HERE, "..", "hooks", "session-start.mjs");

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "flight-"));
  const logs = mkdtempSync(join(tmpdir(), "flightlog-"));
  process.env.STARTER_KIT_FLIGHT_DIR = logs;
  return { dir, logs, done: () => { rmSync(dir, { recursive: true, force: true }); rmSync(logs, { recursive: true, force: true }); } };
}
function fire(dir, logs, payload) {
  return spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ cwd: dir, session_id: "s1", ...payload }), env: { ...process.env, CLAUDE_PROJECT_DIR: dir, STARTER_KIT_FLIGHT_DIR: logs }, encoding: "utf8" });
}

test("the recorder logs names only and never what a command contains", () => {
  const s = sandbox();
  try {
    const secret = ["sk", "ant", "api03", "SECRET".repeat(4)].join("-"); // built from pieces so the file holds no key-shaped text
    const r = fire(s.dir, s.logs, { hook_event_name: "PreToolUse", tool_name: "Bash", tool_use_id: "t1", tool_input: { command: `curl -H "x: ${secret}" https://example.com/private/path` } });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
    const text = readFileSync(logPath(s.dir), "utf8");
    assert.ok(!text.includes("sk-ant"), "a secret in the command leaked into the log");
    assert.ok(!text.includes("example.com") && !text.includes("private"), "command arguments leaked into the log");
    assert.match(text, /"prog":"curl"/);
  } finally {
    s.done();
  }
});

test("file contents, prompts and paths are never recorded", () => {
  const s = sandbox();
  try {
    fire(s.dir, s.logs, { hook_event_name: "PreToolUse", tool_name: "Write", tool_use_id: "t2", tool_input: { file_path: "C:/Users/someone/private.txt", content: "my password is hunter2" } });
    fire(s.dir, s.logs, { hook_event_name: "PostToolUse", tool_name: "Write", tool_use_id: "t2", tool_input: { file_path: "C:/Users/someone/private.txt", content: "hunter2" }, tool_response: { output: "hunter2" } });
    const text = readFileSync(logPath(s.dir), "utf8");
    assert.ok(!/hunter2|someone|private/.test(text));
  } finally {
    s.done();
  }
});

test("the log is stored outside the project, so it can never be committed", () => {
  const s = sandbox();
  try {
    fire(s.dir, s.logs, { hook_event_name: "SessionStart", source: "startup" });
    assert.ok(!existsSync(join(s.dir, ".claude")), "the recorder wrote inside the project");
    assert.equal(readdirSync(s.logs).length, 1);
  } finally {
    s.done();
  }
});

test("{ flightLog: false } in kit.json switches recording off", () => {
  const s = sandbox();
  try {
    mkdirSync(join(s.dir, ".claude"));
    writeFileSync(join(s.dir, ".claude", "kit.json"), JSON.stringify({ flightLog: false }));
    fire(s.dir, s.logs, { hook_event_name: "SessionStart", source: "startup" });
    assert.equal(readdirSync(s.logs).length, 0);
  } finally {
    s.done();
  }
});

test("garbage input and unknown events never fail or print", () => {
  const s = sandbox();
  try {
    const bad = spawnSync(process.execPath, [HOOK], { input: "not json", encoding: "utf8", env: { ...process.env, STARTER_KIT_FLIGHT_DIR: s.logs } });
    assert.equal(bad.status, 0);
    assert.equal(fire(s.dir, s.logs, { hook_event_name: "Notification" }).status, 0);
    assert.equal(readdirSync(s.logs).length, 0);
  } finally {
    s.done();
  }
});

test("an action that started but never finished is reported as blocked or failed", () => {
  const s = sandbox();
  try {
    fire(s.dir, s.logs, { hook_event_name: "PreToolUse", tool_name: "Bash", tool_use_id: "a", tool_input: { command: "git push origin main" } });
    fire(s.dir, s.logs, { hook_event_name: "PreToolUse", tool_name: "Bash", tool_use_id: "b", tool_input: { command: "npm test" } });
    fire(s.dir, s.logs, { hook_event_name: "PostToolUse", tool_name: "Bash", tool_use_id: "b", tool_input: { command: "npm test" } });
    const a = analyze(readLog(s.dir));
    assert.deepEqual(a.unfinished, ["Bash (git)"]);
    assert.match(report(readLog(s.dir)), /never finished/);
  } finally {
    s.done();
  }
});

test("the report names the workflows in order and flags a skipped review", () => {
  const ev = (o) => ({ t: "2026-01-01T00:00:00Z", sid: "s", ...o });
  const events = [
    ev({ ev: "start" }),
    ev({ ev: "try", tool: "Skill", skill: "starter-kit:spec", id: "1" }), ev({ ev: "ok", tool: "Skill", id: "1" }),
    ev({ ev: "try", tool: "Skill", skill: "starter-kit:feature", id: "2" }), ev({ ev: "ok", tool: "Skill", id: "2" }),
    ev({ ev: "try", tool: "Agent", agent: "starter-kit:implementer", id: "3" }), ev({ ev: "ok", tool: "Agent", id: "3" }),
    ev({ ev: "try", tool: "Edit", id: "4" }), ev({ ev: "ok", tool: "Edit", id: "4" }),
    ev({ ev: "stop" }),
  ];
  const a = analyze(events);
  assert.deepEqual(a.flow, ["spec", "feature"]);
  assert.ok(a.notes.some((n) => /reviewer agent never started/.test(n)));
  assert.ok(a.notes.some((n) => /challenger agent never started/.test(n)));
  assert.ok(a.notes.some((n) => /no researcher/.test(n)));
  assert.ok(!a.notes.some((n) => /edited .* without/.test(n)), "editing inside the feature workflow is fine");
  assert.match(report(events), /spec -> feature/);
});

test("code edited with no workflow at all is flagged; an empty log says so", () => {
  const e = (o) => ({ t: "x", sid: "s", ...o });
  const a = analyze([e({ ev: "try", tool: "Edit", id: "1" }), e({ ev: "ok", tool: "Edit", id: "1" })]);
  assert.ok(a.notes.some((n) => /without the feature, tdd or debug/.test(n)));
  assert.match(report([]), /Nothing recorded/);
});

test("agent launches record the model asked for, the model that ran and the tokens, and never the prompt", () => {
  const s = sandbox();
  try {
    const secret = ["sk", "ant", "api03", "SECRET".repeat(4)].join("-");
    const ti = { subagent_type: "starter-kit:reviewer", prompt: `review this, key ${secret}`, description: "private client work", model: "opus", effort: "high" };
    fire(s.dir, s.logs, { hook_event_name: "PreToolUse", tool_name: "Agent", tool_use_id: "a1", tool_input: ti });
    fire(s.dir, s.logs, { hook_event_name: "PostToolUse", tool_name: "Agent", tool_use_id: "a1", tool_input: ti, tool_response: { resolvedModel: "claude-opus-5-5", totalTokens: 41234.4, content: [{ type: "text", text: `APPROVE ${secret}` }] } });
    // a model field carrying something that is not a model name is recorded as "other"
    fire(s.dir, s.logs, { hook_event_name: "PreToolUse", tool_name: "Agent", tool_use_id: "a2", tool_input: { ...ti, model: secret, effort: "turbo" } });
    fire(s.dir, s.logs, { hook_event_name: "SessionStart", source: "startup", model: { id: "claude-haiku-5-5", display_name: `Haiku ${secret}` } });
    const text = readFileSync(logPath(s.dir), "utf8");
    assert.ok(!/sk-ant|private|client|review this|APPROVE|Haiku /.test(text), text);
    const log = readLog(s.dir);
    assert.equal(log[0].ask, "opus");
    assert.equal(log[0].eff, "high");
    assert.equal(log[1].ran, "claude-opus-5-5");
    assert.equal(log[1].tok, "41234");
    assert.equal(log[2].ask, "other");
    assert.equal(log[2].eff, undefined);
    assert.equal(log[3].model, "claude-haiku-5-5");
  } finally {
    s.done();
  }
});

test("an agent payload without model or token fields records nothing extra and never fails", () => {
  const s = sandbox();
  try {
    assert.equal(fire(s.dir, s.logs, { hook_event_name: "PostToolUse", tool_name: "Agent", tool_use_id: "b", tool_input: { subagent_type: "x" }, tool_response: "plain text" }).status, 0);
    assert.equal(fire(s.dir, s.logs, { hook_event_name: "PostToolUse", tool_name: "Agent", tool_use_id: "c", tool_input: { subagent_type: "x" } }).status, 0);
    for (const e of readLog(s.dir)) assert.ok(e.ran === undefined && e.tok === undefined && e.ask === undefined);
  } finally {
    s.done();
  }
});

test("the report shows models asked for, tokens per model and review rounds per build", () => {
  const e = (o) => ({ t: "x", sid: "s", ...o });
  const events = [
    e({ ev: "start" }),
    e({ ev: "try", tool: "Agent", agent: "starter-kit:implementer", ask: "sonnet", id: "1" }), e({ ev: "ok", tool: "Agent", id: "1", ran: "claude-sonnet-5-5", tok: "30000", miss: "2" }),
    e({ ev: "try", tool: "Agent", agent: "starter-kit:reviewer", ask: "opus", id: "2" }), e({ ev: "ok", tool: "Agent", id: "2", ran: "claude-opus-5-5", tok: "12000" }),
    e({ ev: "try", tool: "Agent", agent: "starter-kit:reviewer", ask: "opus", id: "3" }), e({ ev: "ok", tool: "Agent", id: "3", ran: "claude-opus-5-5", tok: "8000" }),
    e({ ev: "try", tool: "Agent", agent: "starter-kit:implementer", id: "4" }), e({ ev: "ok", tool: "Agent", id: "4" }),
    e({ ev: "try", tool: "Agent", agent: "starter-kit:reviewer", ask: "opus", id: "5" }), e({ ev: "ok", tool: "Agent", id: "5" }),
    e({ ev: "try", tool: "Agent", agent: "starter-kit:challenger", id: "6" }), e({ ev: "try", tool: "Agent", agent: "starter-kit:challenger", id: "7" }),
    e({ ev: "try", tool: "Agent", agent: "starter-kit:challenger", id: "8" }), // the challenger objected three times in the second build
    e({ ev: "scout", ok: "9", bad: "1" }),
  ];
  const r = report(events);
  assert.match(r, /implementer \(sonnet 1, default 1\)/);
  assert.match(r, /claude-opus-5-5 20,000/);
  assert.match(r, /claude-sonnet-5-5 30,000/);
  assert.match(r, /Review rounds per build: 2, 3/);
  assert.match(r, /Scout reports checked: 1; pointers 9 good, 1 wrong/);
  assert.match(r, /find for themselves: 2/);
});

test("every agent's tokens come from its own transcript when it stops, background ones included, each message counted once (trial 3)", () => {
  const s = sandbox();
  try {
    const t = join(s.dir, "agent.jsonl");
    const msg = (id, out, cr, model = "claude-opus-5-5") => JSON.stringify({ type: "assistant", message: { id, model, usage: { input_tokens: 2, cache_creation_input_tokens: 100, cache_read_input_tokens: cr, output_tokens: out }, content: [{ type: "text", text: "PRIVATE REPORT TEXT" }] } });
    // one message split over two lines (same id, same usage), a second message, and lines without usage
    writeFileSync(t, [JSON.stringify({ type: "user", message: { content: "brief" } }), msg("m1", 50, 1000), msg("m1", 50, 1000), msg("m2", 30, 2000), "not json"].join("\n"));
    const stop = (extra) => fire(s.dir, s.logs, { hook_event_name: "SubagentStop", agent_type: "starter-kit:conductor", agent_id: "c1", agent_transcript_path: t, stop_hook_active: false, last_assistant_message: "x", ...extra });
    assert.equal(stop().status, 0);
    let use = readLog(s.dir).filter((e) => e.ev === "use");
    assert.equal(use.length, 1);
    assert.deepEqual([use[0].ran, use[0].out, use[0].inp, use[0].cw, use[0].cr, use[0].agent, use[0].aid], ["claude-opus-5-5", "80", "4", "200", "3000", "starter-kit:conductor", "c1"]);
    assert.ok(!readFileSync(logPath(s.dir), "utf8").includes("PRIVATE"), "never the transcript's words");
    // a stop sent back by a check fires again later with bigger totals: the report keeps the last one per agent
    writeFileSync(t, [msg("m1", 50, 1000), msg("m2", 30, 2000), msg("m3", 20, 3000)].join("\n"));
    stop({ stop_hook_active: true });
    const t2 = join(s.dir, "reviewer.jsonl");
    writeFileSync(t2, msg("r1", 7, 10, "claude-sonnet-5-5"));
    fire(s.dir, s.logs, { hook_event_name: "SubagentStop", agent_type: "starter-kit:ui-reviewer", agent_id: "u1", agent_transcript_path: t2 });
    fire(s.dir, s.logs, { hook_event_name: "SubagentStop", agent_type: "starter-kit:scout", agent_id: "x", agent_transcript_path: join(s.dir, "missing.jsonl") });
    use = readLog(s.dir).filter((e) => e.ev === "use");
    assert.equal(use.length, 3, "a missing transcript records nothing");
    const r = report(readLog(s.dir));
    assert.match(r, /claude-opus-5-5: 1 agent\(s\), 100 written, 306 read new, 6,000 re-read from cache/);
    assert.match(r, /claude-sonnet-5-5: 1 agent\(s\), 7 written/);
    assert.match(r, /Tokens written by role: conductor 100, ui-reviewer 7/);
  } finally {
    s.done();
  }
});

test("a tool that ran and failed is reported as failed, not as blocked (found by the first live trial)", () => {
  const s = sandbox();
  try {
    fire(s.dir, s.logs, { hook_event_name: "PreToolUse", tool_name: "Bash", tool_use_id: "f1", tool_input: { command: "npm test" } });
    fire(s.dir, s.logs, { hook_event_name: "PostToolUseFailure", tool_name: "Bash", tool_use_id: "f1", tool_input: { command: "npm test -- --secret-flag" }, error: "Exit code 1\nprivate failure text" });
    fire(s.dir, s.logs, { hook_event_name: "PreToolUse", tool_name: "Bash", tool_use_id: "f2", tool_input: { command: "rm -rf /" } });
    const a = analyze(readLog(s.dir));
    assert.deepEqual(a.failed, ["Bash (npm)"]);
    assert.deepEqual(a.unfinished, ["Bash (rm)"]);
    const r = report(readLog(s.dir));
    assert.match(r, /1 action\(s\) ran and failed .*Bash \(npm\)/);
    assert.match(r, /1 action\(s\) started but never finished \(blocked by a guard, refused or interrupted\): Bash \(rm\)/);
    assert.ok(!readFileSync(logPath(s.dir), "utf8").includes("private"), "the failure text is never recorded");
  } finally {
    s.done();
  }
});

test("the report covers only the latest session unless asked for all", () => {
  const e = (o) => ({ t: "x", ...o });
  const events = [e({ sid: "old", ev: "try", tool: "Skill", skill: "starter-kit:debug", id: "1" }), e({ sid: "old", ev: "ok", tool: "Skill", id: "1" }), e({ sid: "new", ev: "start" })];
  assert.match(report(events), /Workflows run, in order: none/);
  assert.match(report(events, { all: true }), /debug/);
});

// ---- design check ----
test("design check: contrast math matches the WCAG reference values", () => {
  assert.ok(Math.abs(contrast("#000000", "#ffffff") - 21) < 0.01);
  assert.ok(contrast("#777777", "#ffffff") < 4.5);
  assert.ok(contrast("#595959", "#ffffff") > 4.5);
});

const GOOD = `# Design\n## Feel\ncalm, clear, quick\n## Colors\nbackground: #ffffff\ntext: #111111\nmuted: #595959\naccent: #2563eb\nerror: #b00020\n## Type\nInter\n## Spacing\n4px scale\n## Components\nbuttons\n## Speed feel\ninstant feedback\n## Accessibility\nWCAG 2.2 AA\n## References\nLinear\n## Quality bar\none primary action\n`;
test("design check: a complete brief passes", () => {
  assert.deepEqual(checkDesign(GOOD), []);
});
test("design check: unreadable colors and missing parts are reported", () => {
  const bad = GOOD.replace("text: #111111", "text: #cccccc").replace("## References\nLinear\n", "");
  const p = checkDesign(bad);
  assert.ok(p.some((x) => /text #cccccc.*contrast/.test(x)), p.join("|"));
  assert.ok(p.some((x) => /references/.test(x)));
  assert.ok(checkDesign("# nothing").length >= 3);
});

// ---- context pack and decisions ----
function project() {
  const s = sandbox();
  writeFileSync(join(s.dir, "ROADMAP.md"), "## Milestone 1 — start\nAccepted: pending\n- [ ] Recipe search [M] — find recipes by name\n  - [ ] typing a name lists matching recipes\n- [ ] Sign in [M] — accounts\n  - [ ] wrong password refused\n");
  writeFileSync(join(s.dir, "DECISIONS.md"), "# Decisions\n" + [1, 2, 3, 4, 5, 6, 7].map((n) => `- 2026-01-0${n} — decision ${n}, because reason ${n}`).join("\n") + "\n");
  writeFileSync(join(s.dir, "PROJECT.md"), "# Project\n## Map\n- src/search/ — recipe search code\n- src/auth/ — sign in and sessions\n- docs/ — notes\n## Other\nx\n");
  writeFileSync(join(s.dir, "DESIGN.md"), "# Design\n## Feel\ncalm\n");
  return s;
}
test("the context pack holds only what relates to the feature", () => {
  const s = project();
  try {
    const pack = buildPack(s.dir, "recipe search page");
    assert.match(pack, /Recipe search/);
    assert.match(pack, /typing a name lists matching recipes/);
    assert.match(pack, /src\/search\//);
    assert.ok(!/src\/auth\//.test(pack) && !/wrong password/.test(pack), "unrelated parts leaked in");
    assert.match(pack, /decision 7/);
    assert.match(pack, /DESIGN\.md/);
    assert.ok(pack.length <= 3500);
  } finally {
    s.done();
  }
});
test("the context pack is capped and survives an empty project", () => {
  const s = project();
  try {
    writeFileSync(join(s.dir, "DESIGN.md"), "line\n".repeat(500));
    assert.ok(buildPack(s.dir, "screen page", 800).length <= 800);
    const empty = sandbox();
    assert.match(buildPack(empty.dir, "anything"), /No records matched/);
    empty.done();
  } finally {
    s.done();
  }
});
test("lastDecisions returns the newest few, and falls back to PROJECT.md", () => {
  const s = project();
  try {
    const d = lastDecisions(s.dir, 3);
    assert.equal(d.length, 3);
    assert.match(d[2], /decision 7/);
    rmSync(join(s.dir, "DECISIONS.md"));
    writeFileSync(join(s.dir, "PROJECT.md"), "# P\n## Decisions\n- chose sqlite, because simple\n");
    assert.match(lastDecisions(s.dir)[0], /sqlite/);
  } finally {
    s.done();
  }
});
test("the session start shows the latest decisions and stays under the word limit", () => {
  const s = project();
  try {
    writeFileSync(join(s.dir, "package.json"), "{}");
    writeFileSync(join(s.dir, "CLAUDE.md"), "<!-- starter-kit:managed -->\n");
    const r = spawnSync(process.execPath, [SESSION], { input: JSON.stringify({ cwd: s.dir }), env: { ...process.env, CLAUDE_PROJECT_DIR: s.dir }, encoding: "utf8" });
    const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
    assert.match(ctx, /Latest decisions/);
    assert.match(ctx, /decision 7/);
    assert.ok(!/decision 1,/.test(ctx), "old decisions should not be injected");
  } finally {
    s.done();
  }
});
