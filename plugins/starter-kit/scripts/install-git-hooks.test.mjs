// Tests for install-git-hooks.mjs. Run: node --test plugins/starter-kit/scripts/install-git-hooks.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const INSTALL = join(dirname(fileURLToPath(import.meta.url)), "install-git-hooks.mjs");
const FAKE_KEY = "AKIA" + "IOSFODNN7ZQ4XB2K";

function repo() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "hook-")));
  const g = (...a) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...a], { cwd: dir, encoding: "utf8", env: { ...process.env, KIT_PRIVATE_TERMS: "" } });
  const put = (rel, c) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); };
  g("init", "-q", "-b", "main");
  put("README.md", "hi\n");
  g("add", "-A");
  g("commit", "-q", "-m", "init");
  return { dir, g, put, install: (...x) => spawnSync("node", [INSTALL, "--project", dir, ...x], { encoding: "utf8" }), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("installs the hook and the scanner copy; a commit with a secret is then refused by git itself", () => {
  const r = repo();
  try {
    assert.equal(r.install().status, 0);
    assert.ok(existsSync(join(r.dir, ".claude", "tools", "secret-scan.mjs")));
    r.put("cfg.js", `const k = "${FAKE_KEY}";\n`);
    r.g("add", "cfg.js");
    const c = r.g("commit", "-m", "leak");
    assert.notEqual(c.status, 0, "git must refuse the commit");
    assert.match(c.stdout + c.stderr, /Commit blocked/);
    assert.ok(!(c.stdout + c.stderr).includes(FAKE_KEY), "the key must not be echoed");
  } finally {
    r.cleanup();
  }
});

test("a clean commit still goes through", () => {
  const r = repo();
  try {
    r.install();
    r.put("app.js", "console.log(1)\n");
    r.g("add", "app.js");
    assert.equal(r.g("commit", "-m", "fine").status, 0);
  } finally {
    r.cleanup();
  }
});

test("an env file is refused", () => {
  const r = repo();
  try {
    r.install();
    r.put(".env", "X=1\n");
    r.g("add", "-f", ".env");
    assert.notEqual(r.g("commit", "-m", "env").status, 0);
  } finally {
    r.cleanup();
  }
});

test("an existing pre-commit hook that the kit did not write is never touched", () => {
  const r = repo();
  try {
    const mine = "#!/bin/sh\n# my own hook\nexit 0\n";
    writeFileSync(join(r.dir, ".git", "hooks", "pre-commit"), mine);
    const out = r.install();
    assert.equal(out.status, 0);
    assert.match(out.stdout, /left unchanged/);
    assert.equal(readFileSync(join(r.dir, ".git", "hooks", "pre-commit"), "utf8"), mine);
  } finally {
    r.cleanup();
  }
});

test("re-installing is safe, and uninstalling removes only the kit's hook", () => {
  const r = repo();
  try {
    r.install();
    assert.equal(r.install().status, 0);
    assert.match(r.install("--uninstall").stdout, /Removed/);
    assert.equal(existsSync(join(r.dir, ".git", "hooks", "pre-commit")), false);
    assert.match(r.install("--uninstall").stdout, /No starter-kit/);
  } finally {
    r.cleanup();
  }
});

test("outside a git repository it installs nothing", () => {
  const plain = realpathSync(mkdtempSync(join(tmpdir(), "nogit-")));
  try {
    const out = spawnSync("node", [INSTALL, "--project", plain], { encoding: "utf8" });
    assert.equal(out.status, 1);
    assert.equal(existsSync(join(plain, ".claude")), false);
  } finally {
    rmSync(plain, { recursive: true, force: true });
  }
});
