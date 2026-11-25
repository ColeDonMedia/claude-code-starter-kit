// Picks the tests that a change can affect, so a big codebase does not run its whole suite (which can take an hour) at every
// step. Uses the code index: the changed files, everything that depends on them (up to 3 steps away), and the tests that sit
// next to or are named after any of those. When it cannot be sure (a build or dependency file changed, a changed file is in a
// language the index does not cover, or too many tests are affected) it says to run the FULL suite instead. The full suite
// still runs at checkpoints and before shipping.
// Run: node scoped-tests.mjs --project <dir> [--base <commit>] [--files a b ...] [--max 300]
//      Prints one test file per line, or the single line FULL SUITE: <reason>.
import { spawnSync } from "node:child_process";
import { basename, extname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildIndex, impact, isTestFile } from "./code-index.mjs";

// Changing any of these can affect every test.
const GLOBAL = /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|tsconfig[^/]*\.json|jsconfig\.json|babel\.config\.[^/]+|\.babelrc|vite\.config\.[^/]+|vitest\.config\.[^/]+|jest\.config\.[^/]+|webpack\.config\.[^/]+|pyproject\.toml|setup\.py|setup\.cfg|requirements[^/]*\.txt|poetry\.lock|Pipfile(\.lock)?|conftest\.py|pytest\.ini|tox\.ini|go\.mod|go\.sum|Cargo\.toml|Cargo\.lock|Gemfile(\.lock)?|pom\.xml|build\.gradle(\.kts)?|settings\.gradle(\.kts)?|composer\.(json|lock)|Makefile|\.env\.example|docker-compose\.ya?ml|Dockerfile)$/;
const NON_CODE = /\.(md|txt|png|jpe?g|gif|svg|ico|webp|css|scss|less|html?|json|ya?ml|toml|lock|csv|map)$/i;

export function changedFiles(root, base) {
  const run = (...a) => spawnSync("git", ["-C", root, ...a], { encoding: "utf8" });
  const set = new Set();
  if (base) for (const f of run("diff", "--name-only", `${base}...HEAD`).stdout?.split("\n") ?? []) if (f) set.add(f);
  for (const f of run("diff", "--name-only", "HEAD").stdout?.split("\n") ?? []) if (f) set.add(f);
  for (const f of run("ls-files", "--others", "--exclude-standard").stdout?.split("\n") ?? []) if (f) set.add(f);
  return [...set];
}

const stem = (f) => basename(f, extname(f)).replace(/([._-](test|spec)|_test)$/i, "").replace(/^test_/, "").replace(/Tests?$/, "").toLowerCase();

export function selectTests(index, changed, { max = 300 } = {}) {
  const global = changed.filter((f) => GLOBAL.test(f));
  if (global.length) return { full: true, reason: `${global[0]} changed, which can affect every test` };
  const code = changed.filter((f) => !NON_CODE.test(f));
  const unknown = code.filter((f) => !index.files[f]);
  if (unknown.length) return { full: true, reason: `${unknown[0]} is not covered by the code index` };
  if (!code.length) return { full: false, tests: [], reason: "only non-code files changed" };
  const affected = new Set([...code, ...impact(index, code).map((h) => h.file)]);
  const stems = new Set([...affected].map(stem));
  const tests = new Set();
  for (const f of Object.keys(index.files)) {
    if (!isTestFile(f)) continue;
    if (affected.has(f)) tests.add(f);
    else if (stems.has(stem(f))) tests.add(f);
  }
  // a test that sits in the same folder as a changed file
  const dirs = new Set(code.map((f) => posix.dirname(f)));
  for (const f of Object.keys(index.files)) if (isTestFile(f) && dirs.has(posix.dirname(f)) && [...affected].some((a) => stem(a) === stem(f))) tests.add(f);
  if (tests.size > max) return { full: true, reason: `${tests.size} test files are affected; the full suite is simpler` };
  if (!tests.size) return { full: true, reason: "no test was found for the changed code (it may be untested); run everything and consider adding one" };
  return { full: false, tests: [...tests].sort(), affected: affected.size };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  const get = (f) => (a.includes(f) ? a[a.indexOf(f) + 1] : undefined);
  const root = resolve(get("--project") ?? ".");
  const files = a.includes("--files") ? a.slice(a.indexOf("--files") + 1).filter((x) => !x.startsWith("--")) : changedFiles(root, get("--base"));
  const { index } = buildIndex(root);
  const r = selectTests(index, files.map((f) => f.split("\\").join("/")), { max: Number(get("--max")) || 300 });
  console.log(r.full ? `FULL SUITE: ${r.reason}` : r.tests.length ? r.tests.join("\n") : `NO TESTS NEEDED: ${r.reason}`);
}
