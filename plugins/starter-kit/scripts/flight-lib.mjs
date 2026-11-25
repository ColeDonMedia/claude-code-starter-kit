// Flight recorder storage: a small local log of WHAT the kit did in a session, so a person (or the next session)
// can see where a workflow went wrong without anyone having to describe it.
// It records names only: event, tool name, which workflow or agent ran, the program a shell command started (never its
// arguments), a time. Never prompts, file contents, command arguments, paths or secrets. The log lives in the user's own
// folder (not in the project), so it can never be committed or pushed by accident.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const MAX_BYTES = 1_000_000;

export function logDir() {
  return process.env.STARTER_KIT_FLIGHT_DIR || join(homedir(), ".claude", "plugins", "data", "starter-kit", "flight");
}

export function logPath(root) {
  const id = createHash("sha1").update(resolve(root).toLowerCase()).digest("hex").slice(0, 12);
  return join(logDir(), `${id}.jsonl`);
}

// Model names are recorded only when they look like one: an alias the Agent tool takes, or a Claude model id. Anything else
// (a mistake, or text that should never be in a log) becomes "other", so a model field can never carry a secret.
const ALIASES = new Set(["haiku", "sonnet", "opus", "fable", "inherit", "default", "best"]);
export function modelName(v) {
  const s = typeof v === "string" ? v : typeof v?.id === "string" ? v.id : null;
  if (!s) return undefined;
  const m = s.trim().toLowerCase();
  if (ALIASES.has(m)) return m;
  return /^claude-[a-z]+(-[0-9]+){1,3}(-[0-9]{8})?(\[[0-9a-z]+\])?$/.test(m) ? m : "other";
}
export const effortName = (v) => (["low", "medium", "high", "xhigh", "max"].includes(v) ? v : undefined);
export const count = (v) => (Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined);

// Keep only harmless fields. Anything not on this list is dropped.
export function sanitize(e) {
  const out = { t: e.t ?? new Date().toISOString() };
  for (const k of ["ev", "tool", "skill", "agent", "prog", "src", "id", "sid", "stop", "item", "ask", "eff", "ran", "tok", "model", "miss", "ok", "bad", "lines", "kept", "rw", "res", "mt", "mk"]) {
    if (e[k] !== undefined && e[k] !== null) out[k] = String(e[k]).replace(/[^\w:.\-/ ]/g, "").slice(0, 60);
  }
  return out;
}

export function record(root, event) {
  try {
    const p = logPath(root);
    mkdirSync(logDir(), { recursive: true });
    if (existsSync(p) && statSync(p).size > MAX_BYTES) renameSync(p, p + ".old");
    appendFileSync(p, JSON.stringify(sanitize(event)) + "\n");
  } catch {
    /* recording must never break a session */
  }
}

export function readLog(root) {
  try {
    return readFileSync(logPath(root), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}
