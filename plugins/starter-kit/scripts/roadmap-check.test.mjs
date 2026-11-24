// Tests for roadmap-check.mjs. Run: node --test plugins/starter-kit/scripts/roadmap-check.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { checkRoadmap } from "./roadmap-check.mjs";

function repo() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "road-")));
  const g = (...a) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...a], { cwd: dir, encoding: "utf8" });
  const put = (rel, c) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); };
  g("init", "-q", "-b", "main");
  put("test/auth.test.js", 'test("signs up a visitor", () => {});\ntest("rejects a weak password", () => {});\n');
  g("add", "-A");
  g("commit", "-q", "-m", "feature work");
  const sha = g("rev-parse", "--short", "HEAD").stdout.trim();
  return { dir, put, g, sha, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
const road = (sha, extra = "") =>
  `# Roadmap\n- [x] Sign in — accounts (merged ${sha})\n  - [x] A visitor can sign up → test: test/auth.test.js::signs up a visitor\n  - [x] Weak passwords are refused → test: test/auth.test.js::rejects a weak password\n${extra}- [ ] Save recipes — the core\n  - [ ] A user can save a recipe\n`;

test("a fully proven roadmap is clean", () => {
  const r = repo();
  try {
    r.put("ROADMAP.md", road(r.sha));
    const c = checkRoadmap(r.dir);
    assert.deepEqual(c.problems, []);
    assert.equal(c.items, 2);
    assert.equal(c.ticked, 1);
  } finally {
    r.cleanup();
  }
});

test("a tick with no merge proof is a problem", () => {
  const r = repo();
  try {
    r.put("ROADMAP.md", "- [x] Sign in — accounts\n  - [x] sign up → test: test/auth.test.js::signs up a visitor\n");
    assert.match(checkRoadmap(r.dir).problems[0], /no "\(merged <commit>\)" proof/);
  } finally {
    r.cleanup();
  }
});

test("a made-up or foreign commit is a problem", () => {
  const r = repo();
  try {
    r.put("ROADMAP.md", road("deadbee"));
    assert.match(checkRoadmap(r.dir).problems.join("\n"), /does not exist/);
    // a real commit that is not in the current history (a side branch)
    r.g("checkout", "-q", "-b", "side");
    r.put("x.txt", "x");
    r.g("add", "-A");
    r.g("commit", "-q", "-m", "side");
    const side = r.g("rev-parse", "--short", "HEAD").stdout.trim();
    r.g("checkout", "-q", "main");
    r.put("ROADMAP.md", road(side));
    assert.match(checkRoadmap(r.dir).problems.join("\n"), /not part of the current history/);
  } finally {
    r.cleanup();
  }
});

test("criteria must point to a test file that exists and a test name that is really in it", () => {
  const r = repo();
  try {
    r.put("ROADMAP.md", road(r.sha, "  - [x] Passwords are hashed → test: test/missing.test.js::hashes\n  - [x] Sessions expire → test: test/auth.test.js::sessions expire after a day\n"));
    const p = checkRoadmap(r.dir).problems.join("\n");
    assert.match(p, /test\/missing\.test\.js, which does not exist/);
    assert.match(p, /no test named "sessions expire after a day"/);
  } finally {
    r.cleanup();
  }
});

test("a criterion without any evidence, an unticked criterion, and a feature with no criteria are problems", () => {
  const r = repo();
  try {
    r.put("ROADMAP.md", road(r.sha, "  - [x] It feels fast\n  - [ ] Emails are sent\n") + `- [x] Empty feature (merged ${r.sha})\n`);
    const p = checkRoadmap(r.dir).problems.join("\n");
    assert.match(p, /"It feels fast" has no/);
    assert.match(p, /criterion "Emails are sent" is not/);
    assert.match(p, /Empty feature" is ticked but lists no acceptance criteria/);
  } finally {
    r.cleanup();
  }
});

test("a manual check needs a real description", () => {
  const r = repo();
  try {
    r.put("ROADMAP.md", `- [x] Look (merged ${r.sha})\n  - [x] Page looks right on a phone → manual: opened at 375px width and checked every state\n  - [x] Another → manual: ok\n`);
    const p = checkRoadmap(r.dir).problems.join("\n");
    assert.ok(!/Page looks right/.test(p));
    assert.match(p, /"Another"/);
  } finally {
    r.cleanup();
  }
});

test("a test path cannot point outside the project", () => {
  const r = repo();
  try {
    r.put("ROADMAP.md", `- [x] Sneaky (merged ${r.sha})\n  - [x] Thing → test: ../../etc/hosts::x\n`);
    assert.match(checkRoadmap(r.dir).problems.join("\n"), /does not exist/);
  } finally {
    r.cleanup();
  }
});

test("no ROADMAP.md means nothing to check; unticked items need no proof", () => {
  const r = repo();
  try {
    assert.deepEqual(checkRoadmap(r.dir), { items: 0, ticked: 0, problems: [] });
    r.put("ROADMAP.md", "- [ ] Later — someday\n  - [ ] a thing\n");
    assert.deepEqual(checkRoadmap(r.dir).problems, []);
  } finally {
    r.cleanup();
  }
});
