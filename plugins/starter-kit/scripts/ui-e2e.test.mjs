// Real-browser proof of the UI checkpoint: runs templates/ui-checkpoint.js in Playwright on two fixture pages (one with every
// planted problem, one done right) and checks that ui-check.mjs blocks the first for each problem and finds nothing on the second.
// Needs Playwright with Chromium, which the kit itself does not install: set KIT_PLAYWRIGHT_DIR to a folder whose node_modules
// has @playwright/test (any project's). Skipped otherwise. Run: KIT_PLAYWRIGHT_DIR=<dir> node --test plugins/starter-kit/scripts/ui-e2e.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { judgeUi, loadResults } from "./ui-check.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PW_DIR = process.env.KIT_PLAYWRIGHT_DIR;
let pw = null;
try {
  if (PW_DIR) pw = createRequire(join(PW_DIR, "package.json")).resolve("@playwright/test").replace(/index\.js$/, "index.mjs");
} catch {
  pw = null;
}

test("the checkpoint catches every planted problem in a real browser and nothing on a page done right", { skip: pw ? false : "set KIT_PLAYWRIGHT_DIR to a folder with @playwright/test installed", timeout: 300000 }, () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "ui-e2e-")));
  try {
    mkdirSync(join(dir, "e2e"));
    for (const f of readdirSync(join(HERE, "fixtures", "ui"))) copyFileSync(join(HERE, "fixtures", "ui", f), join(dir, "e2e", f));
    // The temp folder has no node_modules: point the checkpoint at that Playwright directly.
    const tpl = readFileSync(join(HERE, "..", "templates", "ui-checkpoint.js"), "utf8").replace('from "@playwright/test"', `from ${JSON.stringify(pathToFileURL(pw).href)}`);
    writeFileSync(join(dir, "e2e", "ui-checkpoint.js"), tpl);
    writeFileSync(join(dir, "package.json"), '{ "type": "module" }');
    const cli = join(dirname(pw), "cli.js");
    const r = spawnSync(process.execPath, [cli, "test", "--config", join(dir, "e2e", "playwright.config.js")], { cwd: dir, encoding: "utf8", env: { ...process.env, UI_AXE: "0" } });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const records = loadResults(dir);
    const bad = judgeUi(records.filter((x) => (x.path ?? x.url ?? "").includes("/42")));
    const has = (list, c) => list.some((l) => l.endsWith(`[${c}]`));
    for (const c of ["way-back", "junk-text", "broken-image", "truncated-text", "list-no-search", "list-no-paging", "dialog-no-close", "dialog-too-tall", "page-error", "wrapped-label", "unnamed-control", "covered-control", "offscreen-control", "dialog-escape"]) assert.ok(has(bad.blocking, c), `missed ${c}:\n${bad.blocking.join("\n")}`);
    for (const c of ["title", "tiny-text", "vague-label", "small-target", "table-no-sort", "left-numbers", "dialog-no-title", "duplicate-name", "dead-link", "console-error", "crowded-targets", "input-zoom"]) assert.ok(has(bad.later, c), `missed ${c}:\n${bad.later.join("\n")}`);
    const goodRecs = records.filter((x) => (x.path ?? x.url ?? "").includes("/1042")).map((x) => ({ ...x }));
    assert.ok(goodRecs.length >= 4, "the good page was measured at both sizes, with its popup open, and Escape tried");
    const good = judgeUi([...goodRecs, ...goodRecs.map((x) => ({ ...x, data: "stress" }))]);
    assert.deepEqual([good.blocking, good.later], [[], []], `false alarms on the good page:\n${[...good.blocking, ...good.later].join("\n")}`);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
});
