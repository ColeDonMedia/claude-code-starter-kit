// Tests for worth-it.mjs: is a feature that keeps failing review still worth another round?
// Run: node --test plugins/starter-kit/scripts/worth-it.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { assignRounds, judge, summarize, tokensByRound, worthIt } from "./worth-it.mjs";
import { readState, setFields } from "./build-state.mjs";

const data = mkdtempSync(join(tmpdir(), "worth-data-"));
process.env.KIT_DATA_DIR = data;
test.after(() => rmSync(data, { recursive: true, force: true }));

const c = (subject, files, lines = 10, sha = subject) => ({ sha, t: "", subject, files, added: lines, removed: 0 });

test("without recorded rounds, commits are grouped by their own wording (trial 3's pattern)", () => {
  const got = assignRounds([
    c("Add the skeleton", ["src/a.js"]),
    c("Red-team F-001 round 1: failing tests for floods", ["e2e/rt.spec.ts"]),
    c("Count attempts before the check", ["src/limiter.js"]),
    c("Red-team F-001 round 4: failing tests for the queue", ["e2e/rt.spec.ts"]),
    c("Cap the bucket (round-5 item 2)", ["src/limiter.js"]),
    c("Own age queue (round-6 item 2)", ["src/limiter.js"]),
  ]).map((x) => x.round);
  assert.deepEqual(got, [1, 2, 2, 5, 5, 6]);
});

test("with recorded round starts, a commit belongs to the round open when it was made", () => {
  const got = assignRounds([c("a", [], 1, "s1"), c("b", [], 1, "s2"), c("c", [], 1, "s3"), c("d", [], 1, "s4")], [{ n: 2, head: "s2" }, { n: 3, head: "s3" }]).map((x) => x.round);
  assert.deepEqual(got, [1, 1, 2, 3]);
});

const rounds = (spec) => summarize(spec.flatMap(([n, list]) => list.map((x) => ({ ...x, round: n }))));

test("findings that keep shrinking: keep going", () => {
  const j = judge(rounds([[1, [c("build", ["src/a.js", "src/b.js"], 2000)]], [2, [c("fix sessions", ["src/a.js", "src/b.js"], 400)]], [3, [c("fix a typo", ["src/a.js"], 60)]]]));
  assert.equal(j.pick, "KEEP GOING");
  assert.match(j.reasons[0], /much smaller/);
});

test("the same area dug deeper round after round: accept the rest", () => {
  const j = judge(rounds([
    [1, [c("build", ["src/limiter.js", "src/app.js"], 3000)]],
    [2, [c("limiter counts before check", ["src/limiter.js"], 300)]],
    [3, [c("limiter overflow bucket", ["src/limiter.js"], 300)]],
    [4, [c("limiter lanes for floods", ["src/limiter.js", "src/hooks.js"], 320)]],
  ]));
  assert.equal(j.pick, "ACCEPT THE REST");
  assert.ok(j.reasons.some((r) => /dug deeper/.test(r)));
  assert.deepEqual(j.theme.slice(0, 1), ["limiter"]);
});

test("fixes spreading to new files and outgrowing the build: start smaller", () => {
  const j = judge(rounds([
    [1, [c("build", ["src/a.js"], 500)]],
    [2, [c("rework payments", ["src/pay.js", "src/cart.js"], 400)]],
    [3, [c("rework emails", ["src/mail.js", "src/queue.js"], 500)]],
  ]));
  assert.equal(j.pick, "START SMALLER");
  assert.ok(j.reasons.some((r) => /larger than the original build/.test(r)));
});

test("too few rounds is not judged", () => {
  assert.equal(judge(rounds([[1, [c("build", ["a"], 9)]]])).pick, "KEEP GOING");
});

test("tokens per round are the growth of each agent's running total inside the round", () => {
  const ev = [
    { ev: "use", aid: "b", t: "2026-11-26T09:00:00Z", out: 100, inp: 10, cw: 0 },
    { ev: "use", aid: "b", t: "2026-11-26T10:30:00Z", out: 160, inp: 20, cw: 5 },
    { ev: "use", aid: "r", t: "2026-11-26T10:40:00Z", out: 30, inp: 3, cw: 0 },
    { ev: "use", aid: "b", t: "2026-11-26T11:30:00Z", out: 200, inp: 25, cw: 5 },
  ];
  const t = tokensByRound(ev, [{ n: 1, t: "2026-11-26T08:00:00Z" }, { n: 2, t: "2026-11-26T10:00:00Z" }, { n: 3, t: "2026-11-26T11:00:00Z" }]);
  assert.deepEqual(t.get(1), { out: 100, fresh: 10 });
  assert.deepEqual(t.get(2), { out: 90, fresh: 18 });
  assert.deepEqual(t.get(3), { out: 40, fresh: 5 });
  assert.equal(tokensByRound([], []), null);
});

test("end to end: the build state records each round's start, and the report reads the branch", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "worth-")));
  const g = (...a) => spawnSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", ...a], { encoding: "utf8" });
  const put = (rel, body) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body); };
  const commit = (m) => { g("add", "-A"); g("commit", "-q", "-m", m); };
  try {
    g("init", "-q", "-b", "main");
    put("README.md", "x\n");
    commit("start");
    const base = g("rev-parse", "HEAD").stdout.trim();
    g("checkout", "-q", "-b", "feat");
    put("src/limiter.js", "a\n".repeat(400));
    put("src/app.js", "b\n".repeat(400));
    commit("build");
    setFields(dir, ["item=F-001 Sign in", "stage=review", `base=${base}`, "branch=feat", "builder=opus", "round=2"]);
    put("src/limiter.js", "a\n".repeat(300) + "c\n".repeat(60));
    commit("limiter: count before check");
    setFields(dir, ["round=3"]);
    put("src/limiter.js", "a\n".repeat(300) + "d\n".repeat(60));
    commit("limiter: overflow bucket");
    setFields(dir, ["round=4"]);
    put("src/limiter.js", "a\n".repeat(300) + "e\n".repeat(60));
    commit("limiter: lanes");
    setFields(dir, ["round=4"]); // setting the same round again records nothing new
    assert.deepEqual(readState(dir).rounds.map((r) => r.n), [2, 3, 4]);
    assert.ok(readState(dir).rounds.every((r) => /^[0-9a-f]{40}$/.test(r.head) && r.t));
    const w = worthIt(dir);
    assert.equal(w.rounds, 4);
    assert.match(w.text, /^WORTH IT\? "F-001 Sign in": review round 4, builder on opus\./);
    assert.match(w.text, /Round 1 \(the build\): 1 commit\(s\), 800 lines changed/);
    assert.match(w.text, /Tokens per round: not recorded/);
    assert.equal(w.pick, "ACCEPT THE REST");
    assert.match(w.text, /RECOMMEND: ACCEPT THE REST: .*\nThe other choices: KEEP GOING/);
    setFields(dir, ["item=F-002 Other"]); // a new item starts a fresh state with no rounds
    assert.equal(readState(dir).rounds, undefined);
    assert.match(worthIt(dir).text, /not recorded, so its rounds cannot be read/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
