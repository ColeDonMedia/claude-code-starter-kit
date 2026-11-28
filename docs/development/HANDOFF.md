# Handoff — starter-kit plugin (for the next session, human or bot)

Read this, then `IMPROVEMENT-PLAN.md` (open work; finished items are in `PLAN-DONE.md`), the root `CLAUDE.md` (how to work on
this repo) and `CHANGELOG.md` (history). Rewrite this file at the end of every session; keep it under 55 lines and true.

## State at version 2.24.0 (2026-11-27)
- Public repo, MIT, installed from GitHub. Auto-update checks once per 24 hours at session start; a new version takes effect on the
  session AFTER that. This machine is updated by hand before each trial.
- `plugins/starter-kit/`: 21 commands, 4 procedure files (`procedures/`, renamed from `workflows/` because Claude Code now reads a
  plugin's `workflows/` as dynamic-workflow `.js` scripts), 11 agents, 23 hook scripts (`gate.mjs` runs the rest), 62 helper
  scripts, 6 pattern cards (`cards/`), 4 stack recipes (`presets/`), vetted data in `library/`. Tests: see the release check below.
- OWNER RULE: never spend API tokens (no `claude -p`, no npx claude-code runs, no `claude plugin eval`). `CLAUDE.md` says so.
- RELEASES (D7, 2026-11-27): push (with the owner's yes) to `candidate`; GitHub tests six setups and only then moves `main` and
  `stable`. Watch the run. 2.21.0 had reached main-channel computers before failing; that can no longer happen.
- DECISIONS the owner delegated on 2026-11-27 ("defer to you on decisions"), recorded as Claude's, at the owner's request: D7 (above),
  D8 (setup recommends "ask me only before risky actions"), D9 (no host built in; GitHub Pages for websites; containers for web
  apps and APIs; launch compares current prices), D11 (Opus for medium/large/risky, kept), D12 (never Fable by itself, kept).
- Trial 3 (2.17.2, `docs/trials.md`) finished milestone 1 and is on F-004. Its next NEW session is the first live run of 2.18+.

## Recent work, and how far it is verified
- 2.24.0: running-cost check (`procedures/spec-costs.md`, `cost-model.mjs`; quoted prices, script arithmetic). Unit-tested.
- 2.23.0 (review of 2.18-2.22): `(existing ...)` only under Milestone 0 and only for commits before the first roadmap; One-source
  entries need a test and "Shown on" files that call the function (NO TEST / NOT USED fail, CHECK lines name likely second
  versions); the guard follows `cd`, asks before moving code out of the project or overwriting a code file (`>`, Set-Content,
  a move onto it); snapshots also before single-file deletes; local Postgres/MySQL dumps (`dumpPlans`, unit-tested with a fake
  pg_dump only); fuzz round 6 (Bash and PowerShell); bundled data scanned on every test run; status and accept understand
  Milestone 0; planning split (`procedures/spec-takeover.md`, `spec-market.md` with a cheap demand test); session note 493 words;
  stack guides one path-scoped file per stack; setup's three permission levels; pattern cards; recipe containers (never built
  here: no Docker; the weekly `recipes.yml` builds them); flaky-test step in `tests.yml`; README model/effort and Ultracode section.
- 2.18-2.22 (stack guidelines, delete protection, snapshots, take-over, Scope blocks, cite-check, recipes, one source, market
  check, user-tester, security hooks, UI checklist, stable channel): none tried live. 2.17.0 conductor: live in trial 3.

## Not verified (be honest about this)
- Everything from 2.18 on is untried in a live build (M-14, S-12, T-1). macOS and Linux pass the unit tests on GitHub only.
- The cost check has never priced real pages: many pricing pages need scripts and will come back UNREACHABLE to cite-check.
- Recipe containers and the weekly recipe job have not run yet. Database dumps never ran against a real Postgres or MySQL.
- Whether plugin and kit hooks fire inside dynamic-workflow agents is inferred from the docs, not tested (W-2).
- Pattern-based screens, not proof: the PowerShell reader, code index, API and migration checks, model-route's risky words,
  quiet-lib's lists, fetch guard, code and injection warnings, cards' trigger words, dup-check's CHECK lines, riskOf.

## Known risks
- The repo is code that auto-runs on every computer: keep two-factor on. Conductor trouble: `{ "freshContext": false }`.
- Fake keys in tests are built from pieces (push protection). The kit's own db guard reads test text in shell commands: write
  tests that mention remote databases with the file tools, not a shell heredoc.

## Do this first next session
1. T-1: start trial 3's next session on this version; compare review rounds and Opus share with milestone 1.
2. Check the first weekly `recipes` run; fix any recipe or container that fails. 3. Confirm `...@stable` installs and follows stable.

## Rules that must not regress
- Nothing from a project's own files may run or take effect without the user's approval on this computer (see `CLAUDE.md`).
- Every guard covers every shell tool; the safety guard only reads. MODEL and HAIKU rules; only the conductor starts agents.
- Session note under 520 words. Every command, agent and procedure has a Scope block.
- Every release: bump `plugin.json`, add a `CHANGELOG.md` entry, update this file and the plan, run all tests both ways, validate.
