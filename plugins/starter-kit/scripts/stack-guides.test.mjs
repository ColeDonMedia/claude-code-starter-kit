// Per-stack guidelines: the vetted ui-ux-pro-max stack tables load, a project's stacks are recognised from its own files, only
// active Critical and High rules are handed out, and they are written to .claude/rules/stack-guides.md where Claude Code reads
// them every session. Run: node --test plugins/starter-kit/scripts/stack-guides.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STACKS, detectStacks, guidesMd, loadGuides, pickGuides, writeGuides } from "./stack-guides.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = join(HERE, "..");
const CLI = join(HERE, "stack-guides.mjs");

function project(files) {
  const dir = mkdtempSync(join(tmpdir(), "kit-stackg-"));
  for (const [f, t] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), typeof t === "string" ? t : JSON.stringify(t));
  }
  return dir;
}

test("all 23 vetted stack tables load, with the license and the notice naming their commit", () => {
  assert.equal(STACKS.length, 23);
  for (const s of STACKS) assert.ok(loadGuides(s).length > 20, s);
  const notice = readFileSync(join(PLUGIN, "library", "ui-ux-pro-max", "NOTICE.md"), "utf8");
  assert.match(notice, /stacks\/.*11ca2b3bdd555649f278ee348c32a9302b24dcf1/s);
  assert.ok(existsSync(join(PLUGIN, "library", "ui-ux-pro-max", "LICENSE")));
});

test("only active Critical and High rules are handed out, Critical first, deprecated never", () => {
  const all = loadGuides("svelte");
  const picked = pickGuides(all);
  assert.ok(picked.length > 0 && picked.length <= 25);
  assert.ok(picked.every((g) => ["Critical", "High"].includes(g.Severity) && g.Status === "active"));
  const firstHigh = picked.findIndex((g) => g.Severity === "High");
  assert.ok(firstHigh === -1 || picked.slice(firstHigh).every((g) => g.Severity === "High"), "Critical before High");
  assert.ok(!picked.some((g) => /legacy/i.test(g.Guideline) && g.Status === "deprecated"));
});

test("a project's stacks are recognised from its own files", () => {
  const cases = [
    [{ "composer.json": { require: { "laravel/framework": "^12.0" } } }, ["laravel"]],
    [{ "package.json": { dependencies: { next: "16.2.0", react: "19.2.0" } } }, ["nextjs"]],
    [{ "package.json": { devDependencies: { "@sveltejs/kit": "3.4.1", svelte: "5.59.2", tailwindcss: "4" } } }, ["svelte"]],
    [{ "package.json": { dependencies: { nuxt: "4.5.0", "@nuxt/ui": "4.12.0" } } }, ["nuxt-ui", "nuxtjs"]],
    [{ "package.json": { dependencies: { react: "19.2.0", three: "0.180.0" } }, "components.json": {} }, ["react", "shadcn", "threejs"]],
    [{ "package.json": { dependencies: { tailwindcss: "4.3.0" } }, "index.html": "<html></html>" }, ["html-tailwind"]],
    [{ "pubspec.yaml": "dependencies:\n  flutter:\n    sdk: flutter\n" }, ["flutter"]],
    [{ "App.csproj": '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><UseWPF>true</UseWPF></PropertyGroup></Project>' }, ["wpf"]],
    [{ "pyproject.toml": '[project]\ndependencies = ["PySide6>=6.8"]\n' }, ["pyside6-qss"]],
    [{ "Sources/App/ContentView.swift": "import SwiftUI\nstruct ContentView: View {}\n" }, ["swiftui"]],
    [{ "README.md": "# nothing here" }, []],
  ];
  for (const [files, want] of cases) {
    const dir = project(files);
    try {
      assert.deepEqual(detectStacks(dir).sort(), want.sort(), JSON.stringify(files).slice(0, 80));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("the guides are written to .claude/rules/stack-guides.md with the docs link for each rule, short enough to load every session", () => {
  const dir = project({ "composer.json": { require: { "laravel/framework": "^12.0" } } });
  try {
    const f = writeGuides(dir, detectStacks(dir));
    assert.equal(f, join(dir, ".claude", "rules", "stack-guides.md"));
    const md = readFileSync(f, "utf8");
    assert.match(md, /^# Stack guidelines/m);
    assert.match(md, /## Laravel/);
    assert.match(md, /Do: .+ Don't: /);
    assert.match(md, /https:\/\/laravel\.com\//);
    assert.match(md, /ui-ux-pro-max/, "says where the rules came from");
    assert.ok(md.split(/\s+/).length < 2500, `${md.split(/\s+/).length} words`);
    assert.doesNotMatch(guidesMd([]), /##/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the command line detects, writes, and says when nothing matched", () => {
  const dir = project({ "README.md": "x" });
  try {
    const r = spawnSync(process.execPath, [CLI, "--write", "--project", dir], { encoding: "utf8" });
    assert.match(r.stdout, /No stack with guidelines found/);
    assert.ok(!existsSync(join(dir, ".claude", "rules", "stack-guides.md")));
    const s = spawnSync(process.execPath, [CLI, "--write", "--stack", "laravel", "--project", dir], { encoding: "utf8" });
    assert.match(s.stdout, /laravel/);
    assert.ok(existsSync(join(dir, ".claude", "rules", "stack-guides.md")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("setup, planning, the builder and maintenance use the stack guides", () => {
  const read = (f) => readFileSync(join(PLUGIN, f), "utf8");
  assert.match(read("commands/init.md"), /stack-guides\.mjs" --write --project \./);
  assert.match(read("commands/spec.md"), /stack-guides\.mjs" --write --project \./);
  assert.match(read("commands/maintain.md"), /stack-guides\.mjs" --write --project \./);
  assert.match(read("agents/implementer.md"), /\.claude\/rules\/stack-guides\.md/);
});
