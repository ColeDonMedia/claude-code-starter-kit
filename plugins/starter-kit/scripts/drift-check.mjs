// Drift check: do the project's records still match reality? Over many sessions small mismatches pile up (a map that names
// a folder that was moved, a handoff that stopped before the last commits, two decisions that say opposite things, records so
// long that nobody reads them). This finds them so the next session starts from the truth.
// Run: node drift-check.mjs --project <dir>   Exit 1 when it finds drift. Reads files and git history only.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGraph } from "./notes-graph.mjs";
import { schemaStatusSync } from "./schema-map.mjs";

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8").replace(/\r/g, "") : "");
const git = (root, ...args) => {
  const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
};

// Limits above which a record should be compacted (scripts/compact-records.mjs) or rewritten shorter.
export const LIMITS = { "DECISIONS.md": 80, "CHANGELOG.md": 400, "HANDOFF.md": 60, "PROJECT.md": 300 };

export function mapSection(text) {
  const m = /^##+\s+(?:Map|Architecture)[^\n]*\n([\s\S]*?)(?=^##+\s|(?![\s\S]))/im.exec(text);
  return m ? m[1] : "";
}

// "- `src/auth/` — sign in" or "- src/auth/ — sign in" -> "src/auth/"
export function mapPaths(text) {
  const out = [];
  for (const line of mapSection(text).split("\n")) {
    const m = /^[-*]\s+`?([^`\s]+?)`?\s+(?:—|–|-|:)\s/.exec(line.trim());
    if (m && /[/.]/.test(m[1]) && !/^https?:/.test(m[1])) out.push(m[1]);
  }
  return out;
}

const STOP = new Set("the a an and or to of for in on with use using chose choose is are be it we our".split(" "));
const sig = (s) => (s.toLowerCase().match(/[a-z0-9][a-z0-9.+-]*/g) ?? []).filter((w) => !STOP.has(w) && w.length > 1);

// A later decision that picks what an earlier one rejected, without saying it replaces it.
export function decisionConflicts(text) {
  const lines = text.split("\n").filter((l) => /^[-*] /.test(l));
  const found = [];
  lines.forEach((l, i) => {
    const rej = /rejected:\s*([^;.\n]+)/i.exec(l)?.[1];
    if (!rej) return;
    const alt = sig(rej);
    if (!alt.length) return;
    for (let j = i + 1; j < lines.length; j++) {
      const later = lines[j];
      if (/replaces|reverses|supersedes|instead of the earlier|changed our mind/i.test(later)) continue;
      const chosen = sig(later.split(/because/i)[0].replace(/^[-*]\s*[\d-]*\s*[—–-]?\s*/, ""));
      if (alt.every((w) => chosen.includes(w))) found.push(`decision "${later.slice(2, 90)}" picks "${rej.trim()}", which an earlier decision rejected; say which one stands`);
    }
  });
  return found;
}

export function checkDrift(root) {
  const problems = [];
  const project = read(join(root, "PROJECT.md"));
  for (const p of mapPaths(project)) if (!existsSync(join(root, p))) problems.push(`PROJECT.md's map names ${p}, which does not exist`);

  const handoff = read(join(root, "HANDOFF.md"));
  const covers = /Covers-through:\s*([0-9a-f]{7,40})/i.exec(handoff)?.[1];
  if (covers && git(root, "rev-parse", "--git-dir")) {
    if (git(root, "cat-file", "-e", `${covers}^{commit}`) === null) problems.push(`HANDOFF.md covers commit ${covers}, which is not in this repository`);
    else {
      const n = git(root, "rev-list", "--count", `${covers}..HEAD`, "--", ".", ":(exclude)*.md", ":(exclude).claude");
      if (n && Number(n) > 0) problems.push(`HANDOFF.md stops ${n} code commit(s) before the latest; update it`);
    }
  }

  for (const c of decisionConflicts(read(join(root, "DECISIONS.md")))) problems.push(c);

  // Linked notes: broken links, decisions that no longer stand but are still relied on.
  try {
    for (const p of buildGraph(root).problems.slice(0, 5)) problems.push(p.msg);
  } catch {
    /* never let note checks break the drift check */
  }
  // The schema page, once it exists, must match what the migrations produce.
  if (existsSync(join(root, "SCHEMA.md"))) {
    try {
      const s = schemaStatusSync(root);
      if (s.state === "stale") problems.push("SCHEMA.md no longer matches the migrations; regenerate it (node scripts/schema-map.mjs --project . --write)");
    } catch {
      /* ignore */
    }
  }

  for (const [f, max] of Object.entries(LIMITS)) {
    const n = read(join(root, f)).split("\n").length;
    if (n > max) problems.push(`${f} is ${n} lines (limit ${max}); compact it so sessions keep reading it`);
  }
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  const root = resolve(a.includes("--project") ? a[a.indexOf("--project") + 1] : ".");
  const p = checkDrift(root);
  console.log(p.length ? p.map((x) => `- ${x}`).join("\n") : "The records match the code and git history.");
  process.exit(p.length ? 1 : 0);
}
