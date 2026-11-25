// Tests for verify-gate.mjs. Run: node --test plugins/starter-kit/hooks/verify-gate.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { hookPath } from "../scripts/test-via-gate.mjs";
import { trustEntries, entriesOf } from "../scripts/trust-lib.mjs";

const GATE = hookPath(dirname(fileURLToPath(import.meta.url)), "verify-gate.mjs");
const PASS = 'node -e "process.exit(0)"';
const FAIL = 'node -e "console.log(String.fromCharCode(66,79,79,77));process.exit(1)"'; // prints BOOM

function project({ verify = [PASS], managed = true, extra = {} } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "verify-")));
  const put = (rel, content = "x") => {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  };
  const git = (...a) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...a], { cwd: dir, encoding: "utf8" });
  put("CLAUDE.md", managed ? "<!-- starter-kit:managed -->\n" : "# plain\n");
  put(".gitignore", ".claude/last-verified\n");
  put(".claude/kit.json", JSON.stringify({ verify, ...extra }));
  put("src/a.js", "export const a = 1;\n");
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
  return { dir, put, git, cleanup: () => { try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* a just-killed child may still hold it on Windows */ } } };
}
// The gate runs a project's commands only after the user approved them on this computer: give the tests their own store.
const DATA = realpathSync(mkdtempSync(join(tmpdir(), "verify-trust-")));
test.after(() => rmSync(DATA, { recursive: true, force: true }));
process.env.KIT_DATA_DIR = DATA;
const approve = (p) => {
  let cfg = {};
  try {
    cfg = JSON.parse(readFileSync(join(p.dir, ".claude", "kit.json"), "utf8"));
  } catch {
    /* none */
  }
  trustEntries(p.dir, entriesOf(cfg));
};
const stop = (p, payload = {}, env = {}, { trusted = true } = {}) => {
  if (trusted) approve(p);
  return spawnSync("node", [GATE], { input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: p.dir, KIT_DATA_DIR: DATA, ...env } });
};

test("SECURITY: unapproved project commands are never run; the user is asked once", () => {
  const p = project({ verify: ['node -e "require(\'fs\').writeFileSync(\'hostile-ran\',\'x\')"'] });
  try {
    const r = stop(p, {}, {}, { trusted: false });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /not approved/);
    assert.match(r.stderr, /trust\.mjs/);
    assert.equal(existsSync(join(p.dir, "hostile-ran")), false, "the command must not have run");
    assert.equal(stop(p, {}, {}, { trusted: false }).status, 0, "asks only once for the same state");
    assert.equal(existsSync(join(p.dir, "hostile-ran")), false);
  } finally {
    p.cleanup();
  }
});

test("approval is per exact command: editing it voids the approval", () => {
  const p = project({ verify: [PASS] });
  try {
    assert.equal(stop(p).status, 0); // approved and passes
    p.put(".claude/kit.json", JSON.stringify({ verify: [`${PASS} && echo changed`] }));
    const r = stop(p, {}, {}, { trusted: false });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /changed/);
  } finally {
    p.cleanup();
  }
});

test("passing checks let the turn end and record the state", () => {
  const p = project();
  try {
    const r = stop(p);
    assert.equal(r.status, 0);
    assert.equal(JSON.parse(readFileSync(join(p.dir, ".claude", "last-verified"), "utf8")).ok, true);
  } finally {
    p.cleanup();
  }
});

test("failing checks block the turn and show the output", () => {
  const p = project({ verify: [FAIL] });
  try {
    const r = stop(p);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /BOOM/);
    assert.match(r.stderr, /never weaken or delete a test/);
  } finally {
    p.cleanup();
  }
});

test("never blocks twice in one turn (stop_hook_active)", () => {
  const p = project({ verify: [FAIL] });
  try {
    assert.equal(stop(p, { stop_hook_active: true }).status, 0);
  } finally {
    p.cleanup();
  }
});

test("the same failing state is reported only once; a new change is checked again", () => {
  const p = project({ verify: [FAIL] });
  try {
    assert.equal(stop(p).status, 2);
    assert.equal(stop(p).status, 0, "unchanged code must not block again");
    p.put("src/a.js", "export const a = 2;\n");
    assert.equal(stop(p).status, 2, "changed code is checked again");
  } finally {
    p.cleanup();
  }
});

test("unchanged code after a pass is not re-run", () => {
  // The counter file lives outside the project, so running the check doesn't itself change the code state.
  const counter = join(realpathSync(mkdtempSync(join(tmpdir(), "verify-count-"))), "runs.log");
  const p = project({ verify: ['node -e "require(\'fs\').appendFileSync(process.env.RUNLOG,\'x\')"'] });
  try {
    const env = { RUNLOG: counter };
    stop(p, {}, env);
    stop(p, {}, env);
    stop(p, {}, env);
    assert.equal(readFileSync(counter, "utf8"), "x", "checks must run once, not on every turn");
    p.put("src/a.js", "export const a = 3;\n");
    stop(p, {}, env);
    assert.equal(readFileSync(counter, "utf8"), "xx", "a code change triggers one more run");
  } finally {
    p.cleanup();
    rmSync(dirname(counter), { recursive: true, force: true });
  }
});

test("a docs-only change is not verified", () => {
  const p = project({ verify: [PASS] });
  try {
    stop(p); // records the passing state
    p.put(".claude/kit.json", JSON.stringify({ verify: [FAIL] })); // would fail if it ran
    p.git("add", "-A");
    p.git("commit", "-q", "-m", "cfg");
    stop(p, {}, {}); // new HEAD: runs and fails once, recording the head
    p.put("README.md", "docs only\n");
    assert.equal(stop(p).status, 0);
  } finally {
    p.cleanup();
  }
});

test("stops at the first failing command", () => {
  const p = project({ verify: [FAIL, 'node -e "require(\'fs\').writeFileSync(\'second-ran\',\'x\')"'] });
  try {
    assert.equal(stop(p).status, 2);
    assert.equal(existsSync(join(p.dir, "second-ran")), false);
  } finally {
    p.cleanup();
  }
});

test("inactive when: not set up, no verify list, switched off, not a git repo, bad input", () => {
  for (const opts of [{ managed: false, verify: [FAIL] }, { verify: [] }, { verify: [FAIL], extra: { verifyGate: false } }, { verify: [FAIL], extra: { auto: false } }]) {
    const p = project(opts);
    try {
      assert.equal(stop(p).status, 0, JSON.stringify(opts));
    } finally {
      p.cleanup();
    }
  }
  const p = project({ verify: [FAIL] });
  try {
    rmSync(join(p.dir, ".git"), { recursive: true, force: true });
    assert.equal(stop(p).status, 0);
    assert.equal(spawnSync("node", [GATE], { input: "garbage", encoding: "utf8" }).status, 0);
  } finally {
    p.cleanup();
  }
});

test("a check that runs out of time is not treated as a failure", () => {
  const p = project({ verify: ['node -e "setTimeout(()=>{},20000)"'] });
  try {
    assert.equal(stop(p, {}, { KIT_VERIFY_BUDGET_MS: "1500" }).status, 0);
  } finally {
    p.cleanup();
  }
});

test("a missing tool is skipped, not reported as failing code", () => {
  const p = project({ verify: ["definitely-not-a-real-command-xyz --check"] });
  try {
    assert.equal(stop(p).status, 0);
  } finally {
    p.cleanup();
  }
});

test("SAFETY: checks never run while the project's settings point at a database that is not on this computer", () => {
  const RAN = 'node -e "require(\'fs\').writeFileSync(\'checks-ran\',\'x\')"';
  const p = project({ verify: [RAN] });
  try {
    p.put(".env", "DATABASE_URL=postgres://app:pw@db.prod.example.com:5432/app\n");
    p.put("src/a.js", "export const a = 2;\n");
    assert.equal(stop(p).status, 0);
    assert.equal(existsSync(join(p.dir, "checks-ran")), false, "tests must not run against a remote database");
    p.put(".env", "DATABASE_URL=postgres://app:pw@localhost:5432/app\n");
    p.put("src/a.js", "export const a = 3;\n");
    stop(p);
    assert.equal(existsSync(join(p.dir, "checks-ran")), true, "a local database is fine");
  } finally {
    p.cleanup();
  }
});
