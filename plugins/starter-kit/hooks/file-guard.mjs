// PreToolUse hook (Write | Edit | MultiEdit): Claude may not write the user's approval list.
//
// ~/.claude/plugins/data/starter-kit/trusted.json records which project commands and switches the user approved.
// It may only change through scripts/trust.mjs, which Claude Code shows to the user as a permission prompt.
// Editing it directly with a file tool would let the model approve things on its own, so that is denied.
// Everything else is allowed; any parse problem allows.
let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}
const file = String(input?.tool_input?.file_path ?? "").replace(/\\/g, "/").toLowerCase();
if (!/\/plugins\/data\/starter-kit\/trusted\.json$/.test(file)) process.exit(0);

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "Blocked by the starter-kit file guard: the approval list belongs to the user and can only be changed with the trust script, which asks them first.",
    },
  }),
);
process.exit(0);
