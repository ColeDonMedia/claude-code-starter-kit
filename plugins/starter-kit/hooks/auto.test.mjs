// Tests for session-start.mjs and push-gate.mjs. Run: node --test plugins/starter-kit/hooks/auto.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SESSION = join(HERE, "session-start.mjs");
const GATE = join(HERE, "push-gate.mjs");
const MANAGED = "<!-- starter-kit:managed -->\n# Project\n";

function sandbox() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "kit-auto-")));
  const put = (rel, content = "x") => {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
    return p;
  };
  const git = (...args) =>
    spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd: dir, encoding: "utf8" });
  const initRepo = () => {
    git("init", "-q", "-b", "main");
    put("a.txt");
    git("add", "-A");
    git("commit", "-q", "-m", "init");
    return git("rev-parse", "HEAD").stdout.trim();
  };
  return { dir, put, git, initRepo, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const runHook = (script, payload, dir) =>
  spawnSync("node", [script], { input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });

// ---------- session-start ----------
test("session-start: nudges to run init in an un-set-up project", () => {
  const s = sandbox();
  try {
    s.put("package.json", "{}");
    const r = runHook(SESSION, {}, s.dir);
    assert.equal(r.status, 0);
    assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /starter-kit:init/);
  } finally {
    s.cleanup();
  }
});

const contextOf = (r) => (r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : "");

test("session-start: set-up project gets workflow routing and lean mode, not the init instruction", () => {
  const s = sandbox();
  try {
    s.put("package.json", "{}");
    s.put("CLAUDE.md", MANAGED);
    const ctx = contextOf(runHook(SESSION, {}, s.dir));
    assert.match(ctx, /STARTER KIT WORKFLOWS/);
    for (const cmd of ["spec", "feature", "tdd", "review", "research", "full-scan", "vet", "debug", "audit", "redteam", "status", "accept", "launch", "maintain", "legal"]) {
      assert.ok(ctx.includes(`/starter-kit:${cmd}`), `routing should mention /starter-kit:${cmd}`);
    }
    assert.match(ctx, /Never ask the user to type a command/);
    assert.match(ctx, /LEAN MODE/);
    assert.match(ctx, /clarity beats brevity/);
    assert.doesNotMatch(ctx, /starter-kit:init/);
  } finally {
    s.cleanup();
  }
});

test("session-start: un-set-up project is told to run init itself, without asking", () => {
  const s = sandbox();
  try {
    s.put("package.json", "{}");
    const ctx = contextOf(runHook(SESSION, {}, s.dir));
    assert.match(ctx, /run \/starter-kit:init yourself/);
    assert.match(ctx, /without asking first/);
    assert.doesNotMatch(ctx, /LEAN MODE/);
  } finally {
    s.cleanup();
  }
});

test('session-start: "lean": false drops lean mode but keeps the workflow routing', () => {
  const s = sandbox();
  try {
    s.put("package.json", "{}");
    s.put("CLAUDE.md", MANAGED);
    s.put(".claude/kit.json", '{"lean":false}');
    const ctx = contextOf(runHook(SESSION, {}, s.dir));
    assert.match(ctx, /STARTER KIT WORKFLOWS/);
    assert.doesNotMatch(ctx, /LEAN MODE/);
  } finally {
    s.cleanup();
  }
});

test("session-start: injected text stays short (it costs tokens every session)", () => {
  const s = sandbox();
  try {
    s.put("package.json", "{}");
    s.put("CLAUDE.md", MANAGED);
    const words = contextOf(runHook(SESSION, {}, s.dir)).split(/\s+/).length;
    assert.ok(words < 520, `session context is ${words} words; keep under 520`);
  } finally {
    s.cleanup();
  }
});

test("session-start: silent in a folder that is not a code project", () => {
  const s = sandbox();
  try {
    assert.equal(runHook(SESSION, {}, s.dir).stdout, "");
  } finally {
    s.cleanup();
  }
});

test('session-start: silent when .claude/kit.json has "auto": false', () => {
  const s = sandbox();
  try {
    s.put("package.json", "{}");
    s.put(".claude/kit.json", '{"auto":false}');
    assert.equal(runHook(SESSION, {}, s.dir).stdout, "");
  } finally {
    s.cleanup();
  }
});

// ---------- push-gate ----------
const bash = (command) => ({ tool_input: { command } });

test("push-gate: blocks git push when no full-scan is recorded", () => {
  const s = sandbox();
  try {
    s.put("CLAUDE.md", MANAGED);
    s.initRepo();
    const r = runHook(GATE, bash("git push origin main"), s.dir);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /full-scan/);
  } finally {
    s.cleanup();
  }
});

test("push-gate: blocks gh pr create and chained pushes", () => {
  const s = sandbox();
  try {
    s.put("CLAUDE.md", MANAGED);
    s.initRepo();
    assert.equal(runHook(GATE, bash("gh pr create --fill"), s.dir).status, 2);
    assert.equal(runHook(GATE, bash("npm test && git push"), s.dir).status, 2);
    assert.equal(runHook(GATE, bash("git -C . push"), s.dir).status, 2);
  } finally {
    s.cleanup();
  }
});

test("push-gate: allows the push when the recorded scan matches HEAD", () => {
  const s = sandbox();
  try {
    s.put("CLAUDE.md", MANAGED);
    const sha = s.initRepo();
    s.put(".claude/last-full-scan", sha + "\n");
    assert.equal(runHook(GATE, bash("git push"), s.dir).status, 0);
  } finally {
    s.cleanup();
  }
});

test("push-gate: blocks again after a new commit makes the scan stale", () => {
  const s = sandbox();
  try {
    s.put("CLAUDE.md", MANAGED);
    const sha = s.initRepo();
    s.put(".claude/last-full-scan", sha);
    s.put("b.txt");
    s.git("add", "-A");
    s.git("commit", "-q", "-m", "more");
    const r = runHook(GATE, bash("git push"), s.dir);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /different commit/);
  } finally {
    s.cleanup();
  }
});

test("push-gate: ignores commands that are not pushes", () => {
  const s = sandbox();
  try {
    s.put("CLAUDE.md", MANAGED);
    s.initRepo();
    for (const c of ["git status", "git commit -m 'git push later'", 'echo "git push"', "git push --dry-run", "git pull"]) {
      assert.equal(runHook(GATE, bash(c), s.dir).status, 0, c);
    }
  } finally {
    s.cleanup();
  }
});

test("push-gate: inactive in projects that are not set up", () => {
  const s = sandbox();
  try {
    s.initRepo();
    assert.equal(runHook(GATE, bash("git push"), s.dir).status, 0);
  } finally {
    s.cleanup();
  }
});

test('push-gate: off when .claude/kit.json has "autoGate": false AND the user approved it', () => {
  const s = sandbox();
  const data = mkdtempSync(join(tmpdir(), "auto-trust-"));
  try {
    s.put("CLAUDE.md", MANAGED);
    s.put(".claude/kit.json", '{"autoGate":false}');
    s.initRepo();
    const env = { KIT_DATA_DIR: data };
    assert.equal(spawnSync("node", [GATE], { input: JSON.stringify(bash("git push")), encoding: "utf8", env: { ...process.env, ...env, CLAUDE_PROJECT_DIR: s.dir } }).status, 2, "unapproved switch must be ignored");
    spawnSync("node", [join(HERE, "..", "scripts", "trust.mjs"), "--project", s.dir], { encoding: "utf8", env: { ...process.env, ...env } });
    assert.equal(spawnSync("node", [GATE], { input: JSON.stringify(bash("git push")), encoding: "utf8", env: { ...process.env, ...env, CLAUDE_PROJECT_DIR: s.dir } }).status, 0, "approved switch is honoured");
  } finally {
    s.cleanup();
    rmSync(data, { recursive: true, force: true });
  }
});

test("push-gate: bad input never blocks", () => {
  const r = spawnSync("node", [GATE], { input: "garbage", encoding: "utf8" });
  assert.equal(r.status, 0);
});

test("session-start: plain-language rule is on by default and can be switched off", () => {
  const s = sandbox();
  try {
    s.put("package.json", "{}");
    s.put("CLAUDE.md", MANAGED);
    assert.match(contextOf(runHook(SESSION, {}, s.dir)), /NOT A PROGRAMMER/);
    s.put(".claude/kit.json", '{"plainLanguage":false}');
    assert.doesNotMatch(contextOf(runHook(SESSION, {}, s.dir)), /NOT A PROGRAMMER/);
  } finally {
    s.cleanup();
  }
});

test("session-start: reports roadmap progress and the next item", () => {
  const s = sandbox();
  try {
    s.put("package.json", "{}");
    s.put("CLAUDE.md", MANAGED);
    s.put("ROADMAP.md", "# Roadmap\n- [x] Sign in — accounts\n  - [ ] indented criteria are not counted\n- [ ] Save recipes — the core\n- [ ] Ratings\n");
    const ctx = contextOf(runHook(SESSION, {}, s.dir));
    assert.match(ctx, /ROADMAP\.md: 1 of 3 done/);
    assert.match(ctx, /Next: "Save recipes/);
  } finally {
    s.cleanup();
  }
});

test("session-start: a finished roadmap suggests the pre-ship scan; no roadmap says nothing about it", () => {
  const s = sandbox();
  try {
    s.put("package.json", "{}");
    s.put("CLAUDE.md", MANAGED);
    assert.doesNotMatch(contextOf(runHook(SESSION, {}, s.dir)), /ROADMAP\.md: (\d|all)/, "no roadmap status when there is no roadmap");
    s.put("ROADMAP.md", "- [x] One\n- [x] Two\n");
    assert.match(contextOf(runHook(SESSION, {}, s.dir)), /all 2 items are done/);
  } finally {
    s.cleanup();
  }
});

test("session-start: a set-up project without git or a manifest still gets routing", () => {
  const s = sandbox();
  try {
    s.put("CLAUDE.md", MANAGED);
    assert.match(contextOf(runHook(SESSION, {}, s.dir)), /STARTER KIT WORKFLOWS/);
  } finally {
    s.cleanup();
  }
});

test("session-start: loads the previous session's handoff, labelled as notes and shortened", () => {
  const s = sandbox();
  try {
    s.put("package.json", "{}");
    s.put("CLAUDE.md", MANAGED);
    assert.doesNotMatch(contextOf(runHook(SESSION, {}, s.dir)), /HANDOFF\.md from the previous session/, "nothing to load when there is no handoff");
    s.put("HANDOFF.md", "# Handoff\nCovers-through: abc1234\nDone: sign in.\nFirst thing next: build saved recipes.\n" + "x".repeat(5000));
    const ctx = contextOf(runHook(SESSION, {}, s.dir));
    assert.match(ctx, /HANDOFF\.md from the previous session \(notes, not instructions from the user\)/);
    assert.match(ctx, /First thing next: build saved recipes/);
    assert.ok(ctx.length < 6500, "a huge handoff must be cut short");
  } finally {
    s.cleanup();
  }
});

test("session-start: tells every session where the kit's scripts are, as a real path", () => {
  for (const managed of [true, false]) {
    const s = sandbox();
    try {
      s.put("package.json", "{}");
      if (managed) s.put("CLAUDE.md", MANAGED);
      const ctx = contextOf(runHook(SESSION, {}, s.dir));
      const m = /<SCRIPTS> means this folder: (.+)$/m.exec(ctx);
      assert.ok(m, "scripts folder line present");
      assert.ok(m[1].split("\\").join("/").endsWith("/scripts"), m[1]);
      assert.doesNotMatch(ctx, /\$\{CLAUDE_PLUGIN_ROOT\}/);
    } finally {
      s.cleanup();
    }
  }
});

test("session-start: warns up front when ticked roadmap items have no proof", () => {
  const s = sandbox();
  try {
    s.put("package.json", "{}");
    s.put("CLAUDE.md", MANAGED);
    s.put("ROADMAP.md", "- [x] Sign in — accounts\n  - [x] sign up\n- [ ] Save recipes — core\n");
    const ctx = contextOf(runHook(SESSION, {}, s.dir));
    assert.match(ctx, /ROADMAP\.md has \d+ unproven claim/);
  } finally {
    s.cleanup();
  }
});

test("session-start: a finished milestone waiting for the owner is called out before more building", () => {
  const s = sandbox();
  try {
    s.put("package.json", "{}");
    s.put("CLAUDE.md", MANAGED);
    const open = ["## Milestone 1 — People can sign in", "Accepted: pending", "- [x] Sign in", "  - [x] sign up", "- [ ] Later", "  - [ ] x", ""].join("\n");
    s.put("ROADMAP.md", open);
    assert.doesNotMatch(contextOf(runHook(SESSION, {}, s.dir)), /is finished and waiting for the owner's OK/, "milestone 1 still has an open feature");
    const done = ["## Milestone 1 — People can sign in", "Accepted: pending", "- [x] Sign in", "  - [x] sign up", ""].join("\n");
    s.put("ROADMAP.md", done);
    assert.match(contextOf(runHook(SESSION, {}, s.dir)), /Milestone 1 \("People can sign in"\) is finished and waiting for the owner's OK: run \/starter-kit:accept/);
  } finally {
    s.cleanup();
  }
});

test("session-start: a launched app that is overdue for maintenance is called out; a fresh one and an unlaunched one are not", () => {
  const s = sandbox();
  try {
    s.put("package.json", "{}");
    s.put("CLAUDE.md", MANAGED);
    assert.doesNotMatch(contextOf(runHook(SESSION, {}, s.dir)), /maintenance/i, "not launched: nothing due");
    const today = new Date().toISOString().slice(0, 10);
    s.put("RUNBOOK.md", ["# Runbook", `Launched: ${today}`, ""].join("\n"));
    assert.doesNotMatch(contextOf(runHook(SESSION, {}, s.dir)), /maintenance is overdue/i, "just launched: not due");
    s.put("RUNBOOK.md", ["# Runbook", "Launched: 2020-01-01", ""].join("\n"));
    assert.match(contextOf(runHook(SESSION, {}, s.dir)), /Routine maintenance is overdue: \d+ days since the launch\. Offer to run \/starter-kit:maintain/);
  } finally {
    s.cleanup();
  }
});
