# Improvement plan — implementation handoff

Written 2026-11-25 against version 2.12.0, after a full audit of the plugin. This is a work list for the next
implementing session (Opus or Sonnet). It is ordered: do the phases in order, one release per phase.

**How to use this file.** Read `CLAUDE.md`, `HANDOFF.md` and this file. Do one phase, release it, tick its tasks here,
then stop and report. Do not start the next phase in the same release.

## Progress

| Phase | Release | State |
|---|---|---|
| 0 — safety and correctness | 2.12.1 | **Done** (P0-1 to P0-9). D1 decided: keep the merged runner, with the canary, self-check and fail-closed net. |
| Owner requests | 2.12.2, 2.13.0 | **Done**: payment keys (2.12.2); sizing an app to its users: scale profile, load test, desktop check (2.13.0). |
| 1 — verifiable | 2.14.0 | Next. Needs owner decisions D2 and D3. |
| 2, 3, 4 | — | Not started. Phase 2 waits for one live trial (P1-6). When P2-1 (rigor dial) is built, combine it with the scale profile: one question pair in `/spec` sets both. |

**Answers from the official docs (2026-11-25, hooks reference, sub-agents page, plugins reference):**
- V1. The tool is `PowerShell`; its input has the command in `tool_input.command`, like Bash. The docs advise `Bash|PowerShell` matchers.
- V2. A matcher of letters, digits, `_`, `-`, spaces, `,` and `|` is an exact list; anything else is an unanchored regex. The subagent
  tool is `Agent` (`Task` is an older alias); the skill tool is `Skill`.
- V3. `SubagentStart` exists, its matcher is the agent type (plugin agents are `<plugin>:<name>`), and it can add `additionalContext`.
  Whether subagents also see the SessionStart note: not stated.
- V4. `${CLAUDE_PLUGIN_ROOT}` is substituted inside skill, command and agent Markdown when Claude Code loads it (not only in hooks.json).
  Not yet seen working live: the session note and the SubagentStart hook give the real path as a fallback.
- V5. PreToolUse and PostToolUse carry `tool_use_id`. `Stop` is the main agent; subagents finish with `SubagentStop`.
- V6. Not checked yet (needed for P1-2).
- V7. Not checked yet (needed for P2-4).
- V8. Exit 0 = go ahead (JSON fields apply); exit 2 = block, stderr goes to Claude; any other code = a non-blocking error, the action goes
  ahead. So failing closed must use exit 2 (it does). Hooks for one event run in parallel; the default timeout is 600 s.

## Ground rules for the implementer

1. **Never spend API tokens.** No `claude -p`, no `npx @anthropic-ai/claude-code`, no headless or SDK model calls, no
   `claude plugin eval`. Local unit tests, `claude plugin validate`, and plain CLI plugin commands only. (`CLAUDE.md` still
   says the opposite in one line; task P0-2 removes it. Until then, ignore that line.)
2. **Tests first.** For every guard change follow the RED-TEAM RULE in `CLAUDE.md`: add the exact command to the fuzz file,
   watch it fail, then fix.
3. **Do not add features that are not in this list.** The kit's main problem is weight, not missing features.
4. **Never loosen a guard to make a test pass.** If a guard blocks something harmless, add the case to the fuzz file and
   narrow the rule.
5. **Every release:** bump `plugin.json`, add a `CHANGELOG.md` entry, rewrite `HANDOFF.md`, run all tests normally AND with
   `KIT_VIA_GATE=1` for the hook tests, run `claude plugin validate plugins/starter-kit`, then push.
6. **Keep the session note under its word limit** (test limit 520; it is at 517 now; P2-9 brings it down).
7. **Public repository:** no names, emails, personal paths, or project details in any file.
8. **Plain words.** The owner is not a programmer. Report what now works, what was not verified, and what you need.
9. Tasks marked **OWNER DECISION** need a yes/no from the owner before you build them. Ask once, with your recommendation.
10. Things to check in the current Claude Code documentation (not from memory) are listed under "Verify against the docs".

Suggested model per task is given as **Opus** (parsers, security semantics, architecture) or **Sonnet** (everything else).
Sizes: S = under an hour, M = a few hours, L = a day or more.

---

## What the audit found (evidence)

Checked on 2026-11-25 on a Windows machine with Node 24. Each line says how it was verified.

| # | Finding | How it was verified |
|---|---|---|
| E1 | The `challenger` and `security-reviewer` agents load with **no description and ALL tools**. Their `description:` lines contain `: ` unquoted, so the YAML header fails to parse and every field is dropped. They are meant to be read-only, and the security reviewer is meant to run on Opus. | A live session's agent list shows both as "Agent from starter-kit plugin (Tools: All tools)". Same bug class as the two commands fixed in 2.6.0. `claude plugin validate` does not report it for agents. |
| E2 | **No guard sees the PowerShell tool.** Every guard (safety, secret, push, package, database) only looks at the Bash tool. On Windows, Claude Code also has a PowerShell tool. | Live probe: a harmless `echo` containing the approval file's name was denied through Bash and ran through PowerShell. The gate's `pipeline()` only treats `tool_name === "Bash"` as a shell. |
| E3 | **Subagents cannot find the kit's scripts.** `implementer.md` and `reviewer.md` say `node "<plugin>/scripts/…"` (9 places). Nothing ever tells a subagent what `<plugin>` is: the session note that defines `<SCRIPTS>` goes to the main session only, and `feature.md` does not pass the path in the brief. `init.md` also uses an undefined `<plugin>/templates/…`. | `grep` of commands and agents. |
| E4 | **The flight recorder slowed every tool call.** Since 2.7.0 the hooks match `*` on PreToolUse and PostToolUse, so every Read, Grep, Glob and Edit starts Node twice. Node starts in about 0.3 s on Windows, so that is roughly 0.6 s added to every tool call. Before 2.7.0 those tools had no hook at all. | `hooks.json`; Node start measured at 0.31–0.39 s natively. |
| E5 | The repo's own `CLAUDE.md` tells the next session to test with a headless `npx … claude-code -p` run, which spends API credit. The owner's standing rule forbids that. Its layout section is also stale (old command list, "under 400 words" for the session note). | Read the file. |
| E6 | **No automated tests on GitHub.** There is no `.github/` folder. The suite has only ever run on one Windows machine. macOS and Linux are untested. | `ls`. |
| E7 | **Auto-update follows `main` directly.** Whatever is pushed to `main` runs on every machine within a day, with no test gate in between. | `hooks/auto-update.mjs`. It checks once per 24 hours at session start; a new version takes effect on the session after that. |
| E8 | **The push gate's "passed" marker is written by Claude itself** (`git rev-parse HEAD > .claude/last-full-scan`, from a prose instruction). Nothing stops it being written without the checks having run. | `commands/full-scan.md` line 69. |
| E9 | **Instruction weight.** `spec` 1,952 words, `init` 2,133, `feature` 1,593, `implementer` 1,348, `full-scan` 976 with 15 numbered steps. `feature`, `implementer` and `full-scan` reference 25 distinct script invocations. The session note is at 517 of 520 words. The more a prompt asks, the less reliably each part is followed. | `wc -w`, `grep`. |
| E10 | **Records overlap.** Decisions live in both `PROJECT.md` (init template) and `DECISIONS.md` (spec, feature). The code map lives in `PROJECT.md` and `ARCHITECTURE.md`. "Current state" and "Next steps" live in `PROJECT.md`, `HANDOFF.md` and `ROADMAP.md`. Two copies of a fact always drift. The init template also still says "three short documents", lists old off-switches, and gives `HANDOFF.md` a 25-line limit while the drift check allows 60. | Read `init.md`, `spec.md`, `feature.md`. |
| E11 | `full-scan` checks speed twice (steps 8 and 14), and its final "ship only when" rule names steps 1–11 only, so it is unclear whether steps 12–15 block. | Read the file. |
| E12 | The approval-file rule in the safety guard is a bare text match, so it blocks any command that merely mentions the file name (a `grep`, an `echo`). | Blocked a read-only audit command live. `safety-guard.mjs` line 279. |
| E13 | The stop-hook check (`verify-gate`) ignores `Size: large`. On a big project the full check list exceeds its timeout and it then does nothing, silently. | `grep`. |
| E14 | The automatic test hooks will run a project's tests against whatever database its `.env` points at. If that is a real database, tests could change or wipe real data. The database guard only looks at commands Claude types. | Reasoning from `verify-gate.mjs`, `test-related.mjs` and `db-lib.mjs`; not reproduced. |
| E15 | Only SQLite rehearsals actually run. Most SaaS apps use Postgres, and neither Postgres nor Docker was available to test with. The schema map cannot read Django, Alembic, Knex or Drizzle migrations. | Known limits, stated in the README. |
| E16 | The speed test measures once, against whatever the dev server serves. One run on an unminified dev build is noisy and will fail for no real reason. | `templates/speed.spec.js`. |
| E17 | Three blocking checks are judgement, not proof: the API pattern scan (HIGH blocks shipping), the UI score below 4, and the built-site check. They can cause endless fix loops. | Read `full-scan.md`, `ui-reviewer.md`. |
| E18 | The merged hook runner (`gate.mjs`) works by swapping `process.stdin`, `process.exit` and `process.stdout.write` inside one process. All 225 hook tests pass through it, but if it breaks, every guard and the session note stop at once, and nothing would say so. It is modestly faster (about 470 ms against 540 ms per shell command). | Tests; timing. Never seen running inside Claude Code. |
| E19 | Small inaccuracies: `HANDOFF.md` said 21 commands (there are 20); `plugin.json` and `marketplace.json` descriptions describe version 1; no author; README is 6,000 words of long paragraphs; data folders use three different environment variable names. | Read the files. |
| E20 | Nothing has run end to end. 378 of 379 unit tests pass (1 skipped), but they test the scripts. The instructions (the markdown) are the product, and no test exercises them. | — |

**Correction to earlier notes:** a restart alone does not load a new version. Auto-update checks once every 24 hours when a
session starts, in the background, and the new version takes effect on the session after that.

---

## Verify against the docs (do this before the tasks that depend on it)

Use the `claude-code-guide` agent or the official docs, not memory. Record each answer in `HANDOFF.md`.

- V1. What is the PowerShell tool's exact `tool_name` and input shape in hook payloads? (Assumed `PowerShell` and `tool_input.command`.)
- V2. Can one hook `matcher` list several tools (`Bash|PowerShell|Edit|Write|MultiEdit|Skill|Agent`)? It is used that way already for edits.
- V3. Do subagents receive a plugin's SessionStart `additionalContext`? Is there a `SubagentStart` hook that can add context?
- V4. Is `${CLAUDE_PLUGIN_ROOT}` expanded inside command and agent markdown, or only in `hooks.json`?
- V5. Do PreToolUse and PostToolUse payloads carry `tool_use_id`? Does `Stop` fire for subagents, or is that `SubagentStop`?
- V6. Can a marketplace entry or a plugin source pin a branch or tag (for a `stable` channel)?
- V7. Do plugins support `skills/<name>/SKILL.md` with extra reference files loaded on demand?
- V8. Does a hook that exits with a non-zero code other than 2 block the tool, or only warn?

---

## Phase 0 — safety and correctness fixes (release 2.12.1)

Small, urgent, low-risk. Nothing here adds a feature.

### P0-1. DONE in 2.12.1 — Fix the two agents whose settings are silently dropped — Sonnet, S
- **Delivered:** agent headers quoted; docs test over every agent header (YAML, required fields, read-only means no writing tools).
- **Why:** E1. Read-only reviewers currently have every tool.
- **Change:** quote the `description:` of `agents/challenger.md` and `agents/security-reviewer.md` (or reword without `: `).
- **Test:** extend the YAML test in `scripts/docs.test.mjs` to agents: an unquoted description containing `: ` or ` #` fails.
  Also assert every agent has `name`, `description`, `model`, and either `tools` or `disallowedTools`, and that every agent
  described as read-only does not list `Write` or `Edit`.
- **Done when:** the test fails on the old files and passes on the new ones.

### P0-2. DONE in 2.12.1 — Remove the instruction that spends API credit; refresh `CLAUDE.md` — Sonnet, S
- **Delivered:** CLAUDE.md rewritten with a NEVER SPEND API TOKENS section and the current layout; docs test forbids headless-run instructions.
- **Why:** E5.
- **Change:** delete the "Test real behavior end to end with a current CLI: `npx …`" rule. Replace it with: "Never spend API
  tokens. Live behaviour is checked by the owner's trial runs (`DOGFOOD.md`) and the hook self-check (P0-6)." Update the layout
  section to the current commands, agents, hooks and scripts, and the session-note limit.
- **Test:** a docs test that `CLAUDE.md` does not contain `claude-code@` or ` -p "`, and that it names every command file.

### P0-3. DONE in 2.12.1 — Tell subagents where the kit's scripts are — Sonnet, S
- **Delivered:** done differently than written, after V3/V4: `${CLAUDE_PLUGIN_ROOT}/scripts/…` in all commands and agents (59 places), a SubagentStart hook (`hooks/subagent-start.mjs`) gives starter-kit agents the real folder, the session note asks for it in every brief; docs test forbids `<SCRIPTS>`/`<plugin>`.
- **Why:** E3. Today every "run this kit script" line in an agent prompt is unresolvable.
- **Change:** in `feature.md`, `review.md`, `redteam.md`, `audit.md` and `full-scan.md`: every agent brief must begin with the
  line `KIT SCRIPTS: <the real folder from the session note>`. In the agents, replace `<plugin>/scripts/` with
  `<KIT SCRIPTS>/` and add one sentence: "The brief gives KIT SCRIPTS; if it is missing, say so and skip the script steps,
  do not guess a path." In `init.md` replace `<plugin>/templates/` with `<SCRIPTS>/../templates/`.
- **Test:** extend the dead-reference test: no file may contain `<plugin>`; every command that launches an agent mentions
  `KIT SCRIPTS`.

### P0-4. DONE in 2.12.1 — Guard the PowerShell tool — Opus, L
- **Delivered:** gate runs all guards for PowerShell; safety guard has a PowerShell reading mode; `guard-fuzz-powershell.test.mjs` (101 cases) plus push-gate and secret-guard tests through PowerShell. Remaining gaps are listed in the README limits.
- **Why:** E2. On Windows every protection can be bypassed today by using the other shell tool.
- **Change (after V1, V2):**
  1. `gate.mjs` `pipeline()`: treat the PowerShell tool as a shell command, so all five guards run.
  2. `safety-guard.mjs`: add a PowerShell reading mode chosen by tool name. Differences from Bash that matter: the escape
     character is the backtick, single quotes are literal, `;` and newlines separate statements, `&` is the call operator,
     here-strings are `@'…'@` and `@"…"@`, and `-EncodedCommand` carries a base64 command (decode and analyse it, as is
     already done for `base64 -d | sh`).
  3. Cover at least: recursive delete of root, home, drive or wide paths (`Remove-Item -Recurse`, `rm`, `del`, `rd`, `ri`,
     `rmdir /s`), `Format-Volume`, `Clear-Disk`, `Remove-Partition`, download-and-run (`iwr … | iex`, `Invoke-Expression`,
     `Start-Process` on a downloaded file), force pushes and history rewrites (same as Bash), reading or uploading secret files
     (`Get-Content .env`, `Invoke-WebRequest -InFile`), writing the approval file or the ship marker by any cmdlet or redirect.
  4. `secret-guard`, `push-gate`, `package-guard`, `db-lib`: confirm their command detection works on PowerShell text
     (statement separators, `&` call operator, `npm.cmd`, `git.exe`).
- **Test:** a new `guard-fuzz-powershell.test.mjs` with at least 60 cases, written BEFORE the code: about 30 that must be
  denied or asked, about 30 everyday commands that must pass (`Get-ChildItem`, `git status`, `npm test`, `Remove-Item
  node_modules -Recurse -Force`, `Select-String`), each run both directly and with `KIT_VIA_GATE=1`.
- **Done when:** the live probe from E2 is blocked the same way through both tools (the owner confirms after updating).
- **Not in scope:** making the parser perfect. State the remaining gaps in the README limits.

### P0-5. DONE in 2.12.1 — Stop hooks from running on every tool call — Sonnet, S
- **Delivered:** matchers are `Bash|PowerShell|Edit|Write|MultiEdit|Skill|Agent|Task`; docs test forbids `*` and checks the list.
- **Why:** E4. About 0.6 s is added to every Read, Grep and Glob for no benefit.
- **Change:** in `hooks.json` replace `"matcher": "*"` on PreToolUse and PostToolUse with the tools that need a hook:
  the shell tools, `Edit|Write|MultiEdit`, `Skill`, and `Agent|Task`. The flight recorder then records those only (they are
  the ones the report uses). Update `flight-report.mjs` text if it mentions other tools.
- **Test:** a test that `hooks.json` has no `*` matcher, and that every tool named in `gate.mjs` `pipeline()` is matched.
- **Done when:** a Read, Grep or Glob call starts no hook process.

### P0-6. DONE in 2.12.1 — Make hook health visible, and fail safe — Opus, M
- **Delivered:** canary (`starter-kit-canary`), once-per-version self-check in the session note (only real hook runs record the version), fail-closed for shell commands in `gate.mjs`, tripwire in the CLAUDE.md template, `scripts/doctor.mjs`; `hooks/health.test.mjs`. No `/doctor` command (routing table is full); `/dogfood` runs the doctor.
- **Why:** E18, E20. If the hooks stop working, nothing says so. This is worth more than choosing between the merged and
  separate hook set-ups, because neither has been watched live.
- **Change:**
  1. **Canary.** The safety guard denies any shell command whose first word is `starter-kit-canary` with the reason
     "canary ok (guards are running)". One per shell tool. It runs nothing.
  2. **Self-check at session start.** When the session note is injected and the installed version differs from the version
     recorded in the data folder (first session after an update), add one line: "Run `starter-kit-canary` once now. If it
     is NOT blocked, tell the user the kit's protections are not running, and stop."
  3. **Tripwire that does not depend on hooks.** Add to the managed `CLAUDE.md` template (and to existing projects on the
     next `/init` pass): "If no STARTER KIT WORKFLOWS note appeared at the start of this session, the kit's hooks are not
     running: tell the user before doing anything else."
  4. **Fail closed.** In `gate.mjs` wrap `main()` so that an unexpected error, or a guard that crashed, on a shell command in
     `pre` mode exits 2 with "A starter-kit guard crashed, so this command was not checked: <one line>. Run the doctor."
     For every other event keep failing open, so a bug cannot lock a session.
  5. **Doctor.** `scripts/doctor.mjs`: Node version (and whether `node:sqlite` exists), git present, plugin version,
     hooks registered, data folder writable, flight log shows recent events, and (when run by Claude) the canary result.
     Plain-words output. Add a `/doctor` command only if the routing table has room after P2-9; otherwise have `/dogfood`
     and the session-start line call the script.
- **Test:** canary denied through both entry points; a guard module that throws makes a shell `pre` exit 2 and an edit `pre`
  exit 0; doctor's output on a healthy and a broken sandbox.
- **OWNER DECISION D1:** keep the merged runner with this safety net (recommended), or go back to one process per hook.
  If the canary ever fails live, go back at once: restore the 2.11.0 `hooks.json` shape plus the PowerShell matcher.

### P0-7. DONE in 2.12.1 — Do not auto-run tests against a remote database — Sonnet, M
- **Delivered:** `remoteDbHosts()` in db-lib; verify-gate and test-related skip, the session note explains; tests in verify-gate, test-related and health tests.
- **Why:** E14.
- **Change:** `verify-gate.mjs` and `test-related.mjs` call `envHosts()` and `isLocalHost()` from `db-lib.mjs` before running
  anything. If the project's local settings name a database host that is not on this computer, they do not run and say why,
  once per session: "This project's settings point at a database that is not on this computer, so automatic tests are off.
  Point local development at a local copy." Add the same warning to the session note.
- **Test:** sandbox with a remote `DATABASE_URL`: no command runs, message printed once. Local or Compose host: runs as before.

### P0-8. DONE in 2.12.1 — Narrow the approval-file rule — Sonnet, S
- **Delivered:** trust-store rule now matches writes only (redirects, tee, cp/mv destination, rm, editors, sed -i, PowerShell cmdlets, inline code that writes); fuzz round 5 (35 deny, 12 allow).
- **Why:** E12.
- **Change:** deny only when the file is the target of a write (redirect, `tee`, `cp`/`mv`/`rm` destination, `sed -i`, an
  editor, `Set-Content`/`Out-File`/`Add-Content`, a script that opens it for writing). Reading or mentioning it is allowed.
- **Test:** fuzz entries first: `grep trusted.json x`, `echo "about trusted.json"`, `cat <path>` pass; every write form is denied.

### P0-9. DONE in 2.12.1 — Small corrections — Sonnet, S
- **Delivered:** all listed items done.
- `plugin.json` and `marketplace.json` descriptions rewritten to describe the current kit; add `author` (a generic name).
- `init.md`: add `dbGuard`, `docsGate`, `flightLog` to the off-switch list; add `Speed test:` and `Size:` lines to the
  CLAUDE.md template; make the `HANDOFF.md` limit match the drift check; remove "three short documents".
- `full-scan.md`: merge steps 8 and 14 into one speed step; make the final rule name every blocking step.
- Add `.gitattributes` (`* text=auto eol=lf`) to end the line-ending warnings.
- `README.md` "Requirements": state the minimum Node version honestly (see P1-5).

---

## Phase 1 — make the kit verifiable (release 2.13.0)

Nothing here changes what the kit does for a project. It makes failures visible before they reach a machine.

### P1-1. Run the tests on GitHub for every push — Sonnet, M
- **Why:** E6. Free for a public repository, no tokens, and it tests macOS and Linux for the first time.
- **Change:** `.github/workflows/tests.yml`: on push and pull request; matrix `ubuntu-latest`, `macos-latest`,
  `windows-latest` × the minimum supported Node and the current LTS; steps: checkout (full history), setup-node,
  `node --test` for hooks and scripts, the hook tests again with `KIT_VIA_GATE=1`. Only official `actions/*` actions pinned to
  a major version, `permissions: contents: read`, no secrets. Do not run `claude plugin validate` there (no CLI).
- **Expect:** path, line-ending and case-sensitivity failures on the first run. Fix the code, not the tests. Tests that need
  the network (the package registry checks) must skip cleanly when offline.
- **OWNER DECISION D2:** allow GitHub Actions on the repository (recommended).

### P1-2. A `stable` channel for auto-update — Sonnet, M (after V6)
- **Why:** E7. A bad push should not reach every machine.
- **Change:** if V6 says a marketplace can pin a branch: machines follow `stable`; a second workflow job fast-forwards
  `stable` to `main` only when the whole matrix is green. If pinning is not possible, document that and add a release
  checklist line instead. After an update, the session note says in one line what changed (the newest changelog heading).
- **Test:** `auto-update.test.mjs` covers the "what changed" line; the workflow is reviewed by hand.

### P1-3. Record what hooks decide, and what payloads look like — Sonnet, M
- **Why:** answers V1 and V5 from real sessions, and makes trial reports exact instead of inferred.
- **Change:** `gate.mjs` passes each guard's outcome to the flight log (`{ev:"decision", guard, level, ms}`: names and a level,
  never the reason text or the command). The recorder also logs the payload's shape once per session per event: key names
  and value types only, never values. `flight-report.mjs` shows "blocked by <guard>" and the slowest hook.
- **Test:** the existing "nothing private is recorded" tests extended to both new records, with a planted secret.

### P1-4. Measure how strong the guards' own tests are — Sonnet, M
- **Why:** the guards are the kit's most important code. `scripts/mutate.mjs` already exists; it has never been pointed at the kit.
- **Change:** run it (in a worktree, as it requires) on `safety-guard.mjs`, `secret-scan.mjs`, `db-lib.mjs`, `migration-check.mjs`,
  `inprocess.mjs`. For every surviving mutant, add a test or record why it is equivalent. Write the scores into `HANDOFF.md`.
- **Done when:** each file's score is recorded and no survivor is unexplained.

### P1-5. State and check the Node version — Sonnet, S
- **Change:** decide the minimum (the code uses `node:sqlite`, which needs a recent Node, only in `db-rehearse.mjs` and
  `schema-map.mjs --sqlite`). Everything else should run on the minimum; those two features print a clear "needs Node X"
  message instead of crashing. The doctor reports it. README states it.
- **Test:** the two features' message when the module is missing (inject the failure).

### P1-6. First live trial — owner in the loop
- **Why:** E20. This is the most valuable item in the whole plan.
- **How (no API tokens):** the owner runs trial 1 from `DOGFOOD.md` in a normal session. Alternative, only with the owner's
  yes: the implementing session starts a separate normal app session in a new empty folder with the trial prompt, then reads
  the flight report afterwards. **OWNER DECISION D3.**
- **Then:** fix what broke, each fix with a test, and log it in `DOGFOOD.md`. **Do not start Phase 2 until one trial has run.**
  Phase 2 should be shaped by what the trial shows.

---

## Phase 2 — less weight, more reliability (release 2.14.0)

### P2-1. A rigor dial — Opus (design), Sonnet (edits), M
- **Why:** E9, E17. A to-do app gets the same process as a paid product. That costs time and plan usage, and long
  instructions are followed less reliably.
- **Change:** `"rigor": "prototype" | "product" | "critical"` in `.claude/kit.json`, chosen in `/spec` with one plain question
  ("a quick experiment, a real product, or something handling money, health or other people's private data?"). Default
  `product`. It is not a security switch: no guard changes with it. Lowering it later is the owner's call, in chat.

  | | prototype | product | critical |
  |---|---|---|---|
  | Tests | alongside code | test-first | test-first + mutation score on core logic |
  | Per-feature review | reviewer | reviewer (does the challenger's checks too) | reviewer + challenger + security reviewer |
  | Red team | no | first launch | every high-risk feature and launch |
  | Speed budget, design bar | advice | checked | checked |
  | Records | `HANDOFF.md`, `CHANGELOG.md` | + roadmap proofs, decisions | + linked ids, checkpoints every 3 |
  | Pre-ship | tests, secrets, security review | full | full + red team + legal |

  The exact table is the implementer's to refine; keep it to one screen.
- **Test:** the orchestrator (P2-2) selects the right checks per level.

### P2-2. One script that runs every applicable check — Opus, L
- **Why:** E8, E9, E11. Today prose tells Claude to run up to 25 scripts in the right order and to write the ship marker by hand.
- **Change:** `scripts/check.mjs --stage feature|checkpoint|ship --project . [--base <commit>]`:
  - works out what applies (rigor, has a screen, has migrations, `Size: large`, which record files exist);
  - runs the kit's own checks (roadmap, drift, notes, schema, architecture, design, migration, API, delivery, speed results,
    runbook, legal, licenses, acceptance) and prints one report: BLOCKING / ADVICE / NOT RUN (with the reason), in plain words;
  - does NOT run the project's own test, build or audit commands (those stay with Claude and the trust system); instead it
    lists them as "you must also run: …" and takes their results as `--passed tests,build,…` flags;
  - at `--stage ship`, when nothing blocks, writes the marker itself (`.claude/last-full-scan` = HEAD plus a hash of the report).
- **Then:** `file-guard` denies direct edits of the marker, and the safety guard denies shell writes to it (fuzz entries
  first). `full-scan.md`, `feature.md` and the checkpoint text shrink to "run check.mjs at this stage and fix what it lists".
- **Test:** table-driven: project shapes × rigor levels → expected blocking and advice lists; marker written only when clean;
  marker not writable by hand through either shell tool or the edit tools.
- **Done when:** `full-scan.md` is under 400 words and names no kit script except `check.mjs`.

### P2-3. Advice versus blockers — Sonnet, S
- **Why:** E17.
- **Change:** blocking = things a script can prove (a failing test, a secret, a HIGH migration finding, a broken note link,
  an over-budget measured page, an unaccepted milestone). Advice = pattern scans and model opinions: `api-check` (all
  levels), `delivery-check` (all), the UI score. The UI reviewer may request changes for at most two rounds; after that the
  remaining points go to the owner at acceptance. A query-count test, where one exists, is the blocking proof for N+1.
- **Test:** `check.mjs` classification; `ui-reviewer.md` and `feature.md` state the two-round rule.

### P2-4. Shorter instructions through on-demand references — Sonnet, L (after V7)
- **Why:** E9.
- **Change:** move the long rule blocks out of `implementer.md` and `spec.md` into reference files read only when relevant:
  `references/security.md`, `speed.md`, `database.md`, `screens.md`, `records.md`. The agent prompt keeps a five-line summary
  of each and "read the reference before work that touches it". If V7 confirms plugin skills with reference files, convert the
  commands to skills; otherwise keep them as plain files under the plugin and give the path through KIT SCRIPTS.
- **Targets:** `implementer.md` under 600 words, `feature.md` under 800, `spec.md` under 1,200, `init.md` under 1,400.
- **Test:** word-count ceilings in `docs.test.mjs`; the dead-reference test covers the new files.

### P2-5. One owner for every fact — Sonnet, M
- **Why:** E10.
- **Change:** add this table to `init.md` and enforce it in the templates:

  | File | Owns | Changes |
  |---|---|---|
  | `PROJECT.md` | what it is, stack and why, how to run it, data inventory, success measures, risks | rarely |
  | `ROADMAP.md` | the plan and its proof | per feature |
  | `HANDOFF.md` | what is in flight, what is unverified, what to do first | every session |
  | `DECISIONS.md` | decisions and their status | append only |
  | `CHANGELOG.md` | what changed | per merge |
  | `ARCHITECTURE.md` | the code map (generated part + hand-written part) | generated |
  | `SCHEMA.md` | the database | generated |
  | `DESIGN.md` | look, feel, speed feel | rarely |

  Remove "Decisions", "Architecture map", "Current state" and "Next steps" from the `PROJECT.md` template. For projects below
  `Size: large`, `ARCHITECTURE.md` is hand-written and short (no index needed).
- **Test:** the drift check flags a `PROJECT.md` that contains a Decisions list while `DECISIONS.md` exists.
- **OWNER DECISION D4 (optional, larger):** move all of these into one `docs/` folder so the project root stays clean and the
  folder opens directly as an Obsidian vault. Only worth doing now, while no real project uses the kit. If yes: first add
  `scripts/records.mjs` as the single place that knows every path, then move.

### P2-6. Big-codebase tools only on big codebases — Sonnet, S
- **Change:** the reviewer's impact check, the builder's `--find`/`--impact` steps, scoped tests and the generated
  architecture map apply only when `CLAUDE.md` says `Size: large`. `verify-gate.mjs` uses the scoped test list on large
  projects instead of timing out (E13) and says when it ran a scoped set.
- **Test:** `verify-gate.test.mjs` for the large case; instructions mention the condition.

### P2-7. The script assigns note ids — Sonnet, S
- **Change:** `notes-graph.mjs --add-decision "<text>" [--supersedes D-nnn]` appends a correctly formatted line with the next
  id and, when superseding, marks the old line. Instructions use it instead of hand-formatting. Linked ids are required only
  at `critical` rigor or `Size: large`; elsewhere decisions are plain dated lines.
- **Test:** id sequence, supersede marking, idempotence, and that a hand-written legacy line still parses.

### P2-8. One speed entry point — Sonnet, S
- **Change:** fold `perf-budget.mjs` into `speed-check.mjs` as a "build size" section (keep the module, drop the separate
  instruction lines). `/speed` and `check.mjs` call one script.

### P2-9. Put the session note on a diet — Sonnet, M
- **Why:** E9. It is at 517 of 520 words, and the routing table repeats what the 20 command descriptions already say.
- **Change:** keep only what the descriptions cannot express: precedence (plan before building; scan before shipping; map
  before changing unknown code; vet before installing), the evidence rule, the records rule, lean mode, plain language.
  Target under 350 words. Lower the test limit to 400.
- **Check:** this changes which workflow Claude picks, which only a live trial can confirm. Do it right before a trial and
  compare the flight report's workflow order with the previous trial.

### P2-10. Split the README — Sonnet, M
- **Change:** `README.md` becomes one page: what it is, install, "what you say → what happens" (a short table), what it will
  not do, requirements. Move each long section to `docs/<topic>.md` and link it. Keep every stated limit.
- **Test:** `docs.test.mjs` looks for command and agent mentions across `README.md` and `docs/`.

---

## Phase 3 — real capability gaps (release 2.15.0)

### P3-1. Trustworthy speed numbers — Sonnet, M
- **Why:** E16.
- **Change:** `templates/speed.spec.js` runs each page three times and reports the median; `init.md` sets the speed test's
  `webServer` to the production build served locally (build, then preview), not the dev server; `speed-check.mjs` treats a
  result within 10% of the limit as a warning, not a failure, and says how many runs it saw.
- **Test:** median and tolerance logic in `speed.test.mjs`. If Playwright can be installed for the kit's own tests
  (**OWNER DECISION D5**, a download of several hundred megabytes; check free disk space first with `disk-free.mjs`), add one
  real run against a tiny static page. Otherwise say plainly that the template is still unrun.

### P3-2. Postgres rehearsal — Opus, L
- **Why:** E15.
- **Options, in order of preference:** (a) an embedded Postgres that runs inside Node with no Docker (vet the package with
  `/vet` and `pkg-check.mjs` first; it would be the kit's first dependency, installed into the project's dev dependencies or
  a cache folder, never bundled); (b) Docker, when present; (c) keep today's "paste the EXPLAIN output" path.
- **Change:** `db-rehearse.mjs --pg` seeds with `generate_series`, times the migration, runs `EXPLAIN (ANALYZE, FORMAT JSON)`
  and feeds the existing `pgSeqScans()`. Local targets only, enforced by `isLocalHost()`.
- **OWNER DECISION D6:** allow the dependency or Docker.

### P3-3. Schema map for code-based migrations — Sonnet, M
- **Change:** `schema-map.mjs --sql-from "<command>"` runs a project command that prints SQL (Alembic's offline mode, Django's
  `sqlmigrate` per migration, a Drizzle or Knex export) and parses the output. The command comes from `.claude/kit.json`, so it
  must go through the trust system like `verify`. Add direct parsers only where there is no SQL output mode.
- **Test:** trust is required; sample outputs from each tool parse into the expected tables.

### P3-4. Database guard: approved local names, and tool calls that are not shell commands — Opus, M
- **Change:** (1) `"localDbHosts": ["postgres", "db.internal.test"]` in `kit.json`, counted only after the owner approves it
  through the trust script (it loosens a guard). (2) A PreToolUse matcher for `mcp__*` tools whose name or input looks like
  SQL execution: ask the owner, naming the tool. (3) README limit updated.
- **Test:** unapproved list has no effect; approved list allows; an MCP-shaped payload with `DROP TABLE` asks.

### P3-5. Show the owner pictures before building — Sonnet, M
- **Why:** a non-programmer can judge a picture far better than a list of acceptance criteria. This is the cheapest place to
  catch "that is not what I meant".
- **Change:** in `/spec`, for anything with a screen: after the questions and before the roadmap, write two or three rough
  HTML mock-ups of the key screens (static, no logic, following the draft `DESIGN.md`) under `.claude/mockups/`, open them
  for the owner, and record what they said in `DESIGN.md`. Skipped at `prototype` rigor.
- **Test:** `spec.md` contains the step; `init.md` git-ignores the folder.

### P3-6. Use a stronger model when a feature keeps failing — Sonnet, S
- **Change:** in `feature.md`: after two failed review rounds, relaunch the builder with `model: opus` for the third. At
  `critical` rigor, high-risk features start on Opus.

### P3-7. Data folder hygiene — Sonnet, S
- **Change:** one environment variable (`KIT_DATA_DIR`) for trust, flight log and index; compress the code index (it reached
  30 MB for a 31,000-file tree); the doctor lists data per project and removes entries for projects whose folder is gone.
- **Test:** old variable names still work; a compressed index round-trips.

---

## Phase 4 — architecture, only if the trials justify it

Do not start these without evidence from at least two trial runs.

- **P4-1. Guards as plain functions — Opus, L.** Give each guard `export function check(input, context)` returning
  `{ level, reason } | null`, with a thin command-line wrapper. `gate.mjs` calls the functions directly, and the
  `stdin`/`exit`/`stdout` swapping in `inprocess.mjs` goes away. Tests call the functions (the fuzz suites become much faster)
  and a few still start the real process. Prove equivalence by running every existing corpus through both paths before
  deleting the old one.
- **P4-2. A workflow state file — Opus, L.** If the trials show steps being skipped in long builds:
  `scripts/next.mjs` holds the feature pipeline as states (brief → build → review round n → merge → prove → records →
  checkpoint), stores the current state in `.claude/kit-state.json`, prints only the instructions for the current state, and
  refuses a transition whose evidence is missing (no branch, no merge commit, no review verdict recorded). `feature.md`
  becomes "ask next.mjs what to do". This also makes resuming after a context reset exact.
- **P4-3. Pattern cards for the hard parts of SaaS — Sonnet, M each.** Short, stack-neutral references with the tests that
  prove them: tenant isolation, billing webhooks (signature, idempotency, retries, failed payments, cancellation), sign-in
  and sessions, roles and permissions, background jobs, email. Loaded only when a feature is tagged with that area.
- **P4-4. Records folder as a vault** (D4), if not done in Phase 2.

---

## Keep as is

The drift check, record compaction, checkpoints, the migration check, the database guard's deny rules, the schema map for
SQL/Prisma/Rails/SQLite, the flight recorder's privacy rules, the trust system, the secret scanner, the package guard, the
roadmap proof rule, milestone acceptance, the vetting workflow. They are small and cover real risks.

## Owner decisions (ask once, with the recommendation)

| | Question in plain words | Recommendation |
|---|---|---|
| D1 | Keep all hooks in one process (a little faster) now that a self-check will prove they run, or go back to separate ones? | Keep, with the self-check. Go back at once if the self-check ever fails. |
| D2 | May the repository run its tests automatically on GitHub (free, no tokens)? | Yes. |
| D3 | For the first trial, will you run it, or may the session start a separate normal session and read its log? | Either; say which. |
| D4 | Move the project record files into one `docs/` folder? | Yes, now, while nothing depends on the layout. |
| D5 | May Playwright be installed (several hundred megabytes) so the speed test can be run for real once? | Yes, if the disk has room. |
| D6 | May the Postgres rehearsal use a vetted library or Docker? | Yes to the library, after vetting. |

## Definition of done for the whole plan

- A fresh session on Windows, macOS or Linux shows the session note, and the canary is blocked through every shell tool.
- The test matrix is green on three operating systems, and machines only update after it is.
- One trial app has been built end to end, and its flight report shows the expected workflow order with no skipped review.
- The five longest instruction files (`init`, `spec`, `feature`, `implementer`, `full-scan`) total under 4,500 words (about
  8,000 today), and the session note is under 400.
- Every blocking check is something a script can prove.
