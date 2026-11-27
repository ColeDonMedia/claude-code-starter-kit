// Tests for sec-tools.mjs: the kit's own checks always, plus four kinds of extra tool only when installed.
// Run: node --test plugins/starter-kit/scripts/sec-tools.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { plan, render, TOOLS } from "./sec-tools.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "sec-tools.mjs");

function project(files) {
  const dir = mkdtempSync(join(tmpdir(), "sect-"));
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), c);
  }
  return { dir, done: () => rmSync(dir, { recursive: true, force: true }) };
}
const WEB = { "package.json": "{}", "package-lock.json": "{}", "src/app.js": "x", ".github/workflows/ci.yml": "on: push", "Dockerfile": "FROM node:22", "deploy/Dockerfile.prod": "FROM node:22", "compose.yaml": "services: {}", "node_modules/x/Dockerfile": "FROM x" };

test("only four kinds of extra tool are kept: workflows, Dockerfiles, infrastructure, code patterns", () => {
  assert.deepEqual(TOOLS.map((t) => t.tool), ["zizmor", "hadolint", "trivy", "opengrep", "semgrep"]);
});

test("installed extra tools are used, one per job; missing ones are never shown", () => {
  const p = project(WEB);
  try {
    const have = new Set(["zizmor", "hadolint", "semgrep", "opengrep"]);
    const rows = plan(p.dir, { probe: (t) => (have.has(t) ? "1.0" : null) });
    const out = render(rows, { url: "http://localhost:5173" });
    assert.match(out.split("\n")[0], /^LIVE built-in: node ".*sec-builtin\.mjs" --project \. --url http:\/\/localhost:5173 .*nothing to install/);
    assert.match(out, /^RUN zizmor: zizmor --offline \.github\/workflows/m);
    assert.match(out, /^RUN hadolint: hadolint "Dockerfile" "deploy\/Dockerfile\.prod"/m); // node_modules is never scanned
    assert.match(out, /^RUN opengrep: opengrep scan/m);
    assert.match(out, /^ONE OF semgrep: does the same job as opengrep \(also installed, not needed\)$/m);
    assert.doesNotMatch(out, /MISSING|trivy|pip install|npm install -g/);
    assert.match(out, /never suggest installing one/);
  } finally {
    p.done();
  }
});

test("with nothing installed, only the kit's own checks run", () => {
  const p = project({ "src/a.py": "x", "requirements.txt": "flask==3.0.0" });
  try {
    const lines = render(plan(p.dir, { probe: () => null })).split("\n");
    assert.equal(lines.length, 2);
    assert.match(lines[0], /^RUN built-in: node ".*sec-builtin\.mjs" --project \. /);
    assert.match(lines[1], /^Never install a tool/);
  } finally {
    p.done();
  }
});

test("live checks refuse any address that is not this computer", () => {
  const e = project({ "notes.md": "x" });
  try {
    const bad = spawnSync(process.execPath, [SCRIPT, "--project", e.dir, "--url", "https://example.com"], { encoding: "utf8" });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /live checks never touch a real site/);
  } finally {
    e.done();
  }
});
