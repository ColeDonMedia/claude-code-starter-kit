// SubagentStop hook for the starter-kit conductor: "done is something you can show", applied where a feature is handed back. The
// report's first line must be one of the four results, and MERGED must name a commit that really exists and is part of the main
// checkout's current branch. Otherwise the conductor is sent back ONCE to correct its report; the next time it is let through,
// so it can never loop. A conductor that stopped only to wait for an agent is told how to wait without ending its run. The result kind (a word, never the report) goes to the flight log. Other agents pass untouched.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { record } from "../scripts/flight-lib.mjs";
import { switchedOff } from "../scripts/trust-lib.mjs";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let input = {};
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}
if (input.agent_type !== "starter-kit:conductor" || typeof input.last_assistant_message !== "string") process.exit(0);

const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
let cfg = {};
try {
  const p = join(root, ".claude", "kit.json");
  if (existsSync(p)) cfg = JSON.parse(readFileSync(p, "utf8"));
} catch {
  /* unreadable: check anyway */
}
if (switchedOff(root, cfg, "auto")) process.exit(0);

// A conductor that stops "to wait" for an agent has not written a bad report: it has ended its run too early (trial 3, twice).
const WAITING = /\b(wait(ing|s)? (for|on|until)|(keep|kept|keeps) waiting|i'?ll wait|will wake me|(still|is) in progress|i'?ll (continue|carry on|resume)|(continue|carry on) (when|once)|(when|once|until) (its|the|their) (fix |fixes )?(report|reply|results?) (arrives?|comes? back|is in)|still (working|running))\b/i;
const WAIT_HELP = `You ended your turn to wait, and that ends your run: nothing you are waiting for can reach you afterwards. Do not stop. Wait with node "${join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "wait-agent.mjs")}" --worktree <WORKTREE> (shell timeout 300000), again until the reply arrives, then carry on with the workflow. Stop only with a RESULT line.`;

// Why the report cannot be believed, or null.
function problem(report, cwd) {
  // The RESULT line should be first, but a sentence or two in front of it (trial 3: "SubagentHandback refused twice, so here is the
  // final report as plain text:") does not make a true report false. Deeper in the text it does not count.
  const RESULT = /^RESULT:\s*(MERGED\b\s*([0-9a-f]{7,40})?|BLOCKED|NEEDS OWNER|CANNOT DELEGATE)\b/i;
  const m = report.split("\n").map((l) => l.replace(/[*`_]/g, "").trim()).filter(Boolean).slice(0, 3).map((l) => RESULT.exec(l)).find(Boolean) ?? null;
  if (!m && WAITING.test(report)) return { kind: "waiting", why: WAIT_HELP, whole: true };
  if (!m) return { kind: "invalid", why: 'the first line must be "RESULT: MERGED <commit>", "RESULT: BLOCKED", "RESULT: NEEDS OWNER" or "RESULT: CANNOT DELEGATE".' };
  const kind = m[1].split(/\s/)[0].toUpperCase() === "MERGED" ? "merged" : m[1].toLowerCase().replace(/\s+/g, "-");
  if (kind !== "merged") return { kind, why: null };
  const sha = m[2];
  if (!sha) return { kind, why: "MERGED must name the merge commit." };
  if (spawnSync("git", ["-C", cwd, "cat-file", "-e", `${sha}^{commit}`]).status !== 0) return { kind, why: `commit ${sha} does not exist in this repository.` };
  if (spawnSync("git", ["-C", cwd, "merge-base", "--is-ancestor", sha, "HEAD"]).status !== 0) return { kind, why: `commit ${sha} is not on the main checkout's current branch, so the feature is not merged there.` };
  return { kind, why: null };
}

const p = problem(input.last_assistant_message, root);
if (cfg.flightLog !== false) record(root, { ev: "conductor", sid: input.session_id, res: p.why ? `${p.kind}-rejected` : p.kind });
if (p.why && input.stop_hook_active !== true) {
  const reason = p.whole ? p.why : `Your report cannot be accepted: ${p.why} Check with git, correct it, and give the whole report again.`;
  process.stdout.write(JSON.stringify({ decision: "block", reason }));
}
process.exit(0);
