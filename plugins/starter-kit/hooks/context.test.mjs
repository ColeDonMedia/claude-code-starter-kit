// Tests for keeping the main conversation small: who may start agents (agent-route.mjs), the conductor's "merged" check
// (conductor-check.mjs), the compaction notes (compact-notes.mjs), the compaction record and the cut-off line in the session note.
// Run: node --test plugins/starter-kit/hooks/context.test.mjs   (and with KIT_VIA_GATE=1)
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hookPath } from "../scripts/test-via-gate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROUTE = hookPath(HERE, "agent-route.mjs");
const CHECK = hookPath(HERE, "conductor-check.mjs");
const NOTES = hookPath(HERE, "compact-notes.mjs");
const SESSION = hookPath(HERE, "session-start.mjs");
const RECORDER = hookPath(HERE, "flight-recorder.mjs");
const STATE = join(HERE, "..", "scripts", "build-state.mjs");

function sandbox({ git = false } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "ctx-")));
  const data = mkdtempSync(join(tmpdir(), "ctx-data-"));
  const logs = mkdtempSync(join(tmpdir(), "ctx-log-"));
  const env = { ...process.env, CLAUDE_PROJECT_DIR: dir, KIT_DATA_DIR: data, STARTER_KIT_FLIGHT_DIR: logs, CLAUDE_CODE_SUBAGENT_MODEL_FORCE: "" };
  const g = (...a) => spawnSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@example.com", ...a], { encoding: "utf8" });
  if (git) {
    g("init", "-q", "-b", "main");
    writeFileSync(join(dir, "a.txt"), "a\n");
    g("add", "-A");
    g("commit", "-q", "-m", "init");
  }
  const run = (script, payload) => spawnSync(process.execPath, [script], { input: JSON.stringify({ cwd: dir, session_id: "s", ...payload }), encoding: "utf8", env });
  const state = (...a) => spawnSync(process.execPath, [STATE, "--project", dir, ...a], { encoding: "utf8", env });
  const flight = () => readdirSync(logs).map((f) => readFileSync(join(logs, f), "utf8")).join("");
  return { dir, g, run, state, flight, done: () => [dir, data, logs].forEach((d) => rmSync(d, { recursive: true, force: true })) };
}
const decision = (r) => (r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput?.permissionDecision ?? "allow" : "allow");
const launch = (caller, type, model) => ({ hook_event_name: "PreToolUse", tool_name: "Agent", tool_use_id: "t", ...(caller ? { agent_id: "a1", agent_type: caller } : {}), tool_input: { subagent_type: type, prompt: "x", description: "x", ...(model ? { model } : {}) } });

test("only the conductor may start agents, only the kit's own, and never another conductor", () => {
  const s = sandbox();
  try {
    for (const [caller, type, want] of [
      ["starter-kit:conductor", "starter-kit:implementer", "allow"],
      ["starter-kit:conductor", "starter-kit:reviewer", "allow"],
      ["starter-kit:conductor", "general-purpose", "deny"],
      ["starter-kit:conductor", "other-plugin:helper", "deny"],
      ["starter-kit:conductor", "starter-kit:conductor", "deny"],
      ["starter-kit:scout", "starter-kit:reviewer", "deny"],
      ["starter-kit:implementer", "general-purpose", "deny"],
      [null, "starter-kit:conductor", "allow"],
      [null, "general-purpose", "allow"],
      ["general-purpose", "general-purpose", "allow"],
    ]) assert.equal(decision(s.run(ROUTE, launch(caller, type))), want, `${caller} -> ${type}`);
    // the model minimums still apply to launches by the conductor
    assert.equal(decision(s.run(ROUTE, launch("starter-kit:conductor", "starter-kit:security-reviewer", "sonnet"))), "deny");
  } finally {
    s.done();
  }
});

const stop = (msg, extra = {}) => ({ hook_event_name: "SubagentStop", agent_type: "starter-kit:conductor", agent_id: "c1", last_assistant_message: msg, stop_hook_active: false, ...extra });

test("a conductor's MERGED is believed only for a real commit on the main branch, and it is sent back once at most", () => {
  const s = sandbox({ git: true });
  try {
    s.g("checkout", "-q", "-b", "feature/x");
    writeFileSync(join(s.dir, "b.txt"), "b\n");
    s.g("add", "-A");
    s.g("commit", "-q", "-m", "feature");
    s.g("checkout", "-q", "main");
    s.g("merge", "-q", "--no-ff", "feature/x", "-m", "merge feature");
    const merged = s.g("rev-parse", "--short", "HEAD").stdout.trim();
    assert.equal(s.run(CHECK, stop(`RESULT: MERGED ${merged}\nWHAT WORKS: x`)).stdout.trim(), "");
    assert.equal(s.run(CHECK, stop(`**RESULT: MERGED ${merged}**`)).stdout.trim(), "", "markdown around the line is fine");
    const invented = JSON.parse(s.run(CHECK, stop("RESULT: MERGED deadbee1\nWHAT WORKS: x")).stdout);
    assert.equal(invented.decision, "block");
    assert.match(invented.reason, /does not exist/);
    s.g("checkout", "-q", "-b", "elsewhere");
    writeFileSync(join(s.dir, "c.txt"), "c\n");
    s.g("add", "-A");
    s.g("commit", "-q", "-m", "not on main");
    const off = s.g("rev-parse", "--short", "HEAD").stdout.trim();
    s.g("checkout", "-q", "main");
    assert.match(JSON.parse(s.run(CHECK, stop(`RESULT: MERGED ${off}`)).stdout).reason, /not on the main checkout's current branch/);
    assert.match(JSON.parse(s.run(CHECK, stop("All done, it works!")).stdout).reason, /first line must be/);
    assert.equal(s.run(CHECK, stop("All done, it works!", { stop_hook_active: true })).stdout.trim(), "", "never sent back twice");
    // trial 3: the conductor ended its turn twice "to wait" for the builder, which ends its run; it is told how to wait instead
    for (const w of ["The implementer is working on the fixes; I'll continue when its report arrives.", "I'm waiting for the builder's fix report."]) {
      const r = JSON.parse(s.run(CHECK, stop(w)).stdout);
      assert.equal(r.decision, "block", w);
      assert.match(r.reason, /ends your run/);
      assert.match(r.reason, /wait-agent\.mjs" --worktree/);
      assert.ok(!/first line must be/.test(r.reason), w);
    }
    assert.equal(s.run(CHECK, stop("I'm waiting for the builder's fix report.", { stop_hook_active: true })).stdout.trim(), "", "never sent back twice");
    for (const ok of ["RESULT: BLOCKED\nWHERE: feature/x", "RESULT: NEEDS OWNER\nQUESTION: which colour?", "RESULT: CANNOT DELEGATE"]) assert.equal(s.run(CHECK, stop(ok)).stdout.trim(), "", ok);
    assert.equal(s.run(CHECK, stop("RESULT: MERGED deadbee1", { agent_type: "starter-kit:reviewer" })).stdout.trim(), "", "other agents are not checked");
    const log = s.flight();
    assert.match(log, /"ev":"conductor","sid":"s","res":"merged"/);
    assert.match(log, /"res":"merged-rejected"/);
    assert.match(log, /"res":"waiting-rejected"/);
    assert.ok(!/All done|which colour|feature\/x/.test(log), "the log holds the result kind, never the report");
  } finally {
    s.done();
  }
});

test("before a compaction the kit says what the summary must keep, with the build state; it never blocks", () => {
  const s = sandbox({ git: true });
  try {
    const plain = s.run(NOTES, { hook_event_name: "PreCompact", trigger: "auto", custom_instructions: null });
    assert.equal(plain.status, 0);
    assert.match(plain.stdout, /KEEP: the roadmap item being built[\s\S]*DROP: tool output/);
    assert.ok(plain.stdout.length < 10_000);
    s.state("--set", "item=Recipe search", "stage=review", "branch=feature/search");
    assert.match(s.run(NOTES, { hook_event_name: "PreCompact", trigger: "manual" }).stdout, /Current build state: BUILD CUT OFF: "Recipe search" stopped at review/);
    mkdirSync(join(s.dir, ".claude"), { recursive: true });
    writeFileSync(join(s.dir, ".claude", "kit.json"), JSON.stringify({ auto: false }));
    // { auto: false } switches the notes off, as it does the session note; either way a compaction is never blocked
    const off = s.run(NOTES, { hook_event_name: "PreCompact", trigger: "auto" });
    assert.equal(off.status, 0);
    assert.equal(off.stdout, "");
  } finally {
    s.done();
  }
});

test("a compaction is recorded, and the session note after it says where a cut-off build stopped", () => {
  const s = sandbox({ git: true });
  try {
    s.run(RECORDER, { hook_event_name: "PostCompact", trigger: "auto", compact_summary: "private summary text" });
    assert.match(s.flight(), /"ev":"compact","src":"auto"/);
    assert.ok(!s.flight().includes("private summary"));
    writeFileSync(join(s.dir, "CLAUDE.md"), "<!-- starter-kit:managed -->\n# Project\n");
    s.state("--set", "item=Recipe search", "stage=build");
    const note = JSON.parse(s.run(SESSION, { hook_event_name: "SessionStart", source: "compact" }).stdout).hookSpecificOutput.additionalContext;
    assert.match(note, /BUILD CUT OFF: "Recipe search" stopped at build\. \/starter-kit:feature resumes it/);
    s.state("--set", "stage=done");
    assert.doesNotMatch(JSON.parse(s.run(SESSION, { hook_event_name: "SessionStart", source: "startup" }).stdout).hookSpecificOutput.additionalContext, /BUILD CUT OFF/);
  } finally {
    s.done();
  }
});
