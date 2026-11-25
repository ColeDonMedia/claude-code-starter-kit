// PreToolUse hook for the Agent tool: refuses to start a starter-kit agent on a model below its role's minimum, because a security
// review on the cheapest model is a protection quietly switched off. The minimums come from scripts/model-route.mjs (the one place
// that decides models), lowered only by this computer's own ceiling (a plan without Opus). A launch that names no model passes: the
// agent file's model applies, and a test keeps that at or above the minimum. Other plugins' agents, an unknown model name, and a
// computer that forces one model onto every agent (CLAUDE_CODE_SUBAGENT_MODEL_FORCE) are left alone. It also enforces who may
// start agents: only the conductor (the kit's own agents, never another conductor); no other kit agent. Never runs anything.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getCeiling, minimum, rank } from "../scripts/model-route.mjs";
import { switchedOff } from "../scripts/trust-lib.mjs";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let input = {};
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}

const ti = input.tool_input ?? {};
const type = typeof ti.subagent_type === "string" ? ti.subagent_type : "";
const asked = typeof ti.model === "string" ? ti.model.trim().toLowerCase() : "";
// Tool hooks also fire inside subagents, with the subagent's type: that is who is launching.
const caller = typeof input.agent_type === "string" ? input.agent_type : "";
const forced = /^(1|true|yes|on)$/i.test(String(process.env.CLAUDE_CODE_SUBAGENT_MODEL_FORCE ?? "").trim());
if (!["Agent", "Task"].includes(input.tool_name)) process.exit(0);

const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
let cfg = {};
try {
  const p = join(root, ".claude", "kit.json");
  if (existsSync(p)) cfg = JSON.parse(readFileSync(p, "utf8"));
} catch {
  /* unreadable: the check stays on */
}
if (switchedOff(root, cfg, "auto")) process.exit(0);

const deny = (reason) => {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `Blocked by the starter-kit model check: ${reason}` } }));
  process.exit(0);
};

// Only the conductor may start agents, and only the kit's own, never another conductor. Any other kit agent may start none.
if (caller === "starter-kit:conductor") {
  if (!type.startsWith("starter-kit:")) deny(`the conductor starts only the starter kit's own agents, not "${type || "unnamed"}".`);
  if (type === "starter-kit:conductor") deny("a conductor never starts another conductor.");
} else if (caller.startsWith("starter-kit:")) deny(`the ${caller.slice(12)} agent may not start other agents.`);

if (!type.startsWith("starter-kit:") || !asked || rank(asked) < 0 || forced) process.exit(0);
const role = type.slice("starter-kit:".length);
const least = minimum(role, getCeiling());
if (least && rank(asked) < rank(least)) {
  deny(`the ${role} agent needs at least ${least}, and this launch asked for ${asked}. Launch it again with the model that scripts/model-route.mjs names for it, or with no model.`);
}
process.exit(0);
