// Tests for package-guard, file-guard, the wider push/deploy gate, and approval handling in the secret guard.
// Run: node --test plugins/starter-kit/hooks/hardening.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseInstalls, assess } from "../scripts/pkg-check.mjs";
import { trustEntries, entriesOf } from "../scripts/trust-lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, "package-guard.mjs");
const FILE = join(HERE, "file-guard.mjs");
const GATE = join(HERE, "push-gate.mjs");
const SECRET = join(HERE, "secret-guard.mjs");

const DATA = realpathSync(mkdtempSync(join(tmpdir(), "hard-data-")));
process.env.KIT_DATA_DIR = DATA;
test.after(() => rmSync(DATA, { recursive: true, force: true }));

function tmp(prefix = "hard-") {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  return { dir, put: (rel, c) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); return p; }, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
const run = (script, payload, env = {}) => spawnSync("node", [script], { input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env, KIT_DATA_DIR: DATA, ...env } });
const decision = (r) => (r.stdout ? JSON.parse(r.stdout).hookSpecificOutput : { permissionDecision: "allow", permissionDecisionReason: "" });

// ---------- parsing install commands ----------
test("reads package names from npm, pip, uv, poetry and cargo commands", () => {
  const names = (c) => parseInstalls(c).flatMap((x) => x.names);
  assert.deepEqual(names("npm install express lodash@4.17.21"), ["express", "lodash"]);
  assert.deepEqual(names("npm i -D @types/node@20 typescript"), ["@types/node", "typescript"]);
  assert.deepEqual(names("pnpm add zod && yarn add left-pad"), ["zod", "left-pad"]);
  assert.deepEqual(names("pip install requests==2.31.0 'flask[async]>=3'"), ["requests", "flask"]);
  assert.deepEqual(names("python -m pip install -r requirements.txt numpy"), ["numpy"]);
  assert.deepEqual(names("uv add httpx"), ["httpx"]);
  assert.deepEqual(names("poetry add pydantic"), ["pydantic"]);
  assert.deepEqual(names("cargo add serde@1"), ["serde"]);
});

test("a bare install, ci, and unrelated commands name no packages", () => {
  for (const c of ["npm install", "npm ci", "npm test", "pip install -r requirements.txt", "git status", 'echo "npm install foo"']) {
    assert.deepEqual(parseInstalls(c).flatMap((x) => x.names), [], c);
  }
});

test("urls, git repos and local paths are flagged as not from the registry", () => {
  const r = parseInstalls("npm install github:someone/thing ./local-dir https://x.example/a.tgz");
  assert.equal(r[0].names.length, 0);
  assert.equal(r[0].nonRegistry.length, 3);
});

test("assessment: missing, new, rarely used, install scripts, and fine", () => {
  assert.equal(assess({ exists: false }).verdict, "MISSING");
  assert.equal(assess({ exists: true, ageDays: 3, weekly: 100000 }).verdict, "CAUTION");
  assert.equal(assess({ exists: true, ageDays: 900, weekly: 40 }).verdict, "CAUTION");
  assert.equal(assess({ exists: true, ageDays: 900, weekly: 90000, installScripts: true }).verdict, "CAUTION");
  assert.equal(assess({ exists: true, ageDays: 900, weekly: 90000, deprecated: true }).verdict, "CAUTION");
  assert.equal(assess({ exists: true, ageDays: 900, weekly: 90000, hasRepo: true }).verdict, "OK");
  assert.equal(assess({ unknown: true }).verdict, "UNKNOWN");
});

// ---------- package guard (registry replaced by a fixture) ----------
function pkgRun(command, fixture) {
  const t = tmp();
  try {
    const fx = t.put("fx.json", JSON.stringify(fixture));
    return decision(run(PKG, { tool_input: { command } }, { CLAUDE_PROJECT_DIR: t.dir, KIT_REGISTRY_FIXTURE: fx }));
  } finally {
    t.cleanup();
  }
}

test("blocks installing a package that does not exist, and says why", () => {
  const d = pkgRun("npm install express totally-invented-pkg", { "npm:totally-invented-pkg": { exists: false } });
  assert.equal(d.permissionDecision, "deny");
  assert.match(d.permissionDecisionReason, /totally-invented-pkg/);
  assert.match(d.permissionDecisionReason, /invent/);
});

test("asks about brand-new, barely used or script-running packages; allows established ones", () => {
  assert.equal(pkgRun("npm i shiny-new", { "npm:shiny-new": { exists: true, ageDays: 2, weekly: 12000, hasRepo: true } }).permissionDecision, "ask");
  assert.equal(pkgRun("pip install tiny-lib", { "pypi:tiny-lib": { exists: true, ageDays: 900, weekly: 20, hasRepo: true } }).permissionDecision, "ask");
  assert.equal(pkgRun("npm i has-script", { "npm:has-script": { exists: true, ageDays: 900, weekly: 900000, installScripts: true, hasRepo: true } }).permissionDecision, "ask");
  assert.equal(pkgRun("npm i react", { "npm:react": { exists: true, ageDays: 4000, weekly: 20000000, hasRepo: true } }).permissionDecision, "allow");
});

test("asks about installs from a url or git repo; ignores everything unrelated", () => {
  assert.equal(pkgRun("npm install github:someone/thing", {}).permissionDecision, "ask");
  for (const c of ["npm test", "git commit -m 'npm install nothing-real'", "npm install", "ls"]) assert.equal(pkgRun(c, {}).permissionDecision, "allow", c);
});

test("network trouble never blocks (unknown is allowed)", () => {
  assert.equal(pkgRun("npm install anything", { "npm:anything": { unknown: true } }).permissionDecision, "allow");
});

test("SECURITY: a project's own kit.json cannot switch the package guard off unless the user approved it", () => {
  const t = tmp();
  try {
    t.put(".claude/kit.json", JSON.stringify({ packageGuard: false }));
    const fx = t.put("fx.json", JSON.stringify({ "npm:ghost": { exists: false } }));
    const env = { CLAUDE_PROJECT_DIR: t.dir, KIT_REGISTRY_FIXTURE: fx };
    assert.equal(decision(run(PKG, { tool_input: { command: "npm i ghost" } }, env)).permissionDecision, "deny");
    trustEntries(t.dir, entriesOf({ packageGuard: false }));
    assert.equal(decision(run(PKG, { tool_input: { command: "npm i ghost" } }, env)).permissionDecision, "allow");
  } finally {
    t.cleanup();
  }
});

test("package guard ignores bad input", () => {
  assert.equal(spawnSync("node", [PKG], { input: "garbage", encoding: "utf8" }).status, 0);
});

// ---------- file guard ----------
test("SECURITY: file tools cannot write the approval list", () => {
  for (const p of ["C:\\Users\\x\\.claude\\plugins\\data\\starter-kit\\trusted.json", "/home/x/.claude/plugins/data/starter-kit/trusted.json"]) {
    assert.equal(decision(run(FILE, { tool_input: { file_path: p, content: "{}" } })).permissionDecision, "deny", p);
  }
  for (const p of ["/proj/src/trusted.json", "/home/x/.claude/plugins/data/starter-kit/private-terms.txt", "/proj/README.md"]) {
    assert.equal(decision(run(FILE, { tool_input: { file_path: p } })).permissionDecision, "allow", p);
  }
});

// ---------- push / deploy gate ----------
function gate(command, { managed = true, cfg = null, approved = false } = {}) {
  const t = tmp("gate-");
  try {
    t.put("CLAUDE.md", managed ? "<!-- starter-kit:managed -->\n" : "# plain\n");
    if (cfg) t.put(".claude/kit.json", JSON.stringify(cfg));
    spawnSync("git", ["init", "-q", "-b", "main"], { cwd: t.dir });
    spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "--allow-empty", "-m", "i"], { cwd: t.dir });
    if (approved && cfg) trustEntries(t.dir, entriesOf(cfg));
    return run(GATE, { tool_input: { command } }, { CLAUDE_PROJECT_DIR: t.dir }).status;
  } finally {
    t.cleanup();
  }
}

test("the gate blocks pushes AND publishing and deploy commands until the full scan passed", () => {
  for (const c of ["git push origin main", "gh pr create --fill", "gh release create v1", "npm publish", "pnpm publish --access public", "docker push me/app", "vercel --prod", "vercel deploy --prod", "netlify deploy --prod", "fly deploy", "firebase deploy --only hosting", "wrangler deploy", "cargo publish", "twine upload dist/*", "cd app && npm publish"]) {
    assert.equal(gate(c), 2, `should block: ${c}`);
  }
});

test("the gate leaves ordinary commands alone", () => {
  for (const c of ["npm test", "npm run build", "vercel", "vercel dev", "netlify deploy", "docker build .", "git commit -m 'npm publish'", 'echo "fly deploy"', "npm publish --dry-run", "git push --dry-run"]) {
    assert.equal(gate(c), 0, `should allow: ${c}`);
  }
});

test("SECURITY: a project cannot switch the gate off by itself; the user's approval is required", () => {
  assert.equal(gate("git push", { cfg: { autoGate: false } }), 2, "unapproved switch ignored");
  assert.equal(gate("git push", { cfg: { autoGate: false }, approved: true }), 0, "approved switch honoured");
});

// ---------- secret guard also covers publishing and deploying ----------
test("the secret guard blocks a publish or deploy when a tracked file holds a secret", () => {
  const t = tmp("dep-");
  try {
    const g = (...a) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...a], { cwd: t.dir, encoding: "utf8" });
    g("init", "-q", "-b", "main");
    t.put("app.js", "console.log(1)\n");
    t.put("config.js", `const k = "${"AKIA" + "IOSFODNN7ZQ4XB2K"}";\n`);
    g("add", "-A");
    g("commit", "-q", "-m", "i");
    const env = { CLAUDE_PROJECT_DIR: t.dir, KIT_PRIVATE_TERMS: "" };
    for (const c of ["npm publish", "vercel --prod", "docker push me/app", "cd x && fly deploy"]) {
      assert.equal(decision(run(SECRET, { tool_input: { command: c } }, env)).permissionDecision, "deny", c);
    }
    assert.equal(decision(run(SECRET, { tool_input: { command: "npm publish --dry-run" } }, env)).permissionDecision, "allow");
    assert.equal(decision(run(SECRET, { tool_input: { command: "npm test" } }, env)).permissionDecision, "allow");
  } finally {
    t.cleanup();
  }
});

// ---------- secret guard honours the same rule ----------
test("SECURITY: the secret guard's off switch also needs the user's approval", () => {
  const t = tmp("sec-");
  try {
    const g = (...a) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...a], { cwd: t.dir, encoding: "utf8" });
    g("init", "-q", "-b", "main");
    t.put("a.js", "x\n");
    g("add", "-A");
    g("commit", "-q", "-m", "i");
    t.put(".env", "X=1\n");
    t.put(".claude/kit.json", JSON.stringify({ secretGuard: false }));
    g("add", "-f", ".env");
    const env = { CLAUDE_PROJECT_DIR: t.dir, KIT_PRIVATE_TERMS: "" };
    assert.equal(decision(run(SECRET, { tool_input: { command: 'git commit -m "x"' } }, env)).permissionDecision, "deny");
    trustEntries(t.dir, entriesOf({ secretGuard: false }));
    assert.equal(decision(run(SECRET, { tool_input: { command: 'git commit -m "x"' } }, env)).permissionDecision, "allow");
  } finally {
    t.cleanup();
  }
});
