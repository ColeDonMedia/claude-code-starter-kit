// Checks a project's DESIGN.md (the design brief every screen follows): it must exist for projects with a screen, hold the
// sections that keep a product looking like one product, and its declared colors must have readable contrast.
// Run: node design-check.mjs --project <dir>    Exit 1 when something is missing; prints what to fix. Reads files only.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SECTIONS = [
  ["feel", /feel|personality|tone/i],
  ["colors", /color|colour|palette/i],
  ["type", /font|typograph|\btype\b/i],
  ["spacing", /spacing|space scale/i],
  ["components", /component|button|input/i],
  ["speed feel", /speed|snappy|perceived|responsiv/i],
  ["accessibility", /accessib|a11y|wcag/i],
  ["references", /reference|inspir|apps we like/i],
  ["quality bar", /quality bar|polish/i],
];

function hexToRgb(h) {
  let s = h.replace("#", "");
  if (s.length === 3) s = [...s].map((c) => c + c).join("");
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance([r, g, b]) {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(a, b) {
  const [l1, l2] = [luminance(hexToRgb(a)), luminance(hexToRgb(b))].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// Nudge a colour lighter or darker (keeping its hue) until it has at least `min` contrast against `bg`. Returns the
// original when it already passes, so a palette is only changed where it has to be.
const toHex = ([r, g, b]) => "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToRgb([h, s, l]) {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => {
    t = (t + 1) % 1;
    return 255 * (t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p);
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}
export function ensureContrast(fg, bg, min) {
  if (contrast(fg, bg) >= min) return { hex: fg, adjusted: false };
  const [h, s, l0] = rgbToHsl(hexToRgb(fg));
  const darker = luminance(hexToRgb(bg)) > 0.18; // light background: go darker; dark background: go lighter
  for (let step = 1; step <= 100; step++) {
    const l = Math.max(0, Math.min(1, l0 + (darker ? -step : step) / 100));
    const hex = toHex(hslToRgb([h, s, l]));
    if (contrast(hex, bg) >= min) return { hex, adjusted: true };
  }
  return { hex: darker ? "#000000" : "#ffffff", adjusted: true };
}

export function checkDesign(text) {
  const problems = [];
  for (const [name, re] of SECTIONS) if (!new RegExp(`^#{1,4}[^\\n]*(${re.source})`, "im").test(text)) problems.push(`DESIGN.md has no "${name}" heading`);
  const colors = {};
  for (const m of text.matchAll(/^[\s>*-]*\**([a-z][a-z -]{1,24}?)\**\s*[:=]\s*`?(#[0-9a-f]{3}(?:[0-9a-f]{3})?)\b/gim)) colors[m[1].trim().toLowerCase()] = m[2];
  const bg = colors.background ?? colors.bg ?? colors.surface;
  if (!bg) problems.push("DESIGN.md does not declare a background color like `background: #ffffff`");
  const pairs = [
    ["text", 4.5],
    ["muted", 4.5],
    ["accent", 3],
    ["error", 4.5],
    ["success", 3],
    ["warning", 3],
  ];
  if (bg) {
    if (!colors.text) problems.push("DESIGN.md does not declare a text color like `text: #111111`");
    for (const [name, min] of pairs) {
      const key = Object.keys(colors).find((k) => k === name || k.startsWith(name));
      if (!key) continue;
      const r = contrast(colors[key], bg);
      if (r < min) problems.push(`${key} ${colors[key]} on background ${bg} has contrast ${r.toFixed(1)}:1, needs at least ${min}:1`);
    }
  }
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--project");
  const root = resolve(i >= 0 ? args[i + 1] : ".");
  const p = join(root, "DESIGN.md");
  if (!existsSync(p)) {
    console.log("No DESIGN.md. A project with a screen needs one (the spec workflow writes it).");
    process.exit(1);
  }
  const problems = checkDesign(readFileSync(p, "utf8"));
  console.log(problems.length ? problems.map((x) => `- ${x}`).join("\n") : "DESIGN.md has every section and its colors are readable.");
  process.exit(problems.length ? 1 : 0);
}
