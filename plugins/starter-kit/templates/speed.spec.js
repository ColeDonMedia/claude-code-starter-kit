// End-to-end speed test (Playwright). Copied into e2e/ by the starter kit's init step; do not edit the measuring code, edit
// .claude/speed.json (pages, actions, limits) instead. It loads each page the way a mid-range phone on a slow 4G connection
// would (Chromium: network and CPU slowed down), measures what a visitor would feel, and writes .claude/speed-results.json.
// `node <starter-kit>/scripts/speed-check.mjs --project .` then judges the numbers in plain words.
//
// Measured per page: time to first byte, first and largest content painted, layout shift, total blocking time (how long the page
// was too busy to react), bytes downloaded and request count. Measured per action (a tap that does something): how long until the
// screen next repaints (does it feel instant?) and how long until the expected result is visible.
// Numbers from a developer's machine are a proxy for real users; they catch regressions and obvious waste, not network luck.
import { test } from "@playwright/test";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const budget = existsSync(".claude/speed.json") ? JSON.parse(readFileSync(".claude/speed.json", "utf8")) : {};
const pages = Object.keys(budget.pages ?? { "/": {} });
const actions = budget.actions ?? [];
const out = { profile: "phone (4x slower CPU), slow 4G (1.6 Mbit/s, 150 ms latency)", commit: null, measuredAt: new Date().toISOString(), pages: [], actions: [] };
try {
  out.commit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
} catch {
  /* not a git repository */
}

test.describe.configure({ mode: "serial" });

async function throttle(page) {
  // Only Chromium can slow down the network and CPU; other browsers are measured unthrottled and say so.
  try {
    const client = await page.context().newCDPSession(page);
    await client.send("Network.enable");
    await client.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    return true;
  } catch {
    out.profile = "NOT THROTTLED (this browser cannot slow itself down; use Chromium for real numbers)";
    return false;
  }
}

async function observe(page) {
  await page.addInitScript(() => {
    const s = (window.__speed = { fcp: 0, lcp: 0, cls: 0, tbt: 0 });
    const watch = (type, fn) => {
      try {
        new PerformanceObserver((list) => list.getEntries().forEach(fn)).observe({ type, buffered: true });
      } catch {
        /* not supported here */
      }
    };
    watch("paint", (e) => e.name === "first-contentful-paint" && (s.fcp = e.startTime));
    watch("largest-contentful-paint", (e) => (s.lcp = e.startTime));
    watch("layout-shift", (e) => !e.hadRecentInput && (s.cls += e.value));
    watch("longtask", (e) => (s.tbt += Math.max(0, e.duration - 50)));
  });
}

for (const path of pages) {
  test(`speed: ${path}`, async ({ page, browser }) => {
    test.setTimeout(90000);
    await throttle(page);
    await observe(page);
    let bytes = 0;
    let requests = 0;
    page.on("requestfinished", async (req) => {
      requests += 1;
      try {
        const s = await req.sizes();
        bytes += s.responseBodySize + s.responseHeadersSize;
      } catch {
        /* size unknown */
      }
    });
    await page.goto(path, { waitUntil: "load" });
    await page.waitForTimeout(2000); // let late paints and layout shifts land
    const m = await page.evaluate(() => ({ ...window.__speed, ttfb: performance.getEntriesByType("navigation")[0]?.responseStart ?? 0 }));
    out.pages.push({ page: path, profile: "phone", ttfbMs: m.ttfb, fcpMs: m.fcp, lcpMs: m.lcp, cls: m.cls, tbtMs: m.tbt, transferKb: bytes / 1024, requests });
  });
}

for (const a of actions) {
  test(`speed action: ${a.name}`, async ({ page }) => {
    test.setTimeout(90000);
    await throttle(page);
    try {
      await page.goto(a.page ?? "/", { waitUntil: "load" });
      const t0 = Date.now();
      const done = a.expect ? page.locator(a.expect).first().waitFor({ state: "visible", timeout: 20000 }) : Promise.resolve();
      await page.locator(a.click).first().click({ noWaitAfter: true });
      // two animation frames later the screen has repainted: if the page was busy, this takes long
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const feedbackMs = Date.now() - t0;
      await done;
      out.actions.push({ name: a.name, feedbackMs, doneMs: Date.now() - t0 });
    } catch (e) {
      out.actions.push({ name: a.name, error: String(e.message ?? e).split("\n")[0] });
    }
  });
}

test.afterAll(() => {
  mkdirSync(".claude", { recursive: true });
  writeFileSync(".claude/speed-results.json", JSON.stringify(out, null, 2));
});
