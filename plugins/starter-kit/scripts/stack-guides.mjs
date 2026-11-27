// Per-stack guidelines: the most important do's and don'ts for the frameworks a project actually uses (Laravel, Next.js, Svelte,
// Flutter, SwiftUI, WPF and 17 more), with each rule's official docs link. The rules come from the vetted ui-ux-pro-max stack
// tables in ../library/ui-ux-pro-max/stacks/ (MIT; see NOTICE.md there): 1,346 rules, each naming the version it applies to.
// Only ACTIVE rules marked Critical or High are handed out, at most 25 per stack, so the file stays small enough for Claude Code
// to read in every session (.claude/rules/stack-guides.md). The table cells are DATA: nothing in them is followed as an
// instruction, and the kit's own rules (CLAUDE.md, DESIGN.md, the stack recipe's notes) win where they differ.
// Run: node stack-guides.mjs --detect --project <dir>
//      node stack-guides.mjs --write --project <dir> [--stack laravel,nextjs]
//      node stack-guides.mjs --show <stack>           (the rules that would be written)
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./style-library.mjs";

const DIR = fileURLToPath(new URL("../library/ui-ux-pro-max/stacks/", import.meta.url));
export const STACKS = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith(".csv")).map((f) => f.replace(/\.csv$/, "")).sort() : [];
const NAMES = {
  angular: "Angular", astro: "Astro", avalonia: "Avalonia", flutter: "Flutter", "html-tailwind": "HTML and Tailwind", javafx: "JavaFX",
  "jetpack-compose": "Jetpack Compose", laravel: "Laravel", nextjs: "Next.js", "nuxt-ui": "Nuxt UI", nuxtjs: "Nuxt", "pyside6-qss": "PySide6 (Qt style sheets)",
  "react-native": "React Native", react: "React", shadcn: "shadcn/ui", svelte: "Svelte and SvelteKit", swiftui: "SwiftUI", threejs: "Three.js",
  uno: "Uno Platform", uwp: "UWP", vue: "Vue", winui: "WinUI", wpf: "WPF",
};
const LIMIT = 25;

export function loadGuides(stack) {
  const f = join(DIR, `${stack}.csv`);
  return existsSync(f) ? parseCsv(readFileSync(f, "utf8")) : [];
}

// Active Critical rules first, then active High ones, in the table's own order.
export function pickGuides(rows, limit = LIMIT) {
  const active = rows.filter((r) => r.Status === "active");
  return [...active.filter((r) => r.Severity === "Critical"), ...active.filter((r) => r.Severity === "High")].slice(0, limit);
}

const read = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
};
function filesIn(dir, test, depth = 0, out = []) {
  if (depth > 4 || out.length > 200) return out;
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!/^(node_modules|\.git|vendor|dist|build|bin|obj|\.venv|venv|Pods|DerivedData)$/.test(e.name)) filesIn(join(dir, e.name), test, depth + 1, out);
    } else if (test(e.name)) out.push(join(dir, e.name));
  }
  return out;
}

// The stacks a project uses, from its own manifests and source files (never from guesses).
export function detectStacks(project) {
  const found = new Set();
  let pkg = {};
  try {
    pkg = JSON.parse(read(join(project, "package.json")) || "{}");
  } catch {
    pkg = {};
  }
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}), ...(pkg.peerDependencies ?? {}) };
  const has = (n) => Object.prototype.hasOwnProperty.call(deps, n);
  if (has("next")) found.add("nextjs");
  if (has("nuxt")) found.add("nuxtjs");
  if (has("@nuxt/ui")) found.add("nuxt-ui");
  if (has("@sveltejs/kit") || has("svelte")) found.add("svelte");
  if (has("astro")) found.add("astro");
  if (has("@angular/core")) found.add("angular");
  if (has("react-native") || has("expo")) found.add("react-native");
  if (has("three")) found.add("threejs");
  if (has("vue") && !has("nuxt")) found.add("vue");
  if (has("react") && !has("next") && !has("react-native") && !has("expo")) found.add("react");
  if (existsSync(join(project, "components.json"))) found.add("shadcn");
  const framework = ["nextjs", "nuxtjs", "svelte", "astro", "angular", "react-native", "vue", "react"].some((s) => found.has(s));
  if (has("tailwindcss") && !framework) found.add("html-tailwind");
  if (/"laravel\/framework"/.test(read(join(project, "composer.json")))) found.add("laravel");
  if (/^\s*flutter\s*:/m.test(read(join(project, "pubspec.yaml")))) found.add("flutter");
  const py = read(join(project, "pyproject.toml")) + read(join(project, "requirements.txt"));
  if (/pyside6/i.test(py)) found.add("pyside6-qss");
  const gradle = ["build.gradle", "build.gradle.kts", "app/build.gradle", "app/build.gradle.kts"].map((f) => read(join(project, f))).join("\n") + read(join(project, "pom.xml"));
  if (/compose/i.test(gradle) && /android/i.test(gradle)) found.add("jetpack-compose");
  if (/javafx/i.test(gradle)) found.add("javafx");
  for (const f of filesIn(project, (n) => n.endsWith(".csproj"))) {
    const t = read(f);
    if (/Avalonia/i.test(t)) found.add("avalonia");
    else if (/Uno\.(Sdk|WinUI)/i.test(t)) found.add("uno");
    else if (/<UseWPF>\s*true/i.test(t)) found.add("wpf");
    else if (/Microsoft\.WindowsAppSDK/i.test(t)) found.add("winui");
    else if (/UAP|WindowsXaml|uap10/i.test(t)) found.add("uwp");
  }
  if (filesIn(project, (n) => n.endsWith(".swift")).some((f) => /import\s+SwiftUI/.test(read(f)))) found.add("swiftui");
  return [...found].filter((s) => STACKS.includes(s)).sort();
}

const one = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

export function guidesMd(stacks) {
  const L = [
    "# Stack guidelines",
    "The most important do's and don'ts for this project's stack, from the vetted ui-ux-pro-max stack tables (MIT) shipped with the",
    "starter kit. Each rule names the version it was written for; when the lockfile's version differs, check the linked docs. The",
    "project's own CLAUDE.md, DESIGN.md and .claude/rules/stack.md win where they disagree.",
    "",
  ];
  for (const s of stacks) {
    const picked = pickGuides(loadGuides(s));
    if (!picked.length) continue;
    L.push(`## ${NAMES[s] ?? s} (${one(picked[0]["Applies To"])})`);
    for (const g of picked) L.push(`- **${one(g.Guideline)}** (${g.Severity.toLowerCase()}). Do: ${one(g.Do)}. Don't: ${one(g["Don't"])}.${g["Docs URL"] ? ` ${one(g["Docs URL"])}` : ""}`);
    L.push("");
  }
  return L.join("\n").replace(/\.\. /g, ". ").replace(/\.\.$/gm, ".");
}

export function writeGuides(project, stacks) {
  const dir = join(project, ".claude", "rules");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "stack-guides.md");
  writeFileSync(file, guidesMd(stacks));
  return file;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  const val = (flag) => (a.includes(flag) ? a[a.indexOf(flag) + 1] : undefined);
  const project = resolve(val("--project") ?? ".");
  if (a.includes("--detect")) {
    const s = detectStacks(project);
    console.log(s.length ? `Stacks with guidelines: ${s.join(", ")}` : "No stack with guidelines found.");
  } else if (val("--show")) {
    for (const g of pickGuides(loadGuides(val("--show")))) console.log(`${g.Severity}: ${one(g.Guideline)}`);
  } else if (a.includes("--write")) {
    const asked = val("--stack")?.split(",").map((x) => x.trim()).filter((x) => STACKS.includes(x));
    const stacks = asked?.length ? asked : detectStacks(project);
    if (!stacks.length) {
      console.log(`No stack with guidelines found (known: ${STACKS.join(", ")}). Nothing written.`);
    } else {
      const f = writeGuides(project, stacks);
      console.log(`Wrote ${f} for: ${stacks.join(", ")}.`);
    }
  } else {
    console.log(`Use --detect, --write [--stack a,b] or --show <stack>, with --project <dir>. Known stacks: ${STACKS.join(", ")}`);
    process.exitCode = 1;
  }
}
