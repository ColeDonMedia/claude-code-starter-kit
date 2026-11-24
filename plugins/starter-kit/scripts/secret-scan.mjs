// Secret and private-data scanner for changes about to leave the machine.
//
//   node secret-scan.mjs --staged            scan what `git commit` would record (git diff --cached)
//   node secret-scan.mjs --range <base>..HEAD scan the commits a push would send
//   node secret-scan.mjs --files <path...>   scan named files
//
// Prints FINDINGS with file:line and a REDACTED value. It never prints a full secret.
// Exit 0 = clean, 1 = findings, 2 = usage error.
//
// Private terms (your name, email, personal paths, client names) are read from, in order:
//   $KIT_PRIVATE_TERMS (a file path), then ~/.claude/plugins/data/starter-kit/private-terms.txt
// One term per line; lines starting with # are ignored. That file is never committed anywhere.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

// ---------- rules ----------
// [id, severity, regex, description]. Values are matched case-sensitively unless noted.
const RULES = [
  ["private-key", "HIGH", /-----BEGIN ((RSA|DSA|EC|OPENSSH|PGP|ENCRYPTED) )?PRIVATE KEY( BLOCK)?-----/, "private key"],
  ["aws-access-key", "HIGH", /\b(AKIA|ASIA)[0-9A-Z]{16}\b/, "AWS access key id"],
  ["github-token", "HIGH", /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/, "GitHub token"],
  ["stripe-key", "HIGH", /\b(sk|rk)_live_[A-Za-z0-9]{16,}\b/, "Stripe live key"],
  ["anthropic-key", "HIGH", /\bsk-ant-[A-Za-z0-9_-]{20,}\b/, "Anthropic API key"],
  ["openai-key", "HIGH", /\bsk-(proj-)?[A-Za-z0-9_-]{32,}\b/, "OpenAI-style API key"],
  ["google-api-key", "HIGH", /\bAIza[0-9A-Za-z_-]{35}\b/, "Google API key"],
  ["slack-token", "HIGH", /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/, "Slack token"],
  ["npm-token", "HIGH", /\bnpm_[A-Za-z0-9]{36}\b/, "npm access token"],
  ["supabase-service-key", "HIGH", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, "JSON web token (possibly a Supabase service key)"],
  [
    "secret-assignment",
    "HIGH",
    // Upper-case names only (env-style), and the value must look like a token: no spaces or code punctuation,
    // and mixed letters with a digit. This keeps prose and source code from matching.
    /\b([A-Z0-9_]*(SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY|CLIENT_?SECRET)[A-Z0-9_]*)\s*[:=]\s*["']?([A-Za-z0-9_\-+/=.]{8,})(?![A-Za-z0-9_\-+/=.])/,
    "secret value assigned to a credential-named variable",
  ],
];

// Values that are obviously placeholders, not secrets.
const PLACEHOLDER = /EXAMPLE|XXXX|x{6,}|\*{4,}|<[^>]+>|\$\{|%[A-Z_]+%|your[_-]?(key|token|secret)|changeme|placeholder|dummy|redacted/i;

// Files that must never be committed, whatever they contain.
export const FORBIDDEN_NAME = /(^|\/)(\.env(\.[^/]+)?|[^/]+\.(pem|key|p12|pfx|keystore|jks))$/i;
const FORBIDDEN_FILE = FORBIDDEN_NAME;
export const FILE_OK = /\.env\.(example|sample|template|dist|defaults?)$/i;

// ---------- private terms ----------
export function loadPrivateTerms() {
  const candidates = [process.env.KIT_PRIVATE_TERMS, join(homedir(), ".claude", "plugins", "data", "starter-kit", "private-terms.txt")].filter(Boolean);
  for (const f of candidates) {
    if (existsSync(f)) {
      return readFileSync(f, "utf8")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"));
    }
  }
  return [];
}

// ---------- scanning ----------
const redact = (v) => (v.length <= 8 ? "****" : `${v.slice(0, 4)}…${v.slice(-2)} (${v.length} chars)`);

export function scanText(file, text, terms = []) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const [id, sev, re, desc] of RULES) {
      const m = re.exec(line);
      if (!m) continue;
      const value = m[3] ?? m[0];
      if (id === "secret-assignment" && (PLACEHOLDER.test(value) || !/\d/.test(value) || !/[A-Za-z]/.test(value))) continue;
      if (id !== "secret-assignment" && PLACEHOLDER.test(m[0])) continue;
      findings.push({ sev, file, line: i + 1, rule: id, message: desc, sample: redact(value) });
    }
    for (const t of terms) {
      if (t.length >= 3 && line.toLowerCase().includes(t.toLowerCase())) {
        findings.push({ sev: "HIGH", file, line: i + 1, rule: "private-term", message: "contains a term from your private list", sample: "(hidden)" });
        break; // one finding per line is enough; never echo the term
      }
    }
  });
  return findings;
}

export function scanFiles(paths, terms = []) {
  const findings = [];
  for (const p of paths) {
    const name = p.replace(/\\/g, "/");
    if (FORBIDDEN_FILE.test(name) && !FILE_OK.test(name)) {
      findings.push({ sev: "HIGH", file: name, line: 0, rule: "forbidden-file", message: "file type that must not be committed (env file or key)", sample: "" });
      continue;
    }
    try {
      if (statSync(p).size > 2_000_000) continue;
      const buf = readFileSync(p);
      if (buf.includes(0)) continue; // binary
      findings.push(...scanText(name, buf.toString("utf8"), terms));
    } catch {
      /* unreadable: skip */
    }
  }
  return findings;
}

// Diff text for what a commit would add, grouped by file so each finding names its file.
export function scanDiff(diff, terms = []) {
  const findings = [];
  let file = "";
  let newLine = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++ ")) {
      file = raw.slice(4).replace(/^b\//, "").trim();
      continue;
    }
    const hunk = /^@@ -\d+(,\d+)? \+(\d+)/.exec(raw);
    if (hunk) {
      newLine = Number(hunk[2]) - 1;
      continue;
    }
    if (raw.startsWith("+") && !raw.startsWith("+++")) {
      newLine++;
      const text = raw.slice(1);
      findings.push(...scanText(file || "(unknown)", text, terms).map((f) => ({ ...f, line: newLine })));
    } else if (!raw.startsWith("-") && !raw.startsWith("\\")) {
      newLine++;
    }
  }
  // Forbidden file names added by the diff.
  const names = [...diff.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1]);
  for (const n of names) {
    if (FORBIDDEN_FILE.test(n) && !FILE_OK.test(n) && !findings.some((f) => f.file === n && f.rule === "forbidden-file")) {
      findings.push({ sev: "HIGH", file: n, line: 0, rule: "forbidden-file", message: "file type that must not be committed (env file or key)", sample: "" });
    }
  }
  return dedupe(findings);
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((f) => {
    const k = `${f.file}:${f.line}:${f.rule}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function git(args, cwd) {
  return spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

// ---------- CLI ----------
function cli(argv) {
  const cwd = process.cwd();
  const terms = loadPrivateTerms();
  let findings = [];
  if (argv[0] === "--staged") {
    findings = scanDiff(git(["diff", "--cached", "--no-color", "-U0"], cwd).stdout ?? "", terms);
  } else if (argv[0] === "--range" && argv[1]) {
    findings = scanDiff(git(["diff", "--no-color", "-U0", argv[1]], cwd).stdout ?? "", terms);
    const names = (git(["diff", "--name-only", argv[1]], cwd).stdout ?? "").split("\n").filter(Boolean);
    for (const n of names) if (FORBIDDEN_FILE.test(n) && !FILE_OK.test(n)) findings.push({ sev: "HIGH", file: n, line: 0, rule: "forbidden-file", message: "file type that must not be committed (env file or key)", sample: "" });
  } else if (argv[0] === "--files" && argv.length > 1) {
    findings = scanFiles(argv.slice(1), terms);
  } else {
    console.error("usage: secret-scan.mjs --staged | --range <base>..HEAD | --files <path...>");
    return 2;
  }
  if (!findings.length) {
    console.log("secret-scan: clean");
    return 0;
  }
  console.log(`secret-scan: ${findings.length} finding(s)`);
  for (const f of findings) console.log(`${f.sev} ${f.file}${f.line ? ":" + f.line : ""} [${f.rule}] ${f.message}${f.sample ? " | " + f.sample : ""}`);
  return 1;
}

if (process.argv[1] && basename(process.argv[1]) === "secret-scan.mjs") {
  process.exit(cli(process.argv.slice(2)));
}
