// PreToolUse hook (Write | Edit | MultiEdit): in a project the kit first met as an empty folder, no app code may be written until
// the owner has approved a plan (ROADMAP.md exists). The first live trial showed why: told to plan first, Claude judged the
// request complete enough and built the whole app with no questions, no plan and no independent review. Setup, records, project
// settings and test configuration may still be written. Existing projects are never affected. Off, only when the owner says so in
// their own words, with { "planGate": false } in .claude/kit.json.
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { newProjectMarker, switchedOff } from "../scripts/trust-lib.mjs";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let input = {};
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}
const file = input.tool_input?.file_path;
if (!["Write", "Edit", "MultiEdit"].includes(input.tool_name) || typeof file !== "string") process.exit(0);

const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
if (!existsSync(newProjectMarker(root)) || existsSync(join(root, "ROADMAP.md"))) process.exit(0);
let cfg = {};
try {
  const p = join(root, ".claude", "kit.json");
  if (existsSync(p)) cfg = JSON.parse(readFileSync(p, "utf8"));
} catch {
  /* unreadable: the gate stays on */
}
if (cfg.planGate === false || switchedOff(root, cfg, "auto")) process.exit(0);

const rel = relative(root, resolve(input.cwd || root, file)).replace(/\\/g, "/");
if (!rel || rel.startsWith("..") || isAbsolute(rel)) process.exit(0); // not this project's file

// What setup and planning write before any app code: hidden folders and settings, records and docs, licences, package manifests,
// and the browser-test scaffolding init copies in.
const SETUP = [
  /^\./, // .claude/, .github/, .gitignore, .vscode/ ...
  /\.md$/i,
  /^(license|licence|notice|copying)(\.[a-z]+)?$/i,
  /^(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|requirements[\w.-]*\.txt|pyproject\.toml|go\.mod|Cargo\.toml|Gemfile)$/i,
  /^tsconfig[\w.-]*\.json$/i,
  /^[\w.-]+\.config\.(js|cjs|mjs|ts)$/i,
  /^(e2e|docs)\//i,
];
if (SETUP.some((r) => r.test(rel))) process.exit(0);

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        `Blocked by the starter-kit plan check: this is a new project and the owner has not approved a plan yet (no ROADMAP.md), so no app code (${rel}) yet. ` +
        "Run /starter-kit:spec first. For a small app it is short: one batch of questions with defaults and a one-screen plan to approve. " +
        "Setup files, records and test configuration can still be written. Only if the owner says in their own words to skip the plan, set " +
        '{ "planGate": false } in .claude/kit.json and tell them what that skips.',
    },
  }),
);
process.exit(0);
