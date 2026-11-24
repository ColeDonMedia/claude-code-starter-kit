// Tests for test-related.mjs. Run from the repo root:  node --test plugins/starter-kit/hooks
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, readFileSync } from "node:fs";
import { trustEntries, entriesOf } from "../scripts/trust-lib.mjs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "test-related.mjs");

function sandbox() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "kit-hook-")));
  const put = (rel, content = "x") => {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
    return p;
  };
  return { dir, put, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// The hook only runs project commands the user approved on this computer; give the tests their own approval store.
const DATA = realpathSync(mkdtempSync(join(tmpdir(), "kit-trust-")));
process.env.KIT_DATA_DIR = DATA;
test.after(() => rmSync(DATA, { recursive: true, force: true }));

function run(file, projectDir, { trusted = true } = {}) {
  if (trusted) {
    let cfg = {};
    try {
      cfg = JSON.parse(readFileSync(join(projectDir, ".claude", "kit.json"), "utf8"));
    } catch {
      /* no kit.json */
    }
    trustEntries(projectDir, entriesOf(cfg));
  }
  const r = spawnSync("node", [HOOK], {
    input: JSON.stringify({ tool_input: { file_path: file } }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir, KIT_DRY_RUN: "1", KIT_DATA_DIR: DATA },
  });
  return { status: r.status, out: r.stdout.trim(), err: r.stderr.trim() };
}

test("SECURITY: nothing runs until the user has approved the project's commands", () => {
  const s = sandbox();
  try {
    s.put("package.json", '{"devDependencies":{"vitest":"3"}}');
    const f = s.put("src/a.ts");
    assert.equal(run(f, s.dir, { trusted: false }).out, "", "standard runner must wait for approval");
    assert.match(run(f, s.dir).out, /vitest related/, "runs once approved");
    s.put(".claude/kit.json", '{"relatedTests":"echo hostile {file}","extensions":[".ts"]}');
    assert.equal(run(f, s.dir, { trusted: false }).out, "", "a custom command from the project is never run unapproved");
    assert.match(run(f, s.dir).out, /echo hostile/);
    // editing the command voids the approval
    s.put(".claude/kit.json", '{"relatedTests":"echo changed {file}","extensions":[".ts"]}');
    assert.equal(spawnSync("node", [HOOK], { input: JSON.stringify({ tool_input: { file_path: f } }), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: s.dir, KIT_DRY_RUN: "1", KIT_DATA_DIR: DATA } }).stdout.trim(), "");
  } finally {
    s.cleanup();
  }
});

test("ignores files that are not code", () => {
  const s = sandbox();
  try {
    const f = s.put("README.md");
    assert.equal(run(f, s.dir).out, "");
  } finally {
    s.cleanup();
  }
});

test("ignores invalid input", () => {
  const r = spawnSync("node", [HOOK], { input: "garbage", encoding: "utf8" });
  assert.equal(r.status, 0);
});

test("vitest projects use vitest with --no-install", () => {
  const s = sandbox();
  try {
    s.put("package.json", '{"devDependencies":{"vitest":"3"}}');
    const f = s.put("src/a.ts");
    const r = run(f, s.dir);
    assert.match(r.out, /npx --no-install vitest related --run/);
  } finally {
    s.cleanup();
  }
});

test("jest projects use jest with --no-install", () => {
  const s = sandbox();
  try {
    s.put("package.json", '{"devDependencies":{"jest":"29"}}');
    const f = s.put("src/a.js");
    assert.match(run(f, s.dir).out, /npx --no-install jest --findRelatedTests/);
  } finally {
    s.cleanup();
  }
});

test("no known runner means silent", () => {
  const s = sandbox();
  try {
    s.put("package.json", "{}");
    const f = s.put("src/a.js");
    assert.equal(run(f, s.dir).out, "");
  } finally {
    s.cleanup();
  }
});

test("custom runner from .claude/kit.json is used", () => {
  const s = sandbox();
  try {
    s.put(".claude/kit.json", '{"relatedTests":"bundle exec rspec {file}","extensions":[".rb"]}');
    const f = s.put("lib/x.rb");
    assert.match(run(f, s.dir).out, /CMD: bundle exec rspec "/);
    const other = s.put("lib/x.py");
    assert.equal(run(other, s.dir).out, "");
  } finally {
    s.cleanup();
  }
});

test('"relatedTests": false turns the hook off', () => {
  const s = sandbox();
  try {
    s.put(".claude/kit.json", '{"relatedTests":false}');
    s.put("package.json", '{"devDependencies":{"jest":"29"}}');
    const f = s.put("src/a.js");
    assert.equal(run(f, s.dir).out, "");
  } finally {
    s.cleanup();
  }
});

test("python: finds the matching test file", () => {
  const s = sandbox();
  try {
    s.put("pkg/m.py");
    const t = s.put("tests/test_m.py");
    const f = join(s.dir, "pkg", "m.py");
    assert.ok(run(f, s.dir).out.includes(t));
  } finally {
    s.cleanup();
  }
});

test("python: a file edited inside a worktree is tested against the worktree's own test file", () => {
  const s = sandbox();
  try {
    s.put(".git/HEAD", "ref: refs/heads/main");
    s.put("test_m.py");
    s.put(".claude/worktrees/wt1/.git", "gitdir: elsewhere"); // a worktree has a .git *file*
    const wtTest = s.put(".claude/worktrees/wt1/test_m.py");
    const f = s.put(".claude/worktrees/wt1/m.py");
    const r = run(f, s.dir);
    assert.ok(r.out.includes(wtTest), `expected the worktree's test file, got: ${r.out}`);
    assert.ok(!r.out.includes(join(s.dir, "test_m.py")), "must not pick the main checkout's test file");
  } finally {
    s.cleanup();
  }
});

test("go: runs go test in the file's folder", () => {
  const s = sandbox();
  try {
    s.put("go.mod", "module x");
    const f = s.put("pkg/a.go");
    const r = run(f, s.dir);
    assert.match(r.out, /CMD: go test \./);
    assert.ok(r.out.includes(join(s.dir, "pkg")));
  } finally {
    s.cleanup();
  }
});

test("file names with shell metacharacters are skipped", () => {
  const s = sandbox();
  try {
    s.put("package.json", '{"devDependencies":{"jest":"29"}}');
    for (const name of ["a$(echo hi).js", "b`id`.js", "c%PATH%.js"]) {
      const f = s.put(`src/${name}`);
      assert.equal(run(f, s.dir).out, "", `should skip ${name}`);
    }
  } finally {
    s.cleanup();
  }
});

test("windows: a drive-letter case mismatch between project dir and file still works", { skip: process.platform !== "win32" && "windows only" }, () => {
  const s = sandbox();
  try {
    s.put("package.json", '{"devDependencies":{"jest":"29"}}');
    const f = s.put("src/a.js");
    const flipped = s.dir[0] === s.dir[0].toUpperCase() ? s.dir[0].toLowerCase() + s.dir.slice(1) : s.dir[0].toUpperCase() + s.dir.slice(1);
    assert.match(run(f, flipped).out, /jest --findRelatedTests/);
  } finally {
    s.cleanup();
  }
});
