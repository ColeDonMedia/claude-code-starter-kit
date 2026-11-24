// Installs a git pre-commit hook in a project so the secret scan runs on EVERY commit, whoever makes it
// (you, another tool, an editor button), not only commits Claude makes.
//   node install-git-hooks.mjs --project <folder>             install
//   node install-git-hooks.mjs --project <folder> --uninstall remove what this script installed
//
// It copies scripts/secret-scan.mjs into the project (.claude/tools/) so the hook and CI have no dependence on the
// plugin, and writes .git/hooks/pre-commit. An existing pre-commit hook that this script did not write is NEVER
// changed. If node is missing the hook lets the commit through (it must not break your commits).
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MARK = "starter-kit:pre-commit";
const args = process.argv.slice(2);
const i = args.indexOf("--project");
const project = resolve(i >= 0 && args[i + 1] ? args[i + 1] : process.cwd());
const uninstall = args.includes("--uninstall");

const hooksDir = spawnSync("git", ["rev-parse", "--git-path", "hooks"], { cwd: project, encoding: "utf8" });
if (hooksDir.status !== 0) {
  console.error("Not a git repository: nothing installed.");
  process.exit(1);
}
const hookPath = resolve(project, hooksDir.stdout.trim(), "pre-commit");
const toolPath = join(project, ".claude", "tools", "secret-scan.mjs");

if (uninstall) {
  if (existsSync(hookPath) && readFileSync(hookPath, "utf8").includes(MARK)) {
    rmSync(hookPath);
    console.log("Removed the starter-kit pre-commit hook.");
  } else console.log("No starter-kit pre-commit hook to remove.");
  process.exit(0);
}

if (existsSync(hookPath) && !readFileSync(hookPath, "utf8").includes(MARK)) {
  console.log("A pre-commit hook already exists and was not written by the starter kit; left unchanged.");
  process.exit(0);
}

mkdirSync(dirname(toolPath), { recursive: true });
copyFileSync(join(dirname(fileURLToPath(import.meta.url)), "secret-scan.mjs"), toolPath);

const script = `#!/bin/sh
# ${MARK} — blocks commits that contain secrets, env/key files or your private terms. Remove with the starter kit.
command -v node >/dev/null 2>&1 || exit 0
node ".claude/tools/secret-scan.mjs" --staged || {
  echo ""
  echo "Commit blocked: the lines above look like secrets or private data. Remove them (keep keys in a .env file that is git-ignored) and try again."
  exit 1
}
`;
mkdirSync(dirname(hookPath), { recursive: true });
writeFileSync(hookPath, script);
try {
  chmodSync(hookPath, 0o755);
} catch {
  /* not meaningful on Windows */
}
console.log(`Installed the secret-scan pre-commit hook (${hookPath}) and copied the scanner to .claude/tools/secret-scan.mjs.`);
