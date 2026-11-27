// PostToolUse hook (Edit | Write | MultiEdit): a warning the moment dangerous code is written, instead of at review time.
// Plain text matching on the NEW text only (no model, no network): running strings as code, building HTML or SQL from strings,
// shell commands built from input, unsafe deserialising, switched-off certificate checks, and edits to CI workflows. It never
// blocks; it tells the builder what it wrote, why it is risky and the usual safe form, and asks it to use that or say why not.
// Idea from Anthropic's security-guidance plugin (its text-matching layer); the rules here are written for this kit.
// A project can add its own rules in .claude/security-patterns.json: [{ "id", "regex", "why", "paths"?: "<regex>" }]. They only
// add warnings, so they need no approval.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { warnings } from "../scripts/code-warn-lib.mjs";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}
const ti = input?.tool_input ?? {};
const file = ti.file_path;
if (typeof file !== "string") process.exit(0);
const text = [ti.content, ti.new_string, ...(Array.isArray(ti.edits) ? ti.edits.map((e) => e?.new_string) : [])].filter((x) => typeof x === "string").join("\n");
if (!text) process.exit(0);
const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
let extra = [];
const custom = join(root, ".claude", "security-patterns.json");
if (existsSync(custom)) {
  try {
    const j = JSON.parse(readFileSync(custom, "utf8"));
    extra = Array.isArray(j) ? j.slice(0, 100) : [];
  } catch {
    /* ignore a broken file */
  }
}
const hits = warnings(file, text, extra);
if (!hits.length) process.exit(0);
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: `STARTER-KIT CODE WARNING for ${file}:\n${hits.map((h) => `- [${h.id}] ${h.why}.${h.fix ? ` Safer: ${h.fix}.` : ""}`).join("\n")}\n` +
      "Use the safer form, or, if this use is really safe (no part comes from a user or the network), say why in your report.",
  },
}));
process.exit(0);
