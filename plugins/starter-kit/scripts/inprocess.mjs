// Runs the kit's hook scripts inside ONE process instead of one process each. On a typical Windows machine starting Node costs
// about 0.3 s, and every shell command used to start six or seven hook processes at once (roughly 0.7 s of waiting per command).
// Each hook is still the same unchanged script, tested on its own: this feeds it the input on a stand-in stdin, captures what it
// prints and the exit code it asks for (instead of really exiting), and then combines the answers the way Claude Code does
// (a block beats a question beats an allow). A hook that crashes is reported, never silently skipped.
import { Readable } from "node:stream";

class ExitSignal extends Error {}

export async function runHook(url, rawInput) {
  const saved = {
    exit: process.exit,
    out: process.stdout.write,
    err: process.stderr.write,
    stdin: Object.getOwnPropertyDescriptor(process, "stdin"),
    exitCode: process.exitCode,
  };
  let out = "";
  let err = "";
  let exited = null;
  const text = (s) => (typeof s === "string" ? s : Buffer.from(s).toString("utf8"));
  const done = (a) => {
    const cb = a.find((x) => typeof x === "function");
    if (cb) cb();
    return true;
  };
  process.exitCode = undefined;
  // The FIRST exit counts: if a hook's own catch-all swallowed the signal, whatever it did afterwards is ignored.
  process.exit = (code) => {
    if (exited === null) exited = { code: code ?? process.exitCode ?? 0 };
    throw new ExitSignal("exit");
  };
  process.stdout.write = (s, ...rest) => ((out += text(s)), done(rest));
  process.stderr.write = (s, ...rest) => ((err += text(s)), done(rest));
  Object.defineProperty(process, "stdin", { value: Readable.from([rawInput]), configurable: true });
  let crashed = null;
  try {
    await import(`${url}?run=${process.hrtime.bigint()}`);
  } catch (e) {
    if (!(e instanceof ExitSignal) && exited === null) crashed = e;
  } finally {
    process.exit = saved.exit;
    process.stdout.write = saved.out;
    process.stderr.write = saved.err;
    if (saved.stdin) Object.defineProperty(process, "stdin", saved.stdin);
  }
  const code = exited ? exited.code : (process.exitCode ?? 0);
  process.exitCode = saved.exitCode;
  return { code: Number(code) || 0, out, err, crashed };
}

// Combine several hooks' results into the single answer Claude Code expects.
export function combine(results) {
  const blocked = results.filter((r) => r.code === 2);
  const decisions = [];
  const context = [];
  const plain = [];
  for (const r of results) {
    if (!r.out.trim()) continue;
    let j = null;
    try {
      j = JSON.parse(r.out);
    } catch {
      /* plain text */
    }
    const h = j?.hookSpecificOutput;
    if (h?.permissionDecision) decisions.push({ level: h.permissionDecision, reason: h.permissionDecisionReason ?? "", event: h.hookEventName });
    else if (h?.additionalContext !== undefined) context.push(h);
    else if (j && typeof j === "object") plain.push(r.out);
    else plain.push(r.out);
  }
  const crashed = results.filter((r) => r.crashed);
  // A block is fed back as text; warnings from other hooks in the same run go with it, so a failing test never hides one.
  if (blocked.length) return { code: 2, stdout: "", stderr: [...blocked.map((r) => r.err.trim()), ...context.map((c) => c.additionalContext)].filter(Boolean).join("\n") + "\n" };
  if (decisions.length) {
    const level = decisions.some((d) => d.level === "deny") ? "deny" : decisions.some((d) => d.level === "ask") ? "ask" : decisions[0].level;
    const reason = [...new Set(decisions.filter((d) => d.level === level).map((d) => d.reason))].join("\n");
    return { code: 0, stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: decisions[0].event ?? "PreToolUse", permissionDecision: level, permissionDecisionReason: reason } }), stderr: "" };
  }
  if (context.length) {
    return { code: 0, stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: context[0].hookEventName, additionalContext: context.map((c) => c.additionalContext).join("\n\n") } }), stderr: "" };
  }
  const other = results.find((r) => r.code !== 0 && r.code !== 2);
  if (crashed.length || other) {
    const msg = crashed.map((r) => `a starter-kit hook crashed: ${String(r.crashed?.message ?? r.crashed).split("\n")[0]}`).join("\n");
    return { code: 1, stdout: plain.join(""), stderr: (msg + "\n" + (other?.err ?? "")).trim() + "\n" };
  }
  return { code: 0, stdout: plain.join(""), stderr: results.map((r) => r.err).join("") };
}
