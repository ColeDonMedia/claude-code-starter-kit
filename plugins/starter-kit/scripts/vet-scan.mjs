// Static scanner for third-party Claude Code skills, plugins and MCP servers.
//   node vet-scan.mjs <folder> [--json]
// It only READS files. It never executes anything in the folder.
// It finds KNOWN-BAD PATTERNS; it cannot prove a skill is safe (prompt injection is semantic,
// so a human or Claude must still read the files). Exit code: 0 = no HIGH findings, 1 = HIGH found.
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node vet-scan.mjs <folder> [--json]");
  process.exit(64);
}
const asJson = process.argv.includes("--json");
const SKIP_DIRS = new Set([".git", "node_modules"]);
const MAX_FILES = 3000;
const MAX_BYTES = 1_000_000;

const findings = [];
const add = (sev, file, line, rule, message, snippet = "") =>
  findings.push({ sev, file, line, rule, message, snippet: snippet.trim().slice(0, 140) });

// ---- line-level rules ----
const LINE_RULES = [
  ["HIGH", "pipe-to-shell", /(curl|wget|iwr|Invoke-WebRequest)[^\n|]*\|\s*(sudo\s+)?((ba|z|da)?sh|iex|Invoke-Expression)\b/i, "downloads and runs code in one step"],
  ["HIGH", "encoded-command", /powershell[^\n]*\s-(enc|encodedcommand)\b|base64\s+(-d|--decode)[^\n]*\|\s*(ba)?sh/i, "runs an encoded/hidden command"],
  ["HIGH", "decode-and-run", /(eval|exec|Function)\s*\(\s*(atob|Buffer\.from|base64\.b64decode|bytes\.fromhex|String\.fromCharCode)/i, "decodes data then runs it"],
  ["HIGH", "exfil-endpoint", /discord(app)?\.com\/api\/webhooks|api\.telegram\.org\/bot|webhook\.site|requestbin|pipedream\.net|ngrok(-free)?\.(io|app|dev)|pastebin\.com\/raw|transfer\.sh|interact\.sh|oast\.(pro|live|site|online|fun|me)/i, "sends or fetches data via a throwaway/exfiltration endpoint"],
  ["HIGH", "inject-ignore", /(ignore|disregard|forget)\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above|earlier|system)\s+(instructions|prompts?|rules)/i, "prompt-injection phrase: tells the AI to drop its instructions"],
  ["HIGH", "inject-hide", /(do not|don't|never)\s+(tell|inform|mention|show|reveal)[^.\n]{0,40}\buser\b|without\s+(telling|informing|notifying|asking)\s+(the\s+)?user/i, "prompt-injection phrase: hides actions from the user"],
  ["HIGH", "inject-covert", /(silently|secretly|covertly)\s+(run|execute|send|upload|install|download|post)/i, "instructs covert actions"],
  ["HIGH", "inject-jailbreak", /you\s+are\s+now\s+(in\s+)?(dan|developer mode|god ?mode|jailbroken)|(disable|bypass|turn off)\s+(the\s+)?(safety|permission|sandbox|guardrail|approval)/i, "tries to switch off safeguards"],
  ["HIGH", "skip-permissions", /--dangerously-skip-permissions|bypassPermissions/, "bypasses the permission system"],
  ["MEDIUM", "runs-commands", /\b(child_process|execSync|spawnSync|spawn\(|\bexec\(|os\.system|subprocess\.|Popen|shell_exec|Runtime\.getRuntime)/, "can run shell commands"],
  ["MEDIUM", "network", /\b(fetch\(|axios|requests\.(get|post|put)|urllib|http\.request|https\.request|XMLHttpRequest|Invoke-WebRequest)|\b(curl|wget)\s+\S*https?:/i, "makes network requests"],
  ["MEDIUM", "reads-env-secrets", /process\.env\.[A-Z_]*(KEY|TOKEN|SECRET|PASSWORD)|os\.environ(\[|\.get\()\s*['"][A-Z_]*(KEY|TOKEN|SECRET|PASSWORD)/, "reads secrets from environment variables"],
  ["MEDIUM", "decodes-data", /\batob\(|b64decode\(|Buffer\.from\([^)]*['"]base64['"]/i, "decodes base64 data"],
  ["MEDIUM", "destructive", /\brm\s+-r?f?r?\s+(\/|~|\$HOME)|\bsudo\b|chmod\s+(\+x|777)|\bmkfs\b|\bdd\s+if=|Remove-Item[^\n]*-Recurse[^\n]*-Force/i, "destructive or privileged command"],
  ["MEDIUM", "broad-tools", /allowed-tools:.*\bBash(\(\*\))?\s*($|,|\])/i, "asks for unrestricted shell access"],
];

// ---- secret access (MEDIUM alone, HIGH together with network) ----
const SECRET_PATH = /(~|\$HOME|%USERPROFILE%|homedir\(\))[\\/]*\.(ssh|aws|gnupg|kube|docker|npmrc|netrc)|\bid_rsa\b|\bid_ed25519\b|credentials\.json|Login Data|wallet\.dat|\.claude[\\/]+\.credentials/i;
const NETWORK = /fetch\(|axios|requests\.|urllib|http\.request|https\.request|XMLHttpRequest|\bcurl\b|\bwget\b|Invoke-WebRequest|WebSocket|net\.connect/i;

function scanText(rel, text) {
  const ext = extname(rel).toLowerCase();
  const lines = text.split(/\r?\n/);
  const codeLike = [".js", ".mjs", ".cjs", ".ts", ".py", ".sh", ".ps1", ".bat", ".cmd", ".rb", ".go", ".json", ".yml", ".yaml", ".md", ".txt", ""].includes(ext) || true;
  for (let i = 0; i < lines.length && codeLike; i++) {
    const line = lines[i];
    if (line.length > 3000) add("MEDIUM", rel, i + 1, "very-long-line", "extremely long line (minified or hidden payload?)", line.slice(0, 80));
    for (const [sev, rule, re, msg] of LINE_RULES) if (re.test(line)) add(sev, rel, i + 1, rule, msg, line);
    if (/[A-Za-z0-9+/]{200,}={0,2}/.test(line) && !/^\s*(data:image|https?:)/.test(line)) add("MEDIUM", rel, i + 1, "base64-blob", "long base64-looking blob", line.slice(0, 80));
    if (/(?:[0-9a-fA-F]{2}){100,}/.test(line)) add("MEDIUM", rel, i + 1, "hex-blob", "long hex-looking blob", line.slice(0, 80));
  }
  // hidden characters
  const body = text.replace(/^﻿/, "");
  if (/[‪-‮⁦-⁩]/.test(body)) add("HIGH", rel, 0, "hidden-bidi", "contains hidden text-direction characters (can disguise code or instructions)");
  if (/[\u{e0000}-\u{e007f}]/u.test(body)) add("HIGH", rel, 0, "hidden-tag-chars", "contains invisible Unicode 'tag' characters (a known way to hide AI instructions)");
  if (/[​-‏⁠-⁤]/.test(body)) add("MEDIUM", rel, 0, "zero-width", "contains zero-width characters");
  // HTML comments carrying instructions (invisible when the markdown is rendered)
  if (ext === ".md") {
    for (const m of body.matchAll(/<!--([\s\S]*?)-->/g)) {
      if (/ignore|instruction|execute|run |send |curl|assistant|claude|secret|upload/i.test(m[1]) && m[1].length > 40)
        add("MEDIUM", rel, body.slice(0, m.index).split("\n").length, "hidden-comment", "HTML comment with instruction-like text (invisible when rendered)", m[1].replace(/\s+/g, " "));
    }
  }
  // secret access combined with network use in one file
  const secret = text.match(SECRET_PATH);
  if (secret) {
    const sev = NETWORK.test(text) ? "HIGH" : "MEDIUM";
    add(sev, rel, 0, "secret-access", sev === "HIGH" ? "reads credential locations AND makes network requests (possible theft)" : "mentions credential locations", secret[0]);
  }
}

function scanSpecial(rel, text) {
  const name = basename(rel).toLowerCase();
  let json = null;
  if (name.endsWith(".json")) {
    try {
      json = JSON.parse(text);
    } catch {
      /* not valid json */
    }
  }
  if (name === "hooks.json" || json?.hooks) {
    const cmds = [];
    const walk = (o) => {
      if (o && typeof o === "object") {
        if (typeof o.command === "string") cmds.push(o.command);
        Object.values(o).forEach(walk);
      }
    };
    walk(json?.hooks ?? json);
    add("MEDIUM", rel, 0, "defines-hooks", `defines hooks that run automatically: ${cmds.join(" ; ") || "(none parsed)"}`);
  }
  if (name === "package.json" && json?.scripts) {
    for (const k of ["preinstall", "install", "postinstall", "prepare"]) if (json.scripts[k]) add("HIGH", rel, 0, "install-script", `runs automatically on install (${k}): ${json.scripts[k]}`);
  }
  if (name === ".mcp.json" || json?.mcpServers) {
    const parts = Object.entries(json?.mcpServers ?? {}).map(([n, s]) => `${n}: ${s.command ? s.command + " " + (s.args ?? []).join(" ") : s.url ?? "?"}`);
    add("MEDIUM", rel, 0, "defines-mcp", `defines MCP servers (programs or remote services Claude would talk to): ${parts.join(" ; ")}`);
  }
  if (name === ".gitmodules") add("MEDIUM", rel, 0, "submodules", "pulls in other repositories (not scanned)");
  if (name === "setup.py") add("MEDIUM", rel, 0, "setup-py", "setup.py runs code at install time");
}

const BAD_BINARY = new Set([".exe", ".dll", ".so", ".dylib", ".node", ".bin", ".wasm", ".jar", ".msi", ".scr", ".pyc", ".class"]);
const SCRIPT_EXT = new Set([".sh", ".bash", ".ps1", ".bat", ".cmd", ".py", ".js", ".mjs", ".cjs", ".rb", ".pl"]);
let fileCount = 0;
const scripts = [];

function walkDir(abs) {
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (fileCount >= MAX_FILES) return;
    const full = join(abs, entry.name);
    const rel = relative(dir, full).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walkDir(full);
      continue;
    }
    fileCount++;
    const st = lstatSync(full);
    if (st.isSymbolicLink()) {
      add("HIGH", rel, 0, "symlink", "symbolic link (may point outside the folder)");
      continue;
    }
    const ext = extname(entry.name).toLowerCase();
    if (ext === ".pth") add("HIGH", rel, 0, "pth-file", ".pth files run code every time Python starts");
    if (BAD_BINARY.has(ext)) {
      add("HIGH", rel, 0, "binary", `compiled/binary file (${ext}) — cannot be read or audited`);
      continue;
    }
    if (SCRIPT_EXT.has(ext)) scripts.push(rel);
    if (st.size > MAX_BYTES) {
      add("MEDIUM", rel, 0, "too-large", "file too large to scan");
      continue;
    }
    let buf;
    try {
      buf = readFileSync(full);
    } catch {
      continue;
    }
    if (buf.includes(0)) {
      add("MEDIUM", rel, 0, "binary-data", "binary content that was not scanned");
      continue;
    }
    const text = buf.toString("utf8");
    scanText(rel, text);
    scanSpecial(rel, text);
  }
}

walkDir(dir);
if (fileCount >= MAX_FILES) add("MEDIUM", "", 0, "file-limit", `stopped after ${MAX_FILES} files`);

const order = { HIGH: 0, MEDIUM: 1, INFO: 2 };
findings.sort((a, b) => order[a.sev] - order[b.sev] || a.file.localeCompare(b.file) || a.line - b.line);
const counts = { HIGH: 0, MEDIUM: 0 };
findings.forEach((f) => (counts[f.sev] = (counts[f.sev] ?? 0) + 1));

if (asJson) {
  console.log(JSON.stringify({ filesScanned: fileCount, counts, scripts, findings }, null, 2));
} else {
  console.log(`Scanned ${fileCount} files. HIGH: ${counts.HIGH}  MEDIUM: ${counts.MEDIUM}`);
  if (scripts.length) console.log(`Script files to read in full: ${scripts.join(", ")}`);
  for (const f of findings) console.log(`${f.sev.padEnd(6)} ${f.file}${f.line ? ":" + f.line : ""}  [${f.rule}] ${f.message}${f.snippet ? "  | " + f.snippet : ""}`);
  console.log("\nThis scan finds known-bad patterns only. No findings does NOT mean safe: read the files too.");
}
process.exit(counts.HIGH ? 1 : 0);
