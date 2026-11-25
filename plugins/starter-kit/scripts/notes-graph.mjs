// Linked notes: the project's records (decisions, roadmap, areas, schema, docs) point at each other by stable IDs, so a change in
// one place shows what else depends on it, and a reversed decision cannot quietly stay behind in the plan.
//   A thing gets an ID where it is written:   - 2026-01-01 — use SQLite {#D-001}, because simple; status: active
//   Other notes point at it:                  see [[D-001]]       (Obsidian-style wikilinks)
// ID prefixes: D decision, F feature, M milestone, A area, T table (SCHEMA.md writes the T- ones itself).
// A decision's status is written on its line: `status: superseded by [[D-020]]`, `status: reversed`, or nothing (active).
// Checks: duplicate IDs, links to IDs that don't exist, a "superseded by" that doesn't point at a live decision, and notes that
// still rely on a superseded or reversed decision. Plain markdown throughout: --export makes a folder Obsidian can open (a note per
// ID with backlinks, so its graph view works), without Obsidian being needed for anything else.
// Run: node notes-graph.mjs --project <dir> [--check | --backlinks ID | --next-id D | --list [PREFIX] | --export <dir>]
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ID = "[A-Z]{1,3}-[A-Za-z0-9_.-]+";
const ANCHOR = new RegExp(`\\{#(${ID})\\}`, "g");
const LINK = new RegExp(`\\[\\[(${ID})(?:\\|[^\\]]*)?\\]\\]`, "g");
const STATUS = new RegExp(`status:\\s*(superseded by \\[\\[(${ID})\\]\\]|reversed|active)`, "i");
const SKIP = new Set(["node_modules", ".git", "vendor", "dist", "build", ".venv", "venv", "target", ".next", "coverage"]);
// History and logs may mention old decisions without relying on them.
const HISTORY = /^(CHANGELOG|CHANGELOG-ARCHIVE|DOGFOOD|KIT-FEEDBACK)\.md$/i;

export function noteFiles(root) {
  const out = [];
  const walk = (d, depth) => {
    for (const e of readdirSync(join(root, d), { withFileTypes: true })) {
      const p = d ? `${d}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!SKIP.has(e.name) && !e.name.startsWith(".") && depth < 4) walk(p, depth + 1);
      } else if (/\.md$/i.test(e.name) && !HISTORY.test(e.name)) out.push(p);
    }
  };
  walk("", 0);
  return out;
}

export function buildGraph(root) {
  const defs = new Map();
  const links = [];
  const problems = [];
  for (const file of noteFiles(root)) {
    const lines = readFileSync(join(root, file), "utf8").replace(/\r/g, "").split("\n");
    let fence = false;
    let lastAnchor = null; // { id, line }
    lines.forEach((text, i) => {
      if (/^\s*(```|~~~)/.test(text)) fence = !fence;
      if (fence) return;
      if (/^#{1,6}\s/.test(text)) lastAnchor = null;
      const anchors = [...text.matchAll(ANCHOR)].map((m) => m[1]);
      for (const id of anchors) {
        const clean = text.replace(ANCHOR, "").replace(/^\s*[-*]\s*(\[[ xX]\]\s*)?/, "").replace(/^#+\s*/, "").replace(/\s+/g, " ").trim();
        const st = STATUS.exec(text);
        const status = !st ? "active" : /^superseded/i.test(st[1]) ? "superseded" : st[1].toLowerCase();
        const def = { id, file, line: i + 1, text: clean, status, supersededBy: st?.[2] ?? null };
        if (defs.has(id)) problems.push({ kind: "duplicate", msg: `${id} is defined twice (${defs.get(id).file}:${defs.get(id).line} and ${file}:${i + 1})` });
        else defs.set(id, def);
        lastAnchor = { id, line: i };
      }
      const owner = anchors[0] ?? (lastAnchor && i - lastAnchor.line <= 12 ? lastAnchor.id : null);
      for (const m of text.matchAll(LINK)) links.push({ from: owner, file, line: i + 1, to: m[1], sameLine: anchors.length > 0, text });
    });
  }
  for (const l of links) if (!defs.has(l.to)) problems.push({ kind: "broken", msg: `${l.file}:${l.line} links to [[${l.to}]], which is not defined anywhere` });
  for (const d of defs.values()) {
    if (d.status === "superseded") {
      const t = d.supersededBy && defs.get(d.supersededBy);
      if (!t) problems.push({ kind: "chain", msg: `${d.id} says superseded by [[${d.supersededBy}]], which does not exist` });
      else if (t.status !== "active") problems.push({ kind: "chain", msg: `${d.id} is superseded by ${t.id}, which is itself ${t.status}; point it at the decision that really stands` });
    }
  }
  // Reliance on a decision that no longer stands: from a note, or from a live decision. A superseded decision pointing at its
  // own replacement or at older context is fine.
  for (const l of links) {
    const target = defs.get(l.to);
    if (!target || target.status === "active") continue;
    const from = l.from && defs.get(l.from);
    if (from && from.status !== "active") continue;
    if (l.sameLine && l.from === l.to) continue;
    if (target.supersededBy && target.supersededBy === l.from) continue; // the replacement may point back at what it replaces
    const now = target.status === "superseded" ? `superseded by [[${target.supersededBy}]]` : "reversed";
    problems.push({ kind: "stale", msg: `${l.file}:${l.line} relies on [[${l.to}]], which is ${now}; update it to follow the decision that stands` });
  }
  return { defs, links, problems };
}

export function backlinks(graph, id) {
  return graph.links.filter((l) => l.to === id).map((l) => ({ from: l.from, file: l.file, line: l.line }));
}

export function nextId(graph, prefix) {
  let max = 0;
  for (const id of graph.defs.keys()) {
    const m = new RegExp(`^${prefix}-(\\d+)$`).exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

export function exportVault(root, dir) {
  const g = buildGraph(root);
  mkdirSync(dir, { recursive: true });
  const ref = (l) => (l.from ? `[[${l.from}]]` : `${l.file}:${l.line}`);
  for (const d of g.defs.values()) {
    const out = g.links.filter((l) => l.from === d.id && l.to !== d.id);
    const inn = backlinks(g, d.id);
    const body = [
      `# ${d.id}`,
      "",
      d.text,
      "",
      `Status: ${d.status}${d.supersededBy ? ` by [[${d.supersededBy}]]` : ""}`,
      `Source: ${d.file}:${d.line}`,
      "",
      "## Links to",
      ...(out.length ? [...new Set(out.map((l) => `- [[${l.to}]]`))] : ["- none"]),
      "",
      "## Linked from",
      ...(inn.length ? [...new Set(inn.map((l) => `- ${ref(l)}`))] : ["- none"]),
      "",
    ];
    writeFileSync(join(dir, `${d.id}.md`), body.join("\n"));
  }
  return { notes: g.defs.size, problems: g.problems.length };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  const get = (f) => (a.includes(f) ? a[a.indexOf(f) + 1] : undefined);
  const root = resolve(get("--project") ?? ".");
  const g = buildGraph(root);
  if (get("--next-id")) console.log(nextId(g, get("--next-id")));
  else if (get("--backlinks")) {
    const b = backlinks(g, get("--backlinks"));
    console.log(b.length ? b.map((l) => `${l.from ? l.from + "  " : ""}${l.file}:${l.line}`).join("\n") : "Nothing links to it.");
  } else if (a.includes("--list")) {
    const p = a[a.indexOf("--list") + 1];
    const prefix = p && !p.startsWith("--") ? p : "";
    console.log([...g.defs.values()].filter((d) => d.id.startsWith(prefix)).map((d) => `${d.id.padEnd(14)} ${d.status.padEnd(10)} ${d.text.slice(0, 90)}`).join("\n") || "Nothing defined yet.");
  } else if (get("--export")) {
    const r = exportVault(root, resolve(get("--export")));
    console.log(`Wrote ${r.notes} notes to ${resolve(get("--export"))} (open that folder as a vault in Obsidian).`);
  } else {
    console.log(g.problems.length ? g.problems.map((p) => `- ${p.msg}`).join("\n") : `Notes are consistent (${g.defs.size} defined, ${g.links.length} links).`);
    process.exitCode = g.problems.length ? 1 : 0;
  }
}
