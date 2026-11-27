// Plain-words project status, built from the project's own records and git history.
//   node status.mjs --project <folder>            the full report
//   node status.mjs --project <folder> --line     one PROGRESS line, for the report after every merge
//
// Reads ROADMAP.md (features, sizes [S] [M] [L], milestones, acceptance), PROJECT.md ("Success measures", "Risks"),
// HANDOFF.md ("Questions waiting for the user") and the commit dates of the merges the roadmap names. Nothing here is
// invented: every line comes from a file or from git. The pace and forecast are rough and are labelled as guesses.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { checkRoadmap } from "./roadmap-check.mjs";
import { getCeiling } from "./model-route.mjs";
import { readState } from "./build-state.mjs";
import { scopeChange } from "./milestone-gaps.mjs";
import { readLog } from "./flight-lib.mjs";

// Tokens the kit's agents used on the current roadmap item since it started (each agent's last record after that moment), and the
// share on Opus. Fresh tokens only: output, new input and cache writes; cache reads are cheap and left out. Null when not recorded.
export function featureTokens(root, events = readLog(root)) {
  const since = readState(root)?.started;
  if (!since) return null;
  const last = new Map();
  for (const e of events) if (e.ev === "use" && e.aid && e.t && e.t >= since) last.set(e.aid, e);
  if (!last.size) return null;
  let all = 0;
  let opus = 0;
  for (const e of last.values()) {
    const n = (Number(e.out) || 0) + (Number(e.inp) || 0) + (Number(e.cw) || 0);
    all += n;
    if (/opus/i.test(String(e.ran))) opus += n;
  }
  return { all, opus, agents: last.size };
}
const tok = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));

const read = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
};

// The lines under a "## Heading" until the next "## ", without blanks, comments or template placeholders.
export function section(text, heading) {
  const re = new RegExp(`^##\\s+${heading}\\s*$`, "im");
  const m = re.exec(text);
  if (!m) return [];
  const rest = text.slice(m.index + m[0].length).split(/\r?\n/);
  const out = [];
  for (const l of rest) {
    if (/^##\s/.test(l) || /^#\s/.test(l)) break;
    const t = l.trim();
    const item = t.replace(/^[-*]\s+/, "");
    if (item && !item.startsWith("<!--") && !/^<.*>$/.test(item) && !/^TODO\b/i.test(item) && !/^\(?none\)?\.?$/i.test(item)) out.push(item);
  }
  return out;
}

// Rough relative effort of a size tag, so one large feature is not counted like one small one. Untagged counts as medium.
export const WEIGHT = { S: 1, M: 2, L: 5 };

// Progress measured against the scope: features and criteria done, weighted by size, what changed since approval, and the
// feature being built now (from the build state, which lives outside the project).
export function progress(root) {
  const text = read(join(root, "ROADMAP.md"));
  const feats = [];
  for (const line of text.split(/\r?\n/)) {
    const top = /^[-*] \[( |x|X)\] (.+)$/.exec(line);
    const sub = /^\s+[-*] \[( |x|X)\] (.+)$/.exec(line);
    if (top) feats.push({ done: top[1] !== " ", title: top[2].trim(), size: /\[([SML])\]/.exec(top[2])?.[1] ?? null, criteria: [] });
    else if (sub && feats.length) feats[feats.length - 1].criteria.push({ done: sub[1] !== " " && /(?:→|->)\s*(?:test|manual|ci):/i.test(sub[2]) });
  }
  const w = (f) => WEIGHT[f.size ?? "M"];
  const total = feats.reduce((n, f) => n + w(f), 0);
  const criteria = feats.flatMap((f) => f.criteria);
  const s = readState(root);
  const now = s && s.item && !["prove", "records", "done"].includes(s.stage)
    ? { item: String(s.item).slice(0, 80), stage: s.stage ?? "brief", round: s.round || 0, question: s.question || null }
    : null;
  return {
    features: feats.length,
    done: feats.filter((f) => f.done).length,
    bySize: total ? Math.round((100 * feats.filter((f) => f.done).reduce((n, f) => n + w(f), 0)) / total) : 0,
    criteria: criteria.length,
    proven: criteria.filter((c) => c.done).length,
    scope: scopeChange(root),
    now,
  };
}

const STAGE_WORDS = { brief: "being planned", build: "being built", review: "in review", merge: "being merged" };
const nowWords = (n) => `${n.item}: ${STAGE_WORDS[n.stage] ?? n.stage}${n.stage === "review" && n.round ? `, round ${n.round}` : ""}${n.question ? ", waiting for your answer" : ""}`;

// One line for the report after every merge.
export function progressLine(root) {
  const p = progress(root);
  if (!p.features) return "PROGRESS: there is no roadmap yet.";
  const ms = checkRoadmap(root).milestones.find((m) => !m.accepted);
  const parts = [`${p.done} of ${p.features} features done (${p.bySize}% by size)`, `${p.proven} of ${p.criteria} criteria proven`];
  if (p.scope) parts.push(`since you approved ${p.scope.approved}: ${p.scope.added.length} added, ${p.scope.droppedFeatures} dropped${p.scope.droppedCriteria ? `, ${p.scope.droppedCriteria} criteria dropped or reworded` : ""}`);
  if (ms) parts.push(`Milestone ${ms.n}: ${ms.done} of ${ms.features}`);
  if (p.now) parts.push(`now: ${nowWords(p.now)}`);
  const t = featureTokens(root);
  if (t) parts.push(`this feature used ${tok(t.all)} tokens in ${t.agents} agent runs (${Math.round((100 * t.opus) / t.all)}% on Opus)`);
  return `PROGRESS: ${parts.join("; ")}.`;
}

export function buildStatus(root) {
  const road = checkRoadmap(root);
  const roadmapText = read(join(root, "ROADMAP.md"));
  const project = read(join(root, "PROJECT.md"));
  const handoff = read(join(root, "HANDOFF.md"));
  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
  const name = (/^#\s+(.+?)\s*(?:—.*)?$/m.exec(project)?.[1] ?? basename(root)).trim();
  const lines = [`STATUS — ${name}`];

  // features, with sizes
  const feats = [...roadmapText.matchAll(/^[-*] \[( |x|X)\] (.+)$/gm)].map((m) => ({ done: m[1] !== " ", title: m[2].trim(), size: /\[([SML])\]/.exec(m[2])?.[1] ?? null }));
  const open = feats.filter((f) => !f.done);
  const p = progress(root);
  if (!feats.length) lines.push("Progress: there is no roadmap yet.");
  else {
    lines.push(`Progress: ${feats.length - open.length} of ${feats.length} features done (${p.bySize}% of the work by size); ${p.proven} of ${p.criteria} acceptance criteria proven.`);
    if (p.scope) {
      const { approved, added, droppedFeatures, droppedCriteria } = p.scope;
      lines.push(`Scope: you approved ${approved} features. Since then ${added.length} added${added.length ? ` (${added.slice(0, 3).map((t) => t.replace(/\s*\[[SML]\]\s*/, " ").split(/\s+[—–]\s+/)[0].trim().slice(0, 40)).join("; ")}${added.length > 3 ? "; …" : ""})` : ""}, ${droppedFeatures} dropped${droppedCriteria ? `, and ${droppedCriteria} approved criteria were dropped or reworded` : ""}.`);
    }
    if (p.now) lines.push(`Now: ${nowWords(p.now)}.`);
    const sizes = { S: 0, M: 0, L: 0 };
    for (const f of open) if (f.size) sizes[f.size]++;
    if (open.length) {
      const unsized = open.filter((f) => !f.size).length;
      lines.push(`Left to build: ${open.length} (${sizes.S} small, ${sizes.M} medium, ${sizes.L} large${unsized ? `, ${unsized} not yet sized` : ""}). Next: ${open[0].title.replace(/\s*\[[SML]\]\s*/, " ").slice(0, 100)}`);
    }
  }
  if (road.milestones.length) {
    lines.push("Milestones: " + road.milestones.map((m) => `${m.n} "${m.name}" — ${m.accepted ? "accepted by you" : m.features && m.done === m.features ? "finished, waiting for your OK" : `${m.done}/${m.features} features`}`).join("; "));
  }

  // pace: merge dates of the features the roadmap says are done
  const shas = [...roadmapText.matchAll(/\(merged ([0-9a-f]{7,40})\)/gi)].map((m) => m[1]);
  const stamps = shas.map((s) => Number(git("show", "-s", "--format=%ct", s).stdout.trim())).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (stamps.length >= 2 && open.length) {
    const days = Math.max(1, (stamps[stamps.length - 1] - stamps[0]) / 86400);
    const perDay = (stamps.length - 1) / days;
    if (perDay > 0) {
      const eta = open.length / perDay;
      lines.push(`Pace (a rough guess from past merges): ${(perDay * 7).toFixed(1)} features a week; at that pace the rest takes about ${Math.max(1, Math.round(eta * 0.6))}–${Math.max(2, Math.round(eta * 1.6))} days of work.`);
    }
  } else if (open.length) lines.push("Pace: not enough finished features yet to estimate how long the rest will take.");

  const measures = section(project, "Success measures");
  if (measures.length) lines.push("How we will know it worked:\n" + measures.slice(0, 5).map((l) => `  - ${l}`).join("\n"));
  const risks = section(project, "Risks");
  if (risks.length) lines.push("Biggest risks:\n" + risks.slice(0, 5).map((l) => `  - ${l}`).join("\n"));

  const waiting = [...section(handoff, "Questions waiting for the user")];
  for (const m of road.unaccepted) waiting.unshift(`Please try Milestone ${m.n} ("${m.name}") and tell me if it is what you wanted.`);
  lines.push(waiting.length ? "Waiting on you:\n" + waiting.slice(0, 6).map((l) => `  - ${l}`).join("\n") : "Waiting on you: nothing.");

  if (road.problems.length) lines.push(`Warning: ${road.problems.length} roadmap tick(s) are not backed by proof (${road.problems[0].slice(0, 100)}).`);
  const covers = /Covers-through:\s*([0-9a-f]{7,40})/i.exec(handoff)?.[1];
  const head = git("rev-parse", "HEAD").stdout.trim();
  if (!handoff) lines.push("Records: no HANDOFF.md yet.");
  else if (!covers || (head && !head.startsWith(covers.toLowerCase()) && git("merge-base", "--is-ancestor", covers, "HEAD").status !== 0)) lines.push("Records: the handoff note does not match the code history.");
  const ceiling = getCeiling();
  if (ceiling) lines.push(`Models: this computer's plan has no Opus, so every review, security reviews included, runs on ${ceiling}.`);
  return lines.join("\n");
}

if (process.argv[1] && basename(process.argv[1]) === "status.mjs") {
  const i = process.argv.indexOf("--project");
  const root = resolve(i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : process.cwd());
  if (!existsSync(root)) {
    console.error("Folder not found.");
    process.exit(1);
  }
  console.log(process.argv.includes("--line") ? progressLine(root) : buildStatus(root));
}
