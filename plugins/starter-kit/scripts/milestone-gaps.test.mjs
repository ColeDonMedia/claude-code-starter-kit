// Tests for milestone-gaps.mjs. Run: node --test plugins/starter-kit/scripts/milestone-gaps.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { featureGaps, milestoneGaps, parseRoadmap } from "./milestone-gaps.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "milestone-gaps.mjs");

function repo() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "gaps-")));
  const g = (...a) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...a], { cwd: dir, encoding: "utf8" });
  const put = (rel, c) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); };
  const commit = (m) => { g("add", "-A"); g("commit", "-q", "-m", m); };
  g("init", "-q", "-b", "main");
  return { dir, put, commit, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const APPROVED = `# Roadmap
## Milestone 1 — People can sign in
Accepted: pending
- [ ] Sign in [M] — accounts {#F-001} high-risk
  - [ ] A visitor can sign up with email
  - [ ] The 6th wrong password in a minute is refused
- [ ] Log out [S] — end the session {#F-002}
  - [ ] Logging out ends the session
- [ ] Reset password [S] — by email {#F-003}
  - [ ] A reset link signs the user in once
## Milestone 2 — Recipes
Accepted: pending
- [ ] Save recipes [M] — core {#F-004}
  - [ ] A user can save a recipe
`;

const TESTS = `test("signs up a visitor", () => {});\ntest("locks after five tries", () => {});\ntest("logs out", () => {});\n`;

const built = (extra = "") => `# Roadmap
## Milestone 1 — People can sign in
Accepted: pending
- [x] Sign in [M] — accounts {#F-001} high-risk (merged abc1234)
  - [x] A visitor can sign up with email → test: test/auth.test.js::signs up a visitor
  - [x] The 6th wrong password in a minute is refused → test: test/auth.test.js::locks after five tries
- [x] Log out [S] — end the session {#F-002} (merged abc1234)
  - [x] Logging out ends the session → test: test/auth.test.js::logs out
- [x] Reset password [S] — by email {#F-003} (merged abc1234)
  - [x] A reset link signs the user in once → manual: clicked the emailed link twice, second time refused
${extra}## Milestone 2 — Recipes
Accepted: pending
- [ ] Save recipes [M] — core {#F-004}
  - [ ] A user can save a recipe
`;

function setup(now, tests = TESTS) {
  const r = repo();
  r.put("ROADMAP.md", APPROVED);
  r.commit("plan approved");
  r.put("test/auth.test.js", tests);
  r.put("ROADMAP.md", now);
  r.commit("built");
  return r;
}

test("a milestone built as approved has no gaps, and the CLI exits 0", () => {
  const r = setup(built());
  try {
    const g = milestoneGaps(r.dir);
    assert.deepEqual(g.milestone, { n: 1, name: "People can sign in" });
    assert.deepEqual(g.gaps, []);
    const cli = spawnSync("node", [SCRIPT, "--project", r.dir], { encoding: "utf8" });
    assert.equal(cli.status, 0);
    assert.match(cli.stdout, /no gaps against the approved plan/);
  } finally {
    r.cleanup();
  }
});

test("a criterion removed or reworded since approval is a dropped gap", () => {
  const r = setup(built().replace("  - [x] The 6th wrong password in a minute is refused → test: test/auth.test.js::locks after five tries\n", "  - [x] Wrong passwords are slowed down → test: test/auth.test.js::locks after five tries\n"));
  try {
    const g = milestoneGaps(r.dir);
    assert.equal(g.gaps.length, 1);
    assert.equal(g.gaps[0].kind, "dropped");
    assert.match(g.gaps[0].text, /6th wrong password/);
  } finally {
    r.cleanup();
  }
});

test("a whole feature dropped since approval is a gap; moving a criterion to another milestone is not", () => {
  const moved = built()
    .replace(/- \[x\] Reset password[\s\S]*?refused\n/, "")
    .replace("  - [ ] A user can save a recipe\n", "  - [ ] A user can save a recipe\n");
  const r = setup(moved.replace("## Milestone 2 — Recipes\nAccepted: pending\n", "## Milestone 2 — Recipes\nAccepted: pending\n- [ ] Log out later [S] — x\n  - [ ] Logging out ends the session\n"));
  try {
    const g = milestoneGaps(r.dir);
    assert.deepEqual(g.gaps.map((x) => x.kind), ["dropped"]);
    assert.match(g.gaps[0].text, /Feature "Reset password/);
  } finally {
    r.cleanup();
  }
});

test("a cited test marked skip, todo or fixme is a skipped gap", () => {
  for (const marker of ['test.skip("logs out"', 'it.todo("logs out"', 'xit("logs out"', 'test.fixme("logs out"']) {
    const r = setup(built(), TESTS.replace('test("logs out"', marker));
    try {
      const g = milestoneGaps(r.dir);
      assert.deepEqual(g.gaps.map((x) => x.kind), ["skipped"], marker);
      assert.match(g.gaps[0].text, /Logging out ends the session/);
    } finally {
      r.cleanup();
    }
  }
});

test("one test cited for several criteria is a shared gap", () => {
  const r = setup(built().replace("test/auth.test.js::logs out", "test/auth.test.js::signs up a visitor"));
  try {
    const g = milestoneGaps(r.dir);
    assert.deepEqual(g.gaps.map((x) => x.kind), ["shared"]);
    assert.match(g.gaps[0].text, /signs up a visitor is the only proof for 2 criteria/);
  } finally {
    r.cleanup();
  }
});

test("a high-risk feature's criterion proven only by hand is a manual gap; a normal feature's is not", () => {
  const r = setup(built().replace("→ test: test/auth.test.js::locks after five tries", "→ manual: typed six wrong passwords and saw the lock message"));
  try {
    const g = milestoneGaps(r.dir);
    assert.deepEqual(g.gaps.map((x) => x.kind), ["manual"]);
    assert.match(g.gaps[0].text, /6th wrong password.*high-risk/);
  } finally {
    r.cleanup();
  }
});

test("without git history the dropped check is skipped with a note; no finished milestone means nothing to check", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "gaps-")));
  try {
    writeFileSync(join(dir, "ROADMAP.md"), built());
    const g = milestoneGaps(dir);
    assert.equal(g.milestone.n, 1);
    assert.match(g.notes.join(" "), /dropped items were not checked/);
    writeFileSync(join(dir, "ROADMAP.md"), APPROVED);
    assert.equal(milestoneGaps(dir).milestone, null);
    assert.match(milestoneGaps(dir, 9).notes[0], /No Milestone 9/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- one feature, as the feature workflow records it ----
test("a feature recorded as approved has no gaps; the CLI finds it by id or by name", () => {
  const r = setup(built());
  try {
    assert.deepEqual(featureGaps(r.dir, "F-001").gaps, []);
    assert.match(featureGaps(r.dir, "f-001").feature, /^Sign in/);
    assert.match(featureGaps(r.dir, "Log out").feature, /^Log out/);
    const cli = spawnSync("node", [SCRIPT, "--project", r.dir, "--feature", "F-002"], { encoding: "utf8" });
    assert.equal(cli.status, 0);
    assert.match(cli.stdout, /Feature "Log out.*no gaps against the approved plan/);
    assert.match(featureGaps(r.dir, "F-099").notes[0], /No feature "F-099"/);
  } finally {
    r.cleanup();
  }
});

test("a feature's gaps are its own: a criterion lost while building it, a skipped test, a shared test", () => {
  const lost = built()
    .replace("  - [x] The 6th wrong password in a minute is refused → test: test/auth.test.js::locks after five tries\n", "")
    .replace("test/auth.test.js::logs out", "test/auth.test.js::signs up a visitor");
  const r = setup(lost, TESTS.replace('test("signs up a visitor"', 'test.skip("signs up a visitor"'));
  try {
    const one = featureGaps(r.dir, "F-001");
    assert.deepEqual(one.gaps.map((g) => g.kind).sort(), ["dropped", "skipped"]);
    assert.match(one.gaps.find((g) => g.kind === "dropped").text, /6th wrong password/);
    // the shared test spans two features, so each feature alone cites it once; the milestone check sees it
    assert.ok(!featureGaps(r.dir, "F-002").gaps.some((g) => g.kind === "shared"));
    assert.ok(milestoneGaps(r.dir).gaps.some((g) => g.kind === "shared"));
    const cli = spawnSync("node", [SCRIPT, "--project", r.dir, "--feature", "F-001"], { encoding: "utf8" });
    assert.equal(cli.status, 1);
    assert.match(cli.stdout, /DROPPED: .*\n- SKIPPED: /);
  } finally {
    r.cleanup();
  }
});

test("a feature added after the plan was approved is checked for proof but not for dropped items", () => {
  const r = setup(built(`- [x] Fix: lockout message [S] — from the user tester {#F-009} (merged abc1234)\n  - [x] It says when to try again → test: test/auth.test.js::locks after five tries\n`));
  try {
    const g = featureGaps(r.dir, "F-009");
    assert.deepEqual(g.gaps, []);
    assert.match(g.notes.join(" "), /added after the plan was approved/);
  } finally {
    r.cleanup();
  }
});

test("parseRoadmap reads features, tags, proofs and acceptance", () => {
  const ms = parseRoadmap(built().replace("Accepted: pending", 'Accepted: yes (2026-11-26) — owner said: "good"'));
  assert.equal(ms.length, 2);
  assert.equal(ms[0].accepted, true);
  assert.equal(ms[0].features[0].highRisk, true);
  assert.deepEqual(ms[0].features[0].criteria[0].test, { file: "test/auth.test.js", name: "signs up a visitor" });
  assert.equal(ms[0].features[2].criteria[0].manual, true);
});
