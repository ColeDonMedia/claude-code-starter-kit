// Tests for status.mjs. Run: node --test plugins/starter-kit/scripts/status.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { buildStatus, featureTokens, progress, progressLine, section } from "./status.mjs";
import { setFields } from "./build-state.mjs";

const data = mkdtempSync(join(tmpdir(), "stat-data-"));
process.env.KIT_DATA_DIR = data; // the build state lives in the kit's data folder; keep the tests' state out of the real one
test.after(() => rmSync(data, { recursive: true, force: true }));

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
  assert.deepEqual(section("## Questions waiting for the user\n- None.\n", "Questions waiting for the user"), [], "a bulleted 'None.' is not an item");
});

// ---- progress against the approved scope ----
const APPROVED = `# Roadmap
## Milestone 1 — Sign in
Accepted: pending
- [ ] Sign in [S] — accounts {#F-001}
  - [ ] sign up
  - [ ] sign in
- [ ] Profiles [M] — a page per user {#F-002}
  - [ ] edit your name
## Milestone 2 — Search
Accepted: pending
- [ ] Search [L] — find anything {#F-003}
  - [ ] find a recipe
- [ ] Tags [S] — label things {#F-004}
  - [ ] add a tag
`;

test("progress is weighted by size and counts proven criteria; scope changes since approval are counted; the feature being built shows", () => {
  const r = repo();
  try {
    r.put("ROADMAP.md", APPROVED);
    r.commitAt("2026-11-01T10:00:00Z", "plan approved");
    const done = APPROVED
      .replace("- [ ] Sign in [S] — accounts {#F-001}\n  - [ ] sign up\n  - [ ] sign in", "- [x] Sign in [S] — accounts {#F-001} (merged abc1234)\n  - [x] sign up → test: t.js::up\n  - [x] sign in → test: t.js::in")
      .replace("- [ ] Tags [S] — label things {#F-004}\n  - [ ] add a tag\n", "")
      .replace("## Milestone 2 — Search\n", "## Milestone 2 — Search\n- [ ] Fix: lockout message [S] — from the user tester {#F-005}\n  - [ ] says when to retry\n");
    r.put("ROADMAP.md", done);
    r.commitAt("2026-11-02T10:00:00Z", "built one");
    const p = progress(r.dir);
    // weights S1 M2 L5 S1 = 9; done S = 1 → 11%
    assert.deepEqual([p.features, p.done, p.bySize, p.criteria, p.proven], [4, 1, 11, 5, 2]);
    assert.deepEqual([p.scope.approved, p.scope.added.length, p.scope.droppedFeatures], [4, 1, 1]);
    assert.equal(p.now, null);
    setFields(r.dir, ["item=F-002 Profiles", "stage=review", "round=2"]);
    const line = progressLine(r.dir);
    assert.equal(line, "PROGRESS: 1 of 4 features done (11% by size); 2 of 5 criteria proven; since you approved 4: 1 added, 1 dropped; Milestone 1: 1 of 2; now: F-002 Profiles: in review, round 2.");
    const out = buildStatus(r.dir);
    assert.match(out, /Progress: 1 of 4 features done \(11% of the work by size\); 2 of 5 acceptance criteria proven\./);
    assert.match(out, /Scope: you approved 4 features\. Since then 1 added \(Fix: lockout message\), 1 dropped\./);
    assert.match(out, /Now: F-002 Profiles: in review, round 2\./);
    // once the feature is past its merge, it is no longer "now"
    setFields(r.dir, ["stage=records"]);
    assert.doesNotMatch(progressLine(r.dir), /now:/);
    const cli = spawnSync("node", [join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "status.mjs"), "--project", r.dir, "--line"], { encoding: "utf8", env: { ...process.env, KIT_DATA_DIR: data } });
    assert.match(cli.stdout, /^PROGRESS: 1 of 4 features done/);
  } finally {
    r.cleanup();
  }
});

test("without git history there is no scope line, and a roadmap with nothing in it says so", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "stat-")));
  try {
    writeFileSync(join(dir, "ROADMAP.md"), APPROVED);
    assert.equal(progress(dir).scope, null);
    assert.doesNotMatch(buildStatus(dir), /Scope:/);
    assert.match(progressLine(dir), /^PROGRESS: 0 of 4 features done \(0% by size\); 0 of 5 criteria proven; Milestone 1: 0 of 2\.$/);
    writeFileSync(join(dir, "ROADMAP.md"), "# Roadmap\n");
    assert.equal(progressLine(dir), "PROGRESS: there is no roadmap yet.");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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

test("the tokens a feature used since it started are counted per agent, with the share on Opus", () => {
  const r = repo();
  try {
    setFields(r.dir, ["item=F-009 Invoices"]);
    const t0 = new Date(Date.now() - 1000).toISOString();
    const later = new Date(Date.now() + 1000).toISOString();
    const events = [
      { ev: "use", aid: "old", t: t0, ran: "claude-opus-5-5", out: 999999 }, // before this feature began: not counted
      { ev: "use", aid: "a", t: later, ran: "claude-opus-5-5", out: 1000, inp: 500, cw: 500, cr: 90000 }, // an earlier total of agent a
      { ev: "use", aid: "a", t: later, ran: "claude-opus-5-5", out: 3000, inp: 500, cw: 500, cr: 90000 }, // its last total counts
      { ev: "use", aid: "b", t: later, ran: "claude-sonnet-5-5", out: 1000 },
    ];
    assert.deepEqual(featureTokens(r.dir, events), { all: 5000, opus: 4000, agents: 2 });
    assert.equal(featureTokens(r.dir, []), null);
  } finally {
    r.cleanup();
  }
});
