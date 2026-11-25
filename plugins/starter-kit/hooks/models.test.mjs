// Tests for the model check on agent launches (agent-route.mjs) and the scout's pointer check (scout-check.mjs).
// Run: node --test plugins/starter-kit/hooks/models.test.mjs   (and with KIT_VIA_GATE=1, through the merged entry point)
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hookPath } from "../scripts/test-via-gate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SESSION = hookPath(HERE, "session-start.mjs");
const ROUTE = hookPath(HERE, "agent-route.mjs");
const SCOUT = hookPath(HERE, "scout-check.mjs");
const GUARD = hookPath(HERE, "safety-guard.mjs");

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "models-"));
  const data = mkdtempSync(join(tmpdir(), "models-data-"));
  const logs = mkdtempSync(join(tmpdir(), "models-log-"));
  const put = (p, s) => {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), s);
  };
  const run = (script, payload, env = {}) =>
    spawnSync(process.execPath, [script], { input: JSON.stringify({ cwd: dir, session_id: "s", ...payload }), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: dir, KIT_DATA_DIR: data, STARTER_KIT_FLIGHT_DIR: logs, CLAUDE_CODE_SUBAGENT_MODEL_FORCE: "", ...env } });
  return { dir, data, logs, put, run, done: () => [dir, data, logs].forEach((d) => rmSync(d, { recursive: true, force: true })) };
}
const launch = (subagent_type, model) => ({ hook_event_name: "PreToolUse", tool_name: "Agent", tool_use_id: "t", tool_input: { subagent_type, prompt: "do the job", description: "job", ...(model ? { model } : {}) } });
const decision = (r) => (r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput?.permissionDecision ?? "allow" : "allow");

test("a security review or code review on a model below its minimum is refused; stronger or unnamed models pass", () => {
  const s = sandbox();
  try {
    for (const [type, model, want] of [
      ["starter-kit:security-reviewer", "haiku", "deny"],
      ["starter-kit:security-reviewer", "sonnet", "deny"],
      ["starter-kit:security-reviewer", "opus", "allow"],
      ["starter-kit:reviewer", "haiku", "deny"],
      ["starter-kit:reviewer", "sonnet", "allow"],
      ["starter-kit:implementer", "opus", "allow"],
      ["starter-kit:implementer", "fable", "allow"],
      ["starter-kit:scout", "haiku", "allow"],
      ["starter-kit:security-reviewer", null, "allow"],
      ["starter-kit:security-reviewer", "claude-haiku-5-5", "allow"], // not an alias the Agent tool takes: left to Claude Code
      ["starter-kit:someone-new", "haiku", "allow"],
      ["other-plugin:reviewer", "haiku", "allow"],
      ["general-purpose", "haiku", "allow"],
    ]) {
      const r = s.run(ROUTE, launch(type, model));
      assert.equal(r.status, 0, r.stderr);
      assert.equal(decision(r), want, `${type} on ${model}`);
      if (want === "deny") assert.match(JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason, /needs at least (opus|sonnet)/);
    }
  } finally {
    s.done();
  }
});

test("this computer's ceiling lowers the minimum; a forced model, a switched-off kit and other tools are left alone", () => {
  const s = sandbox();
  try {
    writeFileSync(join(s.data, "model-ceiling.json"), JSON.stringify({ ceiling: "sonnet" }));
    assert.equal(decision(s.run(ROUTE, launch("starter-kit:security-reviewer", "sonnet"))), "allow");
    assert.equal(decision(s.run(ROUTE, launch("starter-kit:security-reviewer", "haiku"))), "deny");
    rmSync(join(s.data, "model-ceiling.json"));
    assert.equal(decision(s.run(ROUTE, launch("starter-kit:security-reviewer", "haiku"), { CLAUDE_CODE_SUBAGENT_MODEL_FORCE: "1" })), "allow");
    assert.equal(decision(s.run(ROUTE, { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" } })), "allow");
    assert.equal(s.run(ROUTE, {}).status, 0);
    // a project's kit.json alone cannot switch the check off: "auto": false counts only once approved on this computer
    s.put(".claude/kit.json", JSON.stringify({ auto: false }));
    assert.equal(decision(s.run(ROUTE, launch("starter-kit:security-reviewer", "haiku"))), "deny");
  } finally {
    s.done();
  }
});

test("the canary is still refused, so the model check does not change the shell guards", () => {
  const s = sandbox();
  try {
    const r = s.run(GUARD, { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "starter-kit-canary" } });
    assert.ok(r.status === 2 || /deny/.test(r.stdout), r.stdout + r.stderr);
  } finally {
    s.done();
  }
});

test("a project build on a Haiku conversation gets one line suggesting a stronger model; other models and projects get none", () => {
  const s = sandbox();
  try {
    s.put("CLAUDE.md", "<!-- starter-kit:managed -->\n# Project\n");
    const note = (payload) => {
      const r = s.run(SESSION, { hook_event_name: "SessionStart", source: "startup", ...payload });
      return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : "";
    };
    assert.doesNotMatch(note({ model: "claude-haiku-5-5" }), /runs on Haiku/, "no roadmap, no build: say nothing");
    s.put("ROADMAP.md", "- [ ] Recipe search [S] — find recipes\n");
    assert.match(note({ model: "claude-haiku-5-5" }), /MODEL: this conversation runs on Haiku/);
    assert.match(note({ model: { id: "claude-haiku-5-5", display_name: "Haiku" } }), /runs on Haiku/);
    assert.doesNotMatch(note({ model: "claude-opus-5-5" }), /runs on Haiku/);
    assert.doesNotMatch(note({}), /runs on Haiku/);
  } finally {
    s.done();
  }
});

const stop = (msg, extra = {}) => ({ hook_event_name: "SubagentStop", agent_type: "starter-kit:scout", agent_id: "a1", last_assistant_message: msg, stop_hook_active: false, ...extra });

test("a scout report with a wrong pointer is sent back once, then let through; a correct one passes", () => {
  const s = sandbox();
  try {
    s.put("src/cart.js", "// cart\nexport function addItem(cart, item) {\n  cart.items.push(item);\n}\n");
    const good = 'POINTERS\n- src/cart.js:2-3 — adds items — "export function addItem(cart, item) {"\nTESTS\n- none\nCONFIDENCE: high\n';
    const bad = good + 'POINTERS\n- src/ghost.js:1-1 — made up — "function ghost() {"\n';
    const ok = s.run(SCOUT, stop(good));
    assert.equal(ok.status, 0);
    assert.equal(ok.stdout.trim(), "");
    const first = s.run(SCOUT, stop(bad));
    const out = JSON.parse(first.stdout);
    assert.equal(out.decision, "block");
    assert.match(out.reason, /1 pointer\(s\).*\n- .*ghost\.js.*no such file/);
    const again = s.run(SCOUT, stop(bad, { stop_hook_active: true }));
    assert.equal(again.stdout.trim(), "", "never sent back twice");
    const log = readdirSync(s.logs).map((f) => readFileSync(join(s.logs, f), "utf8")).join("");
    assert.match(log, /"ev":"scout","sid":"s","ok":"1","bad":"1"/);
    assert.ok(!/ghost|addItem|cart/.test(log), "the log holds counts, never the report");
  } finally {
    s.done();
  }
});

test("other agents and odd input are never touched", () => {
  const s = sandbox();
  try {
    assert.equal(s.run(SCOUT, stop("POINTERS\n- nope.js:1-1 — x — \"anything here\"\n", { agent_type: "starter-kit:reviewer" })).stdout.trim(), "");
    assert.equal(s.run(SCOUT, stop(undefined)).stdout.trim(), "");
    assert.equal(spawnSync(process.execPath, [SCOUT], { input: "not json", encoding: "utf8" }).status, 0);
  } finally {
    s.done();
  }
});
