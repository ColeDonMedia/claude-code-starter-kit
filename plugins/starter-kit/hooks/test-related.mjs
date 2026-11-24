// PostToolUse hook: after an edit, run only the tests related to the edited file.
//
// Auto-detects Vitest, Jest, pytest and Go. Any other project can opt in with
// <project>/.claude/kit.json:
//   { "relatedTests": "bundle exec rspec {file}", "extensions": [".rb"] }
//   { "relatedTests": false }            // turn the hook off for this project
//
// On failing tests it exits 2, which feeds the output back to Claude (the edit has
// already happened, so nothing is blocked). During TDD's RED step that is expected.
// In every other case (no runner, tool missing, timeout) it stays silent and exits 0.
//
// KIT_DRY_RUN=1 prints the command it would run (and where) instead of running it.
// The tests in test-related.test.mjs use that.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";

const done = () => process.exit(0);

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let input;
try {
  input = JSON.parse(raw);
} catch {
  done();
}

const filePath = input?.tool_input?.file_path;
if (typeof filePath !== "string" || !existsSync(filePath)) done();

// The path is placed inside double quotes in a shell command. These characters would
// still be interpreted there (command substitution, variable/percent expansion).
if (/[`$"%\r\n]/.test(filePath)) done();

const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
const file = resolve(filePath);
const SKIP_DIRS = new Set(["node_modules", ".git", ".venv", "venv", "dist", "build", "target", "__pycache__", ".next"]);
if (file.split(/[\\/]/).some((part) => SKIP_DIRS.has(part))) done();

// Windows paths are case-insensitive ("C:\a" and "c:\a" are the same folder).
const norm = (p) => (process.platform === "win32" ? p.toLowerCase() : p);
const isInside = (dir, parent) => norm(dir) === norm(parent) || norm(dir).startsWith(norm(parent).replace(/[\\/]$/, "") + (process.platform === "win32" ? "\\" : "/"));

const q = (s) => `"${s}"`;
const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};

// Nearest ancestor of `start` that contains one of `names`, never going above `limit`.
function findUp(start, names, limit) {
  let dir = start;
  while (isInside(dir, limit)) {
    if (names.some((n) => existsSync(join(dir, n)))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// The checkout the edited file belongs to: the nearest folder with a .git entry.
// A git worktree has one too, so a file edited inside a worktree is tested against
// that worktree's own files, not the main checkout's.
const checkout = findUp(dirname(file), [".git"], dirname(root)) ?? root;
const base = isInside(file, checkout) ? checkout : root;

// Bounded breadth-first search of `base` for a file with one of `names`.
function findFile(names) {
  const queue = [base];
  let seen = 0;
  while (queue.length && seen < 5000) {
    const dir = queue.shift();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      seen++;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) queue.push(join(dir, e.name));
      } else if (names.includes(e.name)) {
        return join(dir, e.name);
      }
    }
  }
  return null;
}

const cfg = readJson(join(base, ".claude", "kit.json")) ?? readJson(join(root, ".claude", "kit.json")) ?? {};
if (cfg.relatedTests === false) done();

const ext = extname(file).toLowerCase();
let cmd = null;
let cwd = base;

if (typeof cfg.relatedTests === "string") {
  if (Array.isArray(cfg.extensions) && !cfg.extensions.includes(ext)) done();
  cmd = cfg.relatedTests.replaceAll("{file}", q(file));
} else if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext) && !file.endsWith(".d.ts")) {
  const dir = findUp(dirname(file), ["package.json"], base);
  const pkg = dir ? readJson(join(dir, "package.json")) : null;
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  if (dir) cwd = dir;
  // --no-install: never let npx download a test runner the project hasn't installed.
  if (deps.vitest) cmd = `npx --no-install vitest related --run --passWithNoTests ${q(file)}`;
  else if (deps.jest) cmd = `npx --no-install jest --findRelatedTests --passWithNoTests ${q(file)}`;
} else if (ext === ".py") {
  const name = basename(file, ".py");
  const target = /^test_|_test$/.test(name) ? file : findFile([`test_${name}.py`, `${name}_test.py`]);
  if (target) cmd = `python -m pytest -q ${q(target)}`;
} else if (ext === ".go") {
  if (findUp(dirname(file), ["go.mod"], base)) {
    cwd = dirname(file);
    cmd = "go test .";
  }
}

if (!cmd) done();

if (process.env.KIT_DRY_RUN) {
  process.stdout.write(`CMD: ${cmd}\nCWD: ${cwd}\n`);
  done();
}

const res = spawnSync(cmd, { cwd, shell: true, encoding: "utf8", timeout: 110_000 });
if (res.error || res.status === 0) done();

const output = `${res.stdout ?? ""}${res.stderr ?? ""}`;
// The test tool itself is missing: that is a setup problem, not a failing test.
if (/is not recognized as an internal or external command|: command not found|No module named pytest|executable file not found|npx canceled|could not determine executable/i.test(output)) {
  done();
}

const tail = output.trimEnd().split("\n").slice(-30).join("\n");
process.stderr.write(`Related tests failed after editing ${file} (expected during TDD's RED step):\n$ ${cmd}\n${tail}\n`);
process.exit(2);
