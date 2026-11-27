// Tests for wait-agent.mjs: the conductor waits for its builder without ending its turn (trial 3 ended it twice).
// Run: node --test plugins/starter-kit/scripts/wait-agent.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { snapshot, waitFor } from "./wait-agent.mjs";

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "wait-"));
  const g = (...a) => spawnSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", ...a], { encoding: "utf8" });
  g("init", "-q");
  writeFileSync(join(dir, "a.txt"), "a\n");
  g("add", "-A");
  g("commit", "-q", "-m", "one");
  return { dir, g, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test("it returns once the builder has committed and left its folder clean", async () => {
  const r = repo();
  try {
    assert.deepEqual(Object.keys(snapshot(r.dir)), ["head", "changed"]);
    setTimeout(() => {
      writeFileSync(join(r.dir, "b.txt"), "b\n");
      r.g("add", "-A");
      r.g("commit", "-q", "-m", "fix");
    }, 50);
    // A wide window: it returns as soon as it sees the commit, and git calls are slow when the whole suite runs at once.
    const out = await waitFor(r.dir, { minutes: 1, everyMs: 100 });
    assert.equal(out.kind, "committed", out.text);
    assert.match(out.text, /BUILDER COMMITTED [0-9a-f]{7}/);
  } finally {
    r.done();
  }
});

test("while the builder is still working it says so and tells the conductor not to stop", async () => {
  const r = repo();
  try {
    writeFileSync(join(r.dir, "half.txt"), "work in progress\n");
    const out = await waitFor(r.dir, { minutes: 0.01, everyMs: 100 });
    assert.equal(out.kind, "working");
    assert.match(out.text, /\(none new\), 1 file\(s\) changed\. Run this again; do not end your turn\./);
    assert.equal((await waitFor(join(r.dir, "nope"), { minutes: 0.01 })).kind, "missing");
  } finally {
    r.done();
  }
});
