// PreToolUse hook (Bash): block `git push` and `gh pr create` until /starter-kit:full-scan has
// passed for the commit being pushed. /full-scan records success by writing the HEAD commit id
// to .claude/last-full-scan; the gate lets the command through only when that id equals HEAD.
//
// Only active in projects set up with /starter-kit:init (CLAUDE.md contains "starter-kit:managed").
// Turn off with { "autoGate": false } (or { "auto": false }) in .claude/kit.json.
// Exit 2 blocks the command and shows the message to Claude; every other case exits 0.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}

const command = input?.tool_input?.command;
if (typeof command !== "string") process.exit(0);

// A real push/PR command at the start of the command or after ; && || | (not inside an echo, etc.)
const PUSH = /(^|[;&|(]\s*)(git(\s+-C\s+\S+)?\s+push|gh\s+pr\s+create)\b/;
if (!PUSH.test(command) || /--dry-run/.test(command)) process.exit(0);

const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
const read = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
};

if (!(read(join(root, "CLAUDE.md")) ?? "").includes("starter-kit:managed")) process.exit(0);

let cfg = {};
try {
  cfg = JSON.parse(read(join(root, ".claude", "kit.json")) ?? "{}");
} catch {
  /* ignore bad json */
}
if (cfg.autoGate === false || cfg.auto === false) process.exit(0);

const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
if (head.status !== 0) process.exit(0); // not a git repo or no commits: nothing to gate
const sha = head.stdout.trim();

const marker = (read(join(root, ".claude", "last-full-scan")) ?? "").trim();
if (marker === sha) process.exit(0);

process.stderr.write(
  "Blocked by the starter kit: this commit hasn't passed /starter-kit:full-scan " +
    (marker ? "(the last passing scan was for a different commit). " : "(no passing scan recorded). ") +
    "Run /starter-kit:full-scan now with the Skill tool; when it finishes green it records the commit. " +
    "Then retry this command. If the user wants to skip the check, they can set " +
    '{"autoGate": false} in .claude/kit.json — do not edit that yourself.\n',
);
process.exit(2);
