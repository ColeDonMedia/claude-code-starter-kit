// Lets the conductor wait for an agent it sent a message to, without ending its turn. Ending a turn ends a subagent's run, so a
// conductor that stopped "to wait for the builder" handed back half a build (trial 3, twice). The builder's reply is delivered
// between tool calls, so this waits a few minutes while watching the builder's worktree, then says what it saw. Run it again
// until the reply arrives. Reads git only; changes nothing.
// Run: node wait-agent.mjs --worktree <path> [--minutes 4]   (give the shell call a timeout above the minutes)
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function snapshot(dir) {
  const git = (...a) => spawnSync("git", ["-C", dir, ...a], { encoding: "utf8" });
  const head = git("rev-parse", "--short", "HEAD");
  if (head.status !== 0) return null;
  const changed = git("status", "--porcelain").stdout.split("\n").filter(Boolean).length;
  return { head: head.stdout.trim(), changed };
}

// Polls every `everyMs`. Returns early once the builder has committed something new and left its folder clean for two polls in a
// row: its report usually follows within moments.
export async function waitFor(dir, { minutes = 4, everyMs = 15000 } = {}) {
  const start = snapshot(dir);
  if (!start) return { kind: "missing", text: `NO WORKTREE at ${dir}: check the path from the build state.` };
  const until = Date.now() + Math.min(Math.max(minutes, 0), 9) * 60000;
  let quiet = 0;
  let now = start;
  while (Date.now() < until) {
    await sleep(Math.min(everyMs, Math.max(until - Date.now(), 0)));
    now = snapshot(dir) ?? now;
    quiet = now.head !== start.head && now.changed === 0 ? quiet + 1 : 0;
    if (quiet >= 2) return { kind: "committed", text: `BUILDER COMMITTED ${now.head} and its folder is clean. Its report usually arrives next; if it has not, run this again.` };
  }
  return { kind: "working", text: `STILL WORKING after ${minutes} min: last commit ${now.head}${now.head === start.head ? " (none new)" : " (new)"}, ${now.changed} file(s) changed. Run this again; do not end your turn.` };
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === resolve(fileURLToPath(import.meta.url)).toLowerCase()) {
  const a = process.argv.slice(2);
  const get = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : undefined);
  const dir = get("--worktree");
  if (!dir) {
    console.error("usage: node wait-agent.mjs --worktree <path> [--minutes 4]");
    process.exitCode = 1;
  } else console.log((await waitFor(resolve(dir), { minutes: Number(get("--minutes") ?? 4) })).text);
}
