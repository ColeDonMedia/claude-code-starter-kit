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
if (!filePath || !existsSync(filePath)) done();

const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
const file = resolve(filePath);
const SKIP_DIRS = new Set(["node_modules", ".git", ".venv", "venv", "dist", "build", "target", "__pycache__", ".next"]);
if (file.split(/[\\/]/).some((part) => SKIP_DIRS.has(part))) done();

const q = (s) => `"${s}"`;
const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};

// Nearest ancestor of `start` (inside the project) that contains one of `names`.
function findUp(start, names) {
  let dir = start;
  while (dir.startsWith(root)) {
    if (names.some((n) => existsSync(join(dir, n)))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// Bounded search of the project for a file with one of `names`.
function findFile(names) {
  const queue = [root];
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

const cfg = readJson(join(root, ".claude", "kit.json")) ?? {};
if (cfg.relatedTests === false) done();

const ext = extname(file).toLowerCase();
let cmd = null;
let cwd = root;

if (typeof cfg.relatedTests === "string") {
  if (Array.isArray(cfg.extensions) && !cfg.extensions.includes(ext)) done();
  cmd = cfg.relatedTests.replaceAll("{file}", q(file));
} else if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext) && !file.endsWith(".d.ts")) {
  const dir = findUp(dirname(file), ["package.json"]);
  const pkg = dir ? readJson(join(dir, "package.json")) : null;
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  if (dir) cwd = dir;
  if (deps.vitest) cmd = `npx vitest related --run --passWithNoTests ${q(file)}`;
  else if (deps.jest) cmd = `npx jest --findRelatedTests --passWithNoTests ${q(file)}`;
} else if (ext === ".py") {
  const name = basename(file, ".py");
  const target = /^test_|_test$/.test(name) ? file : findFile([`test_${name}.py`, `${name}_test.py`]);
  if (target) cmd = `python -m pytest -q ${q(target)}`;
} else if (ext === ".go") {
  if (findUp(dirname(file), ["go.mod"])) {
    cwd = dirname(file);
    cmd = "go test .";
  }
}

if (!cmd) done();

const res = spawnSync(cmd, { cwd, shell: true, encoding: "utf8", timeout: 110_000 });
if (res.error || res.status === 0) done();

const output = `${res.stdout ?? ""}${res.stderr ?? ""}`;
// The test tool itself is missing: that is a setup problem, not a failing test.
if (/is not recognized as an internal or external command|: command not found|No module named pytest|executable file not found/i.test(output)) {
  done();
}

const tail = output.trimEnd().split("\n").slice(-30).join("\n");
process.stderr.write(`Related tests failed after editing ${file} (expected during TDD's RED step):\n$ ${cmd}\n${tail}\n`);
process.exit(2);
