// End-to-end accessibility test (Playwright + axe-core). Copied into e2e/ by the starter kit's init step; edit the page list in
// .claude/a11y.json (or it uses the pages in .claude/speed.json, or just "/"), not the checks. For each page, at each size the
// Playwright config defines (phone and desktop), it records:
//   - axe-core results for WCAG 2.0, 2.1 and 2.2 Level A and AA (violations, and "incomplete" items a person must check)
//   - a keyboard walk: Tab through the page; every stop must show a visible focus style (2.4.7), never be completely hidden
//     behind other content (2.4.11), and focus must not get stuck (2.1.2)
//   - tap targets smaller than 24 x 24 px (2.5.8; axe applies the spacing exception, this list is advice)
//   - reflow at 320 px and 640 px wide, the widths of 400% and 200% zoom on a laptop (1.4.10, 1.4.4): no sideways scrolling
//   - motion that keeps running with "reduce motion" switched on
// Results go to .claude/a11y-results-<size>.json; `node <starter-kit>/scripts/a11y-check.mjs --project .` judges them.
// Automated checks find roughly half of real problems: the rest are listed by `a11y-check.mjs --manual` for a person to try.
import { test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);
const config = readJson(".claude/a11y.json") ?? {};
const pages = config.pages ?? Object.keys(readJson(".claude/speed.json")?.pages ?? { "/": {} });
const results = { measuredAt: new Date().toISOString(), pages: [] };
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.describe.configure({ mode: "serial" });

async function keyboardWalk(page, maxStops = 40) {
  await page.evaluate(() => {
    document.activeElement?.blur?.();
    window.scrollTo(0, 0);
  });
  const stops = [];
  const noFocusStyle = [];
  const obscured = [];
  let trapped = false;
  let last = null;
  let repeats = 0;
  for (let i = 0; i < maxStops; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) return null;
      const name = (e) => e.tagName.toLowerCase() + (e.id ? `#${e.id}` : "") + (e.getAttribute("aria-label") ? `[aria-label="${e.getAttribute("aria-label").slice(0, 30)}"]` : e.textContent?.trim() ? ` "${e.textContent.trim().slice(0, 30)}"` : "");
      const look = (e) => {
        const s = getComputedStyle(e);
        return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor, s.color, s.textDecorationLine].join("|");
      };
      const focused = look(el);
      const s = getComputedStyle(el);
      const hasOutline = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
      el.blur();
      const unfocused = look(el);
      el.focus({ preventScroll: true });
      const r = el.getBoundingClientRect();
      const points = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 2, r.top + 2], [r.right - 2, r.top + 2], [r.left + 2, r.bottom - 2], [r.right - 2, r.bottom - 2]];
      const inView = points.filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight);
      const hidden = r.width > 0 && inView.length > 0 && inView.every(([x, y]) => {
        const top = document.elementFromPoint(x, y);
        return top && top !== el && !el.contains(top) && !top.contains(el);
      });
      // A native date or time box moves Tab through its own parts (month, day, year) while focus stays on the box.
      const segmented = el.tagName === "INPUT" && /^(date|time|datetime-local|month|week)$/.test(el.type);
      return { key: name(el), visible: hasOutline || focused !== unfocused, hidden, segmented };
    });
    if (!info) {
      last = null;
      continue;
    }
    repeats = info.key === last ? repeats + 1 : 0;
    // Stuck = focus stays put for 3 Tabs (6 for a date or time box, whose parts take up to 5): a real trap is caught either way.
    if (repeats >= (info.segmented ? 6 : 3)) {
      trapped = true;
      break;
    }
    last = info.key;
    if (!stops.includes(info.key)) stops.push(info.key);
    if (!info.visible && !noFocusStyle.includes(info.key)) noFocusStyle.push(info.key);
    if (info.hidden && !obscured.includes(info.key)) obscured.push(info.key);
  }
  return { stops: stops.length, noFocusStyle: noFocusStyle.slice(0, 10), obscured: obscured.slice(0, 10), trapped };
}

const smallTargets = (page) =>
  page.evaluate(() => {
    const sel = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=switch],[role=tab],[role=menuitem],[tabindex]:not([tabindex="-1"])';
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      if (!r.width || !r.height || s.visibility === "hidden" || s.display === "none") continue;
      // links inside running text are exempt (WCAG 2.5.8 "inline")
      if (el.tagName === "A" && el.closest("p, li, td, dd, blockquote") && (el.parentElement.textContent || "").trim().length > (el.textContent || "").trim().length + 10) continue;
      if (r.width < 24 || r.height < 24) out.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out.slice(0, 20);
  });

for (const path of pages) {
  test(`accessibility: ${path}`, async ({ page }, testInfo) => {
    test.setTimeout(120000);
    await page.goto(path, { waitUntil: "load" });
    const axe = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    const violations = axe.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl, wcag: v.tags.filter((t) => /^wcag\d{3,}$/.test(t)), nodes: v.nodes.length, example: v.nodes[0]?.target?.join(" ") ?? "" }));
    const incomplete = axe.incomplete.map((v) => ({ id: v.id, help: v.help, nodes: v.nodes.length }));
    const keyboard = await keyboardWalk(page);
    const targets = await smallTargets(page);
    const reflow = {};
    const original = page.viewportSize();
    for (const width of [320, 640]) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(300);
      reflow[width] = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    }
    if (original) await page.setViewportSize(original);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(500);
    const motion = await page.evaluate(
      () =>
        document.getAnimations().filter((a) => {
          if (a.playState !== "running") return false;
          const t = a.effect?.getTiming?.() ?? {};
          return t.iterations === Infinity || Number(t.duration) > 300;
        }).length,
    );
    results.size = testInfo.project.name || "default";
    results.pages.push({ page: path, size: results.size, violations, incomplete, keyboard, smallTargets: targets, reflow, motion });
  });
}

test.afterAll(async ({}, testInfo) => {
  mkdirSync(".claude", { recursive: true });
  const size = (testInfo.project.name || "default").replace(/[^a-z0-9_-]/gi, "_");
  writeFileSync(`.claude/a11y-results-${size}.json`, JSON.stringify(results, null, 2));
});
