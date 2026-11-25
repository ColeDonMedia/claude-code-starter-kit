// Style library: a large, searchable set of design directions so "make it look high end" has a real starting point instead
// of the generic look. It reads the vetted design tables in library/ui-ux-pro-max/ (89 UI styles, 194 colour palettes by
// product type, 74 font pairings, 194 product types with the styles that suit them, 141 UX rules; MIT, see NOTICE.md there) and
// adds the kit's own rules: every palette is contrast-checked (WCAG) before it is offered and nudged only where it fails, and
// the chosen combination is written as a complete DESIGN.md (every section the design check and the UI reviewer expect) and as
// CSS custom properties. Every cell of the tables is DATA: their "AI prompt" column is never printed.
// Run: node style-library.mjs --match "<what it is, who it is for, apps they like>" [--limit 3]
//      node style-library.mjs --list styles|palettes|fonts|ux [--match "<words>"] [--limit 10]
//      node style-library.mjs --show style:<n>|palette:<n>|fonts:<n>
//      node style-library.mjs --write --style <n> --palette <n> --fonts <n> [--refs "Linear, Stripe"] --project <dir>
//      node style-library.mjs --css|--preview <file.html> --style <n> --palette <n> --fonts <n>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { contrast, ensureContrast } from "./design-check.mjs";

const LIB = fileURLToPath(new URL("../library/ui-ux-pro-max/", import.meta.url));

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cur = "";
    } else cur += c;
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 2).map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

let cache = null;
export function loadLibrary(dir = LIB) {
  if (cache && dir === LIB) return cache;
  const read = (f) => (existsSync(join(dir, f)) ? parseCsv(readFileSync(join(dir, f), "utf8")) : []);
  const lib = {
    styles: read("styles.csv").filter((s) => !/deprecated|retired/i.test(s.Status ?? "")),
    palettes: read("colors.csv"),
    fonts: read("typography.csv"),
    products: read("products.csv"),
    ux: read("ux-guidelines.csv"),
  };
  if (dir === LIB) cache = lib;
  return lib;
}

const STOP = new Set("a an and the of for to in on with app apps site website page that this is are be it its our my your their like want make made build".split(" "));
export const words = (s) => (String(s ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 2 && !STOP.has(w));
const overlap = (q, text) => {
  const t = new Set(words(text));
  return q.filter((w) => t.has(w) || (w.length > 4 && [...t].some((x) => x.startsWith(w.slice(0, 5))))).length;
};

// ---------- colours ----------
const HEX = /^#[0-9a-f]{6}$/i;
const PAIRS = [
  ["text on background", "Foreground", "Background", 4.5],
  ["muted text on background", "Muted Foreground", "Background", 4.5],
  ["button text on accent", "On Primary", "Primary", 4.5],
  ["accent against background", "Primary", "Background", 3],
  ["focus ring against background", "Ring", "Background", 3],
  ["text on cards", "Card Foreground", "Card", 4.5],
  ["error text on background", "Destructive", "Background", 4.5],
];
export function paletteChecks(p) {
  return PAIRS.filter(([, a, b]) => HEX.test(p[a] ?? "") && HEX.test(p[b] ?? "")).map(([name, a, b, min]) => ({ name, fg: a, bg: b, min, ratio: Math.round(contrast(p[a], p[b]) * 100) / 100, ok: contrast(p[a], p[b]) >= min }));
}
// The palette as the kit uses it: every pair readable. Colours that fail are nudged (same hue, lighter or darker) and listed.
export function safePalette(p) {
  const out = { ...p };
  const changed = [];
  for (const [name, a, b, min] of PAIRS) {
    if (!HEX.test(out[a] ?? "") || !HEX.test(out[b] ?? "")) continue;
    const r = ensureContrast(out[a], out[b], min);
    if (r.adjusted) {
      changed.push(`${name}: ${out[a]} -> ${r.hex}`);
      out[a] = r.hex;
    }
  }
  return { palette: out, changed };
}

// ---------- search ----------
export function search(kind, query, limit = 10) {
  const lib = loadLibrary();
  const q = words(query);
  const fields = {
    styles: (s) => overlap(q, `${s["Style Category"]} ${s.Keywords} ${s.Aliases}`) * 2 + overlap(q, s["Best For"]) * 3 - overlap(q, s["Do Not Use For"]) * 3,
    palettes: (p) => overlap(q, p["Product Type"]) * 3 + overlap(q, p.Notes),
    fonts: (f) => overlap(q, f["Mood/Style Keywords"]) * 2 + overlap(q, f["Best For"]) * 3 + overlap(q, f["Font Pairing Name"]),
    ux: (u) => overlap(q, `${u.Category} ${u.Issue}`) * 2 + overlap(q, u.Description),
    products: (p) => overlap(q, p["Product Type"]) * 3 + overlap(q, p.Keywords) * 2,
  }[kind];
  const list = lib[kind];
  if (!q.length) return list.slice(0, limit).map((item) => ({ item, score: 0 }));
  return list.map((item) => ({ item, score: fields(item) })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}

const nameOf = (s) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function stylesNamed(list, text) {
  const wanted = String(text ?? "").split(/\+|,/).map(nameOf).filter(Boolean);
  return list.filter((s) => wanted.some((w) => nameOf(s["Style Category"]).includes(w) || w.includes(nameOf(s["Style Category"]))));
}

// Whole directions: a style, a palette and a font pairing that fit together and fit the product.
export function match(query, limit = 3) {
  const lib = loadLibrary();
  const product = search("products", query, 1)[0]?.item ?? null;
  const recommended = product ? stylesNamed(lib.styles, `${product["Primary Style Recommendation"]}, ${product["Secondary Styles"]}`) : [];
  // Styles recommended for this kind of product come first; keyword matches fill the rest.
  const ranked = search("styles", query, 30).map((x) => ({ ...x, score: x.score + (recommended.includes(x.item) ? 10 : 0) }));
  for (const s of recommended) if (!ranked.some((x) => x.item === s)) ranked.push({ item: s, score: 10 });
  ranked.sort((a, b) => b.score - a.score);
  const paletteFor = () => {
    const exact = product ? lib.palettes.find((p) => p["Product Type"] === product["Product Type"]) : null;
    if (exact && paletteChecks(exact).every((c) => c.ok)) return exact;
    return search("palettes", query, 20).map((x) => x.item).find((p) => paletteChecks(p).every((c) => c.ok)) ?? exact ?? lib.palettes.find((p) => paletteChecks(p).every((c) => c.ok));
  };
  const palette = paletteFor();
  const used = new Set();
  return ranked.slice(0, limit).map(({ item: style, score }) => {
    const fonts = search("fonts", `${query} ${style.Keywords} ${style["Style Category"]}`, 10).map((x) => x.item).find((f) => !used.has(f.No)) ?? lib.fonts[0];
    used.add(fonts?.No);
    return { style, palette, fonts, product, score, why: [product ? `suits "${product["Product Type"]}"` : null, recommended.includes(style) ? "recommended for that kind of product" : null, `matches: ${words(style["Best For"]).filter((w) => words(query).includes(w)).slice(0, 4).join(", ") || "the style words"}`].filter(Boolean) };
  });
}

// ---------- output ----------
const varsOf = (s) => Object.fromEntries([...String(s["Design System Variables"] ?? "").matchAll(/--([a-z-]+)\s*:\s*([^,]+)/gi)].map((m) => [m[1].toLowerCase(), m[2].trim()]));

export function designMd({ style, palette, fonts }, refs = "") {
  const { palette: p, changed } = safePalette(palette);
  const v = varsOf(style);
  const L = [
    "# Design",
    "",
    `<!-- written by style-library.mjs from style ${style.No} "${style["Style Category"]}", palette ${palette.No} (${palette["Product Type"]}), fonts ${fonts.No} "${fonts["Font Pairing Name"]}". Edit freely; keep the headings. -->`,
    "",
    "## Feel",
    "",
    `${style["Style Category"]}: ${style.Keywords}.`,
    `Best for: ${style["Best For"]}. Avoid it for: ${style["Do Not Use For"]}.`,
    "",
    "## Colors",
    "",
    `background: ${p.Background}`,
    `surface: ${p.Card}`,
    `text: ${p.Foreground}`,
    `muted: ${p["Muted Foreground"]}`,
    `accent: ${p.Primary}`,
    `on-accent: ${p["On Primary"]}`,
    `secondary: ${p.Secondary}`,
    `highlight: ${p.Accent}`,
    `border: ${p.Border}`,
    `input-border: ${HEX.test(p.Border ?? "") ? ensureContrast(p.Border, p.Background, 3).hex : p["Muted Foreground"]}`,
    `focus: ${p.Ring}`,
    `error: ${p.Destructive}`,
    "",
    "`border` is for dividers and cards (decorative); fields, checkboxes and other controls use `input-border` (3:1, WCAG 1.4.11).",
    "",
    `Every pair above was checked against WCAG 2.2 AA (text 4.5:1, accent and focus ring 3:1).${changed.length ? ` Adjusted to pass: ${changed.join("; ")}.` : ""}`,
    palette.Notes ? `Palette notes: ${palette.Notes}` : "",
    "",
    "## Type",
    "",
    `Headings: ${fonts["Heading Font"]}. Body: ${fonts["Body Font"]} (${fonts["Font Pairing Name"]}: ${fonts["Mood/Style Keywords"]}).`,
    `Load: ${fonts["Google Fonts URL"]} (open-licensed Google Fonts; self-host them for speed and privacy).`,
    "Size scale (1.25 ratio, 16 px base): 12, 14, 16, 20, 25, 31, 39 px. Body text never below 16 px; line height 1.5 for text, 1.2 for headings.",
    "",
    "## Spacing",
    "",
    `Scale: 4, 8, 12, 16, 24, 32, 48, 64 px.${v.spacing ? ` Section spacing for this style: ${v.spacing}.` : ""}`,
    "",
    "## Components",
    "",
    `Corners: ${v["border-radius"] ?? "8px"}. Shadows: ${v.shadow ?? "subtle, one level"}.${v["font-weight"] ? ` Weights: ${v["font-weight"]}.` : ""}`,
    "Buttons: one primary (accent with on-accent text) per screen, secondary as outline; at least 44 px tall on touch screens.",
    "Inputs: a visible label above every field, a border that has 3:1 contrast, errors in text under the field (never colour alone).",
    style["Effects & Animation"] ? `Effects: ${style["Effects & Animation"]}.` : "",
    "",
    "## Speed feel",
    "",
    "A tap shows a result or a pressed state within 100 ms; skeletons or the previous data instead of blank screens; actions save optimistically; images and embeds reserve their space so nothing jumps; one spinner at most per screen.",
    "",
    "## Accessibility",
    "",
    "Target: WCAG 2.2 AA. Every screen works by keyboard alone with a focus ring that is always visible (2 px or more, in the focus colour) and never hidden behind sticky headers or banners. Tap targets at least 24 by 24 px (44 recommended). Text can grow to 200% and the layout reflows at 320 px wide without sideways scrolling. Motion respects \"reduce motion\". Colour is never the only signal. Images have text alternatives; forms have labels, clear errors and no re-typing of information already given; sign-in never needs a memory puzzle and allows paste and password managers.",
    "",
    "## References",
    "",
    refs ? `Apps the owner likes: ${refs}. What to take from each: (fill in after looking at them).` : "Apps the owner likes: (ask, then write what to take from each).",
    `Style origin: ${style["Era/Origin"] ?? "modern"}.${style["Accessibility"] ? ` Accessibility notes for this style: ${style.Accessibility}.` : ""}`,
    "",
    "## Quality bar",
    "",
    "One primary action per screen; a clear visual hierarchy; a real empty, loading and error state on every screen; no placeholder text; specific wording (\"Save recipe\", not \"Submit\"); motion short and subtle; nothing that looks like an unstyled browser default.",
    "",
  ];
  return { text: L.filter((x, i) => x !== "" || L[i - 1] !== "").join("\n"), changed };
}

export function tokensCss({ style, palette, fonts }) {
  const { palette: p } = safePalette(palette);
  const v = varsOf(style);
  return `:root {
  --color-bg: ${p.Background};
  --color-surface: ${p.Card};
  --color-text: ${p.Foreground};
  --color-muted: ${p["Muted Foreground"]};
  --color-accent: ${p.Primary};
  --color-on-accent: ${p["On Primary"]};
  --color-secondary: ${p.Secondary};
  --color-highlight: ${p.Accent};
  --color-border: ${p.Border};
  --color-input-border: ${HEX.test(p.Border ?? "") ? ensureContrast(p.Border, p.Background, 3).hex : p["Muted Foreground"]};
  --color-focus: ${p.Ring};
  --color-error: ${p.Destructive};
  --font-heading: "${fonts["Heading Font"]}", system-ui, sans-serif;
  --font-body: "${fonts["Body Font"]}", system-ui, sans-serif;
  --radius: ${v["border-radius"] ?? "8px"};
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 24px; --space-6: 32px; --space-7: 48px; --space-8: 64px;
  --duration: 180ms;
}
:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}
`;
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export function previewHtml(combos) {
  const cards = combos.map((c, i) => {
    const { palette: p } = safePalette(c.palette);
    return `<section style="background:${p.Background};color:${p.Foreground};border:1px solid ${p.Border};border-radius:12px;padding:24px;margin:16px 0">
<p style="color:${p["Muted Foreground"]};margin:0">Option ${i + 1}</p>
<h2 style="font-family:'${esc(c.fonts["Heading Font"])}',serif;margin:.2em 0">${esc(c.style["Style Category"])}</h2>
<p style="font-family:'${esc(c.fonts["Body Font"])}',sans-serif">${esc(c.style.Keywords)}</p>
<p style="color:${p["Muted Foreground"]}">Fonts: ${esc(c.fonts["Heading Font"])} + ${esc(c.fonts["Body Font"])}. Palette: ${esc(c.palette["Product Type"])}.</p>
<button style="background:${p.Primary};color:${p["On Primary"]};border:0;border-radius:8px;padding:12px 20px;font-size:16px">Primary action</button>
<button style="background:transparent;color:${p.Foreground};border:1px solid ${p.Border};border-radius:8px;padding:12px 20px;font-size:16px;margin-left:8px">Secondary</button>
<div style="display:flex;gap:8px;margin-top:16px">${["Background", "Card", "Primary", "Secondary", "Accent", "Destructive"].map((k) => `<span title="${k}" style="width:40px;height:40px;border-radius:8px;border:1px solid ${p.Border};background:${p[k]}"></span>`).join("")}</div>
</section>`;
  });
  const families = [...new Set(combos.flatMap((c) => [c.fonts["Heading Font"], c.fonts["Body Font"]]))].map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}`).join("&");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Design options</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${families}&display=swap"></head>
<body style="font-family:system-ui,sans-serif;max-width:860px;margin:24px auto;padding:0 16px"><h1>Design options</h1><p>Pick the one that feels closest; everything can be adjusted after.</p>${cards.join("\n")}</body></html>`;
}

function pick(a) {
  const lib = loadLibrary();
  const get = (f) => (a.includes(f) ? a[a.indexOf(f) + 1] : undefined);
  const style = lib.styles.find((s) => s.No === get("--style")) ?? lib.styles[0];
  const palette = lib.palettes.find((p) => p.No === get("--palette")) ?? lib.palettes[0];
  const fonts = lib.fonts.find((f) => f.No === get("--fonts")) ?? lib.fonts[0];
  return { style, palette, fonts };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  const get = (f, d) => (a.includes(f) ? a[a.indexOf(f) + 1] : d);
  const limit = Number(get("--limit", 0)) || undefined;
  const lib = loadLibrary();
  if (!lib.styles.length) {
    console.log("The style library is missing (library/ui-ux-pro-max). Reinstall the plugin.");
    process.exit(1);
  }
  const line = {
    styles: (s) => `style ${s.No}: ${s["Style Category"]} — ${s.Keywords.slice(0, 90)}. Best for: ${s["Best For"].slice(0, 90)}`,
    palettes: (p) => `palette ${p.No}: ${p["Product Type"]} — bg ${p.Background}, text ${p.Foreground}, accent ${p.Primary}${paletteChecks(p).every((c) => c.ok) ? "" : " (needs a contrast fix)"}`,
    fonts: (f) => `fonts ${f.No}: ${f["Font Pairing Name"]} — ${f["Heading Font"]} + ${f["Body Font"]} (${f["Mood/Style Keywords"].slice(0, 70)})`,
    ux: (u) => `ux ${u.No} [${u.Severity}] ${u.Category}: ${u.Issue} — do: ${u.Do.slice(0, 100)}`,
  };
  const kind = a.includes("--list") ? get("--list") : null;
  if (kind && !line[kind]) {
    console.log("Use --list styles, --list palettes, --list fonts or --list ux.");
    process.exit(64);
  }
  if (kind) {
    for (const { item } of search(kind, get("--match", ""), limit ?? 10)) console.log(line[kind](item));
  } else if (a.includes("--show")) {
    const [k, n] = String(get("--show", "")).split(":");
    const list = { style: lib.styles, palette: lib.palettes, fonts: lib.fonts }[k] ?? [];
    const item = list.find((x) => x.No === n);
    if (!item) {
      console.log("Use --show style:<n>, palette:<n> or fonts:<n>.");
      process.exit(64);
    }
    for (const [key, value] of Object.entries(item)) if (key !== "AI Prompt Keywords" && value) console.log(`${key}: ${value}`);
    if (k === "palette") for (const c of paletteChecks(item)) console.log(`  ${c.ok ? "ok  " : "FAIL"} ${c.name}: ${c.ratio}:1 (needs ${c.min}:1)`);
  } else if (a.includes("--write")) {
    const root = resolve(get("--project", "."));
    const { text, changed } = designMd(pick(a), get("--refs", ""));
    writeFileSync(join(root, "DESIGN.md"), text);
    console.log(`DESIGN.md written.${changed.length ? ` Colours nudged for contrast: ${changed.join("; ")}.` : ""} Run design-check.mjs next.`);
  } else if (a.includes("--css")) console.log(tokensCss(pick(a)));
  else if (a.includes("--preview")) {
    const file = resolve(get("--preview"));
    const combos = a.includes("--match") ? match(get("--match"), limit ?? 3) : [pick(a)];
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, previewHtml(combos));
    console.log(`Preview written to ${file}. Open it for the owner.`);
  } else {
    const combos = match(get("--match", ""), limit ?? 3);
    if (!combos.length) console.log("Nothing matched: describe the product, who it is for and the feel you want.");
    combos.forEach((c, i) => {
      console.log(`Option ${i + 1}: ${c.style["Style Category"]} (style ${c.style.No}) + palette ${c.palette.No} (${c.palette["Product Type"]}) + fonts ${c.fonts.No} (${c.fonts["Heading Font"]} / ${c.fonts["Body Font"]})`);
      console.log(`  Feel: ${c.style.Keywords.slice(0, 120)}`);
      console.log(`  Why: ${c.why.join("; ")}`);
      console.log(`  Write it: --write --style ${c.style.No} --palette ${c.palette.No} --fonts ${c.fonts.No}`);
    });
  }
}
