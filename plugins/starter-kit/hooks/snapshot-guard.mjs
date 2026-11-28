// PreToolUse hook (Bash, PowerShell): the way back after a wrong "yes". Before a command that could destroy work (deleting a
// folder that isn't rebuildable, a hard reset, git clean, discarding changes, dropping a stash or branch, rewriting history,
// destructive SQL, a database reset) it saves a snapshot of the work as it is, unsaved files included, under
// refs/kit-snapshots/ in the project's own git, keeps a branch or stash about to be dropped, and copies local SQLite database
// files to .claude/backups/, and dumps a local Postgres or MySQL database the command names when pg_dump or mysqldump is
// installed (scripts/snapshot-lib.mjs). It also saves before deleting or overwriting a single code file. It never blocks, never changes the command and prints nothing: the
// safety guard decides what to ask. Saving one snapshot too many is harmless; the newest 20 are kept.
// Off (needs the user's approval on this computer): { "snapshots": false } in .claude/kit.json, or { "auto": false }.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { riskOf } from "../scripts/delete-lib.mjs";
import { backupDatabases, dumpLocalDatabases, saveSnapshot } from "../scripts/snapshot-lib.mjs";
import { switchedOff } from "../scripts/trust-lib.mjs";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let input = {};
try {
  input = JSON.parse(raw);
} catch {
  input = {};
}
const command = input?.tool_input?.command;
const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
const cwd = resolve(input.cwd || root);
let cfg = {};
try {
  const p = join(root, ".claude", "kit.json");
  if (existsSync(p)) cfg = JSON.parse(readFileSync(p, "utf8"));
} catch {
  cfg = {};
}
const risk = typeof command === "string" ? riskOf(command) : { risky: false };
if (risk.risky && !switchedOff(root, cfg, "auto", "snapshots")) {
  try {
    saveSnapshot(cwd, command.replace(/\s+/g, " ").slice(0, 60), { branches: risk.branches, stashes: risk.stashes });
    if (risk.db) {
      backupDatabases(cwd, command.split(/\s+/).map((a) => a.replace(/^["']|["']$/g, "")));
      dumpLocalDatabases(cwd, command);
    }
  } catch {
    /* a failed snapshot must never stop or change the command */
  }
}
