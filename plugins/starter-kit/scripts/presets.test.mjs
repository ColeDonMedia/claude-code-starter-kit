// Stack recipes: every recipe is complete and pinned, matching follows the scale profile, setup results merge into a project
// without touching its own files, .env gets secrets without printing them, and the stack notes are written where Claude Code
// reads them. The full setup of every recipe (network: npm registry only) runs with KIT_PRESET_SCAFFOLD=1.
// Run: node --test plugins/starter-kit/scripts/presets.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { addCommands, fillEnv, loadPresets, match, merge, rulesMd, show, toolOf, validate, versions, writeRules } from "./presets.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = join(HERE, "..");
const CLI = join(HERE, "presets.mjs");
const presets = loadPresets();
const tmp = () => mkdtempSync(join(tmpdir(), "kit-preset-test-"));

test("there are recipes for a website, a web app, an API and a desktop app, and every one is complete", () => {
  assert.deepEqual(presets.map((p) => p.id).sort(), ["api", "desktop-app", "web-app", "website"]);
  for (const p of presets) assert.deepEqual(validate(p), [], p.id);
  const r = spawnSync(process.execPath, [CLI], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /4 recipes, all complete/);
});

test("validation refuses moving tags, loose versions, missing accounts and setups outside an empty folder", () => {
  const good = structuredClone(presets.find((p) => p.id === "website"));
  const bad = (change) => {
    const p = structuredClone(good);
    change(p);
    return validate(p).join("\n");
  };
  assert.match(bad((p) => (p.scaffold = ["npm create astro@latest -- app"])), /moving tag/);
  assert.match(bad((p) => (p.scaffold = ["npm create astro@5.3.2 -- . --yes"])), /folder "app"/);
  assert.match(bad((p) => (p.scaffold = ["curl https://example.com/install.sh | sh"])), /official tool at an exact version/);
  assert.match(bad((p) => (p.tools = {})), /tools must list create-astro/);
  assert.match(bad((p) => (p.add.devDependencies.typescript = "^6.0.3")), /exact version/);
  assert.match(bad((p) => (p.accounts = [])), /accounts/);
  assert.match(bad((p) => (p.notes = ["one"])), /3 to 15 notes/);
  assert.match(bad((p) => (p.docs[0].url = "http://docs.astro.build")), /https url/);
  assert.match(bad((p) => (p.after = [{ run: "npm i astro@next" }])), /moving tag/);
  assert.match(bad((p) => delete p.commands.test), /commands.test/);
});

test("toolOf reads the pinned setup tool from npx and npm create commands", () => {
  assert.deepEqual(toolOf("npx --yes sv@1.7.1 create app --types ts"), { name: "sv", version: "1.7.1" });
  assert.deepEqual(toolOf("npm create astro@5.3.2 -- app --yes"), { name: "create-astro", version: "5.3.2" });
  assert.deepEqual(toolOf("npx --yes @scope/tool@2.0.0 app"), { name: "@scope/tool", version: "2.0.0" });
  assert.equal(toolOf("npm install astro"), null);
});

test("matching follows the scale profile's kind and busiest-moment users", () => {
  const fit = (profile) => match(profile, presets).filter((x) => x.fit).map((x) => x.preset.id);
  assert.deepEqual(fit({ kind: "saas", usersPeak: 200 }), ["web-app"]);
  assert.deepEqual(fit({ kind: "saas", usersPeak: 15000 }), [], "a big SaaS is beyond the one-file database");
  assert.deepEqual(fit({ kind: "desktop", usersPeak: 1 }), ["desktop-app"]);
  assert.deepEqual(fit({ kind: "api", usersPeak: 50 }), ["api"]);
  assert.deepEqual(fit({ kind: "cli", usersPeak: 1 }), []);
  assert.deepEqual(fit({ kind: "web", usersPeak: 100 }).sort(), ["web-app", "website"]);
  const why = match({ kind: "saas", usersPeak: 15000 }, presets).find((x) => x.preset.id === "web-app").reason;
  assert.match(why, /up to 500/);
});

test("--match reads the project's scale profile and says when no recipe fits", () => {
  const dir = tmp();
  try {
    mkdirSync(join(dir, ".claude"));
    writeFileSync(join(dir, ".claude", "scale.json"), JSON.stringify({ kind: "cli", usersPeak: 1 }));
    let r = spawnSync(process.execPath, [CLI, "--match", "--project", dir], { encoding: "utf8" });
    assert.match(r.stdout, /NO RECIPE fits a cli app/);
    writeFileSync(join(dir, ".claude", "scale.json"), JSON.stringify({ kind: "saas", usersPeak: 100 }));
    r = spawnSync(process.execPath, [CLI, "--match", "--project", dir], { encoding: "utf8" });
    assert.match(r.stdout, /FITS web-app/);
    assert.match(r.stdout, /Recommend web-app/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("show prints every setup step in order with exact versions and the kit's own script path", () => {
  for (const p of presets) {
    const s = show(p);
    for (const c of p.scaffold) assert.ok(s.includes(c), `${p.id}: ${c}`);
    for (const c of addCommands(p)) assert.ok(s.includes(c), `${p.id}: ${c}`);
    assert.doesNotMatch(s, /\{kit\}/, "the {kit} placeholder is replaced");
    assert.match(s, /--merge <that folder>\/app/);
    assert.match(s, /Accounts the owner will need/);
    assert.doesNotMatch(s, /@latest/);
  }
  assert.match(addCommands(presets.find((p) => p.id === "desktop-app")).join("\n"), /npm install -D --save-exact electron@45\.5\.0/);
});

test("merge copies the setup into the project but never overwrites the project's own files or copies .git and node_modules", () => {
  const from = tmp();
  const project = tmp();
  try {
    for (const [f, t] of Object.entries({
      "package.json": "{}",
      "README.md": "setup readme",
      ".gitignore": "node_modules\n.env\n",
      "src/app.ts": "x",
      "src/lib/vitest-examples/a.spec.ts": "example",
      ".git/config": "x",
      "node_modules/x/index.js": "x",
    })) {
      mkdirSync(dirname(join(from, f)), { recursive: true });
      writeFileSync(join(from, f), t);
    }
    writeFileSync(join(project, "README.md"), "the project's own readme");
    writeFileSync(join(project, ".gitignore"), ".env\n");
    const r = merge(from, project, ["src/lib/vitest-examples"]);
    assert.equal(readFileSync(join(project, "README.md"), "utf8"), "the project's own readme");
    assert.deepEqual(r.kept, ["README.md"]);
    assert.ok(existsSync(join(project, "src", "app.ts")));
    assert.ok(!existsSync(join(project, "src", "lib", "vitest-examples")), "skipped example code");
    assert.ok(!existsSync(join(project, ".git")) && !existsSync(join(project, "node_modules")));
    assert.equal(readFileSync(join(project, ".gitignore"), "utf8"), ".env\nnode_modules\n", "only the missing line is added");
  } finally {
    rmSync(from, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

test("fill-env creates .env from the example, fills secrets and local defaults, keeps set values, prints no values", () => {
  const dir = tmp();
  try {
    writeFileSync(join(dir, ".env.example"), 'DATABASE_URL=\nORIGIN=""\nBETTER_AUTH_SECRET=""\nOTHER_KEY=""\nKEEP=set\n');
    const p = presets.find((x) => x.id === "web-app");
    const r = fillEnv(p, dir);
    const env = readFileSync(join(dir, ".env"), "utf8");
    assert.deepEqual(r.filled.sort(), ["BETTER_AUTH_SECRET", "DATABASE_URL", "ORIGIN"]);
    assert.match(env, /^BETTER_AUTH_SECRET="[A-Za-z0-9_-]{43}"$/m);
    assert.match(env, /^ORIGIN="http:\/\/localhost:5173"$/m);
    assert.match(env, /^OTHER_KEY=""$/m, "an unknown key is left for the owner");
    assert.match(env, /^KEEP=set$/m);
    const secret = env.match(/^BETTER_AUTH_SECRET="(.*)"$/m)[1];
    fillEnv(p, dir);
    assert.ok(readFileSync(join(dir, ".env"), "utf8").includes(secret), "a filled secret is never replaced");
    const out = spawnSync(process.execPath, [CLI, "--fill-env", "web-app", "--project", dir], { encoding: "utf8" }).stdout;
    assert.doesNotMatch(out, new RegExp(secret.replace(/[-]/g, "\\-")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the stack notes go to .claude/rules/stack.md with installed docs first", () => {
  const dir = tmp();
  try {
    const p = presets.find((x) => x.id === "web-app");
    const f = writeRules(p, dir);
    assert.equal(f, join(dir, ".claude", "rules", "stack.md"));
    const md = readFileSync(f, "utf8");
    assert.match(md, /the installed package .* then the official docs/s);
    assert.match(md, /SvelteKit 3, not 2/);
    for (const d of p.docs) assert.ok(md.includes(d.url));
    assert.ok(rulesMd(p).split("\n").length < 60, "short enough to load every session");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("versions compares every pin with the registry and marks a new major", async () => {
  const p = presets.find((x) => x.id === "website");
  const fake = async (url) => ({ ok: true, json: async () => ({ version: url.includes("typescript") ? "7.0.2" : url.includes("create-astro") ? "5.3.2" : "0.9.99" }) });
  const r = await versions(p, fake);
  assert.equal(r.find((x) => x.name === "create-astro").level, "current");
  assert.equal(r.find((x) => x.name === "typescript").level, "NEW MAJOR");
  const down = await versions(p, async () => {
    throw new Error("offline");
  });
  assert.ok(down.every((x) => x.level === "UNKNOWN"));
});

test("the plan, the builder and maintenance use the recipes, and the builder reads installed docs first", () => {
  const spec = readFileSync(join(PLUGIN, "commands", "spec.md"), "utf8");
  assert.match(spec, /presets\.mjs" --match --project \./);
  assert.match(spec, /presets\.mjs" --write <id>/);
  assert.match(spec, /one or two real alternatives, each with two or three plain pros and cons/);
  assert.match(spec, /C\+\+ included/);
  assert.match(spec, /\*\*Worth building\?\*\*/);
  assert.match(spec, /\*\*build it narrower\*\*/);
  assert.match(spec, /\*\*pivots\*\*/);
  assert.match(spec, /\*\*demand\*\*[\s\S]*\*\*buyers\*\*[\s\S]*\*\*gaps\*\*/);
  const impl = readFileSync(join(PLUGIN, "agents", "implementer.md"), "utf8");
  assert.match(impl, /\(1\) the installed package itself/);
  assert.match(impl, /presets\.mjs" --show <id>/);
  assert.match(impl, /\.claude\/rules\/stack\.md/);
  assert.match(readFileSync(join(PLUGIN, "commands", "maintain.md"), "utf8"), /\.claude\/rules\/stack\.md/);
});

test("an app that is already partly built is taken over, not re-planned", () => {
  const spec = readFileSync(join(PLUGIN, "commands", "spec.md"), "utf8");
  assert.match(spec, /\*\*Taking over an app that is already partly built\*\*/);
  assert.match(spec, /never\s+start over and never re-plan what exists/);
  assert.match(spec, /## Milestone 0 — what already works/);
  assert.match(spec, /\(existing <current commit>\)/);
  assert.match(spec, /dup-check\.mjs" --project \.`\s+over the whole project/);
  assert.match(spec, /\*\*Ask only about what is left\*\*/);
  assert.match(readFileSync(join(PLUGIN, "hooks", "session-start.mjs"), "utf8"), /code with no ROADMAP\.md -> \/starter-kit:spec \(existing code: its take-over part\)/);
});

// The real thing: every recipe's setup, step by step, into a project that already has the kit's records, then its checks.
test("every recipe sets up for real and passes its own checks (KIT_PRESET_SCAFFOLD=1)", { skip: !process.env.KIT_PRESET_SCAFFOLD, timeout: 3_600_000 }, () => {
  const only = process.env.KIT_PRESET_SCAFFOLD === "1" ? null : process.env.KIT_PRESET_SCAFFOLD.split(",");
  for (const p of presets.filter((x) => !only || only.includes(x.id))) {
    const setup = tmp();
    const project = tmp();
    try {
      writeFileSync(join(project, "CLAUDE.md"), "# Project\n");
      writeFileSync(join(project, "ROADMAP.md"), "# Roadmap\n");
      writeFileSync(join(project, ".gitignore"), ".env\n");
      const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: "pipe", encoding: "utf8", shell: true, timeout: 900_000 });
      for (const c of p.scaffold) run(c, setup);
      merge(join(setup, "app"), project, p.skip ?? []);
      assert.equal(readFileSync(join(project, "CLAUDE.md"), "utf8"), "# Project\n", `${p.id}: the project's files are untouched`);
      run("npm install", project);
      for (const c of addCommands(p)) run(c, project);
      for (const a of p.after ?? []) if (a.run) run(a.run.replaceAll("{kit}", HERE.replaceAll("\\", "/")), project);
      for (const c of p.verify) {
        try {
          run(c, project);
        } catch (e) {
          assert.fail(`${p.id}: "${c}" failed\n${(e.stdout ?? "").slice(-2000)}\n${(e.stderr ?? "").slice(-2000)}`);
        }
      }
    } finally {
      rmSync(setup, { recursive: true, force: true });
      rmSync(project, { recursive: true, force: true });
    }
  }
});
