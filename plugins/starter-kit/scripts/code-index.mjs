// Code index for big codebases: which files exist, what each defines (functions, classes, types) and which files import
// which. With it Claude can find where something lives, see what a change could break (everything that depends on the changed
// files), and run only the tests that matter, instead of reading or testing a whole codebase it cannot hold in its head.
// It is built from plain-text patterns per language (no parsers or downloads), so it is fast and dependency-free but not
// perfect: dynamic imports, reflection, generated code and some aliasing are missed. Treat "no dependents" as "none found".
// Updates are incremental: unchanged files (same size and modification time) are not re-read.
// The index is stored in the user's own folder, outside the project, so it never ends up in git.
// Run: node code-index.mjs --project <dir> [--build] [--find <name>] [--impact <file>...] [--hubs] [--areas] [--stats] [--json]
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SKIP_DIRS = new Set(["node_modules", ".git", ".venv", "venv", "env", "dist", "build", "target", "__pycache__", ".next", ".nuxt", "coverage", "vendor", "bower_components", ".gradle", ".idea", ".vs", "bin", "obj", ".tox", ".mypy_cache", ".pytest_cache", ".turbo", ".cache"]);
const MAX_FILE = 1_000_000;

const LANG = {
  ".js": "js", ".jsx": "js", ".mjs": "js", ".cjs": "js", ".ts": "js", ".tsx": "js", ".mts": "js", ".cts": "js", ".vue": "js", ".svelte": "js",
  ".py": "py", ".go": "go", ".rs": "rs", ".java": "java", ".kt": "java", ".kts": "java", ".scala": "java",
  ".rb": "rb", ".php": "php", ".cs": "cs", ".c": "c", ".h": "c", ".cc": "c", ".cpp": "c", ".hpp": "c", ".cxx": "c", ".swift": "swift", ".dart": "dart",
};

// Symbol patterns: [regex with the name in group 1, kind]. Line-anchored and linear, so they cannot hang on odd input.
const SYMBOLS = {
  js: [
    [/^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/, "function"],
    [/^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, "class"],
    [/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/, "function"],
    [/^\s*(?:export\s+)?(?:declare\s+)?(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/, "type"],
    [/^\s*export\s+const\s+([A-Za-z_$][\w$]*)/, "const"],
  ],
  py: [
    [/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/, "function"],
    [/^\s*class\s+([A-Za-z_]\w*)/, "class"],
  ],
  go: [
    [/^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/, "function"],
    [/^type\s+([A-Za-z_]\w*)/, "type"],
  ],
  rs: [
    [/^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+([A-Za-z_]\w*)/, "function"],
    [/^\s*(?:pub(?:\([^)]*\))?\s+)?(?:struct|enum|trait|type|union)\s+([A-Za-z_]\w*)/, "type"],
  ],
  java: [
    [/^\s*(?:(?:public|private|protected|internal|abstract|final|static|sealed|open|data|inner)\s+)*(?:class|interface|enum|object|record)\s+([A-Za-z_]\w*)/, "class"],
    [/^\s*(?:(?:public|private|protected|static|final|abstract|synchronized|override|suspend)\s+)+(?:<[^>]*>\s*)?[\w<>\[\],.? ]+\s+([a-z_]\w*)\s*\(/, "function"],
    [/^\s*(?:(?:private|public|internal|override|suspend)\s+)*fun\s+(?:<[^>]*>\s*)?(?:[\w.]+\.)?([A-Za-z_]\w*)/, "function"],
  ],
  rb: [
    [/^\s*def\s+(?:self\.)?([A-Za-z_]\w*[?!=]?)/, "function"],
    [/^\s*(?:class|module)\s+([A-Z]\w*)/, "class"],
  ],
  php: [
    [/^\s*(?:(?:public|private|protected|static|abstract|final)\s+)*function\s+&?\s*([A-Za-z_]\w*)/, "function"],
    [/^\s*(?:(?:abstract|final|readonly)\s+)*(?:class|interface|trait|enum)\s+([A-Za-z_]\w*)/, "class"],
  ],
  cs: [
    [/^\s*(?:(?:public|private|protected|internal|static|abstract|sealed|partial|readonly)\s+)*(?:class|interface|struct|enum|record)\s+([A-Za-z_]\w*)/, "class"],
    [/^\s*(?:(?:public|private|protected|internal|static|virtual|override|async|abstract)\s+)+[\w<>\[\],.? ]+\s+([A-Z]\w*)\s*\(/, "function"],
  ],
  c: [
    [/^(?:static\s+|inline\s+|extern\s+)*[A-Za-z_][\w\s\*]*?\b([A-Za-z_]\w*)\s*\([^;]*$/, "function"],
    [/^\s*(?:typedef\s+)?(?:struct|class|enum|union)\s+([A-Za-z_]\w*)/, "type"],
  ],
  swift: [
    [/^\s*(?:(?:public|private|internal|fileprivate|open|static|final)\s+)*func\s+([A-Za-z_]\w*)/, "function"],
    [/^\s*(?:(?:public|private|internal|open|final)\s+)*(?:class|struct|enum|protocol|actor)\s+([A-Za-z_]\w*)/, "class"],
  ],
  dart: [
    [/^\s*(?:abstract\s+)?class\s+([A-Za-z_]\w*)/, "class"],
  ],
};

// Import patterns: the module specifier in group 1.
const IMPORTS = {
  js: [/\bimport\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g, /\bexport\s+[^'"]*?\sfrom\s+['"]([^'"]+)['"]/g, /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g, /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g],
  py: [/^\s*from\s+(\.*[\w.]*)\s+import\s+([\w*, ()]+)/gm, /^\s*import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/gm],
  go: [/^\s*import\s+(?:\w+\s+)?"([^"]+)"/gm, /^\s*(?:\w+\s+)?"([^"]+)"\s*$/gm],
  rs: [/^\s*(?:pub\s+)?mod\s+([A-Za-z_]\w*)\s*;/gm, /^\s*(?:pub\s+)?use\s+((?:crate|super|self)(?:::\w+)+)/gm],
  java: [/^\s*import\s+(?:static\s+)?([\w.]+)/gm],
  rb: [/^\s*require_relative\s+['"]([^'"]+)['"]/gm, /^\s*require\s+['"](\.[^'"]+)['"]/gm],
  php: [/^\s*use\s+([\w\\]+)/gm, /\b(?:require|include)(?:_once)?\s*\(?\s*(?:__DIR__\s*\.\s*)?['"]([^'"]+)['"]/g],
  cs: [],
  c: [/^\s*#\s*include\s+"([^"]+)"/gm],
  swift: [],
  dart: [/^\s*import\s+'([^']+)'/gm],
};

export const indexDir = () => process.env.STARTER_KIT_INDEX_DIR || join(homedir(), ".claude", "plugins", "data", "starter-kit", "index");
export const indexPath = (root) => join(indexDir(), createHash("sha1").update(resolve(root).toLowerCase()).digest("hex").slice(0, 12) + ".json");
const toPosix = (p) => p.split("\\").join("/");

export function listFiles(root) {
  const r = spawnSync("git", ["-C", root, "ls-files", "-co", "--exclude-standard", "-z"], { encoding: "utf8", maxBuffer: 1 << 28 });
  let files;
  if (r.status === 0) files = r.stdout.split("\0").filter(Boolean);
  else {
    files = [];
    const walk = (d) => {
      for (const e of readdirSync(join(root, d), { withFileTypes: true })) {
        if (e.isDirectory()) {
          if (!SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) walk(d ? `${d}/${e.name}` : e.name);
        } else if (e.isFile()) files.push(d ? `${d}/${e.name}` : e.name);
      }
    };
    walk("");
  }
  return files.map(toPosix).filter((f) => LANG[extname(f).toLowerCase()] && !f.split("/").some((p) => SKIP_DIRS.has(p)) && !/\.min\.js$|\.d\.ts$|\.generated\.|\.pb\.go$|_pb2\.py$/.test(f));
}

export function parseFile(text, lang) {
  const symbols = [];
  const pats = SYMBOLS[lang] ?? [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 400) continue;
    for (const [re, kind] of pats) {
      const m = re.exec(line);
      if (m && !/^(if|for|while|switch|return|catch|new|else|do|try|sizeof)$/.test(m[1])) {
        symbols.push([m[1], kind, i + 1]);
        break;
      }
    }
  }
  const specs = new Set();
  let scan = text;
  if (lang === "go") {
    // only look inside import blocks
    scan = [...text.matchAll(/^import\s*\(([\s\S]*?)^\)/gm)].map((m) => m[1]).join("\n") + "\n" + [...text.matchAll(/^import\s+(?:\w+\s+)?"[^"]+"/gm)].map((m) => m[0]).join("\n");
  }
  for (const re of IMPORTS[lang] ?? []) {
    for (const m of scan.matchAll(re)) {
      if (lang === "py" && m[2] !== undefined) {
        specs.add(m[1]);
        // "from pkg import mod" may import a submodule
        for (const n of m[2].replace(/[()]/g, "").split(",").map((s) => s.trim().split(/\s+/)[0]).filter((s) => s && s !== "*")) specs.add(`${m[1]}${m[1].endsWith(".") ? "" : "."}${n}`);
      } else if (lang === "py") for (const s of m[1].split(",")) specs.add(s.trim());
      else specs.add(m[1]);
    }
  }
  return { symbols, specs: [...specs].slice(0, 500) };
}

function makeResolver(root, fileSet) {
  const bySuffix = new Map(); // "b/C.java" -> path, for Java/Kotlin/PHP style lookups
  for (const f of fileSet) {
    const noExt = f.replace(/\.[^./]+$/, "");
    const parts = noExt.split("/");
    for (let k = 1; k <= Math.min(parts.length, 6); k++) {
      const key = parts.slice(-k).join("/");
      if (!bySuffix.has(key)) bySuffix.set(key, f);
      else if (bySuffix.get(key) !== f) bySuffix.set(key, null); // ambiguous
    }
  }
  let goModule = null;
  try {
    goModule = /^module\s+(\S+)/m.exec(readFileSync(join(root, "go.mod"), "utf8"))?.[1] ?? null;
  } catch {}
  const goDirs = new Map();
  for (const f of fileSet) if (f.endsWith(".go") && !f.endsWith("_test.go")) {
    const d = posix.dirname(f);
    if (!goDirs.has(d)) goDirs.set(d, []);
    goDirs.get(d).push(f);
  }
  let alias = {};
  for (const cfg of ["tsconfig.json", "jsconfig.json"]) {
    try {
      const j = JSON.parse(readFileSync(join(root, cfg), "utf8").replace(/^\s*\/\/.*$/gm, ""));
      const base = j.compilerOptions?.baseUrl ?? ".";
      for (const [k, v] of Object.entries(j.compilerOptions?.paths ?? {})) alias[k.replace(/\*$/, "")] = posix.join(base, String(v[0]).replace(/\*$/, ""));
    } catch {}
  }
  if (!Object.keys(alias).length) alias = { "@/": "src/", "~/": "src/" };
  const JS_EXT = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".vue", ".svelte", "/index.ts", "/index.tsx", "/index.js", "/index.jsx", "/index.mjs"];
  const tryFiles = (base, exts) => {
    for (const e of exts) {
      const p = posix.normalize(base + e);
      if (fileSet.has(p)) return p;
    }
    return null;
  };
  const pyRoots = ["", "src/", "lib/", "app/"];

  return (from, lang, spec) => {
    const dir = posix.dirname(from);
    if (lang === "js") {
      if (spec.startsWith(".")) {
        const base = posix.join(dir, spec);
        return [tryFiles(base, JS_EXT) ?? tryFiles(base.replace(/\.js$/, ""), JS_EXT)].filter(Boolean);
      }
      for (const [k, v] of Object.entries(alias)) if (spec.startsWith(k)) return [tryFiles(posix.join(v, spec.slice(k.length)), JS_EXT)].filter(Boolean);
      return [];
    }
    if (lang === "py") {
      let mod = spec;
      let bases = pyRoots;
      if (spec.startsWith(".")) {
        const dots = spec.match(/^\.+/)[0].length;
        let d = dir;
        for (let i = 1; i < dots; i++) d = posix.dirname(d);
        mod = spec.slice(dots);
        bases = [d === "." ? "" : d + "/"];
      }
      const path = mod.split(".").filter(Boolean).join("/");
      for (const b of bases) {
        const hit = tryFiles(b + path, [".py", "/__init__.py"]);
        if (hit) return [hit];
      }
      return [];
    }
    if (lang === "go") {
      if (goModule && (spec === goModule || spec.startsWith(goModule + "/"))) return goDirs.get(spec.slice(goModule.length + 1) || ".") ?? [];
      return [];
    }
    if (lang === "rs") {
      if (/^[A-Za-z_]\w*$/.test(spec)) {
        const base = /(?:^|\/)(?:main|lib|mod)\.rs$/.test(from) ? dir : posix.join(dir, posix.basename(from, ".rs"));
        return [tryFiles(posix.join(base, spec), [".rs", "/mod.rs"])].filter(Boolean);
      }
      const segs = spec.split("::");
      if (segs[0] === "crate") {
        const src = from.includes("src/") ? from.slice(0, from.indexOf("src/") + 4) : "";
        for (let k = segs.length; k > 1; k--) {
          const hit = tryFiles(src + segs.slice(1, k).join("/"), [".rs", "/mod.rs"]);
          if (hit) return [hit];
        }
      }
      return [];
    }
    if (lang === "c") return [tryFiles(posix.join(dir, spec), [""]) ?? tryFiles(spec, [""])].filter(Boolean);
    if (lang === "rb") return [tryFiles(posix.join(dir, spec), ["", ".rb"])].filter(Boolean);
    if (lang === "dart") return spec.startsWith("package:") ? [] : [tryFiles(posix.join(dir, spec), [""])].filter(Boolean);
    if (lang === "java" || lang === "php") {
      if (lang === "php" && /[/.]/.test(spec) && !spec.includes("\\")) return [tryFiles(posix.join(dir, spec), [""]) ?? tryFiles(spec.replace(/^\//, ""), [""])].filter(Boolean);
      const parts = spec.split(/[.\\]/).filter(Boolean);
      for (let k = Math.min(parts.length, 6); k >= 2; k--) {
        const hit = bySuffix.get(parts.slice(-k).join("/"));
        if (hit) return [hit];
      }
      return [];
    }
    return [];
  };
}

export function loadIndex(root) {
  try {
    return JSON.parse(readFileSync(indexPath(root), "utf8"));
  } catch {
    return null;
  }
}

export function buildIndex(root, { save = true } = {}) {
  root = resolve(root);
  const old = loadIndex(root)?.files ?? {};
  const list = listFiles(root);
  const fileSet = new Set(list);
  const files = {};
  let reread = 0;
  // In a git repository, a clean tracked file's content hash comes from git itself, which is far faster than asking the
  // file system about every file (on Windows that alone can take half a minute for 30,000 files). Only files git reports as
  // changed or untracked are looked at directly.
  const blobs = new Map();
  const ls = spawnSync("git", ["-C", root, "ls-files", "-s", "-z"], { encoding: "utf8", maxBuffer: 1 << 28 });
  if (ls.status === 0) {
    for (const rec of ls.stdout.split("\0")) {
      const m = /^\d+ ([0-9a-f]+) \d\t(.+)$/s.exec(rec);
      if (m) blobs.set(toPosix(m[2]), m[1]);
    }
    const st = spawnSync("git", ["-C", root, "status", "--porcelain", "-z", "--untracked-files=all"], { encoding: "utf8", maxBuffer: 1 << 28 });
    for (const rec of st.stdout?.split("\0") ?? []) if (rec.length > 3) blobs.delete(toPosix(rec.slice(3)));
  }
  for (const f of list) {
    let sig;
    if (blobs.has(f)) sig = "git:" + blobs.get(f);
    else {
      let st;
      try {
        st = statSync(join(root, f));
      } catch {
        continue;
      }
      if (st.size > MAX_FILE) continue;
      sig = `${st.size}-${Math.floor(st.mtimeMs)}`;
    }
    const lang = LANG[extname(f).toLowerCase()];
    if (old[f] && old[f].sig === sig) {
      files[f] = { ...old[f] };
      continue;
    }
    reread++;
    let text = "";
    try {
      text = readFileSync(join(root, f), "utf8");
    } catch {
      continue;
    }
    if (text.length > MAX_FILE) continue;
    const { symbols, specs } = parseFile(text, lang);
    files[f] = { sig, lang, lines: text.split("\n").length, symbols, specs };
  }
  // When files were added or removed, every import is resolved again (a new file can turn an unresolved import into a link,
  // a deleted one breaks links). Otherwise only the re-read files need resolving, and an unchanged tree is not even rewritten.
  const sameSet = Object.keys(old).length === Object.keys(files).length && Object.keys(files).every((f) => old[f]);
  let resolver = null;
  const resolveSpec = (...x) => (resolver ??= makeResolver(root, fileSet))(...x);
  for (const [f, e] of Object.entries(files)) {
    if (sameSet && old[f] && old[f].sig === e.sig && Array.isArray(old[f].deps)) continue;
    const deps = new Set();
    for (const s of e.specs) for (const hit of resolveSpec(f, e.lang, s)) if (hit !== f && files[hit]) deps.add(hit);
    e.deps = [...deps];
  }
  const index = { version: 1, root, built: new Date().toISOString(), files };
  if (save && !(sameSet && reread === 0)) {
    mkdirSync(indexDir(), { recursive: true });
    writeFileSync(indexPath(root), JSON.stringify(index));
  }
  return { index, reread, total: Object.keys(files).length };
}

export function dependents(index) {
  const rev = new Map();
  for (const [f, e] of Object.entries(index.files)) for (const d of e.deps ?? []) {
    if (!rev.has(d)) rev.set(d, new Set());
    rev.get(d).add(f);
  }
  return rev;
}

// Everything that depends on the given files, directly or through other files, up to `depth` steps.
export function impact(index, changed, depth = 3) {
  const rev = dependents(index);
  const seen = new Map();
  let frontier = changed.map(toPosix);
  for (let d = 1; d <= depth && frontier.length; d++) {
    const next = [];
    for (const f of frontier) for (const g of rev.get(f) ?? []) if (!seen.has(g) && !changed.includes(g)) {
      seen.set(g, d);
      next.push(g);
    }
    frontier = next;
  }
  return [...seen.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([file, distance]) => ({ file, distance }));
}

export function findSymbol(index, name, limit = 30) {
  const q = name.toLowerCase();
  const hits = [];
  for (const [f, e] of Object.entries(index.files)) for (const [n, kind, line] of e.symbols) {
    const l = n.toLowerCase();
    if (l === q || l.startsWith(q) || (q.length >= 4 && l.includes(q))) hits.push({ name: n, kind, file: f, line, exact: l === q });
  }
  return hits.sort((a, b) => b.exact - a.exact || a.name.length - b.name.length).slice(0, limit);
}

export function hubs(index, n = 15) {
  return [...dependents(index).entries()].map(([f, s]) => ({ file: f, dependents: s.size })).sort((a, b) => b.dependents - a.dependents).slice(0, n);
}

export function areas(index, depth = 1) {
  const out = new Map();
  for (const [f, e] of Object.entries(index.files)) {
    const parts = f.split("/");
    const area = parts.length > depth ? parts.slice(0, depth).join("/") + "/" : "(top level)";
    const a = out.get(area) ?? { area, files: 0, lines: 0, langs: new Set() };
    a.files++;
    a.lines += e.lines;
    a.langs.add(e.lang);
    out.set(area, a);
  }
  return [...out.values()].map((a) => ({ ...a, langs: [...a.langs] })).sort((a, b) => b.lines - a.lines);
}

export const isTestFile = (f) => /(^|\/)(tests?|__tests__|spec|specs|e2e)\//i.test(f) || /([._-](test|spec)|_test)\.[^.]+$/i.test(f) || /(^|\/)test_[^/]+\.py$/.test(f) || /Tests?\.(java|kt|cs)$/.test(f);

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  const get = (f) => (a.includes(f) ? a[a.indexOf(f) + 1] : undefined);
  const root = resolve(get("--project") ?? ".");
  const json = a.includes("--json");
  const t0 = Date.now();
  const { index, reread, total } = buildIndex(root);
  const out = (x, text) => console.log(json ? JSON.stringify(x, null, 1) : text);
  if (get("--find")) {
    const h = findSymbol(index, get("--find"));
    out(h, h.length ? h.map((x) => `${x.file}:${x.line}  ${x.kind} ${x.name}`).join("\n") : "Not found in the index.");
  } else if (a.includes("--impact")) {
    const files = a.slice(a.indexOf("--impact") + 1).filter((x) => !x.startsWith("--")).map((f) => toPosix(relative(root, resolve(root, f))));
    const unknown = files.filter((f) => !index.files[f]);
    const hits = impact(index, files);
    out({ files, unknown, dependents: hits }, (unknown.length ? `Not in the index (language not covered, or no such file): ${unknown.join(", ")}\n` : "") + (hits.length ? `${hits.length} file(s) depend on this:\n` + hits.map((h) => `  ${"  ".repeat(h.distance - 1)}${h.file}${isTestFile(h.file) ? "  (test)" : ""}`).join("\n") : "No dependents found (the index can miss dynamic imports)."));
  } else if (a.includes("--hubs")) {
    const h = hubs(index);
    out(h, h.map((x) => `${String(x.dependents).padStart(5)}  ${x.file}`).join("\n"));
  } else if (a.includes("--areas")) {
    const ar = areas(index, Number(get("--depth")) || 1);
    out(ar, ar.map((x) => `${x.area.padEnd(40)} ${String(x.files).padStart(6)} files ${String(x.lines).padStart(9)} lines  ${x.langs.join(",")}`).join("\n"));
  } else {
    const lines = Object.values(index.files).reduce((s, e) => s + e.lines, 0);
    const symbols = Object.values(index.files).reduce((s, e) => s + e.symbols.length, 0);
    const edges = Object.values(index.files).reduce((s, e) => s + e.deps.length, 0);
    out({ files: total, lines, symbols, edges, reread, ms: Date.now() - t0 }, `Indexed ${total} files (${lines} lines, ${symbols} symbols, ${edges} import links); re-read ${reread}; ${Date.now() - t0} ms.`);
  }
}
