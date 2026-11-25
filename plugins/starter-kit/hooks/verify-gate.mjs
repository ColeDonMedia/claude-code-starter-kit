// Stop hook: Claude may not end a turn with the project's checks failing.
//
// When Claude finishes a turn and the code has changed since the last time the checks passed, this runs the
// project's own check commands (listed by /starter-kit:init in .claude/kit.json as "verify": ["npm test", ...]).
// If one fails, the turn does not end: the failure output goes back to Claude, which must fix it or tell the
// user plainly what is broken. Passing checks cost no tokens.
//
// It blocks at most once per turn and once per distinct state of the code, so it can never loop:
//   - stop_hook_active (Claude is already continuing because of this hook) -> let the turn end
//   - same code state as the last run -> nothing new to say
// Does nothing when: the project isn't set up, there is no "verify" list, only docs changed, the checks time
// out, or .claude/kit.json has { "verifyGate": false } or { "auto": false }.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isTrusted } from "../scripts/trust-lib.mjs";
import { remoteDbHosts } from "../scripts/db-lib.mjs";

const done = () => process.exit(0);
let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let input = {};
try {
  input = JSON.parse(raw);
} catch {
  done();
}
if (input.stop_hook_active) done();

const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
const read = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
};
if (!(read(join(root, "CLAUDE.md")) ?? "").includes("starter-kit:managed")) done();

let cfg = {};
try {
  cfg = JSON.parse(read(join(root, ".claude", "kit.json")) ?? "{}");
} catch {
  done();
}
if (cfg.auto === false || cfg.verifyGate === false) done();
const commands = Array.isArray(cfg.verify) ? cfg.verify.filter((c) => typeof c === "string" && c.trim()) : [];
if (!commands.length) done();

const git = (...args) => spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const head = git("rev-parse", "HEAD");
if (head.status !== 0) done();
const status = git("status", "--porcelain").stdout ?? "";
const diff = git("diff", "HEAD").stdout ?? "";
const fingerprint = createHash("sha256").update(head.stdout).update(status).update(diff).digest("hex");

const stateFile = join(root, ".claude", "last-verified");
let last = {};
try {
  last = JSON.parse(read(stateFile) ?? "{}");
} catch {
  /* treat as never verified */
}
if (last.fingerprint === fingerprint) done();

// Only documentation changed since the last run: nothing to verify.
const DOC = /\.(md|mdx|txt|rst)$/i;
if (last.head === head.stdout.trim()) {
  const changed = status.split("\n").filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ""));
  if (changed.length && changed.every((f) => DOC.test(f))) done();
}

// SECURITY: these commands come from the project's own kit.json. Run them only if the user approved this exact
// text on this computer (see scripts/trust-lib.mjs); otherwise ask once and run nothing.
const unapproved = commands.filter((c) => !isTrusted(root, `verify:${c}`));
if (unapproved.length) {
  try {
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(stateFile, JSON.stringify({ fingerprint, head: head.stdout.trim(), ok: null, untrusted: true, when: new Date().toISOString() }));
  } catch {
    /* best effort */
  }
  const trustScript = fileURLToPath(new URL("../scripts/trust.mjs", import.meta.url));
  process.stderr.write(
    "This project lists check commands that you have not approved on this computer, so none were run:\n" +
      unapproved.map((c) => `- ${c}`).join("\n") +
      "\nAsk the user ONE plain yes/no question: \"May I automatically run this project's own checks (" +
      unapproved.join(", ") +
      ") whenever I finish a change?\" If they say yes, run: node \"" +
      trustScript +
      "\" --project \"" +
      root +
      "\" (they will see a permission prompt showing these exact commands). If they say no, carry on without the automatic checks and don't ask again this session.\n",
  );
  process.exit(2);
}

// Never run the project's checks against a database somewhere else: tests can change or wipe data. The session note tells
// Claude why the checks are off (see session-start.mjs).
if (remoteDbHosts(root).length) done();

const budgetMs = Number(process.env.KIT_VERIFY_BUDGET_MS || 240000);
const started = Date.now();
let failure = null;
for (const cmd of commands) {
  const left = budgetMs - (Date.now() - started);
  if (left <= 0) done(); // out of time: say nothing rather than guess
  const r = spawnSync(cmd, { cwd: root, shell: true, encoding: "utf8", timeout: left, maxBuffer: 64 * 1024 * 1024 });
  if (r.error) done(); // timed out or could not start: not a verdict
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (/is not recognized as an internal or external command|: command not found|executable file not found/i.test(out)) continue;
  if (r.status !== 0) {
    failure = { cmd, tail: out.trimEnd().split("\n").slice(-40).join("\n") };
    break;
  }
}

try {
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(stateFile, JSON.stringify({ fingerprint, head: head.stdout.trim(), ok: !failure, when: new Date().toISOString() }));
} catch {
  /* best effort */
}
if (!failure) done();

process.stderr.write(
  `The project's checks are failing, so this turn is not finished.\n$ ${failure.cmd}\n${failure.tail}\n\n` +
    "Fix the cause (never weaken or delete a test to get past this) and run the check again. If it was already " +
    "failing before your changes, or you cannot fix it, stop and tell the user in plain words what is broken and what you recommend.\n",
);
process.exit(2);
