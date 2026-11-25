// SubagentStop hook for the starter-kit conductor: "done is something you can show", applied where a feature is handed back. The
// report's first line must be one of the four results, and MERGED must name a commit that really exists and is part of the main
// checkout's current branch. Otherwise the conductor is sent back ONCE to correct its report; the next time it is let through,
// so it can never loop. The result kind (a word, never the report) goes to the flight log. Other agents pass untouched.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
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

// Why the report cannot be believed, or null.
function problem(report, cwd) {
  const first = report.split("\n").map((l) => l.replace(/[*`_]/g, "").trim()).find(Boolean) ?? "";
  const m = /^RESULT:\s*(MERGED\b\s*([0-9a-f]{7,40})?|BLOCKED|NEEDS OWNER|CANNOT DELEGATE)\b/i.exec(first);
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
  process.stdout.write(JSON.stringify({ decision: "block", reason: `Your report cannot be accepted: ${p.why} Check with git, correct it, and give the whole report again.` }));
}
process.exit(0);
