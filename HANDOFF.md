# Handoff — starter-kit plugin (for the next session, human or bot)

Read this, then `CLAUDE.md` (how to work on this repo), `README.md` (what the kit does) and `CHANGELOG.md` (history).
Rewrite this file at the end of every session; keep it under 40 lines and true.

## State at version 2.9.0 (2026-11-24)
- Public repo `ColeDonMedia/claude-code-starter-kit`, MIT, installed from GitHub; machines self-update daily.
- The plugin lives in `plugins/starter-kit/`: 19 commands, 7 agents, 10 hook scripts, helper scripts, ~325 tests.
- Code index verified read-only on a real 9.2M-line Python install (correct impact/hubs; 3.5 min first build, ~30 s re-index outside git on Windows). `/onboard`, scoped tests inside `/feature`, and the reviewer's impact check have NEVER RUN LIVE.
- OWNER RULE: never spend API tokens (no `claude -p`, no npx claude-code runs). Test with unit tests only; live trials are run by the owner in a normal session (`DOGFOOD.md`).
- Everything is unit-tested against real git repositories and (for packages) the live registries.

## Not verified (be honest about this)
- Only ONE hook has been seen firing in a live interactive session: the safety guard blocked a commit (a false positive:
  a heredoc commit message containing "rm -rf //" was read as a command; fixed in 2.2.0 with fuzz round 4). Every other
  hook is tested by calling it with Claude Code's payload shape, not seen live. Lesson: live use finds bugs that tests
  written from the author's imagination miss. The routing choice (which command Claude picks) was observed live, 7 requests.
- The full pipeline (plan, research, multi-feature build, ship) has never run end to end. The account's API credit
  ran out, so live runs stopped. One small test-first change with reviewer approval did run live.
- Whether command text expands `${CLAUDE_PLUGIN_ROOT}` is unknown, so commands use `<SCRIPTS>` and the session note
  gives the real path. Hooks do get the variable (their config uses it and works).
- Haiku-quality research vs Sonnet is unmeasured.

- NEVER RUN LIVE: the `red-team` and `challenger` agents, `/redteam`, and the way `/feature` calls them. `mutate.mjs` was tested on real worktrees; the attack-scope guard (attack tools only at localhost) was fuzz-tested.
- Fuzzing found 63 real gaps in the safety guard and secret scanner (fixed). Expect more disguises in the wild: add them to `guard-fuzz.test.mjs` / `secret-fuzz.test.mjs` first.

- NEVER RUN LIVE: `/accept` and `/status` (the scripts behind them are unit-tested; the conversation flow isn't).

- NEVER RUN LIVE: the browser-test setup (Playwright install, config, screenshots) and the UI reviewer reading screenshots. `perf-budget.mjs` and `disk-free.mjs` are unit-tested.

- NEVER RUN LIVE: `/launch` and `/maintain` (the checks behind them are unit-tested). They need real accounts and a real host, so they will need adjusting on first real use.

- NEVER RUN LIVE: drift check, compaction, checkpoints and stall warnings at session start (unit-tested, incl. a simulated 50-session build).
- NEVER RUN LIVE: the flight recorder (tested with Claude Code's payload shape; whether `PreToolUse`/`PostToolUse` carry `tool_use_id` and `Stop` runs for subagents is unconfirmed), `/dogfood`, the design quality bar and scoring, the context pack inside `/feature`. No trial in `DOGFOOD.md` has been run yet.
- NEVER RUN LIVE: `/legal` (conversation and drafting). The checkers are unit-tested. The drafts are AI-written and need a lawyer.

## Known risks
- The GitHub repo is the source of code that auto-runs on every computer: keep two-factor on for that account.
- Third-party skills are never bundled; `VETTED.md` lists what was reviewed (commits pinned).

## Do this first next session
1. The owner runs trial 1 from `DOGFOOD.md` in a normal session; read its flight report, fix what broke, log it in `DOGFOOD.md`.
2. Watch for false positives from the guards (safety, package, secret, docs) and loosen rules with tests.

## Rules that must not regress
- Nothing from a project's own files may run or take effect without the user's approval on this computer (see `CLAUDE.md`).
- Keep the session note small (test limit 520 words); every command description is loaded each session.
- Every release: bump `plugin.json`, add a `CHANGELOG.md` entry, update this file, run all tests, push.
