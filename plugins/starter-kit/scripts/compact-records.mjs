// Keeps the project's records small enough to be read every session, without losing anything: older decisions and older
// changelog entries move, word for word, into DECISIONS-ARCHIVE.md and CHANGELOG-ARCHIVE.md, and a pointer line says where.
// HANDOFF.md and PROJECT.md are not cut mechanically (that needs judgement); it reports when they need rewriting shorter.
// Run: node compact-records.mjs --project <dir> [--keep-decisions 40] [--keep-releases 15]. Running it twice changes nothing.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LIMITS } from "./drift-check.mjs";

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8").replace(/\r/g, "") : null);
const POINTER_D = "Older decisions: see DECISIONS-ARCHIVE.md (moved there word for word).";
const POINTER_C = "Older releases: see CHANGELOG-ARCHIVE.md (moved there word for word).";

export function compact(root, { keepDecisions = 40, keepReleases = 15 } = {}) {
  const did = [];
  const todo = [];

  const dPath = join(root, "DECISIONS.md");
  const d = read(dPath);
  if (d !== null) {
    const lines = d.split("\n");
    const idx = lines.map((l, i) => (/^[-*] /.test(l) ? i : -1)).filter((i) => i >= 0);
    if (idx.length > keepDecisions) {
      const move = idx.slice(0, idx.length - keepDecisions);
      const moved = move.map((i) => lines[i]);
      const aPath = join(root, "DECISIONS-ARCHIVE.md");
      const old = read(aPath) ?? "# Decisions archive\n\nOlder decisions, oldest first. Still true unless a newer decision replaces them.\n";
      writeFileSync(aPath, old.replace(/\n*$/, "\n") + moved.join("\n") + "\n");
      const drop = new Set(move);
      let kept = lines.filter((_, i) => !drop.has(i));
      if (!kept.includes(POINTER_D)) {
        const first = kept.findIndex((l) => /^[-*] /.test(l));
        kept.splice(first, 0, POINTER_D, "");
      }
      writeFileSync(dPath, kept.join("\n"));
      did.push(`moved ${moved.length} older decision(s) to DECISIONS-ARCHIVE.md`);
    }
  }

  const cPath = join(root, "CHANGELOG.md");
  const raw = read(cPath);
  const c = raw === null ? null : raw.split("\n").filter((l) => l !== POINTER_C).join("\n");
  if (c !== null) {
    const parts = c.split(/(?=^## )/m);
    const head = parts[0].startsWith("## ") ? "" : parts.shift();
    const releases = parts.filter((p) => !p.startsWith(POINTER_C));
    if (releases.length > keepReleases) {
      const keep = releases.slice(0, keepReleases);
      const move = releases.slice(keepReleases);
      const aPath = join(root, "CHANGELOG-ARCHIVE.md");
      const old = read(aPath) ?? "# Changelog archive\n\nOlder releases, newest first.\n\n";
      const [aHead, ...aRest] = old.split(/(?=^## )/m);
      writeFileSync(aPath, aHead.replace(/\n*$/, "\n\n") + move.map((p) => p.replace(/\n*$/, "\n\n")).join("") + aRest.join(""));
      const body = keep.map((p) => p.replace(/\n*$/, "\n\n")).join("");
      writeFileSync(cPath, head.replace(/\n*$/, "\n\n") + body + POINTER_C + "\n");
      did.push(`moved ${move.length} older release(s) to CHANGELOG-ARCHIVE.md`);
    }
  }

  for (const f of ["HANDOFF.md", "PROJECT.md"]) {
    const t = read(join(root, f));
    if (t && t.split("\n").length > LIMITS[f]) todo.push(`${f} is ${t.split("\n").length} lines (limit ${LIMITS[f]}): rewrite it shorter; move detail into the files it points to`);
  }
  return { did, todo };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  const get = (f, d) => (a.includes(f) ? a[a.indexOf(f) + 1] : d);
  const r = compact(resolve(get("--project", ".")), { keepDecisions: Number(get("--keep-decisions", 40)), keepReleases: Number(get("--keep-releases", 15)) });
  console.log([...r.did, ...r.todo].map((x) => `- ${x}`).join("\n") || "Nothing to compact.");
}
