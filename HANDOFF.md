# Handoff — starter-kit plugin (for the next session, human or bot)

Read this, then `CLAUDE.md` (how to work on this repo), `README.md` (what the kit does) and `CHANGELOG.md` (history).
Rewrite this file at the end of every session; keep it under 50 lines and true.

## State at version 2.10.0 (2026-11-24)
- Public repo `ColeDonMedia/claude-code-starter-kit`, MIT, installed from GitHub; machines self-update daily.
- `plugins/starter-kit/`: 20 commands, 7 agents, 11 hook scripts, helper scripts, ~340 tests (all unit tests, local only).
- OWNER RULE: never spend API tokens (no `claude -p`, no npx claude-code runs). Live trials are run by the owner in a
  normal session (`DOGFOOD.md`); read the flight report afterwards (`/dogfood`).
- This session added: 2.7 flight recorder, taste bar, decisions memory; 2.8 drift/compaction/checkpoints/stalls;
  2.9 code index, impact, scoped tests, `/onboard`; 2.10 database guard, migration check, rehearsal, `/db`.

## What was verified, and how
- Code index: read-only on a real 9.2M-line Python install (31k files; impact and hubs correct; 3.5 min first build;
  ~30 s re-index outside git on Windows, ~2 s for 10k committed files thanks to git hashes).
- Long builds: a simulated 50-session project (session note flat, nothing lost, checkpoints on time, drift caught).
- Databases: real SQLite with 100k users / 200k orders (missing index found, fix proven, original file untouched).
  No Postgres or MySQL on this machine: the Postgres plan parser is tested on sample `EXPLAIN` JSON only.
- Database guard: 16 deny, 14 allow, 7 ask cases. Expect real-world commands it misreads; add them to `db.test.mjs` first.

## Not verified (be honest about this)
- The full pipeline (plan, research, multi-feature build, ship) has never run end to end live. Only the safety guard has
  been seen firing in a live session; every other hook is tested with Claude Code's payload shape.
- NEVER RUN LIVE: red-team, challenger, `/redteam`, `/accept`, `/status`, `/launch`, `/maintain`, `/legal`, `/dogfood`,
  `/onboard`, `/db`, browser tests, the UI reviewer's scoring, scoped tests and impact checks inside `/feature`, the
  session-start drift/checkpoint/stall warnings, the flight recorder (does `tool_use_id` arrive? does `Stop` fire for subagents?).
- Whether command text expands `${CLAUDE_PLUGIN_ROOT}` is unknown (commands use `<SCRIPTS>`; the session note gives the path).
- The code index is pattern-based: dynamic imports, reflection, dependency injection and generated code are missed.
- The database guard reads commands only: an app or script that connects by itself is not seen.

## Known risks
- The GitHub repo is the source of code that auto-runs on every computer: keep two-factor on for that account.
- Third-party skills are never bundled; `VETTED.md` lists what was reviewed (commits pinned).

## Do this first next session
1. The owner runs trial 1 from `DOGFOOD.md`; read its flight report, fix what broke, log it in `DOGFOOD.md`.
2. Watch for false positives from the guards (safety, package, secret, database, docs); loosen rules with tests.

## Rules that must not regress
- Nothing from a project's own files may run or take effect without the user's approval on this computer (see `CLAUDE.md`).
- Keep the session note small (test limit 520 words); every command description is loaded each session.
- Every release: bump `plugin.json`, add a `CHANGELOG.md` entry, update this file, run all tests, push.
