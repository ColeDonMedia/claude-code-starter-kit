// PreCompact hook: when Claude Code compacts a long conversation (by itself near the limit, or when asked), what this prints
// becomes the instructions for the summary. It keeps what the project's records do not yet hold (the feature in progress, questions
// waiting for the owner, decisions not yet written down, anything unverified) and drops what they do (tool output, file contents,
// finished features). It never blocks a compaction: at the limit a blocked one would make the request fail.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cutOffLine } from "../scripts/build-state.mjs";
import { switchedOff } from "../scripts/trust-lib.mjs";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let input = {};
try {
  input = JSON.parse(raw);
} catch {
  /* defaults */
}
const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
let cfg = {};
try {
  const p = join(root, ".claude", "kit.json");
  if (existsSync(p)) cfg = JSON.parse(readFileSync(p, "utf8"));
} catch {
  /* unreadable: defaults */
}
if (cfg.auto === false || switchedOff(root, cfg, "auto")) process.exit(0);

const lines = [
  "Starter kit, for this summary. KEEP: the roadmap item being built and how far it got (stage, branch, worktree, the last commit",
  "whose tests passed); every question waiting for the owner's answer, word for word; decisions made in this conversation that are",
  "not yet in DECISIONS.md, with their reasons; anything said to be unverified, failing or left as is; the owner's own words about",
  "what they want. DROP: tool output, test logs, file contents and diffs, and features already merged and recorded (ROADMAP.md,",
  "CHANGELOG.md and HANDOFF.md hold them). The kit's session note and build state are put back automatically after the summary.",
];
let state = null;
try {
  state = cutOffLine(root);
} catch {
  /* no state */
}
if (state) lines.push(`Current build state: ${state}`);
process.stdout.write(lines.join("\n") + "\n");
process.exit(0);
