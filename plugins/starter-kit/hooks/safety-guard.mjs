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
import { basename, join, posix, resolve } from "node:path";
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

// Shell grammar words that can sit in front of a command (`{ rm -rf /; }`, `if x; then rm -rf /; fi`).
const RESERVED = new Set(["{", "}", "!", "then", "do", "else", "elif", "if", "while", "until"]);
// Options of each wrapper that take a value (so the value isn't mistaken for the command). `sudo -n` takes none.
const WRAPPER_VALUE_OPTS = {
  sudo: ["-u", "-g", "-C", "-p", "-r", "-t", "-U", "-h", "-D", "-R"],
  doas: ["-u", "-C"],
  env: ["-u", "-C", "-S"],
  nice: ["-n"],
  exec: ["-a"],
  stdbuf: ["-i", "-o", "-e"],
};

function commandWord(tokens) {
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t) || RESERVED.has(t)) i++;
    else if (WRAPPERS.has(t.toLowerCase())) {
      const wrapper = t.toLowerCase();
      i++;
      while (i < tokens.length && tokens[i].startsWith("-")) i += (WRAPPER_VALUE_OPTS[wrapper] ?? []).includes(tokens[i]) ? 2 : 1;
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
  /^\/(usr|var|etc|lib|lib64|boot|bin|sbin|sys|proc|dev|root)\/[^/]+\/?\*?$/i, // e.g. /var/lib, /usr/local
  /^[a-z]:[\\/](Windows|Users|Program Files( \(x86\))?|ProgramData)([\\/][^\\/]+)?[\\/]?\*?$/i,
];

// `//`, `/./`, `/../` and `~/./` are all the same folder as `/` and `~/`: compare the real path, not the spelling.
function normTarget(t) {
  if (/^(\/|~|\$HOME|\$\{HOME\})/.test(t) && !/^[a-z]:/i.test(t)) {
    const n = posix.normalize(t.replace(/\\/g, "/"));
    return n.length > 1 ? n : n; // "/" stays "/"
  }
  return t;
}
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
  for (const raw of targets) {
    const t = normTarget(raw);
    if (ROOTY.some((re) => re.test(t))) add("deny", "rm-root", `\`${cmd} -r\` on "${raw}" would wipe a system, home or drive folder`);
    else if (WIDE.test(t)) add("ask", "rm-wide", `\`${cmd} -r\` on "${raw}" deletes everything in the current folder`);
  }
}

// `find / -delete`, `find ~ -exec rm -rf {} +`: the same wipe, spelled differently.
function checkFind(args) {
  const roots = [];
  for (const a of args) {
    if (a.startsWith("-") || a === "(" || a === "!") break;
    roots.push(a);
  }
  const destructive = args.includes("-delete") || args.some((a, i) => /^-(exec|execdir)$/.test(a) && /^(rm|shred|unlink)$/.test(basename(String(args[i + 1] ?? "").replace(/\\/g, "/"))));
  if (!destructive) return;
  for (const r of roots) if (ROOTY.some((re) => re.test(normTarget(r)))) add("deny", "rm-root", `\`find ${r} ... delete\` would wipe a system, home or drive folder`);
}

const ATTACK_TOOLS = new Set(["nmap", "masscan", "zmap", "sqlmap", "hydra", "medusa", "nikto", "gobuster", "dirb", "dirbuster", "ffuf", "wfuzz", "feroxbuster", "nuclei", "wpscan", "msfconsole", "msfvenom", "zap-cli", "zap.sh", "zaproxy", "arachni", "w3af", "commix", "xsstrike", "dalfox", "amass", "subfinder", "enum4linux", "responder", "ettercap", "aircrack-ng", "john", "hashcat"]);
const LOAD_TOOLS = new Set(["ab", "wrk", "wrk2", "hey", "siege", "k6", "locust", "vegeta", "bombardier", "slowhttptest", "hping3", "slowloris"]);
const LOCAL_HOST = /^(localhost|127(\.\d{1,3}){3}|\[?::1\]?|0\.0\.0\.0|[a-z0-9-]+\.localhost)$/i;

function hostOf(token) {
  const t = token.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/^[^@/]*@/, ""); // scheme and user:pass@
  const hostPort = t.split(/[/?#]/)[0];
  return hostPort.startsWith("[") ? hostPort.replace(/\].*$/, "]") : hostPort.replace(/:\d+$/, "");
}
function checkAttackScope(cmd, args) {
  // `words.txt` and `script.js` look like host names; a file name is not a target.
  const FILE_NAME = /\.(txt|js|mjs|cjs|ts|json|py|lst|list|csv|ya?ml|xml|html?|conf|cfg|log|sh|md|rb|go|gz|zip|dic|dict|out|pem|key|crt|cer|rsc|nse)$/i;
  const targets = args.filter(
    (a) =>
      !a.startsWith("-") &&
      (/^[a-z][a-z0-9+.-]*:\/\//i.test(a) ||
        (/^\[?[0-9a-f:]+\]?(\/\d+)?$/i.test(a) && a.includes(":")) ||
        /^\d{1,3}(\.\d{1,3}){3}(\/\d+)?(:\d+)?$/.test(a) ||
        (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(a) && !FILE_NAME.test(a)) ||
        /^localhost(:\d+)?(\/\S*)?$/i.test(a)),
  );
  const remote = targets.filter((a) => !LOCAL_HOST.test(hostOf(a)));
  const tool = ATTACK_TOOLS.has(cmd) ? "an attack tool" : "a load-testing tool";
  if (remote.length) add(ATTACK_TOOLS.has(cmd) ? "deny" : "ask", "attack-scope", `${cmd} is ${tool} and is aimed at ${remote[0]}, not this computer. Only test your own app, running locally`);
  else if (!targets.length) add("ask", "attack-scope", `${cmd} is ${tool} and no target was given; confirm it only touches this computer`);
}

const SECRET_READERS = new Set(["cat", "type", "more", "less", "head", "tail", "bat", "gc", "get-content", "cp", "copy", "curl", "wget", "scp", "sftp", "rsync", "nc", "ncat", "base64", "tar", "zip", "7z", "xxd", "strings", "openssl", "gpg", "http", "https"]);
// An argument may be a secret file directly (`cat .env`), or hidden in an option (`-d @.env`, `--data=@.env`, `file=@.env`).
function touchesSecretFile(args) {
  return args.some((a) => [a, ...a.split(/[@=]/)].some((p) => p && !p.startsWith("-") && SECRET_FILE.test(p)));
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
  else if (sub === "clean" && (hasShort("f") || flags.includes("--force")) && !flags.includes("--dry-run") && !hasShort("n")) add("ask", "clean", "git clean -f permanently deletes untracked files");
  else if (sub === "checkout" && (plain.includes(".") || rest.includes("--") || flags.includes("--force") || hasShort("f"))) add("ask", "discard-changes", "git checkout can discard uncommitted changes");
  else if (sub === "restore" && !flags.includes("--staged") && !hasShort("S") && plain.length) add("ask", "discard-changes", "git restore discards uncommitted changes in those files");
  else if (sub === "branch" && (hasShort("D") || (flags.includes("--delete") && flags.includes("--force")))) add("ask", "branch-D", "git branch -D deletes a branch even if it is unmerged");
  else if (sub === "stash" && ["drop", "clear"].includes(plain[0])) add("ask", "stash-drop", "dropping stashes loses saved work");
  else if (["filter-branch", "filter-repo"].includes(sub)) add("ask", "rewrite-history", "rewrites the whole git history");
  else if ((sub === "reflog" && flags.some((f) => f.startsWith("--expire"))) || (sub === "gc" && flags.some((f) => f.startsWith("--prune=now")))) add("ask", "rewrite-history", "permanently removes recoverable git history");
}

// Code passed inline to python, node, perl, ruby, php: only what it deletes or hands to a shell matters. Printing
// the text "rm -rf /" is harmless, so only strings given to exec-style functions are read as commands.
function inspectCode(code, depth) {
  for (const m of code.matchAll(/(?:rmtree|rmSync|rmdirSync|removeSync|remove_all|unlinkSync)\(\s*(["'])((?:(?!\1).)*)\1/g)) {
    const t = normTarget(m[2]);
    if (ROOTY.some((re) => re.test(t))) add("deny", "rm-root", `inline code deletes "${m[2]}", a system, home or drive folder`);
  }
  for (const m of code.matchAll(/(?:system|popen|exec\w*|spawn\w*|run|call|check_output|check_call|Popen|shell_exec|passthru)\(\s*(["'])((?:(?!\1).)*)\1/g)) analyze(m[2], depth + 1);
}

// A heredoc (`cmd <<EOF ... EOF`) body is text handed to a command. For `git commit -F - <<EOF`, `cat <<EOF`, `tee`
// it is just data, and must not be read as commands (a commit message may mention `rm -rf /`). Only when the receiver is
// a shell or interpreter (`bash <<EOF`) does the body run, so only then is it examined.
function stripHeredocs(text, depth) {
  if (!text.includes("<<")) return text;
  const lines = text.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/<<-?\s*(["']?)([A-Za-z_][\w-]*)\1/);
    out.push(line);
    if (!m || /<<</.test(line.slice(Math.max(0, m.index - 1), m.index + 3))) continue;
    const body = [];
    let j = i + 1;
    while (j < lines.length && lines[j].replace(/^\t+/, "").trimEnd() !== m[2]) body.push(lines[j++]);
    const segs = parse(line.slice(0, m.index));
    const receiver = segs.length ? commandWord(segs[segs.length - 1].tokens).cmd : "";
    if (SHELLS.has(receiver)) analyze(body.join("\n"), depth + 1);
    else if (["python", "python3", "py", "node", "nodejs", "perl", "ruby", "php", "deno", "bun"].includes(receiver)) inspectCode(body.join("\n"), depth);
    i = j; // skip the body and the closing delimiter line
  }
  return out.join("\n");
}

function analyze(text, depth = 0) {
  if (depth > 3) return;
  text = stripHeredocs(text, depth);
  // The approval list is the user's. Nothing may read or edit it except through the trust script, which asks.
  if (/trusted\.json/i.test(text)) add("deny", "trust-store", "the approval list can only be changed with the trust script, which asks the user");
  if (/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(text)) add("deny", "fork-bomb", "fork bomb");
  if (
    /\b(bash|sh|zsh)\s+<\(\s*(curl|wget)\b/.test(text) ||
    /\b(iex|invoke-expression)\b[^|]*\b(iwr|irm|invoke-webrequest|invoke-restmethod|downloadstring)\b/i.test(text) ||
    /\b(ba|z|da|k)?sh\s+(-\w+\s+)*-\w*c\s+["']?\s*(\$\(|`)\s*(curl|wget|iwr)\b/.test(text) || // sh -c "$(curl ...)"
    /\beval\s+["']?\s*(\$\(|`)\s*(curl|wget|iwr)\b/.test(text)
  )
    add("ask", "pipe-to-shell", "downloads and runs code in one step");
  const segs = parse(text);
  const downloaded = new Set(); // names of files fetched earlier in this same command
  segs.forEach((seg, idx) => {
    const { cmd, args } = commandWord(seg.tokens);
    if (!cmd) return;
    // download now, run later: `curl -O url && sh install.sh`
    if (DOWNLOADERS.has(cmd)) {
      args.forEach((a, k) => {
        if (/^https?:\/\//i.test(a)) downloaded.add(basename(a.split("?")[0]).toLowerCase());
        if (/^(-o|--output|-O)$/.test(a) && args[k + 1] && !args[k + 1].startsWith("-")) downloaded.add(basename(args[k + 1]).toLowerCase());
      });
    } else if (downloaded.size && (downloaded.has(cmd) || (INTERPRETERS.has(cmd) && args.some((a) => downloaded.has(basename(a).toLowerCase()))))) {
      add("ask", "pipe-to-shell", "runs a file that was just downloaded, unseen");
    }
    if (seg.pipeIn && idx > 0 && INTERPRETERS.has(cmd)) {
      // Walk back along the whole pipeline: `curl url | tee x | sh` and `echo ... | base64 -d | sh` run unseen code too.
      const chain = [];
      for (let j = idx - 1; j >= 0; j--) {
        chain.push(commandWord(segs[j].tokens).cmd);
        if (!segs[j].pipeIn) break;
      }
      const dl = chain.find((c) => DOWNLOADERS.has(c));
      if (dl) add("ask", "pipe-to-shell", `${dl} piped into ${cmd} runs downloaded code unseen`);
      else if (chain.some((c) => ["base64", "xxd", "openssl", "gunzip", "zcat"].includes(c))) add("ask", "pipe-to-shell", `decoded text piped into ${cmd} runs hidden code`);
    }
    // Inline code in other languages (`python -c`, `node -e`, `perl -e` ...): look at what it deletes or runs.
    if (["python", "python3", "py", "node", "nodejs", "perl", "ruby", "php", "deno", "bun"].includes(cmd)) {
      const k = args.findIndex((a) => /^(-c|-e|-r|-E|--eval)$/.test(a));
      if (k >= 0 && args[k + 1]) inspectCode(args.slice(k + 1).join(" "), depth);
    }
    // A remote shell is still a shell: `ssh host 'rm -rf /'`.
    if (cmd === "ssh") {
      const valueOpts = new Set(["-p", "-i", "-l", "-o", "-F", "-J", "-L", "-R", "-D", "-b", "-c", "-E", "-e", "-m", "-O", "-S", "-W", "-w", "-B", "-I", "-Q"]);
      let i = 0;
      while (i < args.length && args[i].startsWith("-")) i += valueOpts.has(args[i]) ? 2 : 1;
      const remote = args.slice(i + 1).join(" ");
      if (remote) analyze(remote, depth + 1);
    }
    // Containers that can reach the whole host.
    if (["docker", "podman", "nerdctl"].includes(cmd) && args.includes("run")) {
      const mountsRoot = args.some((a, k) => (/^(-v|--volume)$/.test(a) && /^\/:/.test(args[k + 1] ?? "")) || /^(-v|--volume)=?\/:/.test(a));
      if (args.includes("--privileged") || mountsRoot) add("ask", "container-escape", "a container with the whole host disk or full privileges can change anything on this computer");
    }
    // `... | xargs rm -rf`: the targets come from elsewhere and can't be checked.
    if (cmd === "xargs") {
      let i = 0;
      while (i < args.length && args[i].startsWith("-")) i += ["-n", "-I", "-P", "-s", "-L", "-d", "-E", "-a", "-i"].includes(args[i]) ? 2 : 1;
      const sub = commandWord(args.slice(i));
      if (["rm", "rmdir", "remove-item"].includes(sub.cmd) && sub.args.some((a) => /^-[a-zA-Z]*[rR][a-zA-Z]*$/.test(a) || a === "--recursive")) add("ask", "rm-wide", "`xargs rm -r` deletes whatever is piped into it");
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
    else if (cmd === "find") checkFind(args);
    else if (["psql", "mysql", "mariadb", "sqlite3", "mongosh", "mongo", "sqlcmd", "duckdb", "redis-cli"].includes(cmd) && /\b(drop\s+(database|schema|table)|truncate\s+(table\s+)?\w+|flushall|flushdb|dropdatabase)\b|\.drop\(\)|delete\s+from\s+\w+(?![\s\S]*\bwhere\b)/i.test(args.join(" "))) add("ask", "sql-drop", "destructive database command");
    else if (/prisma\s+(migrate\s+reset|db\s+push\b.*--force-reset)|\bdb:(drop|reset)\b|manage\.py\s+flush|supabase\s+db\s+reset/.test(`${cmd} ${args.join(" ")}`)) add("ask", "db-reset", "resets or drops the database");
    // Attack and load-testing tools: only ever against this computer. Pointing one at somebody else's server is illegal
    // in most places and is never part of building an app; the red-team workflow attacks a local copy only.
    if (ATTACK_TOOLS.has(cmd) || LOAD_TOOLS.has(cmd)) checkAttackScope(cmd, args);
    // Reading, copying or SENDING a file that usually holds secrets (directly or as an upload: `curl -d @.env`).
    if (SECRET_READERS.has(cmd) && touchesSecretFile(args)) add("ask", "secret-read", "reads, copies or uploads a file that usually holds secrets");
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
