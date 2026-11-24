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
    for (const cmd of ["spec", "feature", "tdd", "review", "research", "full-scan", "vet"]) {
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
    assert.ok(words < 400, `session context is ${words} words; keep under 400`);
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

test('push-gate: off when .claude/kit.json has "autoGate": false', () => {
  const s = sandbox();
  try {
    s.put("CLAUDE.md", MANAGED);
    s.put(".claude/kit.json", '{"autoGate":false}');
    s.initRepo();
    assert.equal(runHook(GATE, bash("git push"), s.dir).status, 0);
  } finally {
    s.cleanup();
  }
});

test("push-gate: bad input never blocks", () => {
  const r = spawnSync("node", [GATE], { input: "garbage", encoding: "utf8" });
  assert.equal(r.status, 0);
});
