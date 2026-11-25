# Handoff — starter-kit plugin (for the next session, human or bot)

Read this, then `CLAUDE.md` (how to work on this repo), `README.md` (what the kit does) and `CHANGELOG.md` (history).
Rewrite this file at the end of every session; keep it under 40 lines and true.

## State at version 2.2.0 (2026-11-24)
- Public repo `ColeDonMedia/claude-code-starter-kit`, MIT, installed from GitHub; machines self-update daily.
- The plugin lives in `plugins/starter-kit/`: 12 commands, 7 agents, 11 hooks, helper scripts, ~250 tests.
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

## Known risks
- The GitHub repo is the source of code that auto-runs on every computer: keep two-factor on for that account.
- Third-party skills are never bundled; `VETTED.md` lists what was reviewed (commits pinned).

## Do this first next session
1. If credit is available, run a real small project through plan → build → ship and fix what breaks.
2. Watch for false positives from the guards (safety, package, secret, docs) and loosen rules with tests.

## Rules that must not regress
- Nothing from a project's own files may run or take effect without the user's approval on this computer (see `CLAUDE.md`).
- Keep the session note small (test limit 520 words); every command description is loaded each session.
- Every release: bump `plugin.json`, add a `CHANGELOG.md` entry, update this file, run all tests, push.
