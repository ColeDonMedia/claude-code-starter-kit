// API speed check: reads the source for the two mistakes behind most slow backends. (1) The "N+1" pattern: a database query or a
// network call inside a loop, so a list of 200 things costs 201 round trips instead of 2. (2) Unbounded lists: a query that returns
// every row (no limit or page), fine with 20 test rows and a timeout with 200,000. It matches patterns in JavaScript/TypeScript,
// Python and Ruby; it is a screen, not proof, so a clean result does not mean fast. The measured proof is a test that counts queries
// per request (see /starter-kit:feature) and the scale rehearsal (/starter-kit:db).
// A line marked `kit: accepted-perf` (with the reason) is reported as accepted. Run:
//   node api-check.mjs --project <dir> [--base <commit> | --files a b ...]     Exit 1 on a HIGH finding.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXT = { ".js": "js", ".jsx": "js", ".mjs": "js", ".cjs": "js", ".ts": "js", ".tsx": "js", ".py": "py", ".rb": "rb" };
const SKIP_PATH = /(^|\/)(node_modules|dist|build|\.next|vendor|migrations?|seeds?|fixtures?|e2e|scripts|tests?|__tests__|spec|specs|docs?)\//i;
const SKIP_FILE = /([._-](test|spec)|_test)\.[^.]+$|(^|\/)test_[^/]+\.py$|\.d\.ts$/i;
const ACCEPT = /kit:\s*accepted-perf/i;

const JS_LOOP = /\b(for\s*(await\s*)?\(|while\s*\()|\.(forEach|map|flatMap|filter|reduce|some|every)\s*\(/;
const JS_DATA = [
  [/\b(prisma|db|knex|sequelize|pool|client|conn|connection|supabase|mongoose|em|repo|repository|orm|database|collection|redis)\b[\w$.]*\.(find\w*|get\w*|select|query|execute|count|aggregate|raw|from|\$queryRaw|\$executeRaw|run|all|first|where|hget|hgetall|exists)\s*\(/, "a database query"],
  [/\b[A-Z]\w*\.(find\w*|findOne|findById|findByPk|count|aggregate|where|getMany|getOne)\s*\(/, "a database query"],
  [/\bawait\s+(knex|db|trx|sql)\s*(\(|`)/, "a database query"],
  [/\bawait\s+(fetch|axios(\.\w+)?|got|request|superagent)\s*\(|\bawait\s+\w+\.(get|post|put|patch|delete)\(\s*[`'"]https?:/, "a network request"],
];
const PY_LOOP = /^\s*for\s+.+:\s*(#.*)?$|\bfor\s+\w+(\s*,\s*\w+)*\s+in\s+.+\]/;
const PY_DATA = [
  [/\.objects\.(get|filter|exclude|all|first|last|count|exists|aggregate)\(|\bsession\.(query|execute|get)\(|\bcursor\.execute\(|\.query\.(get|filter\w*|all|first)\(|\bdb\.(execute|session\.execute)\(/, "a database query"],
  [/\brequests\.(get|post|put|patch|delete)\(|\bhttpx\.(get|post)\(|\burlopen\(/, "a network request"],
];
const RB_LOOP = /\.(each|map|flat_map|each_with_index|find_each|select|collect)\b/;
const RB_DATA = [
  [/\b[A-Z]\w*\.(find|find_by\w*|where|count|first|last|exists\?|pluck|sum)\b/, "a database query"],
  [/\bNet::HTTP\.|\bHTTParty\.|\bFaraday\./, "a network request"],
];

const strip = (l) => l.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""').replace(/\/\*.*?\*\//g, "").replace(/\/\/.*$/, "");

function accepted(lines, i) {
  return ACCEPT.test(lines[i] ?? "") || ACCEPT.test(lines[i - 1] ?? "");
}

function scanBraces(file, lines, LOOP, DATA) {
  const out = [];
  const code = lines.map(strip);
  let depth = 0;
  let inBlock = false;
  const regions = [];
  for (let i = 0; i < lines.length; i++) {
    let c = code[i];
    if (inBlock) {
      if (c.includes("*/")) {
        inBlock = false;
        c = c.slice(c.indexOf("*/") + 2);
      } else continue;
    }
    if (c.includes("/*") && !c.includes("*/")) {
      inBlock = true;
      c = c.slice(0, c.indexOf("/*"));
    }
    const start = depth;
    const lm = LOOP.exec(c);
    const active = regions.length > 0;
    if (active || lm) {
      const from = active ? 0 : lm.index + lm[0].length;
      const text = c.slice(from);
      for (const [re, what] of DATA) {
        if (re.test(text)) {
          out.push({ file, line: i + 1, kind: "n+1", level: accepted(lines, i) ? "ACCEPTED" : "HIGH", msg: `${what} inside a loop: a list of N items makes N round trips`, fix: what === "a network request" ? "fetch them together (Promise.all with a limit, or one batch endpoint)" : "load everything in one query before the loop (a WHERE id IN (...) / include / join / eager load) and look results up in memory" });
          break;
        }
      }
    }
    for (const ch of c) depth += ch === "{" ? 1 : ch === "}" ? -1 : 0;
    if (lm) {
      regions.push({ startDepth: start, line: i, braced: depth > start });
      if (depth <= start && /[;)]\s*$/.test(c.trim())) regions.pop(); // a one-line loop or callback
    }
    for (let r = regions.length - 1; r >= 0; r--) if (regions[r].line < i && depth <= regions[r].startDepth) regions.splice(r, 1);
    for (let r = regions.length - 1; r >= 0; r--) if (!regions[r].braced && regions[r].line < i) regions.splice(r, 1); // an unbraced loop covers one more line
  }
  return out;
}

function scanIndent(file, lines, LOOP, DATA) {
  const out = [];
  const indent = (l) => /^\s*/.exec(l)[0].replace(/\t/g, "    ").length;
  for (let i = 0; i < lines.length; i++) {
    if (!LOOP.test(lines[i]) || /^\s*#/.test(lines[i])) continue;
    const n = indent(lines[i]);
    // a one-line comprehension: the query sits before the `for`, so the whole line is the loop body
    const inline = /\bfor\b.*\bin\b.*\]/.test(lines[i]) && !/:\s*(#.*)?$/.test(lines[i]) ? [lines[i]] : [];
    const body = [...inline];
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j].trim()) continue;
      if (indent(lines[j]) <= n && !/^\s*(end|\}|\))\b/.test(lines[j])) break;
      body.push(lines[j]);
      if (/^\s*end\b/.test(lines[j]) && indent(lines[j]) <= n) break;
    }
    const sameLine = LOOP.exec(lines[i]);
    if (sameLine && sameLine.index + sameLine[0].length < lines[i].length) body.push(lines[i].slice(sameLine.index + sameLine[0].length));
    let hit = null;
    let at = i;
    body.forEach((b, k) => {
      if (hit) return;
      for (const [re, what] of DATA) if (re.test(b) && !/^\s*#/.test(b)) { hit = what; at = Math.min(lines.length - 1, i + 1 + k - inline.length); return; }
    });
    if (hit) out.push({ file, line: at + 1, kind: "n+1", level: accepted(lines, at) ? "ACCEPTED" : "HIGH", msg: `${hit} inside a loop: a list of N items makes N round trips`, fix: hit === "a network request" ? "fetch them together (concurrently with a limit, or one batch call)" : "load everything in one query first (select_related / prefetch_related / includes / a WHERE id IN (...)) and look results up in memory" });
  }
  return out;
}

const UNBOUNDED = {
  js: [
    [/\.findMany\(\s*\)/, "findMany() with no limit"],
    [/\.findAll\(\s*\)/, "findAll() with no limit"],
    [/\.find\(\s*(\{\s*\})?\s*\)(?![^\n]*\.(limit|first|findOne))/, "find() of every record"],
    [/\bSELECT\s+\*\s+FROM\s+[\w."`]+\s*(["'`;)]|$)(?![^\n]*\b(WHERE|LIMIT)\b)/i, "SELECT * with no WHERE or LIMIT"],
  ],
  py: [
    [/\.objects\.all\(\)(?!\s*[\[.](filter|count|exists|first|\w*paginat))(?![^\n]*\[:)/, "objects.all() with no slice or pagination"],
    [/\.query\.all\(\)/, "query.all() with no limit"],
    [/\bSELECT\s+\*\s+FROM\s+[\w."`]+\s*(["'`;)]|$)(?![^\n]*\b(WHERE|LIMIT)\b)/i, "SELECT * with no WHERE or LIMIT"],
  ],
  rb: [
    [/\b[A-Z]\w*\.all\b(?!\.(limit|page|paginate|count|where|find_each|in_batches))/, "Model.all with no limit or paging"],
  ],
};

function unbounded(file, lines, lang, flag) {
  const out = [];
  lines.forEach((l, i) => {
    if (/^\s*(#|\/\/|\/\*|\*)/.test(l)) return;
    for (const [re, what] of UNBOUNDED[lang]) {
      if (re.test(l) && !/\b(take|limit|per_page|page_size|LIMIT)\b/i.test(lines.slice(i, i + 4).join(" "))) {
        out.push({ file, line: i + 1, kind: "unbounded", level: accepted(lines, i) ? "ACCEPTED" : "MEDIUM", msg: `${what}: returns every row, which is fine with 20 test rows and slow or fatal with 200,000`, fix: "add a limit and a page (cursor or offset), and return a total or a next-page marker" });
        break;
      }
    }
  });
  return out;
}

export function scanSource(file, text) {
  const lang = EXT[extname(file).toLowerCase()];
  if (!lang) return [];
  const lines = text.replace(/\r/g, "").split("\n");
  const found = lang === "js" ? scanBraces(file, lines, JS_LOOP, JS_DATA) : lang === "py" ? scanIndent(file, lines, PY_LOOP, PY_DATA) : scanIndent(file, lines, RB_LOOP, RB_DATA);
  found.push(...unbounded(file, lines, lang));
  return found.sort((a, b) => a.line - b.line);
}

export function sourceFiles(root, { base, files } = {}) {
  let list;
  const git = (...a) => spawnSync("git", ["-C", root, ...a], { encoding: "utf8", maxBuffer: 1 << 28 });
  if (files?.length) list = files;
  else if (base) list = [...new Set([...(git("diff", "--name-only", `${base}...HEAD`).stdout ?? "").split("\n"), ...(git("diff", "--name-only", "HEAD").stdout ?? "").split("\n")])].filter(Boolean);
  else {
    const r = git("ls-files", "-co", "--exclude-standard", "-z");
    if (r.status === 0) list = r.stdout.split("\0").filter(Boolean);
    else {
      list = [];
      const walk = (d) => {
        for (const e of readdirSync(join(root, d), { withFileTypes: true })) {
          const p = d ? `${d}/${e.name}` : e.name;
          if (e.isDirectory()) {
            if (e.name !== "node_modules" && !e.name.startsWith(".")) walk(p);
          } else list.push(p);
        }
      };
      walk("");
    }
  }
  return list.map((f) => f.split("\\").join("/")).filter((f) => EXT[extname(f).toLowerCase()] && !SKIP_PATH.test(f) && !SKIP_FILE.test(f) && existsSync(join(root, f)));
}

export function checkApi(root, opts = {}) {
  const findings = [];
  for (const f of sourceFiles(root, opts)) findings.push(...scanSource(f, readFileSync(join(root, f), "utf8")));
  return findings;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  const get = (f) => (a.includes(f) ? a[a.indexOf(f) + 1] : undefined);
  const root = resolve(get("--project") ?? ".");
  const files = a.includes("--files") ? a.slice(a.indexOf("--files") + 1).filter((x) => !x.startsWith("--")) : null;
  const f = checkApi(root, { base: get("--base"), files });
  console.log(f.length ? f.map((x) => `${x.level.padEnd(8)} ${x.file}:${x.line}  ${x.msg}.\n         Fix: ${x.fix}.`).join("\n") : "No query-in-a-loop or unbounded-list patterns found (this is a screen, not proof of speed).");
  process.exitCode = f.some((x) => x.level === "HIGH") ? 1 : 0;
}
