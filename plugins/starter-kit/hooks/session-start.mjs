// SessionStart hook. Silent unless it applies:
//  1. Un-set-up code project -> tell Claude to run /starter-kit:init itself.
//  2. Set-up project         -> inject the workflow routing table, the roadmap status (if ROADMAP.md exists),
//                               and "lean mode" token-saving rules.
// .claude/kit.json switches: { "lean": false } drops lean mode, { "plainLanguage": false } drops the
// non-programmer wording rule, { "auto": false } turns everything off.
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
const managed = (read(join(root, "CLAUDE.md")) ?? "").includes("starter-kit:managed");
if (!looksLikeProject && !managed) process.exit(0);

if (!managed) {
  emit(
    "STARTER KIT: this project has not been set up yet (no starter-kit CLAUDE.md). " +
      "Before anything else, run /starter-kit:init yourself with the Skill tool, without asking first; the user " +
      "should never need to type it. Then carry on with their request. It detects the stack and writes CLAUDE.md; " +
      "it asks the user one yes/no question about command permissions. If it fails, say so in one sentence and continue.",
  );
}

const parts = [
  "STARTER KIT WORKFLOWS — you choose and run the right one yourself with the Skill tool. Never ask the user to type a command; say in one line what you ran.\n" +
    "- Question, explanation, docs, config edit -> just answer or do it.\n" +
    "- New app, or a large or vague feature -> /starter-kit:spec first (get the user's approval), then build its roadmap.\n" +
    "- New feature or non-trivial bug fix -> /starter-kit:feature.\n" +
    "- Small one-file tweak -> /starter-kit:tdd, then /starter-kit:review.\n" +
    "- Bug, error, crash or failing test with an unclear cause -> /starter-kit:debug (root cause before any fix).\n" +
    "- Competitors, market, alternatives, 'what's missing' -> /starter-kit:research.\n" +
    "- You changed code directly in this conversation -> /starter-kit:review before you say it's done.\n" +
    "- User says ship, release, deploy, push, open a PR -> /starter-kit:full-scan (a hook blocks git push until it passes).\n" +
    "- A link to a skill, plugin or MCP server, or a request to install one -> /starter-kit:vet first; never install it yourself.\n" +
    "- Never say done, fixed or passing without running the check this turn and quoting its result.\n" +
    "- When work is verified, commit it locally yourself with a clear message. Never push unless asked.\n" +
    "- Unsure which -> take the lighter path.",
];

if (cfg.plainLanguage !== false) {
  parts.push(
    "THE USER IS NOT A PROGRAMMER. Explain results in plain words: what now works, how to see it, what is not done. No jargon without a " +
      "half-line explanation. Make routine technical choices yourself and say what you chose. Ask only when the choice changes what they get, " +
      "costs money, or can't be undone: one question, with your recommendation first.",
  );
}

// Roadmap status: lets a build continue across sessions without the user re-explaining anything.
const roadmap = read(join(root, "ROADMAP.md"));
if (roadmap) {
  // Top-level checkboxes only: indented ones are a feature's acceptance criteria.
  const items = [...roadmap.matchAll(/^[-*] \[( |x|X)\] (.+)$/gm)];
  const open = items.filter((m) => m[1] === " ");
  if (items.length && open.length) {
    parts.push(
      `ROADMAP.md: ${items.length - open.length} of ${items.length} done. Next: "${open[0][2].trim().slice(0, 120)}". ` +
        "If the user says continue, keep going, or gives no other task, build the next item with /starter-kit:feature, tick it off in " +
        "ROADMAP.md, and carry on to the one after. Stop only for a real decision, a failing check you cannot fix, or when the list is done.",
    );
  } else if (items.length) {
    parts.push(`ROADMAP.md: all ${items.length} items are done. Suggest /starter-kit:full-scan before shipping.`);
  }
}

if (cfg.lean !== false) {
  parts.push(
    'LEAN MODE (the user can switch it off with {"lean": false} in .claude/kit.json):\n' +
      "- Replies: lead with the answer or result. No preamble, no restating the request, no recap of what you just did, no pleasantries. Short sentences; bullets over paragraphs; about 5 lines unless the user asks for detail.\n" +
      "- Don't narrate obvious steps or tool calls.\n" +
      "- Read narrowly: search before reading; read only the line ranges you need; don't re-read files you've read or just edited. Cap noisy commands yourself (`| tail -n 40`, quiet reporters) rather than dumping output into context.\n" +
      "- Smallest change: edit existing code before adding files or abstractions; no extras beyond the request.\n" +
      "- Send broad searches, web research and long logs to a subagent.\n" +
      "- Never shorten code, commands, paths, error text, or anything the user must act on. Write warnings, destructive actions and security issues in full: clarity beats brevity.",
  );
}

emit(parts.join("\n\n"));
