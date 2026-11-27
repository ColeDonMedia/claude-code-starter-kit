// Snapshots: a way back after a wrong "yes". Before the safety guard asks about a risky command (deleting code, a hard reset,
// discarding changes, dropping a stash or branch, destructive SQL), it saves:
//  - the working copy as it is, unsaved and new files included, as a commit under refs/kit-snapshots/ in the project's own
//    .git. It is built in a separate index, so the branch, the staged files and the working copy are never touched; ignored
//    files (.env, packages, build output) are never included; refs outside refs/heads and refs/tags are never pushed.
//  - the tip of a branch about to be deleted, and every stash entry, under the same prefix.
//  - for database commands, a copy of each local SQLite database file in .claude/backups/<time>/ (a folder that ignores itself).
// The newest 20 snapshots and 10 database copies are kept. Everything here stays on this computer.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const PREFIX = "refs/kit-snapshots/";
const KEEP = 20;
const KEEP_DB = 10;
const DB_FILE = /\.(db|sqlite|sqlite3|db3)$/i;
const DB_MAX = 500 * 1024 * 1024;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".svelte-kit", ".next", "target", "vendor", ".venv", "venv", ".claude"]);

function git(dir, args, env, input) {
  const r = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8", input, env: env ? { ...process.env, ...env } : process.env, maxBuffer: 1 << 26, timeout: 20_000 });
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}

export function repoRoot(dir) {
  const r = git(dir, ["rev-parse", "--show-toplevel"]);
  return r.ok ? resolve(r.out) : null;
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z").replace("T", "-");
const slug = (s) => String(s).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "snapshot";

// Save the working copy. Returns { id, ref, commit } or null when this is not a git project or git refuses.
// Kept to a handful of git calls: the guard runs this while the person waits for its question.
export function saveSnapshot(dir, reason, { branches = [], stashes = false } = {}) {
  const info = git(dir, ["rev-parse", "--show-toplevel", "--absolute-git-dir"]);
  if (!info.ok) return null;
  const [top, gitDir] = info.out.split(/\r?\n/);
  const root = resolve(top);
  const index = join(gitDir, `kit-snapshot-index-${process.pid}`);
  const env = { GIT_INDEX_FILE: index };
  try {
    rmSync(index, { force: true });
    if (!git(root, ["add", "-A", "--", "."], env).ok) return null;
    const tree = git(root, ["write-tree"], env);
    if (!tree.ok) return null;
    const head = git(root, ["rev-parse", "--verify", "-q", "HEAD"]);
    const args = ["-c", "user.name=starter-kit", "-c", "user.email=snapshot@starter-kit.invalid", "commit-tree", tree.out, "-m", `kit snapshot: ${reason}`];
    if (head.ok) args.push("-p", head.out);
    const commit = git(root, args);
    if (!commit.ok) return null;
    const id = `${stamp()}-${randomBytes(2).toString("hex")}-${slug(reason)}`;
    const updates = [`create ${PREFIX}${id} ${commit.out}`];
    if (branches.length) {
      const tips = git(root, ["rev-parse", ...branches.map((b) => `refs/heads/${b}`)]);
      tips.out.split(/\r?\n/).forEach((sha, i) => /^[0-9a-f]{40,64}$/.test(sha) && updates.push(`create ${PREFIX}${id}-branch-${slug(branches[i])} ${sha}`));
    }
    if (stashes) git(root, ["stash", "list", "--format=%H"]).out.split(/\r?\n/).filter(Boolean).forEach((h, i) => updates.push(`create ${PREFIX}${id}-stash-${i} ${h}`));
    git(root, ["update-ref", "--stdin"], undefined, `${updates.join("\n")}\n`);
    prune(root);
    return { id, ref: `${PREFIX}${id}`, commit: commit.out };
  } finally {
    rmSync(index, { force: true });
  }
}

// Working-copy snapshots, newest first: [{ id, ref, time, reason }]. Branch and stash refs ride along with their snapshot.
export function listSnapshots(dir) {
  const root = repoRoot(dir);
  if (!root) return [];
  const r = git(root, ["for-each-ref", "--sort=-creatordate", "--format=%(refname)%09%(creatordate:iso)%09%(contents:subject)", PREFIX]);
  if (!r.ok || !r.out) return [];
  return r.out
    .split("\n")
    .map((l) => l.split("\t"))
    .filter(([ref, , subject]) => subject?.startsWith("kit snapshot:") && !/-(branch|stash)-/.test(ref.slice(PREFIX.length)))
    .map(([ref, time, subject]) => ({ id: ref.slice(PREFIX.length), ref, time, reason: subject.replace(/^kit snapshot:\s*/, "") }));
}

function prune(root) {
  const all = git(root, ["for-each-ref", "--sort=-creatordate", "--format=%(refname)", PREFIX]).out.split("\n").filter(Boolean);
  const main = all.filter((r) => !/-(branch|stash)-[^/]*$/.test(r));
  const drop = [];
  for (const old of main.slice(KEEP)) {
    const base = old.slice(PREFIX.length);
    for (const r of all) if (r === old || r.startsWith(`${PREFIX}${base}-branch-`) || r.startsWith(`${PREFIX}${base}-stash-`)) drop.push(`delete ${r}`);
  }
  if (drop.length) git(root, ["update-ref", "--stdin"], undefined, drop.join("\n") + "\n");
}

// Put the snapshot's files back (all of them, or one path). The current state is saved first, so a restore can be undone.
// Files created after the snapshot are left alone; nothing is deleted.
export function restoreSnapshot(dir, id, path = ".") {
  const root = repoRoot(dir);
  if (!root) throw new Error("not a git project");
  const ref = id.startsWith(PREFIX) ? id : `${PREFIX}${id}`;
  if (!git(root, ["rev-parse", "--verify", "-q", ref]).ok) throw new Error(`no snapshot called ${id}`);
  saveSnapshot(root, `before restoring ${id}`);
  const tmp = join(git(root, ["rev-parse", "--absolute-git-dir"]).out, "kit-restore-index");
  try {
    const env = { GIT_INDEX_FILE: tmp };
    git(root, ["read-tree", ref], env);
    let files = [];
    if (path !== ".") {
      const rel = relative(root, resolve(root, path)).split(sep).join("/");
      files = git(root, ["ls-tree", "-r", "--name-only", ref, "--", rel]).out.split("\n").filter(Boolean);
      if (!files.length) throw new Error(`${path} is not in snapshot ${id}`);
    }
    const r = git(root, ["checkout-index", "-f", ...(files.length ? ["--", ...files] : ["-a"])], env);
    if (!r.ok) throw new Error(r.err);
  } finally {
    rmSync(tmp, { force: true });
  }
  return ref;
}

// ---------- database copies ----------
function findDbFiles(root, hint = []) {
  const out = new Set();
  for (const h of hint) {
    const f = resolve(root, h);
    if (DB_FILE.test(f) && existsSync(f) && statSync(f).isFile()) out.add(f);
  }
  const walk = (d, depth) => {
    if (depth > 3) return;
    let entries = [];
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(join(d, e.name), depth + 1);
      } else if (e.isFile() && DB_FILE.test(e.name)) out.add(join(d, e.name));
    }
  };
  walk(root, 0);
  return [...out].filter((f) => statSync(f).size <= DB_MAX);
}

// Copy local SQLite files (and their -wal/-shm companions) into .claude/backups/<time>/. Returns the copied paths.
export function backupDatabases(dir, hint = []) {
  const root = repoRoot(dir) ?? resolve(dir);
  const files = findDbFiles(root, hint);
  if (!files.length) return [];
  const base = join(root, ".claude", "backups");
  mkdirSync(base, { recursive: true });
  writeFileSync(join(base, ".gitignore"), "*\n");
  const dest = join(base, stamp());
  const copied = [];
  for (const f of files) {
    const rel = relative(root, f);
    if (rel.startsWith("..")) continue;
    for (const extra of ["", "-wal", "-shm"]) {
      if (!existsSync(f + extra)) continue;
      const to = join(dest, rel + extra);
      mkdirSync(join(to, ".."), { recursive: true });
      copyFileSync(f + extra, to);
    }
    copied.push(rel.split(sep).join("/"));
  }
  const runs = readdirSync(base).filter((n) => n !== ".gitignore").sort();
  for (const old of runs.slice(0, Math.max(0, runs.length - KEEP_DB))) rmSync(join(base, old), { recursive: true, force: true });
  return copied;
}
