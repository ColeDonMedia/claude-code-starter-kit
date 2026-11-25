// Accessibility judge: reads what the browser test measured (.claude/a11y-results-*.json, written by templates/a11y.spec.js)
// and says, in plain words, what blocks shipping and what is advice. Target: WCAG 2.2 Level AA.
//   BLOCKS  axe violations rated critical or serious; focus not visible (2.4.7); focus completely hidden (2.4.11); keyboard
//           trap (2.1.2); sideways scrolling at 320 px (1.4.10) or 640 px wide (about 200% zoom, 1.4.4)
//   ADVICE  moderate and minor axe findings; small tap targets (2.5.8: axe applies the spacing rule and blocks real failures);
//           motion that ignores "reduce motion"; axe's "incomplete" items, which a person must check
// Automated checks find roughly half of real problems. `--manual` lists the WCAG 2.2 AA criteria that need a person, in plain
// words, for acceptance; `--criteria` lists all 55 with how each is checked.
// Run: node a11y-check.mjs --project <dir> [--manual] [--criteria] [--json]   Exit 0 ok, 1 blocking problems, 2 never measured.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CRITERIA, NEW_IN_22, byId, manual } from "./wcag.mjs";

export function loadResults(root) {
  const dir = join(root, ".claude");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^a11y-results(-.+)?\.json$/.test(f))
    .flatMap((f) => {
      try {
        return JSON.parse(readFileSync(join(dir, f), "utf8")).pages ?? [];
      } catch {
        return [];
      }
    });
}

const crit = (id) => {
  const c = byId(id);
  return c ? `WCAG ${c.id} ${c.name}` : `WCAG ${id}`;
};
const wcagOf = (tags = []) => tags.map((t) => t.replace(/^wcag(\d)(\d)(\d+)$/, "$1.$2.$3")).filter((t) => /^\d\.\d\.\d+$/.test(t));

export function judgeA11y(pages) {
  const blocking = [];
  const advice = [];
  const people = [];
  for (const p of pages) {
    const where = `${p.page} (${p.size ?? "default"})`;
    for (const v of p.violations ?? []) {
      const refs = wcagOf(v.wcag).map(crit).join(", ") || "best practice";
      const line = `${where}: ${v.help} — ${v.nodes} place(s), e.g. ${v.example || "?"} [${refs}] ${v.helpUrl ?? ""}`.trim();
      (v.impact === "critical" || v.impact === "serious" ? blocking : advice).push(line);
    }
    const k = p.keyboard ?? {};
    if (k.trapped) blocking.push(`${where}: keyboard focus gets stuck; pressing Tab stops moving [${crit("2.1.2")}]`);
    for (const e of k.noFocusStyle ?? []) blocking.push(`${where}: no visible focus on ${e}: give it a focus ring (2 px or more, the focus colour) [${crit("2.4.7")}]`);
    for (const e of k.obscured ?? []) blocking.push(`${where}: ${e} is completely hidden behind other content when it has focus (a sticky header or banner?) [${crit("2.4.11")}]`);
    if (k.stops === 0) advice.push(`${where}: Tab reached nothing at all: either the page has no controls, or they cannot be reached by keyboard [${crit("2.1.1")}]`);
    if (p.reflow && p.reflow[320] === false) blocking.push(`${where}: at 320 px wide the page scrolls sideways [${crit("1.4.10")}]`);
    if (p.reflow && p.reflow[640] === false) blocking.push(`${where}: at 640 px wide (about 200% zoom) the page scrolls sideways [${crit("1.4.4")}]`);
    if ((p.smallTargets ?? []).length) advice.push(`${where}: ${p.smallTargets.length} tap target(s) under 24 px, e.g. ${p.smallTargets.slice(0, 3).join(", ")}; 44 px is better on touch screens [${crit("2.5.8")}]`);
    if (p.motion > 0) advice.push(`${where}: ${p.motion} animation(s) keep running with "reduce motion" on: respect prefers-reduced-motion`);
    for (const i of p.incomplete ?? []) people.push(`${where}: ${i.help} (${i.nodes} place(s)) — axe could not decide; a person must check`);
  }
  return { blocking, advice, people };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  const root = resolve(a.includes("--project") ? a[a.indexOf("--project") + 1] : ".");
  if (a.includes("--criteria")) {
    for (const c of CRITERIA) console.log(`${c.id.padEnd(7)} ${c.level.padEnd(3)} ${(c.check).padEnd(11)} ${c.name}${NEW_IN_22.includes(c.id) ? " (new in 2.2)" : ""}: ${c.plain}`);
    console.log(`\n${CRITERIA.length} criteria. axe = the automated engine, kit = the kit's own browser checks, person = needs a human.`);
  } else if (a.includes("--manual")) {
    console.log("Check these by hand (WCAG 2.2 AA items no script can settle). Skip the ones that don't apply and say why:");
    for (const c of manual()) console.log(`- ${c.id} ${c.name}: ${c.plain}`);
  } else {
    const pages = loadResults(root);
    if (!pages.length) {
      console.log("No accessibility measurements yet: run the accessibility test (e2e/a11y.spec.js) first.");
      process.exitCode = 2;
    } else {
      const r = judgeA11y(pages);
      if (a.includes("--json")) console.log(JSON.stringify(r, null, 1));
      else {
        console.log(r.blocking.length ? `BLOCKING (${r.blocking.length}):\n${r.blocking.map((x) => `- ${x}`).join("\n")}` : `No blocking accessibility problems on ${pages.length} page/size combination(s).`);
        if (r.advice.length) console.log(`Advice (${r.advice.length}):\n${r.advice.map((x) => `- ${x}`).join("\n")}`);
        if (r.people.length) console.log(`For a person to check (${r.people.length}):\n${r.people.slice(0, 15).map((x) => `- ${x}`).join("\n")}`);
        console.log("Automated checks find roughly half of real problems: run --manual for the rest.");
      }
      process.exitCode = r.blocking.length ? 1 : 0;
    }
  }
}
