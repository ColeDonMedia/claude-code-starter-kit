// Is a feature that keeps failing review still worth another round? Reads only the build state, git and the flight log, so it
// costs no tokens. Run from review round 3 on (the feature workflow's only stop rule), and whenever a build is BLOCKED. The choice is the owner's; this gives the evidence.
//   node worth-it.mjs --project <folder>
// Rounds: the build state records each round's start (branch tip and time). For builds from before that, commits are grouped by
// their own wording: "Red-team ... round N" starts the fixes of round N+1, "(round-N item ...)" is a fix in round N.
// Trial 3 (client portal): F-001 reached review round 6, each round answering the last round's findings one level deeper.
import { spawnSync } from "node:child_process";
import { basename, resolve } from "node:path";
import { readState } from "./build-state.mjs";
import { readLog } from "./flight-lib.mjs";

const TEST = /(^|\/)(e2e|tests?|__tests__|spec)\/|\.(test|spec)\.[a-z]+$/i;
const STOP = new Set(("the a an and or to of for in on with is are be it its that this from into at by as no not now so than then " +
  "add adds added make makes keep keeps use uses one two all new more less only own each when once after before stays still per " +
  "round item items fix fixes test tests failing red team red-team redteam review e2e readme comment comments").split(" "));

function git(cwd, ...a) {
  const r = spawnSync("git", ["-C", cwd, ...a], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : "";
}

// Commits from base to tip, oldest first, each with its files and line counts.
export function commitsOf(root, base, tip) {
  const out = git(root, "log", "--reverse", "--numstat", "--format=@@%H%x09%cI%x09%s", `${base}..${tip}`);
  const list = [];
  for (const line of out.split("\n")) {
    if (line.startsWith("@@")) {
      const [sha, t, ...s] = line.slice(2).split("\t");
      list.push({ sha, t, subject: s.join("\t"), files: [], added: 0, removed: 0 });
    } else if (line.trim() && list.length) {
      const [a, d, file] = line.split("\t");
      const c = list[list.length - 1];
      c.files.push(file);
      c.added += Number(a) || 0;
      c.removed += Number(d) || 0;
    }
  }
  return list;
}

// Which round each commit belongs to: by the recorded round starts, or by the commits' own wording.
export function assignRounds(commits, starts = []) {
  const heads = new Map(starts.filter((s) => s.head).map((s) => [s.head, s.n]));
  let r = 1;
  if (heads.size) {
    // a commit belongs to the round that was open when it was made: the round whose start head comes before it
    return commits.map((c) => {
      const out = { ...c, round: r };
      if (heads.has(c.sha)) r = Math.max(r, heads.get(c.sha));
      return out;
    });
  }
  return commits.map((c) => {
    const rt = /red[- ]?team\b.*\bround[- ]?(\d+)/i.exec(c.subject);
    if (rt) r = Math.max(r, Number(rt[1]) + 1);
    const it = /\bround[- ](\d+)\s+item/i.exec(c.subject);
    if (it) r = Math.max(r, Number(it[1]));
    return { ...c, round: r };
  });
}

const words = (s) => (s.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? []).filter((w) => !STOP.has(w) && !/^f-\d+$/.test(w));

export function summarize(commits) {
  const byRound = new Map();
  for (const c of commits) {
    const r = byRound.get(c.round) ?? { n: c.round, commits: 0, lines: 0, code: new Set(), tests: new Set(), words: new Map() };
    r.commits++;
    r.lines += c.added + c.removed;
    for (const f of c.files) (TEST.test(f) ? r.tests : r.code).add(f);
    for (const w of new Set(words(c.subject))) r.words.set(w, (r.words.get(w) ?? 0) + 1);
    byRound.set(c.round, r);
  }
  return [...byRound.values()].sort((a, b) => a.n - b.n);
}

// Tokens per round from the flight log's per-agent totals (cumulative per agent): what each agent added inside the round's window.
export function tokensByRound(events, starts) {
  const use = events.filter((e) => e.ev === "use" && e.aid && e.t).sort((a, b) => a.t.localeCompare(b.t));
  if (!use.length || !starts.length) return null;
  const at = (iso) => {
    const last = new Map();
    for (const e of use) if (e.t <= iso) last.set(e.aid, e);
    return last;
  };
  const sum = (m) => [...m.values()].reduce((s, e) => ({ out: s.out + (e.out || 0), fresh: s.fresh + (e.inp || 0) + (e.cw || 0) }), { out: 0, fresh: 0 });
  // Round 1 is the build and its first review, so it runs from the beginning to round 2's start.
  const later = starts.filter((s) => s.n > 1 && s.t).sort((a, b) => a.t.localeCompare(b.t));
  const END = "9999-12-31T23:59:59Z"; // compared as text, so the end must sort last
  const out = new Map();
  let prev = { out: 0, fresh: 0 };
  [{ n: 1 }, ...later].forEach((r, i) => {
    const s = sum(at(later[i]?.t ?? END));
    out.set(r.n, { out: s.out - prev.out, fresh: s.fresh - prev.fresh });
    prev = s;
  });
  return out;
}

// The judgement: plain rules over the numbers, every reason stated. The owner decides.
export function judge(rounds) {
  const reasons = [];
  if (rounds.length < 3) return { pick: "KEEP GOING", reasons: ["Too few rounds to see a trend."] };
  const first = rounds[0];
  const fixes = rounds.slice(1);
  const last = rounds[rounds.length - 1];
  const prev = rounds[rounds.length - 2];
  const fixLines = fixes.reduce((n, r) => n + r.lines, 0);
  const shrinking = last.lines < 0.6 * prev.lines && last.code.size <= prev.code.size;
  const earlier = new Set(fixes.slice(0, -1).flatMap((r) => [...r.code]));
  const overlap = last.code.size ? [...last.code].filter((f) => earlier.has(f)).length / last.code.size : 0;
  const theme = [...new Set(fixes.flatMap((r) => [...r.words.keys()]))]
    .map((w) => [w, fixes.filter((r) => r.words.has(w)).length])
    .filter(([, n]) => n >= Math.max(2, Math.ceil(fixes.length / 2)))
    .sort((a, b) => b[1] - a[1]).slice(0, 4).map(([w]) => w);
  if (shrinking) reasons.push(`The last round was much smaller than the one before (${last.lines} lines against ${prev.lines}): the findings are running out.`);
  else reasons.push(`The last round was not smaller than the one before (${last.lines} lines against ${prev.lines}).`);
  if (overlap >= 0.5) reasons.push(`${Math.round(overlap * 100)}% of the last round's code files were already changed in earlier fix rounds: the same area is being dug deeper.`);
  else if (last.code.size) reasons.push(`Most of the last round's code files are new to the fixes: the fixes are spreading.`);
  if (theme.length) reasons.push(`The same subject keeps coming back in the fixes: ${theme.join(", ")}.`);
  const growth = first.lines ? fixLines / first.lines : 0;
  if (growth >= 1) reasons.push(`The fixes (${fixLines} lines) are now larger than the original build (${first.lines} lines).`);
  let pick;
  if (shrinking) pick = "KEEP GOING";
  else if (growth >= 1.5 && overlap < 0.5) pick = "START SMALLER";
  else if (overlap >= 0.5 || theme.length) pick = "ACCEPT THE REST";
  else pick = "SPLIT IT";
  return { pick, reasons, theme, growth, overlap };
}

const OPTIONS = {
  "KEEP GOING": "run one more round of fixes and review",
  "ACCEPT THE REST": "fix only what blocks the acceptance criteria, write the rest into PROJECT.md under Harden before launch (red-team tests for them stay, marked as known), and merge",
  "SPLIT IT": "merge what already passes its criteria, and move the open findings to a new roadmap item for later",
  "START SMALLER": "stop this branch, which is kept so nothing is lost, and rebuild the feature as smaller items, one concern each",
};

export function worthIt(root) {
  const s = readState(root);
  if (!s || !s.item) return { text: "No feature build in progress, so there is nothing to judge." };
  const tip = s.branch ? git(root, "rev-parse", "--verify", "--quiet", `refs/heads/${s.branch}`).trim() : "";
  if (!tip || !s.base) return { text: `"${s.item}": its branch or start point is not recorded, so its rounds cannot be read.` };
  const rounds = summarize(assignRounds(commitsOf(root, s.base, tip), s.rounds ?? []));
  const tokens = tokensByRound(readLog(root), s.rounds ?? []);
  const j = judge(rounds);
  const k = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));
  const lines = [`WORTH IT? "${String(s.item).slice(0, 80)}": review round ${s.round || rounds.length}, builder on ${s.builder ?? "unknown"}.`];
  for (const r of rounds) {
    const t = tokens?.get(r.n);
    lines.push(`- Round ${r.n}${r.n === 1 ? " (the build)" : ""}: ${r.commits} commit(s), ${r.lines} lines changed, ${r.code.size} code and ${r.tests.size} test file(s)${t ? `; ${k(t.out)} tokens written, ${k(t.fresh)} read new` : ""}.`);
  }
  if (!tokens) lines.push("- Tokens per round: not recorded for this build (the kit records them from 2.18.0 on).");
  lines.push(...j.reasons.map((r) => `  ${r}`));
  lines.push(`RECOMMEND: ${j.pick}: ${OPTIONS[j.pick]}.`);
  lines.push(`The other choices: ${Object.keys(OPTIONS).filter((o) => o !== j.pick).map((o) => `${o} (${OPTIONS[o]})`).join("; ")}.`);
  return { text: lines.join("\n"), pick: j.pick, rounds: rounds.length };
}

if (process.argv[1] && basename(process.argv[1]) === "worth-it.mjs") {
  const i = process.argv.indexOf("--project");
  console.log(worthIt(resolve(i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : process.cwd())).text);
}
