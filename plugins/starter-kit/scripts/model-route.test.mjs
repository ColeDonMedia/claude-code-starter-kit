// Tests for the model decision (scripts/model-route.mjs). Run: node --test plugins/starter-kit/scripts/model-route.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FLOOR, RIGORS, baseline, minimum, projectFacts, rank, route, scoutDecision } from "./model-route.mjs";
import { buildIndex } from "./code-index.mjs";
import { trustEntries } from "./trust-lib.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "model-route.mjs");
const data = mkdtempSync(join(tmpdir(), "route-data-"));
process.env.KIT_DATA_DIR = data;
process.env.STARTER_KIT_INDEX_DIR = join(data, "index");
test.after(() => rmSync(data, { recursive: true, force: true }));

function project(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "route-"));
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), text);
  }
  return { dir, done: () => rmSync(dir, { recursive: true, force: true }) };
}
const cli = (args, env = {}) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env: { ...process.env, ...env } });

test("each role starts where the plan says", () => {
  const want = { scout: "haiku", researcher: "haiku", implementer: "sonnet", reviewer: "opus", challenger: "sonnet", "ui-reviewer": "sonnet", investigator: "sonnet", "red-team": "opus", "security-reviewer": "opus" };
  for (const [role, model] of Object.entries(want)) assert.equal(baseline(role).model, model, role);
  assert.equal(baseline("scout").effort, "low");
  assert.equal(baseline("researcher").effort, "medium");
  assert.equal(baseline("reviewer").effort, "high");
});

test("the builder moves up for size, risk, reach and a third attempt", () => {
  const m = (f) => route({ role: "implementer", ...f }).model;
  assert.equal(m({ size: "S" }), "sonnet");
  assert.equal(m({ size: "M" }), "opus");
  assert.equal(m({ size: "L" }), "opus");
  assert.equal(m({}), "opus", "no size tag counts as medium");
  assert.equal(m({ size: "S", risk: true }), "opus");
  assert.equal(m({ size: "S", reach: true }), "opus");
  assert.equal(m({ size: "S", attempt: 3 }), "opus");
  assert.equal(m({ size: "S", attempt: 2 }), "sonnet");
  assert.equal(m({ size: "M", rigor: "prototype" }), "sonnet");
  assert.equal(m({ size: "L", rigor: "prototype" }), "opus");
  assert.equal(m({ size: "S", rigor: "critical" }), "opus");
  assert.match(route({ role: "implementer", size: "S", risk: true, riskWhy: "payments" }).reasons.join(), /risky area: payments/);
});

test("reviews are never weaker than the build, and the security review is always the strong model", () => {
  assert.equal(route({ role: "reviewer" }).model, "opus");
  assert.equal(route({ role: "reviewer", rigor: "prototype", builder: "sonnet" }).model, "sonnet");
  assert.equal(route({ role: "reviewer", rigor: "prototype", builder: "opus" }).model, "opus");
  assert.equal(route({ role: "reviewer", rigor: "prototype", builder: "haiku" }).model, "sonnet");
  assert.equal(route({ role: "reviewer", rigor: "prototype", risk: true }).model, "opus");
  for (const rigor of RIGORS) assert.equal(route({ role: "security-reviewer", rigor }).model, "opus");
  assert.equal(route({ role: "challenger", size: "S" }).model, "sonnet");
  assert.equal(route({ role: "challenger", mode: "plan" }).model, "opus");
  assert.equal(route({ role: "challenger" }).model, "sonnet", "an untagged size is not 'large'");
  assert.equal(route({ role: "challenger", size: "L" }).model, "opus");
  assert.equal(route({ role: "investigator" }).model, "sonnet");
  assert.equal(route({ role: "investigator", attempt: 2 }).model, "opus");
  assert.equal(route({ role: "investigator", mode: "emergency" }).model, "opus");
  assert.equal(route({ role: "red-team", rigor: "prototype" }).model, "sonnet");
});

// Every combination: more risk, size, reach, attempts, rigor or a stronger builder never gives a weaker model; nothing is ever
// Fable; nothing is above the ceiling; nothing is below the role's floor unless the ceiling forces it.
test("more of anything never gives a weaker model, never Fable, never above the ceiling", () => {
  const sizes = [null, "S", "M", "L"];
  const builders = [undefined, "haiku", "sonnet", "opus", "fable"];
  const modes = [undefined, "plan", "range", "emergency"];
  let checked = 0;
  for (const role of Object.keys(FLOOR)) for (const rigor of RIGORS) for (const size of sizes) for (const risk of [false, true]) for (const reach of [false, true])
    for (const attempt of [1, 2, 3]) for (const builder of builders) for (const mode of modes) for (const ceiling of [null, "sonnet"]) {
      const f = { role, rigor, size, risk, reach, attempt, builder, mode, ceiling };
      const r = route(f);
      assert.ok(["haiku", "sonnet", "opus"].includes(r.model), JSON.stringify(f));
      if (ceiling) assert.ok(rank(r.model) <= rank(ceiling), JSON.stringify(f));
      if (!ceiling) assert.ok(rank(r.model) >= rank(FLOOR[role]), JSON.stringify(f));
      const more = [{ risk: true }, { reach: true }, { attempt: attempt + 1 }, { size: size === "S" ? "M" : size === "M" || size === null ? "L" : "L" }, { rigor: rigor === "prototype" ? "product" : "critical" }];
      if (builder && builder !== "fable") more.push({ builder: builder === "haiku" ? "sonnet" : "opus" });
      for (const m of more) {
        const r2 = route({ ...f, ...m });
        assert.ok(rank(r2.model) >= rank(r.model), `${JSON.stringify(f)} + ${JSON.stringify(m)}: ${r.model} -> ${r2.model}`);
      }
      checked++;
    }
  assert.ok(checked > 10000);
});

test("a plan without Opus caps every role, and says so when a review drops below its floor", () => {
  const r = route({ role: "security-reviewer", ceiling: "sonnet" });
  assert.equal(r.model, "sonnet");
  assert.match(r.reasons.join(), /capped at sonnet.*top of the report/);
  assert.equal(minimum("security-reviewer"), "opus");
  assert.equal(minimum("security-reviewer", "sonnet"), "sonnet");
  assert.equal(minimum("reviewer"), "sonnet");
  assert.equal(minimum("scout"), "haiku");
  assert.equal(minimum("someone-else"), null);
  assert.throws(() => route({ role: "builder" }), /unknown role/);
});

test("facts come from the roadmap's tags, the feature's words, kit.json and CLAUDE.md", () => {
  const p = project({
    "ROADMAP.md": "## Milestone 1\nAccepted: pending\n- [ ] Recipe search [S] — find recipes by name\n  - [ ] typing lists matches\n- [ ] Card payments [L] — take card payments\n  - [ ] high-risk\n  - [ ] a declined card shows an error\n",
    "CLAUDE.md": "# Project\nSize: large\n",
    ".claude/kit.json": JSON.stringify({ scout: false }),
  });
  try {
    const a = projectFacts(p.dir, { feature: "recipe search by name" });
    assert.equal(a.size, "S");
    assert.equal(a.risk, false);
    assert.equal(a.large, true);
    assert.equal(a.scoutOff, true);
    const b = projectFacts(p.dir, { feature: "card payments" });
    assert.equal(b.size, "L");
    assert.equal(b.risk, true);
    assert.equal(projectFacts(p.dir, { feature: "let people sign in with email" }).risk, true, "a risky area in the feature's own words");
    assert.equal(projectFacts(p.dir, { feature: "dark mode toggle" }).size, null);
  } finally {
    p.done();
  }
});

test("a project can ask for more care, but 'prototype' rigor counts only once the owner approved it on this computer", () => {
  const p = project({ ".claude/kit.json": JSON.stringify({ rigor: "prototype" }) });
  const q = project({ ".claude/kit.json": JSON.stringify({ rigor: "critical", ceiling: "haiku" }) });
  try {
    const before = projectFacts(p.dir);
    assert.equal(before.rigor, "product");
    assert.match(before.notes.join(), /not approved/);
    trustEntries(p.dir, ["auto-runner", "rigor:prototype"]);
    assert.equal(projectFacts(p.dir).rigor, "prototype");
    const c = projectFacts(q.dir);
    assert.equal(c.rigor, "critical");
    assert.equal(c.ceiling, null, "a project file can never set this computer's ceiling");
  } finally {
    p.done();
    q.done();
  }
});

test("a change to a file many others depend on counts as far-reaching", () => {
  const files = { "src/db.js": "export function saveRecipe(r) { return r; }\n" };
  for (let i = 0; i < 11; i++) files[`src/page${i}.js`] = `import { saveRecipe } from "./db.js";\nexport const p${i} = () => saveRecipe(${i});\n`;
  const p = project(files);
  try {
    buildIndex(p.dir);
    const f = projectFacts(p.dir, { role: "implementer", feature: "saveRecipe should trim titles" });
    assert.equal(f.reach, true, JSON.stringify(f));
    assert.match(f.reachWhy, /src\/db\.js, which 11 files depend on/);
    assert.equal(projectFacts(p.dir, { role: "implementer", feature: "p3 label text" }).reach, undefined);
  } finally {
    p.done();
  }
});

test("a scout is used only where it beats the free tools", () => {
  assert.equal(scoutDecision({ sourceFiles: 30 }).use, false);
  assert.equal(scoutDecision({ sourceFiles: 151 }).use, true);
  assert.equal(scoutDecision({ sourceFiles: 10, large: true }).use, true);
  assert.equal(scoutDecision({ sourceFiles: 60, packEmpty: true }).use, true);
  assert.equal(scoutDecision({ sourceFiles: 10, packEmpty: true }).use, false, "a new project has empty records: no scout");
  assert.equal(scoutDecision({ sourceFiles: 900, scoutOff: true }).use, false);
});

test("the command line prints one decision line, and the ceiling is set only through it", () => {
  const p = project({ "ROADMAP.md": "- [ ] Recipe search [S] — find recipes\n" });
  try {
    const a = cli(["--project", p.dir, "--role", "implementer", "--feature", "recipe search"]);
    assert.equal(a.status, 0, a.stderr);
    assert.match(a.stdout, /^MODEL sonnet EFFORT high — small, contained feature/);
    const b = cli(["--project", p.dir, "--role", "reviewer", "--feature", "recipe search"]);
    assert.match(b.stdout, /^MODEL opus EFFORT high/);
    assert.match(b.stdout, /If the launch fails because this plan has no Opus/);
    assert.match(cli(["--project", p.dir, "--role", "scout"]).stdout, /^SCOUT SKIP/);
    const j = JSON.parse(cli(["--project", p.dir, "--role", "challenger", "--mode", "plan", "--json"]).stdout);
    assert.equal(j.model, "opus");
    assert.equal(cli(["--project", p.dir, "--role", "nobody"]).status, 1);
    assert.equal(cli(["--set-ceiling", "haiku"]).status, 1, "a ceiling below Sonnet is refused");
    assert.equal(cli(["--set-ceiling", "sonnet"]).status, 0);
    assert.match(cli(["--project", p.dir, "--role", "security-reviewer"]).stdout, /^MODEL sonnet .*capped at sonnet/);
    assert.equal(cli(["--set-ceiling", "none"]).status, 0);
    assert.match(cli(["--project", p.dir, "--role", "security-reviewer"]).stdout, /^MODEL opus/);
  } finally {
    p.done();
  }
});
