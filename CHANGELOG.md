# Changelog

What changed in each release of the starter-kit plugin, newest first, in plain words. The commit ids are in this
repository's history. Every release bumps `version` in `plugins/starter-kit/.claude-plugin/plugin.json`; a test
fails if this file has no entry for the current version.

## [2.5.0] — 2026-11-24
Operations: launching properly and staying healthy afterwards.
- New `/launch`: separate test and live environments, git-driven deploys, error tracking, uptime alerts, daily backups that are
  restored once, a practised rollback, domain and HTTPS, cost estimate with spending alerts, written into `RUNBOOK.md`. Asks before
  anything that costs money or goes public; secrets never go in the chat or in files.
- New `scripts/runbook-check.mjs`: every runbook section filled in, the restore test and rollback practice dated, no secret values.
  The pre-ship scan requires it for a first public launch.
- New `/maintain` and `scripts/maintenance-due.mjs`: updates through the normal feature pipeline (major versions left for the owner),
  security re-check, backup and restore dates, errors, speed, cost, logged in `MAINTENANCE.md`. The session start flags a launched
  app 30+ days since its last maintenance or launch.

## [2.4.0] — 2026-11-24
Real-world testing for apps with a screen.
- `/init` sets up end-to-end browser tests (Playwright, phone 375 px and desktop 1280 px) after checking the drive has room; `CLAUDE.md`
  records the "End-to-end (browser) tests" command and a "Speed budget".
- Builder writes an end-to-end test for every user-visible feature, saves screenshots to `.claude/screens/`, and maps criteria to
  `e2e/...` tests; the UI reviewer opens the screenshots and judges what a person would see, state by state.
- New `scripts/perf-budget.mjs`: compressed size of the build against budgets (JS 300 KB, CSS 100 KB, image 500 KB, total 2000 KB),
  naming the biggest files; ignores source maps. New `scripts/disk-free.mjs`: is there room for a big install, with a tight/not-enough answer.
- The pre-ship scan runs the browser tests and the speed budget and blocks on failure; the plan names the user journeys that become tests.

## [2.3.0] — 2026-11-24
Project-management discipline: success measures, estimates, risks, change control, milestone sign-off, status reports.
- The plan now has measurable success goals, sized features (`[S]` `[M]` `[L]`), the top five risks with plans, and
  milestones of about three features each; `PROJECT.md` gains "Success measures" and "Risks".
- New `/accept`: when a milestone is finished Claude starts the app, tells the owner what to try, and records their verdict in their
  own words with the date in `ROADMAP.md`. `roadmap-check.mjs --acceptance` reports finished milestones still waiting; the pre-ship
  scan stops while any is, and the session start says so. A milestone can't be marked accepted before its features are done.
- New `/status` and `scripts/status.mjs`: progress, left to build by size, a labelled rough forecast from past merge dates, success
  measures, risks, what is waiting on the owner, and warnings about unproven ticks or a handoff that doesn't match history.
- Change control step in `/spec`: say what a changed requirement adds or delays before building it, and record the decision.
- Session routing text rewritten more compactly (460 words, down from 505) to make room.

## [2.2.0] — 2026-11-24
Adversarial review: the kit now attacks the work, and attacks itself.
- New `challenger` agent in every `/feature` review: assumes the work is NOT done and tries to prove it (claims without
  evidence, tests that can't fail, missing cases, collateral damage); must show what it tried; "does not hold up" blocks the merge.
- New `red-team` agent and `/redteam` command: attacks a local copy of the app like a hostile user (broken access
  control, injection, business-logic abuse, uploads, leaks, AI-model abuse), writing a failing test for every confirmed
  break. Runs on high-risk features and before a first launch.
- New `scripts/mutate.mjs`: mutation testing (deliberately breaks the code and checks the tests notice). Works in a
  worktree only, restores every file, discards mistakes that merely fail to compile.
- Safety guard: attack tools (nmap, sqlmap, hydra, nikto, ffuf ...) are denied unless aimed at this computer; load
  testers aimed at a remote host ask first.
- Fuzzing the kit's own guards found and fixed 63 gaps. Safety guard: `rm -rf //`, `/./`, `/var/lib`, `sudo -n`, `{ ...; }`,
  `find / -delete`, `git clean --force`, `sh -c "$(curl ...)"`, download-then-run, `DELETE FROM` without WHERE, `TRUNCATE`,
  MongoDB drops, uploading `.env` with curl/scp, `python -c` / `node -e` / `perl -e` one-liners, `ssh host 'rm -rf /'`,
  `base64 -d | sh`, multi-stage pipes, risky `docker run` mounts, `xargs rm -rf`. Secret scanner: connection strings with
  passwords, bearer tokens, lowercase and camelCase names (`apiKey`, `password =`), any `*_KEY` name, and GitLab, SendGrid,
  Twilio, Discord, Telegram, Slack webhook, Azure, Hugging Face, DigitalOcean and Shopify tokens.
- Found in live use: the safety guard read a heredoc commit message (text mentioning `rm -rf //`) as commands and blocked a
  harmless commit. Heredoc bodies are now data unless the receiver is a shell or interpreter, where they are inspected.
- Session routing knows "try to break it / red team / pen test".

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
