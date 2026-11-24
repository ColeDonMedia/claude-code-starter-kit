// Package vetting: is this dependency real, established and safe-looking before it is installed?
//   node pkg-check.mjs npm <name>      node pkg-check.mjs pypi <name>      node pkg-check.mjs cargo <name>
//
// Why: AI tools sometimes invent package names that sound right. Attackers register those names with malicious
// code ("slopsquatting"), and brand-new or barely used packages are the riskiest. This checks the public registry.
// It only reads (HTTP GET) from npmjs.org / pypi.org / crates.io. Verdicts: OK, CAUTION (ask the user), MISSING (block).
// Network trouble gives UNKNOWN, which never blocks.
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const DAY = 86_400_000;

// ---------- reading install commands ----------
const FLAGS_WITH_VALUE = new Set(["-r", "--requirement", "-e", "--editable", "-c", "--constraint", "-i", "--index-url", "--extra-index-url", "-f", "--find-links", "--registry", "--prefix", "-w", "--workspace", "--target", "-t", "--python", "--features", "-F", "--tag", "--save-prefix", "--cwd"]);

function tokens(segment) {
  return (segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((t) => t.replace(/^["']|["']$/g, ""));
}

// Returns [{ eco, names: [..], nonRegistry: [..] }] for each install command found.
export function parseInstalls(command) {
  const out = [];
  for (const seg of command.split(/&&|\|\||;|\n|\|/)) {
    const t = tokens(seg.trim());
    if (!t.length) continue;
    let i = 0;
    while (i < t.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t[i]) || ["sudo", "npx", "env", "time"].includes(t[i]))) i++;
    const bin = basename(t[i] ?? "").toLowerCase().replace(/\.(exe|cmd)$/, "");
    let eco = null;
    let rest = t.slice(i + 1);
    if (["npm", "pnpm", "yarn", "bun"].includes(bin) && ["install", "i", "add"].includes(rest[0])) {
      eco = "npm";
      rest = rest.slice(1);
    } else if (["pip", "pip3"].includes(bin) && rest[0] === "install") {
      eco = "pypi";
      rest = rest.slice(1);
    } else if (["python", "python3", "py"].includes(bin) && rest[0] === "-m" && rest[1] === "pip" && rest[2] === "install") {
      eco = "pypi";
      rest = rest.slice(3);
    } else if (bin === "uv" && ["add"].includes(rest[0])) {
      eco = "pypi";
      rest = rest.slice(1);
    } else if (bin === "uv" && rest[0] === "pip" && rest[1] === "install") {
      eco = "pypi";
      rest = rest.slice(2);
    } else if (["poetry", "pipenv"].includes(bin) && ["add", "install"].includes(rest[0])) {
      eco = "pypi";
      rest = rest.slice(1);
    } else if (bin === "cargo" && rest[0] === "add") {
      eco = "cargo";
      rest = rest.slice(1);
    }
    if (!eco) continue;
    const names = [];
    const nonRegistry = [];
    for (let k = 0; k < rest.length; k++) {
      const a = rest[k];
      if (a.startsWith("-")) {
        if (FLAGS_WITH_VALUE.has(a)) k++;
        continue;
      }
      if (/^(\.{1,2}([\\/]|$)|[\\/]|~|file:|git\+|github:|gitlab:|bitbucket:|https?:|ssh:|git@)/i.test(a) || /\.(tgz|tar\.gz|whl|zip)$/i.test(a)) {
        nonRegistry.push(a);
        continue;
      }
      let name = a;
      if (eco === "npm") name = a.replace(/^(@?[^@]+)@.*$/, "$1");
      else if (eco === "pypi") name = a.replace(/[\[<>=!~;].*$/, "");
      else if (eco === "cargo") name = a.replace(/@.*$/, "");
      name = name.trim();
      if (name && /^[A-Za-z0-9@._\/-]+$/.test(name)) names.push(name);
    }
    if (names.length || nonRegistry.length) out.push({ eco, names, nonRegistry });
  }
  return out;
}

// ---------- looking a package up ----------
const timeout = () => AbortSignal.timeout(4000);

export async function lookup(eco, name) {
  if (process.env.KIT_REGISTRY_FIXTURE) {
    const fx = JSON.parse(readFileSync(process.env.KIT_REGISTRY_FIXTURE, "utf8"));
    return fx[`${eco}:${name}`] ?? { exists: true, ageDays: 2000, weekly: 1_000_000 };
  }
  try {
    if (eco === "npm") {
      const enc = name.startsWith("@") ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
      // The "latest" document is small and complete (repository, scripts, deprecation). The full document is large
      // and only needed for the creation date, which matters only for packages that aren't obviously popular.
      const r = await fetch(`https://registry.npmjs.org/${enc}/latest`, { signal: timeout() });
      if (r.status === 404) return { exists: false };
      if (!r.ok) return { unknown: true };
      const v = await r.json();
      let weekly = null;
      const d = await fetch(`https://api.npmjs.org/downloads/point/last-week/${enc}`, { signal: timeout() }).catch(() => null);
      if (d && d.ok) weekly = (await d.json()).downloads ?? null;
      let created = null;
      if (weekly == null || weekly < 100_000) {
        const full = await fetch(`https://registry.npmjs.org/${enc}`, { signal: timeout() }).catch(() => null);
        if (full && full.ok) created = (await full.json()).time?.created ?? null;
      }
      const scripts = v?.scripts ?? {};
      return {
        exists: true,
        ageDays: created ? Math.floor((Date.now() - new Date(created)) / DAY) : null,
        weekly,
        deprecated: Boolean(v?.deprecated),
        installScripts: Boolean(scripts.preinstall || scripts.install || scripts.postinstall || v?.hasInstallScript),
        hasRepo: Boolean(v?.repository),
      };
    }
    if (eco === "pypi") {
      const r = await fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, { signal: timeout() });
      if (r.status === 404) return { exists: false };
      if (!r.ok) return { unknown: true };
      const j = await r.json();
      const times = Object.values(j.releases ?? {}).flat().map((f) => new Date(f.upload_time_iso_8601 ?? f.upload_time)).filter((d) => !Number.isNaN(+d));
      const first = times.length ? new Date(Math.min(...times)) : null;
      const urls = j.info?.project_urls ?? {};
      return { exists: true, ageDays: first ? Math.floor((Date.now() - first) / DAY) : null, weekly: null, deprecated: Boolean(j.info?.yanked), installScripts: false, hasRepo: Boolean(Object.keys(urls).length || j.info?.home_page) };
    }
    if (eco === "cargo") {
      const r = await fetch(`https://crates.io/api/v1/crates/${encodeURIComponent(name)}`, { signal: timeout(), headers: { "user-agent": "starter-kit-pkg-check" } });
      if (r.status === 404) return { exists: false };
      if (!r.ok) return { unknown: true };
      const c = (await r.json()).crate ?? {};
      return { exists: true, ageDays: c.created_at ? Math.floor((Date.now() - new Date(c.created_at)) / DAY) : null, weekly: c.recent_downloads != null ? Math.round(c.recent_downloads / 13) : null, deprecated: false, installScripts: false, hasRepo: Boolean(c.repository) };
    }
  } catch {
    return { unknown: true };
  }
  return { unknown: true };
}

// ---------- the verdict ----------
export function assess(info) {
  if (info.unknown) return { verdict: "UNKNOWN", reasons: [] };
  if (!info.exists) return { verdict: "MISSING", reasons: ["no package with this name exists in the registry"] };
  const reasons = [];
  if (info.ageDays != null && info.ageDays < 30) reasons.push(`first published only ${info.ageDays} day(s) ago`);
  if (info.weekly != null && info.weekly < 500) reasons.push(`only ${info.weekly} downloads last week`);
  if (info.deprecated) reasons.push("marked deprecated or yanked");
  if (info.installScripts) reasons.push("runs a script automatically when installed");
  if (info.hasRepo === false) reasons.push("links to no source repository");
  return { verdict: reasons.length ? "CAUTION" : "OK", reasons };
}

// ---------- CLI ----------
if (process.argv[1] && basename(process.argv[1]) === "pkg-check.mjs") {
  const [eco, name] = process.argv.slice(2);
  if (!eco || !name) {
    console.error("usage: pkg-check.mjs <npm|pypi|cargo> <name>");
    process.exit(64);
  }
  const info = await lookup(eco, name);
  const a = assess(info);
  console.log(`${a.verdict} ${eco}:${name}${a.reasons.length ? " — " + a.reasons.join("; ") : ""}`);
  process.exitCode = a.verdict === "MISSING" ? 1 : 0; // let open network handles close; process.exit() can crash Node on Windows here
}
