// Stack recipes ("golden paths"): a few tested starting points, one per common kind of app, so a new project doesn't
// re-decide and re-wire its stack, tests and hosting every time. Each recipe in ../presets/<id>.json is DATA: the official
// setup tools at pinned versions, the extra packages at exact versions, the follow-up commands, the project's commands, the
// host, the accounts and settings the owner will need, and short notes on the stack's known mistakes (the things a model
// trained on an older version gets wrong). The kit's release tests run every recipe for real (KIT_PRESET_SCAFFOLD=1).
// This script never runs a recipe's commands itself: it prints them, so the builder runs them through the kit's guards.
//
// Setup runs in a fresh empty folder outside the project (official setup tools refuse, or silently pick another folder,
// when the target already holds files), and --merge then copies the result in without touching the project's own files.
//
// Run: node presets.mjs --list
//      node presets.mjs --match --project <dir>           (uses the scale profile's kind and busiest-moment users)
//      node presets.mjs --show <id>
//      node presets.mjs --setup-dir                         (prints a fresh empty folder to run the setup commands in)
//      node presets.mjs --merge <setup-dir>/app --project <dir> [--preset <id>]
//      node presets.mjs --fill-env <id> --project <dir>     (.env from .env.example; empty *SECRET values get random ones)
//      node presets.mjs --write <id> --project <dir>        (writes .claude/rules/stack.md: known mistakes + where the docs are)
//      node presets.mjs --versions [<id>]                   (network: releases newer than the pinned ones on npm)
//      node presets.mjs                                     (checks every recipe is complete)
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const DIR = fileURLToPath(new URL("../presets/", import.meta.url));
const SCRIPTS = fileURLToPath(new URL(".", import.meta.url));
const EXACT = /^\d+\.\d+\.\d+$/;
const KINDS = ["web", "saas", "api", "desktop", "cli", "mobile", "library", "game"];
const COMMANDS = ["install", "dev", "test"];
// Never copied from a setup folder: version control, installed packages and build output.
const NEVER_COPY = new Set([".git", "node_modules", "out", "dist", "build", ".vite", ".svelte-kit", ".astro", "test-results"]);

export function loadPresets(dir = DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
}

// The pinned `tool@x.y.z` a setup command calls, or null.
export function toolOf(command) {
  const m = command.match(/^(?:npx --yes|npm create)\s+((?:@[^/\s]+\/)?[^@\s]+)@(\S+)/);
  if (!m) return null;
  const name = command.startsWith("npm create") ? `create-${m[1]}` : m[1];
  return { name, version: m[2] };
}

// Every rule a recipe must meet. Returns a list of problems (empty = good).
export function validate(p) {
  const out = [];
  const need = (cond, msg) => cond || out.push(`${p.id ?? "?"}: ${msg}`);
  need(/^[a-z][a-z0-9-]*$/.test(p.id ?? ""), "id must be lower-case words with dashes");
  need(typeof p.title === "string" && p.title.length > 3, "needs a title");
  need(Array.isArray(p.kinds) && p.kinds.length && p.kinds.every((k) => KINDS.includes(k)), `kinds must come from ${KINDS.join(", ")}`);
  need(typeof p.fits === "string" && p.fits.length > 10, "needs 'fits' (when to use it)");
  need(Array.isArray(p.notFor) && p.notFor.length > 0, "needs 'notFor' (when not to use it)");
  need(Number.isInteger(p.maxUsersPeak) && p.maxUsersPeak > 0, "needs maxUsersPeak (busiest-moment users it was designed for)");
  need(Array.isArray(p.stack) && p.stack.length && p.stack.every((s) => s.part && s.choice && s.why), "stack lines need part, choice and why");
  need(Array.isArray(p.scaffold) && p.scaffold.length > 0, "needs setup commands");
  for (const c of p.scaffold ?? []) {
    need(!/@(latest|next|canary|beta)\b/.test(c), `setup command uses a moving tag: ${c}`);
    const t = toolOf(c);
    need(t && EXACT.test(t.version), `setup command must call an official tool at an exact version (npx --yes <tool>@x.y.z or npm create <name>@x.y.z): ${c}`);
    if (t) need(p.tools?.[t.name] === t.version, `tools must list ${t.name} at ${t.version}`);
    need(/\sapp(\s|$)/.test(c), `setup command must create the folder "app" (it runs in an empty setup folder): ${c}`);
  }
  for (const [name, v] of Object.entries(p.tools ?? {})) need(EXACT.test(v), `tool ${name} must be an exact version, not ${v}`);
  for (const group of ["dependencies", "devDependencies"]) {
    for (const [name, v] of Object.entries(p.add?.[group] ?? {})) need(EXACT.test(v), `${name} must be an exact version, not ${v}`);
  }
  for (const a of p.after ?? []) need(typeof a.run === "string" || typeof a.do === "string", "each 'after' step is { run } or { do }");
  for (const a of p.after ?? []) if (a.run) need(!/@(latest|next)\b/.test(a.run), `after step uses a moving tag: ${a.run}`);
  need(Array.isArray(p.verify) && p.verify.length > 0, "needs 'verify' (commands that pass on a fresh setup)");
  for (const k of COMMANDS) need(typeof p.commands?.[k] === "string" && p.commands[k].length > 0, `commands.${k} missing`);
  need(typeof p.host?.name === "string" && typeof p.host?.deploy === "string", "host needs name and deploy");
  need(Array.isArray(p.accounts) && p.accounts.length > 0 && p.accounts.every((a) => a.name && a.why && a.when), "accounts need name, why and when");
  need(Array.isArray(p.settings) && p.settings.every((s) => s.name && s.why), "settings need name and why");
  need(Array.isArray(p.notes) && p.notes.length >= 3 && p.notes.length <= 15, "needs 3 to 15 notes");
  need(Array.isArray(p.docs) && p.docs.length > 0 && p.docs.every((d) => d.name && /^https:\/\//.test(d.url ?? "") && d.local), "docs need name, https url and local path");
  need(typeof p.tested === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.tested), "needs 'tested' (date the full setup last passed)");
  return out;
}

export function packagesOf(p) {
  return { ...(p.add?.dependencies ?? {}), ...(p.add?.devDependencies ?? {}) };
}

// The install commands for the extra packages, exact versions.
export function addCommands(p) {
  const out = [];
  const dep = Object.entries(p.add?.dependencies ?? {});
  const dev = Object.entries(p.add?.devDependencies ?? {});
  if (dep.length) out.push(`npm install --save-exact ${dep.map(([n, v]) => `${n}@${v}`).join(" ")}`);
  if (dev.length) out.push(`npm install -D --save-exact ${dev.map(([n, v]) => `${n}@${v}`).join(" ")}`);
  return out;
}

const kitPath = (s) => s.replaceAll("{kit}", SCRIPTS.replaceAll("\\", "/").replace(/\/$/, ""));

// Recipes that fit a scale profile. Returns [{ preset, fit, reason }], fitting ones first.
export function match(profile, presets = loadPresets()) {
  const kind = profile?.kind;
  const peak = Number(profile?.usersPeak ?? 0);
  return presets
    .map((p) => {
      if (!p.kinds.includes(kind)) return { preset: p, fit: false, reason: `made for ${p.kinds.join("/")}, not ${kind}` };
      if (peak > p.maxUsersPeak) return { preset: p, fit: false, reason: `designed for up to ${p.maxUsersPeak} at the busiest moment; the plan says ${peak}` };
      return { preset: p, fit: true, reason: p.fits };
    })
    .sort((a, b) => Number(b.fit) - Number(a.fit));
}

export function show(p) {
  const L = [`${p.title} (${p.id}), last tested ${p.tested}`, `Fits: ${p.fits}`, `Not for: ${p.notFor.join("; ")}`, "", "Built with:"];
  for (const s of p.stack) L.push(`- ${s.part}: ${s.choice}. ${s.why}`);
  L.push("", "Setup, step by step (run each exactly as written; never swap in a newer or moving version):");
  let n = 1;
  L.push(`${n++}. In a fresh empty folder (node "${kitPath("{kit}")}/presets.mjs" --setup-dir prints one), run:`);
  for (const c of p.scaffold) L.push(`     ${c}`);
  L.push(`${n++}. Copy the result into the project: node "${kitPath("{kit}")}/presets.mjs" --merge <that folder>/app --project . --preset ${p.id}`);
  L.push(`${n++}. In the project: npm install`);
  for (const c of addCommands(p)) L.push(`${n++}. ${c}`);
  for (const a of p.after ?? []) L.push(`${n++}. ${a.run ? kitPath(a.run) : a.do}`);
  L.push(`${n++}. Check it works: ${p.verify.join(", then ")}`);
  L.push("", "Commands for CLAUDE.md:");
  for (const [k, v] of Object.entries(p.commands)) L.push(`- ${k}: ${v}`);
  L.push("", `Host: ${p.host.name}. ${p.host.deploy}${p.host.preview ? ` Preview copies: ${p.host.preview}` : ""}`);
  L.push("", "Accounts the owner will need:");
  for (const a of p.accounts) L.push(`- ${a.name} (${a.when}): ${a.why}`);
  if (p.settings.length) {
    L.push("", "Settings (environment variables, names only in .env.example):");
    for (const s of p.settings) L.push(`- ${s.name}: ${s.why}`);
  }
  L.push("", "Known mistakes (written to .claude/rules/stack.md by --write):");
  for (const x of p.notes) L.push(`- ${x}`);
  return L.join("\n");
}

// A fresh empty folder outside every project, for the official setup tools.
export function setupDir() {
  return mkdtempSync(join(tmpdir(), "kit-setup-"));
}

// Copy a setup result into the project. Never overwrites: a file the project already has is kept (".gitignore" gets the
// missing lines appended). Returns { copied, kept, merged }.
export function merge(from, project, skip = []) {
  const res = { copied: [], kept: [], merged: [] };
  const skipSet = new Set(skip.map((s) => s.replaceAll("\\", "/").replace(/\/$/, "")));
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const src = join(dir, name);
      const rel = relative(from, src).split(sep).join("/");
      if (NEVER_COPY.has(name) || skipSet.has(rel)) continue;
      const dst = join(project, rel);
      if (statSync(src).isDirectory()) {
        mkdirSync(dst, { recursive: true });
        walk(src);
      } else if (!existsSync(dst)) {
        copyFileSync(src, dst);
        res.copied.push(rel);
      } else if (name === ".gitignore") {
        const have = new Set(readFileSync(dst, "utf8").split(/\r?\n/).map((l) => l.trim()));
        const add = readFileSync(src, "utf8").split(/\r?\n/).filter((l) => l.trim() && !have.has(l.trim()));
        if (add.length) {
          const cur = readFileSync(dst, "utf8");
          writeFileSync(dst, `${cur}${cur.endsWith("\n") || !cur ? "" : "\n"}${add.join("\n")}\n`);
        }
        res.merged.push(rel);
      } else res.kept.push(rel);
    }
  };
  walk(from);
  return res;
}

// .env from .env.example (if missing), then fill empty values: the recipe's local defaults, and a random value for any
// name ending in SECRET. Values are never printed.
export function fillEnv(p, project) {
  const file = join(project, ".env");
  const example = join(project, ".env.example");
  if (!existsSync(file)) {
    if (!existsSync(example)) return { file, filled: [] };
    copyFileSync(example, file);
  }
  const filled = [];
  const text = readFileSync(file, "utf8").replace(/^([A-Z][A-Z0-9_]*)=(""|''|)\s*$/gm, (line, name) => {
    const v = p.envDefaults?.[name] ?? (/SECRET$/.test(name) ? randomBytes(32).toString("base64url") : null);
    if (v == null) return line;
    filled.push(name);
    return `${name}="${v}"`;
  });
  writeFileSync(file, text);
  return { file, filled };
}

// The project's stack notes, which Claude Code reads from .claude/rules/ in every session.
export function rulesMd(p) {
  return [
    `# Stack notes: ${p.title}`,
    `From the starter kit's \`${p.id}\` recipe (tested ${p.tested}). The lockfile pins the exact versions; it wins over these notes.`,
    "",
    "## Before using an API you are not sure of",
    "Look it up, in this order: the installed package (types, README, CHANGELOG, docs folder: it matches the pinned version exactly",
    "and costs nothing), a docs tool if one is installed, then the official docs for the version in the lockfile. Never from memory.",
    "",
    "| Part | Installed copy | Official docs |",
    "|---|---|---|",
    ...p.docs.map((d) => `| ${d.name} | \`${d.local}\` | ${d.url} |`),
    "",
    "## Known mistakes in this stack",
    ...p.notes.map((n) => `- ${n}`),
    "",
  ].join("\n");
}

export function writeRules(p, project) {
  const dir = join(project, ".claude", "rules");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "stack.md");
  writeFileSync(file, rulesMd(p));
  return file;
}

// Network: compare pinned versions with the newest on npm. Returns [{ name, pinned, latest, level }].
export async function versions(p, fetcher = fetch) {
  const out = [];
  for (const [name, pinned] of Object.entries({ ...(p.tools ?? {}), ...packagesOf(p) })) {
    let latest = null;
    try {
      const r = await fetcher(`https://registry.npmjs.org/${name.replace("/", "%2F")}/latest`);
      if (r.ok) latest = (await r.json()).version;
    } catch {}
    const [a, b] = [pinned, latest ?? pinned].map((v) => v.split(".").map(Number));
    const level = !latest ? "UNKNOWN" : a[0] !== b[0] ? "NEW MAJOR" : a[1] !== b[1] || a[2] !== b[2] ? "newer" : "current";
    out.push({ name, pinned, latest, level });
  }
  return out;
}

function readProfile(project) {
  const f = join(project, ".claude", "scale.json");
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  const val = (flag) => (a.includes(flag) ? a[a.indexOf(flag) + 1] : undefined);
  const project = resolve(val("--project") ?? ".");
  const presets = loadPresets();
  const byId = (id) => {
    const p = presets.find((x) => x.id === id);
    if (!p) {
      console.log(`No recipe called "${id}". Known: ${presets.map((x) => x.id).join(", ")}`);
      process.exit(1);
    }
    return p;
  };
  if (a.includes("--list")) {
    for (const p of presets) console.log(`${p.id}: ${p.title} (${p.kinds.join("/")}, up to ${p.maxUsersPeak} at once). ${p.fits}`);
  } else if (a.includes("--match")) {
    const profile = readProfile(project);
    if (!profile) {
      console.log("No scale profile yet: set it first (scale-profile.mjs --set kind=... usersPeak=...).");
      process.exit(1);
    }
    const m = match(profile, presets);
    const fits = m.filter((x) => x.fit);
    for (const x of m) console.log(`${x.fit ? "FITS" : "no  "} ${x.preset.id}: ${x.reason}`);
    console.log(fits.length
      ? `Recommend ${fits[0].preset.id} unless the plan needs something it lists under "Not for" (--show ${fits[0].preset.id}).`
      : `NO RECIPE fits a ${profile.kind} app at ${profile.usersPeak ?? "?"} people at once: choose the stack freely.`);
  } else if (val("--show")) {
    console.log(show(byId(val("--show"))));
  } else if (a.includes("--setup-dir")) {
    console.log(setupDir());
  } else if (val("--merge")) {
    const skip = val("--preset") ? byId(val("--preset")).skip ?? [] : [];
    const r = merge(resolve(val("--merge")), project, skip);
    console.log(`Copied ${r.copied.length} files.${r.merged.length ? ` Added missing lines to ${r.merged.join(", ")}.` : ""}${r.kept.length ? ` Kept the project's own: ${r.kept.join(", ")}.` : ""}`);
  } else if (val("--fill-env")) {
    const r = fillEnv(byId(val("--fill-env")), project);
    console.log(r.filled.length ? `Filled ${r.filled.join(", ")} in .env (values not shown; .env is never committed).` : "Nothing to fill in .env.");
  } else if (val("--write")) {
    console.log(`Wrote ${writeRules(byId(val("--write")), project)}`);
  } else if (a.includes("--versions")) {
    const id = val("--versions");
    for (const p of id && !id.startsWith("--") ? [byId(id)] : presets) {
      for (const r of await versions(p)) if (r.level !== "current") console.log(`${p.id}: ${r.name} pinned ${r.pinned}, newest ${r.latest ?? "?"} (${r.level})`);
    }
    console.log("Version check done. Lines above are pins with newer releases; moving one means running the full setup test again.");
  } else {
    const problems = presets.flatMap(validate);
    console.log(problems.length ? problems.join("\n") : `${presets.length} recipes, all complete.`);
    process.exit(problems.length ? 1 : 0);
  }
}
