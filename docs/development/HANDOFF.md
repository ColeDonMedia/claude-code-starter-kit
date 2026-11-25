# Handoff — starter-kit plugin (for the next session, human or bot)

Read this, then `IMPROVEMENT-PLAN.md` (the work list, next to this file), the root `CLAUDE.md` (how to work on this repo) and
`CHANGELOG.md` (history). The README is a short front page; topic detail lives in `docs/`.
Rewrite this file at the end of every session; keep it under 55 lines and true.

## State at version 2.15.0 (2026-11-25)
- Public repo, MIT, installed from GitHub. Auto-update checks once per 24 hours at session start, in the background; a new
  version takes effect on the session AFTER that. This machine was still on 2.6.0 at the audit.
- `plugins/starter-kit/`: 21 commands, 9 agents, 15 hook scripts (`gate.mjs` runs the rest), 41 helper scripts, 2 templates,
  vetted data in `library/`, 473 tests (unit tests only, one Windows machine). Hook tests also pass through the gate (`KIT_VIA_GATE=1`).
- OWNER RULE: never spend API tokens (no `claude -p`, no npx claude-code runs, no `claude plugin eval`). `CLAUDE.md` says so.
- Done: Phase 0 (2.12.1), Phase M (2.14.1 and 2.15.0, all but M-14). Decisions: D1 keep the merged hook runner; D11 Opus for
  medium, large and risky features; D12 the kit never picks Fable.
- 2.14.1 and 2.15.0 are committed locally; check `git status` / `git log origin/main..` for whether they were pushed.

## Recent work, and how far it is verified
- 2.15.0 (Phase M part B): `scripts/model-route.mjs` decides every agent's model (size and risk tags, reach from the code index,
  failed rounds, rigor, this computer's ceiling); `hooks/agent-route.mjs` refuses a kit agent below its minimum; reviewer and red
  team moved to Opus; new `scout` (Haiku, read-only, pointers checked by `pointer-check.mjs` and `hooks/scout-check.mjs` on
  SubagentStop) and `investigator`; the challenger checks the plan before approval; a live-outage path in `/debug`; a Haiku main
  conversation gets one suggestion to switch. Unit tests, including a property test over 30,000+ fact combinations.
  NOT verified live: that Claude follows the "run model-route first" sentences (the flight log's `ask` field will show it), the
  SubagentStop block on a real scout, the Agent tool's `effort` parameter, what a plan without Opus really does (V17).
- 2.14.1 (part A): no kit agent can start agents; the researcher can no longer run PowerShell; every agent pins its effort; the
  flight log records model asked, model run and tokens. NOT verified live: the payload fields `resolvedModel`, `totalTokens` (V15).
- Earlier (see CHANGELOG): NOT verified are the a11y template in a real browser (2.14.0) and the macOS/Linux `ps` path (2.13.0).

## Not verified (be honest about this)
- Nothing since 2.12.1 has run inside a live Claude Code session: not the PowerShell guarding, the SubagentStart and SubagentStop
  hooks, `${CLAUDE_PLUGIN_ROOT}` substitution, the self-check, fail-closed, or model routing. The first session on a new version asks
  Claude to run `starter-kit-canary` with each shell tool: that is the first live proof. If it is not refused, roll back `hooks.json`
  to the 2.11.0 shape (one process per hook) plus the `Bash|PowerShell` matchers.
- No end-to-end trial has run (`docs/trials.md`), so Phase M has no before-and-after numbers: M-14 waits for one.
- macOS and Linux are untested. Postgres and MySQL: only the plan parser is tested.
- The push gate's ship marker is still written by Claude from a prose instruction (P2-2 makes a script write it).
- Pattern-based screens, not proof: the PowerShell reader, code index, API check, migration check, the risky-area word list in
  `model-route.mjs`.

## Known risks
- The GitHub repo is the source of code that auto-runs on every computer, straight from `main`: keep two-factor on (P1-2 adds a stable channel).
- The model ceiling file (data folder) is not guarded against direct writes; it can only cap at Sonnet, and status and security
  reports show it.
- Fake keys in tests must be built from pieces: GitHub push protection refuses key-shaped text written out in full.

## Do this first next session
1. Ask the owner the open decisions in one message: D2 (tests on GitHub), D3 (how to run the first trial), D7 (push policy).
2. Follow "Order of work" in `IMPROVEMENT-PLAN.md`: P1-1 and P1-2, then update this machine and run the first trial (P1-6); read
   its flight report for M-14 (models per agent, tokens per model, review rounds, scout pointers, pack misses).
3. After any update, ask whether the first session on the new version refused the canary with both shell tools.

## Rules that must not regress
- Nothing from a project's own files may run or take effect without the user's approval on this computer (see `CLAUDE.md`).
- Every guard covers every shell tool. The MODEL and HAIKU rules in `CLAUDE.md`. Session note under its 520-word test limit.
- Every release: bump `plugin.json`, add a `CHANGELOG.md` entry, update this file and the plan, run all tests both ways, validate.
