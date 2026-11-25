// Tests for perf-budget.mjs and disk-free.mjs. Run: node --test plugins/starter-kit/scripts/perf-budget.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { measure, judge } from "./perf-budget.mjs";
import { freeMb } from "./disk-free.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PERF = join(HERE, "perf-budget.mjs");
const DISK = join(HERE, "disk-free.mjs");
const BUDGET = { js: 300, css: 100, image: 500, total: 2000 };

function build(files) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "perf-")));
  for (const [rel, bytes] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, bytes);
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
const text = (kb) => Buffer.from("const a = 1;\n".repeat(Math.ceil((kb * 1024) / 13)));

test("a small build is within budget", () => {
  const b = build({ "app.js": text(50), "style.css": text(5), "logo.svg": Buffer.from("<svg/>") });
  try {
    assert.deepEqual(judge(measure(b.dir), BUDGET), []);
  } finally {
    b.cleanup();
  }
});

test("compressed size is what counts: repetitive code is cheap, random data is not", () => {
  const b = build({ "repeat.js": text(900), "random.js": randomBytes(400 * 1024) });
  try {
    const m = measure(b.dir);
    const rep = m.files.find((f) => f.file === "repeat.js").kb;
    const rnd = m.files.find((f) => f.file === "random.js").kb;
    assert.ok(rep < 50, `repetitive 900 KB file should compress small, got ${rep}`);
    assert.ok(rnd > 390, `random 400 KB file stays big, got ${rnd}`);
    assert.match(judge(m, BUDGET).join("\n"), /JavaScript is \d+ KB compressed/);
  } finally {
    b.cleanup();
  }
});

test("source maps and node_modules are ignored; big single images and big CSS are flagged", () => {
  const b = build({ "app.js": text(10), "app.js.map": randomBytes(900 * 1024), "node_modules/x/index.js": randomBytes(900 * 1024), "hero.png": randomBytes(700 * 1024), "main.css": randomBytes(150 * 1024) });
  try {
    const m = measure(b.dir);
    assert.ok(!m.files.some((f) => f.file.endsWith(".map") || f.file.includes("node_modules")));
    const p = judge(m, BUDGET).join("\n");
    assert.match(p, /Image hero\.png is 7\d\d KB/);
    assert.match(p, /CSS is 1\d\d KB/);
  } finally {
    b.cleanup();
  }
});

test("the command line exits 1 over budget with the biggest files named, 0 within, and honest errors otherwise", () => {
  const over = build({ "big.js": randomBytes(400 * 1024) });
  const ok = build({ "a.js": text(20) });
  try {
    const r = spawnSync("node", [PERF, "--dir", over.dir], { encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /OVER BUDGET/);
    assert.match(r.stdout, /Biggest files: big\.js/);
    assert.equal(spawnSync("node", [PERF, "--dir", ok.dir], { encoding: "utf8" }).status, 0);
    assert.equal(spawnSync("node", [PERF, "--dir", ok.dir, "--max-js-kb", "0"], { encoding: "utf8" }).status, 1, "budgets are adjustable");
    assert.match(spawnSync("node", [PERF, "--dir", join(ok.dir, "missing")], { encoding: "utf8" }).stdout, /Build the project first/);
    assert.equal(spawnSync("node", [PERF], { encoding: "utf8" }).status, 64);
  } finally {
    over.cleanup();
    ok.cleanup();
  }
});

test("disk-free reports real free space and compares it with what is needed", () => {
  assert.ok(freeMb(tmpdir()) > 0);
  const ok = spawnSync("node", [DISK, "--path", tmpdir(), "--need-mb", "1"], { encoding: "utf8" });
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /^OK: \d+ MB free/);
  const low = spawnSync("node", [DISK, "--path", tmpdir(), "--need-mb", "999999999"], { encoding: "utf8" });
  assert.equal(low.status, 1);
  assert.match(low.stdout, /NOT ENOUGH/);
});
