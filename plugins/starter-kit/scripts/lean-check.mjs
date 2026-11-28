// Lean check: what a change leaves behind that a careful programmer would not. It reads only the lines the change ADDED since a
// base commit (old problems are not this change's), in any language, and prints two kinds of line:
//   BLOCKING  provable leftovers: a debugger statement, a focused test (.only: the rest of the suite silently stops running), a
//             merge-conflict marker, a package added to package.json that nothing in the project imports or names.
//   CHECK     a question the builder and the reviewer must each answer by opening the line: debug output, a TODO, commented-out
//             code, a skipped test, a silenced type or lint check, an empty catch, a new file nothing refers to, a very long new file.
// plus one WEIGHT line: how big the change is (files, lines, tests against code, new packages), so "is this bigger than the job
// needed?" is asked of a number. Pattern matching, not proof of good design: it cannot see a clumsy structure, only its litter.
//   node lean-check.mjs --project <dir> --base <commit> [--json]      exit 0 nothing blocks, 1 something blocks, 2 bad usage
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { addedLines } from "./dup-check.mjs";
import { isTestFile } from "./code-index.mjs";

const FAMILY = {
  js: /\.(m?[jt]sx?|c[jt]s|svelte|vue|astro)$/i, py: /\.py$/i, rb: /\.rb$/i, rs: /\.rs$/i, php: /\.php$/i, go: /\.go$/i,
  java: /\.(java|scala)$/i, cs: /\.cs$/i, app: /\.(kts?|swift|dart)$/i, sh: /\.(sh|bash|zsh|ps1)$/i, c: /\.(c|cc|cpp|cxx|h|hpp)$/i,
  other: /\.(sql|css|scss|sass|less|html?)$/i,
};
const SKIP = /(^|\/)(node_modules|dist|build|out|vendor|coverage|target|\.next|\.nuxt|\.svelte-kit|__pycache__|\.venv|venv)\//i;
export const familyOf = (file) => (SKIP.test(file) || /\.min\./.test(file) ? null : Object.keys(FAMILY).find((k) => FAMILY[k].test(file)) ?? null);

const DEBUGGER = {
  js: /^\s*debugger\s*;?\s*(\/\/.*)?$/,
  py: /^\s*(breakpoint\(\)|import\s+i?pdb\b|i?pdb\.set_trace\(\))/,
  rb: /^\s*(binding\.(pry|irb)|byebug|debugger)\b/,
  rs: /\bdbg!\s*\(/,
  php: /^\s*(var_dump|dd)\s*\(/,
};
const DEBUG_OUTPUT = {
  js: /^\s*console\.(log|debug|trace|dir)\s*\(/, py: /^\s*print\s*\(/, go: /^\s*fmt\.Print(ln|f)?\s*\(/, java: /^\s*System\.(out|err)\.print/,
  cs: /^\s*Console\.Write(Line)?\s*\(/, app: /^\s*print(ln)?\s*\(/, rb: /^\s*(puts|pp)\s+\S/, rs: /^\s*e?println!\s*\(/, php: /^\s*(print_r|error_log)\s*\(/,
};
const FOCUSED = /\b(describe|it|test|context|suite)\.only\s*\(|^\s*(fdescribe|fit)\s*\(/;
const SKIPPED = /\b(describe|it|test|context|suite)\.(skip|todo)\s*\(|^\s*(xit|xdescribe|xtest)\s*\(|@pytest\.mark\.skip|@unittest\.skip|\bt\.Skip\(|#\[ignore\]|@Disabled\b|@Ignore\b/;
const SILENCED = /@ts-ignore|@ts-nocheck|@ts-expect-error|eslint-disable|biome-ignore|\bas any\b|#\s*type:\s*ignore|#\s*noqa|#\s*nosec|\/\/\s*nolint|@SuppressWarnings|#\[allow\(|#pragma warning disable|rubocop:disable|phpcs:ignore/;
const TODO = /(\/\/|#|\/\*|^\s*\*|<!--).*\b(TODO|FIXME|HACK|XXX)\b/;
const CONFLICT = /^(<{7}( |$)|={7}$|>{7}( |$))/;
const HASH_COMMENTS = new Set(["py", "rb", "sh", "php"]);

// A comment line whose text reads as code (an assignment, a call, a statement keyword, a brace or semicolon at the end).
function commentedCode(family, text) {
  const m = HASH_COMMENTS.has(family) ? /^\s*#(?![!\[])\s?(.*)$/.exec(text) : null;
  const s = (m ?? (family !== "py" && family !== "rb" && family !== "sh" ? /^\s*\/\/\s?(.*)$/.exec(text) : null))?.[1]?.trim();
  if (!s) return false;
  return (
    /[;{}]$/.test(s) ||
    /^(const|let|var|return|import|export|if|for|while|def|class|await|function|else|elif|try|except|public|private)\b.*[=(:{]/.test(s) ||
    /^[\w.$\[\]'"]+\s*[+\-*]?=\s*\S+$/.test(s) ||
    /^[\w.$]+\([^)]*\)$/.test(s)
  );
}

// One file's added lines: [{ n, text }] in order. Returns { blocking: [{ kind, text }], checks: [{ kind, text }] }.
export function scanLines(file, lines) {
  const blocking = [];
  const checks = [];
  const family = familyOf(file.replace(/\\/g, "/"));
  if (!family) return { blocking, checks };
  const isTest = isTestFile(file.replace(/\\/g, "/"));
  const at = (n) => `${file}:${n}`;
  const byN = new Map(lines.map((l) => [l.n, l.text]));
  let run = [];
  const endRun = () => {
    if (run.length >= 3) checks.push({ kind: "COMMENTED-OUT CODE", text: `${file}:${run[0]}-${run[run.length - 1]} looks like code left in comments. Delete it: git remembers it.` });
    run = [];
  };
  // A command-line program's console output is its real output, not a leftover.
  const printsForALiving = isTest || /(^|\/)(scripts|bin|tasks|commands|cli)\//i.test(file) || /(^|\/)(cli|main)\.[^./]+$/i.test(file);
  for (const { n, text: raw } of lines) {
    // What a line says inside quotes is data, not code: `const help = "remove the debugger"` leaves nothing behind.
    const text = raw.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""');
    if (CONFLICT.test(raw)) blocking.push({ kind: "CONFLICT MARKER", text: `${at(n)} a merge-conflict marker was left in the file.` });
    if (DEBUGGER[family]?.test(text)) blocking.push({ kind: "DEBUGGER", text: `${at(n)} a debugger statement was left in: ${raw.trim().slice(0, 60)}` });
    if (FOCUSED.test(text)) blocking.push({ kind: "FOCUSED TEST", text: `${at(n)} a focused test (.only) makes every other test in the file stop running.` });
    if (SKIPPED.test(text)) checks.push({ kind: "SKIPPED TEST", text: `${at(n)} a test is skipped. A skipped test proves nothing: make it pass, or delete it and say why.` });
    if (!printsForALiving && DEBUG_OUTPUT[family]?.test(text)) checks.push({ kind: "DEBUG OUTPUT", text: `${at(n)} prints to the console. Remove it unless this is the program's real output.` });
    if (TODO.test(text)) checks.push({ kind: "TODO", text: `${at(n)} leaves a TODO. Do it now, or move it to PROJECT.md's known problems.` });
    if (!isTest && SILENCED.test(text)) checks.push({ kind: "SILENCED CHECK", text: `${at(n)} switches a type or lint check off. Fix what it complains about, or say why it is wrong here.` });
    const next = byN.get(n + 1);
    if (/catch\s*(\([^)]*\))?\s*\{\s*\}/.test(text) || (/catch\s*(\([^)]*\))?\s*\{\s*$/.test(text) && /^\s*\}/.test(next ?? "x")) || /^\s*except\b[^:]*:\s*pass\s*$/.test(text) || (/^\s*except\b[^:]*:\s*$/.test(text) && /^\s*pass\s*$/.test(next ?? "")))
      checks.push({ kind: "EMPTY CATCH", text: `${at(n)} swallows an error silently. Handle it, or say in a comment why nothing needs doing.` });
    if (commentedCode(family, raw) && (run.length === 0 || run[run.length - 1] === n - 1)) run.push(n);
    else {
      endRun();
      if (commentedCode(family, raw)) run.push(n);
    }
  }
  endRun();
  return { blocking, checks };
}

const git = (project, ...args) => spawnSync("git", ["-C", project, ...args], { encoding: "utf8", maxBuffer: 1 << 28 });
// Any other file in the project that names this text (tracked or new, lockfiles and package manifests aside).
function mentioned(project, text, except) {
  const r = git(project, "grep", "-l", "--untracked", "-F", "-e", text, "--", ".", ":(exclude)*package.json", ":(exclude)*lock*", ":(exclude)*.lock", ...(except ? [`:(exclude)${except}`] : []));
  return (r.stdout ?? "").trim().length > 0;
}

// Packages a tool reads from its settings without the code ever importing them by name.
const IMPLICIT = /^(@types\/|typescript$|tslib$|postcss$|autoprefixer$|eslint-(plugin|config)-|@[^/]+\/eslint-(plugin|config)|prettier-plugin-)/;
const DEP_BLOCKS = ["dependencies", "devDependencies", "optionalDependencies"];
const depNames = (pkg) => new Set(DEP_BLOCKS.flatMap((b) => Object.keys(pkg?.[b] ?? {})));
function newDependencies(project, base, file) {
  const parse = (s) => {
    try {
      return JSON.parse(s);
    } catch {
      return {};
    }
  };
  const now = parse(readFileSync(join(project, file), "utf8"));
  const old = depNames(parse(git(project, "show", `${base}:${file}`).stdout ?? ""));
  const added = [...depNames(now)].filter((n) => !old.has(n));
  const rest = JSON.stringify({ ...now, dependencies: 0, devDependencies: 0, optionalDependencies: 0, peerDependencies: 0 });
  const unused = added.filter((name) => {
    if (IMPLICIT.test(name) || rest.includes(name) || mentioned(project, name)) return false;
    // A command-line tool is used by the name of its command, not its package (typescript -> tsc).
    let bins = [];
    try {
      const bin = JSON.parse(readFileSync(join(project, file, "..", "node_modules", name, "package.json"), "utf8")).bin;
      bins = typeof bin === "string" ? [basename(name)] : Object.keys(bin ?? {});
    } catch {
      /* not installed here: judged by its name alone */
    }
    return !bins.some((b) => rest.includes(b) || mentioned(project, b));
  });
  return { added, unused };
}

// Names that a framework or a person runs directly, so nothing has to import them.
const ENTRY_NAME = /^(index|main|app|server|cli|setup|conftest|__init__|manage|mod|lib|worker|middleware|instrumentation)$|^\+|\.config$|\.d$|\.stories$/i;
const ENTRY_DIR = /(^|\/)(pages|routes|app|api|migrations|scripts|bin|public|e2e|functions|commands|tasks|seeds?)\//i;
const IMPORTED_BY_PATH = new Set(["js", "py", "rs"]);

export function run(project, { base } = {}) {
  project = resolve(project);
  const added = addedLines(project, base);
  const blocking = [];
  const checks = [];
  const weight = { files: 0, added: 0, removed: 0, testLines: 0, codeLines: 0, newFiles: 0, newDependencies: 0 };
  for (const [file, set] of added) {
    const abs = join(project, file);
    if (!existsSync(abs) || !statSync(abs).isFile()) continue;
    weight.files++;
    const isNew = git(project, "cat-file", "-e", `${base}:${file}`).status !== 0;
    if (isNew) weight.newFiles++;
    if (basename(file) === "package.json" && !SKIP.test(file)) {
      const d = newDependencies(project, base, file);
      weight.newDependencies += d.added.length;
      for (const name of d.unused) blocking.push({ kind: "UNUSED DEPENDENCY", text: `${file} adds "${name}", but nothing in the project imports or names it. Remove it (every package is code someone else can change).` });
    }
    const family = familyOf(file);
    if (!family || statSync(abs).size > 2_000_000) continue;
    const all = readFileSync(abs, "utf8").split("\n");
    const lines = [...set].sort((a, b) => a - b).filter((n) => n <= all.length).map((n) => ({ n, text: all[n - 1] }));
    const real = lines.filter((l) => l.text.trim()).length;
    weight.added += real;
    if (isTestFile(file)) weight.testLines += real;
    else weight.codeLines += real;
    const found = scanLines(file, lines);
    blocking.push(...found.blocking);
    checks.push(...found.checks);
    if (isNew && !isTestFile(file) && family !== "other") {
      const stem = basename(file, extname(file));
      if (all.length > 400) checks.push({ kind: "LONG FILE", text: `${file} is new and ${all.length} lines long. One file, one job: split it by what each part is for, or say why it belongs together.` });
      if (IMPORTED_BY_PATH.has(family) && !ENTRY_NAME.test(stem) && !ENTRY_DIR.test(file) && !mentioned(project, stem, file))
        checks.push({ kind: "NOT REFERENCED", text: `${file} is new, and no other file imports or names it. Wire it in, or delete it.` });
    }
  }
  for (const l of (git(project, "diff", "--numstat", base, "--").stdout ?? "").split("\n")) {
    const m = /^(\d+)\t(\d+)\t/.exec(l);
    if (m) weight.removed += Number(m[2]);
  }
  return { blocking, checks, weight };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  const val = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : undefined);
  const base = val("--base");
  if (!base) {
    console.log("Use: node lean-check.mjs --project <dir> --base <commit> [--json]");
    process.exit(2);
  }
  let r;
  try {
    r = run(val("--project") ?? ".", { base });
  } catch (e) {
    console.log(`lean-check could not read the change: ${String(e?.message ?? e).split("\n")[0]}`);
    process.exitCode = 2;
  }
  if (r && a.includes("--json")) console.log(JSON.stringify(r));
  else if (r) {
    const w = r.weight;
    for (const b of r.blocking) console.log(`BLOCKING ${b.kind}: ${b.text}`);
    const byKind = new Map();
    for (const c of r.checks) byKind.set(c.kind, [...(byKind.get(c.kind) ?? []), c]);
    for (const [kind, list] of byKind) {
      for (const c of list.slice(0, 8)) console.log(`CHECK ${kind}: ${c.text}`);
      if (list.length > 8) console.log(`CHECK ${kind}: and ${list.length - 8} more of the same kind.`);
    }
    console.log(`WEIGHT: ${w.files} file${w.files === 1 ? "" : "s"} (${w.newFiles} new), +${w.added} -${w.removed} lines (code +${w.codeLines}, tests +${w.testLines}), ${w.newDependencies} new package${w.newDependencies === 1 ? "" : "s"}.`);
    if (!r.blocking.length && !r.checks.length) console.log("LEAN OK: the change leaves nothing behind.");
    else console.log(`${r.blocking.length} blocking, ${r.checks.length} to check. Fix every BLOCKING line. Open every CHECK line and either fix it or say in your report why it stays.`);
  }
  if (r) process.exitCode = r.blocking.length ? 1 : 0;
}
