// The build state: where the feature being built stands, so a session that ends, a usage limit, a compaction or a conductor that
// cannot be resumed costs minutes, not the feature. Kept OUTSIDE the project (the kit's data folder), so it is never committed and
// never makes the main checkout "not clean". Git is trusted over this file: --resume checks that the branch and worktree still exist
// and shows what was left uncommitted there. The workflow sets it at each stage boundary.
// Run: node build-state.mjs --project <dir> --set key=value ...  |  --show  |  --clear  |  --plan [--feature "<text>"]  |  --resume
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dataDir, projectKey } from "./trust-lib.mjs";

export const STAGES = ["brief", "build", "review", "merge", "prove", "records", "done"];
const FIELDS = ["item", "stage", "round", "main", "base", "branch", "worktree", "lastGood", "builder", "question"];
const AFTER_MERGE = new Set(["prove", "records", "done"]); // the branch is deleted once merged

export const statePath = (root) => join(dataDir(), "state", createHash("sha1").update(projectKey(root)).digest("hex").slice(0, 12) + ".json");
export function readState(root) {
  try {
    const s = JSON.parse(readFileSync(statePath(root), "utf8"));
    return s && typeof s === "object" ? s : null;
  } catch {
    return null;
  }
}
function writeState(root, s) {
  const p = statePath(root);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ ...s, updated: new Date().toISOString() }, null, 1));
}
export const clearState = (root) => rmSync(statePath(root), { force: true });

const STOP = new Set("the a an and or to of for in on with is are be it its that this user users can add make new page screen feature".split(" "));
const words = (s) => [...new Set((String(s).toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? []).filter((w) => !STOP.has(w)))];
export function sameItem(a, b) {
  const x = words(a);
  const y = words(b);
  return x.length > 0 && y.length > 0 && x.filter((w) => y.includes(w)).length >= Math.min(2, x.length, y.length);
}

// Set fields from "key=value" pairs. A new item starts a fresh state; `reviewed.<agent>=<commit>` records what each reviewer approved.
export function setFields(root, pairs) {
  let s = readState(root) ?? {};
  let newRound = 0;
  for (const pair of pairs) {
    const i = pair.indexOf("=");
    if (i < 1) throw new Error(`not key=value: "${pair}"`);
    const [k, v] = [pair.slice(0, i), pair.slice(i + 1)];
    if (k === "item" && s.item !== v) s = { started: new Date().toISOString() }; // when this item began, for its token count
    if (k.startsWith("reviewed.")) {
      s.reviewed = { ...(s.reviewed ?? {}), [k.slice(9)]: v };
      continue;
    }
    if (!FIELDS.includes(k)) throw new Error(`unknown field "${k}"; fields: ${FIELDS.join(", ")}, reviewed.<agent>`);
    if (k === "stage" && !STAGES.includes(v)) throw new Error(`unknown stage "${v}"; stages: ${STAGES.join(", ")}`);
    s[k] = k === "round" ? Number(v) || 0 : v;
    if (k === "round") newRound = s.round;
  }
  // Each review round's start (the branch tip and the time), so worth-it.mjs can tell what each round cost and changed.
  if (newRound && !(s.rounds ?? []).some((r) => r.n === newRound)) {
    const tip = s.branch ? git(root, "rev-parse", "--verify", "--quiet", `refs/heads/${s.branch}`).stdout.trim() : "";
    s.rounds = [...(s.rounds ?? []), { n: newRound, head: tip || null, t: new Date().toISOString() }];
  }
  writeState(root, s);
  return readState(root);
}

// What the dispatcher does next: start or resume, and whether the workflow runs in a fresh conductor or in the main conversation.
export function plan(root, feature = "", { freshContext = true } = {}) {
  const s = readState(root);
  const runIn = freshContext === false ? "here" : "conductor";
  const open = s && s.stage !== "done" && s.item ? s : null;
  if (open && (!feature || sameItem(open.item, feature))) return { action: "resume", stage: open.stage ?? "brief", item: open.item, runIn };
  return { action: "start", runIn, other: open };
}

const git = (cwd, ...args) => spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
const NEXT = {
  brief: "Write the brief and launch the builder (step 1).",
  build: "Message the builder if it can be resumed; otherwise launch a new implementer in the existing worktree and branch with this state and the brief (step 1).",
  review: "Re-run only the reviewers that have not approved the latest commit (see Reviewed), on the fix only (step 2).",
  merge: "Merge (step 3): first check the main checkout is clean and on the main branch.",
  prove: "Prove it on the merged code (step 4).",
  records: "Write the records (step 4).",
};

// The brief for whoever continues: what git says is really there, not just what the file claims.
export function resumeBrief(root) {
  const s = readState(root);
  if (!s || !s.item) return "No feature build in progress.";
  if (s.stage === "done") return `The last feature ("${s.item}") is done. Nothing to resume.`;
  const out = [`Feature: ${s.item}`, `Stage: ${s.stage ?? "brief"}${s.round ? ` (review round ${s.round})` : ""}`];
  for (const k of ["main", "base", "branch", "worktree", "lastGood", "builder"]) if (s[k]) out.push(`${k[0].toUpperCase() + k.slice(1)}: ${s[k]}`);
  if (s.reviewed) out.push(`Reviewed: ${Object.entries(s.reviewed).map(([a, c]) => `${a} approved ${c}`).join("; ")}`);
  if (s.branch && !AFTER_MERGE.has(s.stage)) {
    if (git(root, "rev-parse", "--verify", "--quiet", `refs/heads/${s.branch}`).status !== 0) {
      clearState(root);
      return `STALE: the branch "${s.branch}" for "${s.item}" no longer exists, so there is nothing to resume. The state was cleared; start the feature again.`;
    }
    // Compare real paths: Windows can name one folder two ways (C:\Users\RUNNER~1 and C:\Users\runneradmin).
    const canon = (p) => {
      try {
        return realpathSync.native(p).toLowerCase();
      } catch {
        return resolve(p).toLowerCase();
      }
    };
    const listed = git(root, "worktree", "list", "--porcelain").stdout.split("\n").filter((l) => l.startsWith("worktree ")).map((l) => canon(l.slice(9)));
    if (s.worktree && listed.includes(canon(s.worktree)) && existsSync(s.worktree)) {
      out.push(`Last commit there: ${git(s.worktree, "log", "-1", "--format=%h %s").stdout.trim()}`);
      const dirty = git(s.worktree, "status", "--porcelain").stdout.split("\n").filter(Boolean);
      out.push(dirty.length ? `Uncommitted in the worktree (finish or discard them; the tests decide):\n${dirty.slice(0, 20).map((l) => `  ${l}`).join("\n")}` : "Nothing uncommitted in the worktree.");
    } else if (s.worktree) out.push("The worktree is gone but the branch exists: make a new worktree for the branch (`git worktree add <path> <branch>`).");
  }
  if (s.question) out.push(`Waiting for the owner: ${s.question}`);
  out.push(`Next: ${NEXT[s.stage ?? "brief"] ?? NEXT.brief}`);
  return out.join("\n");
}

// One line for the session note when a build was cut off, or null.
export function cutOffLine(root) {
  const s = readState(root);
  if (!s || !s.item || s.stage === "done") return null;
  return `BUILD CUT OFF: "${String(s.item).slice(0, 100)}" stopped at ${s.stage ?? "brief"}${s.question ? " (waiting for the owner's answer)" : ""}. /starter-kit:feature resumes it from its last verified step.`;
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === resolve(fileURLToPath(import.meta.url)).toLowerCase()) {
  const a = process.argv.slice(2);
  const get = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : undefined);
  const root = resolve(get("--project") ?? ".");
  try {
    if (a.includes("--set")) {
      const pairs = a.slice(a.indexOf("--set") + 1).filter((x) => !x.startsWith("--"));
      console.log(JSON.stringify(setFields(root, pairs)));
    } else if (a.includes("--show")) console.log(JSON.stringify(readState(root) ?? {}, null, 1));
    else if (a.includes("--clear")) {
      clearState(root);
      console.log("Build state cleared.");
    } else if (a.includes("--plan")) {
      let cfg = {};
      try {
        cfg = JSON.parse(readFileSync(join(root, ".claude", "kit.json"), "utf8"));
      } catch {
        /* defaults */
      }
      const p = plan(root, get("--feature") ?? "", { freshContext: cfg.freshContext });
      console.log(`${p.action === "resume" ? `RESUME at ${p.stage} ("${p.item}")` : "START"} — RUN ${p.runIn === "here" ? "HERE" : "IN conductor"}`);
      if (p.other) console.log(`NOTE: "${p.other.item}" was cut off at ${p.other.stage}${p.other.branch ? ` (branch ${p.other.branch})` : ""}; it stays where it is. Tell the owner.`);
    } else if (a.includes("--resume")) console.log(resumeBrief(root));
    else console.log("Use --set key=value ..., --show, --clear, --plan [--feature text] or --resume.");
  } catch (e) {
    console.error(String(e?.message ?? e));
    process.exitCode = 1;
  }
}
