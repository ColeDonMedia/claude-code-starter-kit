// Speed budget judge: did the running app actually load and respond fast enough, measured in a real browser on a throttled
// "mid-range phone on a 4G connection"? The measurements come from the Playwright speed test (templates/speed.spec.js, which init
// copies into e2e/) and land in .claude/speed-results.json; this judges them against the project's budget, in plain words.
// Budget: .claude/speed.json (optional; anything missing uses the defaults below):
//   { "defaults": { "lcpMs": 2500 }, "pages": { "/": {}, "/dashboard": { "lcpMs": 3000 } },
//     "actions": [ { "name": "save a recipe", "page": "/new", "click": "button[type=submit]", "expect": ".toast" } ] }
// Run: node speed-check.mjs --project <dir> [--results <file>] [--init]
// Exit 0 ok, 1 over budget, 2 no measurements yet. Reads two JSON files; runs nothing.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// Chosen to match "good" in Google's Core Web Vitals, measured here on a slowed-down phone profile.
export const DEFAULTS = {
  lcpMs: 2500, // largest content painted: the page looks loaded
  fcpMs: 1800, // first content painted: the page is not blank
  cls: 0.1, // layout shift: things jumping around
  tbtMs: 300, // total blocking time: a proxy for "taps feel instant" (a real INP needs a person)
  ttfbMs: 800, // the server's first byte
  transferKb: 600, // compressed bytes the first load downloads
  requests: 50,
  actionFeedbackMs: 100, // a tap shows something within this
  actionDoneMs: 1000, // the result is on screen within this
};

export function loadBudget(root) {
  let cfg = {};
  try {
    cfg = JSON.parse(readFileSync(join(root, ".claude", "speed.json"), "utf8"));
  } catch {
    /* defaults */
  }
  return { defaults: { ...DEFAULTS, ...(cfg.defaults ?? {}) }, pages: cfg.pages ?? { "/": {} }, actions: cfg.actions ?? [] };
}

const LABEL = {
  lcpMs: ["the main content appears", "ms", "Load less before first paint: smaller or lazy-loaded images, no render-blocking scripts, a faster server response."],
  fcpMs: ["the first thing appears", "ms", "Remove render-blocking CSS and scripts, inline the critical CSS, preload the main font."],
  cls: ["the page jumps around", "", "Give images and embeds a width and height, reserve space for late content, avoid inserting content above what is already shown."],
  tbtMs: ["the page is busy and ignores taps", "ms", "Ship less JavaScript, split big bundles, move heavy work off the main thread, delay what is not needed at first."],
  ttfbMs: ["the server is slow to answer", "ms", "Cache the response, speed up the slowest query, or move the server closer to users."],
  transferKb: ["the first load downloads too much", "KB", "Compress and resize images, drop unused libraries, split code by page."],
  requests: ["the page makes too many requests", "", "Bundle small files, remove unused scripts and fonts, avoid chains of requests that wait on each other."],
};

export function judgeResults(results, budget) {
  const problems = [];
  const notes = [];
  const pages = results.pages ?? [];
  if (!pages.length) notes.push("The measurements contain no pages.");
  for (const p of pages) {
    const b = { ...budget.defaults, ...(budget.pages[p.page] ?? {}) };
    for (const k of Object.keys(LABEL)) {
      const v = p[k];
      if (v === undefined || v === null) continue;
      if (v > b[k]) {
        const [what, unit, fix] = LABEL[k];
        problems.push(`${p.page} (${p.profile ?? "phone"}): ${what}: ${k === "cls" ? v.toFixed(2) : Math.round(v)}${unit ? " " + unit : ""}, budget ${b[k]}${unit ? " " + unit : ""}. ${fix}`);
      }
    }
  }
  for (const a of results.actions ?? []) {
    if (a.error) {
      problems.push(`action "${a.name}" could not be measured: ${a.error}`);
      continue;
    }
    if (a.feedbackMs > budget.defaults.actionFeedbackMs) problems.push(`action "${a.name}": nothing changed on screen for ${Math.round(a.feedbackMs)} ms after the tap (budget ${budget.defaults.actionFeedbackMs} ms). Show a pressed state or a spinner immediately and do the work after painting.`);
    if (a.doneMs > budget.defaults.actionDoneMs) problems.push(`action "${a.name}": the result took ${Math.round(a.doneMs)} ms to appear (budget ${budget.defaults.actionDoneMs} ms). Find the slow request, update the screen optimistically, or move slow work to the background.`);
  }
  for (const p of budget.actions) if (!(results.actions ?? []).some((a) => a.name === p.name)) notes.push(`The budget lists the action "${p.name}" but it was not measured.`);
  for (const k of Object.keys(budget.pages)) if (!pages.some((p) => p.page === k)) notes.push(`The page ${k} is in the budget but was not measured.`);
  return { problems, notes };
}

function head(root) {
  const r = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

export function check(root, resultsFile) {
  const p = resultsFile ?? join(root, ".claude", "speed-results.json");
  if (!existsSync(p)) return { state: "none" };
  let results;
  try {
    results = JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return { state: "none" };
  }
  const { problems, notes } = judgeResults(results, loadBudget(root));
  const h = head(root);
  if (h && results.commit && results.commit !== h) notes.push("These measurements are from an older version of the code; run the speed test again.");
  return { state: problems.length ? "over" : "ok", problems, notes, measuredPages: (results.pages ?? []).length, profile: results.profile };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  const get = (f) => (a.includes(f) ? a[a.indexOf(f) + 1] : undefined);
  const root = resolve(get("--project") ?? ".");
  if (a.includes("--init")) {
    const p = join(root, ".claude", "speed.json");
    if (existsSync(p)) console.log(".claude/speed.json already exists.");
    else {
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, JSON.stringify({ defaults: {}, pages: { "/": {} }, actions: [] }, null, 2) + "\n");
      console.log("Wrote .claude/speed.json with the default budget (edit it to add pages and actions).");
    }
  } else {
    const r = check(root, get("--results"));
    if (r.state === "none") {
      console.log("No speed measurements yet: run the speed test (e2e/speed.spec.js) first.");
      process.exitCode = 2;
    } else {
      console.log(r.state === "ok" ? `Speed is within budget on ${r.measuredPages} page(s) (${r.profile ?? "phone, slow 4G"}).` : r.problems.map((x) => `- ${x}`).join("\n"));
      for (const n of r.notes) console.log(`Note: ${n}`);
      process.exitCode = r.state === "ok" ? 0 : 1;
    }
  }
}
