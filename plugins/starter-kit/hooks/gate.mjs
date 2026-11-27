// The single entry point for the starter kit's hooks: `gate.mjs pre|post|stop|start`. Claude Code runs a hook as a separate
// program for every matching hook, and starting Node costs about 0.3 s each, so the old set-up made every shell command wait
// roughly 0.7 s. This runs the same individual hook scripts inside one process (see scripts/inprocess.mjs), in order:
//   pre   (before any tool)   flight recorder; for shell commands: safety, database, secret, push, package guards;
//                             for file edits: file guard, plan check; for agent launches: the model check; for web fetches: the
//                             fetch guard (no secret leaves in an address). The first block ends the run.
//   post  (after any tool)    flight recorder; after file edits: dangerous-code warning, related tests; after shell commands: quiet
//                             output; after web fetches, searches and MCP tools: the injection warning.
//   stop  (a turn ends)       flight recorder, verify gate, docs gate.
//   start (a session starts)  session note (startup, clear, compact; resume and fork: only the resume-cost line), flight
//                             recorder, auto-update (startup only).
//   subagent (one starts)     tells starter-kit subagents where the kit's scripts are.
//   substop  (one finishes)   records its token use, checks the scout's pointers, and the conductor's "merged" claim, before anyone relies on them.
//   precompact / postcompact  what a compaction summary must keep; a record that one happened.
// Every hook stays a normal script that is tested alone and through here. A hook that crashes is reported, not skipped silently.
import { pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { combine, runHook } from "../scripts/inprocess.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const url = (name) => pathToFileURL(join(HERE, `${name}.mjs`)).href;

export function pipeline(mode, input) {
  const ti = input?.tool_input ?? {};
  const tool = input?.tool_name;
  // Every shell tool gets every guard: Bash, and PowerShell on Windows (until 2.12.1 PowerShell skipped them all).
  const isShell = tool === "Bash" || tool === "PowerShell" || (!tool && typeof ti.command === "string");
  const isEdit = ["Edit", "Write", "MultiEdit"].includes(tool) || (!tool && typeof ti.file_path === "string" && typeof ti.command !== "string");
  const isAgent = tool === "Agent" || tool === "Task";
  const isOutside = tool === "WebFetch" || tool === "WebSearch" || /^mcp__/.test(String(tool ?? "")); // content written by strangers
  if (mode === "pre") return ["flight-recorder", ...(isShell ? ["safety-guard", "db-guard", "secret-guard", "push-gate", "package-guard"] : isEdit ? ["file-guard", "plan-gate"] : isAgent ? ["agent-route"] : tool === "WebFetch" ? ["fetch-guard"] : [])];
  if (mode === "post") return ["flight-recorder", ...(isEdit ? ["code-warn", "test-related"] : isShell ? ["quiet-output"] : isOutside ? ["inject-warn"] : [])];
  if (mode === "stop") return ["flight-recorder", "verify-gate", "docs-gate"];
  // A resumed or forked chat already holds the note; session-start then only says what resuming costs, when it is worth saying.
  if (mode === "start") return [...(["startup", "clear", "compact", "resume", "fork", undefined].includes(input?.source) ? ["session-start"] : []), "flight-recorder", ...(input?.source === "startup" ? ["auto-update"] : [])];
  if (mode === "subagent") return ["subagent-start"];
  if (mode === "substop") return ["flight-recorder", "scout-check", "conductor-check"];
  if (mode === "precompact") return ["compact-notes"];
  if (mode === "postcompact" || mode === "postfail") return ["flight-recorder"]; // a failed tool call is recorded as failed, not as blocked
  return [];
}

export async function main(mode, only = null) {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let input = {};
  try {
    input = JSON.parse(raw);
  } catch {
    /* each hook handles unparseable input itself */
  }
  const names = only ?? pipeline(mode, input); // `only` is for tests: run exactly these hooks, whatever the input looks like
  // A shell command that could not be checked is refused (exit 2 blocks it). Everywhere else a broken hook only warns, so a bug
  // can never lock a session; the refusal says how to find out what is wrong.
  const failClosed = mode === "pre" && (input?.tool_name === "Bash" || input?.tool_name === "PowerShell" || (!input?.tool_name && typeof input?.tool_input?.command === "string"));
  const results = [];
  let broken = null;
  try {
    for (const name of names) {
      const r = await runHook(url(name), raw);
      results.push(r);
      if (r.crashed && !broken) broken = `${name}: ${String(r.crashed?.message ?? r.crashed).split("\n")[0]}`;
      // A block or a refusal settles it: skip the rest (saves time, and never runs a network check for a command that is refused).
      if (r.code === 2 || /"permissionDecision":\s*"deny"/.test(r.out)) break;
    }
  } catch (e) {
    broken = `the hook runner: ${String(e?.message ?? e).split("\n")[0]}`;
  }
  const c = combine(results);
  if (broken && failClosed && c.code !== 2 && !/"permissionDecision":\s*"deny"/.test(c.stdout)) {
    process.stderr.write(`A starter-kit guard crashed, so this command was not checked and was not run (${broken}). Tell the user, and run the kit's doctor: node "${join(HERE, "..", "scripts", "doctor.mjs")}" --project .\n`);
    process.exitCode = 2;
    return;
  }
  if (c.stdout) process.stdout.write(c.stdout);
  if (c.stderr) process.stderr.write(c.stderr);
  process.exitCode = c.code;
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === resolve(fileURLToPath(import.meta.url)).toLowerCase()) {
  const only = process.env.KIT_GATE_ONLY ? process.env.KIT_GATE_ONLY.split(",") : null;
  await main(process.argv[2], only);
}
