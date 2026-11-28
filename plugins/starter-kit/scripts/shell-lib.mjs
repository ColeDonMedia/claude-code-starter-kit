// Reads a shell command the way a shell would, shared by the guards (safety guard, push gate, secret guard) so they all see the
// same commands: quotes, ; && || | and newlines, `bash -c "..."`, PowerShell's backtick escapes and script blocks, environment
// assignments and wrappers in front of a command (`FOO=1 git push`, `time git push`, `command git push`). Reads only; runs nothing.
import { basename } from "node:path";

export const WRAPPERS = new Set(["sudo", "doas", "env", "command", "nohup", "time", "nice", "exec", "builtin", "stdbuf"]);
export const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh", "fish", "pwsh", "powershell", "cmd"]);
// Shell grammar words that can sit in front of a command (`{ rm -rf /; }`, `if x; then rm -rf /; fi`).
export const RESERVED = new Set(["{", "}", "!", "then", "do", "else", "elif", "if", "while", "until"]);
// Options of each wrapper that take a value (so the value isn't mistaken for the command). `sudo -n` takes none.
export const WRAPPER_VALUE_OPTS = {
  sudo: ["-u", "-g", "-C", "-p", "-r", "-t", "-U", "-h", "-D", "-R"],
  doas: ["-u", "-C"],
  env: ["-u", "-C", "-S"],
  nice: ["-n"],
  exec: ["-a"],
  stdbuf: ["-i", "-o", "-e"],
};

// Splits a command into segments of words. ps: read it the PowerShell way (backtick escapes, backslash is a plain character,
// `{ }` holds script blocks). Each segment says whether it reads a pipe.
export function parse(cmd, ps = false) {
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
      else if (ps && quote === '"' && c === "`" && i + 1 < cmd.length) cur += cmd[++i]; // PowerShell escapes with a backtick
      else if (!ps && quote === '"' && c === "\\" && (cmd[i + 1] === '"' || cmd[i + 1] === "\\")) {
        cur += cmd[++i]; // in PowerShell a backslash is a plain character: "C:\" is the string C:\
      } else cur += c;
      continue;
    }
    if (ps && c === "`") {
      // PowerShell: a backtick escapes the next character, and a backtick at the end of a line continues the command
      const n = cmd[i + 1];
      if (n === "\r" || n === "\n") {
        i += n === "\r" && cmd[i + 2] === "\n" ? 2 : 1;
        endToken();
      } else if (n !== undefined) {
        cur += n;
        has = true;
        i++;
      }
      continue;
    }
    if (ps && (c === "{" || c === "}")) {
      endSeg(false); // a script block: its contents are commands too
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

// The command a segment runs, past assignments, grammar words and wrappers: `FOO=1 sudo -u x git push` -> git, [push].
export function commandWord(tokens) {
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

// Every command in a command line, including those inside `bash -c "..."`, `powershell -Command ...`, `cmd /c`, `eval` and
// `Invoke-Expression`, each as { cmd, args }. Three levels deep at most.
export function commandsIn(text, ps = false, depth = 0) {
  const out = [];
  if (depth > 3 || typeof text !== "string") return out;
  for (const seg of parse(text, ps)) {
    const w = commandWord(seg.tokens);
    if (!w.cmd) continue;
    out.push(w);
    const { cmd, args } = w;
    if (cmd === "powershell" || cmd === "pwsh") {
      const k = args.findIndex((a) => /^-(c|co|com|comm|comma|comman|command)$/i.test(a));
      if (k >= 0 && args[k + 1]) out.push(...commandsIn(args.slice(k + 1).join(" "), true, depth + 1));
    } else if (SHELLS.has(cmd)) {
      const k = args.findIndex((a) => /^(-c|-command|\/c|\/k)$/i.test(a) || /^-[a-z]*c$/.test(a));
      if (k >= 0 && args[k + 1]) out.push(...commandsIn(args.slice(k + 1).join(" "), false, depth + 1));
    } else if (cmd === "eval" && args.length) out.push(...commandsIn(args.join(" "), ps, depth + 1));
    else if ((cmd === "iex" || cmd === "invoke-expression") && args.length) out.push(...commandsIn(args.filter((a) => !/^-command$/i.test(a)).join(" "), true, depth + 1));
  }
  return out;
}

// git's own options come before the subcommand: `git -C dir -c a=b --no-pager push` -> { sub: "push", rest: [...] }.
const GIT_VALUE_OPTS = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--config-env"]);
export function gitSubcommand(args) {
  let i = 0;
  while (i < args.length && args[i].startsWith("-")) i += GIT_VALUE_OPTS.has(args[i]) ? 2 : 1;
  return { sub: args[i] ?? "", rest: args.slice(i + 1) };
}

// Git Bash writes drive C: as /c/ and WSL as /mnt/c/; the same folder, in the spelling the rest of the kit understands (c:/...).
export function nativePath(p) {
  const m = String(p).match(/^\/(?:mnt\/)?([a-z])(\/.*)?$/i);
  return m ? `${m[1].toLowerCase()}:${m[2] ?? "/"}` : String(p);
}
