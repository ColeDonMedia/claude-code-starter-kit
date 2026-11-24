// SessionStart hook. Two jobs, both silent unless they apply:
//  1. Un-set-up code project  -> tell Claude to offer /starter-kit:init.
//  2. Set-up project          -> inject "lean mode" rules that cut token use.
// Turn lean mode off with { "lean": false } in .claude/kit.json; turn everything off with { "auto": false }.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let input = {};
try {
  input = JSON.parse(raw);
} catch {
  /* run with defaults */
}

const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
const read = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
};

let cfg = {};
try {
  cfg = JSON.parse(read(join(root, ".claude", "kit.json")) ?? "{}");
} catch {
  /* ignore bad json */
}
if (cfg.auto === false) process.exit(0);

const emit = (additionalContext) => {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext } }));
  process.exit(0);
};

const MANIFESTS = ["package.json", "pyproject.toml", "requirements.txt", "go.mod", "Cargo.toml", "Gemfile", "pom.xml", "build.gradle", "composer.json", "Makefile"];
const looksLikeProject = existsSync(join(root, ".git")) || MANIFESTS.some((m) => existsSync(join(root, m)));
if (!looksLikeProject) process.exit(0);

const managed = (read(join(root, "CLAUDE.md")) ?? "").includes("starter-kit:managed");

if (!managed) {
  emit(
    "STARTER KIT: this project has not been set up yet (no starter-kit CLAUDE.md). " +
      "Before anything else, run /starter-kit:init yourself with the Skill tool, without asking first; the user " +
      "should never need to type it. Then carry on with their request. It detects the stack and writes CLAUDE.md; " +
      "it asks the user one yes/no question about command permissions. If it fails, say so in one sentence and continue.",
  );
}

const ROUTING =
  "STARTER KIT WORKFLOWS — you choose and run the right one yourself with the Skill tool. Never ask the user to type a command; say in one line what you ran.\n" +
  "- Question, explanation, docs, config edit -> just answer or do it.\n" +
  "- New app, or a large or vague feature -> /starter-kit:spec first (get the user's approval), then /starter-kit:feature.\n" +
  "- New feature or non-trivial bug fix -> /starter-kit:feature.\n" +
  "- Small one-file tweak -> /starter-kit:tdd, then /starter-kit:review.\n" +
  "- Competitors, market, alternatives, 'what's missing' -> /starter-kit:research.\n" +
  "- You changed code directly in this conversation -> /starter-kit:review before you say it's done.\n" +
  "- User says ship, release, deploy, push, open a PR, or 'done' -> /starter-kit:full-scan (a hook blocks git push until it passes).\n" +
  "- User shares a link to a skill, plugin or MCP server, or asks to install one -> /starter-kit:vet first; never install it yourself.\n" +
  "- Unsure which -> take the lighter path.";

if (cfg.lean === false) emit(ROUTING);

emit(
  ROUTING +
    "\n\n" +
  "LEAN MODE (starter kit; the user can switch it off with {\"lean\": false} in .claude/kit.json):\n" +
    "- Replies: lead with the answer or result. No preamble, no restating the request, no recap of what you just did (the diff shows it), no pleasantries. Short sentences; bullets over paragraphs; about 5 lines unless the user asks for detail.\n" +
    "- Don't narrate obvious steps or tool calls.\n" +
    "- Read narrowly: search before reading; read only the line ranges you need; don't re-read files you've read or just edited; quote the relevant lines of long output instead of pasting it.\n" +
    "- Smallest change: edit existing code before adding files or abstractions; no extra features, comments or refactors beyond the request.\n" +
    "- Send broad searches and long logs to a subagent.\n" +
    "- Never shorten code, commands, paths, error text, or anything the user must act on. Write warnings, destructive actions, security issues and anything easy to misread in full: clarity beats brevity.",
);
