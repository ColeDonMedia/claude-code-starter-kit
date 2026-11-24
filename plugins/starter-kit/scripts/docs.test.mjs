// Keeps the kit's own records honest. Run: node --test plugins/starter-kit/scripts/docs.test.mjs
// A release is not finished until the changelog and the handoff note describe it.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(PLUGIN, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const version = JSON.parse(readFileSync(join(PLUGIN, ".claude-plugin", "plugin.json"), "utf8")).version;

test("CHANGELOG.md has an entry for the current version, newest first", () => {
  const log = read("CHANGELOG.md");
  assert.ok(log.includes(`## [${version}]`), `CHANGELOG.md has no "## [${version}]" entry`);
  const versions = [...log.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map((m) => m[1]);
  assert.equal(versions[0], version, "the newest entry must be the current version");
  const num = (v) => v.split(".").reduce((a, n) => a * 1000 + Number(n), 0);
  assert.deepEqual([...versions].sort((a, b) => num(b) - num(a)), versions, "entries must be newest first");
});

test("HANDOFF.md exists and is about the current version", () => {
  assert.ok(existsSync(join(REPO, "HANDOFF.md")));
  const h = read("HANDOFF.md");
  assert.ok(h.includes(`version ${version}`), `HANDOFF.md should say "version ${version}"`);
  assert.ok(h.split("\n").length <= 60, "keep the handoff short");
  for (const heading of ["Not verified", "Do this first next session"]) assert.ok(h.includes(heading), `HANDOFF.md needs a "${heading}" section`);
});

test("the README mentions every command and every hook, so nothing is undocumented", () => {
  const readme = read("README.md");
  for (const f of readdirSync(join(PLUGIN, "commands"))) {
    const name = f.replace(/\.md$/, "");
    assert.ok(readme.includes(`/starter-kit:${name}`) || readme.includes(`starter-kit:${name}`), `README does not mention the "${name}" command`);
  }
  for (const f of readdirSync(join(PLUGIN, "agents"))) {
    const name = f.replace(/\.md$/, "");
    assert.ok(readme.includes(`\`${name}\``) || readme.includes(`${name}\` agent`) || readme.includes(`${name} agent`), `README does not mention the "${name}" agent`);
  }
});

test("every hook and script opens with a comment explaining what it is for", () => {
  for (const dir of ["hooks", "scripts"]) {
    for (const f of readdirSync(join(PLUGIN, dir)).filter((x) => x.endsWith(".mjs") && !x.endsWith(".test.mjs"))) {
      const head = readFileSync(join(PLUGIN, dir, f), "utf8").split("\n").slice(0, 3);
      assert.ok(head.filter((l) => l.startsWith("//")).length >= 2, `${dir}/${f} needs an explanatory comment at the top`);
    }
  }
});

test("every hook is registered, and every registered hook exists", () => {
  const cfg = JSON.parse(readFileSync(join(PLUGIN, "hooks", "hooks.json"), "utf8"));
  const registered = new Set(JSON.stringify(cfg).match(/hooks\/([a-z-]+\.mjs)/g)?.map((s) => s.replace("hooks/", "")));
  const onDisk = readdirSync(join(PLUGIN, "hooks")).filter((x) => x.endsWith(".mjs") && !x.endsWith(".test.mjs"));
  for (const f of registered) assert.ok(onDisk.includes(f), `hooks.json names ${f}, which does not exist`);
  for (const f of onDisk) assert.ok(registered.has(f) || f === "auto-update.mjs", `${f} is not registered in hooks.json`);
});
