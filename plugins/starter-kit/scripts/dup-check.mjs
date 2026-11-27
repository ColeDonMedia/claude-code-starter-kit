// One source for each number and rule. Two checks that stop the same thing being written twice, which is how one number
// ends up different on six pages:
//  1. Copied code: runs of meaningful lines (whitespace ignored, names of variables replaced so a renamed copy still matches)
//     that appear in more than one place. With --base, only copies that the change ADDED are reported.
//  2. The "## One source" list in PROJECT.md: every shared number or rule ("Monthly income: src/lib/metrics.ts::monthlyIncome
//     — paid invoices this calendar month, refunds subtracted") must point at a file and a name that exist.
// Test files are skipped (tests repeat set-up on purpose). It reads only; it changes nothing.
// Run: node dup-check.mjs --project <dir> [--base <git ref>] [--lines 6] [--list]
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listFiles } from "./code-index.mjs";

const TEST_FILE = /(^|\/)(tests?|__tests__|spec|e2e)\/|[._-](test|spec|e2e)\.[a-z]+$|_test\.(go|py)$|^test_[^/]*\.py$|\/test_[^/]*\.py$/i;
const KEYWORDS = new Set("if else for while do switch case return break continue function const let var class new try catch finally throw await async import export from default this super null undefined true false typeof instanceof in of def elif lambda None True False and or not is pass yield with as self fn pub mut impl struct enum match func go defer package type interface select end then begin unless public private protected static void int string bool".split(" "));
const TRIVIAL = /^[\s{}()[\];,]*$|^(import|from|export \{|export \*|#include|using|package|require\(|\} from|\/\/|#|\*|\/\*|<\/?[a-z-]+>?$)/;

// A line reduced to its shape: no spaces, literals and names replaced, keywords and operators kept.
export function normalize(line) {
  return line
    .trim()
    .replace(/(["'`])(?:\\.|(?!\1).)*\1/g, "S")
    .replace(/\b\d[\d_.]*\b/g, "0")
    .replace(/[A-Za-z_$][\w$]*/g, (w) => (KEYWORDS.has(w) ? w : "x"))
    .replace(/\s+/g, "");
}

// Meaningful lines of a file: [{ n (1-based line), key }]. Blank, comment-only and punctuation-only lines are left out.
export function meaningful(text) {
  const out = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (!t || TRIVIAL.test(t) || t.length < 4) return;
    out.push({ n: i + 1, key: normalize(t), raw: t });
  });
  return out;
}

// All windows of `size` meaningful lines across files, grouped by shape. Returns [{ places: [{ file, from, to }] }] for every
// shape seen in two or more places. A window must carry enough real code (not just "x = x;" lines) to count.
export function findCopies(files, size = 6) {
  const seen = new Map();
  for (const [file, text] of files) {
    const m = meaningful(text);
    for (let i = 0; i + size <= m.length; i++) {
      const w = m.slice(i, i + size);
      const raw = w.map((x) => x.raw).join("");
      if (raw.replace(/\W/g, "").length < 80) continue;
      if (new Set(w.map((x) => x.key)).size < Math.ceil(size / 2)) continue; // repeated one-liners (a list of fields)
      if (w.filter((x) => /[(=+\-*/<>?&|]/.test(x.key.replace(/=>/g, ""))).length < size / 2) continue; // data (lists of text), not logic
      const key = w.map((x) => x.key).join("\n");
      const place = { file, from: w[0].n, to: w[size - 1].n };
      const list = seen.get(key) ?? [];
      if (!list.some((p) => p.file === file && p.from <= place.to && place.from <= p.to)) list.push(place);
      seen.set(key, list);
    }
  }
  const groups = [...seen.values()].filter((l) => l.length > 1);
  // Merge overlapping windows of the same copy into one range per place.
  const merged = [];
  for (const g of groups) {
    const prev = merged.find((m) => m.places.length === g.length && m.places.every((p, i) => p.file === g[i].file && g[i].from <= p.to + 1));
    if (prev) prev.places.forEach((p, i) => (p.to = Math.max(p.to, g[i].to)));
    else merged.push({ places: g.map((p) => ({ ...p })) });
  }
  return merged;
}

// Lines added by the change since `base`: Map(file -> Set(line numbers)).
export function addedLines(project, base) {
  const r = spawnSync("git", ["-C", project, "diff", "--unified=0", "--no-color", base, "--"], { encoding: "utf8", maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`git diff ${base} failed: ${r.stderr.trim()}`);
  const out = new Map();
  let file = null;
  for (const line of r.stdout.split("\n")) {
    const f = line.match(/^\+\+\+ b\/(.+)$/);
    if (f) {
      file = f[1];
      out.set(file, out.get(file) ?? new Set());
      continue;
    }
    const h = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (h && file) for (let i = 0; i < Number(h[2] ?? 1); i++) out.get(file).add(Number(h[1]) + i);
  }
  // New files not yet committed are added in full.
  const u = spawnSync("git", ["-C", project, "ls-files", "--others", "--exclude-standard", "-z"], { encoding: "utf8", maxBuffer: 1 << 28 });
  for (const f of (u.stdout ?? "").split("\0").filter(Boolean)) {
    const n = readFileSync(join(project, f), "utf8").split("\n").length;
    out.set(f, new Set(Array.from({ length: n }, (_, i) => i + 1)));
  }
  return out;
}

// The "## One source" entries of PROJECT.md: [{ what, file, name, line }].
export function readRegistry(project) {
  const f = join(project, "PROJECT.md");
  if (!existsSync(f)) return [];
  const text = readFileSync(f, "utf8");
  const sec = text.match(/^## One source[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  if (!sec) return [];
  return sec[1]
    .split("\n")
    .map((l) => l.match(/^\s*-\s*(.+?):\s*`?([^`\s:]+)::([\w$.]+)`?/))
    .filter(Boolean)
    .map((m) => ({ what: m[1].trim(), file: m[2], name: m[3] }));
}

export function checkRegistry(project, entries = readRegistry(project)) {
  const problems = [];
  for (const e of entries) {
    const f = join(project, e.file);
    if (!existsSync(f)) problems.push(`STALE: "${e.what}" points at ${e.file}, which does not exist.`);
    else if (!new RegExp(`\\b${e.name.split(".").pop().replace(/\$/g, "\\$")}\\b`).test(readFileSync(f, "utf8"))) problems.push(`STALE: "${e.what}" points at ${e.file}::${e.name}, which is not in that file.`);
  }
  return problems;
}

export function run(project, { base, size = 6 } = {}) {
  const files = listFiles(project)
    .filter((f) => !TEST_FILE.test(f))
    .map((f) => [f, readFileSync(join(project, f), "utf8")]);
  let copies = findCopies(files, size);
  if (base) {
    const added = addedLines(project, base);
    const isNew = (p) => [...Array(p.to - p.from + 1).keys()].some((i) => added.get(p.file)?.has(p.from + i));
    copies = copies.filter((c) => c.places.some(isNew)).map((c) => ({ ...c, added: c.places.filter(isNew) }));
  }
  return { copies, registry: readRegistry(project), problems: checkRegistry(project) };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  const val = (flag) => (a.includes(flag) ? a[a.indexOf(flag) + 1] : undefined);
  const project = resolve(val("--project") ?? ".");
  if (a.includes("--list")) {
    const reg = readRegistry(project);
    console.log(reg.length ? reg.map((e) => `- ${e.what}: ${e.file}::${e.name}`).join("\n") : "No \"## One source\" list in PROJECT.md yet.");
    process.exit(0);
  }
  const r = run(project, { base: val("--base"), size: Number(val("--lines") ?? 6) });
  for (const c of r.copies) {
    const where = c.places.map((p) => `${p.file}:${p.from}-${p.to}`).join(" = ");
    console.log(`DUPLICATE: ${where}${c.added ? ` (added: ${c.added.map((p) => p.file).join(", ")})` : ""}`);
  }
  for (const p of r.problems) console.log(p);
  if (!r.copies.length && !r.problems.length) console.log(`No copied code${val("--base") ? " added" : ""}; ${r.registry.length} shared numbers and rules listed, all found.`);
  else console.log("Each DUPLICATE is one thing written twice: move it into one function (and list it under ## One source in PROJECT.md if it is a number or rule), then call it from both places.");
  process.exit(r.copies.length || r.problems.length ? 1 : 0);
}
