// SubagentStart hook: tells every starter-kit subagent (builder, reviewers, red team, researcher) where the kit's helper scripts
// are, as a real path. Subagents do not see the main session's note, and their instructions name the scripts as
// `${CLAUDE_PLUGIN_ROOT}/scripts/…`; this line makes sure they can find them either way. Prints nothing for other agents, or
// when the project has switched the kit off with { "auto": false }.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS = fileURLToPath(new URL("../scripts", import.meta.url));

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let input = {};
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}
if (!/^starter-kit:/.test(String(input.agent_type ?? ""))) process.exit(0);

const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
let off = false;
try {
  const p = join(root, ".claude", "kit.json");
  if (existsSync(p)) off = JSON.parse(readFileSync(p, "utf8")).auto === false;
} catch {
  /* bad json: still say where the scripts are */
}
if (off) process.exit(0);

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SubagentStart",
      additionalContext: `KIT SCRIPTS: ${SCRIPTS}. Wherever your instructions say \${CLAUDE_PLUGIN_ROOT}/scripts, this is that folder. If a script there is missing, say so and skip that step; never guess another path.`,
    },
  }),
);
