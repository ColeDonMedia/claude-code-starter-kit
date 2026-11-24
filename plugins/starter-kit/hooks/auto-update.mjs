// SessionStart hook: keep this plugin up to date without anyone typing a command.
//
// Launcher mode (the hook itself): decides whether an update check is due, starts a detached background
// worker, and exits immediately, so it never slows a session down. Worker mode (`--worker`): refreshes the
// marketplace and updates the plugin, then writes the outcome to a log. A new version takes effect the next
// time Claude Code starts.
//
// It only ever runs these two commands, with fixed arguments, for THIS plugin:
//   claude plugin marketplace update starter-kit-marketplace
//   claude plugin update starter-kit@starter-kit-marketplace
//
// It checks at most once every 24 hours, and does nothing when:
//   - the plugin is loaded straight from a folder (development with --plugin-dir) rather than installed
//   - .claude/kit.json has { "autoUpdate": false } or { "auto": false }, or KIT_AUTOUPDATE=0 is set
// Result of the last check: <data dir>/auto-update.log (default ~/.claude/plugins/data/starter-kit/).
//
// Test hooks: KIT_DATA_DIR (where the stamp and log live), KIT_AUTOUPDATE_HOURS, KIT_AUTOUPDATE_DRY_RUN=1
// (print instead of spawning), KIT_CLAUDE_BIN (a node script standing in for the claude command).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MARKETPLACE = "starter-kit-marketplace";
const PLUGIN = `starter-kit@${MARKETPLACE}`;
const dataDir = process.env.KIT_DATA_DIR || join(homedir(), ".claude", "plugins", "data", "starter-kit");
const stampFile = join(dataDir, "auto-update.stamp");
const logFile = join(dataDir, "auto-update.log");
const intervalMs = Number(process.env.KIT_AUTOUPDATE_HOURS || 24) * 3600 * 1000;

function runClaude(args) {
  const bin = process.env.KIT_CLAUDE_BIN;
  // On Windows the claude command is a .cmd shim, which needs a shell. The arguments are fixed constants.
  const r = bin
    ? spawnSync(process.execPath, [bin, ...args], { encoding: "utf8", timeout: 120000 })
    : spawnSync("claude", args, { encoding: "utf8", timeout: 120000, shell: process.platform === "win32", windowsHide: true });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

if (process.argv.includes("--worker")) {
  const steps = [
    ["plugin", "marketplace", "update", MARKETPLACE],
    ["plugin", "update", PLUGIN],
  ];
  const results = [];
  for (const args of steps) {
    const r = runClaude(args);
    results.push({ command: `claude ${args.join(" ")}`, ok: r.ok, output: r.out.split("\n").slice(-3).join(" | ").slice(0, 300) });
    if (!r.ok) break;
  }
  const last = results[results.length - 1];
  const updated = /updated from (\S+) to (\S+)/.exec(last.output);
  try {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(
      logFile,
      JSON.stringify({ when: new Date().toISOString(), ok: results.every((x) => x.ok) && results.length === steps.length, updated: updated ? `${updated[1]} -> ${updated[2]}` : null, results }, null, 2),
    );
  } catch {
    /* logging is best effort */
  }
  process.exit(0);
}

// ---------- launcher ----------
let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let input = {};
try {
  input = JSON.parse(raw);
} catch {
  /* defaults */
}

const done = () => process.exit(0);
if (process.env.KIT_AUTOUPDATE === "0") done();

// Only an installed plugin lives under .../plugins/cache/...; a --plugin-dir checkout is a dev copy.
const pluginRoot = (process.env.CLAUDE_PLUGIN_ROOT || "").replace(/\\/g, "/");
if (!/\/plugins\/cache\//.test(pluginRoot) && process.env.KIT_AUTOUPDATE_FORCE !== "1") done();

const projectDir = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
try {
  const p = join(projectDir, ".claude", "kit.json");
  if (existsSync(p)) {
    const cfg = JSON.parse(readFileSync(p, "utf8"));
    if (cfg.autoUpdate === false || cfg.auto === false) done();
  }
} catch {
  /* ignore bad json */
}

try {
  const last = Number(readFileSync(stampFile, "utf8"));
  if (Number.isFinite(last) && Date.now() - last < intervalMs) done();
} catch {
  /* no stamp yet: due */
}

// Stamp first, so overlapping sessions don't start two updates.
try {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(stampFile, String(Date.now()));
} catch {
  done();
}

if (process.env.KIT_AUTOUPDATE_DRY_RUN === "1") {
  process.stdout.write("WOULD UPDATE: marketplace update, then plugin update\n");
  done();
}

const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--worker"], { detached: true, stdio: "ignore", windowsHide: true, env: process.env });
child.unref();
done();
