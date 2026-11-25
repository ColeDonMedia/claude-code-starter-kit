# Handoff — starter-kit plugin (for the next session, human or bot)

Read this, then `IMPROVEMENT-PLAN.md` (the work list, next to this file), the root `CLAUDE.md` (how to work on this repo) and
`CHANGELOG.md` (history). The README is a short front page; topic detail lives in `docs/`.
Rewrite this file at the end of every session; keep it under 55 lines and true.

## State at version 2.17.0 (2026-11-25)
- Public repo, MIT, installed from GitHub. Auto-update checks once per 24 hours at session start, in the background; a new
  version takes effect on the session AFTER that. This machine was still on 2.6.0 at the audit.
- `plugins/starter-kit/`: 21 commands, 1 workflow file, 10 agents, 18 hook scripts (`gate.mjs` runs the rest), 43 helper scripts,
  2 templates, vetted data in `library/`, 499 tests (unit tests only, one Windows machine). Hook tests also pass through the gate.
- OWNER RULE: never spend API tokens (no `claude -p`, no npx claude-code runs, no `claude plugin eval`). `CLAUDE.md` says so.
- Done: Phase 0, Phase M (all but M-14), Phase S (all but S-12). Decisions: D1 merged hook runner; D11 Opus for medium, large and
  risky features; D12 never Fable; D13 compact project chats at 300K; D14 Phase S part B built before a trial, old flow as fallback.
- 2.14.1 and 2.15.0 are pushed; check `git log origin/main..` for 2.16.0 and 2.17.0.

## Recent work, and how far it is verified
- 2.17.0 (Phase S part B): `/starter-kit:feature` dispatches to the new `conductor` agent, which runs `workflows/feature.md` in a
  fresh context and returns a twelve-line result; `build-state.mjs` records each stage outside the project and resumes from git;
  `agent-route.mjs` lets only the conductor start agents; `conductor-check.mjs` verifies a MERGED commit; `compact-notes.mjs`
  steers compaction summaries; `init` sets `autoCompactWindow` 300000. Unit tests with real temporary git repositories.
  NOT verified live: that the conductor really starts nested agents and keeps their worktrees (V24/V25: not stated for nested
  launches), that SendMessage answers reach it, that PreCompact output shapes the summary, the session note after a compaction.
- 2.16.0 (Phase S part A): noisy successful output shortened via PostToolUse `updatedToolOutput` (full log in a self-ignoring
  `.claude/logs/`), fix-only re-review, edit-don't-rewrite, resume-cost and Fable notices, `doctor --plugins`. NOT verified live:
  that Claude Code accepts the replacement object for Bash and PowerShell (the flight log's "quiet" lines will show it).
- 2.15.0 and 2.14.1 (Phase M): model routing, model-check hook, scout, investigator. NOT verified live (see CHANGELOG).

## Not verified (be honest about this)
- Nothing since 2.12.1 has run inside a live Claude Code session. The first session on a new version asks Claude to run
  `starter-kit-canary` with each shell tool: that is the first live proof. If it is not refused, roll back `hooks.json` to the
  2.11.0 shape (one process per hook) plus the `Bash|PowerShell` matchers.
- No end-to-end trial has run (`docs/trials.md`), so Phases M and S have no before-and-after numbers: M-14 and S-12 wait for one.
- macOS and Linux are untested. Postgres and MySQL: only the plan parser is tested.
- The push gate's ship marker is still written by Claude from a prose instruction (P2-2 makes a script write it).
- Pattern-based screens, not proof: the PowerShell reader, code index, API and migration checks, model-route's risky-word list,
  quiet-lib's list of noisy programs and failure words.

## Known risks
- The GitHub repo is the source of code that auto-runs on every computer, straight from `main`: keep two-factor on (P1-2 adds a stable channel).
- The conductor is new and changes how every feature is built. If a trial shows it failing, tell the owner and set
  `{ "freshContext": false }` in that project while it is fixed.
- The model ceiling file (data folder) is not guarded against direct writes; it can only cap at Sonnet, and reports show it.
- Fake keys in tests must be built from pieces: GitHub push protection refuses key-shaped text written out in full.

## Do this first next session
1. Ask the owner the open decisions in one message: D2 (tests on GitHub), D3 (how to run the first trial), D7 (push policy).
2. Run the first trial (P1-6) on the newest version. Read its flight report for M-14 and S-12: models and tokens per agent, review
   rounds, scout pointers, shortened output, rewrites, compactions, conductor results.
3. After any update, ask whether the first session on the new version refused the canary with both shell tools.

## Rules that must not regress
- Nothing from a project's own files may run or take effect without the user's approval on this computer (see `CLAUDE.md`).
- Every guard covers every shell tool. MODEL and HAIKU rules; only the conductor starts agents. Session note under 520 words.
- Every release: bump `plugin.json`, add a `CHANGELOG.md` entry, update this file and the plan, run all tests both ways, validate.
