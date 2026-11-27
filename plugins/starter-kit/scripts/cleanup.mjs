// Removes the finished build folders (git worktrees) and branches the kit's agents leave behind, once their work is in main.
//   node cleanup.mjs --project <dir> [--dry-run]
// Trial 3 left six worktrees after its first feature, each with its own copy of the dependencies. A worktree goes only when:
//   - it is not the main checkout, and Claude Code has not locked it (an agent is still working in it)
//   - it has no unsaved or untracked changes (`git worktree remove` without --force refuses otherwise anyway)
//   - every commit on it is already in the current branch: merged, or the same change applied there (git cherry finds no
//     missing patch). Red-team branches are usually the second kind: their tests are copied into the feature, not merged.
// Its branch is deleted only under the same rule, and only branches the kit's agents create (they have a worktree under
// .claude/worktrees/, or a name starting worktree-agent-, redteam or red-team). Anything else is kept and listed with the reason.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";

const git = (cwd, ...a) => spawnSync("git", ["-C", cwd, ...a], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const norm = (p) => resolve(p).replace(/\\/g, "/").toLowerCase();

export function worktrees(root) {
  const out = git(root, "worktree", "list", "--porcelain").stdout ?? "";
  return out.split(/\r?\n\r?\n/).filter(Boolean).map((block) => {
    const w = {};
    for (const line of block.split(/\r?\n/)) {
      const [k, ...v] = line.split(" ");
      w[k] = v.join(" ") || true;
    }
    return { path: w.worktree, head: w.HEAD, branch: typeof w.branch === "string" ? w.branch.replace(/^refs\/heads\//, "") : null, locked: Boolean(w.locked) };
  });
}

// Is every commit on `ref` already in HEAD (merged, or the same patch applied)?
export function contained(root, ref) {
  if (git(root, "merge-base", "--is-ancestor", ref, "HEAD").status === 0) return true;
  const r = git(root, "cherry", "HEAD", ref);
  return r.status === 0 && !r.stdout.split("\n").some((l) => l.startsWith("+"));
}

const KIT_BRANCH = /^(worktree-agent-|redteam|red-team)/i;

export function cleanup(root, { dryRun = false } = {}) {
  const removed = [];
  const kept = [];
  const current = git(root, "branch", "--show-current").stdout.trim();
  const main = norm(git(root, "rev-parse", "--show-toplevel").stdout.trim() || root);
  const kitTrees = new Set();
  const freed = new Set(); // branches whose worktree goes (in a dry run: would go)
  for (const w of worktrees(root)) {
    if (!w.path || norm(w.path) === main) continue;
    const kitMade = /\/\.claude\/worktrees\//i.test(w.path.replace(/\\/g, "/"));
    if (kitMade && w.branch) kitTrees.add(w.branch);
    const label = `${w.path}${w.branch ? ` (${w.branch})` : ""}`;
    if (w.locked) { kept.push(`${label}: an agent is still working in it`); continue; }
    if (!existsSync(w.path)) { if (!dryRun) git(root, "worktree", "prune"); removed.push(`${label}: folder already gone, record pruned`); continue; }
    if ((git(w.path, "status", "--porcelain").stdout ?? "").trim()) { kept.push(`${label}: has unsaved changes`); continue; }
    if (!contained(root, w.head)) { kept.push(`${label}: has commits that are not in ${current || "the current branch"}`); continue; }
    if (!dryRun) {
      const r = git(root, "worktree", "remove", w.path);
      if (r.status !== 0) { kept.push(`${label}: git refused (${(r.stderr || "").trim().split("\n")[0]})`); continue; }
    }
    removed.push(label);
    if (w.branch) freed.add(w.branch);
  }
  // Branches: the kit's own ones, not checked out anywhere, whose work is all in the current branch.
  const inUse = new Set(worktrees(root).map((w) => w.branch).filter((b) => b && !freed.has(b)));
  const branches = (git(root, "for-each-ref", "--format=%(refname:short)", "refs/heads").stdout ?? "").split("\n").filter(Boolean);
  for (const b of branches) {
    if (b === current || inUse.has(b) || !(KIT_BRANCH.test(b) || kitTrees.has(b))) continue;
    if (!contained(root, b)) { kept.push(`branch ${b}: has commits that are not in ${current || "the current branch"}`); continue; }
    if (!dryRun) {
      // -D is needed for a branch whose changes were applied rather than merged; contained() has just shown nothing is lost.
      const r = git(root, "branch", "-D", b);
      if (r.status !== 0) { kept.push(`branch ${b}: git refused (${(r.stderr || "").trim().split("\n")[0]})`); continue; }
    }
    removed.push(`branch ${b}`);
  }
  return { removed, kept };
}

if (process.argv[1] && basename(process.argv[1]) === "cleanup.mjs") {
  const i = process.argv.indexOf("--project");
  const root = resolve(i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : process.cwd());
  const dryRun = process.argv.includes("--dry-run");
  const { removed, kept } = cleanup(root, { dryRun });
  console.log(`${dryRun ? "Would remove" : "Removed"}: ${removed.length ? `\n- ${removed.join("\n- ")}` : "nothing"}`);
  if (kept.length) console.log(`Kept:\n- ${kept.join("\n- ")}`);
}
