// Round 7 (2.25.0): holes found by a review that ran the real hooks against a throwaway project. Every case here got through
// before this release. Push gate, secret guard, file guard, the shell tools no hook watched, off-switches a project could set
// without the owner's approval, a check that could not run being recorded as passed, and the pre-ship pass marker.
// Run: node --test plugins/starter-kit/hooks/gaps.test.mjs (and again with KIT_VIA_GATE=1).
// Fake secrets are assembled from pieces at runtime so this file never contains a real-looking key.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hookPath } from "../scripts/test-via-gate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = join(HERE, "gate.mjs");
const SHIP_MARK = join(HERE, "..", "scripts", "ship-mark.mjs");
const DATA = realpathSync(mkdtempSync(join(tmpdir(), "gaps-data-")));
process.env.KIT_DATA_DIR = DATA;
const { trustEntries, entriesOf, newProjectMarker } = await import("../scripts/trust-lib.mjs");
const temps = [DATA];
test.after(() => temps.forEach((d) => rmSync(d, { recursive: true, force: true })));

const KEY = "AKIA" + "IOSFODNN7ZQ4XB2K";
const g = (dir, ...a) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...a], { cwd: dir, encoding: "utf8" });

function project({ managed = true, files = {} } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "gaps-")));
  temps.push(dir);
  const put = (rel, text) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  };
  put("README.md", "hello\n");
  put("src/app.js", "export const a = 1;\n");
  if (managed) put("CLAUDE.md", "<!-- starter-kit:managed -->\n# x\n");
  for (const [f, t] of Object.entries(files)) put(f, t);
  g(dir, "init", "-q", "-b", "main");
  g(dir, "add", "-A");
  g(dir, "commit", "-q", "-m", "first");
  return { dir, put };
}

// Runs one hook (alone, or through the merged runner when KIT_VIA_GATE=1) and says what it decided.
function hook(file, dir, payload, env = {}) {
  const r = spawnSync(process.execPath, [hookPath(HERE, file)], {
    input: JSON.stringify({ cwd: dir, session_id: "s", ...payload }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, KIT_DATA_DIR: DATA, STARTER_KIT_FLIGHT_DIR: DATA, ...env },
  });
  let decision = r.status === 2 ? "block" : "allow";
  try {
    const j = JSON.parse(r.stdout);
    decision = j.hookSpecificOutput?.permissionDecision ?? (j.decision === "block" ? "block" : decision);
  } catch {
    /* nothing printed */
  }
  return { decision, out: r.stdout + r.stderr, status: r.status };
}
const shell = (tool, command) => ({ hook_event_name: "PreToolUse", tool_name: tool, tool_use_id: "t", tool_input: { command } });
function expectEach(file, dir, list, want, tool = "Bash") {
  const bad = list.map((c) => ({ c, d: hook(file, dir, shell(tool, c)).decision })).filter((r) => (want === "pass" ? r.d !== "allow" : r.d === "allow"));
  assert.equal(bad.length, 0, `\n${bad.length} of ${list.length} not handled as "${want}":\n${bad.map((r) => `  got ${r.d} for: ${JSON.stringify(r.c)}`).join("\n")}\n`);
}

// ---------- push gate ----------
const PUSHES = [
  "git push", "git status\ngit push", "git status\r\ngit push", "FOO=1 git push", "git -c a=b push", "git --no-pager push", "command git push",
  "time git push", "if true; then git push; fi", "bash -c 'git push origin main'", "git -C . push", "gh repo create x --public --source . --push",
  "gh pr merge 1 --merge", "npm publish", "npx vercel --prod", "env GIT_TRACE=1 git push",
];
const NOT_PUSHES = ["git push --dry-run", 'echo "git push"', "git log --grep=push", "git status", "gh pr view 1", "gh pr list", "gh repo create x --private", "git commit -m 'push later'"];
test("push gate: every way of writing a push or release is held until the pre-ship scan passed", () => {
  const { dir } = project();
  expectEach("push-gate.mjs", dir, PUSHES, "hold");
  expectEach("push-gate.mjs", dir, ["git.exe push", '& "C:\\Program Files\\Git\\cmd\\git.exe" push', "git status; git push"], "hold", "PowerShell");
});
test("push gate: text that only mentions a push, dry runs and read-only gh commands pass", () => expectEach("push-gate.mjs", project().dir, NOT_PUSHES, "pass"));

// ---------- secret guard ----------
test("secret guard: add-and-commit in one command, commit -a and gists are scanned", () => {
  const p = project();
  p.put("config.js", `export const k = "${KEY}";\n`); // untracked
  expectEach("secret-guard.mjs", p.dir, ['git add -A && git commit -m "x"', 'git add . ; git commit -m "x"'], "deny");
  rmSync(join(p.dir, "config.js"));
  p.put("src/app.js", `export const a = "${KEY}";\n`); // tracked, changed, not staged
  expectEach("secret-guard.mjs", p.dir, ['git commit -am "x"', 'git commit -a -m "x"', 'git commit --all -m "x"', 'git commit -qam "x"'], "deny");
  p.put(".env", "PORT=3000\n");
  p.put("leak.txt", `key ${KEY}\n`);
  p.put("notes.txt", "nothing here\n");
  expectEach("secret-guard.mjs", p.dir, ["gh gist create .env", "gh gist create --public leak.txt", "gh gist create -d x notes.txt leak.txt"], "deny");
  expectEach("secret-guard.mjs", p.dir, ["gh gist create notes.txt"], "pass");
});
test("secret guard: a commit -a of clean changes passes", () => {
  const p = project();
  p.put("src/app.js", "export const a = 2;\n");
  expectEach("secret-guard.mjs", p.dir, ['git commit -am "x"'], "pass");
});
test("secret guard: a push written any way is scanned", () => {
  const p = project();
  p.put("src/app.js", `export const a = "${KEY}";\n`);
  g(p.dir, "commit", "-q", "-am", "oops");
  expectEach("secret-guard.mjs", p.dir, ["FOO=1 git push", "git status\ngit push", "command git push", "git --no-pager push", "time git push origin main"], "deny");
});

// ---------- file guard ----------
test("file guard: the kit's installed files, its plan markers and the pre-ship pass marker cannot be edited", () => {
  const { dir } = project();
  const home = homedir();
  const blocked = [
    join(home, ".claude", "plugins", "cache", "starter-kit-marketplace", "starter-kit", "2.24.0", "hooks", "safety-guard.mjs"),
    join(home, ".claude", "plugins", "marketplaces", "starter-kit-marketplace", "plugins", "starter-kit", "hooks", "hooks.json"),
    join(dir, ".claude", "last-full-scan"),
    join(DATA, "new-projects", "0a1b2c3d4e5f"),
    join(home, ".claude", "plugins", "data", "starter-kit", "new-projects", "0a1b2c3d4e5f"),
  ];
  for (const tool of ["Edit", "Write", "MultiEdit"]) {
    for (const f of blocked) assert.equal(hook("file-guard.mjs", dir, { tool_name: tool, tool_input: { file_path: f, content: "x" } }).decision, "deny", `${tool} ${f}`);
    for (const f of [join(dir, "src", "app.js"), join(dir, ".claude", "kit.json"), join(dir, "plugins", "starter-kit", "hooks", "safety-guard.mjs")]) {
      assert.equal(hook("file-guard.mjs", dir, { tool_name: tool, tool_input: { file_path: f, content: "x" } }).decision, "allow", `${tool} ${f}`);
    }
  }
});

// ---------- shell tools no hook watched ----------
test("the Monitor tool and terminal tools are shell tools: hooks.json sends them to the guards, and the guards decide", () => {
  const pre = JSON.parse(readFileSync(join(HERE, "hooks.json"), "utf8")).hooks.PreToolUse;
  const matches = (name) => pre.some((h) => (/^[\w|, -]+$/.test(h.matcher) ? h.matcher.split("|").includes(name) : new RegExp(h.matcher).test(name)));
  for (const t of ["Bash", "PowerShell", "Monitor", "mcp__terminal__run_in_terminal", "mcp__other__run_in_terminal"]) assert.ok(matches(t), `${t} is not sent to the guards`);
  assert.ok(!matches("Read") && !matches("TodoWrite"), "the shell matcher must not catch other tools");
  const { dir } = project();
  for (const tool of ["Monitor", "mcp__terminal__run_in_terminal"]) {
    const r = spawnSync(process.execPath, [GATE, "pre"], { input: JSON.stringify({ cwd: dir, ...shell(tool, "rm -rf /") }), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: dir, KIT_DATA_DIR: DATA, STARTER_KIT_FLIGHT_DIR: DATA } });
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, "deny", tool);
    const c = spawnSync(process.execPath, [GATE, "pre"], { input: JSON.stringify({ cwd: dir, ...shell(tool, "starter-kit-canary") }), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: dir, KIT_DATA_DIR: DATA, STARTER_KIT_FLIGHT_DIR: DATA } });
    assert.match(c.stdout, /canary ok/, tool);
  }
});
test("agents that use a deny-list also deny the Monitor tool, which runs shell commands", () => {
  for (const n of ["researcher", "ui-reviewer"]) {
    const head = readFileSync(join(HERE, "..", "agents", `${n}.md`), "utf8").split("---")[1];
    assert.match(/^disallowedTools:(.*)$/m.exec(head)?.[1] ?? "", /\bMonitor\b/, n);
  }
});

// ---------- off-switches need the owner's approval ----------
const FAILING = ['node -e "process.exit(1)"'];
function stopProject(cfg) {
  const p = project();
  p.put(".claude/kit.json", JSON.stringify({ flightLog: false, ...cfg }));
  trustEntries(p.dir, entriesOf({ verify: FAILING }));
  p.put("src/app.js", "export const a = 2;\n");
  return p;
}
test("a project file alone cannot switch off the stop-time checks; once the owner approves the switch, it can", () => {
  for (const sw of [{ verifyGate: false }, { auto: false }]) {
    const p = stopProject({ verify: FAILING, ...sw });
    trustEntries(p.dir, entriesOf({ verify: FAILING })); // the checks are approved, the switch is not
    assert.equal(hook("verify-gate.mjs", p.dir, {}).decision, "block", JSON.stringify(sw));
    rmSync(join(p.dir, ".claude", "last-verified"), { force: true });
    trustEntries(p.dir, entriesOf({ verify: FAILING, ...sw }));
    assert.equal(hook("verify-gate.mjs", p.dir, {}).decision, "allow", `${JSON.stringify(sw)} approved`);
  }
  const d = stopProject({ docsGate: false });
  g(d.dir, "commit", "-q", "-am", "code");
  assert.equal(hook("docs-gate.mjs", d.dir, {}).decision, "block", "docsGate unapproved");
  rmSync(join(d.dir, ".claude", "last-docs-check"), { force: true });
  trustEntries(d.dir, entriesOf({ docsGate: false }));
  assert.equal(hook("docs-gate.mjs", d.dir, {}).decision, "allow", "docsGate approved");
});
test("a project file alone cannot switch off the plan check", () => {
  const p = project({ managed: false });
  p.put(".claude/kit.json", JSON.stringify({ planGate: false }));
  mkdirSync(dirname(newProjectMarker(p.dir)), { recursive: true });
  writeFileSync(newProjectMarker(p.dir), "");
  const edit = { tool_name: "Write", tool_input: { file_path: join(p.dir, "src", "server.js"), content: "x" } };
  assert.equal(hook("plan-gate.mjs", p.dir, edit).decision, "deny");
  trustEntries(p.dir, entriesOf({ planGate: false }));
  assert.equal(hook("plan-gate.mjs", p.dir, edit).decision, "allow");
});
test("every switch a hook reads can be approved (the snapshot switch could never be turned off before)", () => {
  const all = entriesOf({ verifyGate: false, docsGate: false, planGate: false, snapshots: false, autoUpdate: false });
  for (const s of ["verifyGate", "docsGate", "planGate", "snapshots", "autoUpdate"]) assert.ok(all.includes(`switch:${s}`), s);
});

// ---------- a check that could not run is not a pass ----------
test("an approved check that could not run is said once and never recorded as passed", () => {
  const p = project();
  p.put("missing.js", 'console.error("sh: 1: vitest: not found"); process.exit(127);\n');
  const cfg = { verify: ["node missing.js"], flightLog: false };
  p.put(".claude/kit.json", JSON.stringify(cfg));
  trustEntries(p.dir, entriesOf(cfg));
  p.put("src/app.js", "export const a = 3;\n");
  const first = hook("verify-gate.mjs", p.dir, {});
  assert.equal(first.decision, "block");
  assert.match(first.out, /could not run/i);
  assert.notEqual(JSON.parse(readFileSync(join(p.dir, ".claude", "last-verified"), "utf8")).ok, true);
  assert.equal(hook("verify-gate.mjs", p.dir, {}).decision, "allow", "said once per state of the code");
});

// ---------- the pre-ship pass marker is written by a script that checks first ----------
function shipMark(dir) {
  return spawnSync(process.execPath, [SHIP_MARK, "--project", dir], { encoding: "utf8", env: { ...process.env, KIT_DATA_DIR: DATA } });
}
test("ship-mark: refuses with uncommitted changes, unapproved or failing checks; records only a clean, passing commit", () => {
  const PASSING = ['node -e "process.exit(0)"'];
  const p = project();
  const marker = join(p.dir, ".claude", "last-full-scan");
  p.put(".claude/kit.json", JSON.stringify({ verify: PASSING }));
  g(p.dir, "add", "-A");
  g(p.dir, "commit", "-q", "-m", "settings");
  assert.notEqual(shipMark(p.dir).status, 0, "checks not approved");
  trustEntries(p.dir, entriesOf({ verify: PASSING }));
  p.put("src/app.js", "export const a = 9;\n");
  assert.notEqual(shipMark(p.dir).status, 0, "uncommitted change");
  g(p.dir, "commit", "-q", "-am", "work");
  const ok = shipMark(p.dir);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.equal(readFileSync(marker, "utf8").trim(), g(p.dir, "rev-parse", "HEAD").stdout.trim());
  assert.equal(hook("push-gate.mjs", p.dir, shell("Bash", "git push")).decision, "allow", "the push gate accepts the recorded commit");
  p.put(".claude/kit.json", JSON.stringify({ verify: FAILING }));
  trustEntries(p.dir, entriesOf({ verify: FAILING }));
  g(p.dir, "commit", "-q", "-am", "now failing");
  rmSync(marker);
  assert.notEqual(shipMark(p.dir).status, 0, "failing check");
  assert.ok(!existsSync(marker));
});

// ---------- a broken safety guard asks, it never allows everything ----------
test("when the safety guard fails internally, the command is put to the user instead of let through", () => {
  const { dir } = project();
  for (const command of ["rm -rf /", "ls"]) {
    const r = hook("safety-guard.mjs", dir, shell("Bash", command), { KIT_TEST_GUARD_FAULT: "1" });
    assert.notEqual(r.decision, "allow", command);
  }
});
