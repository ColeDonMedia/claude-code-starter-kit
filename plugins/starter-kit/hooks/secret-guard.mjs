// PreToolUse hook (Bash): stop secrets and personal data from reaching git history or GitHub.
//
// Before `git commit`, `git push`, `gh pr create`, or `git add` of an env/key file, it scans exactly what is
// about to leave: the staged changes (commit), the commits not yet pushed (push, PR), or the named files (add).
// On a finding it DENIES the command, and the reason lists file:line with a redacted value. The secret itself
// is never printed.
//
// Off switches in .claude/kit.json: { "secretGuard": false } or { "auto": false }. Claude is told never to change them.
// Any parse or git problem allows the command: this hook must never block by accident.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { scanDiff, scanFiles, loadPrivateTerms, placementAdvice, FORBIDDEN_NAME, FILE_OK } from "../scripts/secret-scan.mjs";
import { switchedOff } from "../scripts/trust-lib.mjs";

const allow = () => process.exit(0);

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let input;
try {
  input = JSON.parse(raw);
} catch {
  allow();
}
const command = input?.tool_input?.command;
if (typeof command !== "string") allow();

const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
let cfg = {};
try {
  const p = join(root, ".claude", "kit.json");
  if (existsSync(p)) cfg = JSON.parse(readFileSync(p, "utf8"));
} catch {
  /* ignore bad json */
}
if (switchedOff(root, cfg, "auto", "secretGuard")) allow(); // counts only if the user approved the switch on this computer

const isCommit = /(^|[;&|(]\s*)git(\s+-C\s+\S+|\s+-c\s+\S+)*\s+commit\b/.test(command);
const isPush = /(^|[;&|(]\s*)git(\s+-C\s+\S+|\s+-c\s+\S+)*\s+push\b/.test(command);
const isPr = /(^|[;&|(]\s*)gh\s+(pr\s+create|repo\s+create|gist\s+create)\b/.test(command);
const addMatch = /(^|[;&|(]\s*)git(\s+-C\s+\S+)?\s+add\b([^;&|]*)/.exec(command);
// Publishing and deploying ship the files in the folder (not git commits), so they scan every tracked file.
const isDeploy = /(^|[;&|(]\s*)(npx\s+|pnpm\s+|yarn\s+)?((npm|pnpm|yarn)\s+publish|cargo\s+publish|twine\s+upload|docker\s+push|vercel(\s+deploy)?\b[^;&|]*--prod|netlify\s+deploy\b[^;&|]*--prod|(fly|flyctl)\s+deploy|firebase\s+deploy|wrangler\s+(deploy|publish)|gh\s+release\s+create)\b/.test(command) && !/--dry-run/.test(command);
if (!isCommit && !isPush && !isPr && !addMatch && !isDeploy) allow();

const git = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
if (git(["rev-parse", "--is-inside-work-tree"]).status !== 0) allow();
const terms = loadPrivateTerms();

let findings = [];
let scope = "";

if (isDeploy) {
  const tracked = (git(["ls-files"]).stdout ?? "").split("\n").filter(Boolean).slice(0, 4000);
  findings = scanFiles(tracked.map((f) => resolve(root, f)), terms);
  scope = "the files about to be published or deployed";
} else if (addMatch && !isCommit && !isPush && !isPr) {
  // `git add <paths>`: check the named files themselves, before they are staged.
  const tokens = addMatch[3].trim().split(/\s+/).filter(Boolean);
  const broad = tokens.some((t) => ["-A", "--all", "-u", "--update", "."].includes(t) || /^-[a-zA-Z]*[Au][a-zA-Z]*$/.test(t));
  const paths = tokens.filter((t) => !t.startsWith("-") && t !== ".").map((t) => resolve(root, t));
  findings = scanFiles(paths, terms);
  if (broad) {
    // a broad add stages everything: check the untracked and modified files it would take
    const status = git(["status", "--porcelain"]).stdout ?? "";
    const list = status.split("\n").filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ""));
    findings = findings.concat(scanFiles(list.map((f) => resolve(root, f)), terms));
  }
  scope = "the files being added";
} else if (isCommit) {
  findings = scanDiff(git(["diff", "--cached", "--no-color", "-U0"]).stdout ?? "", terms);
  scope = "the staged changes";
} else {
  // push or PR: everything not yet on the remote
  let base = null;
  const up = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  if (up.status === 0) base = `${up.stdout.trim()}..HEAD`;
  else {
    const origin = git(["rev-parse", "--verify", "--quiet", "origin/HEAD"]);
    if (origin.status === 0) base = `${origin.stdout.trim()}..HEAD`;
  }
  // Scan every commit in the range, not just the final tree: a secret that was committed and then removed
  // is still in history and still leaves with the push. With no remote, the range is the whole history.
  const range = base ?? "HEAD";
  findings = scanDiff(git(["log", "-p", "--no-color", "-U0", "--format=", range]).stdout ?? "", terms);
  const names = (git(["log", "--name-only", "--format=", range]).stdout ?? "").split("\n").map((n) => n.trim()).filter(Boolean);
  for (const n of new Set(names)) {
    if (FORBIDDEN_NAME.test(n) && !FILE_OK.test(n)) {
      findings.push({ sev: "HIGH", file: n, line: 0, rule: "forbidden-file", message: "file type that must not be committed (env file or key)", sample: "" });
    }
  }
  scope = isPr ? "the commits in this pull request" : "the commits about to be pushed";
}

if (!findings.length) allow();

const shown = findings.slice(0, 12).map((f) => `${f.sev} ${f.file}${f.line ? ":" + f.line : ""} [${f.rule}] ${f.message}${f.sample ? " | " + f.sample : ""}`);
const more = findings.length > 12 ? ` (+${findings.length - 12} more)` : "";
const reason =
  `Blocked by the starter-kit secret guard: ${scope} contain ${findings.length} possible secret(s) or private item(s)${more}:\n` +
  shown.join("\n") +
  "\nDo not push or publish this, to a public or a private repository. Take the value out of the code, then try again.\n" +
  placementAdvice(findings) +
  "\nNever disable this guard yourself; the user can set {\"secretGuard\": false} in .claude/kit.json.";

process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }));
process.exit(0);
