// PostToolUse hook for Bash and PowerShell: when a noisy command (a test run, an install, a build) printed a lot, Claude gets
// the start, every failure line with a little context, and the summary, instead of thousands of lines; the full output is saved
// to <folder>/.claude/logs/ (a folder that ignores itself, so it is never committed) and the short version says where. The
// command already ran: this changes only what Claude reads, never what happened, its exit code, or what the guards saw.
// Claude Code accepts the replacement only in the tool's own output shape (an object with stdout and stderr); anything else is
// left alone. A command that FAILS reaches a different hook event and is never shortened here. Off with { "quietOutput": false }.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { record } from "../scripts/flight-lib.mjs";
import { isNoisy, MAX_CHARS, MAX_LINES, programs, projectCommands, trimOutput } from "../scripts/quiet-lib.mjs";
import { switchedOff } from "../scripts/trust-lib.mjs";

const KEEP_LOGS = 10;

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let input = {};
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}
const tr = input.tool_response;
const command = input.tool_input?.command;
if (!["Bash", "PowerShell"].includes(input.tool_name) || !tr || typeof tr !== "object" || typeof tr.stdout !== "string" || typeof command !== "string") process.exit(0);

const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
let cfg = {};
try {
  const p = join(root, ".claude", "kit.json");
  if (existsSync(p)) cfg = JSON.parse(readFileSync(p, "utf8"));
} catch {
  /* unreadable: defaults */
}
if (cfg.quietOutput === false || cfg.auto === false || switchedOff(root, cfg, "auto")) process.exit(0);

const stderr = typeof tr.stderr === "string" ? tr.stderr : "";
const size = tr.stdout.length + stderr.length;
const lineCount = (tr.stdout.match(/\n/g)?.length ?? 0) + (stderr.match(/\n/g)?.length ?? 0);
if (size <= MAX_CHARS && lineCount <= MAX_LINES) process.exit(0);
let own = [];
try {
  own = projectCommands(readFileSync(join(root, "CLAUDE.md"), "utf8"));
} catch {
  /* no CLAUDE.md */
}
if (!isNoisy(command, own)) process.exit(0);

// Save everything first, in the folder the command ran in (a worktree keeps its own logs).
const where = resolve(input.cwd || root);
const dir = join(where, ".claude", "logs");
let logRel = null;
try {
  mkdirSync(dir, { recursive: true });
  if (!existsSync(join(dir, ".gitignore"))) writeFileSync(join(dir, ".gitignore"), "*\n");
  const prog = (programs(command)[0] ?? "command").replace(/[^\w.-]/g, "").slice(0, 30) || "command";
  const file = join(dir, `${prog}-${new Date().toISOString().replace(/[:.]/g, "-")}.log`);
  writeFileSync(file, tr.stdout + (stderr ? `\n--- stderr ---\n${stderr}` : ""));
  logRel = relative(where, file).replace(/\\/g, "/");
  const logs = readdirSync(dir).filter((f) => f.endsWith(".log")).map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
  for (const old of logs.slice(KEEP_LOGS)) unlinkSync(join(dir, old.f));
} catch {
  process.exit(0); // could not keep the full output: show it all rather than lose anything
}

const out = trimOutput(tr.stdout);
const err = trimOutput(stderr);
if (!out.trimmed && !err.trimmed) process.exit(0);
const total = out.total + err.total;
const kept = out.kept + err.kept;
const note = `[starter-kit: ${kept} of ${total} lines shown (the start, failures and the summary). Full output: ${logRel}. Read the part you need.]`;
if (cfg.flightLog !== false) record(root, { ev: "quiet", sid: input.session_id, lines: total, kept });
process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      updatedToolOutput: { ...tr, stdout: `${note}\n${out.text}`, stderr: err.text },
    },
  }),
);
process.exit(0);
