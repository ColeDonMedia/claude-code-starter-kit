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
import { switchedOff } from "../scripts/trust-lib.mjs";

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

// A real push, PR, publish or deploy command at the start of the command or after ; && || | (not inside an echo, etc.)
const START = String.raw`(^|[;&|(]\s*)(npx\s+|pnpm\s+(dlx\s+|exec\s+)?|yarn\s+)?`;
const SHIPPING = [
  String.raw`git(\s+-C\s+\S+)?\s+push`,
  String.raw`gh\s+(pr\s+create|release\s+create)`,
  String.raw`(npm|pnpm|yarn)\s+publish`,
  String.raw`(cargo|twine|gem|dotnet\s+nuget)\s+(publish|upload|push)`,
  String.raw`docker\s+(push|buildx\s+build\b[^;&|]*--push)`,
  String.raw`vercel(\s+deploy)?\b[^;&|]*--prod`,
  String.raw`netlify\s+deploy\b[^;&|]*--prod`,
  String.raw`(fly|flyctl)\s+deploy`,
  String.raw`firebase\s+deploy`,
  String.raw`wrangler\s+(deploy|publish)`,
  String.raw`railway\s+up`,
  String.raw`(heroku|render)\s+(deploy|releases:create)`,
].map((p) => `(${p})`);
const PUSH = new RegExp(`${START}(${SHIPPING.join("|")})\\b`);
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
if (switchedOff(root, cfg, "autoGate", "auto")) process.exit(0); // counts only if the user approved it on this computer

const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
if (head.status !== 0) process.exit(0); // not a git repo or no commits: nothing to gate
const sha = head.stdout.trim();

const marker = (read(join(root, ".claude", "last-full-scan")) ?? "").trim();
if (marker === sha) process.exit(0);

process.stderr.write(
  "Blocked by the starter kit: this commit hasn't passed /starter-kit:full-scan " +
    (marker ? "(the last passing scan was for a different commit). " : "(no passing scan recorded). ") +
    "Run /starter-kit:full-scan now with the Skill tool; when it finishes green it records the commit. " +
    "Then retry this command. Never skip this check on your own. If the user explicitly asks to turn it off, " +
    'set {"autoGate": false} in .claude/kit.json and run the trust script so they approve it in a permission prompt.\n',
);
process.exit(2);
