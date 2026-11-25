// Shortens the output of noisy commands (test runs, installs, builds) to what Claude needs: the start, every failure with a little
// context, and the summary at the end. Every agent that runs the full test suite reads its output, several times per feature, so
// this is the kit's largest free saving. Nothing is lost: hooks/quiet-output.mjs saves the full output to a git-ignored log first.
// Used only by that hook; the command itself is never changed, so its exit code and the guards are untouched.
export const MAX_LINES = 120; // shorter output passes untouched
export const MAX_CHARS = 12_000;
export const HEAD = 15;
export const TAIL = 30; // test runners print their summary at the end
export const AROUND = 2; // lines kept either side of a failure line
export const MAX_HITS = 120;
const LINE_CAP = 500; // one enormous line (minified code, a data dump) is cut too

// Programs whose output is mostly noise when it is long. Never git (a reviewer needs the whole diff), never file viewers.
const NOISE = new Set(
  "npm pnpm yarn bun npx bunx pip pip3 pipx poetry uv pytest tox nox go cargo dotnet mvn mvnw gradle gradlew tsc eslint prettier biome vitest jest mocha playwright cypress bundle rspec rake rails composer phpunit make cmake ctest swift xcodebuild flutter dart mix deno turbo nx lerna".split(" "),
);
const NEVER = new Set("git gh cat type get-content gc head tail less more sed awk grep rg findstr select-string diff echo write-output".split(" "));
const FAIL = /\b(fail(s|ed|ure|ures|ing)?|errors?|panic(ked)?|traceback|exceptions?|assert(ion)?(error)?)\b|\bnot ok\b|[✗✖×]/i;
const PASS_LINE = /^\s*([✓✔√]|PASS\b|ok\b)/; // a passing test whose name happens to contain "error"

// The program each part of a command line starts (`cd app && npm test | tee x` → cd, npm, tee), lower-cased, without a path.
export function programs(command) {
  return String(command ?? "")
    .split(/&&|\|\||[;|\n]/)
    .map((seg) => seg.trim().replace(/^(\w+=\S*\s+)+/, "")) // leading VAR=value assignments
    .map((seg) => (seg.match(/^["']?([^\s"']+)/)?.[1] ?? "").split(/[\\/]/).pop().toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, ""))
    .filter(Boolean);
}

// The commands under CLAUDE.md's "Commands" heading, in backticks: the project's own test, build and lint commands.
export function projectCommands(claudeMd) {
  const m = /^##+\s+Commands[^\n]*\n([\s\S]*?)(?=^##+\s|(?![\s\S]))/im.exec(String(claudeMd ?? ""));
  return m ? [...m[1].matchAll(/`([^`\n]{2,200})`/g)].map((x) => x[1].trim()) : [];
}

// Is this command's long output noise worth shortening?
export function isNoisy(command, ownCommands = []) {
  const cmd = String(command ?? "").trim();
  if (!cmd || /starter-kit|CLAUDE_PLUGIN_ROOT/i.test(cmd)) return false; // the kit's own scripts print exactly what Claude needs
  const progs = programs(cmd);
  if (progs.some((p) => NEVER.has(p))) return false;
  if (progs.some((p) => NOISE.has(p))) return true;
  if (/\b(node|deno)\s+--test\b|\bpython3?\s+-m\s+(pytest|unittest)\b|\bpy\s+-m\s+pytest\b/i.test(cmd)) return true;
  return ownCommands.some((c) => c && cmd.startsWith(c));
}

const cap = (l) => (l.length > LINE_CAP ? l.slice(0, LINE_CAP) + ` […${l.length - LINE_CAP} more characters]` : l);

// Returns { text, total, kept, trimmed }. Short output comes back unchanged.
export function trimOutput(text) {
  const s = String(text ?? "");
  const lines = s.replace(/\r\n/g, "\n").split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  const total = lines.length;
  if (total <= MAX_LINES && s.length <= MAX_CHARS) return { text: s, total, kept: total, trimmed: false };
  const keep = new Set();
  for (let i = 0; i < Math.min(HEAD, total); i++) keep.add(i);
  for (let i = Math.max(0, total - TAIL); i < total; i++) keep.add(i);
  let hits = 0;
  for (let i = 0; i < total && hits < MAX_HITS; i++) {
    if (!FAIL.test(lines[i]) || PASS_LINE.test(lines[i])) continue;
    for (let j = Math.max(0, i - AROUND); j <= Math.min(total - 1, i + AROUND); j++) {
      if (!keep.has(j)) hits++;
      keep.add(j);
    }
  }
  const out = [];
  let last = -1;
  for (const i of [...keep].sort((a, b) => a - b)) {
    if (i > last + 1) out.push(`[… ${i - last - 1} line(s) left out …]`);
    out.push(cap(lines[i]));
    last = i;
  }
  return { text: out.join("\n"), total, kept: keep.size, trimmed: true };
}
