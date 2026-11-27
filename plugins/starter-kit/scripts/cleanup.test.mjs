// Tests for cleanup.mjs: finished build folders and branches go, anything with unsaved or unmerged work stays.
// Run: node --test plugins/starter-kit/scripts/cleanup.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanup } from "./cleanup.mjs";

function repo() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "clean-")));
  const g = (cwd, ...a) => spawnSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@example.com", ...a], { encoding: "utf8" });
  g(dir, "init", "-q", "-b", "main");
  writeFileSync(join(dir, "a.txt"), "a\n");
  g(dir, "add", "-A");
  g(dir, "commit", "-q", "-m", "start");
  const tree = (name) => {
    const p = join(dir, ".claude", "worktrees", name);
    g(dir, "worktree", "add", "-q", "-b", name, p);
    return p;
  };
  const commit = (cwd, file, msg) => (writeFileSync(join(cwd, file), `${msg}\n`), g(cwd, "add", "-A"), g(cwd, "commit", "-q", "-m", msg));
  return { dir, g, tree, commit, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test("merged and copied-over work is removed; unsaved, unmerged and other people's branches stay", () => {
  const r = repo();
  try {
    const merged = r.tree("worktree-agent-merged");
    r.commit(merged, "b.txt", "feature");
    r.g(r.dir, "merge", "-q", "--no-ff", "worktree-agent-merged", "-m", "merge");
    const copied = r.tree("redteam-f001-r1"); // a red-team test copied into main, not merged
    r.commit(copied, "rt.txt", "failing test");
    r.g(r.dir, "cherry-pick", "redteam-f001-r1");
    const dirty = r.tree("worktree-agent-dirty");
    writeFileSync(join(dirty, "wip.txt"), "unsaved\n");
    const open = r.tree("worktree-agent-open");
    r.commit(open, "c.txt", "not merged");
    r.g(r.dir, "branch", "owner-experiment"); // the owner's own branch, merged or not, is never the kit's to delete

    const dry = cleanup(r.dir, { dryRun: true });
    assert.ok(existsSync(merged), "a dry run changes nothing");
    const { removed, kept } = cleanup(r.dir);
    assert.deepEqual(removed, dry.removed);
    assert.ok(!existsSync(merged) && !existsSync(copied));
    assert.ok(existsSync(dirty) && existsSync(open));
    assert.ok(removed.includes("branch worktree-agent-merged") && removed.includes("branch redteam-f001-r1"));
    assert.match(kept.join("\n"), /worktree-agent-dirty\): has unsaved changes/);
    assert.match(kept.join("\n"), /worktree-agent-open\): has commits that are not in main/);
    const left = r.g(r.dir, "branch", "--format=%(refname:short)").stdout.split("\n").filter(Boolean).sort();
    assert.deepEqual(left, ["main", "owner-experiment", "worktree-agent-dirty", "worktree-agent-open"]);
  } finally {
    r.done();
  }
});
