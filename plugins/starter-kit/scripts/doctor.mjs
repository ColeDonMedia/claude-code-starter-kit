// The kit's doctor: checks, in plain words, that the starter kit can actually protect and help on this computer and in this
// project. It never changes anything except writing a tiny test file into the kit's own data folder (and removing it).
//   - Node and git are available (and whether Node has the built-in SQLite the database rehearsal needs)
//   - the plugin's hooks are registered for every event and every shell tool
//   - the guards really refuse the canary command, for Bash and for PowerShell, through the same entry point Claude Code uses
//   - the data folder is writable, and when hooks last recorded activity for this project (proof Claude Code is calling them)
//   - the project is set up (CLAUDE.md marker) and carries the tripwire that notices when hooks are not running
// Run: node doctor.mjs [--project <dir>] [--json]. Exit 1 when something is wrong.
//      node doctor.mjs --project <dir> --plugins   which other plugins load into every session here (read only)
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dataDir } from "./trust-lib.mjs";
import { readLog } from "./flight-lib.mjs";

const PLUGIN = fileURLToPath(new URL("..", import.meta.url));
const MIN_NODE = 18;

export async function diagnose(project) {
  const checks = [];
  const ok = (name, detail) => checks.push({ ok: true, name, detail });
  const bad = (name, detail, fix) => checks.push({ ok: false, name, detail, fix });
  const info = (name, detail) => checks.push({ ok: null, name, detail });

  const major = Number(process.versions.node.split(".")[0]);
  if (major >= MIN_NODE) ok("Node.js", `version ${process.versions.node}`);
  else bad("Node.js", `version ${process.versions.node} is too old`, `install Node.js ${MIN_NODE} or newer`);
  try {
    const prev = process.emitWarning;
    process.emitWarning = () => {};
    try {
      await import("node:sqlite");
    } finally {
      process.emitWarning = prev;
    }
    ok("Built-in SQLite", "available (database rehearsals and reading SQLite schemas work)");
  } catch {
    info("Built-in SQLite", "not in this Node version: database rehearsals and `schema-map --sqlite` won't work; everything else does");
  }
  const git = spawnSync("git", ["--version"], { encoding: "utf8" });
  if (git.status === 0) ok("git", git.stdout.trim());
  else bad("git", "not found", "install git: the kit uses it for branches, history and its checks");

  let version = "?";
  try {
    version = JSON.parse(readFileSync(join(PLUGIN, ".claude-plugin", "plugin.json"), "utf8")).version;
    ok("Plugin", `starter-kit ${version}`);
  } catch {
    bad("Plugin", "cannot read plugin.json", "reinstall the plugin");
  }

  try {
    const cfg = JSON.parse(readFileSync(join(PLUGIN, "hooks", "hooks.json"), "utf8")).hooks;
    const missing = ["SessionStart", "PreToolUse", "PostToolUse", "Stop", "SubagentStart"].filter((e) => !JSON.stringify(cfg[e] ?? "").includes("gate.mjs"));
    const pre = (cfg.PreToolUse ?? []).map((g) => g.matcher ?? "").join("|").split("|");
    const shells = ["Bash", "PowerShell"].filter((t) => !pre.includes(t) && !pre.includes("*"));
    if (!missing.length && !shells.length) ok("Hooks registered", "every event, and both shell tools");
    else bad("Hooks registered", [missing.length ? `missing for ${missing.join(", ")}` : "", shells.length ? `guards do not watch ${shells.join(", ")}` : ""].filter(Boolean).join("; "), "reinstall or update the plugin");
  } catch {
    bad("Hooks registered", "cannot read hooks.json", "reinstall the plugin");
  }

  // The canary, through the same entry point and the same steps Claude Code uses.
  const gate = join(PLUGIN, "hooks", "gate.mjs");
  for (const tool of ["Bash", "PowerShell"]) {
    const r = spawnSync(process.execPath, [gate, "pre"], { input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: tool, tool_use_id: "doctor", cwd: project, tool_input: { command: "starter-kit-canary" } }), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: project }, timeout: 60000 });
    let decision = "";
    try {
      decision = JSON.parse(r.stdout).hookSpecificOutput.permissionDecision;
    } catch {
      /* no decision */
    }
    if (decision === "deny" && /canary ok/.test(r.stdout)) ok(`Guards (${tool})`, "the canary was refused, so the guards run");
    else if (/canary ok/.test(r.stdout + r.stderr)) ok(`Guards (${tool})`, "the canary was refused");
    else bad(`Guards (${tool})`, `the canary was NOT refused (exit ${r.status}${r.stderr ? `: ${r.stderr.trim().split("\n")[0]}` : ""})`, "the guards are switched off for this project or broken: check .claude/kit.json for \"guard\" or \"auto\" set to false, and reinstall the plugin");
  }
  info("Inside Claude Code", "this check runs the hook scripts directly. To prove Claude Code itself calls them, ask Claude to run `starter-kit-canary`: it must be blocked.");

  try {
    mkdirSync(dataDir(), { recursive: true });
    const probe = join(dataDir(), `.doctor-${process.pid}`);
    writeFileSync(probe, "x");
    rmSync(probe);
    ok("Data folder", dataDir());
  } catch (e) {
    bad("Data folder", `${dataDir()} is not writable (${e.code ?? e.message})`, "check the folder's permissions");
  }

  const events = readLog(project);
  const last = events.length ? events[events.length - 1].t : null;
  if (last) {
    const ago = Math.round((Date.now() - Date.parse(last)) / 60000);
    ok("Hook activity", `hooks last recorded something for this project ${ago < 120 ? `${ago} minute(s)` : `${Math.round(ago / 60)} hour(s)`} ago (${events.length} events logged)`);
  } else info("Hook activity", "nothing recorded for this project yet (normal before its first session with the kit, or with the flight log switched off)");

  const claude = existsSync(join(project, "CLAUDE.md")) ? readFileSync(join(project, "CLAUDE.md"), "utf8") : null;
  if (claude === null) info("Project", "no CLAUDE.md here: the kit sets the project up on its first session");
  else if (!claude.includes("starter-kit:managed")) info("Project", "CLAUDE.md is not set up by the kit yet");
  else if (!/STARTER KIT WORKFLOWS/.test(claude)) bad("Project tripwire", "CLAUDE.md lacks the line that notices when hooks are not running", "run the kit's setup again (it adds missing sections without touching yours)");
  else ok("Project", "set up, with the tripwire");
  return { version, checks, healthy: checks.every((c) => c.ok !== false) };
}

// Which plugins load into this project's sessions, from the user's and the project's settings files (read only). Every enabled
// plugin's skills, agents and instructions cost tokens in every session, used or not. Project settings win over user settings.
export function listPlugins(project, home = homedir()) {
  const files = [join(home, ".claude", "settings.json"), join(project, ".claude", "settings.json"), join(project, ".claude", "settings.local.json")];
  const state = new Map();
  for (const f of files) {
    try {
      const ep = JSON.parse(readFileSync(f, "utf8")).enabledPlugins;
      if (ep && typeof ep === "object") for (const [name, on] of Object.entries(ep)) state.set(name, { on: on === true, from: f === files[0] ? "your settings" : "this project's settings" });
    } catch {
      /* missing or unreadable */
    }
  }
  const on = [...state].filter(([, s]) => s.on).map(([name, s]) => ({ name, from: s.from }));
  return { on, others: on.filter((p) => !p.name.startsWith("starter-kit@")) };
}

export function pluginReport(project, home) {
  const { others } = listPlugins(project, home);
  if (!others.length) return "Besides the starter kit, no plugins are switched on in your or this project's settings files.";
  return [
    `Plugins switched on besides the starter kit (${others.length}); each one's skills, agents and instructions load into every session here, used or not:`,
    ...others.map((p) => `- ${p.name} (${p.from})`),
    `To switch one off for this project only, add "enabledPlugins": { "<name>": false } to this project's .claude/settings.json.`,
    "The kit never changes this itself: say which ones to switch off and it will write that line.",
  ].join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  const project = resolve(a.includes("--project") ? a[a.indexOf("--project") + 1] : ".");
  if (a.includes("--plugins")) {
    console.log(pluginReport(project));
    process.exit(0);
  }
  const r = await diagnose(project);
  if (a.includes("--json")) console.log(JSON.stringify(r, null, 1));
  else {
    for (const c of r.checks) console.log(`${c.ok === true ? "OK     " : c.ok === false ? "PROBLEM" : "NOTE   "} ${c.name}: ${c.detail}${c.fix ? `\n        Fix: ${c.fix}` : ""}`);
    console.log(r.healthy ? "\nThe kit looks healthy on this computer." : "\nSomething needs fixing (see PROBLEM lines).");
  }
  process.exitCode = r.healthy ? 0 : 1;
}
