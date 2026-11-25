// Flight recorder hook: writes one short line per event (session start, a tool about to run, a tool finished, a turn
// ending) to a private log in the user's own folder. A tool that was about to run but never finished was blocked or
// failed, which is exactly what you want to see after a trial run. It records names only, never content (see
// scripts/flight-lib.mjs). It never blocks anything and never prints. Switch off with { "flightLog": false } in
// .claude/kit.json.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { count, effortName, modelName, record } from "../scripts/flight-lib.mjs";

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
  Object.assign(e, { ev: "start", src: input.source, model: modelName(input.model) });
  // The first live trial showed no model at session start. Record the field's shape (its type and key names, never a value)
  // so the next trial shows whether Claude Code sends it at all, and how.
  e.mt = input.model === undefined ? "absent" : input.model === null ? "null" : typeof input.model;
  if (input.model && typeof input.model === "object") e.mk = Object.keys(input.model).slice(0, 6).join("/");
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
else if (ev === "PostCompact") Object.assign(e, { ev: "compact", src: input.trigger === "manual" ? "manual" : "auto" });
else if (ev === "PostToolUseFailure") {
  // The tool ran and failed (a failing test run, a missing file): not the same as being blocked by a guard. Names only.
  const ti = input.tool_input ?? {};
  Object.assign(e, { ev: "fail", tool: input.tool_name, id: input.tool_use_id });
  if ((input.tool_name === "Bash" || input.tool_name === "PowerShell") && typeof ti.command === "string") e.prog = (ti.command.trim().match(/^[\w./\\:-]+/) ?? [""])[0].split(/[\\/]/).pop();
}
else if (ev === "PreToolUse" || ev === "PostToolUse") {
  const ti = input.tool_input ?? {};
  Object.assign(e, { ev: ev === "PreToolUse" ? "try" : "ok", tool: input.tool_name, id: input.tool_use_id });
  if (input.tool_name === "Skill") e.skill = ti.skill ?? ti.name;
  // Writing a whole existing file out again costs far more than editing it: count it (a 1, never the path).
  if (ev === "PreToolUse" && input.tool_name === "Write" && typeof ti.file_path === "string") {
    try {
      if (existsSync(resolve(input.cwd || root, ti.file_path))) e.rw = 1;
    } catch {
      /* unreadable path: not counted */
    }
  }
  if (input.tool_name === "Agent" || input.tool_name === "Task") {
    // Which model was asked for, which one ran and how many tokens it used: names and numbers only, never the prompt.
    e.agent = ti.subagent_type;
    if (ev === "PreToolUse") Object.assign(e, { ask: modelName(ti.model), eff: effortName(ti.effort) });
    else {
      const r = input.tool_response && typeof input.tool_response === "object" ? input.tool_response : {};
      Object.assign(e, { ran: modelName(r.resolvedModel), tok: count(r.totalTokens) });
      // A builder ends its report with "PACK MISSES: <n>" (files it had to find without the brief's pointers).
      const m = /PACK MISSES:\s*(\d{1,4})\b/.exec(JSON.stringify(r));
      if (m && String(e.agent).endsWith(":implementer")) e.miss = Number(m[1]);
    }
  }
  if (input.tool_name === "Bash" && typeof ti.command === "string") {
    // the program only: the first word, never what follows it
    e.prog = (ti.command.trim().match(/^[\w./\\:-]+/) ?? [""])[0].split(/[\\/]/).pop();
  }
} else process.exit(0);

record(root, e);
process.exit(0);
