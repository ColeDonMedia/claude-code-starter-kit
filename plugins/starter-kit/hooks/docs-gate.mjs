// Stop hook: the project's memory documents must keep up with the code, and "done" must be provable.
//
// When Claude finishes a turn it checks two things, and blocks the turn once if either is off:
//   1. HANDOFF.md is current. Code commits made since HANDOFF.md's "Covers-through: <commit>" line mean the next
//      session (a different bot, or you, next week) would start with stale notes. Claude must update HANDOFF.md,
//      PROJECT.md (the master document) and CHANGELOG.md.
//   2. ROADMAP.md tells the truth: every ticked box names a real merge commit and real tests
//      (scripts/roadmap-check.mjs). A tick that isn't backed by git and the test files is an unproven claim.
//
// It reads only git history and files and runs no project commands. It speaks once per distinct problem and never
// loops (stop_hook_active, and a saved fingerprint). Switch off with { "docsGate": false } in .claude/kit.json.
// Does nothing in projects that aren't set up with the starter kit, or before any code has been committed.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkRoadmap } from "../scripts/roadmap-check.mjs";

const done = () => process.exit(0);
let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let input = {};
try {
  input = JSON.parse(raw);
} catch {
  done();
}
if (input.stop_hook_active) done();

const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
const read = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
};
if (!(read(join(root, "CLAUDE.md")) ?? "").includes("starter-kit:managed")) done();
let cfg = {};
try {
  cfg = JSON.parse(read(join(root, ".claude", "kit.json")) ?? "{}");
} catch {
  done();
}
if (cfg.auto === false || cfg.docsGate === false) done();

const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
if (git("rev-parse", "--is-inside-work-tree").status !== 0) done();

// The newest commit that changed anything other than notes, config and docs: the "real work" commit.
const NOT_CODE = [":(exclude)*.md", ":(exclude).claude", ":(exclude).github", ":(exclude).gitignore", ":(exclude)LICENSE", ":(exclude)package-lock.json", ":(exclude)yarn.lock", ":(exclude)pnpm-lock.yaml"];
const codeSha = git("log", "-1", "--format=%H", "--", ".", ...NOT_CODE).stdout.trim();

const problems = [];
let stale = false;
if (codeSha) {
  const handoff = read(join(root, "HANDOFF.md"));
  const m = handoff ? /Covers-through:\s*([0-9a-f]{7,40})/i.exec(handoff) : null;
  if (!handoff) {
    stale = true;
    problems.push("HANDOFF.md, PROJECT.md or CHANGELOG.md do not exist yet");
  } else if (!m || !codeSha.startsWith(m[1].toLowerCase())) {
    stale = true;
    problems.push(`HANDOFF.md is out of date: it covers ${m ? m[1].slice(0, 7) : "nothing"}, but the newest code commit is ${codeSha.slice(0, 7)}`);
  }
}
const road = checkRoadmap(root);
problems.push(...road.problems.map((p) => `ROADMAP.md: ${p}`));
if (!problems.length) done();

const fingerprint = createHash("sha256").update(codeSha).update(problems.join("\n")).digest("hex");
const stateFile = join(root, ".claude", "last-docs-check");
try {
  if (JSON.parse(read(stateFile) ?? "{}").fingerprint === fingerprint) done();
} catch {
  /* no state */
}
try {
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(stateFile, JSON.stringify({ fingerprint, when: new Date().toISOString() }));
} catch {
  /* best effort */
}

let msg = "The project's records are not up to date, so this turn is not finished:\n- " + problems.join("\n- ") + "\n\n";
if (stale) {
  msg +=
    `Do this now, yourself (it is a few minutes of writing and needs no decision from the user):\n` +
    `1. HANDOFF.md: rewrite it for the next session. Keep it under 25 lines: what was done, what is half-done, what to do first, ` +
    `open questions for the user, and anything that failed or was not verified. First line after the title must be exactly ` +
    `"Covers-through: ${codeSha}".\n` +
    `2. PROJECT.md (the master document): update what exists now, the architecture map, any decisions made and why, known problems, and next steps.\n` +
    `3. CHANGELOG.md: add an entry for the work since the last entry, in plain words, with the commit.\n` +
    `Then commit the documents. Write only what is true, from the git history and the code you can see; never describe work that was not done.\n`;
}
if (road.problems.length) {
  msg +=
    "ROADMAP.md: for each unproven claim either do the missing work or untick the box. Never tick a box without \"(merged <commit>)\" " +
    "and, per criterion, \"→ test: <file>::<test name>\" (or \"→ manual: <how it was checked>\" for what a test cannot show). " +
    `Run \`node "${fileURLToPath(new URL("../scripts/roadmap-check.mjs", import.meta.url))}" --project .\` to re-check.\n`;
}
process.stderr.write(msg);
process.exit(2);
