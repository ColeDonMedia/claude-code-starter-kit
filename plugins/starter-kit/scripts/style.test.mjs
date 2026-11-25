// The style library: the vetted tables load, every offered palette is readable, matching gives sensible directions, and
// what it writes passes the kit's own design check. Run: node --test plugins/starter-kit/scripts/style.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { designMd, loadLibrary, match, paletteChecks, parseCsv, previewHtml, safePalette, search, tokensCss } from "./style-library.mjs";
import { checkDesign, contrast, ensureContrast } from "./design-check.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, "..", "library", "ui-ux-pro-max");
const CLI = join(HERE, "style-library.mjs");

test("the vetted tables are present with their license and notice, and load in full", () => {
  for (const f of ["LICENSE", "NOTICE.md", "styles.csv", "colors.csv", "typography.csv", "products.csv", "ux-guidelines.csv"]) assert.ok(existsSync(join(LIB, f)), f);
  assert.match(readFileSync(join(LIB, "LICENSE"), "utf8"), /MIT License/);
  assert.match(readFileSync(join(LIB, "NOTICE.md"), "utf8"), /8db36338810d0942567b97ce439affd1619fcf31/);
  const lib = loadLibrary();
  assert.ok(lib.styles.length >= 80, `styles: ${lib.styles.length}`);
  assert.equal(lib.palettes.length, 194);
  assert.equal(lib.fonts.length, 74);
  assert.equal(lib.products.length, 194);
  assert.equal(lib.ux.length, 141);
  assert.ok(lib.styles.every((s) => s["Style Category"] && s.No));
});

test("the CSV reader handles quotes, commas and doubled quotes inside cells", () => {
  const rows = parseCsv('No,Name,Notes\n1,"A, B","He said ""hi"""\n2,Plain,\r\n');
  assert.deepEqual(rows, [{ No: "1", Name: "A, B", Notes: 'He said "hi"' }, { No: "2", Name: "Plain", Notes: "" }]);
});

test("contrast fixing: a failing colour is nudged only as far as needed; a passing one is left alone", () => {
  assert.deepEqual(ensureContrast("#111111", "#ffffff", 4.5), { hex: "#111111", adjusted: false });
  const r = ensureContrast("#9ca3af", "#ffffff", 4.5);
  assert.equal(r.adjusted, true);
  assert.ok(contrast(r.hex, "#ffffff") >= 4.5);
  assert.ok(contrast(r.hex, "#ffffff") < 5.5, "only as far as needed");
  const dark = ensureContrast("#334155", "#0f172a", 4.5);
  assert.ok(contrast(dark.hex, "#0f172a") >= 4.5, "on a dark background it goes lighter");
});

test("every palette, as the kit hands it out, passes every contrast pair", () => {
  const lib = loadLibrary();
  let fixed = 0;
  for (const p of lib.palettes) {
    const before = paletteChecks(p).filter((c) => !c.ok).length;
    const { palette, changed } = safePalette(p);
    if (changed.length) fixed++;
    assert.equal(changed.length > 0, before > 0, `palette ${p.No}: changed only when something failed`);
    for (const c of paletteChecks(palette)) assert.ok(c.ok, `palette ${p.No} ${c.name}: ${c.ratio}`);
  }
  // NOTICE.md states this number; keep the two in step if the data is updated
  assert.equal(fixed, 81);
});

test("matching: very different products get different, fitting directions, with readable palettes", () => {
  const office = match("a business tool for small accounting firms to track invoices, calm and trustworthy");
  assert.equal(office.length, 3);
  assert.ok(office.some((c) => /minimal|flat|accessible|swiss/i.test(c.style["Style Category"])), office.map((c) => c.style["Style Category"]).join(" | "));
  assert.ok(office.every((c) => paletteChecks(c.palette).every((x) => x.ok)));
  const game = match("a free game streaming app for gamers, dark and bold", 3);
  assert.ok(game.some((c) => /dark|vibrant|cyber|neon|retro|3d/i.test(c.style["Style Category"])), game.map((c) => c.style["Style Category"]).join(" | "));
  assert.notDeepEqual(office.map((c) => c.style.No), game.map((c) => c.style.No));
  assert.ok(new Set(office.map((c) => c.fonts.No)).size === office.length, "each option gets its own font pairing");
});

test("search: styles, palettes, fonts and UX rules by words", () => {
  assert.ok(search("styles", "dashboard data dense analytics", 5).length > 0);
  assert.ok(search("fonts", "playful friendly", 3).some((x) => /playful|friendly/i.test(x.item["Mood/Style Keywords"])));
  assert.ok(search("ux", "form errors validation", 5).some((x) => /form/i.test(x.item.Category)));
  assert.ok(search("palettes", "healthcare clinic", 3).length > 0);
});

test("the written DESIGN.md passes the design check and carries the accessibility rules", () => {
  const lib = loadLibrary();
  for (const c of [match("invoice tool for accountants")[0], { style: lib.styles[6], palette: lib.palettes[112], fonts: lib.fonts[38] }]) {
    const { text } = designMd(c, "Linear, Stripe");
    assert.deepEqual(checkDesign(text), [], text.slice(0, 400));
    assert.match(text, /## Accessibility\n\nTarget: WCAG 2\.2 AA/);
    assert.match(text, /input-border: #[0-9a-f]{6}/i);
    assert.match(text, /Apps the owner likes: Linear, Stripe/);
    const ib = /input-border: (#[0-9a-f]{6})/i.exec(text)[1];
    const bg = /background: (#[0-9a-f]{6})/i.exec(text)[1];
    assert.ok(contrast(ib, bg) >= 3, "input borders meet 3:1");
  }
});

test("tokens and the preview page", () => {
  const c = match("wellness meditation app, calm")[0];
  const css = tokensCss(c);
  for (const v of ["--color-bg", "--color-text", "--color-accent", "--color-focus", "--color-input-border", "--font-heading", "--space-4", ":focus-visible", "prefers-reduced-motion"]) assert.ok(css.includes(v), v);
  const html = previewHtml(match("wellness meditation app, calm"));
  assert.match(html, /<html lang="en">/);
  assert.equal((html.match(/Option \d/g) ?? []).length, 3);
  const evil = previewHtml([{ ...c, style: { ...c.style, "Style Category": "<script>alert(1)</script>" } }]);
  assert.ok(!evil.includes("<script>alert(1)</script>"), "table text is escaped");
});

test("the command line: show never prints the table's AI-prompt column; write creates a passing brief", () => {
  const show = spawnSync(process.execPath, [CLI, "--show", "style:1"], { encoding: "utf8" });
  assert.equal(show.status, 0);
  assert.match(show.stdout, /Style Category: Minimalism/);
  assert.doesNotMatch(show.stdout, /AI Prompt Keywords/);
  const pal = spawnSync(process.execPath, [CLI, "--show", "palette:1"], { encoding: "utf8" });
  assert.match(pal.stdout, /ok {3}text on background/);
  const list = spawnSync(process.execPath, [CLI, "--list", "fonts", "--match", "luxury", "--limit", "3"], { encoding: "utf8" });
  assert.equal(list.stdout.trim().split("\n").length, 3);
  const d = mkdtempSync(join(tmpdir(), "style-"));
  try {
    const w = spawnSync(process.execPath, [CLI, "--write", "--style", "1", "--palette", "105", "--fonts", "5", "--project", d], { encoding: "utf8" });
    assert.equal(w.status, 0, w.stdout);
    const check = spawnSync(process.execPath, [join(HERE, "design-check.mjs"), "--project", d], { encoding: "utf8" });
    assert.equal(check.status, 0, check.stdout);
    const prev = spawnSync(process.execPath, [CLI, "--preview", join(d, "options.html"), "--match", "bakery website, warm"], { encoding: "utf8" });
    assert.equal(prev.status, 0);
    assert.ok(existsSync(join(d, "options.html")));
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
