// Rules for the dangerous-code warning (hooks/code-warn.mjs). Text matching on new code only; see that hook for why.
// Each rule: [id, pattern, what is risky, the usual safe form, optional file-name filter]. warnings() skips tests and docs.
export const RULES = [
  ["eval", /\beval\s*\(|\bnew\s+Function\s*\(|\bsetTimeout\s*\(\s*["'`]|\bsetInterval\s*\(\s*["'`]/, "runs a string as code", "parse the data instead (JSON.parse, a lookup table)", /\.(m?[jt]sx?|cjs|vue|svelte)$/],
  ["py-eval", /(^|[^.\w])(eval|exec)\s*\(/, "runs a string as Python code", "ast.literal_eval for data, or a lookup table", /\.py$/],
  ["html-inject", /dangerouslySetInnerHTML|\.(inner|outer)HTML\s*[+]?=|\binsertAdjacentHTML\s*\(|\bdocument\.write(ln)?\s*\(|\{@html\s|v-html\s*=/, "puts a string into the page as HTML (cross-site scripting if any part comes from a user)", "set textContent, or sanitise with a vetted library first", null],
  ["shell-exec", /\bchild_process\b[\s\S]{0,200}\bexec(Sync)?\s*\(|\bexecSync\s*\(\s*[`'"][^`'"]*\$\{|\bos\.system\s*\(|\bsubprocess\.[a-z_]+\([^)]*shell\s*=\s*True|\bos\.popen\s*\(|\bRuntime\.getRuntime\(\)\.exec/, "runs a shell command (command injection if any part comes from input)", "execFile/spawn with an argument list, or subprocess.run([...]) without shell=True", null],
  ["sql-concat", /\b(query|execute|exec|raw|prepare)\s*\(\s*(`[^`]*\b(select|insert|update|delete)\b[^`]*\$\{|["'][^"']*\b(select|insert|update|delete)\b[^"']*["']\s*\+|f["'][^"']*\b(select|insert|update|delete)\b[^"']*\{)/i, "builds SQL from strings (SQL injection)", "parameterised queries (placeholders such as ? or $1) or the ORM's query builder", null],
  ["deserialize", /\bpickle\.loads?\s*\(|\byaml\.load\s*\((?![^)]*SafeLoader)|\bmarshal\.loads?\s*\(|\bunserialize\s*\(|\bObjectInputStream\b|\bBinaryFormatter\b/, "deserialises data in a way that can run code", "JSON, yaml.safe_load, or a schema-checked format", null],
  ["tls-off", /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0|verify\s*=\s*False|InsecureSkipVerify\s*:\s*true|CURLOPT_SSL_VERIFYPEER\s*,\s*(0|false)/i, "switches off certificate checks (anyone on the network can read or change the traffic)", "keep verification on; add the right certificate authority instead", null],
  ["weak-hash", /\bcreateHash\s*\(\s*['"](md5|sha1)['"]|\bhashlib\.(md5|sha1)\s*\(|\bMessageDigest\.getInstance\s*\(\s*"(MD5|SHA-?1)"/i, "uses MD5 or SHA-1 (broken for passwords and signatures)", "a password hash (Argon2id, bcrypt, scrypt) for passwords, SHA-256 or better otherwise", null],
  ["weak-random", /\bMath\.random\s*\(\)[\s\S]{0,80}\b(token|secret|password|session|nonce|otp|code|key)\b|\b(token|secret|password|session|nonce|otp|key)\w*\s*=\s*[^;\n]{0,40}\bMath\.random\s*\(/i, "uses Math.random for something secret (it can be predicted)", "crypto.randomBytes / crypto.randomUUID / secrets.token_urlsafe", null],
  ["cors-any", /Access-Control-Allow-Origin['"]?\s*[:,]\s*['"]\*['"][\s\S]{0,200}credentials|origin\s*:\s*(true|['"]\*['"])[\s\S]{0,120}credentials\s*:\s*true/i, "allows any website to call this with the user's cookies", "list the exact origins that may call it", null],
  ["ci-workflow", /[\s\S]/, "changes a CI workflow, which runs with the repository's credentials", "keep permissions read-only, pin actions, and never put ${{ github.event.* }} text straight into a run: line", /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/],
];

const TESTFILE = /(^|\/)(tests?|__tests__|spec|e2e|fixtures?)\/|\.(test|spec)\.[a-z]+$|_test\.(py|go)$/i;

export function warnings(file, text, extra = []) {
  const f = String(file).replace(/\\/g, "/");
  if (TESTFILE.test(f) || /\.(md|txt|lock|svg|snap)$/i.test(f)) return [];
  const out = [];
  for (const [id, re, why, fix, only] of RULES) {
    if (only && !only.test(f)) continue;
    if (id === "ci-workflow" ? only.test(f) : re.test(text)) out.push({ id, why, fix });
  }
  for (const r of extra) {
    try {
      if (r?.paths && !new RegExp(r.paths).test(f)) continue;
      if (r?.regex && new RegExp(r.regex).test(text)) out.push({ id: String(r.id ?? "project-rule"), why: String(r.why ?? "matches a rule in .claude/security-patterns.json"), fix: r.fix ? String(r.fix) : "" });
    } catch {
      /* a broken project rule is skipped */
    }
  }
  return out;
}
