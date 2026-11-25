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
  ["gitlab-token", "HIGH", /\bglpat-[A-Za-z0-9_-]{20,}\b/, "GitLab access token"],
  ["sendgrid-key", "HIGH", /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/, "SendGrid API key"],
  ["twilio-key", "HIGH", /\b(AC|SK)[0-9a-f]{32}\b/, "Twilio account or API key id"],
  ["discord-token", "HIGH", /\b[MN][A-Za-z0-9_-]{22,}\.[A-Za-z0-9_-]{5,8}\.[A-Za-z0-9_-]{25,}\b/, "Discord bot token"],
  ["telegram-token", "HIGH", /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/, "Telegram bot token"],
  ["slack-webhook", "HIGH", /hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/, "Slack webhook URL"],
  ["azure-storage-key", "HIGH", /AccountKey=[A-Za-z0-9+/]{40,}={0,2}/, "Azure storage account key"],
  ["huggingface-token", "HIGH", /\bhf_[A-Za-z0-9]{30,}\b/, "Hugging Face token"],
  ["digitalocean-token", "HIGH", /\bdop_v1_[a-f0-9]{40,}\b/, "DigitalOcean token"],
  ["shopify-token", "HIGH", /\bshp(at|ca|pa|ss)_[a-f0-9]{32}\b/, "Shopify access token"],
  [
    // user:password@host in any URL (database connection strings, git remotes with a token)
    "credentialed-url",
    "HIGH",
    /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/'"`]+:([^\s@/'"`]{4,})@[^\s/'"`]+/i,
    "URL with a password or token embedded in it",
    (m) => m[1],
  ],
  [
    "bearer-token",
    "HIGH",
    /\bBearer\s+([A-Za-z0-9_\-.=+/]{20,})(?![A-Za-z0-9_\-.=+/])/,
    "bearer token in an authorization header",
    (m) => m[1],
  ],
  [
    "secret-assignment",
    "HIGH",
    // Upper-case env-style names; the value must look like a token: no spaces or code punctuation, with letters AND a
    // digit. This keeps prose and source code from matching. Any NAME_KEY counts (STRIPE_KEY, SIGNING_KEY ...).
    /\b([A-Z0-9_]*(SECRET|TOKEN|PASSWORD|PASSWD|PWD|API_?KEY|[A-Z0-9]+_KEY|PRIVATE_?KEY|ACCESS_?KEY|CLIENT_?SECRET|CREDENTIAL|AUTH_?KEY)[A-Z0-9_]*)\s*[:=]\s*["']?([A-Za-z0-9_\-+/=.]{8,})(?![A-Za-z0-9_\-+/=.])/,
    "secret value assigned to a credential-named variable",
    (m) => m[3],
  ],
  [
    "credential-literal",
    "HIGH",
    // The same idea for names written the way code and config files write them: apiKey, secret_key, "password": ...
    // A quoted value (10+ characters) or a long unquoted token-like value, with letters AND a digit.
    /\b([A-Za-z0-9_]*(?:secret|token|passw(?:or)?d|pwd|api[_-]?key|apikey|private[_-]?key|access[_-]?key|client[_-]?secret|auth[_-]?key|credential)[A-Za-z0-9_]*)["']?\s*[:=]\s*(?:"([^"\s]{10,})"|'([^'\s]{10,})'|([A-Za-z0-9_\-+/=.]{16,})(?![A-Za-z0-9_\-+/=.]))/i,
    "secret-looking value assigned to a credential-named variable",
    (m) => m[2] ?? m[3] ?? m[4],
  ],
];

// Rules whose match is a guess from a variable NAME: they get the strictest false-alarm filtering.
const NAME_BASED = new Set(["secret-assignment", "credential-literal", "bearer-token"]);
// Passwords that are obviously just examples when they appear in a connection string.
const DUMMY_PASSWORDS = /^(password|passwd|pass|secret|test|testing|admin|root|user|username|12345\d*|1234|qwerty|changeme|example|postgres|mysql|redis|guest|none|null|undefined)$/i;

// Values that are obviously placeholders, not secrets.
const PLACEHOLDER = /EXAMPLE|XXXX|x{6,}|\*{4,}|<[^>]+>|\$\{|%[A-Z_]+%|\{\{|your[_-]?(key|token|secret|password)|changeme|placeholder|dummy|redacted|process\.env|os\.environ|getenv/i;

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
    for (const [id, sev, re, desc, pick] of RULES) {
      const m = re.exec(line);
      if (!m) continue;
      const value = (pick ? pick(m) : m[0]) ?? m[0];
      if (NAME_BASED.has(id) && (PLACEHOLDER.test(value) || !/\d/.test(value) || !/[A-Za-z]/.test(value))) continue;
      if (id === "credentialed-url" && (PLACEHOLDER.test(value) || DUMMY_PASSWORDS.test(value))) continue; // judge the password, not the host name
      if (!NAME_BASED.has(id) && id !== "credentialed-url" && PLACEHOLDER.test(m[0])) continue;
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
