// Milestone gap check: before the owner is asked to accept a milestone, compare it with the roadmap they approved.
//   node milestone-gaps.mjs --project <folder> [--milestone N | --feature F-001] [--json]
// With no --milestone, checks the first finished milestone that is not accepted yet. Exit 1 when gaps are found.
//
// roadmap-check.mjs already proves each ticked box points at a real merge and a real test. This looks across the
// whole milestone for what that check cannot see:
//   dropped   a feature or criterion in the first committed ROADMAP.md (the approved plan) that is nowhere in it now
//             (dropped, or reworded so it no longer says the same thing)
//   skipped   a criterion's test exists but is marked skip / todo / fixme, so it never runs
//   shared    one test is cited as the proof of several criteria
//   manual    a criterion of a high-risk feature proven only "by hand"
// It is a pattern screen: each finding is a lead for the challenger to judge, not a verdict.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const PROOF = /\s*(?:→|->)\s*(?:test|manual):.*$/i;
const norm = (s) =>
  s.replace(PROOF, "").replace(/\((?:merged|existing) [0-9a-f]+\)/gi, "").replace(/\{#[A-Z]+-\d+\}/g, "").replace(/\[\[[^\]]*\]\]/g, "")
    .replace(/\[(S|M|L)\]/g, "").replace(/\bhigh-risk\b/gi, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const featureKey = (title) => {
  const id = /\{#(F-\d+)\}/.exec(title);
  return id ? id[1] : norm(title.split(/\s+[—–]\s+|\s+-\s+/)[0]);
};

export function parseRoadmap(text) {
  const milestones = [];
  let ms = null;
  let feat = null;
  for (const line of text.split(/\r?\n/)) {
    const mh = /^##\s+Milestone\s+(\d+)\s*[—–-]\s*(.+)$/i.exec(line);
    if (mh) {
      ms = { n: Number(mh[1]), name: mh[2].trim(), accepted: false, features: [] };
      milestones.push(ms);
      feat = null;
      continue;
    }
    if (ms && /^Accepted:\s*yes\b/i.test(line.trim())) ms.accepted = true;
    const top = /^[-*] \[( |x|X)\] (.+)$/.exec(line);
    const sub = /^\s+[-*] \[( |x|X)\] (.+)$/.exec(line);
    if (top) {
      feat = { title: top[2].trim(), done: top[1] !== " ", criteria: [] };
      feat.highRisk = /\bhigh-risk\b/i.test(feat.title);
      if (ms) ms.features.push(feat);
    } else if (sub && feat) {
      const text = sub[2].trim();
      const t = /(?:→|->)\s*test:\s*(.+?)\s*$/i.exec(text);
      const [file, ...rest] = t ? t[1].split("::") : [];
      feat.criteria.push({
        text,
        done: sub[1] !== " ",
        test: t ? { file: file.trim(), name: rest.join("::").trim().replace(/^["'`]|["'`]$/g, "") } : null,
        manual: /(?:→|->)\s*manual:/i.test(text),
      });
    }
  }
  return milestones;
}

const SKIP = /\b(?:x(?:it|test|describe)\s*\(|(?:it|test|describe|context)\s*\.\s*(?:skip|todo|fixme)\s*\(|skip\s*:\s*true|@(?:skip|disabled|ignore)\b|pytest\.mark\.skip|t\.skip\s*\(|#\[ignore\])/i;

// How the roadmap's scope moved since approval: features added, features dropped, criteria dropped or reworded. null without history.
export function scopeChange(root) {
  const file = join(root, "ROADMAP.md");
  const was = approved(root);
  if (!was || !existsSync(file)) return null;
  const now = parseRoadmap(readFileSync(file, "utf8"));
  const wasKeys = new Set(was.flatMap((m) => m.features.map((f) => featureKey(f.title))));
  const gaps = [];
  dropped(was.flatMap((m) => m.features), now, gaps);
  return {
    approved: wasKeys.size,
    added: now.flatMap((m) => m.features).filter((f) => !wasKeys.has(featureKey(f.title))).map((f) => f.title.replace(/\s*\((?:merged|existing) [0-9a-f]+\)\s*$/i, "")),
    droppedFeatures: gaps.filter((g) => g.text.startsWith("Feature ")).length,
    droppedCriteria: gaps.filter((g) => g.text.startsWith("Criterion ")).length,
  };
}

export function approved(root) {
  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
  const first = git("log", "--diff-filter=A", "--format=%H", "--", "ROADMAP.md").stdout?.trim().split(/\s+/).filter(Boolean).pop();
  const orig = first ? git("show", `${first}:ROADMAP.md`) : null;
  return orig && orig.status === 0 ? parseRoadmap(orig.stdout) : null;
}

// Approved features (or criteria of features still present) that are nowhere in the roadmap now.
function dropped(wasFeatures, now, gaps) {
  const nowFeatures = new Set(now.flatMap((m) => m.features.map((f) => featureKey(f.title))));
  const nowCriteria = new Set(now.flatMap((m) => m.features.flatMap((f) => f.criteria.map((c) => norm(c.text)))));
  for (const f of wasFeatures) {
    if (!nowFeatures.has(featureKey(f.title))) gaps.push({ kind: "dropped", text: `Feature "${f.title.replace(PROOF, "").slice(0, 80)}" was in the approved roadmap and is not in it now` });
    else for (const c of f.criteria)
      if (!nowCriteria.has(norm(c.text))) gaps.push({ kind: "dropped", text: `Criterion "${c.text.replace(PROOF, "").slice(0, 90)}" (${f.title.split(/\s+[—–]\s+/)[0].slice(0, 40)}) was approved and is not in the roadmap now, or was reworded` });
  }
}

// One feature, as /starter-kit:feature records it: the same checks, limited to that feature.
//   node milestone-gaps.mjs --project . --feature F-001     (an id, or the feature's name)
export function featureGaps(root, which) {
  const file = join(root, "ROADMAP.md");
  if (!existsSync(file)) return { feature: null, gaps: [], notes: ["No ROADMAP.md."] };
  const now = parseRoadmap(readFileSync(file, "utf8"));
  const key = /^F-\d+$/i.test(which) ? which.toUpperCase() : norm(which);
  const all = now.flatMap((m) => m.features);
  const f = all.find((x) => featureKey(x.title) === key) ?? all.find((x) => /^F-/.test(key) ? false : norm(x.title).startsWith(key));
  if (!f) return { feature: null, gaps: [], notes: [`No feature "${which}" in ROADMAP.md.`] };
  const gaps = [];
  const notes = [];
  const was = approved(root);
  if (!was) notes.push("No committed first version of ROADMAP.md, so dropped items were not checked.");
  else {
    const wf = was.flatMap((m) => m.features).filter((x) => featureKey(x.title) === featureKey(f.title));
    if (!wf.length) notes.push("This feature was added after the plan was approved, so dropped items were not checked.");
    else dropped(wf, now, gaps);
  }
  proofGaps(root, [f], gaps);
  return { feature: f.title.replace(/\s*\((?:merged|existing) [0-9a-f]+\)\s*$/i, "").slice(0, 80), gaps, notes };
}

export function milestoneGaps(root, wanted) {
  const file = join(root, "ROADMAP.md");
  if (!existsSync(file)) return { milestone: null, gaps: [], notes: ["No ROADMAP.md."] };
  const now = parseRoadmap(readFileSync(file, "utf8"));
  const ms = wanted != null
    ? now.find((m) => m.n === wanted)
    : now.find((m) => !m.accepted && m.features.length && m.features.every((f) => f.done));
  if (!ms) return { milestone: null, gaps: [], notes: [wanted != null ? `No Milestone ${wanted} in ROADMAP.md.` : "No finished milestone is waiting for acceptance."] };
  const gaps = [];
  const notes = [];

  // dropped: compare with the roadmap as first committed (what the owner approved)
  const was = approved(root);
  if (!was) notes.push("No committed first version of ROADMAP.md, so dropped items were not checked.");
  else {
    const wm = was.find((m) => m.n === ms.n);
    if (!wm) notes.push(`Milestone ${ms.n} was not in the first ROADMAP.md, so dropped items were not checked.`);
    else dropped(wm.features, now, gaps);
  }
  proofGaps(root, ms.features, gaps);
  return { milestone: { n: ms.n, name: ms.name }, gaps, notes };
}

// skipped, shared and manual: how each criterion is proven
function proofGaps(root, features, gaps) {
  const cited = new Map();
  for (const f of features) {
    const fname = f.title.split(/\s+[—–]\s+/)[0].slice(0, 40);
    for (const c of f.criteria) {
      const cn = c.text.replace(PROOF, "").slice(0, 80);
      if (c.manual && f.highRisk) gaps.push({ kind: "manual", text: `"${cn}" (${fname}, high-risk) is proven only by hand` });
      if (!c.test) continue;
      const key = `${c.test.file}::${c.test.name}`;
      if (c.test.name) cited.set(key, [...(cited.get(key) || []), cn]);
      const p = resolve(root, c.test.file);
      if (!c.test.name || !p.startsWith(resolve(root)) || !existsSync(p)) continue;
      const line = readFileSync(p, "utf8").split(/\r?\n/).find((l) => l.includes(c.test.name));
      if (line && SKIP.test(line)) gaps.push({ kind: "skipped", text: `"${cn}" points to ${c.test.file}::${c.test.name}, which is marked to skip and never runs` });
    }
  }
  for (const [key, list] of cited)
    if (list.length > 1) gaps.push({ kind: "shared", text: `${key} is the only proof for ${list.length} criteria: ${list.map((s) => `"${s.slice(0, 50)}"`).join(", ")}` });
}

if (process.argv[1] && basename(process.argv[1]) === "milestone-gaps.mjs") {
  const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
  const root = resolve(arg("--project") || process.cwd());
  const m = arg("--milestone");
  const feat = arg("--feature");
  const r = feat ? featureGaps(root, feat) : milestoneGaps(root, m != null ? Number(m) : undefined);
  const list = () => r.gaps.map((g) => `- ${g.kind.toUpperCase()}: ${g.text}`).join("\n");
  if (process.argv.includes("--json")) console.log(JSON.stringify(r, null, 2));
  else if (feat) {
    if (r.feature) console.log(r.gaps.length ? `Feature "${r.feature}": ${r.gaps.length} gap(s) against the approved plan:\n${list()}` : `Feature "${r.feature}": no gaps against the approved plan.`);
    for (const n of r.notes) console.log(n);
  } else {
    if (r.milestone) console.log(r.gaps.length
      ? `Milestone ${r.milestone.n} (${r.milestone.name}): ${r.gaps.length} gap(s) against the approved plan:\n${r.gaps.map((g) => `- ${g.kind.toUpperCase()}: ${g.text}`).join("\n")}`
      : `Milestone ${r.milestone.n} (${r.milestone.name}): no gaps against the approved plan.`);
    for (const n of r.notes) console.log(n);
  }
  process.exitCode = r.gaps.length ? 1 : 0;
}
