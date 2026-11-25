// Speed budget: is the built app small enough to load quickly?
//   node perf-budget.mjs --dir <build folder> [--max-js-kb 300] [--max-css-kb 100] [--max-image-kb 500] [--max-total-kb 2000]
//
// Measures the COMPRESSED (gzip) size of what the build produced, which is what a visitor's phone has to download:
// JavaScript, CSS, images and fonts. Source maps are ignored. It exits 1 if any budget is exceeded and lists the biggest
// files so the fix is obvious. This is a proxy: it totals the whole build, not one page's first load, and it cannot
// measure server speed. It is deterministic and needs no browser.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const KIND = {
  js: new Set([".js", ".mjs", ".cjs"]),
  css: new Set([".css"]),
  image: new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg", ".ico"]),
  font: new Set([".woff", ".woff2", ".ttf", ".otf", ".eot"]),
};
const SKIP_DIRS = new Set(["node_modules", ".git", "cache"]);

export function measure(dir) {
  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(p);
        continue;
      }
      if (e.name.endsWith(".map")) continue;
      const ext = extname(e.name).toLowerCase();
      const kind = Object.keys(KIND).find((k) => KIND[k].has(ext));
      if (!kind) continue;
      const raw = statSync(p).size;
      // already-compressed formats don't shrink; text formats are measured gzipped
      const size = kind === "js" || kind === "css" || ext === ".svg" ? gzipSync(readFileSync(p)).length : raw;
      files.push({ file: relative(dir, p).replace(/\\/g, "/"), kind, kb: size / 1024 });
    }
  };
  walk(dir);
  const total = (k) => files.filter((f) => !k || f.kind === k).reduce((s, f) => s + f.kb, 0);
  return { files, js: total("js"), css: total("css"), image: total("image"), font: total("font"), total: total() };
}

export function judge(m, b) {
  const problems = [];
  if (m.js > b.js) problems.push(`JavaScript is ${m.js.toFixed(0)} KB compressed (budget ${b.js} KB). Split the code, load heavy parts on demand, or drop unused libraries.`);
  if (m.css > b.css) problems.push(`CSS is ${m.css.toFixed(0)} KB compressed (budget ${b.css} KB). Remove unused styles.`);
  if (m.total > b.total) problems.push(`Everything the build produced is ${m.total.toFixed(0)} KB (budget ${b.total} KB).`);
  for (const f of m.files.filter((x) => x.kind === "image" && x.kb > b.image)) problems.push(`Image ${f.file} is ${f.kb.toFixed(0)} KB (budget ${b.image} KB each). Resize or compress it (WebP or AVIF).`);
  return problems;
}

if (process.argv[1] && basename(process.argv[1]) === "perf-budget.mjs") {
  const arg = (n, d) => {
    const i = process.argv.indexOf(n);
    return i >= 0 ? process.argv[i + 1] : d;
  };
  const dir = arg("--dir");
  if (!dir) {
    console.error("usage: perf-budget.mjs --dir <build folder> [--max-js-kb N] [--max-css-kb N] [--max-image-kb N] [--max-total-kb N]");
    process.exit(64);
  }
  const budget = { js: Number(arg("--max-js-kb", 300)), css: Number(arg("--max-css-kb", 100)), image: Number(arg("--max-image-kb", 500)), total: Number(arg("--max-total-kb", 2000)) };
  let m;
  try {
    m = measure(resolve(dir));
  } catch (e) {
    console.log(`Could not read ${dir}: ${e.code ?? e.message}. Build the project first.`);
    process.exit(1);
  }
  if (!m.files.length) {
    console.log(`No JavaScript, CSS, image or font files found in ${dir}. Is that the build folder?`);
    process.exit(1);
  }
  console.log(`Speed budget for ${dir}: JS ${m.js.toFixed(0)} KB, CSS ${m.css.toFixed(0)} KB, images ${m.image.toFixed(0)} KB, fonts ${m.font.toFixed(0)} KB, total ${m.total.toFixed(0)} KB (compressed).`);
  console.log("Biggest files: " + [...m.files].sort((a, b) => b.kb - a.kb).slice(0, 5).map((f) => `${f.file} ${f.kb.toFixed(0)} KB`).join("; "));
  const problems = judge(m, budget);
  if (problems.length) {
    console.log("OVER BUDGET:\n- " + problems.join("\n- "));
    process.exitCode = 1;
  } else console.log("Within budget.");
}
