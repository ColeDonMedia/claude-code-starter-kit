// What counts as "code" when something is about to be deleted, shared by the safety guard (which must stay passive: this file
// only reads folders, it never writes, starts programs or touches the network) and the snapshot hook.
import { readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

// Folders that are rebuilt by a tool, so deleting them loses nothing.
export const REBUILDABLE = new Set(["node_modules", "dist", "build", "out", ".next", ".nuxt", ".svelte-kit", ".vite", ".astro", ".turbo", ".cache", ".parcel-cache", "coverage", "target", "__pycache__", ".pytest_cache", ".mypy_cache", ".tox", ".venv", "venv", "test-results", "playwright-report", "tmp", "temp", ".gradle", "bin", "obj"]);
export const CODE_EXT = /\.(m?[jt]sx?|c[jt]s|svelte|vue|astro|py|rb|go|rs|java|kts?|scala|php|cs|c|cc|cpp|cxx|h|hpp|swift|dart|sql|html?|css|scss|sass|less|lua|ex|exs|erl|sh|ps1|json|ya?ml|toml|prisma|graphql|md)$/i;

// The code files at a path (a file, or a folder searched up to 8 levels down, skipping rebuildable folders and .git).
// Stops counting at `limit`. Returns [] for a path that doesn't exist.
export function codeFilesAt(abs, limit = 50) {
  const out = [];
  let st;
  try {
    st = statSync(abs);
  } catch {
    return out;
  }
  if (!st.isDirectory()) return CODE_EXT.test(abs) ? [basename(abs)] : out;
  const walk = (dir, rel, depth) => {
    if (depth > 8 || out.length >= limit) return;
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= limit) return;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!REBUILDABLE.has(e.name) && e.name !== ".git") walk(join(dir, e.name), r, depth + 1);
      } else if (CODE_EXT.test(e.name)) out.push(r);
    }
  };
  walk(abs, "", 0);
  return out;
}

// An existing file (not a folder) with a code extension.
export function isCodeFile(abs) {
  try {
    return statSync(abs).isFile() && CODE_EXT.test(abs);
  } catch {
    return false;
  }
}

// A quick look at a shell command: could it destroy work? Used by the snapshot hook to decide when to save a snapshot first
// (saving one too many is harmless; the safety guard decides what to ask). Returns { risky, db, branches, stashes }.
export function riskOf(command) {
  const c = String(command);
  const branches = [...c.matchAll(/\bgit\s+branch\s+(?:-[a-zA-Z]*D[a-zA-Z]*|--delete\s+--force|--force\s+--delete)\s+([\w./-]+)/g)].map((m) => m[1]);
  const stashes = /\bgit\s+stash\s+(drop|clear)\b/.test(c);
  const git = /\bgit\s+(reset\s+[^;&|]*--hard|clean\s+[^;&|]*-[a-zA-Z]*f|checkout\s+(--\s|\.\s*$|\.\s|-f\b|--force)|restore\s+(?![^;&|]*--staged)\S|switch\s+[^;&|]*(-[a-zA-Z]*f\b|--force|--discard-changes)|filter-branch|filter-repo)/.test(c);
  const db = /\b(drop\s+(database|schema|table)|truncate\s+(table\s+)?\w+|delete\s+from\s+\w+(?![\s\S]*\bwhere\b))|migrate\s+reset|db\s+push\b[^;&|]*--force-reset|\bdb:(drop|reset)\b|manage\.py\s+flush|supabase\s+db\s+reset/i.test(c);
  let del = false;
  const rm = /(?:^|[\s;&|(`'"])(?:rm|rmdir|rd|del|erase|remove-item|ri)\s+([^;&|\n]*)/gi;
  for (const m of c.matchAll(rm)) {
    const args = m[1].split(/\s+/).filter(Boolean);
    const targets = args.filter((a) => !a.startsWith("-") && !/^\/[a-z]$/i.test(a)).map((a) => a.replace(/^["']|["']$/g, "").replace(/[\\/]+\*?$/, ""));
    const recursive = args.some((a) => /^-[a-zA-Z]*[rR][a-zA-Z]*$/.test(a) || /^--recursive$|^\/s$|^-recurse$/i.test(a));
    // a folder that isn't rebuildable, or any single code file (unsaved edits in it would be lost)
    if (recursive ? targets.some((t) => !REBUILDABLE.has(basename(t.replace(/\\/g, "/")))) : targets.some((t) => CODE_EXT.test(t))) del = true;
  }
  if (/\bfind\s[^;&|]*-delete\b|\bfind\s[^;&|]*-exec\s+rm\b|\b(rmtree|rmSync|rmdirSync|removeSync|remove_all|unlinkSync)\(/.test(c)) del = true;
  // `> file.js`, Set-Content / Out-File onto a code file: the old contents are replaced
  for (const m of c.matchAll(/(?:^|[^>&\d])1?>\|?\s*["']?([^\s;&|"'<>]+)/g)) if (CODE_EXT.test(m[1]) && !/^\/dev\//.test(m[1])) del = true;
  if (/\b(set-content|out-file|clear-content|sc|clc)\b[^;&|\n]*\.(m?[jt]sx?|svelte|vue|py|rb|go|rs|java|php|cs|sql|html?|css)\b/i.test(c)) del = true;
  // moving something out of the project (an absolute, home, parent or temp destination)
  for (const m of c.matchAll(/(?:^|[\s;&|(])(?:mv|move|move-item|mi)\s+([^;&|\n]*)/gi)) {
    const parts = m[1].split(/\s+/).filter((a) => a && !a.startsWith("-"));
    if (parts.length >= 2 && /^["']?(\/|~|\.\.|[a-z]:|\$env:temp|\$tmpdir|%temp%)/i.test(parts[parts.length - 1])) del = true;
  }
  return { risky: del || git || db || stashes || branches.length > 0, db, branches, stashes };
}
