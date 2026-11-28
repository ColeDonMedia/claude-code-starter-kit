// PreToolUse hook (Write | Edit | MultiEdit): files that belong to the kit or to the owner's approvals, never to Claude.
//
// - ~/.claude/plugins/data/starter-kit/trusted.json records which project commands and switches the user approved. It may only
//   change through scripts/trust.mjs, which Claude Code shows to the user as a permission prompt.
// - The kit's own installed files (plugins/cache/starter-kit-marketplace, plugins/marketplaces/starter-kit-marketplace): an
//   edited guard is a guard switched off. Only an update changes them. A development checkout elsewhere is not affected.
// - The plan-check markers (<data dir>/new-projects/): removing or changing one switches the plan check off for a project.
// - A project's .claude/last-full-scan: the pre-ship pass marker, written only by scripts/ship-mark.mjs after it re-checks.
// The shell guard (safety-guard.mjs) refuses the same changes made with shell commands. Everything else is allowed; any parse
// problem allows.
import { fileURLToPath } from "node:url";
import { dataDir } from "../scripts/trust-lib.mjs";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}
const norm = (p) => String(p ?? "").replace(/\\/g, "/").toLowerCase();
const file = norm(input?.tool_input?.file_path);
if (!file) process.exit(0);
const data = norm(dataDir()).replace(/\/$/, "");

const RULES = [
  [(f) => /\/plugins\/data\/starter-kit\/trusted\.json$/.test(f) || f === `${data}/trusted.json`, "the approval list belongs to the user and can only be changed with the trust script, which asks them first."],
  [(f) => /\/plugins\/(cache|marketplaces)\/starter-kit-marketplace\//.test(f), "these are the starter kit's own installed files. Changing one would change or switch off a protection; only an update may change them. If something in the kit is wrong, tell the user."],
  [(f) => /\/plugins\/data\/starter-kit\/new-projects\//.test(f) || f.startsWith(`${data}/new-projects/`), "the plan-check markers belong to the kit; changing one switches the plan check off for a project."],
  [(f) => /(^|\/)\.claude\/last-full-scan$/.test(f), `the pre-ship pass marker is written only by the kit's ship-mark script, which re-checks first: node "${fileURLToPath(new URL("../scripts/ship-mark.mjs", import.meta.url))}" --project .`],
];
const hit = RULES.find(([test]) => test(file));
if (!hit) process.exit(0);

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: `Blocked by the starter-kit file guard: ${hit[1]}`,
    },
  }),
);
process.exit(0);
