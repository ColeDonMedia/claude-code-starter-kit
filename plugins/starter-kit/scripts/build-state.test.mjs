// Tests for the build state (scripts/build-state.mjs). Run: node --test plugins/starter-kit/scripts/build-state.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clearState, cutOffLine, plan, readState, resumeBrief, sameItem, setFields, statePath } from "./build-state.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "build-state.mjs");
const data = mkdtempSync(join(tmpdir(), "state-data-"));
process.env.KIT_DATA_DIR = data;
test.after(() => rmSync(data, { recursive: true, force: true }));

function repo() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "state-repo-")));
  const git = (...a) => spawnSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@example.com", ...a], { encoding: "utf8" });
  git("init", "-q", "-b", "main");
  writeFileSync(join(dir, "a.txt"), "a\n");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
  return { dir, git, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test("the state is kept outside the project, set field by field, and a new item starts fresh", () => {
  const r = repo();
  try {
    setFields(r.dir, ["item=Recipe search [S]", "stage=brief", "main=main", "base=abc1234"]);
    setFields(r.dir, ["stage=review", "round=2", "reviewed.reviewer=def5678"]);
    const s = readState(r.dir);
    assert.equal(s.stage, "review");
    assert.equal(s.round, 2);
    assert.deepEqual(s.reviewed, { reviewer: "def5678" });
    assert.ok(statePath(r.dir).startsWith(data), "never inside the project");
    assert.ok(!existsSync(join(r.dir, ".claude")));
    assert.equal(r.git("status", "--porcelain").stdout, "", "the main checkout stays clean");
    setFields(r.dir, ["item=Card payments [L]"]);
    assert.deepEqual(Object.keys(readState(r.dir)).sort(), ["item", "started", "updated"]);
    assert.throws(() => setFields(r.dir, ["colour=blue"]), /unknown field/);
    assert.throws(() => setFields(r.dir, ["stage=shipping"]), /unknown stage/);
    assert.throws(() => setFields(r.dir, ["oops"]), /not key=value/);
  } finally {
    clearState(r.dir);
    r.done();
  }
});

test("plan: start, resume the same item, leave another item alone, and run here when fresh context is off", () => {
  const r = repo();
  try {
    assert.deepEqual(plan(r.dir, "recipe search"), { action: "start", runIn: "conductor", other: null });
    setFields(r.dir, ["item=Recipe search [S] — find recipes by name", "stage=review"]);
    assert.equal(plan(r.dir, "the recipe search feature").action, "resume");
    assert.equal(plan(r.dir, "").action, "resume", "no feature named: resume what was cut off");
    const other = plan(r.dir, "card payments checkout");
    assert.equal(other.action, "start");
    assert.match(other.other.item, /Recipe search/);
    assert.equal(plan(r.dir, "recipe search", { freshContext: false }).runIn, "here");
    setFields(r.dir, ["stage=done"]);
    assert.equal(plan(r.dir, "recipe search").action, "start");
    assert.ok(sameItem("Recipe search [S]", "recipe search page") && !sameItem("Recipe search", "card payments"));
  } finally {
    clearState(r.dir);
    r.done();
  }
});

test("resume trusts git: uncommitted work in the worktree is shown, a missing branch makes the state stale", () => {
  const r = repo();
  const wt = join(dirname(r.dir), `${r.dir.split(/[\\/]/).pop()}-wt`);
  try {
    r.git("worktree", "add", "-q", "-b", "feature/search", wt);
    writeFileSync(join(wt, "search.js"), "half done\n");
    setFields(r.dir, ["item=Recipe search", "stage=build", "branch=feature/search", `worktree=${wt}`, "builder=sonnet", "question=Which sort order?"]);
    const brief = resumeBrief(r.dir);
    assert.match(brief, /Stage: build/);
    assert.match(brief, /Uncommitted in the worktree[\s\S]*search\.js/);
    assert.match(brief, /Waiting for the owner: Which sort order\?/);
    assert.match(brief, /Next: Message the builder/);
    assert.match(cutOffLine(r.dir), /^BUILD CUT OFF: "Recipe search" stopped at build \(waiting for the owner's answer\)/);
    r.git("worktree", "remove", "--force", wt);
    assert.match(resumeBrief(r.dir), /worktree is gone but the branch exists/);
    r.git("branch", "-D", "feature/search");
    assert.match(resumeBrief(r.dir), /^STALE: the branch "feature\/search"/);
    assert.equal(readState(r.dir), null, "a stale state is cleared");
    assert.equal(cutOffLine(r.dir), null);
  } finally {
    clearState(r.dir);
    rmSync(wt, { recursive: true, force: true });
    r.done();
  }
});

test("after the merge a deleted branch is expected, not stale", () => {
  const r = repo();
  try {
    setFields(r.dir, ["item=Recipe search", "stage=records", "branch=feature/gone", "lastGood=abc1234"]);
    const brief = resumeBrief(r.dir);
    assert.match(brief, /Stage: records/);
    assert.match(brief, /Next: Write the records/);
  } finally {
    clearState(r.dir);
    r.done();
  }
});

test("the command line: --plan prints one decision, a project switch keeps the old flow, --clear clears", () => {
  const r = repo();
  const run = (...a) => spawnSync(process.execPath, [SCRIPT, "--project", r.dir, ...a], { encoding: "utf8", env: { ...process.env, KIT_DATA_DIR: data } });
  try {
    assert.match(run("--plan", "--feature", "recipe search").stdout, /^START — RUN IN conductor/);
    run("--set", "item=Recipe search", "stage=merge");
    assert.match(run("--plan", "--feature", "recipe search").stdout, /^RESUME at merge \("Recipe search"\) — RUN IN conductor/);
    assert.match(run("--plan", "--feature", "dark mode").stdout, /NOTE: "Recipe search" was cut off at merge/);
    mkdirSync(join(r.dir, ".claude"), { recursive: true });
    writeFileSync(join(r.dir, ".claude", "kit.json"), JSON.stringify({ freshContext: false }));
    assert.match(run("--plan").stdout, /RUN HERE/);
    assert.equal(run("--set", "stage=nowhere").status, 1);
    assert.match(run("--clear").stdout, /cleared/);
    assert.equal(readdirSync(join(data, "state")).length, 0);
  } finally {
    r.done();
  }
});
