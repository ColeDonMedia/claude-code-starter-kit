// Accessibility: the WCAG 2.2 AA list is complete and correct, the judge sorts blocking from advice, and the browser test
// template measures what the judge reads. Run: node --test plugins/starter-kit/scripts/a11y.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CRITERIA, NEW_IN_22, manual } from "./wcag.mjs";
import { judgeA11y, loadResults } from "./a11y-check.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "a11y-check.mjs");

test("WCAG 2.2 A and AA: all 55 criteria, levels right, the new ones present, Parsing gone", () => {
  assert.equal(CRITERIA.length, 55);
  assert.equal(CRITERIA.filter((c) => c.level === "A").length, 31);
  assert.equal(CRITERIA.filter((c) => c.level === "AA").length, 24);
  assert.equal(new Set(CRITERIA.map((c) => c.id)).size, 55, "no duplicates");
  for (const id of NEW_IN_22) assert.ok(CRITERIA.some((c) => c.id === id), id);
  assert.ok(!CRITERIA.some((c) => c.id === "4.1.1"), "4.1.1 Parsing was removed in WCAG 2.2");
  const lvl = Object.fromEntries(CRITERIA.map((c) => [c.id, c.level]));
  assert.deepEqual([lvl["2.4.11"], lvl["2.5.7"], lvl["2.5.8"], lvl["3.2.6"], lvl["3.3.7"], lvl["3.3.8"], lvl["1.4.3"], lvl["2.4.7"]], ["AA", "AA", "AA", "A", "A", "AA", "AA", "AA"]);
  assert.ok(CRITERIA.every((c) => /^(axe|kit|person)(\+(axe|kit|person))?$/.test(c.check) && c.plain.length > 20));
  assert.ok(manual().length >= 30, "most criteria need a person somewhere");
});

const clean = { page: "/", size: "phone", violations: [], incomplete: [], keyboard: { stops: 6, noFocusStyle: [], obscured: [], trapped: false }, smallTargets: [], reflow: { 320: true, 640: true }, motion: 0 };
test("the judge: a clean page passes; each failure blocks or advises as it should", () => {
  assert.deepEqual(judgeA11y([clean]), { blocking: [], advice: [], people: [] });
  const bad = {
    ...clean,
    violations: [
      { id: "color-contrast", impact: "serious", help: "Elements must meet minimum color contrast ratio thresholds", helpUrl: "https://dequeuniversity.com/rules/axe/4.10/color-contrast", wcag: ["wcag2aa", "wcag143"], nodes: 3, example: ".hero p" },
      { id: "region", impact: "moderate", help: "All page content should be contained by landmarks", wcag: [], nodes: 1, example: "div" },
    ],
    incomplete: [{ id: "color-contrast", help: "Check text over images", nodes: 2 }],
    keyboard: { stops: 4, noFocusStyle: ['a "Pricing"'], obscured: ['button "Buy"'], trapped: true },
    smallTargets: ["button#close 16x16"],
    reflow: { 320: false, 640: true },
    motion: 2,
  };
  const r = judgeA11y([bad]);
  assert.equal(r.blocking.length, 5);
  assert.match(r.blocking.join("\n"), /color contrast.*WCAG 1\.4\.3 Contrast \(Minimum\)/i);
  assert.match(r.blocking.join("\n"), /focus gets stuck.*2\.1\.2/);
  assert.match(r.blocking.join("\n"), /no visible focus on a "Pricing".*2\.4\.7/);
  assert.match(r.blocking.join("\n"), /hidden behind other content.*2\.4\.11/);
  assert.match(r.blocking.join("\n"), /320 px wide.*1\.4\.10/);
  assert.equal(r.advice.length, 3);
  assert.match(r.advice.join("\n"), /landmarks.*best practice/);
  assert.match(r.advice.join("\n"), /under 24 px.*2\.5\.8/);
  assert.match(r.advice.join("\n"), /reduce motion/);
  assert.match(r.people[0], /a person must check/);
});

test("results from every screen size are read together; no results means not measured (exit 2)", () => {
  const d = mkdtempSync(join(tmpdir(), "a11y-"));
  try {
    const run = () => spawnSync(process.execPath, [CLI, "--project", d], { encoding: "utf8" });
    assert.equal(run().status, 2);
    mkdirSync(join(d, ".claude"));
    writeFileSync(join(d, ".claude", "a11y-results-phone.json"), JSON.stringify({ pages: [clean] }));
    writeFileSync(join(d, ".claude", "a11y-results-desktop.json"), JSON.stringify({ pages: [{ ...clean, size: "desktop" }] }));
    assert.equal(loadResults(d).length, 2);
    const ok = run();
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /No blocking accessibility problems on 2 page\/size/);
    writeFileSync(join(d, ".claude", "a11y-results-desktop.json"), JSON.stringify({ pages: [{ ...clean, size: "desktop", keyboard: { ...clean.keyboard, trapped: true } }] }));
    assert.equal(run().status, 1);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("the manual list and the full criteria table print in plain words", () => {
  const m = spawnSync(process.execPath, [CLI, "--manual"], { encoding: "utf8" }).stdout;
  assert.match(m, /3\.3\.8 Accessible Authentication \(Minimum\)/);
  assert.match(m, /2\.5\.7 Dragging Movements/);
  const all = spawnSync(process.execPath, [CLI, "--criteria"], { encoding: "utf8" }).stdout;
  assert.match(all, /^55 criteria\./m);
  assert.match(all, /2\.4\.11.*\(new in 2\.2\)/);
});

test("the browser test template measures what the judge reads, with the WCAG 2.2 AA tags, and is valid JavaScript", () => {
  const f = join(HERE, "..", "templates", "a11y.spec.js");
  assert.equal(spawnSync(process.execPath, ["--check", f], { encoding: "utf8" }).status, 0);
  const src = readFileSync(f, "utf8");
  for (const s of ["@axe-core/playwright", '"wcag22aa"', '"wcag21aa"', "keyboard.press(\"Tab\")", "noFocusStyle", "obscured", "trapped", "smallTargets", "reflow", "320", "640", 'reducedMotion: "reduce"', "a11y-results-", "incomplete"]) assert.ok(src.includes(s), s);
});
