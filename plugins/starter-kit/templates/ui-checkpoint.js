// ui-checkpoint v1
// The starter kit's UI checkpoint for Playwright tests. Copied into e2e/ by the kit; don't edit it (the kit replaces it when a
// newer version exists). In a browser test, import `test` and `expect` from here instead of @playwright/test, and call
//   await checkpoint(page, testInfo, "empty list")
// at every state a person can see: empty, loading, error, success, a popup or menu open, a half-filled form. It saves a
// screenshot to .claude/screens/<test file>/<state>-<size>.png and measures what a careful reviewer checks by eye (text that wraps
// or is cut off, controls that are covered, off-screen, unnamed or duplicated, junk text like "undefined", broken images, popups
// with no close button, long lists with no search, inner pages with no way back, console errors, and more), writing the numbers to
// .claude/ui-results/<size>/<test>--<state>.json. `node <starter-kit>/scripts/ui-check.mjs --project .` judges them.
// With a popup open, also call `await checkEscape(page, testInfo, "<state>")` last: it presses Escape and records whether it closed.
// Run the same tests a second time with stress data (UI_DATA=stress, see STRESS below) so long names and big lists are seen.
import { test as base, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

export const UI_CHECKPOINT_VERSION = 1;
export { expect };

// Values for the stress run: put them in the app's test data (a seed or fixture) when UI_DATA=stress.
export const STRESS = {
  longName: "Maximiliana Alexandra Featherstonehaugh-Worthington of Llanfairpwllgwyngyll",
  longWord: "averyveryverylongunbrokenaddress.with.no.spaces@subdomain.example-company-international.com",
  longText: "This is a realistic long description that a real person might type, with enough words to wrap onto three or four lines on a phone and to show whether cards, table cells and popups grow sensibly instead of overflowing or cutting it off.",
  accents: "Zoë Ångström-Núñez, Łódź 🎉",
  bigNumber: 1234567890.99,
  counts: [0, 1, 300],
};

const watched = new WeakMap();
export const test = base.extend({
  page: async ({ page }, use) => {
    const log = { errors: [], console: [], failed: [] };
    watched.set(page, log);
    page.on("pageerror", (e) => log.errors.push(String(e?.message ?? e).slice(0, 300)));
    page.on("console", (m) => {
      if (m.type() === "error") log.console.push(m.text().slice(0, 300));
    });
    page.on("response", (r) => {
      if (r.status() >= 500) log.failed.push(`${r.status()} ${r.url().slice(0, 200)}`);
    });
    await use(page);
  },
});

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "state";

function write(testInfo, state, record) {
  const size = slug(testInfo.project?.name || "default");
  const dir = join(".claude", "ui-results", size);
  mkdirSync(dir, { recursive: true });
  const name = `${slug(testInfo.titlePath.slice(1).join(" "))}--${slug(state)}.json`;
  writeFileSync(join(dir, name), JSON.stringify({ v: UI_CHECKPOINT_VERSION, size, test: testInfo.titlePath.slice(1).join(" > "), file: relative(process.cwd(), testInfo.file).replace(/\\/g, "/"), state, data: process.env.UI_DATA || "normal", measuredAt: new Date().toISOString(), ...record }, null, 1));
}

export async function checkpoint(page, testInfo, state, { fullPage = true } = {}) {
  await page.waitForLoadState("load").catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  const size = slug(testInfo.project?.name || "default");
  const shots = join(".claude", "screens", basename(testInfo.file).replace(/\.(spec|test)\.[jt]sx?$/, ""));
  mkdirSync(shots, { recursive: true });
  const screenshot = join(shots, `${slug(state)}-${size}.png`).replace(/\\/g, "/");
  await page.screenshot({ path: screenshot, fullPage }).catch(() => {});
  const measured = await page.evaluate(measurePage);
  let axe = null;
  if (process.env.UI_AXE !== "0") {
    try {
      const { default: AxeBuilder } = await import("@axe-core/playwright");
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      axe = r.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, example: v.nodes[0]?.target?.join(" ") ?? "" }));
    } catch {
      axe = null; // not installed: the accessibility test covers the pages
    }
  }
  const log = watched.get(page);
  const consoleRecord = log ? { watched: true, errors: log.errors.splice(0), console: log.console.splice(0), failed: log.failed.splice(0) } : { watched: false };
  write(testInfo, state, { screenshot, ...measured, axe, log: consoleRecord });
  return measured;
}

export async function checkEscape(page, testInfo, state) {
  const count = () => page.evaluate(() => [...document.querySelectorAll('dialog[open],[role=dialog],[role=alertdialog],[aria-modal="true"]')].filter((d) => { const r = d.getBoundingClientRect(); const s = getComputedStyle(d); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; }).length);
  const before = await count();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const after = await count();
  write(testInfo, `${state} (escape)`, { url: page.url(), escape: { before, after } });
  return after < before;
}

// Runs inside the page. Self-contained: no outside variables.
function measurePage() {
  const cap = (a, n = 12) => a.slice(0, n);
  const W = innerWidth;
  const H = innerHeight;
  const phone = W < 768;
  const visible = (el) => {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (el.closest("[hidden],[inert],[aria-hidden='true']")) return false;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === "none" || s.visibility === "hidden" || s.visibility === "collapse" || parseFloat(s.opacity) === 0) return false;
    }
    return true;
  };
  const textOf = (el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  const nameOf = (el) => {
    const lab = el.getAttribute("aria-label");
    if (lab && lab.trim()) return lab.trim();
    const by = el.getAttribute("aria-labelledby");
    if (by) {
      const t = by.split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean).map(textOf).join(" ").trim();
      if (t) return t;
    }
    if (el.tagName === "INPUT" && /^(submit|button|reset)$/i.test(el.type)) return (el.value || "").trim();
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
      const l = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l) return textOf(l);
      const wrap = el.closest("label");
      if (wrap) return textOf(wrap);
      return (el.getAttribute("placeholder") || el.getAttribute("title") || "").trim();
    }
    const t = textOf(el);
    if (t) return t;
    const img = el.querySelector("img[alt]");
    if (img && img.alt.trim()) return img.alt.trim();
    const svgTitle = el.querySelector("svg title");
    if (svgTitle && svgTitle.textContent.trim()) return svgTitle.textContent.trim();
    return (el.getAttribute("title") || "").trim();
  };
  const desc = (el) => {
    const n = nameOf(el);
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${n ? ` "${n.slice(0, 40)}"` : ""}`;
  };

  const DIALOG_SEL = 'dialog[open],[role=dialog],[role=alertdialog],[aria-modal="true"]';
  const dialogsOpen = [...document.querySelectorAll(DIALOG_SEL)].filter(visible);
  const topDialog = dialogsOpen.length ? dialogsOpen[dialogsOpen.length - 1] : null;
  const scope = topDialog && (topDialog.matches("dialog:modal") || topDialog.getAttribute("aria-modal") === "true" || topDialog.tagName !== "DIALOG") ? topDialog : document;

  const CTRL = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=switch],[role=tab],[role=menuitem],[role=option],[tabindex]:not([tabindex="-1"])';
  const all = [...scope.querySelectorAll(CTRL)].filter(visible);
  const buttons = all.filter((el) => el.matches('button,[role=button],input[type=submit],input[type=button],input[type=reset]') || (el.matches("a[href]") && /btn|button/i.test(el.className || "")));
  const REPEAT = "li,tr,[role=row],[role=listitem],[role=gridcell],article,[role=article],[role=option]";

  // Text that wraps onto two lines inside a button.
  const lines = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const tops = new Set();
    for (const r of range.getClientRects()) if (r.width > 1 && r.height > 1) tops.add(Math.round(r.top / 4));
    return tops.size;
  };
  const isPrimary = (el) => el.matches("[type=submit],[data-primary]") || /primary|cta/i.test(el.className || "");
  const wrapped = [];
  for (const b of buttons) {
    const t = textOf(b);
    if (t.includes(" ") && t.length < 80 && lines(b) > 1) wrapped.push({ text: t.slice(0, 60), primary: isPrimary(b) });
  }

  // Text cut off with no way to see the rest.
  const truncated = [];
  for (const el of document.querySelectorAll("body *")) {
    if (truncated.length >= 20) break;
    if (!el.firstChild || el.children.length > 3) continue;
    const s = getComputedStyle(el);
    const ell = s.textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 1;
    const clamp = s.webkitLineClamp && s.webkitLineClamp !== "none" && el.scrollHeight > el.clientHeight + 1;
    if (!(ell || clamp) || !visible(el)) continue;
    const t = textOf(el);
    if (!t) continue;
    const full = (el.getAttribute("title") || el.getAttribute("aria-label") || "").length >= t.length || !!el.closest("a[href]");
    const essential = !!el.closest("button,[role=button],h1,h2,h3,h4,h5,h6,label,th,[role=alert],[role=status],legend");
    if (!full) truncated.push({ text: t.slice(0, 60), essential });
  }

  // Controls with no name, covered by something else, or partly off the screen.
  const unnamed = cap(all.filter((el) => !nameOf(el)).map(desc));
  const covered = [];
  const offscreen = [];
  const scrollsSideways = (el) => {
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (/(auto|scroll)/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 1) return true;
    }
    return false;
  };
  for (const el of all) {
    const r = el.getBoundingClientRect();
    const entirelyOut = r.right <= 0 || r.left >= W;
    if (!entirelyOut && (r.right > W + 1 || r.left < -1) && !scrollsSideways(el)) offscreen.push(desc(el));
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
    if (getComputedStyle(el).pointerEvents === "none") continue;
    const top = document.elementFromPoint(cx, cy);
    if (top && top !== el && !el.contains(top) && !top.contains(el)) {
      const lbl = el.id && top.closest(`label[for="${CSS.escape(el.id)}"]`);
      if (!lbl && !top.closest("label")?.contains(el)) covered.push({ control: desc(el), by: desc(top) });
    }
  }

  // Tap targets: too small, or crowded together on a phone.
  const small = [];
  const rects = [];
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (el.tagName === "A" && el.closest("p,li,td,dd,blockquote") && (el.parentElement.textContent || "").trim().length > (el.textContent || "").trim().length + 10) continue;
    if (r.width < 24 || r.height < 24) small.push(`${desc(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    if (phone && (r.width < 44 || r.height < 44)) rects.push([el, r]);
  }
  const crowded = [];
  for (let a = 0; a < rects.length && crowded.length < 8; a++) {
    for (let b = a + 1; b < rects.length; b++) {
      const [e1, r1] = rects[a];
      const [e2, r2] = rects[b];
      if (e1.contains(e2) || e2.contains(e1)) continue;
      const gx = Math.max(0, Math.max(r1.left, r2.left) - Math.min(r1.right, r2.right));
      const gy = Math.max(0, Math.max(r1.top, r2.top) - Math.min(r1.bottom, r2.bottom));
      if (gx < 8 && gy < 8) {
        crowded.push(`${desc(e1)} and ${desc(e2)}`);
        break;
      }
    }
  }

  // Two controls doing the same job, links to nowhere, vague labels, disabled with no reason.
  const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
  const hrefOf = (el) => {
    const h = el.getAttribute("href");
    if (!h || h === "#" || /^javascript:/i.test(h)) return null;
    try {
      const u = new URL(h, location.href);
      return u.origin + u.pathname.replace(/\/$/, "") + u.search + u.hash;
    } catch {
      return null;
    }
  };
  const single = all.filter((el) => !el.closest(REPEAT) && !el.closest("footer,[role=contentinfo]") && !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName));
  const byName = new Map();
  for (const el of single) {
    const n = norm(nameOf(el));
    if (!n) continue;
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(el);
  }
  const duplicates = [];
  for (const [n, els] of byName) {
    if (els.length < 2) continue;
    const targets = new Set(els.map((e) => hrefOf(e) || `button:${e.getAttribute("type") || ""}`));
    duplicates.push({ name: n.slice(0, 40), count: els.length, sameTarget: targets.size === 1 });
  }
  const byTarget = new Map();
  for (const el of single) {
    const h = hrefOf(el);
    if (!h || el.querySelector("img,svg") && !textOf(el)) continue; // a logo next to a "Home" link is normal
    const n = norm(nameOf(el));
    if (!n) continue;
    if (!byTarget.has(h)) byTarget.set(h, new Set());
    byTarget.get(h).add(n);
  }
  const sameTarget = [...byTarget].filter(([, names]) => names.size > 1).map(([h, names]) => ({ href: h.replace(location.origin, ""), names: [...names].slice(0, 4) }));
  const deadLinks = cap(all.filter((el) => el.tagName === "A" && !el.getAttribute("role") && (() => { const h = (el.getAttribute("href") || "").trim(); return h === "" || h === "#" || /^javascript:/i.test(h); })()).map(desc));
  const VAGUE = /^(ok|okay|submit|yes|click here|here|go|confirm|send it|do it)$/i;
  const vague = cap([...new Set(buttons.map((b) => nameOf(b)).filter((n) => VAGUE.test(n.trim())))]);
  const disabledNoReason = cap(buttons.filter((b) => (b.disabled || b.getAttribute("aria-disabled") === "true") && !b.getAttribute("aria-describedby") && !b.getAttribute("title")).map(desc));

  // Text: junk values, tiny text, too many sizes and colours, date and money formats.
  const junk = [];
  const tiny = [];
  const sizes = new Set();
  const colours = new Set();
  const dates = new Set();
  const money = new Set();
  const JUNK = [
    ["undefined", /\bundefined\b/, "B"], ["NaN", /\bNaN\b/, "B"], ["Invalid Date", /Invalid Date/, "B"], ["[object Object]", /\[object Object\]/, "B"],
    ["Lorem ipsum", /lorem ipsum/i, "B"], ["{{template}}", /\{\{\s*[\w.$]+\s*\}\}/, "B"], ["${template}", /\$\{\s*[\w.]+\s*\}/, "B"], ["null", /\bnull\b/, "L"],
    ["singular count", /\b1 (items|results|files|records|users|clients|customers|invoices|messages|days|hours|minutes|comments|people|orders)\b/i, "L"],
    ["plural count", /\b(0|[2-9]|\d{2,}) (item|result|file|record|user|client|customer|invoice|message|day|hour|minute|comment|order)\b(?!s)/i, "L"],
  ];
  const DATE = [["2026-11-27", /\b\d{4}-\d{2}-\d{2}\b/], ["27/11/2026 or 11/27/2026", /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/], ["27.11.2026", /\b\d{1,2}\.\d{1,2}\.\d{4}\b/], ["Nov 27, 2026", /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2},? \d{4}\b/], ["27 Nov 2026", /\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{4}\b/]];
  const MONEY = [["$1,234.00", /[$€£¥]\s?\d[\d,]*\.\d{2}\b/], ["$1,234", /[$€£¥]\s?\d[\d,]*(?![\d.])/], ["1,234 USD", /\d[\d,.]*\s?(USD|EUR|GBP|CAD|AUD)\b/], ["1.234,00 €", /\d[\d.]*,\d{2}\s?[€$£]/]];
  // Text and images are judged on the whole page, even with a popup open: they are still on screen.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seenParents = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent.replace(/\s+/g, " ").trim();
    const p = n.parentElement;
    if (!t || !p || p.closest("script,style,noscript,template,code,pre,textarea") || !visible(p)) continue;
    for (const [kind, re, sev] of JUNK) if (re.test(t) && junk.length < 15) junk.push({ kind, sev, text: t.slice(0, 60) });
    for (const [kind, re] of DATE) if (re.test(t)) dates.add(kind);
    for (const [kind, re] of MONEY) if (re.test(t)) money.add(kind);
    if (seenParents.has(p)) continue;
    seenParents.add(p);
    const s = getComputedStyle(p);
    const fs = parseFloat(s.fontSize);
    sizes.add(Math.round(fs));
    colours.add(s.color);
    if (fs < 12 && t.length > 1 && tiny.length < 10) tiny.push(`"${t.slice(0, 30)}" ${fs}px`);
  }
  const inputZoom = phone ? cap(all.filter((el) => el.matches("input:not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]),textarea,select") && parseFloat(getComputedStyle(el).fontSize) < 16).map(desc)) : [];

  // Images that failed to load or are stretched.
  const brokenImages = [];
  const stretched = [];
  for (const img of document.querySelectorAll("img")) {
    if (!visible(img) || !img.complete) continue;
    const src = (img.currentSrc || img.src || "").replace(location.origin, "").slice(0, 80);
    if (img.naturalWidth === 0) {
      brokenImages.push(src);
      continue;
    }
    const fit = getComputedStyle(img).objectFit;
    const r = img.getBoundingClientRect();
    if ((fit === "fill" || !fit) && r.height > 8 && Math.abs(r.width / r.height / (img.naturalWidth / img.naturalHeight) - 1) > 0.06) stretched.push(src);
  }

  // Popups: close control, title, fits the screen, stacked, button order.
  const CLOSE = /\b(close|cancel|dismiss|done|keep|back|not now|no thanks|got it)\b|^[×✕✖xX]$/i;
  const CANCEL = /\b(cancel|keep|no|not now|back|discard)\b/i;
  const dialogs = dialogsOpen.map((d) => {
    const ctrls = [...d.querySelectorAll('button,[role=button],a[href],input[type=submit],input[type=button]')].filter(visible);
    const title = !!(d.getAttribute("aria-label") || d.getAttribute("aria-labelledby") || d.querySelector("h1,h2,h3,h4,[role=heading]"));
    const close = ctrls.some((c) => CLOSE.test(nameOf(c)));
    const r = d.getBoundingClientRect();
    const scrolls = [d, ...d.querySelectorAll("*")].some((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1);
    const tooTall = (r.bottom > H + 1 || r.top < -1) && !scrolls;
    const names = ctrls.map((c) => nameOf(c)).filter(Boolean);
    const cancel = ctrls.find((c) => CANCEL.test(nameOf(c)) && !/^[×✕✖xX]$/.test(nameOf(c).trim()));
    const primary = ctrls.find((c) => c !== cancel && (isPrimary(c) || c.matches("[type=submit]"))) || [...ctrls].reverse().find((c) => c !== cancel && !CLOSE.test(nameOf(c)));
    let order = null;
    if (cancel && primary) {
      const a = cancel.getBoundingClientRect();
      const b = primary.getBoundingClientRect();
      order = Math.abs(a.top - b.top) < 8 ? (a.left < b.left ? "cancel-first" : "primary-first") : a.top < b.top ? "cancel-first" : "primary-first";
    }
    return { name: (d.getAttribute("aria-label") || textOf(d.querySelector("h1,h2,h3,h4,[role=heading]") || d)).slice(0, 40), title, close, tooTall, buttons: names.slice(0, 6), order };
  });

  // Lists and tables: how many rows, and whether a person can search, sort or page through them.
  const lists = [];
  for (const t of document.querySelectorAll("table")) {
    if (!visible(t)) continue;
    const rows = t.tBodies.length ? [...t.tBodies].reduce((s, b) => s + b.rows.length, 0) : Math.max(0, t.rows.length - 1);
    const heads = [...t.querySelectorAll("thead th, tr:first-child th")];
    const hasSort = !!t.querySelector("th[aria-sort], th button, th a[href]");
    let leftNumbers = false;
    const body = t.tBodies[0];
    if (body && body.rows.length >= 3) {
      const cols = Math.max(...[...body.rows].map((r) => r.cells.length));
      for (let c = 0; c < cols && !leftNumbers; c++) {
        const cells = [...body.rows].map((r) => r.cells[c]).filter(Boolean);
        const numeric = cells.filter((cell) => /^[\s$€£¥+-]*[\d.,]+\s*(%|USD|EUR|GBP)?\s*$/.test(textOf(cell)) && textOf(cell).length > 0);
        if (numeric.length >= cells.length * 0.8 && numeric.length >= 3) {
          const al = getComputedStyle(numeric[0]).textAlign;
          if (al === "left" || al === "start") leftNumbers = true;
        }
      }
    }
    lists.push({ kind: "table", rows, columns: heads.length, hasSort, leftNumbers });
  }
  for (const l of document.querySelectorAll("ul,ol,[role=list],[role=grid],[role=listbox]")) {
    if (!visible(l) || l.closest("nav,header,footer,[role=menu],[role=menubar],[role=navigation],[role=tablist]")) continue;
    const items = [...l.children].filter((c) => c.matches("li,[role=listitem],[role=row],[role=option]") && visible(c));
    if (items.length >= 2) lists.push({ kind: "list", rows: items.length, columns: 0, hasSort: false, leftNumbers: false });
  }
  const names = [...document.querySelectorAll(CTRL)].filter(visible).map((el) => nameOf(el));
  const hasSearch = !!document.querySelector('input[type=search],[role=search],[role=searchbox]') || [...document.querySelectorAll("input,select")].filter(visible).some((el) => /search|filter|find|status|category/i.test(`${nameOf(el)} ${el.name || ""} ${el.id || ""}`));
  const hasSortControl = names.some((n) => /\bsort|order by\b/i.test(n));
  const hasPaging = !!document.querySelector('nav[aria-label*="pagina" i],[class*="pagination" i]') || names.some((n) => /^(next|previous|prev|load more|show more|older|newer|›|»|‹|«)\b|\bpage \d/i.test(n.trim()));

  // A way back on an inner page.
  let path = location.pathname.replace(/\/+$/, "");
  if ((!path || path === "") && location.hash.startsWith("#/")) path = location.hash.slice(1).replace(/\/+$/, "");
  const segs = path.split("/").filter(Boolean);
  const parents = segs.slice(0, -1).map((_, k) => "/" + segs.slice(0, k + 1).join("/"));
  const links = [...document.querySelectorAll("a[href]")].map((a) => {
    try {
      const u = new URL(a.getAttribute("href"), location.href);
      return (u.hash.startsWith("#/") ? u.hash.slice(1) : u.pathname).replace(/\/+$/, "");
    } catch {
      return "";
    }
  });
  const hasParentLink = parents.some((p) => links.includes(p));
  const hasBackControl = [...document.querySelectorAll(CTRL)].filter(visible).some((el) => /^(back|cancel|close|done|return|all \w+)\b|back to|^[←‹<]/i.test(nameOf(el).trim())) || !!document.querySelector('nav[aria-label*="breadcrumb" i]');

  const meta = {
    favicon: !!document.querySelector('link[rel~="icon"]'),
    description: !!document.querySelector('meta[name="description"]')?.content,
    shareTitle: !!document.querySelector('meta[property="og:title"]')?.content,
    shareImage: !!document.querySelector('meta[property="og:image"]')?.content,
  };

  return {
    url: location.href,
    path: path || "/",
    viewport: { width: W, height: H },
    title: document.title.trim(),
    meta,
    wrapped: cap(wrapped),
    truncated: cap(truncated),
    unnamed,
    covered: cap(covered, 8),
    offscreen: cap(offscreen),
    small: cap(small, 15),
    crowded,
    duplicates: cap(duplicates),
    sameTarget: cap(sameTarget, 6),
    deadLinks,
    vague,
    disabledNoReason,
    junk,
    tiny,
    inputZoom,
    fontSizes: [...sizes].sort((a, b) => a - b),
    colourCount: colours.size,
    dates: [...dates],
    money: [...money],
    brokenImages: cap(brokenImages),
    stretched: cap(stretched),
    dialogs,
    lists: cap(lists.sort((a, b) => b.rows - a.rows), 4),
    hasSearch,
    hasSort: hasSortControl,
    hasPaging,
    wayBack: { depth: segs.length, hasParentLink, hasBackControl },
    buttonNames: cap([...new Set(buttons.map((b) => nameOf(b)).filter(Boolean))], 60),
  };
}
