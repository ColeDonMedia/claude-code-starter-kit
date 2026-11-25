// Are the licenses of the libraries this app ships compatible with using it commercially?
//   node license-check.mjs --project <folder> [--all] [--allow pkg,pkg] [--notices]
//
// Reads the licenses of the installed libraries (npm: node_modules; Python: a virtual environment's *.dist-info) and sorts
// them into: permissive (fine), weak copyleft (fine to use, with conditions when you change the library), restrictive
// (GPL, AGPL, non-commercial, source-available: can force you to open your own code or forbid commercial use) and unknown.
// Restrictive and unknown ones are reported and make it exit 1, unless named in --allow after a human decided they are fine.
// By default only libraries the app actually ships are checked (--all includes development tools). --notices prints a
// ready-made list of every shipped library and its license, for a THIRD_PARTY_LICENSES.md file.
// This reads what the libraries SAY about themselves. It is a screening tool, not legal advice.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const PERMISSIVE = /^(MIT|MIT-0|ISC|BSD-[23]-Clause|BSD|Apache-2\.0|0BSD|Unlicense|CC0-1\.0|BlueOak-1\.0\.0|Python-2\.0|PSF-2\.0|Zlib|WTFPL|X11|Artistic-2\.0|CC-BY-4\.0|CC-BY-3\.0|Apache 2\.0|Apache License 2\.0|The MIT License|MIT License)$/i;
const WEAK = /^(LGPL|MPL|EPL|CDDL|EUPL|MS-RL|CC-BY-SA)/i;
const RESTRICTIVE = /(^|[^L])GPL|AGPL|SSPL|BUSL|Business Source|Commons-Clause|Commons Clause|CC-BY-NC|NonCommercial|Elastic[- ]License|Elastic-2|ELv2|PolyForm|Prosperity|Sustainable Use|RSALv2/i;

export function classify(raw) {
  const lic = String(raw ?? "").trim();
  if (!lic || /^(none|unlicensed|unlicense?d|proprietary|see license|see licen[cs]e in|custom)/i.test(lic) || /^SEE LICEN/i.test(lic)) return "unknown";
  const expr = lic.replace(/[()]/g, "");
  if (/\sOR\s/i.test(expr)) {
    // the user may pick any option: as good as the best one
    const kinds = expr.split(/\s+OR\s+/i).map(classify);
    return ["permissive", "weak", "unknown", "restrictive"].find((k) => kinds.includes(k));
  }
  if (/\sAND\s/i.test(expr)) {
    // every part applies: as bad as the worst
    const kinds = expr.split(/\s+AND\s+/i).map(classify);
    return ["restrictive", "unknown", "weak", "permissive"].find((k) => kinds.includes(k));
  }
  if (RESTRICTIVE.test(expr)) return "restrictive";
  if (WEAK.test(expr)) return "weak";
  if (PERMISSIVE.test(expr)) return "permissive";
  return "unknown";
}

const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};
const licenseOf = (pkg) => (typeof pkg.license === "string" ? pkg.license : pkg.license?.type ?? (Array.isArray(pkg.licenses) ? pkg.licenses.map((l) => l.type ?? l).join(" OR ") : ""));

function npmPackages(root, includeDev) {
  const nm = join(root, "node_modules");
  const rootPkg = readJson(join(root, "package.json"));
  if (!existsSync(nm) || !rootPkg) return null;
  const find = (name) => readJson(join(nm, ...name.split("/"), "package.json"));
  const seen = new Map();
  const queue = [...Object.keys(rootPkg.dependencies ?? {}), ...Object.keys(rootPkg.optionalDependencies ?? {}), ...(includeDev ? Object.keys(rootPkg.devDependencies ?? {}) : [])];
  while (queue.length) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    const pkg = find(name);
    if (!pkg) continue; // an optional dependency that isn't installed on this platform
    seen.set(name, { name, version: pkg.version ?? "?", license: licenseOf(pkg) });
    queue.push(...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.optionalDependencies ?? {}));
  }
  return [...seen.values()];
}

function pythonPackages(root) {
  const sites = [];
  for (const env of [".venv", "venv", "env"]) {
    const lib = join(root, env, "Lib", "site-packages");
    if (existsSync(lib)) sites.push(lib);
    const unix = join(root, env, "lib");
    if (existsSync(unix)) for (const v of readdirSync(unix)) if (existsSync(join(unix, v, "site-packages"))) sites.push(join(unix, v, "site-packages"));
  }
  const out = [];
  for (const site of sites) {
    for (const d of readdirSync(site).filter((x) => x.endsWith(".dist-info"))) {
      let meta = "";
      try {
        meta = readFileSync(join(site, d, "METADATA"), "utf8").split(/\r?\n\r?\n/)[0];
      } catch {
        continue;
      }
      const name = /^Name:\s*(.+)$/m.exec(meta)?.[1] ?? d;
      const version = /^Version:\s*(.+)$/m.exec(meta)?.[1] ?? "?";
      const expr = /^License-Expression:\s*(.+)$/m.exec(meta)?.[1];
      const lic = /^License:\s*(.+)$/m.exec(meta)?.[1];
      const classifiers = [...meta.matchAll(/^Classifier:\s*License\s*::\s*(?:OSI Approved\s*::\s*)?(.+)$/gm)].map((m) => m[1].replace(/ License$/, ""));
      out.push({ name, version, license: expr ?? (lic && lic.length < 80 ? lic : classifiers.join(" OR ")) });
    }
  }
  return out.length ? out : null;
}

export function checkLicenses(root, { includeDev = false, allow = [] } = {}) {
  const pkgs = [...(npmPackages(root, includeDev) ?? []), ...(pythonPackages(root) ?? [])];
  const found = npmPackages(root, includeDev) !== null || pythonPackages(root) !== null;
  const allowed = new Set(allow.map((a) => a.toLowerCase()));
  const rows = pkgs.map((p) => ({ ...p, kind: classify(p.license) }));
  const flagged = rows.filter((r) => (r.kind === "restrictive" || r.kind === "unknown") && !allowed.has(r.name.toLowerCase()));
  return { found, rows, flagged, counts: Object.fromEntries(["permissive", "weak", "restrictive", "unknown"].map((k) => [k, rows.filter((r) => r.kind === k).length])) };
}

if (process.argv[1] && basename(process.argv[1]) === "license-check.mjs") {
  const arg = (n, d) => {
    const i = process.argv.indexOf(n);
    return i >= 0 ? process.argv[i + 1] : d;
  };
  const root = resolve(arg("--project", "."));
  const r = checkLicenses(root, { includeDev: process.argv.includes("--all"), allow: (arg("--allow", "") ?? "").split(",").filter(Boolean) });
  if (!r.found) {
    console.log("No installed libraries found (no node_modules or Python virtual environment). Install dependencies first, or run the ecosystem's own license tool (for Rust: cargo license).");
    process.exit(2);
  }
  if (process.argv.includes("--notices")) {
    console.log("# Third-party licenses\n\nThis project uses the following open-source libraries.\n\n| Library | Version | License |\n|---|---|---|");
    for (const p of [...r.rows].sort((a, b) => a.name.localeCompare(b.name))) console.log(`| ${p.name} | ${p.version} | ${p.license || "unknown"} |`);
    process.exit(0);
  }
  console.log(`Licenses of ${r.rows.length} libraries: ${r.counts.permissive} permissive, ${r.counts.weak} weak copyleft, ${r.counts.restrictive} restrictive, ${r.counts.unknown} unknown.`);
  for (const f of r.flagged) console.log(`${f.kind.toUpperCase()}: ${f.name}@${f.version} — ${f.license || "no license stated"}`);
  if (r.flagged.length) console.log("Restrictive licenses can require you to publish your own code or forbid commercial use; unknown ones mean no permission is stated. Replace them, or have a person decide and pass the name to --allow.");
  process.exitCode = r.flagged.length ? 1 : 0;
}
