# Handoff — starter-kit plugin (for the next session, human or bot)

Read this, then `IMPROVEMENT-PLAN.md` (the work list), `CLAUDE.md` (how to work on this repo) and `CHANGELOG.md` (history).
Rewrite this file at the end of every session; keep it under 55 lines and true.

## State at version 2.12.0 (2026-11-25)
- Public repo, MIT, installed from GitHub. Auto-update checks once per 24 hours at session start, in the background; a new
  version takes effect on the session AFTER that (a single restart is not enough).
- `plugins/starter-kit/`: 20 commands, 7 agents, 12 hook scripts (`gate.mjs` runs the rest), 33 helper scripts, 379 tests
  (378 pass, 1 skipped; unit tests only, run on one Windows machine).
- OWNER RULE: never spend API tokens (no `claude -p`, no npx claude-code runs, no `claude plugin eval`). One line in
  `CLAUDE.md` still says to test with a headless run: IGNORE IT (plan task P0-2 removes it).
- An audit on 2026-11-25 produced `IMPROVEMENT-PLAN.md`: 20 findings with evidence, then tasks in phases 0 to 4.

## Confirmed bugs, found live (fix first: Phase 0 of the plan)
- The `challenger` and `security-reviewer` agents load with no description and ALL tools: unquoted `: ` in their YAML.
- No guard sees the PowerShell tool. On Windows every protection can be bypassed by using it instead of Bash.
- Subagents are told to run `<plugin>/scripts/…` and nothing tells them where that is.
- Since 2.7.0 every tool call (Read, Grep, Glob too) starts Node twice: about 0.6 s of added wait per call on Windows.
- The push gate's "passed" marker is written by Claude from a prose instruction.
- The approval-file rule blocks any command that merely mentions the file's name.

## What was verified, and how
- Hook tests: all 225 also pass through `gate.mjs` (`KIT_VIA_GATE=1`). Merged is about 470 ms against 540 ms per shell command.
- Code index: read-only on a real 9.2M-line Python install (correct impact and hubs; 3.5 min first build).
- Long builds: a simulated 50-session project. Databases: real SQLite with 100k users and 200k orders.
- Live in a real session: the safety guard denied a command twice (once correctly placed, once a false alarm).

## Not verified (be honest about this)
- Nothing has run end to end. No trial in `DOGFOOD.md` has been run. Every workflow command, every agent, the flight
  recorder, the session-start warnings, the speed test template (Playwright not installed) and the merged hook runner have
  never been watched inside Claude Code.
- If `gate.mjs` breaks in real use, every guard and the session note stop at once and nothing says so (plan task P0-6).
- macOS and Linux: untested. Postgres and MySQL: only the plan parser is tested, on sample output.
- The code index, the API check and the migration check match patterns; they are screens, not proof.
- Open questions about Claude Code's own behaviour are listed in the plan under "Verify against the docs".

## Known risks
- The GitHub repo is the source of code that auto-runs on every computer, straight from `main`: keep two-factor on.
- Third-party skills are never bundled; `VETTED.md` lists what was reviewed (commits pinned).

## Do this first next session
1. Do Phase 0 of `IMPROVEMENT-PLAN.md` as release 2.12.1, in the order written. Ask the owner decision D1 first.
2. Then Phase 1. Do not start Phase 2 until one trial run has happened.

## Rules that must not regress
- Nothing from a project's own files may run or take effect without the user's approval on this computer (see `CLAUDE.md`).
- Keep the session note small (test limit 520 words); every command description is loaded each session.
- Every release: bump `plugin.json`, add a `CHANGELOG.md` entry, update this file, run all tests, push.
