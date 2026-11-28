// Keeps the kit's own records honest. Run: node --test plugins/starter-kit/scripts/docs.test.mjs
// A release is not finished until the changelog and the handoff note describe it.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), "..");
const withoutScope = (text) => text.replace(/^## Scope\n(?:- \*\*[^*]+:\*\* .+\n?)+/m, "");
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

const HANDOFF = join("docs", "development", "HANDOFF.md");
test("the kit's HANDOFF.md exists and is about the current version", () => {
  assert.ok(existsSync(join(REPO, HANDOFF)));
  const h = read(HANDOFF);
  assert.ok(h.includes(`version ${version}`), `HANDOFF.md should say "version ${version}"`);
  assert.ok(h.split("\n").length <= 60, "keep the handoff short");
  for (const heading of ["Not verified", "Do this first next session"]) assert.ok(h.includes(heading), `HANDOFF.md needs a "${heading}" section`);
});

test("the repo's own CLAUDE.md never tells a session to spend API tokens on a headless run", () => {
  const rules = read("CLAUDE.md");
  assert.ok(!/claude-code@|\s-p\s+["']|--plugin-dir|--output-format/.test(rules), "CLAUDE.md must not instruct a headless or scripted model run");
  assert.match(rules, /NEVER SPEND API TOKENS/);
});

// The README is a short front page; the detail lives in docs/ (one page per topic).
const docPages = (dir = join(REPO, "docs")) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? docPages(join(dir, e.name)) : e.name.endsWith(".md") ? [join(dir, e.name)] : []));
const pages = [join(REPO, "README.md"), ...docPages()];

test("the README lists every command and every agent, so nothing is undocumented", () => {
  const readme = read("README.md");
  for (const f of readdirSync(join(PLUGIN, "commands"))) {
    const name = f.replace(/\.md$/, "");
    assert.ok(readme.includes(`/starter-kit:${name}`), `README does not list the "${name}" command`);
  }
  for (const f of readdirSync(join(PLUGIN, "agents"))) {
    const name = f.replace(/\.md$/, "");
    assert.ok(readme.includes(`\`${name}\``), `README does not list the "${name}" agent`);
  }
});

// The owner wants the GitHub page detailed (no word limit): the README walks through every stage and links the full walkthrough,
// and that walkthrough names every workflow, so a new command can't go unexplained.
test("the README walks through every step, the full walkthrough covers every workflow, and every docs page links back", () => {
  const readme = read("README.md");
  assert.ok(readme.includes("## Every step, from idea to launch"), "the README has no step-by-step section");
  assert.ok(readme.includes("docs/every-step.md"), "the README does not link the full walkthrough");
  const walk = read("docs/every-step.md");
  for (const f of readdirSync(join(PLUGIN, "commands"))) {
    const name = f.replace(/\.md$/, "");
    assert.ok(walk.includes(`\`${name}\``), `docs/every-step.md does not explain the "${name}" workflow`);
  }
  assert.ok(existsSync(join(REPO, "docs", "assets", "logo.png")), "the README logo is missing");
  for (const p of docPages().filter((x) => !x.includes(`${join("docs", "development")}`))) {
    assert.ok(readFileSync(p, "utf8").includes("../README.md"), `${p.replace(REPO, "")} has no link back to the README`);
  }
});

test("every relative link and image in the README and docs points at a file that exists", () => {
  for (const p of pages) {
    const text = readFileSync(p, "utf8").replace(/```[\s\S]*?```/g, "");
    const targets = [...text.matchAll(/\]\(([^)\s]+)\)/g), ...text.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    for (const t of targets) {
      if (/^(https?:|mailto:|#)/.test(t)) continue;
      const file = t.split("#")[0];
      assert.ok(existsSync(join(dirname(p), file)), `${p.replace(REPO, "")} links to ${t}, which does not exist`);
    }
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
// procedures/ holds a command's full procedure, read on demand by whoever runs it (the conductor, or the main conversation)
const workflowFiles = readdirSync(join(PLUGIN, "procedures")).map((f) => join(PLUGIN, "procedures", f));
const textFiles = [
  ...readdirSync(join(PLUGIN, "commands")).map((f) => join(PLUGIN, "commands", f)),
  ...workflowFiles,
  ...readdirSync(join(PLUGIN, "agents")).map((f) => join(PLUGIN, "agents", f)),
  ...readdirSync(join(PLUGIN, "rules")).map((f) => join(PLUGIN, "rules", f)), // the builder's rule sheets, read on demand
  join(PLUGIN, "hooks", "session-start.mjs"),
  join(PLUGIN, "hooks", "docs-gate.mjs"),
  join(PLUGIN, "hooks", "verify-gate.mjs"),
  ...pages.filter((p) => !p.includes(join("docs", "development"))), // the plan names scripts that don't exist yet
];

test("every script that a command or agent tells Claude to run really exists", () => {
  const scripts = new Set(readdirSync(join(PLUGIN, "scripts")));
  for (const f of textFiles) {
    for (const m of readFileSync(f, "utf8").matchAll(/(?:<SCRIPTS>|<plugin>\/scripts|scripts)\/([a-z-]+\.mjs)/g)) {
      assert.ok(scripts.has(m[1]), `${f.replace(REPO, "")} refers to scripts/${m[1]}, which does not exist`);
    }
  }
});

test("commands and agents name the kit's files only through ${CLAUDE_PLUGIN_ROOT}, never an undefined placeholder", () => {
  for (const f of textFiles.filter((x) => /[\\/](commands|agents|procedures)[\\/]/.test(x))) {
    const t = readFileSync(f, "utf8");
    for (const bad of ["<SCRIPTS>", "<plugin>"]) assert.ok(!t.includes(bad), `${f.replace(REPO, "")} still uses ${bad}`);
    for (const m of t.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([a-z]+)\//g)) assert.ok(existsSync(join(PLUGIN, m[1])), `${f.replace(REPO, "")} points at ${m[1]}/, which the plugin does not have`);
  }
  assert.ok(existsSync(join(PLUGIN, "templates", "speed.spec.js")));
});

test("hooks run only for the tools that need them (no hook process for every Read, Grep or Glob), and every shell tool is covered", () => {
  const cfg = JSON.parse(readFileSync(join(PLUGIN, "hooks", "hooks.json"), "utf8")).hooks;
  for (const ev of ["PreToolUse", "PostToolUse"]) {
    // The main group covers every shell and edit tool; extra groups (web fetches, MCP tools) are narrow. None runs for reads.
    const all = cfg[ev].flatMap((g) => {
      assert.ok(g.matcher && g.matcher !== "*" && g.matcher !== ".*", `${ev} must not match every tool`);
      return g.matcher.split("|");
    });
    for (const t of ["Bash", "PowerShell", "Edit", "Write", "MultiEdit", "Skill", "Agent"]) assert.ok(cfg[ev][0].matcher.split("|").includes(t), `${ev} does not match ${t}`);
    for (const t of ["Read", "Grep", "Glob"]) assert.ok(!all.includes(t), `${ev} should not start a hook for ${t}`);
    assert.equal(new Set(all).size, all.length, `${ev}: a tool matched by two groups would run the hooks twice`);
  }
  assert.ok(cfg.SubagentStart, "subagents must be told where the kit's scripts are");
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
  for (const f of textFiles.filter((x) => /[\\/](commands|procedures)[\\/]/.test(x))) {
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

// The same YAML rule for agents, plus the settings that keep reviewers read-only. A broken header makes Claude Code load the
// agent with no description and ALL tools, silently (2.12.0 shipped two agents like that).
const frontmatter = (text) => (/^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "");
test("agent headers are valid YAML, complete, and read-only agents cannot write", () => {
  for (const n of agentNames) {
    const head = frontmatter(readFileSync(join(PLUGIN, "agents", `${n}.md`), "utf8"));
    const field = (k) => new RegExp(`^${k}:\\s*(.+)$`, "m").exec(head)?.[1]?.trim() ?? "";
    for (const k of ["name", "description", "model"]) assert.ok(field(k), `agents/${n}.md has no ${k}`);
    for (const k of ["name", "description", "model", "tools", "disallowedTools"]) {
      const v = field(k);
      if (v && !/^["']/.test(v)) assert.ok(!v.includes(": ") && !v.includes(" #"), `agents/${n}.md: ${k} contains ': ' or ' #' unquoted; wrap it in quotes`);
    }
    assert.ok(field("tools") || field("disallowedTools"), `agents/${n}.md must limit its tools`);
    if (/read-only/i.test(field("description"))) {
      const tools = field("tools");
      const denied = field("disallowedTools");
      if (tools) assert.ok(!/\b(Write|Edit|MultiEdit|NotebookEdit)\b/.test(tools), `agents/${n}.md says read-only but lists a writing tool`);
      else assert.ok(/\bWrite\b/.test(denied) && /\bEdit\b/.test(denied), `agents/${n}.md says read-only but does not disallow Write and Edit`);
    }
  }
});

// A subagent can start subagents of its own unless the Agent tool is taken away. A deny-list keeps every tool it does not
// name, so it must name Agent; and a Haiku agent (the cheapest model, which reads untrusted text) may only read.
const WRITE_OR_RUN = ["Write", "Edit", "MultiEdit", "NotebookEdit", "Bash", "PowerShell", "Monitor", "Agent"];
const listOf = (v) => v.split(",").map((s) => s.trim()).filter(Boolean);
// The one exception is the conductor, which runs a whole feature workflow in its own context and must start the builder and the
// reviewers. It must use an allow-list, may not run on Haiku, and has no web tools; hooks/agent-route.mjs limits what it may start.
test("only the conductor can start other agents, and a Haiku agent can only read", () => {
  const starters = [];
  for (const n of agentNames) {
    const head = frontmatter(readFileSync(join(PLUGIN, "agents", `${n}.md`), "utf8"));
    const field = (k) => new RegExp(`^${k}:\\s*(.+)$`, "m").exec(head)?.[1]?.trim() ?? "";
    const tools = listOf(field("tools"));
    const denied = listOf(field("disallowedTools"));
    if (n === "conductor") {
      assert.ok(tools.includes("Agent") && tools.includes("SendMessage"), "the conductor needs Agent and SendMessage in its allow-list");
      assert.ok(!tools.some((t) => /^Web/.test(t)) && field("model") !== "haiku", "the conductor may not read the web or run on Haiku");
    }
    if (tools.includes("Agent") || tools.includes("Task")) starters.push(n);
    else if (!tools.length) assert.ok(denied.includes("Agent"), `agents/${n}.md uses a deny-list without Agent, so it can start other agents`);
    if (field("model") === "haiku") {
      for (const t of WRITE_OR_RUN) assert.ok(tools.length ? !tools.includes(t) : denied.includes(t), `agents/${n}.md runs on Haiku but can use ${t}`);
    }
  }
  assert.deepEqual(starters, ["conductor"], "only the conductor may start other agents");
});

// The MODEL RULE: models are decided in scripts/model-route.mjs. Each agent file carries that script's starting model and effort,
// so an agent launched without a model never runs on something the script would not pick.
test("every agent file starts on the model and effort that model-route.mjs gives its role", async () => {
  const { baseline } = await import("./model-route.mjs");
  for (const n of agentNames) {
    const head = frontmatter(readFileSync(join(PLUGIN, "agents", `${n}.md`), "utf8"));
    const b = baseline(n);
    assert.equal(/^model:\s*(\S+)/m.exec(head)?.[1], b.model, `agents/${n}.md: model should be ${b.model}`);
    assert.equal(/^effort:\s*(\S+)/m.exec(head)?.[1], b.effort, `agents/${n}.md: effort should be ${b.effort}`);
  }
});

test("every workflow that launches a routed agent asks model-route.mjs first, and the builder escalates once", () => {
  const routed = /`(conductor|implementer|reviewer|challenger|ui-reviewer|investigator|red-team|user-tester|security-reviewer|scout)` agent/;
  for (const f of [...commandNames.map((n) => join(PLUGIN, "commands", `${n}.md`)), ...workflowFiles]) {
    const t = readFileSync(f, "utf8");
    if (routed.test(t)) assert.match(t, /scripts\/model-route\.mjs/, `${f.replace(PLUGIN, "")} launches a kit agent without asking model-route.mjs which model`);
  }
  const feature = readFileSync(join(PLUGIN, "procedures", "feature.md"), "utf8");
  assert.match(feature, /--attempt 3/, "the feature workflow must escalate the builder after two failed rounds");
  // the Scope block has its own limit (scope.test.mjs); these limits keep the steps short
  const words = withoutScope(readFileSync(join(PLUGIN, "agents", "challenger.md"), "utf8")).split(/\s+/).length;
  assert.ok(words <= 650, `challenger.md is ${words} words`);
});

// /starter-kit:feature is a short dispatcher: the procedure lives in procedures/feature.md and runs in a fresh conductor context,
// with the main conversation as the fallback, so the main conversation grows by a short report per feature.
test("the feature command dispatches to a fresh conductor, keeps the old flow as a fallback, and stays short", () => {
  const cmd = readFileSync(join(PLUGIN, "commands", "feature.md"), "utf8");
  const words = withoutScope(cmd.replace(/^---[\s\S]*?---/, "")).split(/\s+/).filter(Boolean).length;
  assert.ok(words <= 260, `commands/feature.md is ${words} words; the procedure belongs in procedures/feature.md`);
  for (const must of [/build-state\.mjs" --project \. --plan/, /`conductor` agent/, /--role conductor/, /NEEDS OWNER/, /CANNOT DELEGATE/, /procedures\/feature\.md/, /RUN HERE/]) assert.match(cmd, must);
  const conductor = readFileSync(join(PLUGIN, "agents", "conductor.md"), "utf8");
  assert.ok(withoutScope(conductor).split(/\s+/).length <= 330, "the conductor's instructions stay short");
  for (const must of [/procedures\/feature\.md/, /RESULT: MERGED/, /CANNOT DELEGATE/, /never start another conductor/i]) assert.match(conductor, must);
  const flow = readFileSync(join(PLUGIN, "procedures", "feature.md"), "utf8");
  assert.match(flow, /build-state\.mjs" --project \. --set/);
  assert.ok(!/\$ARGUMENTS/.test(flow), "a workflow file is read, not invoked: it has no $ARGUMENTS");
});

// Found by the first live trial: a detailed request led Claude to skip the plan, and git had no author, so commits got a made-up name.
test("a small app still gets a short plan, and setup takes the commit name from the GitHub account, never a personal email", () => {
  const spec = readFileSync(join(PLUGIN, "commands", "spec.md"), "utf8");
  assert.match(spec, /SHORT plan, never\s+none/);
  assert.match(spec, /A detailed request is not a reason to skip this/);
  const init = readFileSync(join(PLUGIN, "commands", "init.md"), "utf8");
  assert.match(init, /gh api user/);
  assert.match(init, /users\.noreply\.github\.com/);
  assert.match(init, /never invent a name, and never change the computer-wide git settings/);
  assert.match(init, /run `\/starter-kit:spec` next: no app code before the owner has approved a plan/);
});

test("token savings stay in the instructions: re-review only the fix, edit instead of rewriting, a small CLAUDE.md template", () => {
  const feature = readFileSync(join(PLUGIN, existsSync(join(PLUGIN, "procedures", "feature.md")) ? "procedures" : "commands", "feature.md"), "utf8");
  assert.match(feature, /only the fix, and only by the reviewers that objected/);
  assert.match(readFileSync(join(PLUGIN, "agents", "implementer.md"), "utf8"), /small edits; write a whole file only when/);
  assert.match(readFileSync(join(PLUGIN, "commands", "tdd.md"), "utf8"), /small edits rather than rewriting/);
  // every agent launch re-reads the project's CLAUDE.md: keep the template init writes far under the official 200-line advice
  const blocks = [...readFileSync(join(PLUGIN, "commands", "init.md"), "utf8").matchAll(/```markdown\n([\s\S]*?)```/g)].map((m) => m[1].split("\n").length);
  assert.ok(Math.max(...blocks) <= 80, `the longest CLAUDE.md template block is ${Math.max(...blocks)} lines`);
});

test("every agent pins its effort, and turn limits are whole numbers", () => {
  for (const n of agentNames) {
    const head = frontmatter(readFileSync(join(PLUGIN, "agents", `${n}.md`), "utf8"));
    assert.match(head, /^effort: (low|medium|high|xhigh|max)$/m, `agents/${n}.md has no valid effort`);
    const turns = /^maxTurns:\s*(.+)$/m.exec(head)?.[1];
    if (turns !== undefined) assert.match(turns.trim(), /^[1-9]\d{0,3}$/, `agents/${n}.md has a bad maxTurns`);
  }
});

test("every command file has a description that says WHEN to use it (that is what makes Claude pick it)", () => {
  for (const n of commandNames) {
    const d = /^description:\s*(.+)$/m.exec(readFileSync(join(PLUGIN, "commands", `${n}.md`), "utf8"))?.[1] ?? "";
    assert.ok(d.length > 60, `commands/${n}.md has no real description`);
  }
});

// Setup offers "ask only before risky actions": routine work runs freely, the guards still question risky commands, and
// nothing allows every command or a push.
test("setup offers three permission levels, recommends risky-only, and never allows everything or a push", () => {
  const init = readFileSync(join(PLUGIN, "commands", "init.md"), "utf8");
  assert.match(init, /\*\*"Ask me only before risky actions" \(recommended\)\.\*\*/);
  assert.match(init, /\*\*"Only tests and builds"\*\*/);
  assert.match(init, /\*\*"Ask me every time"\*\*/);
  assert.match(init, /Bash\(git commit:\*\)/);
  assert.match(init, /guards still question every risky command even when it is allowed/);
  assert.match(init, /Never add `Bash\(\*\)`, `Bash\(git push:\*\)`/);
  assert.doesNotMatch(init.replace(/Never add[^\n]*/, ""), /`Bash\(git push:\*\)`|`Bash\(\*\)`|`Bash\(rm:\*\)`/);
});
