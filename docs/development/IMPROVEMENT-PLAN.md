# Improvement plan — implementation handoff

Finished and merged items (40) are in [PLAN-DONE.md](PLAN-DONE.md).

Written 2026-11-25 against version 2.12.0, after a full audit of the plugin; extended the same day after a second audit
against 2.14.0 (one-click shipping, Phase OC), again with Phase M (which model does which job, and Haiku delegation), and again
with Phase S (token savings that cost no code quality, and a main conversation that stays small). This is a work list for the
next implementing session (Opus or Sonnet). It is ordered: follow "Order of work" under Progress, one release per phase.

**How to use this file.** Read the root `CLAUDE.md`, `HANDOFF.md` (next to this file) and this file. Do one phase, release it, tick its tasks here,
then stop and report. Do not start the next phase in the same release.

## Progress

| Phase | Release | State |
|---|---|---|
| 0 — safety and correctness | 2.12.1 | **Done** (P0-1 to P0-9). D1 decided: keep the merged runner, with the canary, self-check and fail-closed net. |
| Owner requests | 2.12.2–2.14.0 | **Done**: payment keys (2.12.2); sizing an app to its users (2.13.0); design library and WCAG 2.2 AA testing (2.14.0). |
| Audit 2 | — | **Done** (2026-11-25, against 2.14.0): findings F1–F11 below, and the new one-click phase (OC). |
| M — models and delegation | 2.14.1 (part A), 2.15.0 (part B) | **Done** except M-14 (needs a trial). D11 and D12 were Claude's choices, not the owner's (corrected 2026-11-26: the owner's "do all" approved the work, not these model choices); they stay open for the owner. Absorbed P3-6. Built before the first trial, so there is no before-and-after comparison. |
| S — savings and a small main conversation | 2.16.0 (part A), 2.17.0 (part B) | **Done** except S-12 (needs a trial). The owner said "do all" (2026-11-25): D13 yes; D14 build now, with the old flow as the automatic fallback. Not run live. |
| 1 — verifiable | 2.18.0 | P1-1 and P1-2 written (2026-11-26, owner said "Implement": D2 yes), not yet run on GitHub. P1-3 to P1-5 and P1-7 open. When P2-4 moves rule blocks into references, the WCAG list in `scripts/wcag.mjs` is the source for the accessibility reference. |
| Owner request | 2.19.0 | **Done** (2026-11-27, the owner said "Add all"): the UI checklist, the measuring checkpoint, the screen list in the plan, stress data, the milestone sweep and the launch polish list (see CHANGELOG). Proven on fixture pages in a real browser, not yet in a live build. |
| Owner request | 2.24.0 | **Done** (2026-11-27): the running-cost check in planning (every price quoted from the provider's page and checked, the arithmetic by `cost-model.mjs`), re-run at launch and in maintenance. Unit-tested only; never run against real pricing pages in a live plan (T-1). |
| Review 3 | 2.25.0 | **Done** (2026-11-28, the owner said "do all"): twelve guard holes found by running the real hooks, each a failing test first (see CHANGELOG). E8 is half done: `scripts/ship-mark.mjs` writes the pass marker after re-checking what a script can prove, and the guards refuse any other way; the security review's APPROVE is still the scan's word (OC-5). Open: G-1 below. |
| OC — one-click shipping | 2.20.0, 2.21.0 | Not started. Waits for the first live trial (P1-6), whose flight report decides the order inside the phase. Absorbs P2-1, P2-2, P2-3, P2-5 and P4-2. |
| 2, 3, 4 | — | Not started. What is left of Phase 2 after OC follows it. |

**Order of work, from here:** P1-6 (the first live trial: it now tests Phase M and Phase S together, and its flight report gives
M-14 and S-12 their numbers; if the conductor misbehaves, `{ "freshContext": false }` restores the old flow while it is fixed) →
P1-1 and P1-2 (tests on GitHub, a stable channel) → M-14 and S-12 → OC-1 to OC-12 (one-click shipping, in two releases) → the
rest of Phase 2 → Phase 3 → Phase 4 only if the trials justify it.

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
- V9. Not checked yet (needed for OC-3): do PreToolUse hooks still run, and can they still deny, for a command that a permission
  `allow` rule lets through without a prompt? The one-click plan depends on "yes".
- V10. Not checked yet (needed for OC-3): the exact syntax of Bash permission rules (prefix `:*` matching, wildcards inside paths,
  quoting), so the kit's own scripts can be allowed by folder without allowing every `node` command.
- V11. Not checked yet (needed for OC-4): what Claude Code offers for continuing work without a person typing (scheduled tasks,
  `/loop`, resuming after a usage limit, background sessions), and which of these a plugin may start versus only the user.

**More answers (2026-11-25, sub-agents page read in full; hooks page read in full except two spans that came back only as a
summary, characters 79,900–139,950 and 219,850–279,900: re-read those before relying on anything not quoted here). Needed for Phase M:**
- V12. Which model a subagent runs on, first match wins: (1) the `model` passed on the Agent tool call (an alias only: `haiku`,
  `sonnet`, `opus`, `fable`; not a full id, not `inherit`); (2) `model` in the agent file; (3) the `CLAUDE_CODE_SUBAGENT_MODEL`
  environment variable; (4) the main conversation's model. While `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` is on, (1) and (2) are ignored.
- V13. Agent files may set `effort` (`low`, `medium`, `high`, `xhigh`, `max`; it overrides the session's effort, but not the
  `CLAUDE_CODE_EFFORT_LEVEL` variable), `maxTurns` (at the limit the output comes back marked partial and the agent can be resumed),
  and `omitClaudeMd`. For agents that come from a plugin, only `hooks`, `mcpServers`, `permissionMode` and `initialPrompt` are
  ignored. An unknown field is ignored without an error, so newer fields are harmless on an older Claude Code.
- V14. A subagent CAN start subagents of its own (three layers by default) unless `Agent` is left out of its `tools` list or is in
  its `disallowedTools`. At most 20 subagents run at once by default.
- V15. Hooks. PreToolUse `updatedInput` replaces the WHOLE input, and without a `permissionDecision` auto mode may deny the changed
  call. The Agent tool's input is `prompt`, `description`, `subagent_type`, `model`. PostToolUse for the Agent tool carries
  `totalTokens`, `resolvedModel`, `modelsUsed` and `usage` in `tool_response`. SubagentStop receives `agent_type`,
  `last_assistant_message`, `agent_transcript_path` and `stop_hook_active`; answering `decision: "block"` with a `reason` keeps the
  subagent running with that reason as its next instruction. Tool hooks also fire inside subagents, with `agent_id` and `agent_type`.
  Only SessionStart receives a `model` field.
- V16. The built-in Explore agent runs on the parent conversation's model (on Opus when the parent is Fable, on a subscription).
  It is NOT a cheap reader unless `model: haiku` is passed on the call.
- V17. Partly answered (model-config, sub-agents and errors pages): when an organisation's allowlist blocks a model, a subagent
  runs on a fallback with a warning instead of failing. For a model the PLAN does not include, the errors page has an entry titled
  "Claude Opus is not available with the Claude Pro plan" (its text was not read). So M-7 handles a failed launch defensively:
  `model-route.mjs` prints what to do (relaunch on Sonnet, tell the owner, set this computer's ceiling) with every Opus answer.
- V18. Answered: "If Claude passed an alias, the subagent keeps that alias when it resumes or receives a follow-up message", and
  effort stays too. SubagentStop supports a matcher on the agent type, the same values as SubagentStart; `decision: "block"` with a
  `reason` keeps the subagent running; Claude Code ends the turn anyway after eight blocks in a row.
- Prices used for the reasoning in Phase M (API list prices per million tokens, input / output, as cached on 2026-11-03):
  Haiku 5.5 $0.10 / $0.50, Sonnet 5.5 $2 / $10, Opus 5.5 $4 / $20, Fable 5.2 $8 / $40. So Sonnet costs 20 times Haiku, Opus twice
  Sonnet, Fable twice Opus. The owner is on a subscription: treat the ratios as a guide to plan usage, not as exact.

**Answers needed for Phase S (2026-11-25; pages: hooks, sub-agents, skills, scheduled-tasks, costs, settings, context-window,
statusline read verbatim; model-config and settings-reference partly from a summary, marked "(s)"):**
- V19. **Nothing lets a hook, a plugin or a setting clear the conversation, start a new session, or run `/clear` or `/compact`.**
  A hook can stop a turn (`continue: false`) and can block or shape a compaction, never start one. What runs by itself:
  auto-compaction as the context fills, and idle compaction of a conversation the user stepped away from (`idleCompaction`, on by default (s)).
- V20. Auto-compaction: by default near the model's limit, about 967K tokens on a 1M-context model (s). `autoCompactWindow`
  (a token count of 100000 or more) and `autoCompactEnabled` have scope "Any file", so a project's `.claude/settings.json` can set
  them. Per session: `/autocompact 500k`, `CLAUDE_CODE_AUTO_COMPACT_WINDOW`. Agent files take `autoCompactWindow` too.
- V21. PreCompact (matcher `manual` or `auto`): when it exits 0 its **stdout becomes instructions for the summary** (10,000
  characters at most); exit 2 blocks the compaction (never do that for `auto`: at the limit the request then fails). PostCompact
  receives `compact_summary` and controls nothing. After a compaction: the project-root `CLAUDE.md` is re-read, invoked skill
  bodies are re-injected (5,000 tokens each, 25,000 in all), up to five recently changed files are re-read, SessionStart hooks
  matching `compact` run and their output is added; everything hooks added earlier is summarised away. SessionStart sources:
  `startup`, `resume`, `clear`, `compact`, `fork`. **On `resume` and `fork` SessionStart also receives `context_tokens`,
  `seconds_since_last_response`, `prompt_cache_likely_expired` and `estimated_cache_write_usd`.**
- V22. No other hook input carries the context size (the common fields are `session_id`, `prompt_id`, `transcript_path`, `cwd`,
  `scratchpad_dir`, `permission_mode`, `effort`, `hook_event_name`). Only the status line gets `context_window.used_percentage`.
  The transcript's format is not documented: do not build on parsing it.
- V23. PostToolUse `updatedToolOutput` "replaces the tool's output with the provided value before it is sent to Claude"; for a
  built-in tool a value that does not match the tool's output shape is ignored. The official costs page trims test output with a
  PreToolUse `updatedInput` that appends `| tail -n 100`, which hides the command's exit code: do not copy that.
- V24. Nested agents: up to three layers below the main conversation (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`; at the limit the
  Agent tool is withheld). A nested agent runs on its parent's model unless its file or the call names one. `SendMessage` resumes
  an agent, which then reports back to whoever resumed it. `AskUserQuestion` is removed from every subagent; a foreground
  subagent's permission prompts pass through to the user. A subagent starts fresh (its prompt, the task, `CLAUDE.md`, git status)
  and never sees the parent's conversation. A plugin SKILL may set `context: fork`, `agent:` and `background:` to run in a new
  subagent that gets the skill text as its task. Session-scoped scheduled tasks (`/loop`, `CronCreate`) only fire while the session
  is open and idle; durable ones are cloud or desktop scheduled tasks, set up by the user.
- V25. Answered (hooks, sub-agents, plugins-reference): Bash's `tool_response` is an object with `stdout`, `stderr`,
  `interrupted`, `isImage`; `updatedToolOutput` must have that shape (the docs' example has all four) or it is ignored. PowerShell's
  shape is not stated: S-1 treats it the same and leaves anything else alone. **A command that exits non-zero is a failed call: it
  reaches PostToolUseFailure (an `Exit code N` text), not PostToolUse, so failing runs are never shortened.** Whether
  `isolation: worktree` applies to an agent started by a subagent: not stated (S-6 has the builder make its own worktree if it has
  none). `tools` is an allow-list, so the conductor lists `SendMessage` itself. Plugin `commands/*.md` frontmatter supports no
  `context: fork` (only skills do), so S-6 keeps a dispatcher command.
- Official advice the phase follows (costs page): clear between tasks; delegate verbose work to subagents; preprocess output with
  hooks; keep `CLAUDE.md` under 200 lines (the kit's template is 46); disable unused MCP servers; code-intelligence plugins for
  typed languages reduce file reads. "Thinking tokens are billed as output tokens."

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

## Second audit: what stands between the kit and one-click shipping (2026-11-25, version 2.14.0)

The owner asked what would make this a "one-click and ship" plugin. A literal single click is not possible and should not be: creating
accounts, adding a payment method, entering secret keys, buying a domain, legal sign-off and taste stay with the owner. The realistic
target is **one conversation, one owner checklist, and one approval per milestone plus one to go live**, with the build running by
itself in between. These findings are what stands in the way. Each was checked on this machine and in the repository.

| # | Finding | How it was verified |
|---|---|---|
| F1 | **Nothing built since 2.6.0 has run in a real session.** Nine versions of the kit exist only in unit tests. | `claude plugin list`: 2.6.0 installed; the newest cached copy is 2.6.0; the self-check's "version seen" file was never written; the flight recorder has no log for any project. |
| F2 | **The instructions keep growing.** About 21,000 words across 28 command and agent files. The five largest (`init` 2,396, `spec` 2,064, `feature` 1,593, `implementer` 1,575, `full-scan` 1,172) total about 8,800 words; the plan's target was under 4,500. They name 33 different kit scripts 70 times. | `wc -w`, `grep`. |
| F3 | **The ship check is 17 prose steps**, and the "passed" marker is still written by Claude by hand. | `commands/full-scan.md`. |
| F4 | **A build cannot run unattended.** After setup only the project's own test and build commands and `git status/diff/log` run without a permission prompt: every kit script, commit, branch, merge and install asks. Nothing carries a build across sessions or past a usage limit. | `commands/init.md` step 4; no file mentions scheduling or resuming. |
| F5 | **There is no golden path to production.** `/launch` is a checklist; no tested stack or host preset exists, so every project re-decides and re-wires both. | No `presets/` or equivalent; `commands/launch.md`. |
| F6 | **Projects get cluttered.** Up to 9 settings and results files under `.claude/` (`kit.json`, `speed.json`, `scale.json`, `a11y.json`, four results files, `launch.json`) and about 13 record files in the project root. | `grep` of every file the kit writes. |
| F7 | **Releases reach every machine untested.** Every push to `main` installs itself everywhere within a day; there are no tests on GitHub; only Windows has been tried. | No `.github/`; `hooks/auto-update.mjs`. |
| F8 | **Some blocking checks are judgement, not proof:** the focus-ring detection in the accessibility test, the API pattern scan, the UI reviewer's score. A wrong block means an app that never ships. | `a11y-check.mjs`, `full-scan.md`, `ui-reviewer.md`. |
| F9 | **The owner's decisions are scattered through the flow:** about 20 stopping points across 11 commands (plan questions, approvals, milestone OKs, accepted risks, launch steps), arriving one at a time instead of together. | `grep` for "ask the owner/user", "wait for", "go-ahead" and similar. |
| F10 | **"Large" means two things:** `Size: large` in `CLAUDE.md` is about the codebase; the scale profile's `large` tier is about users. | `onboard.md`, `scale-profile.mjs`. |
| F11 | **Three owner decisions are still open** (D2 tests on GitHub, D3 how to run the first trial) and the push policy for this repository was asked but not answered (now D7). | This file; the conversation. |

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

## Phase 1 — make the kit verifiable (release 2.18.0)

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
- **How (no API tokens):** the owner runs trial 1 from `docs/trials.md` in a normal session. Alternative, only with the owner's
  yes: the implementing session starts a separate normal app session in a new empty folder with the trial prompt, then reads
  the flight report afterwards. **OWNER DECISION D3.**
- **Then:** fix what broke, each fix with a test, and log it in `docs/trials.md`. **Do not start Phase OC or Phase 2 until one trial
  has run.** Both should be shaped by what the trial shows.
- **Before the trial:** update this machine to the newest version (it was still on 2.6.0 at the second audit, F1), start one
  session so the self-check runs, and confirm `starter-kit-canary` is refused with each shell tool.

### P1-7. DONE in 2.23.0 — Push policy for this repository (D7: releases go to `candidate`; GitHub promotes main and stable only after every test passes) — Sonnet, S
- **Why:** F7, F11. Every push to `main` installs itself on every machine within a day.
- **Change (recommended answer to D7):** commit each release locally, with tests, changelog and handoff, and push only when the owner
  says so; after P1-2, machines follow the `stable` branch, which moves only when the GitHub tests pass. Update the EVERY RELEASE rule
  in `CLAUDE.md` to say "push when the owner asks, or let the stable channel promote it".
- **Test:** the docs test checks the rule text in `CLAUDE.md`.

---

## Phase M — which model does which job, and Haiku delegation (release 2.14.1, then the next minor)

**Goal:** the strong model works where a mistake is expensive, the cheap one where the work is reading, and the choice is made by a
script from recorded facts, enforced by a hook, and measured in the flight log. Today nothing decides: each agent file names one
fixed model, no agent sets its effort, and 16 of the 21 workflows think in the main conversation on whatever model the owner picked.

**Three rules the whole phase follows. Put the first two in `CLAUDE.md` when part B ships.**
1. **MODEL RULE.** Models are chosen in one place, `scripts/model-route.mjs`. Agent files carry that script's defaults (a test
   compares them). A project file can make the kit more careful, never less: nothing in `.claude/kit.json` may lower a review role.
2. **HAIKU RULE.** A Haiku agent finds and points. It never writes code that ships, gives a verdict (review, security, vetting,
   legal), or writes a record another session will trust. It has no write, shell or agent tools (a test enforces it). What it hands
   over is pointers (`path:start-end` plus one line quoted word for word), never a description of what the code does, so the
   stronger model always reads the real source and a script can check the pointers exist.
3. **Free before cheap before strong.** A script (the code index, the context pack) costs nothing: use it first. Haiku only where
   patterns fail (fuzzy "where is checkout handled?", languages the index does not read, long logs). Sonnet and Opus read only
   what they were pointed at, and search for themselves when the pointers fall short.

**Weight budget (ground rule 3 still applies).** At most two new agents (`scout`, `investigator`), each under 350 words with a
description under 30 words; two new scripts (`model-route.mjs`, `pointer-check.mjs`); two new hook scripts; at most 60 added words
per command file and task; the session note grows by nothing (trim as many words as you add). If a task cannot fit, cut the task,
not the budget.

**Not in this phase, on purpose:** Fable in any agent file or route (D12); Haiku for reviews, security, vetting, records or code; a
records-keeper agent; per-language agents; separate database or speed reviewers (scripts cover them). **Haiku drafting changelogs,
handoffs, decisions, code comments or file histories** (the owner asked, 2026-11-25): no. What a record must say is already in the
main conversation, so briefing Haiku costs about what writing it does, and a wrong record misleads every later session. File history
is `git log`/`git blame`, which a script or the investigator reads for free. Revisit only if a trial shows records eating real budget.

**As built (2.15.0), where it differs from the tasks below:** the hook does not record its own crashes (P1-3 adds hook outcomes to
the flight log); `"rigor": "prototype"` lowers review strength, so it needs the owner's approval on this computer like any other
switch (a `rigor:prototype` trust entry), while `"critical"` takes effect at once; the ceiling file is not guarded against direct
writes (it can only cap at Sonnet, and status and security reports show it).

### Part A — release 2.14.1 (small and safe; do it before the first trial)

### Part B — release: the next minor version (needs D11 and D12)

### M-14. Measure, then keep or cut — owner in the loop, after a trial
- From the flight report (M-2): tokens per model per roadmap item, review rounds, escalations, scout launches, bad pointers, pack misses.
- **Scout:** keep it on by default only if pack misses stay under 30% of pointers and builds of the same size use fewer
  strong-model tokens with it than without. Otherwise make it off by default and say so in the changelog.
- **Opus for medium features:** keep it if Opus builds need fewer review rounds than Sonnet builds of the same size. If ten
  features show no difference, move size M back to Sonnet at `product` rigor.
- Samples will be small. Write down what was seen, not a conclusion the numbers cannot carry.

---

## Phase S — spend tokens on code, not on noise; keep the main conversation small (releases 2.16.0 and 2.17.0)

**Goal:** every token goes to the builder's thinking and writing, or to one strong independent review. Nothing is spent re-reading
noise, re-reviewing what was approved, re-writing whole files, or carrying finished work around in the main conversation. The owner
never has to clear a chat or start a new one to keep a long build affordable.

**Not for sale in this phase:** the builder's model and effort, the Opus review, the tests, the security review. A saving that
lowers any of them is a trade-off and belongs in S-12 (measure first).

**The owner's three questions, answered (2026-11-25), so the implementer does not re-derive them:**
1. *Can the kit create new sessions by itself?* No (V19). The Claude desktop app has its own tool that lets Claude start a session,
   but that is the app, not the plugin: it asks the owner first unless they told it to, and terminal and web users do not have it.
   The kit must not depend on it. What the kit CAN do on every surface is give each feature a fresh context: a subagent (V24).
2. *Auto-clear at a threshold?* Not possible (V19), and it would be the wrong tool: a clear in the middle of a task throws away
   what a compaction keeps. The equivalent that exists: a lower auto-compaction window for the project (V20), a summary the kit
   steers (V21), and the session note and build state put back afterwards. With S-6 the main conversation grows by about a
   thousand tokens per feature instead of tens of thousands, so even that is rarely reached.
3. *Pick up from the last file edit?* Pick up from the last VERIFIED step instead. A half-written edit is not trustworthy, and
   the builder's own context is gone anyway. The build state (S-7) names the stage, branch, worktree and last green commit; the
   builder commits after every passing test, so a cut-off loses minutes; whatever is uncommitted in the worktree is shown to the
   next builder, which finishes or discards it and lets the tests decide.

**Why the main conversation grows today (read from `feature.md`; estimates, not measurements):** every feature adds the workflow
text (1,759 words, loaded again on each invocation), a brief written for each of three to six agents, each agent's report, the merge
and test output, and the reading and editing of five record files. All of it is re-sent on every later turn. On a 1M-context model
nothing is compacted until about 967K tokens (V20), and after a pause longer than the cache lifetime the whole history is charged
at full price again.

**Weight budget:** one new agent (`conductor`, under 250 words), two new scripts (`quiet-lib.mjs`, `build-state.mjs`), three
new hook scripts (`quiet-output.mjs`, `compact-notes.mjs`, `conductor-check.mjs`), one new folder (`workflows/`). `commands/feature.md`
shrinks to a dispatcher under 200 words. The session note grows by nothing; its new lines are conditional.

**As built (2.16.0, 2.17.0), where it differs from the tasks below:** the dispatcher is about 240 words (it keeps the precondition
checks, so the workflow file has none; the test allows 260). `init` writes `autoCompactWindow` without a question (it changes
only when chats are summarised) and keeps a value already there. The builder already commits after each passing criterion from
2.16.0. The conductor runs a due checkpoint itself and reports milestones in NEXT. `{ auto: false }` silences the compaction notes.
Not built: the builder making its own worktree when started without one (S-6 (1)); add it if the trial shows nested launches lose
`isolation: worktree`.

### Part A — release 2.16.0: free savings (no change to how features are built)

### Part B — release 2.17.0: a fresh context for every feature (changes how features are built; see D14)

### S-12. Measure, then decide the trade-offs — owner in the loop, after a trial (extends M-14)
- From the flight report: lines trimmed and kept (S-1), whole-file rewrites (S-3), review rounds and which reviewers re-ran (S-2),
  tokens per agent and model (M-2), compactions per session (S-9), resume notices (S-5). The main conversation's size after a
  ten-feature build is read by the owner from the app's context indicator: the kit cannot see it (V22).
- **Trade-offs to decide only with those numbers** (each lowers something, however slightly):
  - One reviewer for small features: fold the challenger's checks into the reviewer for size S (OC-1's rigor table already does
    this at `product`). The largest structural saving left, and a small quality trade.
  - `effort: medium` for the UI reviewer and the challenger.
  - `autoCompactWindow` on the implementer for very long builds.
  - A lower or higher project window than 300K.
  - Conductors for `full-scan`, `audit`, `redteam`, `onboard`.
- Samples will be small. Write down what was seen.

---

## Phase OC — one-click shipping (releases 2.19.0 and 2.20.0)

**Goal:** the owner describes the app once, answers one batch of questions, does one checklist of things only they can do (accounts,
payment method, keys in the host's settings), and then only approves milestones and the launch. Between those moments the build
runs by itself, and each milestone arrives as a link to click. Everything that keeps the kit safe stays: the guards still check
every command, nothing ships without the checks passing, and nothing is pushed, deployed or charged without the owner's yes.

**Release 2.19.0** = OC-1 to OC-6 (fewer interruptions, deterministic checks). **Release 2.20.0** = OC-7 to OC-12 (golden paths,
previews, one go-live, tidier projects). Do the verifications V9, V10 and V11 first.

### OC-1. One intake — Opus (design), Sonnet (edits), M (absorbs P2-1, the rigor dial)
- **Why:** F9. Questions arrive one at a time across the flow.
- **Change:** `/spec` sends ONE message that covers everything the plan needs, each with a default: what it is and who it is for, the
  one thing it must do well, must-haves versus later, the size question (2.13.0), two or three apps whose look they like (2.14.0),
  and how careful to be (`prototype`, `product`, `critical`: P2-1's rigor dial, merged here). A new `scripts/intake.mjs --write` takes
  the answers and writes the scale profile, the rigor level and the design references in one step, so nothing is asked twice later.
  The owner then approves one plan. Every later question must be one that could not have been asked at the start.
- **Test:** `intake.mjs` writes all three files from one answer set; a docs test checks that `/spec` asks one message and names
  every input; the flight recorder (OC-12) counts the questions in a trial.

### OC-2. The owner's checklist, up front — Sonnet, M
- **Why:** F4, F9. Account creation and keys today surface in the middle of the build or at launch, and stop it there.
- **Change:** `scripts/owner-todo.mjs` turns the approved plan (its stack, host and services: payments, email, sign-in, database,
  analytics, domain) into `OWNER-TODO.md`: each item in plain words (what to create, where the key goes, what it costs, and that a
  key is never pasted into the chat), with a checkbox, and which milestone first needs it. It is shown right after the plan is
  approved, so the owner does it once while the build runs. The build only waits when a milestone actually needs an unticked item.
  Service details (sign-up pages, setting names, prices) are checked on the provider's own pages at the time, never from memory.
- **Test:** checklists generated for three plan shapes; an item blocks only the milestone that needs it; the session note lists open
  items without repeating them every turn.

### OC-3. DONE in 2.23.0 — Pre-approved safe commands (setup offers "ask me only before risky actions"; D8) — Opus, M
- **Why:** F4. Every kit script, commit, branch and merge asks for permission, so the build stops whenever nobody is watching.
- **Change:** setup offers ONE yes/no (merged with today's question) that adds allow rules for: the kit's own scripts (by folder,
  using V10's syntax, never `node` in general), local git (`add`, `commit`, `branch`, `switch`/`checkout`, `merge --no-ff`,
  `worktree add/remove`, `stash`, `status`, `diff`, `log`, `show`), and the project's install, test, build and lint commands.
  Never allowed this way: push, publish, deploy, anything that deletes outside the project, package installs from outside the
  public registry, and any database command. The guards keep running on every allowed command (V9 must confirm this first; if
  hooks do not run on allowed commands, stop and redesign).
- **Test:** the generated rule list contains none of the forbidden commands; a guard still denies `rm -rf /` and a push when the
  rules are in place (unit test with the real hook payload); trust approval is still required for project-supplied commands.

### OC-4. A build that keeps going — Opus, L (absorbs P4-2; after V11)
- **Builds on Phase S:** S-7 delivers the state record and the resume brief, and S-6 runs each feature in its own context. What is
  left here is the state machine around them. V11 is answered in V24: `/loop` and session scheduled tasks only run while the
  session is open and idle; anything durable is a cloud or desktop scheduled task the owner sets up.
- **Why:** F4. A long build stops at the end of every session and after every usage limit, and resuming relies on reading notes.
- **Change:** `scripts/next.mjs` holds the pipeline as states (brief → build → review round n → merge → prove → records →
  checkpoint → milestone), keeps the current state in `.claude/kit-state.json`, prints only the instructions for the current state,
  and refuses a step whose evidence is missing (no branch, no merge commit, no review verdict). The session note says exactly where
  to resume. It stops only for: a milestone to accept, an owner-checklist item a step needs, a check that fails three rounds in a
  row, or a decision only the owner can make. Use whatever V11 shows Claude Code allows for continuing without a person typing
  (for example the user starting `/loop`, or a scheduled task the owner sets up); the kit never schedules itself without the owner's yes.
- **Test:** state transitions with and without evidence; resume after a simulated cut-off continues at the right step; the four
  stop conditions; `feature.md` shrinks to "ask next.mjs what to do".

### OC-5. One check script, proof-only blockers — Opus, L (absorbs P2-2 and P2-3)
- **Why:** F3, F8. 17 prose steps, and some blocks are opinions.
- **Change:** as P2-2 describes (`scripts/check.mjs --stage feature|checkpoint|ship`, which works out what applies, runs every kit
  check, lists the project commands Claude must also run, and writes the ship marker itself when nothing blocks), with P2-3's rule:
  only what a script can prove blocks. Opinions (UI score, API pattern scan, the accessibility focus-ring heuristic, delivery
  hints) are advice; the UI reviewer gets two rounds, then the remaining points go to the owner at acceptance.
- **Test:** table-driven, as P2-2 lists; the marker cannot be written by hand (file guard and safety guard, both shell tools).

### OC-6. One word for each meaning — Sonnet, S
- **Why:** F10.
- **Change:** rename `Size: large` to `Codebase: large` everywhere (CLAUDE.md template, `onboard`, builder, reviewer, feature, tests;
  keep reading the old line); the scale profile keeps "large" for users.
- **Test:** docs test that no instruction uses `Size: large`; the old line still switches on scoped tests.

### OC-7. Golden paths — Opus, L (OWNER DECISION D9) — PART DONE in 2.20.0
- **Done (2.20.0):** four recipes in `presets/` with setup, packages, commands, accounts, settings and known mistakes; `presets.mjs`;
  the real setup test (`KIT_PRESET_SCAFFOLD`); the plan offers the recommended stack plus alternatives (the owner asked for a choice,
  replacing "the owner never chooses technology"); `/maintain` corrects `.claude/rules/stack.md` after major updates.
  **Still to do:** the GitHub checks workflow, the host's deploy settings and a runbook skeleton per recipe (needs D9), and feeding
  the accounts list into OC-2.
- **Why:** F5. Every project re-decides its stack and host, and setup and deploy are improvised each time.
- **Change:** `presets/` with three or four tested recipes, one per common kind of app: a website or landing page; a web app with
  sign-in and a database; a desktop app with an installer and GitHub releases; an API. Each preset is: the official scaffolding
  command (pinned version, vetted with `pkg-check.mjs`), the test, browser, speed and accessibility set-up, the GitHub checks
  workflow, the host's deploy settings, a runbook skeleton, and the list of settings and accounts that feeds OC-2. The plan picks a
  preset when one fits (the owner never chooses technology) and falls back to today's free choice when none does. `/maintain`
  re-checks preset versions.
- **Test:** each preset scaffolds a fresh folder and passes its own checks in a test run (network allowed for the package
  registry only); a docs test that every preset lists its settings and accounts.

### OC-8. A link to click at every milestone — Sonnet, M (needs OC-7)
- **Why:** F9. Acceptance today means starting the app on the owner's computer.
- **Change:** each milestone is deployed to the host's preview environment (test keys and test data only, never production) and
  `/accept` gives the owner the link plus the five to eight things to try. Fallback with no host yet: the local address, as now.
- **Test:** `accept.md` and the presets; a check that preview settings never point at production keys or databases.

### OC-9. One "go live" — Sonnet, M (needs OC-5 and OC-7)
- **Why:** `/launch` is a 1,378-word checklist run by hand.
- **Change:** with a preset, launching becomes: the owner's checklist complete (OC-2), `check.mjs --stage ship` clean, a final
  preview the owner has accepted, then ONE question ("Go live now? It will cost about …, and here is how to undo it.") and the
  preset's own production deploy, smoke test and rollback. Without a preset, today's `/launch` stays.
- **Test:** the go-live step refuses while any checklist item, blocker or unaccepted milestone remains.

### OC-10. Tidier projects — Sonnet, M (absorbs P2-5; OWNER DECISION D4)
- **Why:** F6.
- **Change:** all kit settings in one `.claude/kit.json` (sections for speed, scale, accessibility) and all results in
  `.claude/results/`; record files in `docs/` (D4) with one owner per fact (P2-5's table), `MAINTENANCE.md` folded into `RUNBOOK.md`
  and `AREAS.md` into `ARCHITECTURE.md`. `scripts/records.mjs` is the single place that knows every path, and old locations are still
  read, so existing projects keep working.
- **Test:** every script finds its files through `records.mjs`; an old-layout project still works; a new one has at most
  `CLAUDE.md`, `README.md` and `docs/` at the root from the kit.

### OC-11. Instructions on a diet — Sonnet, L (absorbs the targets of P2-4 and P2-9)
- **Builds on Phase S:** `workflows/` exists (S-6) and is loaded only by whoever runs it. Move the next longest command there when
  a trial shows it loaded often.
- **Why:** F2. After OC-4 and OC-5 most procedure lives in scripts, so the prose can shrink.
- **Change:** as P2-4 and P2-9: rule blocks into references read on demand; `feature`, `full-scan`, `launch` point at `next.mjs`
  and `check.mjs`; the session note under 400 words.
- **Test:** word ceilings in `docs.test.mjs`: the five largest files under 4,500 words together, every command under 1,000.

### OC-12. Count the interruptions — Sonnet, S
- **Why:** the goal of this phase is a number: how often the owner is needed.
- **Change:** the flight recorder also logs when the kit asks the owner something (the question tool), when it waits for an owner
  checklist item, and each milestone acceptance; `flight-report.mjs` prints them. Target for a trial app: one intake, one
  checklist, one acceptance per milestone and one go-live, with nothing else unless something genuinely needed the owner.
- **Test:** the counts from a synthetic log; a trial's report shows the numbers.

---

## Phase 2 — less weight, more reliability (release after Phase OC)

**Merged into Phase OC:** P2-1 → OC-1, P2-2 and P2-3 → OC-5, P2-4 and P2-9 → OC-11, P2-5 → OC-10. P4-2 → OC-4. The rest of
Phase 2 (P2-6, P2-7, P2-8, P2-10) follows Phase OC.

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

### P2-10. Split the README — Sonnet, M
- **Change:** `README.md` becomes one page: what it is, install, "what you say → what happens" (a short table), what it will
  not do, requirements. Move each long section to `docs/<topic>.md` and link it. Keep every stated limit.
- **Test:** `docs.test.mjs` looks for command and agent mentions across `README.md` and `docs/`.

---

## Phase 3 — real capability gaps (release after Phase 2)

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
- **P4-2. MOVED to OC-4 (a build that keeps going). A workflow state file — Opus, L.** If the trials show steps being skipped in long builds:
  `scripts/next.mjs` holds the feature pipeline as states (brief → build → review round n → merge → prove → records →
  checkpoint), stores the current state in `.claude/kit-state.json`, prints only the instructions for the current state, and
  refuses a transition whose evidence is missing (no branch, no merge commit, no review verdict recorded). `feature.md`
  becomes "ask next.mjs what to do". This also makes resuming after a context reset exact.
- **P4-3. DONE in 2.23.0 (`cards/`, `scripts/cards.mjs`) — Pattern cards for the hard parts of SaaS — Sonnet, M each.** Short, stack-neutral references with the tests that
  prove them: tenant isolation, billing webhooks (signature, idempotency, retries, failed payments, cancellation), sign-in
  and sessions, roles and permissions, background jobs, email. Loaded only when a feature is tagged with that area.
- **P4-4. Records folder as a vault** (D4), if not done in Phase 2.

---

## Keep as is

The drift check, record compaction, checkpoints, the migration check, the database guard's deny rules, the schema map for
SQL/Prisma/Rails/SQLite, the flight recorder's privacy rules, the trust system, the secret scanner, the package guard, the
roadmap proof rule, milestone acceptance, the vetting workflow. They are small and cover real risks.

## Open items added 2026-11-27 (review of releases 2.18 to 2.22)

- **W-1. A kit workflow for very wide jobs** (Claude Code's dynamic workflows, shipped in the plugin's `workflows/` folder as
  `.js`). Wait until Anthropic documents choosing an agent type, tools and an isolated copy for a workflow's agents: today a
  workflow's agents can't be the kit's read-only reviewers or scouts, so it would build outside the kit's rules. First candidates:
  mapping a huge codebase area by area, and a sweep for one bug across hundreds of files. Test only in a live trial.
- **W-2. Workflows started by Claude go around "only the conductor starts agents".** `agent-route.mjs` watches the Agent tool;
  the Workflow tool is separate. Decide after a live trial whether a guard should ask before an unrequested workflow.
- **K-1. One shared start for the hook scripts.** `dup-check.mjs` finds 20 copies in the kit itself, mostly the same stdin and
  settings code at the top of each hook. Refactor in a quiet release, with the full fuzz suite both ways, never alongside a feature.
- **T-1. A live trial of 2.18 to 2.23** before more features: trial 3's next session, then compare review rounds and Opus share
  with milestone 1, and measure the token-saving claims on the GitHub page.

## Open items added 2026-11-28 (review 3)

- **G-1. Branch rules on GitHub.** `main`, `stable` and `candidate` reported `protected=false`. Add rules for `main` and `stable`:
  no force-push, no deletion. These cannot block the promote job's fast-forward push. Requiring the tests check would also stop a
  direct push to main, but could stop the promote job too; try that only with a test release. A repository setting, so it needs
  the owner's yes.
- **G-2. Crash behaviour of the other shell guards.** The safety guard now asks when it fails internally (2.25.0). The db,
  secret, push and package guards still allow on an internal error, by design ("never block by accident"). Decide after a trial
  whether a failed secret or push check should ask instead.
- **G-3. Instruction weight.** The five largest instruction files total about 12,500 words against the 4,500 target (OC-11).

## Owner decisions (ask once, with the recommendation)

| | Question in plain words | Recommendation |
|---|---|---|
| D1 | Keep all hooks in one process (a little faster) now that a self-check will prove they run, or go back to separate ones? | Keep, with the self-check. Go back at once if the self-check ever fails. |
| D2 | May the repository run its tests automatically on GitHub (free, no tokens)? | Yes. |
| D3 | For the first trial, will you run it, or may the session start a separate normal session and read its log? | Either; say which. |
| D4 | Move the project record files into one `docs/` folder? | Yes, now, while nothing depends on the layout. |
| D5 | May Playwright be installed (several hundred megabytes) so the speed test can be run for real once? | Yes, if the disk has room. |
| D6 | May the Postgres rehearsal use a vetted library or Docker? | Yes to the library, after vetting. |
| D7 | For this repository: push every release as now, or commit each release and push only when you say so (plus the stable channel once it exists)? | **Decided by Claude, at the owner's request (2026-11-27: "defer to you on decisions").** Releases are pushed (with the owner's yes) to the `candidate` branch; GitHub's tests on all six setups must pass before it moves `main` and `stable` to that commit. Reason: 2.21.0 reached main-channel computers before failing on five setups. |
| D8 | During setup, may the kit's own scripts, local git (commit, branch, merge) and the project's install, test and build commands run without asking each time? Push, deploy and anything risky would still always ask, and the guards still check every command. | **Decided by Claude, at the owner's request (2026-11-27):** setup offers three levels and recommends "ask me only before risky actions" (the kit's scripts, local git without push, and the project's own commands run freely; the guards still question every risky command, and a snapshot is saved first). The owner picks the level in each project. |
| D9 | For the ready-made recipes: which host should the kit prefer by default for websites and web apps (cost and simplicity first)? | **Decided by Claude, at the owner's request (2026-11-27).** No host is hard-coded: websites use GitHub Pages (free, GitHub is already needed); web apps and APIs ship a portable container setup, and `/starter-kit:launch` compares two or three hosts' current prices and free tiers at launch time. Reason: prices change faster than the kit releases. |
| D10 | May each milestone be put on a private preview link on the host (test keys and test data only), so you check it by clicking a link? | Yes, once a host is chosen. |
| D11 | May medium, large and risky features be built and reviewed on the stronger model (Opus, about twice Sonnet's usage), with small ones staying on Sonnet? | **Decided by Claude, at the owner's request (2026-11-27):** yes, as built (Opus for medium, large and risky features and all security reviews; re-checks on Sonnet). Revisit with the next trial's Opus share. |
| D12 | Should the kit ever pick the most expensive model (Fable, about four times Sonnet) by itself? | **Decided by Claude, at the owner's request (2026-11-27):** no. The kit never picks Fable by itself (about four times Sonnet's cost, no evidence it is needed); the owner may always choose it for a session. |
| D13 | When a project is set up, may the kit set that project's chats to tidy themselves (compact) at 300,000 tokens? Big-context models otherwise wait until about 967,000, and every message before that re-sends everything. | Yes. It is one line in the project's own settings file, inside the yes/no setup already asks. |
| D14 | Part B of Phase S changes how every feature is built (each one in its own fresh context), and nothing since 2.12.1 has run in a live session. Run one trial build after part A first, or build part B now? | Trial first: a problem in the new flow could then not be confused with an older one. If you want it now, it ships with the old flow intact as an automatic fallback and a switch (`"freshContext": false`). |

## Definition of done for the whole plan

- A fresh session on Windows, macOS or Linux shows the session note, and the canary is blocked through every shell tool.
- The test matrix is green on three operating systems, and machines only update after it is.
- One trial app has been built end to end, and its flight report shows the expected workflow order with no skipped review.
- The five longest instruction files (`init`, `spec`, `feature`, `implementer`, `full-scan`) total under 4,500 words (about
  8,000 today), and the session note is under 400.
- Every blocking check is something a script can prove.
- Savings: a noisy command's output reaches Claude as failures and a summary, with the full log one read away; a second review
  round reads only the fix; a ten-feature build leaves the main conversation small enough that it was never compacted; a build cut
  off at any point resumes at its last verified step.
- Models: one script decides which model each agent runs on, a hook refuses a review on a model below its minimum, no Haiku agent
  can write, run commands or start agents, and a trial's flight report shows tokens per model.
- One-click: a trial app built from a preset needs the owner for one intake, one checklist, one acceptance per milestone (each a link
  to click) and one go-live, and for nothing else unless the flight report shows a genuine reason (OC-12 counts it).
- A build left alone keeps going until a milestone, a checklist item or a real decision needs the owner, and resumes at the right
  step after a session ends or a usage limit is hit.
