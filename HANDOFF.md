# Handoff — starter-kit plugin (for the next session, human or bot)

Read this, then `IMPROVEMENT-PLAN.md` (the work list), `CLAUDE.md` (how to work on this repo) and `CHANGELOG.md` (history).
Rewrite this file at the end of every session; keep it under 55 lines and true.

## State at version 2.14.0 (2026-11-25)
- Public repo, MIT, installed from GitHub. Auto-update checks once per 24 hours at session start, in the background; a new
  version takes effect on the session AFTER that (a single restart is not enough). This machine was still on 2.6.0 at the audit.
- `plugins/starter-kit/`: 21 commands, 7 agents, 13 hook scripts (`gate.mjs` runs the rest), 39 helper scripts, 2 templates,
  vetted data in `library/`, 443 tests (unit tests only, one Windows machine). Hook tests also pass through the gate (`KIT_VIA_GATE=1`).
- OWNER RULE: never spend API tokens (no `claude -p`, no npx claude-code runs, no `claude plugin eval`). `CLAUDE.md` says so.
- Plan Phase 0 is DONE (2.12.1). Owner decision D1: keep the merged hook runner, with the canary, self-check and fail-closed net.
- Owner requests since, outside the plan: payment keys (2.12.2), sizing apps to their users (2.13.0), design and accessibility (2.14.0).

## Recent work, and how far it is verified
- 2.14.0: vetted MIT design data from ui-ux-pro-max (data only; `VETTED.md` says what was left out and why), `style-library.mjs`,
  `/design`, `templates/a11y.spec.js` (axe + keyboard, reflow, zoom, motion), `a11y-check.mjs`, `wcag.mjs` (all 55 A/AA criteria).
  Verified by unit tests (every palette passes contrast as handed out; written DESIGN.md passes design-check; judge logic; WCAG list).
  NOT verified: the a11y template in a real browser (Playwright not installed here); how well matching works on real projects.
- 2.13.0: scale profile, localhost-only load test, desktop/CLI check, rehearsal sizes from the profile. Verified with real local
  HTTP servers and child processes on Windows. NOT verified: the macOS/Linux `ps` path, a real app, a real staging host.
- 2.12.2: Stripe test/restricted/webhook secrets and Square tokens caught; publishable keys pass; block messages say where keys go.
- 2.12.1 fixed confirmed bugs: guards now cover PowerShell; two reviewers had every tool; subagents can find the scripts; no hook
  for Read/Grep/Glob; crashed guards fail closed; no automatic tests against a remote database; approval-file rule blocks changes only.

## Not verified (be honest about this)
- Nothing since 2.12.1 has run inside a live Claude Code session: not the PowerShell guarding, the SubagentStart hook,
  `${CLAUDE_PLUGIN_ROOT}` substitution in command text, the self-check, or fail-closed. The first session on the new version asks
  Claude to run `starter-kit-canary` with each shell tool: that is the first live proof. If it is not refused, roll back `hooks.json`
  to the 2.11.0 shape (one process per hook) plus the `Bash|PowerShell` matchers.
- No end-to-end trial has run (`DOGFOOD.md`). macOS and Linux are untested. Postgres and MySQL: only the plan parser is tested.
- The push gate's ship marker is still written by Claude from a prose instruction (plan task P2-2 makes a script write it).
- Pattern-based screens, not proof: the PowerShell reader, code index, API check, migration check, desktop check's memory reading.

## Known risks
- The GitHub repo is the source of code that auto-runs on every computer, straight from `main`: keep two-factor on (P1-2 adds a stable channel).
- Third-party skills, scripts and settings are never bundled; vetted data may be (`library/`, with license and notice).
- Fake keys in tests must be built from pieces: GitHub push protection refuses key-shaped text written out in full.

## Do this first next session
1. Ask the owner whether the first session on the new version refused the canary with both shell tools.
2. Phase 1 of `IMPROVEMENT-PLAN.md` (needs owner decisions D2 and D3). Do not start Phase 2 until one trial run has happened.

## Rules that must not regress
- Nothing from a project's own files may run or take effect without the user's approval on this computer (see `CLAUDE.md`).
- Every guard covers every shell tool. Keep the session note small (test limit 520 words; it is at 516).
- Every release: bump `plugin.json`, add a `CHANGELOG.md` entry, update this file and the plan, run all tests both ways, validate, push.
