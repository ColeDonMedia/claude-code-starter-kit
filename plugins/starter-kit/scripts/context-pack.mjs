// Builds a SHORT brief for one feature from the project's own records, so a builder in a big, long-running project starts with
// exactly the context that matters and not the whole history: the roadmap item and its criteria, the latest decisions, the
// parts of the architecture map that relate to the feature, and the design brief. Capped in size on purpose.
// Run: node context-pack.mjs --project <dir> --feature "<text>" [--max 3500]. Reads files only; prints the brief.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dependents, findSymbol, loadIndex } from "./code-index.mjs";

const STOP = new Set("the a an and or to of for in on with is are be it its that this user users can add make new page screen".split(" "));
const words = (s) => [...new Set((s.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? []).filter((w) => !STOP.has(w)))];
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8").replace(/\r/g, "") : "");

function section(text, name) {
  const m = new RegExp(`^##+\\s+(?:${name})[^\\n]*\\n([\\s\\S]*?)(?=^##+\\s|(?![\\s\\S]))`, "im").exec(text);
  return m ? m[1].trim() : "";
}

export function lastDecisions(root, n = 5) {
  let lines = read(join(root, "DECISIONS.md")).split("\n").filter((l) => /^[-*] /.test(l));
  if (!lines.length) lines = section(read(join(root, "PROJECT.md")), "Decisions").split("\n").filter((l) => /^[-*] /.test(l));
  return lines.slice(-n).map((l) => l.slice(0, 220));
}

export function buildPack(root, feature, max = 3500) {
  const kw = words(feature);
  const out = [];
  const roadmap = read(join(root, "ROADMAP.md")).split("\n");
  const at = roadmap.findIndex((l) => /^[-*] \[[ xX]\] /.test(l) && kw.length && words(l).filter((w) => kw.includes(w)).length >= Math.min(2, kw.length));
  if (at >= 0) {
    const block = [roadmap[at]];
    for (let i = at + 1; i < roadmap.length && /^\s+/.test(roadmap[i]) && roadmap[i].trim(); i++) block.push(roadmap[i]);
    out.push("ROADMAP ITEM\n" + block.join("\n"));
  }
  const decisions = lastDecisions(root);
  if (decisions.length) out.push("RECENT DECISIONS (do not contradict without saying so)\n" + decisions.join("\n"));
  const map = (section(read(join(root, "PROJECT.md")), "Architecture|Map") || "").split("\n").filter((l) => l.trim());
  const rel = map.filter((l) => words(l).some((w) => kw.includes(w))).slice(0, 8);
  if (rel.length) out.push("RELATED PARTS OF THE CODE (from PROJECT.md)\n" + rel.join("\n"));
  // With a code index (big codebases), name the files that define things the feature talks about, and how many files
  // depend on each, so the builder starts in the right place and knows what it could break.
  const index = loadIndex(root);
  if (index) {
    const hits = new Map();
    for (const w of kw.filter((x) => x.length >= 4)) for (const h of findSymbol(index, w, 10)) if (!hits.has(h.file)) hits.set(h.file, h);
    if (hits.size) {
      const rev = dependents(index);
      out.push("FILES THAT DEFINE RELATED CODE (code index; check the dependents before changing them)\n" + [...hits.values()].slice(0, 10).map((h) => `${h.file}:${h.line} ${h.kind} ${h.name} (${rev.get(h.file)?.size ?? 0} dependents)`).join("\n"));
    }
  }
  const design = read(join(root, "DESIGN.md")).split("\n").slice(0, 30).join("\n").trim();
  if (design && /screen|page|ui|form|button|dashboard|view|layout|style/i.test(feature)) out.push("DESIGN.md (follow it)\n" + design);
  if (!out.length) out.push("No records matched this feature. Read CLAUDE.md and PROJECT.md before starting.");
  let text = out.join("\n\n");
  if (text.length > max) text = text.slice(0, max - 40).trimEnd() + "\n[cut: ask for more if needed]";
  return text;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  const get = (f) => (a.includes(f) ? a[a.indexOf(f) + 1] : undefined);
  console.log(buildPack(resolve(get("--project") ?? "."), get("--feature") ?? "", Number(get("--max")) || 3500));
}
