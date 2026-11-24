// PreToolUse hook (Bash): stop catastrophic or hard-to-undo shell commands before they run.
//
//   deny  = catastrophic (wipe the home folder or disk, force-push to main, ...): never runs
//   ask   = risky but sometimes intended (git reset --hard, curl | sh, DROP TABLE, ...): the user is prompted
//
// It reads the command like a shell would (quotes, ; && || |, bash -c "..."), so text that merely MENTIONS a
// dangerous command (echo "rm -rf /", a commit message) is not blocked. Ordinary cleanups such as
// `rm -rf node_modules` are allowed.
//
// Per project, in .claude/kit.json:  { "guard": false }                       turns the guard off
//                                    { "guardAllow": ["reset-hard", ...] }    allows specific rule ids
//                                    { "auto": false }                        turns off everything automatic
// Rule ids: rm-root, rm-wide, force-push-protected, force-push, push-delete, reset-hard,
//           clean, discard-changes, branch-D, stash-drop, rewrite-history, disk-write, chmod-root, fork-bomb,
//           sql-drop, db-reset, pipe-to-shell, secret-read
// Any parse problem or unknown input allows the command: this hook must never get in the way by accident.
import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { entriesOf, switchedOff, approvedAllows } from "../scripts/trust-lib.mjs";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}
const command = input?.tool_input?.command;
if (typeof command !== "string" || !command.trim()) process.exit(0);

const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
let cfg = {};
try {
  const p = join(root, ".claude", "kit.json");
  if (existsSync(p)) cfg = JSON.parse(readFileSync(p, "utf8"));
} catch {
  /* ignore bad json */
}
// A project's own kit.json may switch the guard off or allow rules only if the user approved that on this
// computer (scripts/trust-lib.mjs); a hostile project must not be able to disable its own protection.
// Even switched off, the two rules that protect the approval process itself still apply.
const guardOff = switchedOff(root, cfg, "auto", "guard");
const allowed = approvedAllows(root, cfg);
const NEVER_ALLOWED = new Set(["trust-commands", "trust-store"]);

// ---------- read the command like a shell ----------
function parse(cmd) {
  const segs = [];
  let tokens = [];
  let cur = "";
  let has = false;
  let quote = null;
  let pipeIn = false;
  const endToken = () => {
    if (has) tokens.push(cur);
    cur = "";
    has = false;
  };
  const endSeg = (nextPipe) => {
    endToken();
    if (tokens.length) segs.push({ tokens, pipeIn });
    tokens = [];
    pipeIn = nextPipe;
  };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (quote === '"' && c === "\\" && (cmd[i + 1] === '"' || cmd[i + 1] === "\\")) {
        cur += cmd[++i];
      } else cur += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      has = true;
    } else if (c === "|" && cmd[i + 1] === "|") {
      endSeg(false);
      i++;
    } else if (c === "|") endSeg(true);
    else if (c === "&" && cmd[i + 1] === "&") {
      endSeg(false);
      i++;
    } else if (c === "&" && (cmd[i + 1] === ">" || cmd[i - 1] === ">")) cur += c;
    else if (c === ";" || c === "&" || c === "\n" || c === "(" || c === ")" || c === "`") endSeg(false);
    else if (c === " " || c === "\t" || c === "\r") endToken();
    else {
      cur += c;
      has = true;
    }
  }
  endSeg(false);
  return segs;
}

const WRAPPERS = new Set(["sudo", "doas", "env", "command", "nohup", "time", "nice", "exec", "builtin", "stdbuf"]);
const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh", "fish", "pwsh", "powershell", "cmd"]);
const INTERPRETERS = new Set([...SHELLS, "python", "python3", "perl", "ruby", "node", "iex", "invoke-expression"]);
const DOWNLOADERS = new Set(["curl", "wget", "iwr", "irm", "invoke-webrequest", "invoke-restmethod"]);

function commandWord(tokens) {
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) i++;
    else if (WRAPPERS.has(t.toLowerCase())) {
      i++;
      while (i < tokens.length && tokens[i].startsWith("-")) i += ["-u", "-g", "-n", "-s"].includes(tokens[i]) ? 2 : 1;
    } else break;
  }
  if (i >= tokens.length) return { cmd: "", args: [] };
  const cmd = basename(tokens[i].replace(/\\/g, "/")).toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, "");
  return { cmd, args: tokens.slice(i + 1) };
}

// ---------- classification helpers ----------
const ROOTY = [
  /^(\/|\/\*|~|~\/|~\/\*|\$HOME[\\/]?\*?|\$\{HOME\}[\\/]?\*?|\$env:USERPROFILE[\\/]?\*?|%USERPROFILE%[\\/]?\*?|\$env:HOMEPATH)$/i,
  /^[a-z]:[\\/]?\*?$/i,
  /^\/(usr|etc|var|bin|sbin|lib|lib32|lib64|boot|home|root|opt|sys|proc|dev|mnt|srv|tmp|Users|System|Library|Applications|Volumes)[\\/]?\*?$/i,
  /^\/(home|Users)\/[^/]+[\\/]?\*?$/i,
  /^[a-z]:[\\/](Windows|Users|Program Files( \(x86\))?|ProgramData)([\\/][^\\/]+)?[\\/]?\*?$/i,
];
const WIDE = /^(\*|\.|\.\/|\.\/\*|\.\.|\.\.\/|\.\*|\.\\|\.\\\*)$/;
const PROTECTED_BRANCH = /^(main|master|trunk|develop|production|prod|release\/.+)$/;
const SECRET_FILE = /(^|[\\/])(\.env(\.(?!example$|sample$|template$|dist$)[\w.-]+)?|id_rsa|id_dsa|id_ecdsa|id_ed25519|\.netrc|\.npmrc|\.pypirc|\.git-credentials|credentials(\.json)?)$/i;

const findings = [];
const add = (level, id, reason) => {
  if (NEVER_ALLOWED.has(id)) findings.push({ level, id, reason });
  else if (!guardOff && !allowed.has(id)) findings.push({ level, id, reason });
};

function checkRm(cmd, args) {
  const recursive = args.some((a) => /^-[a-zA-Z]*[rR][a-zA-Z]*$/.test(a) || a === "--recursive" || /^\/s$/i.test(a) || /^-recurse$/i.test(a));
  if (!recursive) return;
  const targets = args.filter((a) => !a.startsWith("-") && !/^\/[a-z]$/i.test(a));
  for (const t of targets) {
    if (ROOTY.some((re) => re.test(t))) add("deny", "rm-root", `\`${cmd} -r\` on "${t}" would wipe a system, home or drive folder`);
    else if (WIDE.test(t)) add("ask", "rm-wide", `\`${cmd} -r\` on "${t}" deletes everything in the current folder`);
  }
}

function checkGit(args) {
  let i = 0;
  while (i < args.length && args[i].startsWith("-")) i += ["-C", "-c"].includes(args[i]) ? 2 : 1;
  const sub = args[i];
  const rest = args.slice(i + 1);
  const flags = rest.filter((a) => a.startsWith("-"));
  const plain = rest.filter((a) => !a.startsWith("-"));
  const hasShort = (ch) => flags.some((f) => /^-[a-zA-Z]+$/.test(f) && f.includes(ch));
  if (sub === "push") {
    const lease = flags.some((f) => f.startsWith("--force-with-lease") || f.startsWith("--force-if-includes"));
    const force = flags.includes("--force") || hasShort("f") || plain.some((r) => r.startsWith("+"));
    const dests = plain.map((r) => r.replace(/^\+/, "").split(":").pop().replace(/^refs\/heads\//, ""));
    const protectedHit = dests.some((d) => PROTECTED_BRANCH.test(d));
    if ((force || lease) && protectedHit) add("deny", "force-push-protected", "force-pushing a protected branch (main/master/...) can destroy other people's work");
    else if (force) add("ask", "force-push", "git force-push overwrites remote history");
    // --force-with-lease on a feature branch is the safe way to push after a rebase: allowed.
    if (flags.includes("--delete") || flags.includes("--mirror") || plain.some((r) => r.startsWith(":"))) add("ask", "push-delete", "git push that deletes or mirrors remote branches");
  } else if (sub === "reset" && flags.includes("--hard")) add("ask", "reset-hard", "git reset --hard throws away uncommitted work");
  else if (sub === "clean" && hasShort("f") && !flags.includes("--dry-run") && !hasShort("n")) add("ask", "clean", "git clean -f permanently deletes untracked files");
  else if (sub === "checkout" && (plain.includes(".") || rest.includes("--") || flags.includes("--force") || hasShort("f"))) add("ask", "discard-changes", "git checkout can discard uncommitted changes");
  else if (sub === "restore" && !flags.includes("--staged") && !hasShort("S") && plain.length) add("ask", "discard-changes", "git restore discards uncommitted changes in those files");
  else if (sub === "branch" && (hasShort("D") || (flags.includes("--delete") && flags.includes("--force")))) add("ask", "branch-D", "git branch -D deletes a branch even if it is unmerged");
  else if (sub === "stash" && ["drop", "clear"].includes(plain[0])) add("ask", "stash-drop", "dropping stashes loses saved work");
  else if (["filter-branch", "filter-repo"].includes(sub)) add("ask", "rewrite-history", "rewrites the whole git history");
  else if ((sub === "reflog" && flags.some((f) => f.startsWith("--expire"))) || (sub === "gc" && flags.some((f) => f.startsWith("--prune=now")))) add("ask", "rewrite-history", "permanently removes recoverable git history");
}

function analyze(text, depth = 0) {
  if (depth > 3) return;
  // The approval list is the user's. Nothing may read or edit it except through the trust script, which asks.
  if (/trusted\.json/i.test(text)) add("deny", "trust-store", "the approval list can only be changed with the trust script, which asks the user");
  if (/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(text)) add("deny", "fork-bomb", "fork bomb");
  if (/\b(bash|sh|zsh)\s+<\(\s*(curl|wget)\b/.test(text) || /\b(iex|invoke-expression)\b[^|]*\b(iwr|irm|invoke-webrequest|invoke-restmethod|downloadstring)\b/i.test(text))
    add("ask", "pipe-to-shell", "downloads and runs code in one step");
  const segs = parse(text);
  segs.forEach((seg, idx) => {
    const { cmd, args } = commandWord(seg.tokens);
    if (!cmd) return;
    if (seg.pipeIn && idx > 0 && INTERPRETERS.has(cmd)) {
      const prev = commandWord(segs[idx - 1].tokens).cmd;
      if (DOWNLOADERS.has(prev)) add("ask", "pipe-to-shell", `${prev} piped into ${cmd} runs downloaded code unseen`);
    }
    if (SHELLS.has(cmd)) {
      const k = args.findIndex((a) => /^(-c|-command|\/c)$/i.test(a) || /^-[a-z]*c$/.test(a));
      if (k >= 0 && args[k + 1]) analyze(args.slice(k + 1).join(" "), depth + 1);
    } else if (cmd === "eval" && args.length) analyze(args.join(" "), depth + 1);
    // Approving a project's commands: always shown to the user as a real permission prompt with the exact list.
    if (cmd === "node" && args.some((a) => /(^|[\\/])trust\.mjs$/i.test(a)) && !args.includes("--list")) {
      const pi = args.indexOf("--project");
      const target = resolve(root, pi >= 0 && args[pi + 1] ? args[pi + 1] : ".");
      let tcfg = {};
      try {
        const p = join(target, ".claude", "kit.json");
        if (existsSync(p)) tcfg = JSON.parse(readFileSync(p, "utf8"));
      } catch {
        /* unreadable */
      }
      const list = entriesOf(tcfg).map((e) => e.replace(/^auto-runner$/, "the project's own test runner (tests execute project code)").replace(/^verify:/, "run: ").replace(/^related:/, "run on each edit: ").replace(/^switch:/, "TURN OFF protection: ").replace(/^allow:/, "ALLOW risky action: "));
      add("ask", "trust-commands", `approve letting "${target}" run these automatically on your computer — ${list.join("; ")}`);
    } else if (["rm", "rmdir", "rd", "del", "erase", "remove-item", "ri"].includes(cmd)) checkRm(cmd, args);
    else if (cmd === "git") checkGit(args);
    else if (/^mkfs/.test(cmd) || ["diskpart", "fdisk", "parted", "wipefs"].includes(cmd)) add("deny", "disk-write", `${cmd} can erase a whole disk`);
    else if (cmd === "dd" && args.some((a) => /^of=\/dev\//.test(a))) add("deny", "disk-write", "dd writing straight to a disk device");
    else if (cmd === "shred" && args.some((a) => a.startsWith("/dev/"))) add("deny", "disk-write", "shred on a disk device");
    else if (cmd === "format" && args.some((a) => /^[a-z]:$/i.test(a))) add("deny", "disk-write", "format erases a drive");
    else if (["chmod", "chown", "chgrp"].includes(cmd) && args.some((a) => /^-[a-zA-Z]*R/.test(a) || a === "--recursive") && args.some((a) => ROOTY.some((re) => re.test(a)))) add("deny", "chmod-root", `${cmd} -R on a system or home folder`);
    else if (["psql", "mysql", "mariadb", "sqlite3", "mongosh", "mongo", "sqlcmd", "duckdb", "redis-cli"].includes(cmd) && /\b(drop\s+(database|schema|table)|truncate\s+table|flushall|flushdb)\b/i.test(args.join(" "))) add("ask", "sql-drop", "destructive database command");
    else if (/prisma\s+(migrate\s+reset|db\s+push\b.*--force-reset)|\bdb:(drop|reset)\b|manage\.py\s+flush|supabase\s+db\s+reset/.test(`${cmd} ${args.join(" ")}`)) add("ask", "db-reset", "resets or drops the database");
    else if (["cat", "type", "more", "less", "head", "tail", "bat", "gc", "get-content", "cp", "copy"].includes(cmd) && args.some((a) => !a.startsWith("-") && SECRET_FILE.test(a))) add("ask", "secret-read", "prints or copies a file that usually holds secrets");
    // redirect straight onto a disk device
    seg.tokens.forEach((t, k) => {
      if (/^>+$/.test(t) && /^\/dev\/(sd|nvme|hd|disk)/.test(seg.tokens[k + 1] ?? "")) add("deny", "disk-write", "redirecting output onto a disk device");
      if (/^>+\/dev\/(sd|nvme|hd|disk)/.test(t)) add("deny", "disk-write", "redirecting output onto a disk device");
    });
  });
}

try {
  analyze(command);
} catch {
  process.exit(0);
}
if (!findings.length) process.exit(0);

const deny = findings.filter((f) => f.level === "deny");
const chosen = deny.length ? deny : findings;
const level = deny.length ? "deny" : "ask";
const why = chosen.map((f) => `${f.reason} [${f.id}]`).join("; ");
const reason =
  level === "deny"
    ? `Blocked by the starter-kit safety guard: ${why}. Choose a safer way. If the user truly wants this exact command, they must run it themselves or allow the rule id in .claude/kit.json ("guardAllow") — never edit that file on your own.`
    : `Starter-kit safety guard: ${why}. Approve only if you meant this.`;
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: level, permissionDecisionReason: reason } }));
process.exit(0);
