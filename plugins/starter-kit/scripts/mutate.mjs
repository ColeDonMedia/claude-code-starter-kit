// Mutation testing: do the tests notice when the code is wrong?
//   node mutate.mjs --project <worktree> --test "<test command>" [--files a.js,b.py | --diff <base-ref>] [--max 30] [--timeout 120000]
//
// It makes small deliberate mistakes in the code (flips a comparison, swaps && and ||, turns true into false ...),
// one at a time, and runs the tests after each. A test run that STILL PASSES means no test checks that behavior:
// that mutant "survived" and points at a weak or missing test. A failing run means the tests caught it ("killed").
// Mutants that merely fail to compile are discarded, not counted.
//
// Safety: it edits source files in place, so it refuses to run in your main checkout. Run it in a git worktree (the
// red-team and feature builds already work in one). Every file is restored afterwards, even on Ctrl-C or a crash.
// Language-agnostic (text-level), so it works for any project that has a test command; expect some noise.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

// ---------- the mistakes it makes ----------
// [pattern (first match on a line), replacement, label]
export const OPERATORS = [
  [/===/, "!==", "=== to !=="],
  [/!==/, "===", "!== to ==="],
  [/(\s)==(\s)/, "$1!=$2", "== to !="],
  [/(\s)!=(\s)/, "$1==$2", "!= to =="],
  [/&&/, "||", "&& to ||"],
  [/\|\|/, "&&", "|| to &&"],
  [/(\s)and(\s)/, "$1or$2", "and to or"],
  [/(\s)or(\s)/, "$1and$2", "or to and"],
  [/>=/, ">", ">= to >"],
  [/<=/, "<", "<= to <"],
  [/([^=<>\-])>([^=>])/, "$1>=$2", "> to >="],
  [/([^=<>!-])<([^=<])/, "$1<=$2", "< to <="],
  [/(\w\s)\+(\s\w)/, "$1-$2", "+ to -"],
  [/(\w\s)-(\s\w)/, "$1+$2", "- to +"],
  [/\btrue\b/, "false", "true to false"],
  [/\bfalse\b/, "true", "false to true"],
  [/\bTrue\b/, "False", "True to False"],
  [/\bFalse\b/, "True", "False to True"],
  [/\bif\s*\(\s*!/, "if (", "removed a negation"],
  [/\breturn\s+(?!;)([^;]+?);?\s*$/, "return null;", "return value replaced by null"],
];

const SKIP_LINE = /^\s*(\/\/|#|\*|\/\*|import\s|from\s.+\simport|require\(|export\s+\*|package\s|using\s)/;
const CODE_EXT = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".py", ".go", ".rb", ".java", ".cs", ".rs", ".php", ".kt", ".swift", ".c", ".cpp", ".h"]);
const TESTY = /(^|[\\/])(tests?|__tests__|spec|specs|e2e)[\\/]|\.(test|spec)\.|_test\.|test_[^\\/]*$/i;

export function mutantsForLine(line) {
  if (SKIP_LINE.test(line)) return [];
  const out = [];
  for (const [re, rep, label] of OPERATORS) {
    const m = re.exec(line);
    if (!m) continue;
    const mutated = line.replace(re, rep);
    if (mutated !== line) out.push({ mutated, label });
  }
  return out;
}

// A failing run can mean "the tests caught it" or "the mutant doesn't even compile". Only the first counts.
export function looksLikeBrokenBuild(output) {
  return /SyntaxError|ParseError|Unexpected token|error TS\d+|cannot find symbol|compilation (error|failed)|failed to compile|IndentationError|invalid syntax|expected .* found|undefined: |could not compile/i.test(output);
}

// ---------- running ----------
function git(root, ...a) {
  return spawnSync("git", a, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}
function inLinkedWorktree(root) {
  const dir = git(root, "rev-parse", "--git-dir").stdout.trim();
  const common = git(root, "rev-parse", "--git-common-dir").stdout.trim();
  return Boolean(dir) && resolve(root, dir) !== resolve(root, common);
}
function changedLines(root, base, file) {
  const d = git(root, "diff", "-U0", base, "--", file).stdout ?? "";
  const lines = new Set();
  for (const m of d.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(m[1]);
    const n = m[2] === undefined ? 1 : Number(m[2]);
    for (let i = 0; i < n; i++) lines.add(start + i);
  }
  return lines;
}
function runTests(root, cmd, timeout) {
  // A test command must not inherit another test runner's state (Node's runner marks child processes through the
  // environment, and a nested `node --test` would then run no tests at all and still "pass").
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(cmd, { cwd: root, shell: true, encoding: "utf8", timeout, maxBuffer: 64 * 1024 * 1024, env });
  return { ok: r.status === 0 && !r.error, timedOut: Boolean(r.error && /ETIMEDOUT/.test(String(r.error.code))), out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

export function mutate({ project, test, files, base, max = 30, timeout = 120000 }) {
  const root = resolve(project);
  if (!inLinkedWorktree(root) && process.env.KIT_ALLOW_MUTATE !== "1") {
    return { error: "Refusing to edit source files in the main checkout. Run this in a git worktree (a separate copy of the project)." };
  }
  const base0 = runTests(root, test, timeout);
  if (!base0.ok) return { error: "The tests fail before any change was made, so mutation testing can't say anything. Fix the failing tests first.", output: base0.out.split("\n").slice(-15).join("\n") };

  let targets = files;
  if (!targets || !targets.length) {
    const names = base ? (git(root, "diff", "--name-only", base).stdout ?? "").split("\n").filter(Boolean) : (git(root, "ls-files").stdout ?? "").split("\n").filter(Boolean);
    targets = names;
  }
  targets = targets.filter((f) => CODE_EXT.has(extname(f).toLowerCase()) && !TESTY.test(f));

  // Build the list of mistakes to try, then sample evenly if there are too many.
  const all = [];
  for (const f of targets) {
    let text;
    try {
      text = readFileSync(join(root, f), "utf8");
    } catch {
      continue;
    }
    const only = base ? changedLines(root, base, f) : null;
    text.split("\n").forEach((line, i) => {
      if (only && !only.has(i + 1)) return;
      for (const m of mutantsForLine(line)) all.push({ file: f, line: i + 1, original: line, mutated: m.mutated, label: m.label });
    });
  }
  const step = Math.max(1, Math.ceil(all.length / max));
  const picked = all.filter((_, i) => i % step === 0).slice(0, max);

  const result = { total: all.length, tried: 0, killed: 0, survived: [], invalid: 0, timedOut: 0 };
  let current = null; // { path, original } so a crash or Ctrl-C can still put the file back
  const restore = () => {
    if (current) {
      try {
        writeFileSync(current.path, current.original);
      } catch {
        /* last resort */
      }
      current = null;
    }
  };
  process.once("exit", restore);
  const onSignal = () => {
    restore();
    process.exit(130);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    for (const m of picked) {
      const path = join(root, m.file);
      const original = readFileSync(path, "utf8");
      const lines = original.split("\n");
      lines[m.line - 1] = m.mutated;
      current = { path, original };
      writeFileSync(path, lines.join("\n"));
      const r = runTests(root, test, timeout);
      restore();
      if (r.ok) result.survived.push({ file: m.file, line: m.line, change: m.label, was: m.original.trim().slice(0, 100), now: m.mutated.trim().slice(0, 100) });
      else if (r.timedOut) {
        result.timedOut++;
        result.killed++;
      } else if (looksLikeBrokenBuild(r.out)) result.invalid++;
      else result.killed++;
      result.tried++;
    }
  } finally {
    restore();
  }
  const counted = result.killed + result.survived.length;
  result.score = counted ? Math.round((result.killed / counted) * 100) : null;
  return result;
}

// ---------- CLI ----------
if (process.argv[1] && basename(process.argv[1]) === "mutate.mjs") {
  const arg = (n) => {
    const i = process.argv.indexOf(n);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const project = arg("--project");
  const test = arg("--test");
  if (!project || !test) {
    console.error('usage: mutate.mjs --project <worktree> --test "<test command>" [--files a,b | --diff <base>] [--max 30] [--timeout 120000]');
    process.exit(64);
  }
  const r = mutate({ project, test, files: arg("--files")?.split(",").filter(Boolean), base: arg("--diff"), max: Number(arg("--max") ?? 30), timeout: Number(arg("--timeout") ?? 120000) });
  if (r.error) {
    console.log(`Mutation testing did not run: ${r.error}${r.output ? "\n" + r.output : ""}`);
    process.exit(1);
  }
  console.log(`Mutation test: tried ${r.tried} of ${r.total} possible mistakes, tests caught ${r.killed}, missed ${r.survived.length}, ${r.invalid} discarded (did not compile)${r.score === null ? "" : `. Score ${r.score}%`}`);
  for (const s of r.survived) console.log(`MISSED ${s.file}:${s.line} (${s.change})  was: ${s.was}   now: ${s.now}`);
  if (r.survived.length) console.log("Each MISSED line is behavior no test checks: add a test that fails when that line is wrong.");
}
