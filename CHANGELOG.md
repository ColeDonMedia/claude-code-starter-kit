# Changelog

What changed in each release of the starter-kit plugin, newest first, in plain words. The commit ids are in this
repository's history. Every release bumps `version` in `plugins/starter-kit/.claude-plugin/plugin.json`; a test
fails if this file has no entry for the current version.

## [2.1.0] — 2026-11-24
Memory and proof, so any session can pick up where the last one ended and "done" can't be a claim.
- Projects now keep three short records: `PROJECT.md` (master document: what it is, stack, architecture map, decisions
  with reasons, current state, known problems, next steps), `HANDOFF.md` (what the last session did and what to do
  first) and `CHANGELOG.md` (one plain entry per merged change). `/init` creates them.
- The start of every session loads the handoff note (shortened, labelled as notes rather than instructions) and
  tells Claude where the kit's helper scripts are.
- New docs hook: when a turn ends, the handoff must cover the newest code commit. If not, Claude must update the
  three records before finishing. Written once per problem, never loops. Switch off with `docsGate: false`.
- New roadmap truth check (`scripts/roadmap-check.mjs`): a ticked ROADMAP.md box must name a real merge commit that is
  in the history, and every criterion must point to a real test file and test name (or say how it was checked by
  hand). The docs hook enforces it and the session start warns about unproven ticks.
- `/feature` now proves a feature on the merged code (criterion → named test, opened and read) before writing the records.
- Builder documents as it goes (a purpose comment at the top of every file, the why of non-obvious code); the
  reviewer checks documentation and that each criterion has a real test; the builder's report must map every
  criterion to a test or say NOT DONE.
- Commands no longer rely on an unverified placeholder for the helper-scripts path; the session note gives the real path.

## [2.0.1] — 2026-11-24
- MIT license added (LICENSE, `license` field, README note).

## [2.0.0] — 2026-11-24
Security hardening. Breaking: a project's own `.claude/kit.json` commands and off-switches now do nothing until the
user approves them on this computer.
- Fixed a hole: a project could make hooks run its commands, or switch the security guards off. Approvals are stored
  outside the project; a permission prompt lists the exact commands; editing a command voids approval; the shell
  and file tools cannot edit the approval list.
- Package guard: checks npm, PyPI and crates.io before installs; blocks names that don't exist, asks about
  brand-new, rarely used, deprecated or script-running packages and non-registry sources.
- Pre-ship gate and secret scan now also cover publish and deploy commands.
- Git pre-commit hook and a read-only GitHub checks workflow, installed by `/init`.
- New `/audit` (whole-project security audit); security reviewer gained whole-project and launch-readiness modes.
- Plan has a threat check with security acceptance criteria; builder follows secure-coding defaults; high-risk
  features get a security review immediately.
- Research helper runs on Haiku, with claims re-checked on a stronger model.

## [1.9.0] — 2026-11-24
- Secret guard: blocks commits, pushes and pull requests containing API keys, private keys, tokens, credential
  assignments, env/key files, or terms from the user's private list (`~/.claude/plugins/data/starter-kit/private-terms.txt`).

## [1.8.0] — 2026-11-24
Autonomy for non-programmers.
- Checks hook (a Stop hook): a turn can't end while the project's own checks fail.
- `ROADMAP.md`, `DESIGN.md`, `researcher` agent, plain-language rule, repository and commits handled by Claude.
- `/spec` researches, picks the stack, writes the design brief and roadmap and asks for one approval.

## [1.7.0] — 2026-11-24
- Self-updating: a once-a-day background update of this plugin at session start.

## [1.6.0] — 2026-11-24
- Safety guard (blocks catastrophic shell commands, asks before risky ones), `/debug`, spec check against existing
  code, "never say done without running the check" rule, `VETTED.md` of reviewed third-party repos.

## [1.5.1] — 2026-11-24
- Builder verifies library APIs against current documentation instead of guessing.

## [1.5.0] — 2026-11-24
- A session-start routing table makes Claude choose and run the right workflow itself; `/vet` audits third-party skills.

## [1.4.0] — 2026-11-24
- Lean mode (token-saving reply and reading rules), `/spec`, `/research`, accessibility checks, dependency audit.

## [1.3.0] — 2026-11-24
- Automation: setup offered on first contact, push gate until the pre-ship scan passes, auto-trigger descriptions.

## [1.2.0] — 2026-11-24
- Audit fixes: Windows path-case bug, worktree test lookup, no runner downloads, unsafe file names skipped,
  `/feature` runs reviews inside the worktree and reuses the same builder, pre-ship diff against the right base.

## [1.1.0] — 2026-11-24
- First release as a plugin: isolated-branch builder (`/feature`), reviewers, test-first workflow, pre-ship scan,
  related-tests hook, generic setup for any project type.
