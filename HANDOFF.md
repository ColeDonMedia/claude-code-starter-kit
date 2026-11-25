# Handoff — starter-kit plugin (for the next session, human or bot)

Read this, then `IMPROVEMENT-PLAN.md` (the work list), `CLAUDE.md` (how to work on this repo) and `CHANGELOG.md` (history).
Rewrite this file at the end of every session; keep it under 55 lines and true.

## State at version 2.13.0 (2026-11-25)
- 2.13.0 (owner request, outside the plan): sizing an app to its users. Scale profile (`.claude/scale.json`, `scale-profile.mjs`),
  local load test (`load-test.mjs`, localhost only), desktop/CLI check (`desktop-check.mjs`), rehearsal sizes from the profile.
  Verified: unit tests with real local HTTP servers and real child processes on Windows (memory of the whole process tree, app
  always stopped). NOT verified: macOS/Linux `ps` path, a real app, a real staging host. On Windows one memory sample takes ~1.5 s.
- 2.12.2 (owner request, outside the plan): payment keys. Stripe test and restricted keys, webhook secrets and Square tokens are
  caught; publishable keys pass; block messages say where a key goes. Owner's question was "can a private repo hold keys with a
  warning?"; answer given and agreed: no repo holds secret keys, the code reads them from the environment.
- Public repo, MIT, installed from GitHub. Auto-update checks once per 24 hours at session start, in the background; a new
  version takes effect on the session AFTER that (a single restart is not enough). This machine was still on 2.6.0 at the audit.
- `plugins/starter-kit/`: 20 commands, 7 agents, 13 hook scripts (`gate.mjs` runs the rest), 37 helper scripts, 429 tests
  (428 pass, 1 skipped; unit tests only, run on one Windows machine). Hook tests also pass through the gate (`KIT_VIA_GATE=1`, 257).
- OWNER RULE: never spend API tokens (no `claude -p`, no npx claude-code runs, no `claude plugin eval`). `CLAUDE.md` now says so.
- Phase 0 of `IMPROVEMENT-PLAN.md` is DONE (see its Progress table). Owner decision D1: keep the merged hook runner, with the
  canary, the self-check and fail-closed as the safety net.

## Fixed in 2.12.1 (all were confirmed bugs)
- Guards now cover the PowerShell tool (all 47 dangerous PowerShell test commands had been let through before).
- `challenger` and `security-reviewer` load with their real settings (they had every tool).
- Subagents get the kit's scripts folder (SubagentStart hook, `${CLAUDE_PLUGIN_ROOT}` in commands and agents).
- Read, Grep and Glob no longer start a hook process.
- A crashed guard refuses a shell command instead of letting it run unchecked; `starter-kit-canary` proves the guards run.
- Automatic test runs stop when `.env` points at a database on another computer.
- The approval-file rule blocks changes to it only, not reads.

## What was verified, and how
- Docs (2026-11-25): PowerShell payload shape, matcher rules, SubagentStart, `${CLAUDE_PLUGIN_ROOT}` in markdown, exit codes
  (answers V1-V5 and V8 are in the plan).
- `scripts/doctor.mjs` on this machine: both canaries refused through `gate.mjs`, hooks registered, data folder writable.
- Earlier: code index on a real 9.2M-line Python install; a simulated 50-session build; SQLite at 100k/200k rows.

## Not verified (be honest about this)
- Nothing has run inside a live Claude Code session since these changes: not the PowerShell guarding, the SubagentStart hook,
  `${CLAUDE_PLUGIN_ROOT}` substitution in command text, the self-check line, or fail-closed. The first session on 2.12.1 will ask
  Claude to run the canary with each shell tool: that is the first live proof. If it is not refused, roll back `hooks.json` to the
  2.11.0 shape (one process per hook) plus the `Bash|PowerShell` matchers.
- No end-to-end trial has run (`DOGFOOD.md`). macOS and Linux are untested. Postgres and MySQL: only the plan parser is tested.
- The push gate's ship marker is still written by Claude from a prose instruction (plan task P2-2 makes a script write it).
- The PowerShell reader is pattern-based: aliases defined at run time, variables holding paths, and scripts run with -File are not seen.

## Known risks
- The GitHub repo is the source of code that auto-runs on every computer, straight from `main`: keep two-factor on (P1-2 adds a stable channel).
- Third-party skills are never bundled; `VETTED.md` lists what was reviewed (commits pinned).

## Do this first next session
1. Ask the owner whether the first session on 2.12.1 refused the canary with both shell tools.
2. Phase 1 of `IMPROVEMENT-PLAN.md` (needs owner decisions D2 and D3). Do not start Phase 2 until one trial run has happened.

## Rules that must not regress
- Nothing from a project's own files may run or take effect without the user's approval on this computer (see `CLAUDE.md`).
- Every guard covers every shell tool. Keep the session note small (test limit 520 words).
- Every release: bump `plugin.json`, add a `CHANGELOG.md` entry, update this file and the plan, run all tests both ways, validate, push.
