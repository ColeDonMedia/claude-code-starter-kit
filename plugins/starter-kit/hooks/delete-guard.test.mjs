// Deleting code and data: the safety guard asks before a delete removes a folder or file that holds code (in Bash and
// PowerShell), lets rebuildable folders and folders with no code go, and before any risky command the snapshot hook
// keeps a snapshot of the unsaved work (and of a stash or branch about to be dropped) and a copy of the local database file,
// so a wrong "yes" can be undone. Run: node --test plugins/starter-kit/hooks/delete-guard.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hookPath } from "../scripts/test-via-gate.mjs";
import { backupDatabases, listSnapshots, restoreSnapshot, saveSnapshot } from "../scripts/snapshot-lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD = hookPath(HERE, "safety-guard.mjs");
const SNAPSHOT = hookPath(HERE, "snapshot-guard.mjs");
const SNAP_CLI = join(HERE, "..", "scripts", "snapshot.mjs");

function makeRepo() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "kit-del-")));
  const files = {
    "src/app.js": "export const a = 1;\n",
    "src/lib/money.js": "export const income = () => 0;\n",
    "docs/guide.md": "# guide\n",
    "README.md": "# app\n",
    ".gitignore": "node_modules\ndist\n.env\n*.db\n.claude/backups\n",
    "data/app.db": "SQLITE FAKE CONTENT",
  };
  for (const [f, t] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), t);
  }
  const git = (...a) => execFileSync("git", ["-C", dir, ...a], { stdio: "pipe", encoding: "utf8" });
  git("init", "-q");
  git("add", "-A");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base");
  // rebuildable and scratch folders, never committed
  for (const f of ["node_modules/x/index.js", "dist/out.js", "scratch/notes.txt"]) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), "x");
  }
  return { dir, git };
}

// The safety guard's answer. With snapshots, the snapshot hook runs on the same command first, as the gate runs both.
function decide(dir, command, tool = "Bash", { snapshots = false } = {}) {
  const run = (hook) =>
    spawnSync("node", [hook], {
      input: JSON.stringify({ tool_name: tool, tool_input: { command }, cwd: dir }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir, KIT_DATA_DIR: dir },
      encoding: "utf8",
    });
  if (snapshots) assert.equal(run(SNAPSHOT).stdout, "", "the snapshot hook never answers or blocks");
  const r = run(GUARD);
  if (!r.stdout) return { d: "allow", reason: "" };
  const o = JSON.parse(r.stdout).hookSpecificOutput;
  return { d: o.permissionDecision, reason: o.permissionDecisionReason };
}

test("deleting a folder or file that holds committed code asks first, in every spelling", () => {
  const { dir } = makeRepo();
  try {
    const bash = ["rm -rf src", "rm -r src/lib", "rm -rf ./src", "rm -rf src/", "rm -rf src/*", "rm -rf docs src", "rm -rf README.md src", `rm -rf "${dir}/src"`, "sudo rm -rf src", "ls && rm -rf src", "bash -c 'rm -rf src'", "find src -delete", "find . -name '*.js' -delete", `node -e "require('fs').rmSync('src',{recursive:true,force:true})"`, `python3 -c "import shutil; shutil.rmtree('src')"`];
    const pwsh = ["Remove-Item -Recurse -Force src", "Remove-Item src -Recurse", "Remove-Item -Path .\\src -Recurse -Force", "ri -r src", "rm -r -fo src", "cmd /c rd /s /q src", "rmdir /s /q src"];
    const got = [...bash.map((c) => [c, decide(dir, c)]), ...pwsh.map((c) => [c, decide(dir, c, "PowerShell")])];
    const missed = got.filter(([, r]) => r.d === "allow").map(([c]) => c);
    assert.deepEqual(missed, [], `allowed without asking: ${missed.join(" | ")}`);
    assert.match(decide(dir, "rm -rf src").reason, /rm-code/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rebuildable folders, untracked scratch and paths that don't exist are deleted without asking", () => {
  const { dir } = makeRepo();
  try {
    const ok = ["rm -rf node_modules", "rm -rf dist", "rm -rf scratch", "rm -rf no-such-folder", "rm -f src/app.js.bak", "Remove-Item -Recurse -Force node_modules", "rm -rf /tmp/kit-build-xyz", "rm -rf .svelte-kit build coverage"];
    const asked = ok.filter((c) => decide(dir, c, c.startsWith("Remove-Item") ? "PowerShell" : "Bash").d !== "allow");
    assert.deepEqual(asked, [], `asked for: ${asked.join(" | ")}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("deleting a folder with unsaved, never-committed code asks first", () => {
  const { dir } = makeRepo();
  try {
    mkdirSync(join(dir, "src", "new-feature"));
    writeFileSync(join(dir, "src", "new-feature", "draft.js"), "export const draft = true;\n");
    mkdirSync(join(dir, "fresh"));
    writeFileSync(join(dir, "fresh", "work.js"), "x");
    assert.notEqual(decide(dir, "rm -rf src/new-feature").d, "allow");
    assert.match(decide(dir, "rm -rf src/new-feature").reason, /DELETES CODE.*draft.js/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("before a risky command is asked, a snapshot of the unsaved work is saved and can be restored", () => {
  const { dir } = makeRepo();
  try {
    writeFileSync(join(dir, "src", "app.js"), "export const a = 2; // unsaved edit\n");
    writeFileSync(join(dir, "src", "brand-new.js"), "export const n = 1;\n");
    const r = decide(dir, "git reset --hard", "Bash", { snapshots: true });
    assert.equal(r.d, "ask");
    assert.match(r.reason, /snapshot/i);
    const snaps = listSnapshots(dir);
    assert.equal(snaps.length, 1);
    assert.match(snaps[0].reason, /git reset --hard/);
    // the worst happens
    execFileSync("git", ["-C", dir, "reset", "-q", "--hard"]);
    rmSync(join(dir, "src", "brand-new.js"));
    const text = () => readFileSync(join(dir, "src", "app.js"), "utf8").replace(/\r\n/g, "\n"); // git may write Windows line ends
    assert.equal(text(), "export const a = 1;\n");
    restoreSnapshot(dir, snaps[0].id);
    assert.equal(text(), "export const a = 2; // unsaved edit\n");
    assert.ok(existsSync(join(dir, "src", "brand-new.js")));
    // restoring first saved the state it replaced
    assert.equal(listSnapshots(dir).length, 2);
    // the snapshot never includes ignored files (secrets, packages) and never touches the branch
    writeFileSync(join(dir, ".env"), "SECRET=1");
    const s = saveSnapshot(dir, "test");
    const tree = execFileSync("git", ["-C", dir, "ls-tree", "-r", "--name-only", s.ref], { encoding: "utf8" });
    assert.doesNotMatch(tree, /\.env|node_modules|dist\//);
    assert.equal(execFileSync("git", ["-C", dir, "log", "--oneline"], { encoding: "utf8" }).trim().split("\n").length, 1);
    assert.equal(execFileSync("git", ["-C", dir, "status", "--porcelain"], { encoding: "utf8" }).includes("M src/app.js"), true, "the working copy is untouched");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a stash or branch about to be dropped is kept in the snapshot", () => {
  const { dir, git } = makeRepo();
  try {
    writeFileSync(join(dir, "src", "app.js"), "stashed work\n");
    git("stash", "-q");
    git("branch", "experiment");
    git("checkout", "-q", "experiment");
    writeFileSync(join(dir, "src", "exp.js"), "x");
    git("add", "-A");
    git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "exp");
    const expTip = git("rev-parse", "experiment").trim();
    git("checkout", "-q", "-");
    assert.equal(decide(dir, "git stash drop", "Bash", { snapshots: true }).d, "ask");
    assert.equal(decide(dir, "git branch -D experiment", "Bash", { snapshots: true }).d, "ask");
    const refs = git("for-each-ref", "--format=%(objectname) %(refname)", "refs/kit-snapshots/");
    assert.ok(refs.includes(expTip), "the branch tip is kept");
    assert.match(refs, /stash/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("before destructive SQL or a database reset, the local database file is copied", () => {
  const { dir } = makeRepo();
  try {
    assert.equal(decide(dir, "sqlite3 data/app.db 'DROP TABLE users'", "Bash", { snapshots: true }).d, "ask");
    const backups = join(dir, ".claude", "backups");
    const runs = readdirSync(backups).filter((f) => f !== ".gitignore");
    assert.equal(runs.length, 1);
    assert.equal(readFileSync(join(backups, runs[0], "data", "app.db"), "utf8"), "SQLITE FAKE CONTENT");
    assert.equal(readFileSync(join(backups, ".gitignore"), "utf8").trim(), "*", "the backups folder ignores itself");
    const r = decide(dir, "npx prisma migrate reset", "Bash", { snapshots: true });
    assert.match(r.reason, /local database file\) is saved first/);
    assert.equal(readdirSync(backups).filter((f) => f !== ".gitignore").length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("snapshot.mjs lists snapshots in plain words and old ones are pruned", () => {
  const { dir } = makeRepo();
  try {
    for (let i = 0; i < 23; i++) {
      writeFileSync(join(dir, "src", "app.js"), `v${i}\n`);
      saveSnapshot(dir, `edit ${i}`);
    }
    assert.equal(listSnapshots(dir).length, 20, "keeps the newest 20");
    const out = spawnSync(process.execPath, [SNAP_CLI, "--list", "--project", dir], { encoding: "utf8" }).stdout;
    assert.match(out, /edit 22/);
    assert.doesNotMatch(out, /edit 0\b/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("outside a git project, deleting a folder of code asks too; rebuildable folders pass", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "kit-del-nogit-")));
  try {
    mkdirSync(join(dir, "code"));
    writeFileSync(join(dir, "code", "main.c"), "int main(){}");
    assert.notEqual(decide(dir, "rm -rf code").d, "allow");
    assert.equal(decide(dir, "rm -rf node_modules").d, "allow");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the snapshot hook saves before risky commands only, and stays silent", () => {
  const { dir } = makeRepo();
  try {
    for (const c of ["ls", "git status", "rm -rf node_modules dist", "npm test", "git commit -m 'tidy'"]) decide(dir, c, "Bash", { snapshots: true });
    assert.equal(listSnapshots(dir).length, 0, "no snapshot for safe commands");
    decide(dir, "Remove-Item -Recurse -Force src", "PowerShell", { snapshots: true });
    assert.equal(listSnapshots(dir).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("copies and snapshots made in the same second stay separate and in order (fast machines)", () => {
  const { dir } = makeRepo();
  try {
    backupDatabases(dir, ["data/app.db"]);
    backupDatabases(dir, ["data/app.db"]);
    assert.equal(readdirSync(join(dir, ".claude", "backups")).filter((f) => f !== ".gitignore").length, 2, "two copies, two folders");
    for (const n of [1, 2, 3]) {
      writeFileSync(join(dir, "src", "app.js"), `v${n}\n`);
      saveSnapshot(dir, `quick ${n}`);
    }
    assert.deepEqual(listSnapshots(dir).map((s) => s.reason), ["quick 3", "quick 2", "quick 1"], "newest first, even within one second");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
