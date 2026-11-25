// Flight recorder hook: writes one short line per event (session start, a tool about to run, a tool finished, a turn
// ending) to a private log in the user's own folder. A tool that was about to run but never finished was blocked or
// failed, which is exactly what you want to see after a trial run. It records names only, never content (see
// scripts/flight-lib.mjs). It never blocks anything and never prints. Switch off with { "flightLog": false } in
// .claude/kit.json.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { record } from "../scripts/flight-lib.mjs";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let input = {};
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}

const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
let off = false;
try {
  const p = join(root, ".claude", "kit.json");
  if (existsSync(p)) {
    const cfg = JSON.parse(readFileSync(p, "utf8"));
    off = cfg.flightLog === false || cfg.auto === false;
  }
} catch {
  /* bad json: keep recording */
}
if (off) process.exit(0);

const ev = input.hook_event_name;
const e = { sid: input.session_id };
if (ev === "SessionStart") {
  Object.assign(e, { ev: "start", src: input.source });
  // A short fingerprint (not the text) of the next unfinished roadmap item, so a report can tell when the same item has
  // been "next" for session after session: a stalled build.
  try {
    const next = /^[-*] \[ \] (.+)$/m.exec(readFileSync(join(root, "ROADMAP.md"), "utf8"))?.[1];
    if (next) e.item = createHash("sha1").update(next.trim()).digest("hex").slice(0, 10);
  } catch {
    /* no roadmap */
  }
}
else if (ev === "Stop") Object.assign(e, { ev: "stop", stop: input.stop_hook_active ? "again" : "first" });
else if (ev === "PreToolUse" || ev === "PostToolUse") {
  const ti = input.tool_input ?? {};
  Object.assign(e, { ev: ev === "PreToolUse" ? "try" : "ok", tool: input.tool_name, id: input.tool_use_id });
  if (input.tool_name === "Skill") e.skill = ti.skill ?? ti.name;
  if (input.tool_name === "Agent" || input.tool_name === "Task") e.agent = ti.subagent_type;
  if (input.tool_name === "Bash" && typeof ti.command === "string") {
    // the program only: the first word, never what follows it
    e.prog = (ti.command.trim().match(/^[\w./\\:-]+/) ?? [""])[0].split(/[\\/]/).pop();
  }
} else process.exit(0);

record(root, e);
process.exit(0);
