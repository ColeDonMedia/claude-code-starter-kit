# Handoff — starter-kit plugin (for the next session, human or bot)

Read this, then `IMPROVEMENT-PLAN.md` (the work list, next to this file), the root `CLAUDE.md` (how to work on this repo) and
`CHANGELOG.md` (history). The README is a short front page; topic detail lives in `docs/`.
Rewrite this file at the end of every session; keep it under 55 lines and true.

## State at version 2.20.0 (2026-11-27)
- Public repo, MIT, installed from GitHub. Auto-update checks once per 24 hours at session start, in the background; a new
  version takes effect on the session AFTER that. This machine is updated by hand before each trial.
- `plugins/starter-kit/`: 21 commands, 1 workflow file, 11 agents, 22 hook scripts (`gate.mjs` runs the rest), 55 helper scripts,
  3 templates, 4 stack recipes in `presets/`, vetted data in `library/`, 592 tests (unit tests; also on GitHub: Windows, macOS, Linux). Hook tests also pass through the gate.
- LIVE TRIALS (`docs/trials.md`): runs 1-2 (quote builder) gave 2.17.1 and 2.17.2. SessionStart carries NO model field. OWNER RULE: never spend API tokens (no `claude -p`, no npx claude-code runs, no `claude plugin eval`). `CLAUDE.md` says so.
- Done: Phase 0, Phase M (all but M-14), Phase S (all but S-12). Choices: D1 merged hook runner; D11 Opus for medium, large and
  risky features and D12 never Fable are Claude's choices, NOT the owner's (still open); D13 compact project chats at 300K; D14 Phase S part B built before a trial, old flow as fallback.
- 2.20.0 NOT pushed yet (needs the owner's yes). Trial 3 (2.17.2) finished milestone 1 ("Works, accept it"; `docs/trials.md`), now on F-004. GitHub page: owner wants it
  detailed, no word limit; `docs/every-step.md` is the walkthrough; owner-made infographic `docs/assets/from-idea-to-launch.png` on both.

## Recent work, and how far it is verified
- 2.20.0: stack recipes (OC-7 part; `presets.mjs`; real setup of all four passed here with KIT_PRESET_SCAFFOLD=1, deploy untested,
  D9 host still open), plan offers stack alternatives, installed docs first, one source per number (`dup-check.mjs`, PROJECT.md
  `## One source`), market check + pivots in research. None tried in a live build. dup-check finds real copies in the kit's own hooks.
- 2.19.1 (trial 3 fixes, see CHANGELOG). 2.19.0: UI checklist (`ui-checklist.mjs`, `ui-check.mjs`, `templates/ui-checkpoint.js`,
  `.claude/ui.json`); browser proof in `ui-e2e.test.mjs` (`KIT_PLAYWRIGHT_DIR`). Neither tried in a live build.
- 2.18.0: `user-tester` agent (Sonnet; Opus at critical) walks a finished milestone from ROADMAP.md alone, one Playwright journey
  per criterion under `e2e/journeys/`; run from `/starter-kit:accept` step 3; breaks become fixes naming its branch, merged first.
  `milestone-gaps.mjs` (dropped/reworded vs the first committed ROADMAP.md, skipped, shared, manual-on-high-risk) runs in accept
  step 2 (challenger milestone mode) and per feature in feature.md step 4 (DROPPED → NEEDS OWNER). Conductor waits with
  `wait-agent.mjs`; SubagentStop records every kit agent's tokens, deduped by message id. `status.mjs` measures against the
  approved scope (size-weighted, criteria, added/dropped, build stage) and `--line` ends every merge report. `worth-it.mjs` (the only stop rule). Security: fetch-guard (pre WebFetch), code-warn
  (post edits), inject-warn (post WebFetch/WebSearch/mcp__), credential deny rules in init + doctor, sec-builtin.mjs (own no-install checks: OSV.dev deps, workflows, Dockerfiles, Compose, live localhost) + sec-tools.mjs (extra scanners only if already installed; missing ones never shown) in full-scan, red team, launch, vet and
  audit, vet-scan MCP poisoning rules. From trial 3's logs: BLOCKS/LATER reviews ("Harden before launch"), recheck mode on Sonnet,
  one stop rule (worth-it from round 3, owner at 6), `→ ci:` proofs, cleanup.mjs, busiest-reviewer round count, exact pins, tokens
  per feature, scanners cut to 4, tests.yml + stable channel. All NOT verified live. To build: "ask only before risky actions" setup.
- 2.17.0: `/starter-kit:feature` runs the `conductor` agent in a fresh context (`workflows/feature.md`, `build-state.mjs`,
  `agent-route.mjs`, `conductor-check.mjs`, `compact-notes.mjs`, autoCompactWindow 300000); live in trial 3. NOT verified: PreCompact
  shaping, the note after a compaction, 2.16.0's `updatedToolOutput` quiet output.

## Not verified (be honest about this)
- Hooks run live (trials 1-3); trial 3 finished milestone 1 on 2.17.2 (rounds 6, 2, 2; 84% of agent tokens on Opus). 2.18+ untried live, so
  M-14/S-12 are unproven. macOS and Linux pass the unit tests on GitHub, never run live; Postgres/MySQL: only the plan parser. Ship marker: prose (P2-2).
- Pattern-based screens, not proof: the PowerShell reader, code index, API and migration checks, model-route's risky-word list,
  quiet-lib's lists, and the 2.18.0 fetch guard, code warning and injection warning (miss reworded or novel attacks).

## Known risks
- The repo is code that auto-runs on every computer: keep two-factor on. Conductor trouble: `{ "freshContext": false }`. Fake keys in
  tests are built from pieces: GitHub push protection refuses full key-shaped text.

## Do this first next session
1. D7 (push policy) open; D2 yes (2026-11-26).2. Trial 3 needs a NEW session to get 2.19.1; then compare rounds and Opus share with milestone 1. 3. Confirm `...@stable` installs and follows `stable`.

## Rules that must not regress
- Nothing from a project's own files may run or take effect without the user's approval on this computer (see `CLAUDE.md`).
- Every guard covers every shell tool. MODEL and HAIKU rules; only the conductor starts agents. Session note under 520 words.
- Every release: bump `plugin.json`, add a `CHANGELOG.md` entry, update this file and the plan, run all tests both ways, validate.
