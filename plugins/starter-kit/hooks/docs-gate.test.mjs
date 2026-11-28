// Tests for docs-gate.mjs. Run: node --test plugins/starter-kit/hooks/docs-gate.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { hookPath } from "../scripts/test-via-gate.mjs";

const GATE = hookPath(dirname(fileURLToPath(import.meta.url)), "docs-gate.mjs");

function project({ managed = true } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "docs-")));
  const g = (...a) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...a], { cwd: dir, encoding: "utf8" });
  const put = (rel, c) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); };
  const commit = (msg) => { g("add", "-A"); g("commit", "-q", "-m", msg); return g("rev-parse", "HEAD").stdout.trim(); };
  g("init", "-q", "-b", "main");
  put("CLAUDE.md", managed ? "<!-- starter-kit:managed -->\n" : "# plain\n");
  put(".gitignore", ".claude/last-docs-check\n");
  commit("setup");
  return { dir, put, g, commit, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
const stop = (p, payload = {}) => spawnSync("node", [GATE], { input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: p.dir } });

test("no code yet: nothing to document", () => {
  const p = project();
  try {
    assert.equal(stop(p).status, 0);
  } finally {
    p.cleanup();
  }
});

test("code committed but no handoff: blocks once, naming the three documents and the exact commit", () => {
  const p = project();
  try {
    p.put("src/app.js", "console.log(1)\n");
    const sha = p.commit("add app");
    const r = stop(p);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /HANDOFF\.md/);
    assert.match(r.stderr, /PROJECT\.md/);
    assert.match(r.stderr, /CHANGELOG\.md/);
    assert.ok(r.stderr.includes(`Covers-through: ${sha}`), "must tell Claude the exact line to write");
    assert.equal(stop(p).status, 0, "tells the same problem only once");
  } finally {
    p.cleanup();
  }
});

test("a current handoff passes, and writing the docs themselves does not make it stale again", () => {
  const p = project();
  try {
    p.put("src/app.js", "console.log(1)\n");
    const sha = p.commit("add app");
    p.put("HANDOFF.md", `# Handoff\nCovers-through: ${sha}\nDone: the app.\n`);
    p.put("PROJECT.md", "# Project\n");
    p.put("CHANGELOG.md", "# Changelog\n");
    p.commit("docs");
    assert.equal(stop(p).status, 0);
  } finally {
    p.cleanup();
  }
});

test("a new code commit makes the handoff stale; a short sha prefix is accepted", () => {
  const p = project();
  try {
    p.put("src/a.js", "1\n");
    const first = p.commit("a");
    p.put("HANDOFF.md", `Covers-through: ${first.slice(0, 7)}\n`);
    p.commit("docs");
    assert.equal(stop(p).status, 0, "short prefix is fine");
    p.put("src/b.js", "2\n");
    p.commit("b");
    const r = stop(p);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /out of date/);
  } finally {
    p.cleanup();
  }
});

test("only notes, config or docs changing never makes the handoff stale", () => {
  const p = project();
  try {
    p.put("src/a.js", "1\n");
    const sha = p.commit("a");
    p.put("HANDOFF.md", `Covers-through: ${sha}\n`);
    p.commit("docs");
    p.put("README.md", "more docs\n");
    p.put(".claude/kit.json", "{}");
    p.put(".github/workflows/x.yml", "name: x\n");
    p.put("package-lock.json", "{}");
    p.commit("housekeeping");
    assert.equal(stop(p).status, 0);
  } finally {
    p.cleanup();
  }
});

test("an unproven roadmap tick blocks, with the reason, and the problem is reported once", () => {
  const p = project();
  try {
    p.put("src/a.js", "1\n");
    const sha = p.commit("a");
    p.put("HANDOFF.md", `Covers-through: ${sha}\n`);
    p.put("ROADMAP.md", "- [x] Sign in — accounts\n  - [x] sign up → test: test/auth.test.js::signs up\n");
    p.commit("docs");
    const r = stop(p);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /ROADMAP\.md: "Sign in — accounts" is ticked but has no/);
    assert.match(r.stderr, /Never tick a box/);
    assert.match(r.stderr, /roadmap-check\.mjs" --project/, "must give the real path of the checker");
    assert.doesNotMatch(r.stderr, /\$\{CLAUDE_PLUGIN_ROOT\}/, "no unexpanded placeholders");
    assert.equal(stop(p).status, 0, "once");
  } finally {
    p.cleanup();
  }
});

test("never blocks twice in one turn, and respects the switches", async () => {
  const p = project();
  try {
    p.put("src/a.js", "1\n");
    p.commit("a");
    assert.equal(stop(p, { stop_hook_active: true }).status, 0);
    // Since 2.25.0 the switch counts only once the owner approved it on this computer (a project file alone is ignored).
    const data = realpathSync(mkdtempSync(join(tmpdir(), "docs-trust-")));
    const run = () => spawnSync("node", [GATE], { input: "{}", encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: p.dir, KIT_DATA_DIR: data } });
    p.put(".claude/kit.json", JSON.stringify({ docsGate: false }));
    rmSync(join(p.dir, ".claude", "last-docs-check"), { force: true });
    assert.equal(run().status, 2, "an unapproved switch is ignored");
    rmSync(join(p.dir, ".claude", "last-docs-check"), { force: true });
    const prev = process.env.KIT_DATA_DIR;
    process.env.KIT_DATA_DIR = data;
    const { trustEntries, entriesOf } = await import("../scripts/trust-lib.mjs");
    trustEntries(p.dir, entriesOf({ docsGate: false }));
    if (prev === undefined) delete process.env.KIT_DATA_DIR;
    else process.env.KIT_DATA_DIR = prev;
    assert.equal(run().status, 0, "the owner's approved switch");
    rmSync(data, { recursive: true, force: true });
  } finally {
    p.cleanup();
  }
});

test("inactive in projects that are not set up, not git repos, or given bad input", () => {
  const u = project({ managed: false });
  try {
    u.put("src/a.js", "1\n");
    u.commit("a");
    assert.equal(stop(u).status, 0);
  } finally {
    u.cleanup();
  }
  assert.equal(spawnSync("node", [GATE], { input: "garbage", encoding: "utf8" }).status, 0);
});
