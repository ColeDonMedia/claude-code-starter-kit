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
  // hooks.json starts everything through gate.mjs, which runs the individual hook scripts; each must be named there
  const gate = readFileSync(join(PLUGIN, "hooks", "gate.mjs"), "utf8");
  assert.ok(registered.has("gate.mjs"), "hooks.json must start gate.mjs");
  for (const f of onDisk.filter((x) => x !== "gate.mjs")) assert.ok(registered.has(f) || gate.includes(`"${f.replace(/\.mjs$/, "")}"`), `${f} is not run by gate.mjs or registered in hooks.json`);
});

// ---- no dead references: the instructions must only point at things that exist ----
const commandNames = readdirSync(join(PLUGIN, "commands")).map((f) => f.replace(/\.md$/, ""));
const agentNames = readdirSync(join(PLUGIN, "agents")).map((f) => f.replace(/\.md$/, ""));
const textFiles = [
  ...readdirSync(join(PLUGIN, "commands")).map((f) => join(PLUGIN, "commands", f)),
  ...readdirSync(join(PLUGIN, "agents")).map((f) => join(PLUGIN, "agents", f)),
  join(PLUGIN, "hooks", "session-start.mjs"),
  join(PLUGIN, "hooks", "docs-gate.mjs"),
  join(PLUGIN, "hooks", "verify-gate.mjs"),
  join(REPO, "README.md"),
];

test("every script that a command or agent tells Claude to run really exists", () => {
  const scripts = new Set(readdirSync(join(PLUGIN, "scripts")));
  for (const f of textFiles) {
    for (const m of readFileSync(f, "utf8").matchAll(/(?:<SCRIPTS>|<plugin>\/scripts|scripts)\/([a-z-]+\.mjs)/g)) {
      assert.ok(scripts.has(m[1]), `${f.replace(REPO, "")} refers to scripts/${m[1]}, which does not exist`);
    }
  }
});

test("every /starter-kit:command that anything mentions really exists", () => {
  for (const f of textFiles) {
    for (const m of readFileSync(f, "utf8").matchAll(/starter-kit:([a-z-]+)/g)) {
      if (m[1] === "managed" || m[1] === "pre-commit") continue; // markers, not commands
      assert.ok(commandNames.includes(m[1]) || agentNames.includes(m[1]), `${f.replace(REPO, "")} mentions /starter-kit:${m[1]}, which does not exist`);
    }
  }
});

test("every agent that a command launches really exists, and the routing table can reach every workflow command", () => {
  for (const f of textFiles.filter((x) => x.includes("commands"))) {
    for (const m of readFileSync(f, "utf8").matchAll(/`(researcher|reviewer|ui-reviewer|security-reviewer|implementer|red-team|challenger|[a-z-]+)` agent/g)) {
      assert.ok(agentNames.includes(m[1]), `${f.replace(REPO, "")} launches the "${m[1]}" agent, which does not exist`);
    }
  }
  const routing = readFileSync(join(PLUGIN, "hooks", "session-start.mjs"), "utf8");
  for (const c of commandNames.filter((n) => n !== "init" && n !== "review")) assert.ok(routing.includes(`/starter-kit:${c}`), `the routing table never mentions /starter-kit:${c}`);
});

test("command descriptions are valid YAML (an unquoted ': ' silently drops the whole header)", () => {
  for (const n of commandNames) {
    const d = /^description:\s*(.+)$/m.exec(readFileSync(join(PLUGIN, "commands", `${n}.md`), "utf8"))?.[1] ?? "";
    if (!/^["']/.test(d)) assert.ok(!d.includes(": ") && !d.includes(" #"), `commands/${n}.md has an unquoted description containing ': ' or ' #'; wrap it in quotes`);
  }
});

test("every command file has a description that says WHEN to use it (that is what makes Claude pick it)", () => {
  for (const n of commandNames) {
    const d = /^description:\s*(.+)$/m.exec(readFileSync(join(PLUGIN, "commands", `${n}.md`), "utf8"))?.[1] ?? "";
    assert.ok(d.length > 60, `commands/${n}.md has no real description`);
  }
});
