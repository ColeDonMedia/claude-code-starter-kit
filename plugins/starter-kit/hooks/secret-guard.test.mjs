// Tests for secret-scan.mjs and secret-guard.mjs. Run: node --test plugins/starter-kit/hooks/secret-guard.test.mjs
// Fake secrets are assembled from pieces at runtime so this file never contains a real-looking key.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { hookPath } from "../scripts/test-via-gate.mjs";
import { scanText, scanDiff, scanFiles } from "../scripts/secret-scan.mjs";
import { trustEntries, entriesOf } from "../scripts/trust-lib.mjs";

// Project switches count only once approved on this computer, so give these tests their own approval store.
const TRUST_DATA = realpathSync(mkdtempSync(join(tmpdir(), "secret-trust-")));
process.env.KIT_DATA_DIR = TRUST_DATA;
test.after(() => rmSync(TRUST_DATA, { recursive: true, force: true }));

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD = hookPath(HERE, "secret-guard.mjs");
const SCAN = join(HERE, "..", "scripts", "secret-scan.mjs");

const FAKE = {
  aws: "AKIA" + "IOSFODNN7ZQ4XB2K",
  github: "gh" + "p_" + "9f8Qe3Kd7Lp2Mz6Rt1Wv4Bn8Hc5Jy0Ua3Xs7Gq2",
  anthropic: "sk-" + "ant-" + "api03q7Bx2Lm9Rt4Wz8Nk5Vh1Gc6Ys3Pd0Ef",
  pem: "-----BEGIN " + "RSA PRIVATE KEY-----",
  assign: "API_KEY" + "=" + "q8Zk2Lp9Wm4Rt7Xv1Nb",
};

function repo() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "secret-")));
  const g = (...a) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...a], { cwd: dir, encoding: "utf8" });
  const put = (rel, content) => {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  };
  g("init", "-q", "-b", "main");
  put("README.md", "hello\n");
  g("add", "-A");
  g("commit", "-q", "-m", "init");
  return { dir, put, g, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function guard(command, dir, env = {}) {
  const r = spawnSync("node", [GUARD], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, KIT_PRIVATE_TERMS: "", ...env },
  });
  assert.equal(r.status, 0, r.stderr);
  if (!r.stdout) return { decision: "allow", reason: "" };
  const o = JSON.parse(r.stdout).hookSpecificOutput;
  return { decision: o.permissionDecision, reason: o.permissionDecisionReason };
}

// ---------- the scanner ----------
test("finds each kind of credential", () => {
  for (const v of [FAKE.aws, FAKE.github, FAKE.anthropic, FAKE.pem, FAKE.assign]) {
    assert.ok(scanText("a.ts", `const x = "${v}";`).length >= 1, `missed: ${v.slice(0, 12)}…`);
  }
});

test("never echoes the full secret", () => {
  const f = scanText("a.ts", `const k = "${FAKE.anthropic}";`);
  assert.ok(f.length >= 1);
  for (const x of f) assert.ok(!x.sample.includes(FAKE.anthropic), "full secret leaked into a finding");
});

test("does not mistake code or prose that mentions secrets for an assigned value", () => {
  assert.equal(scanText("a.js", "const token = getToken();\n").length, 0);
  assert.equal(scanText("a.js", "  secret: string,\n").length, 0);
  assert.equal(scanText("a.md", "Set the TOKEN: see the docs for details.\n").length, 0);
  assert.equal(scanText("a.js", 'if (line.includes("API_KEY=")) return;\n').length, 0);
  assert.equal(scanText("a.js", "const TOKEN_LIMIT = 10;\n").length, 0);
});

test("ignores obvious placeholders and the AWS documentation example", () => {
  assert.equal(scanText("a.env.example", "API_KEY=your-key-here-12345\n").length, 0);
  assert.equal(scanText("a.md", "AWS_ACCESS_KEY_ID = AKIAIOSFODNN7EXAMPLE\n").length, 0);
  assert.equal(scanText("a.md", "API_KEY=<paste-your-key-here>\n").length, 0);
  assert.equal(scanText("a.md", "SECRET=${SECRET_FROM_ENV}\n").length, 0);
});

test("flags forbidden files: .env, keys and certificates, but not .env.example", () => {
  const f = scanFiles(["/nope/.env", "/nope/.env.local", "/nope/server.pem", "/nope/.env.example"]);
  // paths that don't exist are skipped by the content scan, so test the name rule through the diff path
  const d = scanDiff("+++ b/config/.env.production\n@@ -0,0 +1 @@\n+X=1\n");
  assert.ok(d.some((x) => x.rule === "forbidden-file"));
  assert.ok(!scanDiff("+++ b/.env.example\n@@ -0,0 +1 @@\n+X=1\n").some((x) => x.rule === "forbidden-file"));
  assert.equal(Array.isArray(f), true);
});

test("uses the private-terms list without ever printing the term", () => {
  const f = scanText("notes.md", "Written by Jane Example at her desk\n", ["Jane Example"]);
  assert.equal(f.length, 1);
  assert.equal(f[0].rule, "private-term");
  assert.ok(!JSON.stringify(f).includes("Jane Example"));
});

test("reports the right line numbers in a diff", () => {
  const diff = "+++ b/src/a.js\n@@ -1,2 +1,3 @@\n const a = 1;\n+const k = \"" + FAKE.github + "\";\n const b = 2;\n";
  const f = scanDiff(diff);
  assert.equal(f.length, 1);
  assert.equal(f[0].file, "src/a.js");
  assert.equal(f[0].line, 2);
});

test("the plugin's own source is clean", () => {
  const r = spawnSync("node", [SCAN, "--files", join(HERE, "..", "hooks", "safety-guard.mjs"), join(HERE, "..", "hooks", "verify-gate.mjs"), join(HERE, "..", "hooks", "session-start.mjs"), join(HERE, "..", "hooks", "auto-update.mjs"), join(HERE, "..", "commands", "init.md"), join(HERE, "..", "..", "..", "README.md")], { encoding: "utf8", env: { ...process.env, KIT_PRIVATE_TERMS: "" } });
  assert.equal(r.status, 0, r.stdout);
});

// ---------- the hook, against real git repos ----------
test("blocks a commit that stages a secret", () => {
  const r = repo();
  try {
    r.put("config.js", `module.exports = { key: "${FAKE.anthropic}" };\n`);
    r.g("add", "config.js");
    const d = guard('git commit -m "add config"', r.dir);
    assert.equal(d.decision, "deny");
    assert.match(d.reason, /config\.js:1/);
    assert.ok(!d.reason.includes(FAKE.anthropic), "secret must not appear in the reason");
  } finally {
    r.cleanup();
  }
});

test("a blocked billing key comes with where to put it, so billing keeps working; a publishable key is not blocked", () => {
  const r = repo();
  try {
    const live = ["sk", "live", "k8Zq2LmP9wXr4TvN1b7Yc3Hs"].join("_");
    r.put("billing.js", `const stripe = require("stripe")("${live}");\n`);
    r.g("add", "billing.js");
    const d = guard('git commit -m "billing"', r.dir);
    assert.equal(d.decision, "deny");
    assert.match(d.reason, /public or a private repository/);
    assert.match(d.reason, /process\.env/);
    assert.match(d.reason, /hosting service's secret or environment settings/);
    assert.match(d.reason, /Only the publishable key \(pk_\)/);
    assert.ok(!d.reason.includes(live), "the key itself is never repeated");
    r.g("reset", "-q");
    const pub = ["pk", "live", "k8Zq2LmP9wXr4TvN1b7Yc3Hs"].join("_");
    r.put("billing.js", `export const STRIPE_PUBLISHABLE_KEY = "${pub}";\n`);
    r.g("add", "billing.js");
    assert.equal(guard('git commit -m "billing"', r.dir).decision, "allow", "publishable keys are meant for front-end code");
  } finally {
    r.cleanup();
  }
});

test("allows a clean commit", () => {
  const r = repo();
  try {
    r.put("app.js", "console.log('hi');\n");
    r.g("add", "app.js");
    assert.equal(guard('git commit -m "clean"', r.dir).decision, "allow");
  } finally {
    r.cleanup();
  }
});

test("blocks staging an env file, and blocks the commit if one is already staged", () => {
  const r = repo();
  try {
    r.put(".env", "DATABASE_URL=postgres://x\n");
    assert.equal(guard("git add .env", r.dir).decision, "deny");
    assert.equal(guard("git add -A", r.dir).decision, "deny", "a broad add would take .env too");
    r.g("add", "-f", ".env");
    assert.equal(guard('git commit -m "oops"', r.dir).decision, "deny");
  } finally {
    r.cleanup();
  }
});

test("blocks a push whose unpushed commit contains a secret, even if removed later", () => {
  const r = repo();
  try {
    r.put("keys.js", `const k = "${FAKE.github}";\n`);
    r.g("add", "keys.js");
    r.g("commit", "-q", "-m", "add key");
    r.put("keys.js", "const k = process.env.KEY;\n");
    r.g("add", "keys.js");
    r.g("commit", "-q", "-m", "remove key");
    // no remote configured: falls back to the first commit, so the leaked history is seen
    const d = guard("git push origin main", r.dir);
    assert.equal(d.decision, "deny", "a secret in history is still a leak");
  } finally {
    r.cleanup();
  }
});

test("blocks a PR or gist that would publish a secret; allows a clean one", () => {
  const r = repo();
  try {
    r.put("creds.txt", `token=${FAKE.aws}\n`);
    r.g("add", "creds.txt");
    r.g("commit", "-q", "-m", "creds");
    assert.equal(guard("gh pr create --fill", r.dir).decision, "deny");
  } finally {
    r.cleanup();
  }
  const c = repo();
  try {
    assert.equal(guard("gh pr create --fill", c.dir).decision, "allow");
  } finally {
    c.cleanup();
  }
});

test("ignores unrelated commands and text that only mentions git", () => {
  const r = repo();
  try {
    r.put("config.js", `const k = "${FAKE.anthropic}";\n`);
    r.g("add", "config.js");
    for (const c of ["git status", "git diff", 'echo "git commit later"', "npm test"]) {
      assert.equal(guard(c, r.dir).decision, "allow", c);
    }
  } finally {
    r.cleanup();
  }
});

test("off switches: secretGuard false and auto false", () => {
  const r = repo();
  try {
    r.put("config.js", `const k = "${FAKE.anthropic}";\n`);
    r.g("add", "config.js");
    mkdirSync(join(r.dir, ".claude"), { recursive: true });
    for (const cfg of [{ secretGuard: false }, { auto: false }]) {
      writeFileSync(join(r.dir, ".claude", "kit.json"), JSON.stringify(cfg));
      assert.equal(guard('git commit -m "x"', r.dir).decision, "deny", "a switch the user has not approved must be ignored");
      trustEntries(r.dir, entriesOf(cfg));
      assert.equal(guard('git commit -m "x"', r.dir).decision, "allow", "an approved switch is honoured");
    }
  } finally {
    r.cleanup();
  }
});

test("a private term in the commit is blocked when the list is set", () => {
  const r = repo();
  try {
    const list = join(r.dir, "private.txt");
    writeFileSync(list, "# my details\nJane Example\n");
    r.put("notes.md", "Prepared by Jane Example\n");
    r.g("add", "notes.md");
    const d = guard('git commit -m "notes"', r.dir, { KIT_PRIVATE_TERMS: list });
    assert.equal(d.decision, "deny");
    assert.ok(!d.reason.includes("Jane Example"), "the private term itself must not be echoed");
  } finally {
    r.cleanup();
  }
});

test("bad input and non-git folders never block", () => {
  assert.equal(spawnSync("node", [GUARD], { input: "garbage", encoding: "utf8" }).status, 0);
  const plain = realpathSync(mkdtempSync(join(tmpdir(), "nogit-")));
  try {
    assert.equal(guard("git commit -m x", plain).decision, "allow");
  } finally {
    rmSync(plain, { recursive: true, force: true });
  }
});
