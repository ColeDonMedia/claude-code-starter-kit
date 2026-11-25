// Delivery check: reads the BUILT site (the build folder) and its server configuration for the things that make pages load slowly
// or jump around, which are cheap to fix and easy to miss: scripts that block the page from painting, images without a size,
// everything loaded at once, giant unconverted images, fonts that hide text while loading, files that can't be cached for long,
// and no sign of compression or caching rules. It reads files only and needs no browser.
// Run: node delivery-check.mjs --dir <build folder> [--project <dir>]     Exit 1 on a FAIL; WARN lines are advice.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKIP = new Set(["node_modules", ".git", "cache"]);
const HASHED = /[.\-_][0-9a-zA-Z]{8,}\.(js|mjs|css|woff2?|png|jpe?g|webp|avif|svg)$/;
const BIG_IMAGE_KB = 200;

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP.has(e.name)) walk(p, out);
    } else out.push(p);
  }
  return out;
}
const read = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
};

export function checkHtml(file, html) {
  const out = [];
  const f = (level, msg) => out.push({ level, file, msg });
  const headHtml = /<head[\s>][\s\S]*?<\/head>/i.exec(html)?.[0] ?? "";
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) f("FAIL", "no viewport meta tag: phones will show a tiny zoomed-out desktop page");
  for (const m of headHtml.matchAll(/<script\b([^>]*)>/gi)) {
    const a = m[1];
    if (/\bsrc=/i.test(a) && !/\b(async|defer)\b/i.test(a) && !/type=["']module["']/i.test(a)) f("FAIL", `a script in the head blocks the page from painting (${(/src=["']([^"']+)/i.exec(a) ?? [])[1] ?? "?"}): add defer or async, or move it to the end of the body`);
  }
  const sheets = [...headHtml.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)];
  if (sheets.length > 4) f("WARN", `${sheets.length} separate stylesheets are loaded before the page can paint: combine them`);
  const imgs = [...html.matchAll(/<img\b([^>]*)>/gi)].map((m) => m[1]);
  const noSize = imgs.filter((a) => !(/\bwidth=/i.test(a) && /\bheight=/i.test(a)) && !/\bstyle=["'][^"']*(width|aspect-ratio)/i.test(a));
  if (noSize.length) f("WARN", `${noSize.length} image(s) have no width and height, so the page jumps when they load`);
  if (imgs.length > 3 && !imgs.some((a) => /\bloading=["']lazy["']/i.test(a))) f("WARN", `${imgs.length} images and none is lazy-loaded: images below the first screen should have loading="lazy"`);
  const noAlt = imgs.filter((a) => !/\balt=/i.test(a));
  if (noAlt.length) f("WARN", `${noAlt.length} image(s) have no alt text`);
  for (const m of html.matchAll(/<link\b[^>]*rel=["']preload["'][^>]*as=["']font["'][^>]*>/gi)) if (!/crossorigin/i.test(m[0])) f("WARN", "a preloaded font is missing crossorigin, so the browser downloads it twice");
  return out;
}

export function checkCss(file, css) {
  const out = [];
  const faces = [...css.matchAll(/@font-face\s*\{[^}]*\}/gi)];
  const noDisplay = faces.filter((m) => !/font-display\s*:/i.test(m[0]));
  if (noDisplay.length) out.push({ level: "WARN", file, msg: `${noDisplay.length} @font-face rule(s) have no font-display: text stays invisible while the font downloads (use font-display: swap)` });
  return out;
}

export function checkDelivery(dir, project = null) {
  const findings = [];
  const files = walk(dir);
  const rel = (p) => relative(dir, p).replace(/\\/g, "/");
  for (const p of files) {
    const ext = extname(p).toLowerCase();
    if (ext === ".html" || ext === ".htm") findings.push(...checkHtml(rel(p), read(p)));
    if (ext === ".css") findings.push(...checkCss(rel(p), read(p)));
  }
  const assets = files.filter((p) => /\.(js|mjs|css)$/i.test(p) && !/\.map$/i.test(p));
  const unhashed = assets.filter((p) => !HASHED.test(p));
  if (assets.length && unhashed.length / assets.length > 0.5) findings.push({ level: "WARN", file: "(build)", msg: `${unhashed.length} of ${assets.length} scripts and styles have no fingerprint in their file name (like app.3f9a2c1b.js), so they cannot be cached for long: turn on hashed file names in the build` });
  const images = files.filter((p) => /\.(png|jpe?g|gif)$/i.test(p));
  const modern = files.some((p) => /\.(webp|avif)$/i.test(p));
  for (const p of images) {
    const kb = statSync(p).size / 1024;
    if (kb > BIG_IMAGE_KB && extname(p).toLowerCase() !== ".gif") findings.push({ level: "WARN", file: rel(p), msg: `${kb.toFixed(0)} KB ${extname(p).slice(1).toUpperCase()}${modern ? "" : " and no WebP or AVIF version exists"}: resize it to the size it is shown at and convert it` });
  }
  // Compression and caching: look for any sign in the build or the project's server configuration.
  const roots = [dir, project].filter(Boolean);
  const configs = [];
  for (const r of roots) for (const n of ["vercel.json", "netlify.toml", "_headers", "nginx.conf", "Caddyfile", ".htaccess", "firebase.json", "wrangler.toml", "render.yaml", "fly.toml", "server.js", "server.ts", "app.js", "app.ts", "index.js"]) if (existsSync(join(r, n))) configs.push(read(join(r, n)));
  const cfg = configs.join("\n");
  const precompressed = files.some((p) => /\.(br|gz)$/i.test(p));
  if (!precompressed && !/gzip|brotli|compression|\bbr\b|compress/i.test(cfg)) findings.push({ level: "WARN", file: "(server)", msg: "no sign of text compression (gzip or Brotli): most static hosts do it for you; if you run your own server, turn it on" });
  if (!/cache-control|max-age|immutable|cacheControl/i.test(cfg)) findings.push({ level: "WARN", file: "(server)", msg: "no cache rules found: fingerprinted files should be cached for a year (Cache-Control: public, max-age=31536000, immutable), pages should revalidate. Static hosts usually do this; check yours" });
  return findings;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  const get = (f) => (a.includes(f) ? a[a.indexOf(f) + 1] : undefined);
  const dir = get("--dir");
  if (!dir || !existsSync(dir)) {
    console.log("Give the build folder with --dir (build the project first).");
    process.exit(64);
  }
  const f = checkDelivery(resolve(dir), get("--project") ? resolve(get("--project")) : null);
  console.log(f.length ? f.map((x) => `${x.level.padEnd(4)} ${x.file}: ${x.msg}`).join("\n") : "Nothing slow-looking found in the build.");
  process.exitCode = f.some((x) => x.level === "FAIL") ? 1 : 0;
}
