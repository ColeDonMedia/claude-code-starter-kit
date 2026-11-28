# Handoff — starter-kit plugin (for the next session, human or bot)

Read this, then `IMPROVEMENT-PLAN.md` (open work; finished items are in `PLAN-DONE.md`), the root `CLAUDE.md` (how to work on
this repo) and `CHANGELOG.md` (history). Rewrite this file at the end of every session; keep it under 55 lines and true.

## State at version 2.25.0 (2026-11-28)
- Public repo, MIT, installed from GitHub. Auto-update checks once per 24 hours at session start; a new version takes effect on the
  session AFTER that. This machine is updated by hand before each trial.
- `plugins/starter-kit/`: 21 commands, 4 procedure files, 11 agents, 23 hook scripts (`gate.mjs` runs the rest), 65 helper scripts
  (new: `shell-lib.mjs`, the one command reader every shell guard uses; `ship-detect.mjs`; `ship-mark.mjs`), 6 pattern cards,
  4 stack recipes, vetted data in `library/`.
- OWNER RULE: never spend API tokens (no `claude -p`, no npx claude-code runs, no `claude plugin eval`). `CLAUDE.md` says so.
- RELEASES (D7): push (with the owner's yes) to `candidate`; GitHub tests six setups and only then moves `main` and `stable`.
- Decisions the owner delegated on 2026-11-27 are recorded as Claude's: D7, D8, D9, D11, D12 (see the plan).
- Trial 3 (2.17.2, `docs/trials.md`) finished milestone 1 and is on F-004. Its next NEW session is the first live run of 2.18+.

## Recent work, and how far it is verified
- 2.25.0 (review that ran the real hooks on Windows; the owner said "do all"): Git Bash `/c/` paths, deletes outside the project
  (`rm-outside`), pushes and commits the old patterns missed (shared reader), `commit -a` and gist scans, approval script alone,
  Monitor and `run_in_terminal` guarded, the kit's own files and markers protected, `ship-mark.mjs` writes the pass marker,
  five more switches need approval, a check that could not run is not a pass, git discard forms ask, a broken safety guard asks.
  Tests first (`hooks/gaps.test.mjs`, round 7 in both fuzz files; all failed on 2.24.0). Full suite both ways on Windows only.
- 2.24.0: running-cost check. 2.23.0: review of 2.18-2.22. 2.18-2.22: none tried live. 2.17.0 conductor: live in trial 3.

## Not verified (be honest about this)
- Everything from 2.18 on is untried in a live build (M-14, S-12, T-1). macOS and Linux pass the unit tests on GitHub only.
- 2.25.0: that Claude Code sends Monitor and `mcp__*__run_in_terminal` calls to a regex matcher (`^(Monitor|mcp__.+__run_in_terminal)$`)
  is from the docs' matcher rules, not seen live. The Windows-only Git Bash test is skipped on macOS and Linux.
- V9 and V10 (do guards still ask when a permission allow rule matches; exact rule syntax) are still unchecked, though setup's
  "ask me only before risky actions" level (2.23.0) depends on them.
- The cost check has never priced real pages. Recipe containers and the weekly recipe job have not run yet. Database dumps never
  ran against a real Postgres or MySQL. Hooks inside dynamic-workflow agents: inferred from the docs (W-2).
- Pattern-based screens, not proof: the shell reader, code index, API and migration checks, model-route's risky words,
  quiet-lib's lists, fetch guard, code and injection warnings, cards' trigger words, dup-check's CHECK lines, riskOf.

## Known risks
- The repo is code that auto-runs on every computer: keep two-factor on. `main`, `stable` and `candidate` had no branch rules on
  2026-11-28 (a force-push to main would reach every computer); see the plan, G-1.
- Fake keys in tests are built from pieces (push protection). Write test files with the file tools: shell heredocs here lost
  backslashes, and the kit's own guards read test text in shell commands.
- Projects that switched `verifyGate`, `docsGate` or `planGate` off by hand get those checks back until the owner approves.

## Do this first next session
1. T-1: start trial 3's next session on this version; compare review rounds and Opus share with milestone 1. In it, run the
   canary through Monitor once to confirm the new matcher fires.
2. Check the first weekly `recipes` run. 3. Confirm `...@stable` installs and follows stable. 4. V9/V10 from the docs.

## Rules that must not regress
- Nothing from a project's own files may run or take effect without the user's approval on this computer (see `CLAUDE.md`).
- Every guard covers every shell tool (Bash, PowerShell, Monitor, run_in_terminal) and reads commands with `shell-lib.mjs`.
- MODEL and HAIKU rules; only the conductor starts agents. Session note under 520 words. Every file has a Scope block.
- Every release: bump `plugin.json`, add a `CHANGELOG.md` entry, update this file and the plan, run all tests both ways, validate.
