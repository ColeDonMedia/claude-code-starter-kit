// PreToolUse hook (Bash): vet dependencies before they are installed.
//
// For `npm/pnpm/yarn/bun add|install <pkg>`, `pip install`, `uv add`, `poetry add`, `cargo add`, it looks each
// NEW package up in its public registry and:
//   deny  - the package does not exist (AI tools invent plausible names; attackers register them)
//   ask   - it exists but is brand new, barely downloaded, deprecated, runs an install script, has no repo link,
//           or comes from a URL, git repo or local path instead of the registry
// Anything else, and any network trouble, is allowed: this hook must never block by accident.
// Off switch (needs the user's approval on this computer): { "packageGuard": false } in .claude/kit.json.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { assess, lookup, parseInstalls } from "../scripts/pkg-check.mjs";
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

const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
let cfg = {};
try {
  const p = join(root, ".claude", "kit.json");
  if (existsSync(p)) cfg = JSON.parse(readFileSync(p, "utf8"));
} catch {
  /* ignore bad json */
}
if (switchedOff(root, cfg, "auto", "packageGuard")) process.exit(0);

const installs = parseInstalls(command);
if (!installs.length) process.exit(0);

const deny = [];
const ask = [];
const jobs = [];
for (const inst of installs) {
  for (const src of inst.nonRegistry) ask.push(`${src} is not from the public registry (a URL, git repository or local file can contain anything)`);
  for (const name of [...new Set(inst.names)].slice(0, 8)) jobs.push(lookup(inst.eco, name).then((info) => ({ inst, name, a: assess(info) })));
}
for (const { inst, name, a } of await Promise.all(jobs)) {
  if (a.verdict === "MISSING") deny.push(`${inst.eco} package "${name}" does not exist`);
  else if (a.verdict === "CAUTION") ask.push(`${inst.eco} package "${name}": ${a.reasons.join("; ")}`);
}
if (deny.length || ask.length) report();

function report() {
const level = deny.length ? "deny" : "ask";
const reason = deny.length
  ? `Blocked by the starter-kit package guard: ${deny.join("; ")}. AI tools sometimes invent package names that sound right, and attackers register those names with malicious code. Do not guess: search the registry or the library's official docs for the real name, then try again.` +
    (ask.length ? ` Also: ${ask.join("; ")}.` : "")
  : `Starter-kit package guard: ${ask.join("; ")}. Approve only if you recognise and trust this package.`;
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: level, permissionDecisionReason: reason } }));
}
// No process.exit() after network calls: it can crash Node on Windows. The process ends on its own.
