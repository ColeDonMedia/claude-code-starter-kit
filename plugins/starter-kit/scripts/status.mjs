// Plain-words project status, built from the project's own records and git history.
//   node status.mjs --project <folder>
//
// Reads ROADMAP.md (features, sizes [S] [M] [L], milestones, acceptance), PROJECT.md ("Success measures", "Risks"),
// HANDOFF.md ("Questions waiting for the user") and the commit dates of the merges the roadmap names. Nothing here is
// invented: every line comes from a file or from git. The pace and forecast are rough and are labelled as guesses.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { checkRoadmap } from "./roadmap-check.mjs";

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
    if (t && !t.startsWith("<!--") && !/^<.*>$/.test(t) && !/^TODO\b/i.test(t) && !/^\(?none\)?\.?$/i.test(t)) out.push(t.replace(/^[-*]\s+/, ""));
  }
  return out;
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
  if (!feats.length) lines.push("Progress: there is no roadmap yet.");
  else {
    lines.push(`Progress: ${feats.length - open.length} of ${feats.length} features done.`);
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
  return lines.join("\n");
}

if (process.argv[1] && basename(process.argv[1]) === "status.mjs") {
  const i = process.argv.indexOf("--project");
  const root = resolve(i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : process.cwd());
  if (!existsSync(root)) {
    console.error("Folder not found.");
    process.exit(1);
  }
  console.log(buildStatus(root));
}
