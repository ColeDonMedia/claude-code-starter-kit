// Database guard (PreToolUse, Bash). Claude may work freely on a database on THIS computer (a local or Docker copy). It may not
// connect to one anywhere else, run migrations with production settings, or use a hosting platform's database tools: those are
// denied, and Claude must hand the owner the exact command instead. Destructive SQL on a local database (dropping or emptying
// tables, UPDATE or DELETE with no WHERE, resets) asks the user first. Rules: scripts/db-lib.mjs.
// Off switch (needs the user's approval on this computer): { "dbGuard": false } in .claude/kit.json.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { assessDbCommand } from "../scripts/db-lib.mjs";
import { switchedOff } from "../scripts/trust-lib.mjs";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let input = {};
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}
const command = input?.tool_input?.command;
if (typeof command !== "string" || !command.trim()) process.exit(0);

const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
let cfg = {};
try {
  const p = join(root, ".claude", "kit.json");
  if (existsSync(p)) cfg = JSON.parse(readFileSync(p, "utf8"));
} catch {
  /* ignore bad json */
}
if (switchedOff(root, cfg, "auto", "dbGuard")) process.exit(0);

const a = assessDbCommand(command, root);
if (a.decision === "allow") process.exit(0);
const reason =
  a.decision === "deny"
    ? `Blocked by the starter-kit database guard: ${a.why}. Real databases belong to the owner. Work on a local copy instead (a local or Docker database seeded with test data), and if this change really has to reach the live database, give the owner the exact command, what it changes, how long it may take, and how to undo it, and let them run it.`
    : `Starter-kit database guard: ${a.why}. Approve only if losing that data is fine (it should be a throwaway local copy).`;
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: a.decision, permissionDecisionReason: reason } }));
