// The kit's own security checks: nothing to install, nothing to set up, plain Node.
//   node sec-builtin.mjs --project <dir> [--url http://localhost:3000] [--offline] [--json]
// What it checks:
//   deps      every dependency in the lockfiles (npm, yarn, pnpm, pip, poetry, Cargo, Go, Ruby) against OSV.dev, the free public
//             database of known flaws and known malware. Sends only package names and versions, never code. --offline skips it.
//   workflow  GitHub Actions: untrusted text pasted into shell steps, pull_request_target checking out the stranger's code,
//             secrets echoed into logs, actions not pinned to an exact commit, write-all permissions
//   docker    Dockerfiles: secrets baked into the image, piping a download into a shell, unpinned base images, running as root
//   compose   Compose files: privileged containers, the Docker socket handed to a container, databases open to the network
//   live      with --url (this computer only): missing security headers, CORS that lets any site read signed-in pages, session
//             cookies readable by scripts, .env or .git served to the web, stack traces on error pages
// A HIGH finding exits 1 (blocks shipping). Pattern checks: they miss what they don't describe, and the reviewers still decide.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const SKIP = new Set(["node_modules", ".git", ".venv", "venv", "dist", "build", "target", "vendor", ".next", ".claude"]);

function walk(root, limit = 4000) {
  const files = [];
  const queue = [root];
  while (queue.length && files.length < limit) {
    const dir = queue.shift();
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP.has(e.name)) queue.push(join(dir, e.name));
      } else files.push(join(dir, e.name).slice(root.length + 1).replace(/\\/g, "/"));
    }
  }
  return files;
}

const finding = (severity, rule, file, line, message, fix) => ({ severity, rule, file, line, message, fix });

// ---------- GitHub Actions ----------
const UNTRUSTED = /\$\{\{\s*(github\.head_ref|github\.event\.(issue|pull_request|comment|review|review_comment|discussion|head_commit|commits|pages|workflow_run)[\w.\[\]*]*\.(title|body|message|name|label|ref|email|default_branch|head_branch))\s*\}\}|\$\{\{\s*github\.head_ref\s*\}\}/;

export function checkWorkflow(text, file) {
  const out = [];
  const lines = text.split(/\r?\n/);
  let runIndent = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const indent = l.match(/^\s*/)[0].length;
    if (runIndent >= 0 && l.trim() && indent <= runIndent) runIndent = -1;
    const run = l.match(/^(\s*)(-\s*)?run:\s*(.*)$/);
    let inRun = runIndent >= 0;
    if (run) {
      if (/^[|>][-+]?\s*$/.test(run[3]) || !run[3].trim()) runIndent = run[1].length + (run[2] ? run[2].length : 0);
      inRun = true;
    }
    if (inRun && UNTRUSTED.test(l))
      out.push(finding("HIGH", "wf-injection", file, i + 1, "text anyone can write (an issue title, a branch name, a PR body) is pasted straight into a shell step, so a crafted title runs commands with this workflow's secrets", "pass it through env: (FOO: ${{ ... }}) and use \"$FOO\" in the script"));
    if (inRun && /\becho\b.*\$\{\{\s*secrets\./.test(l))
      out.push(finding("HIGH", "wf-secret-echo", file, i + 1, "a secret is printed into the build log", "never echo secrets; pass them through env: to the program that needs them"));
    const uses = l.match(/^\s*(-\s*)?uses:\s*["']?([^\s"'#]+)/);
    if (uses && !uses[2].startsWith("./") && !/^docker:\/\/.*@sha256:/.test(uses[2]) && !/@[0-9a-f]{40}$/.test(uses[2]))
      out.push(finding("MEDIUM", "wf-unpinned", file, i + 1, `${uses[2]} is not pinned to an exact commit: whoever controls that tag can change what runs here`, "pin it to the full commit hash, with the version as a comment"));
    if (/^\s*permissions:\s*write-all\s*$/.test(l))
      out.push(finding("MEDIUM", "wf-write-all", file, i + 1, "the workflow token can change everything in the repository", "list only the permissions it needs, e.g. contents: read"));
  }
  if (/^\s*pull_request_target\s*:|^on:.*pull_request_target|^\s*-\s*pull_request_target\s*$/m.test(text) && /ref:\s*\$\{\{\s*(github\.event\.pull_request\.head\.(sha|ref)|github\.head_ref)/.test(text)) {
    const at = lines.findIndex((l) => /ref:\s*\$\{\{\s*(github\.event\.pull_request\.head|github\.head_ref)/.test(l));
    out.push(finding("HIGH", "wf-prt-checkout", file, at + 1, "pull_request_target runs with the repository's secrets, and this checks out the stranger's code from the pull request", "use pull_request instead, or never run the checked-out code in this workflow"));
  }
  return out;
}

// ---------- Dockerfiles ----------
const SECRET_NAME = /(PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY|CREDENTIALS?)/i;

export function checkDockerfile(text, file) {
  const out = [];
  const lines = text.replace(/\\\r?\n/g, " ").split(/\r?\n/); // join continued lines (line numbers are then approximate)
  const stages = new Set();
  let lastFrom = -1;
  let user = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    const from = l.match(/^FROM\s+(--platform=\S+\s+)?(\S+)(\s+AS\s+(\S+))?/i);
    if (from) {
      lastFrom = i;
      user = null;
      const img = from[2];
      if (from[4]) stages.add(from[4].toLowerCase());
      if (img !== "scratch" && !stages.has(img.toLowerCase()) && !img.includes("$") && !img.includes("@sha256:") && (!/:[^/]+$/.test(img) || /:latest$/.test(img)))
        out.push(finding("MEDIUM", "docker-latest", file, i + 1, `base image ${img} has no fixed version, so a rebuild can silently pull different software`, "name a version, e.g. node:22-slim"));
    }
    const env = l.match(/^(ENV|ARG)\s+(.*)$/i);
    if (env) {
      for (const m of env[2].matchAll(/([A-Za-z_][\w]*)(?:=("[^"]*"|'[^']*'|\S*)|\s+(\S.*))?/g)) {
        const val = (m[2] ?? m[3] ?? "").replace(/^["']|["']$/g, "");
        if (!SECRET_NAME.test(m[1])) continue;
        if (val && !/^\$/.test(val)) out.push(finding("HIGH", "docker-secret", file, i + 1, `${m[1]} is written into the image, where anyone with the image can read it`, "pass it at run time (environment or a secret mount), never in the Dockerfile"));
        else if (env[1].toUpperCase() === "ARG") out.push(finding("MEDIUM", "docker-secret-arg", file, i + 1, `${m[1]} as a build argument stays visible in the image history`, "use a build secret: RUN --mount=type=secret"));
        break;
      }
    }
    if (/^RUN\b.*\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z)?sh\b/i.test(l))
      out.push(finding("HIGH", "docker-pipe-shell", file, i + 1, "a downloaded script is run without being checked", "download it, check its hash, then run it"));
    if (/^ADD\s+https?:\/\//i.test(l))
      out.push(finding("MEDIUM", "docker-add-url", file, i + 1, "ADD fetches from the internet with no check of what arrives", "download in a RUN step and check the hash"));
    const u = l.match(/^USER\s+(\S+)/i);
    if (u) user = u[1];
  }
  if (lastFrom >= 0 && (user === null || /^(root|0)(:|$)/.test(user)))
    out.push(finding("MEDIUM", "docker-root", file, lastFrom + 1, "the app runs as root inside the container, so a break-in gets full control of it", "add a non-root user and USER it before CMD (official node images have USER node)"));
  return out;
}

// ---------- Compose ----------
const DB_PORTS = new Set(["5432", "3306", "27017", "6379", "9200", "1433", "5984", "11211"]);

export function checkCompose(text, file) {
  const out = [];
  text.split(/\r?\n/).forEach((l, i) => {
    if (/^\s*privileged:\s*true\b/.test(l)) out.push(finding("HIGH", "compose-privileged", file, i + 1, "a privileged container can take over this computer", "remove privileged: true and add only the capability it needs"));
    if (/\/var\/run\/docker\.sock/.test(l)) out.push(finding("HIGH", "compose-docker-sock", file, i + 1, "the Docker socket gives this container full control of the computer", "don't mount it unless the container's whole job is managing Docker"));
    if (/^\s*network_mode:\s*["']?host/.test(l)) out.push(finding("MEDIUM", "compose-host-network", file, i + 1, "the container shares this computer's network directly", "use normal port mappings"));
    const p = l.match(/^\s*-\s*["']?(?:0\.0\.0\.0:)?(\d+):(\d+)["']?\s*$/);
    if (p && DB_PORTS.has(p[2])) out.push(finding("MEDIUM", "compose-db-exposed", file, i + 1, `the database port ${p[2]} is open to the whole network, not just this computer`, `bind it to this computer: "127.0.0.1:${p[1]}:${p[2]}"`));
  });
  return out;
}

// ---------- Dependencies (OSV.dev) ----------
export function parseLock(name, text) {
  const pkgs = [];
  const add = (ecosystem, n, version) => n && version && pkgs.push({ ecosystem, name: n, version });
  try {
    if (name === "package-lock.json" || name === "npm-shrinkwrap.json") {
      const j = JSON.parse(text);
      if (j.packages) {
        for (const [k, v] of Object.entries(j.packages)) if (k && !v.link) add("npm", v.name || k.split("node_modules/").pop(), v.version);
      } else {
        const rec = (deps) => Object.entries(deps || {}).forEach(([k, v]) => (add("npm", k, v.version), rec(v.dependencies)));
        rec(j.dependencies);
      }
    } else if (name === "yarn.lock") {
      let cur = null;
      for (const l of text.split(/\r?\n/)) {
        const h = l.match(/^"?((@[^@"\s]+\/)?[^@"\s,]+)@/);
        if (h && !l.startsWith(" ")) cur = h[1];
        const v = l.match(/^\s+version:?\s+"?([^"\s]+)"?/);
        if (v && cur) (add("npm", cur, v[1]), (cur = null));
      }
    } else if (name === "pnpm-lock.yaml") {
      for (const m of text.matchAll(/^\s{2}['"]?\/?((?:@[^/@\s]+\/)?[^@\s/'"]+)@(\d[^(:'"\s]*)/gm)) add("npm", m[1], m[2]);
    } else if (name === "requirements.txt") {
      for (const m of text.matchAll(/^\s*([A-Za-z0-9][\w.-]*)(\[[^\]]*\])?\s*==\s*([\w.+!-]+)/gm)) add("PyPI", m[1], m[3]);
    } else if (name === "poetry.lock" || name === "uv.lock" || name === "Cargo.lock") {
      const eco = name === "Cargo.lock" ? "crates.io" : "PyPI";
      for (const block of text.split(/^\[\[package\]\]/m).slice(1)) {
        if (eco === "crates.io" && !/^source\s*=/m.test(block)) continue; // the project's own crates
        add(eco, block.match(/^name\s*=\s*"([^"]+)"/m)?.[1], block.match(/^version\s*=\s*"([^"]+)"/m)?.[1]);
      }
    } else if (name === "go.sum") {
      for (const m of text.matchAll(/^(\S+)\s+(v[^\s/]+)(\/go\.mod)?\s/gm)) add("Go", m[1], m[2]);
    } else if (name === "Gemfile.lock") {
      for (const m of text.matchAll(/^ {4}([\w.-]+) \(([\w.]+)\)\s*$/gm)) add("RubyGems", m[1], m[2]);
    }
  } catch {
    return [];
  }
  const seen = new Set();
  return pkgs.filter((p) => {
    const k = `${p.ecosystem}|${p.name}|${p.version}`;
    return !seen.has(k) && seen.add(k);
  });
}

const LOCK_NAMES = new Set(["package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml", "requirements.txt", "poetry.lock", "uv.lock", "Cargo.lock", "go.sum", "Gemfile.lock"]);

function severityOf(v) {
  if (/^MAL-/.test(v.id) || (v.aliases || []).some((a) => /^MAL-/.test(a))) return "HIGH";
  const s = String(v.database_specific?.severity || "").toUpperCase();
  if (s === "CRITICAL" || s === "HIGH") return "HIGH";
  if (s === "LOW") return "LOW";
  return "MEDIUM";
}

function fixedIn(v, pkg) {
  for (const a of v.affected || []) {
    if (a.package?.name !== pkg.name) continue;
    for (const r of a.ranges || []) if (r.type !== "GIT") for (const e of r.events || []) if (e.fixed) return e.fixed;
  }
  return null;
}

export async function checkDeps(pkgs, { fetchImpl = fetch, file = "lockfile" } = {}) {
  const out = [];
  const hits = [];
  for (let i = 0; i < pkgs.length; i += 1000) {
    const chunk = pkgs.slice(i, i + 1000);
    const r = await fetchImpl("https://api.osv.dev/v1/querybatch", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ queries: chunk.map((p) => ({ package: { name: p.name, ecosystem: p.ecosystem }, version: p.version })) }) });
    if (!r.ok) throw new Error(`OSV answered ${r.status}`);
    const j = await r.json();
    (j.results || []).forEach((res, k) => (res.vulns || []).forEach((v) => hits.push({ pkg: chunk[k], id: v.id })));
  }
  const details = new Map();
  for (const id of [...new Set(hits.map((h) => h.id))].slice(0, 60)) {
    try {
      const r = await fetchImpl(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`);
      if (r.ok) details.set(id, await r.json());
    } catch {
      // a missing detail only loses the severity and fixed version
    }
  }
  // The same flaw is often listed twice (a GitHub advisory and a PyPI one naming each other): report it once, GitHub's first.
  hits.sort((a, b) => Number(!a.id.startsWith("GHSA")) - Number(!b.id.startsWith("GHSA")));
  const kept = new Map();
  for (const h of hits) {
    const v = details.get(h.id) || { id: h.id };
    const key = `${h.pkg.ecosystem}|${h.pkg.name}|${h.pkg.version}`;
    const seen = kept.get(key) || new Set();
    if (seen.has(v.id) || (v.aliases || []).some((a) => seen.has(a))) continue;
    [v.id, ...(v.aliases || [])].forEach((a) => seen.add(a));
    kept.set(key, seen);
    const mal = severityOf(v) === "HIGH" && /^MAL-/.test(v.id);
    const fix = fixedIn(v, h.pkg);
    out.push(finding(severityOf(v), mal ? "dep-malware" : "dep-flaw", h.pkg.file || file, 0,
      `${h.pkg.name} ${h.pkg.version} (${h.pkg.ecosystem}): ${mal ? "known MALWARE" : "known flaw"} ${v.id}${v.summary ? ` — ${v.summary}` : ""}`,
      mal ? "remove it now and check this computer for what it may have run" : fix ? `upgrade to ${fix} or later` : "check https://osv.dev/vulnerability/" + v.id));
  }
  return out;
}

// ---------- The running local copy ----------
export const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/;

export async function checkLive(url, { fetchImpl = fetch } = {}) {
  if (!LOCAL.test(url)) throw new Error("live checks only run against this computer's own copy (localhost)");
  const out = [];
  const get = (path, headers = {}) => fetchImpl(new URL(path, url), { headers, redirect: "manual" });
  const r = await get("/", { origin: "https://attacker.example" });
  const h = (k) => r.headers.get(k);
  const html = /html/i.test(h("content-type") || "");
  const csp = h("content-security-policy") || "";
  if (html && !csp) out.push(finding("MEDIUM", "hdr-csp", url, 0, "no Content-Security-Policy: an injected script would run freely", "add a CSP header (start with default-src 'self')"));
  if (!/nosniff/i.test(h("x-content-type-options") || "")) out.push(finding("LOW", "hdr-nosniff", url, 0, "no X-Content-Type-Options: nosniff", "add X-Content-Type-Options: nosniff"));
  if (html && !h("x-frame-options") && !/frame-ancestors/i.test(csp)) out.push(finding("MEDIUM", "hdr-frame", url, 0, "any site can show this page inside a frame and trick people into clicks", "add CSP frame-ancestors 'self' (or X-Frame-Options: DENY)"));
  if (!h("referrer-policy")) out.push(finding("LOW", "hdr-referrer", url, 0, "no Referrer-Policy: full addresses leak to other sites", "add Referrer-Policy: strict-origin-when-cross-origin"));
  const powered = h("x-powered-by") || (/\d/.test(h("server") || "") ? h("server") : "");
  if (powered) out.push(finding("LOW", "hdr-version", url, 0, `the server announces its software (${powered}), which helps attackers pick an exploit`, "turn off X-Powered-By / the version in Server"));
  const acao = h("access-control-allow-origin");
  if (acao && (acao === "https://attacker.example" || acao === "null") && /true/i.test(h("access-control-allow-credentials") || ""))
    out.push(finding("HIGH", "cors-any-credentials", url, 0, "any website can read this app's pages as the signed-in visitor (CORS echoes the caller and allows cookies)", "allow only your own site's address"));
  else if (acao === "*") out.push(finding("LOW", "cors-star", url, 0, "every website may read these responses (fine only for truly public data)", "allow only your own site's address"));
  const cookies = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : (h("set-cookie") ? [h("set-cookie")] : []);
  for (const c of cookies) {
    const name = c.split("=")[0].trim();
    if (/sess|auth|token|sid|jwt|login/i.test(name) && !/;\s*httponly/i.test(c)) out.push(finding("HIGH", "cookie-httponly", url, 0, `the sign-in cookie ${name} can be read by scripts, so an injected script can steal sessions`, "set HttpOnly on it"));
    if (!/;\s*samesite=/i.test(c)) out.push(finding("MEDIUM", "cookie-samesite", url, 0, `cookie ${name} has no SameSite setting`, "set SameSite=Lax (or Strict)"));
  }
  for (const [path, re, what] of [["/.env", /^\s*[A-Z_][A-Z0-9_]*\s*=/m, "the .env file (keys and passwords)"], ["/.git/HEAD", /^ref:\s/m, "the .git folder (the whole source history)"]]) {
    try {
      const x = await get(path);
      if (x.status === 200 && re.test(await x.text())) out.push(finding("HIGH", "leak-file", url + path.slice(1), 0, `the app serves ${what} to anyone`, "serve only the public folder, never the project root"));
    } catch {
      // unreachable path: nothing to report
    }
  }
  try {
    const x = await get("/__starter_kit_missing__/%ff");
    const body = await x.text();
    if (/Traceback \(most recent call last\)|\n\s+at [\w.<>]+ \(.+:\d+:\d+\)|stack trace|Exception in thread/i.test(body))
      out.push(finding("MEDIUM", "error-trace", url, 0, "error pages show the code's internals (a stack trace)", "show a plain error page in production; log the details instead"));
  } catch {
    // ignore
  }
  return out;
}

// ---------- Everything ----------
export async function scan(root, { url, offline = false, fetchImpl = fetch } = {}) {
  const files = walk(root);
  const out = [];
  const notes = [];
  const read = (p) => {
    try {
      return statSync(join(root, p)).size < 5_000_000 ? readFileSync(join(root, p), "utf8") : "";
    } catch {
      return "";
    }
  };
  for (const p of files) {
    if (/^\.github\/workflows\/[^/]+\.ya?ml$/i.test(p)) out.push(...checkWorkflow(read(p), p));
    else if (/(^|\/)(Dockerfile|Containerfile)(\.[\w-]+)?$/i.test(p)) out.push(...checkDockerfile(read(p), p));
    else if (/(^|\/)(docker-)?compose(\.[\w-]+)?\.ya?ml$/i.test(p)) out.push(...checkCompose(read(p), p));
  }
  const pkgs = files.filter((p) => LOCK_NAMES.has(basename(p))).flatMap((p) => parseLock(basename(p), read(p)).map((x) => ({ ...x, file: p })));
  if (pkgs.length && offline) notes.push("Dependencies not checked (offline).");
  else if (pkgs.length) {
    try {
      out.push(...(await checkDeps(pkgs, { fetchImpl })));
      notes.push(`Checked ${pkgs.length} dependencies against OSV.dev.`);
    } catch (e) {
      notes.push(`Dependencies not checked: OSV.dev could not be reached (${e.message}). Say so in the report; it is not a pass.`);
    }
  }
  if (url) {
    try {
      out.push(...(await checkLive(url, { fetchImpl })));
      notes.push(`Checked the running copy at ${url}.`);
    } catch (e) {
      notes.push(`Live checks not run: ${e.message}.`);
    }
  }
  const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  out.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return { findings: out, notes };
}

// The same rule in the same file several times (six unpinned steps in one workflow) is one line, with every line number.
const GROUPED = new Set(["wf-unpinned"]);

export function render({ findings, notes }) {
  const lines = [];
  const groups = new Map();
  for (const f of findings) {
    if (!GROUPED.has(f.rule)) {
      lines.push(`${f.severity} ${f.rule} ${f.file}${f.line ? `:${f.line}` : ""}: ${f.message}. Fix: ${f.fix}.`);
      continue;
    }
    const k = `${f.rule}|${f.file}`;
    if (!groups.has(k)) {
      groups.set(k, { ...f, lines: [], what: [] });
      lines.push(k); // placeholder, filled below so the group keeps its place in the order
    }
    groups.get(k).lines.push(f.line);
    groups.get(k).what.push(f.message.split(" ")[0]);
  }
  for (const [k, g] of groups) {
    const text = g.lines.length === 1
      ? `${g.severity} ${g.rule} ${g.file}:${g.lines[0]}: ${g.message}. Fix: ${g.fix}.`
      : `${g.severity} ${g.rule} ${g.file}:${g.lines.join(",")}: ${g.lines.length} steps are not pinned to an exact commit (${[...new Set(g.what)].join(", ")}): whoever controls those tags can change what runs here. Fix: ${g.fix}.`;
    lines[lines.indexOf(k)] = text;
  }
  if (!findings.length) lines.push("No findings from the built-in checks.");
  return [...lines, ...notes].join("\n");
}

if (process.argv[1] && basename(process.argv[1]) === "sec-builtin.mjs") {
  const arg = (k) => {
    const i = process.argv.indexOf(k);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const root = resolve(arg("--project") || process.cwd());
  const url = arg("--url");
  if (!existsSync(root)) {
    console.error("Folder not found.");
    process.exit(1);
  }
  if (url && !LOCAL.test(url)) {
    console.error("--url must be this computer's running copy (localhost or 127.0.0.1): live checks never touch a real site.");
    process.exit(1);
  }
  const res = await scan(root, { url, offline: process.argv.includes("--offline") });
  console.log(process.argv.includes("--json") ? JSON.stringify(res, null, 2) : render(res));
  process.exitCode = res.findings.some((f) => f.severity === "HIGH") ? 1 : 0;
}
