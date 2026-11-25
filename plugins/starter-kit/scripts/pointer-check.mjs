// Checks a scout's pointers before anyone relies on them. Each `path:start-end` must name a file inside the project, the range
// must lie inside that file, and the quoted line must really be in the range (three lines of slack; spaces and line endings
// evened out). The fast model finds; this script proves. Used by hooks/scout-check.mjs when the scout finishes.
// Run: node pointer-check.mjs --project <dir> [--file <report.txt>]   (or the report on standard input). Exit 1 if any is wrong.
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_POINTERS = 40;
const SLACK = 3;
const QUOTED = new Set(["POINTERS", "TESTS"]); // these lines must carry a quote; PATTERNS TO COPY may not
const SECTIONS = new Set([...QUOTED, "PATTERNS TO COPY"]);
const LOC = /^\s*[-*]\s+`?([^`\s][^`]*?)`?:(\d+)(?:\s*[-–]\s*(\d+))?`?(?=\s|$)(.*)$/;
const norm = (s) => s.replace(/\\"/g, '"').replace(/\s+/g, " ").trim();

// Every pointer line in the sections that hold pointers, with what could be read from it.
export function parseReport(text) {
  const out = [];
  let section = null;
  for (const raw of String(text ?? "").replace(/\r/g, "").split("\n")) {
    const head = /^\s*#*\s*\**\s*([A-Z][A-Z ]*[A-Z])\s*\**\s*:?\s*$/.exec(raw);
    if (head) {
      section = SECTIONS.has(head[1]) ? head[1] : null;
      continue;
    }
    if (/^\s*CONFIDENCE\s*:/i.test(raw)) section = null;
    if (!section || !/^\s*[-*]\s+\S/.test(raw) || /^\s*[-*]\s+none\.?\s*$/i.test(raw)) continue;
    const m = LOC.exec(raw);
    const p = { section, line: raw.trim() };
    if (m) {
      const start = Number(m[2]);
      Object.assign(p, { path: m[1].replace(/\\/g, "/"), start, end: m[3] ? Number(m[3]) : start });
      const q = /\s[—–-]{1,2}\s*"(.*)"\s*$/.exec(m[4]);
      if (q) p.quote = q[1];
    }
    out.push(p);
  }
  return out;
}

// Why a pointer is wrong, or null when it holds.
export function checkPointer(root, p) {
  if (!p.path) return "not in the form path:start-end";
  if (isAbsolute(p.path) || /^[a-z]:/i.test(p.path) || p.path.split("/").includes("..")) return "the path is outside the project";
  const full = resolve(root, p.path);
  const rel = relative(resolve(root), full);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return "the path is outside the project";
  if (!existsSync(full) || !statSync(full).isFile()) return "no such file";
  const lines = readFileSync(full, "utf8").split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  if (p.start < 1 || p.end < p.start || p.end > lines.length) return `lines ${p.start}-${p.end} are outside the file (it has ${lines.length})`;
  if (p.quote === undefined) return QUOTED.has(p.section) ? "no quoted line" : null;
  const q = norm(p.quote);
  if (q.length < 6) return "the quoted text is too short to check";
  const from = Math.max(1, p.start - SLACK);
  const to = Math.min(lines.length, p.end + SLACK);
  for (let i = from; i <= to; i++) if (norm(lines[i - 1]).includes(q)) return null;
  return `the quoted line is not in lines ${p.start}-${p.end}`;
}

export function checkReport(root, text) {
  const pointers = parseReport(text);
  const ok = [];
  const bad = [];
  for (const p of pointers) {
    const why = checkPointer(root, p);
    if (why) bad.push({ line: p.line, why });
    else ok.push(p);
  }
  if (pointers.length > MAX_POINTERS) bad.push({ line: `${pointers.length} pointers`, why: `more than ${MAX_POINTERS}: keep the ones that matter most` });
  return { ok, bad };
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === resolve(fileURLToPath(import.meta.url)).toLowerCase()) {
  const a = process.argv.slice(2);
  const get = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : undefined);
  let text = "";
  if (get("--file")) text = readFileSync(get("--file"), "utf8");
  else for await (const chunk of process.stdin) text += chunk;
  const r = checkReport(resolve(get("--project") ?? "."), text);
  console.log(`POINTERS CHECKED: ${r.ok.length} good, ${r.bad.length} wrong`);
  for (const b of r.bad) console.log(`- ${b.line} → ${b.why}`);
  process.exitCode = r.bad.length ? 1 : 0;
}
