// SessionStart hook: if this folder is a code project that hasn't been set up with the
// starter kit yet, tell Claude to offer /starter-kit:init. Silent everywhere else
// (not a project, already set up, or turned off with { "auto": false } in .claude/kit.json).
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

const MANIFESTS = ["package.json", "pyproject.toml", "requirements.txt", "go.mod", "Cargo.toml", "Gemfile", "pom.xml", "build.gradle", "composer.json", "Makefile"];
const looksLikeProject = existsSync(join(root, ".git")) || MANIFESTS.some((m) => existsSync(join(root, m)));
if (!looksLikeProject) process.exit(0);

if ((read(join(root, "CLAUDE.md")) ?? "").includes("starter-kit:managed")) process.exit(0);

const context =
  "STARTER KIT: this project has not been set up yet (no starter-kit CLAUDE.md). " +
  "At the start of your first reply, tell the user in one sentence that it isn't set up and ask if they " +
  "want you to run /starter-kit:init (it detects the stack and writes CLAUDE.md and permissions). " +
  "If they say yes, run it with the Skill tool. If they decline, don't ask again this session.";

process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } }));
