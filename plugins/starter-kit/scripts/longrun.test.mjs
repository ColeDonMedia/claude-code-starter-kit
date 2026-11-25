// Long builds: drift check, record compaction, checkpoints, stall detection, and a simulated 50-session project.
// Run: node --test plugins/starter-kit/scripts/longrun.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checkDrift, decisionConflicts, mapPaths } from "./drift-check.mjs";
import { compact } from "./compact-records.mjs";
import { checkpointStatus, recordCheckpoint } from "./checkpoint.mjs";
import { stallStatus } from "./flight-report.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SESSION = join(HERE, "..", "hooks", "session-start.mjs");

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "longrun-"));
  const git = (...a) => {
    const r = spawnSync("git", ["-C", dir, ...a], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr);
    return r.stdout.trim();
  };
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  git("config", "commit.gpgsign", "false");
  const put = (p, s) => {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), s);
  };
  const commit = (msg) => {
    git("add", "-A");
    git("commit", "-q", "-m", msg);
    return git("rev-parse", "HEAD");
  };
  return { dir, git, put, commit, done: () => rmSync(dir, { recursive: true, force: true }) };
}
function sessionContext(dir) {
  const r = spawnSync(process.execPath, [SESSION], { input: JSON.stringify({ cwd: dir }), env: { ...process.env, CLAUDE_PROJECT_DIR: dir, STARTER_KIT_FLIGHT_DIR: join(dir, "..", "nolog-" + Date.now()) }, encoding: "utf8" });
  return JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
}

// ---- drift ----
test("drift: map paths that no longer exist are found", () => {
  const r = repo();
  try {
    r.put("src/app.js", "x");
    r.put("PROJECT.md", "# P\n## Map\n- `src/app.js` — the app\n- src/old/ — removed folder\n- docs: notes\n## Next\n");
    assert.deepEqual(mapPaths(readFileSync(join(r.dir, "PROJECT.md"), "utf8")), ["src/app.js", "src/old/"]);
    const p = checkDrift(r.dir);
    assert.ok(p.some((x) => /src\/old\//.test(x)));
    assert.ok(!p.some((x) => /src\/app\.js/.test(x)));
  } finally {
    r.done();
  }
});

test("drift: a handoff that stops before the latest code commits is found; docs-only commits don't count", () => {
  const r = repo();
  try {
    r.put("a.js", "1");
    const first = r.commit("one");
    r.put("HANDOFF.md", `Covers-through: ${first}\n`);
    r.commit("docs");
    assert.deepEqual(checkDrift(r.dir), []);
    r.put("a.js", "2");
    r.commit("code");
    assert.ok(checkDrift(r.dir).some((x) => /stops 1 code commit/.test(x)));
    r.put("HANDOFF.md", "Covers-through: deadbeefdeadbeef\n");
    assert.ok(checkDrift(r.dir).some((x) => /not in this repository/.test(x)));
  } finally {
    r.done();
  }
});

test("drift: a later decision that picks what an earlier one rejected is flagged, unless it says it replaces it", () => {
  const d = "# D\n- 2026-01-01 — use SQLite, because simple; rejected: Postgres\n- 2026-02-01 — use Postgres for search, because speed\n";
  assert.equal(decisionConflicts(d).length, 1);
  assert.equal(decisionConflicts(d.replace("because speed", "because speed; replaces the January decision")).length, 0);
  assert.equal(decisionConflicts("- use React; rejected: Vue\n- use Tailwind, because fast\n").length, 0);
});

test("drift: oversized records are reported", () => {
  const r = repo();
  try {
    r.put("DECISIONS.md", "- d\n".repeat(120));
    assert.ok(checkDrift(r.dir).some((x) => /DECISIONS\.md is \d+ lines/.test(x)));
  } finally {
    r.done();
  }
});

// ---- compaction ----
test("compaction moves older decisions word for word and loses nothing; running it twice changes nothing", () => {
  const r = repo();
  try {
    const all = Array.from({ length: 100 }, (_, i) => `- 2026-01-01 — decision ${i}, because reason ${i}`);
    r.put("DECISIONS.md", "# Decisions\n\n" + all.join("\n") + "\n");
    const res = compact(r.dir, { keepDecisions: 40 });
    assert.match(res.did[0], /moved 60/);
    const kept = readFileSync(join(r.dir, "DECISIONS.md"), "utf8");
    const arch = readFileSync(join(r.dir, "DECISIONS-ARCHIVE.md"), "utf8");
    for (const l of all) assert.ok(kept.includes(l + "\n") || arch.includes(l + "\n"), `lost: ${l}`);
    assert.ok(kept.includes("decision 99") && !kept.includes("decision 59,"));
    assert.match(kept, /DECISIONS-ARCHIVE\.md/);
    compact(r.dir, { keepDecisions: 40 });
    assert.equal(readFileSync(join(r.dir, "DECISIONS.md"), "utf8"), kept);
    assert.equal(readFileSync(join(r.dir, "DECISIONS-ARCHIVE.md"), "utf8"), arch);
  } finally {
    r.done();
  }
});

test("compaction keeps the newest releases and archives the rest, newest first, across several runs", () => {
  const r = repo();
  try {
    const rel = (n) => `## [1.${n}.0]\n- change ${n}\n`;
    r.put("CHANGELOG.md", "# Changelog\n\nintro\n\n" + Array.from({ length: 20 }, (_, i) => rel(19 - i)).join("\n"));
    compact(r.dir, { keepReleases: 15 });
    let log = readFileSync(join(r.dir, "CHANGELOG.md"), "utf8");
    assert.ok(log.includes("[1.19.0]") && log.includes("[1.5.0]") && !log.includes("[1.4.0]"));
    assert.match(log, /^# Changelog/);
    // more releases later: the pointer must not travel into the archive
    writeFileSync(join(r.dir, "CHANGELOG.md"), log.replace("intro\n\n", "intro\n\n" + rel(21) + "\n" + rel(20) + "\n"));
    compact(r.dir, { keepReleases: 15 });
    log = readFileSync(join(r.dir, "CHANGELOG.md"), "utf8");
    const arch = readFileSync(join(r.dir, "CHANGELOG-ARCHIVE.md"), "utf8");
    for (let n = 0; n <= 21; n++) assert.ok(log.includes(`[1.${n}.0]`) !== arch.includes(`[1.${n}.0]`), `release 1.${n}.0 must be in exactly one file`);
    assert.ok(arch.indexOf("[1.6.0]") < arch.indexOf("[1.0.0]"), "archive is newest first");
    assert.ok(!arch.includes("Older releases: see"), "the pointer leaked into the archive");
    assert.equal(log.match(/Older releases: see/g).length, 1);
  } finally {
    r.done();
  }
});

test("compaction asks for a rewrite of an oversized handoff instead of cutting it", () => {
  const r = repo();
  try {
    r.put("HANDOFF.md", "line\n".repeat(90));
    const res = compact(r.dir);
    assert.ok(res.todo.some((x) => /HANDOFF\.md is \d+ lines/.test(x)));
    assert.equal(readFileSync(join(r.dir, "HANDOFF.md"), "utf8"), "line\n".repeat(90));
  } finally {
    r.done();
  }
});

// ---- checkpoints ----
test("checkpoints fall due every 3 merged features and reset when recorded", () => {
  const r = repo();
  try {
    const rm = (n) => "# Roadmap\n" + Array.from({ length: 6 }, (_, i) => `- [${i < n ? "x" : " "}] F${i}\n  - [ ] crit\n`).join("");
    r.put("ROADMAP.md", rm(2));
    assert.equal(checkpointStatus(r.dir).due, false);
    r.put("ROADMAP.md", rm(3));
    assert.equal(checkpointStatus(r.dir).due, true);
    recordCheckpoint(r.dir, "2026-01-01");
    assert.equal(checkpointStatus(r.dir).due, false);
    const t = readFileSync(join(r.dir, "ROADMAP.md"), "utf8").replace("- [ ] F3", "- [x] F3").replace("- [ ] F4", "- [x] F4");
    writeFileSync(join(r.dir, "ROADMAP.md"), t);
    assert.equal(checkpointStatus(r.dir).since, 2);
    writeFileSync(join(r.dir, "ROADMAP.md"), t.replace("- [ ] F5", "- [x] F5"));
    assert.equal(checkpointStatus(r.dir).due, true);
  } finally {
    r.done();
  }
});

// ---- stalls ----
test("stalls: the same next item for 3 sessions, or a builder relaunched 4 times, is a stall", () => {
  const s = (sid, item) => ({ ev: "start", sid, item, t: "x" });
  assert.equal(stallStatus([s("a", "i1"), s("b", "i1"), s("c", "i1")]).stalled, true);
  assert.equal(stallStatus([s("a", "i1"), s("b", "i2"), s("c", "i2")]).stalled, false);
  assert.equal(stallStatus([s("a", "i1"), s("b", "i1")]).stalled, false);
  const builds = Array.from({ length: 4 }, (_, i) => ({ ev: "try", tool: "Agent", agent: "starter-kit:implementer", sid: "c", id: String(i) }));
  assert.match(stallStatus([s("c", "x"), ...builds]).msgs[0], /launched 4 times/);
});

// ---- the whole thing over 50 sessions ----
test("a simulated 50-session build: records stay small, nothing is lost, checkpoints come on time, drift is caught", () => {
  const r = repo();
  try {
    r.put("package.json", "{}");
    r.put("CLAUDE.md", "<!-- starter-kit:managed -->\n");
    r.put("src/index.js", "// app\n");
    r.put("PROJECT.md", "# Project\n## Map\n- `src/index.js` — entry\n");
    r.put("DECISIONS.md", "# Decisions\n");
    r.put("CHANGELOG.md", "# Changelog\n\n");
    const features = 50;
    r.put("ROADMAP.md", "# Roadmap\n" + Array.from({ length: features }, (_, i) => `- [ ] Feature ${i}\n`).join(""));
    let code = r.commit("start");
    r.put("HANDOFF.md", `Covers-through: ${code}\n`);
    r.commit("docs");
    let checkpoints = 0;
    const maxContext = [];
    for (let i = 0; i < features; i++) {
      // one session = one feature: code commit, then the records
      r.put(`src/f${i}.js`, `// feature ${i}\n`);
      code = r.commit(`feature ${i}`);
      const rm = readFileSync(join(r.dir, "ROADMAP.md"), "utf8").replace(`- [ ] Feature ${i}\n`, `- [x] Feature ${i}\n`);
      writeFileSync(join(r.dir, "ROADMAP.md"), rm);
      appendFileSync(join(r.dir, "DECISIONS.md"), `- 2026-01-01 — decision ${i}, because reason ${i}\n`);
      const log = readFileSync(join(r.dir, "CHANGELOG.md"), "utf8").replace("# Changelog\n\n", `# Changelog\n\n## [0.${i}.0]\n- feature ${i} (${code.slice(0, 7)})\n\n`);
      writeFileSync(join(r.dir, "CHANGELOG.md"), log);
      appendFileSync(join(r.dir, "PROJECT.md"), `- \`src/f${i}.js\` — feature ${i}\n`.replace(/^/, ""));
      r.put("HANDOFF.md", `Covers-through: ${code}\nWorking on feature ${i + 1}\n`);
      if (checkpointStatus(r.dir).due) {
        assert.deepEqual(checkDrift(r.dir).filter((x) => !/lines \(limit/.test(x)), [], `drift at session ${i}`);
        compact(r.dir);
        recordCheckpoint(r.dir, "2026-01-01");
        checkpoints++;
      }
      r.commit(`docs ${i}`);
      maxContext.push(sessionContext(r.dir).length);
    }
    assert.equal(checkpoints, Math.floor(features / 3));
    // nothing lost
    const allDec = readFileSync(join(r.dir, "DECISIONS.md"), "utf8") + (existsSync(join(r.dir, "DECISIONS-ARCHIVE.md")) ? readFileSync(join(r.dir, "DECISIONS-ARCHIVE.md"), "utf8") : "");
    for (let i = 0; i < features; i++) assert.ok(allDec.includes(`decision ${i},`), `decision ${i} lost`);
    // the session note does not grow with the project's age
    assert.ok(Math.max(...maxContext) < 6000, `session note grew to ${Math.max(...maxContext)} characters`);
    assert.ok(maxContext[maxContext.length - 1] < maxContext[5] + 800, "session note keeps growing");
    // and drift is still caught at the end
    rmSync(join(r.dir, "src", "f3.js"));
    r.commit("remove f3 without updating the map");
    const ctx = sessionContext(r.dir);
    assert.match(ctx, /RECORDS DRIFT/);
    assert.match(ctx, /src\/f3\.js/);
  } finally {
    r.done();
  }
});
