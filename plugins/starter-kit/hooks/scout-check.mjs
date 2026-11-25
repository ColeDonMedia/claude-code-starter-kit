// SubagentStop hook for the starter-kit scout: checks every pointer in its report (scripts/pointer-check.mjs) before the main
// conversation relies on it. If any is wrong, the scout is sent back ONCE to correct or remove those pointers and add nothing new;
// the next time it stops it is let through whatever it says, so it can never loop. The counts (numbers only) go to the flight log.
// Other agents pass untouched. Never runs anything.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { record } from "../scripts/flight-lib.mjs";
import { checkReport } from "../scripts/pointer-check.mjs";
import { switchedOff } from "../scripts/trust-lib.mjs";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let input = {};
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}
if (input.agent_type !== "starter-kit:scout" || typeof input.last_assistant_message !== "string") process.exit(0);

const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
let cfg = {};
try {
  const p = join(root, ".claude", "kit.json");
  if (existsSync(p)) cfg = JSON.parse(readFileSync(p, "utf8"));
} catch {
  /* unreadable: check anyway */
}
if (switchedOff(root, cfg, "auto")) process.exit(0);

const r = checkReport(root, input.last_assistant_message);
if (cfg.flightLog !== false) record(root, { ev: "scout", sid: input.session_id, ok: r.ok.length, bad: r.bad.length });
if (r.bad.length && input.stop_hook_active !== true) {
  const list = r.bad.slice(0, 15).map((b) => `- ${b.line.slice(0, 200)} → ${b.why}`).join("\n");
  process.stdout.write(
    JSON.stringify({
      decision: "block",
      reason: `${r.bad.length} pointer(s) in your report are wrong. Correct or remove exactly these, add nothing new, then give the whole report again:\n${list}`,
    }),
  );
}
process.exit(0);
