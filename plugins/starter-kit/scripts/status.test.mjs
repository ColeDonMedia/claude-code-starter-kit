// Tests for status.mjs. Run: node --test plugins/starter-kit/scripts/status.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { buildStatus, section } from "./status.mjs";

function repo() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "stat-")));
  const put = (rel, c) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); };
  const commitAt = (iso, msg) => {
    const env = { ...process.env, GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso };
    spawnSync("git", ["add", "-A"], { cwd: dir });
    spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", msg], { cwd: dir, env });
    return spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: dir, encoding: "utf8" }).stdout.trim();
  };
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  return { dir, put, commitAt, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("section reads the lines under a heading and ignores placeholders", () => {
  const t = "# P\n## Risks\n- Stripe approval may take weeks\n<!-- add more -->\nTODO\n- Few users at first\n## Next\n- x\n";
  assert.deepEqual(section(t, "Risks"), ["Stripe approval may take weeks", "Few users at first"]);
  assert.deepEqual(section(t, "Missing"), []);
  assert.deepEqual(section("## Risks\n(none)\n", "Risks"), []);
});

test("a full status: progress, sizes, milestones, pace, measures, risks, and what is waiting on the owner", () => {
  const r = repo();
  try {
    r.put("src/a.js", "1\n");
    const a = r.commitAt("2026-11-01T10:00:00Z", "feature a");
    r.put("src/b.js", "2\n");
    const b = r.commitAt("2026-11-08T10:00:00Z", "feature b");
    r.put("PROJECT.md", "# Recipe Share — master document\n## Success measures\n- 20 recipes saved in the first month\n## Risks\n- Image hosting costs grow quickly\n");
    r.put("HANDOFF.md", "# Handoff\nCovers-through: " + b + "\n## Questions waiting for the user\n- Which colour should the save button be?\n");
    r.put("ROADMAP.md", `# Roadmap\n## Milestone 1 — Sign in and save\nAccepted: pending\n- [x] Sign in [S] (merged ${a})\n  - [x] sign up → manual: opened the page and signed up with a test account\n- [x] Save recipes [M] (merged ${b})\n  - [x] save one → manual: saved a recipe and saw it in the list\n## Milestone 2 — Ratings\nAccepted: pending\n- [ ] Ratings [M]\n  - [ ] rate a recipe\n- [ ] Search [L]\n  - [ ] find a recipe\n`);
    r.commitAt("2026-11-09T10:00:00Z", "docs");
    const out = buildStatus(r.dir);
    assert.match(out, /STATUS — Recipe Share/);
    assert.match(out, /2 of 4 features done/);
    assert.match(out, /Left to build: 2 \(0 small, 1 medium, 1 large/);
    assert.match(out, /Next: Ratings/);
    assert.match(out, /Milestones: 1 "Sign in and save" — finished, waiting for your OK; 2 "Ratings" — 0\/2 features/);
    assert.match(out, /Pace \(a rough guess[^)]*\): 1\.0 features a week/);
    assert.match(out, /20 recipes saved in the first month/);
    assert.match(out, /Image hosting costs grow quickly/);
    assert.match(out, /Please try Milestone 1/);
    assert.match(out, /Which colour should the save button be\?/);
  } finally {
    r.cleanup();
  }
});

test("honest about what it cannot know: no roadmap, no pace yet, nothing waiting", () => {
  const r = repo();
  try {
    r.put("README.md", "x\n");
    r.commitAt("2026-11-01T10:00:00Z", "init");
    const none = buildStatus(r.dir);
    assert.match(none, /there is no roadmap yet/);
    r.put("ROADMAP.md", "- [ ] One\n  - [ ] a\n- [ ] Two\n  - [ ] b\n");
    const out = buildStatus(r.dir);
    assert.match(out, /Pace: not enough finished features yet/);
    assert.match(out, /Waiting on you: nothing\./);
    assert.doesNotMatch(out, /Pace \(a rough guess/);
  } finally {
    r.cleanup();
  }
});

test("it warns about unproven ticks and a handoff that does not match history", () => {
  const r = repo();
  try {
    r.put("README.md", "x\n");
    r.commitAt("2026-11-01T10:00:00Z", "init");
    r.put("ROADMAP.md", "- [x] Fake feature\n  - [x] it works\n");
    r.put("HANDOFF.md", "Covers-through: deadbee\n");
    const out = buildStatus(r.dir);
    assert.match(out, /Warning: \d+ roadmap tick\(s\) are not backed by proof/);
    assert.match(out, /handoff note does not match the code history/);
  } finally {
    r.cleanup();
  }
});

test("the command line prints the same report", () => {
  const r = repo();
  try {
    r.put("ROADMAP.md", "- [ ] One\n  - [ ] a\n");
    r.commitAt("2026-11-01T10:00:00Z", "init");
    const out = spawnSync("node", [join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "status.mjs"), "--project", r.dir], { encoding: "utf8" });
    assert.equal(out.status, 0);
    assert.match(out.stdout, /Progress: 0 of 1 features done/);
  } finally {
    r.cleanup();
  }
});
