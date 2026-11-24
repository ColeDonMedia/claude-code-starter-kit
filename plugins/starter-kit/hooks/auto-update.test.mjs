// Tests for auto-update.mjs. Run: node --test plugins/starter-kit/hooks/auto-update.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "auto-update.mjs");
const CACHE_ROOT = "/home/u/.claude/plugins/cache/starter-kit-marketplace/starter-kit/1.0.0";

function box() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "autoupd-")));
  const data = join(base, "data");
  const project = join(base, "project");
  mkdirSync(project, { recursive: true });
  return { base, data, project, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}
function launch(b, env = {}) {
  return spawnSync("node", [HOOK], {
    input: "{}",
    encoding: "utf8",
    env: { ...process.env, KIT_DATA_DIR: b.data, CLAUDE_PROJECT_DIR: b.project, CLAUDE_PLUGIN_ROOT: CACHE_ROOT, KIT_AUTOUPDATE_DRY_RUN: "1", ...env },
  });
}

test("an installed plugin with no recent check is due, and the stamp is written", () => {
  const b = box();
  try {
    const r = launch(b);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /WOULD UPDATE/);
    assert.ok(existsSync(join(b.data, "auto-update.stamp")));
  } finally {
    b.cleanup();
  }
});

test("only one check per interval", () => {
  const b = box();
  try {
    assert.match(launch(b).stdout, /WOULD UPDATE/);
    assert.equal(launch(b).stdout, "", "second launch within 24h must do nothing");
  } finally {
    b.cleanup();
  }
});

test("a stale stamp is due again", () => {
  const b = box();
  try {
    mkdirSync(b.data, { recursive: true });
    writeFileSync(join(b.data, "auto-update.stamp"), String(Date.now() - 25 * 3600 * 1000));
    assert.match(launch(b).stdout, /WOULD UPDATE/);
  } finally {
    b.cleanup();
  }
});

test("a plugin loaded from a plain folder (development) is never updated", () => {
  const b = box();
  try {
    assert.equal(launch(b, { CLAUDE_PLUGIN_ROOT: "/work/claude-code-starter-kit/plugins/starter-kit" }).stdout, "");
    assert.equal(existsSync(join(b.data, "auto-update.stamp")), false);
  } finally {
    b.cleanup();
  }
});

test("off switches: kit.json autoUpdate:false, kit.json auto:false, KIT_AUTOUPDATE=0", () => {
  for (const cfg of [{ autoUpdate: false }, { auto: false }]) {
    const b = box();
    try {
      mkdirSync(join(b.project, ".claude"), { recursive: true });
      writeFileSync(join(b.project, ".claude", "kit.json"), JSON.stringify(cfg));
      assert.equal(launch(b).stdout, "", JSON.stringify(cfg));
    } finally {
      b.cleanup();
    }
  }
  const b = box();
  try {
    assert.equal(launch(b, { KIT_AUTOUPDATE: "0" }).stdout, "");
  } finally {
    b.cleanup();
  }
});

test("bad input never fails the session", () => {
  const b = box();
  try {
    const r = spawnSync("node", [HOOK], { input: "garbage", encoding: "utf8", env: { ...process.env, KIT_DATA_DIR: b.data, CLAUDE_PLUGIN_ROOT: CACHE_ROOT, KIT_AUTOUPDATE_DRY_RUN: "1", CLAUDE_PROJECT_DIR: b.project } });
    assert.equal(r.status, 0);
  } finally {
    b.cleanup();
  }
});

test("the worker runs exactly the two fixed commands and logs the result", () => {
  const b = box();
  try {
    const calls = join(b.base, "calls.txt");
    const fake = join(b.base, "fake-claude.mjs");
    writeFileSync(
      fake,
      `import { appendFileSync } from "node:fs"; appendFileSync(${JSON.stringify(calls)}, process.argv.slice(2).join(" ") + "\\n");
       console.log(process.argv[3] === "update" ? '✔ Plugin "starter-kit" updated from 1.0.0 to 1.1.0 for scope user. Restart to apply changes.' : "✔ Successfully updated marketplace");`,
    );
    const r = spawnSync("node", [HOOK, "--worker"], { encoding: "utf8", env: { ...process.env, KIT_DATA_DIR: b.data, KIT_CLAUDE_BIN: fake } });
    assert.equal(r.status, 0);
    assert.deepEqual(readFileSync(calls, "utf8").trim().split("\n"), ["plugin marketplace update starter-kit-marketplace", "plugin update starter-kit@starter-kit-marketplace"]);
    const log = JSON.parse(readFileSync(join(b.data, "auto-update.log"), "utf8"));
    assert.equal(log.ok, true);
    assert.equal(log.updated, "1.0.0 -> 1.1.0");
  } finally {
    b.cleanup();
  }
});

test("the worker stops after a failed step and records the failure", () => {
  const b = box();
  try {
    const calls = join(b.base, "calls.txt");
    const fake = join(b.base, "fake-claude.mjs");
    writeFileSync(fake, `import { appendFileSync } from "node:fs"; appendFileSync(${JSON.stringify(calls)}, "x\\n"); console.error("network down"); process.exit(1);`);
    spawnSync("node", [HOOK, "--worker"], { encoding: "utf8", env: { ...process.env, KIT_DATA_DIR: b.data, KIT_CLAUDE_BIN: fake } });
    assert.equal(readFileSync(calls, "utf8").trim().split("\n").length, 1, "must not run the second command after a failure");
    const log = JSON.parse(readFileSync(join(b.data, "auto-update.log"), "utf8"));
    assert.equal(log.ok, false);
    assert.match(log.results[0].output, /network down/);
  } finally {
    b.cleanup();
  }
});

test("the launcher returns immediately even when the worker would be slow", () => {
  const b = box();
  try {
    const fake = join(b.base, "slow-claude.mjs");
    writeFileSync(fake, "setTimeout(() => {}, 20000);");
    const t0 = Date.now();
    const r = launch(b, { KIT_AUTOUPDATE_DRY_RUN: "", KIT_CLAUDE_BIN: fake });
    assert.equal(r.status, 0);
    assert.ok(Date.now() - t0 < 5000, `launcher took ${Date.now() - t0}ms; it must not wait for the worker`);
  } finally {
    // the detached worker may still hold the folder briefly; ignore cleanup errors
    try {
      b.cleanup();
    } catch {
      /* ignore */
    }
  }
});
