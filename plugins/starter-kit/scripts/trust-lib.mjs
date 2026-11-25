// Per-computer record of which project commands the USER approved to run automatically.
//
// A project can ship its own .claude/kit.json listing commands (checks to run when a turn ends, a custom
// related-tests command). Without approval, a hostile project could use that to run anything on your machine.
// So the hooks run those commands only if their exact text was approved here, on this computer. The approval is
// stored OUTSIDE the project (~/.claude/plugins/data/starter-kit/trusted.json), as hashes, keyed by project path.
// Editing a command invalidates its approval until it is approved again.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const dataDir = () => process.env.KIT_DATA_DIR || join(homedir(), ".claude", "plugins", "data", "starter-kit");
export const trustFile = () => join(dataDir(), "trusted.json");

const hash = (s) => createHash("sha256").update(s).digest("hex");
export function projectKey(project) {
  let p = resolve(project);
  try {
    p = realpathSync(p);
  } catch {
    /* use as given */
  }
  return process.platform === "win32" ? p.toLowerCase() : p;
}

function load() {
  try {
    const j = JSON.parse(readFileSync(trustFile(), "utf8"));
    return j && typeof j === "object" && j.projects ? j : { projects: {} };
  } catch {
    return { projects: {} };
  }
}

// Security switches a project's kit.json may set to false. They only count once the user approved them here:
// otherwise a hostile project could ship a kit.json that turns the protections off.
export const SECURITY_SWITCHES = ["auto", "guard", "secretGuard", "packageGuard", "autoGate", "dbGuard"];

// Everything in a project's kit.json that runs a command or loosens a protection, as stable entries.
export function entriesOf(cfg) {
  const out = ["auto-runner"]; // lets the related-tests hook run the project's own test runner (vitest, jest, pytest, go)
  if (cfg && Array.isArray(cfg.verify)) for (const c of cfg.verify) if (typeof c === "string" && c.trim()) out.push(`verify:${c.trim()}`);
  if (cfg && typeof cfg.relatedTests === "string" && cfg.relatedTests.trim()) out.push(`related:${cfg.relatedTests.trim()}`);
  if (cfg) for (const s of SECURITY_SWITCHES) if (cfg[s] === false) out.push(`switch:${s}`);
  if (cfg && Array.isArray(cfg.guardAllow)) for (const id of cfg.guardAllow) if (typeof id === "string") out.push(`allow:${id}`);
  return out;
}

// True only if kit.json turns this protection off AND the user approved that on this computer.
export function switchedOff(project, cfg, ...names) {
  return names.some((n) => cfg && cfg[n] === false && isTrusted(project, `switch:${n}`));
}

// The rule ids a project may allow: only those the user approved.
export function approvedAllows(project, cfg) {
  const ids = cfg && Array.isArray(cfg.guardAllow) ? cfg.guardAllow.filter((x) => typeof x === "string") : [];
  return new Set(ids.filter((id) => isTrusted(project, `allow:${id}`)));
}

export function isTrusted(project, entry) {
  const p = load().projects[projectKey(project)];
  return Boolean(p && p.entries.includes(hash(entry)));
}

// Approve exactly these entries for this project, replacing any earlier approval.
export function trustEntries(project, entries) {
  const db = load();
  db.projects[projectKey(project)] = { entries: entries.map(hash), approved: entries, when: new Date().toISOString() };
  mkdirSync(dataDir(), { recursive: true });
  writeFileSync(trustFile(), JSON.stringify(db, null, 2));
}

export function listTrusted(project) {
  const p = load().projects[projectKey(project)];
  return p ? p.approved : [];
}
