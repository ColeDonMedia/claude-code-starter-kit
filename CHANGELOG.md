# Changelog

What changed in each release of the starter-kit plugin, newest first, in plain words. The commit ids are in this
repository's history. Every release bumps `version` in `plugins/starter-kit/.claude-plugin/plugin.json`; a test
fails if this file has no entry for the current version.

## [2.11.0] — 2026-11-24
Maps that keep memory honest.
- New `scripts/schema-map.mjs` → `SCHEMA.md`: tables, columns, keys, indexes, relationships and a Mermaid diagram, replayed from SQL migrations
  (CREATE/ALTER/RENAME/DROP, MySQL MODIFY/CHANGE), Prisma, Rails `schema.rb`, a schema dump or a local SQLite file (read-only). Deterministic;
  the drift check flags a stale page; the context pack includes the real columns of the tables a feature touches.
- New `scripts/arch-map.mjs` → `ARCHITECTURE.md`: areas, dependencies between them, hub files and circular dependencies from the code index,
  with a hand-written section that is preserved on regeneration.
- New `scripts/notes-graph.mjs`: `{#D-001}` ids and `[[D-001]]` links across all notes, backlinks, next id, consistency check, and an
  Obsidian-ready export (a note per id with links and backlinks).
- Decision status: `status: superseded by [[D-nnn]]` / `status: reversed`. Plans, area notes and live decisions that still rely on a decision
  that no longer stands are reported (at session start too); superseded decisions are no longer offered as guidance.
- Workflows write and check these: `/feature`, `/spec`, `/db`, `/onboard`, `/full-scan` and the checkpoint.

## [2.10.0] — 2026-11-24
Big databases and live data.
- New database guard hook (`hooks/db-guard.mjs`, rules in `scripts/db-lib.mjs`): denies connections to any database that isn't local
  (connection strings, host flags and variables, the project's `.env` when a migration tool has no target), production-mode migrations and
  hosting platforms' database tools; asks before destructive SQL on a local database. Ignores text-only commands (commit messages, grep).
  Off switch `dbGuard` needs the user's approval on this computer.
- New `scripts/migration-check.mjs`: dropped/renamed columns and tables, required columns with no default, unbounded writes, type changes,
  SET NOT NULL, blocking index and foreign-key builds, data changes inside schema migrations, missing rollbacks; SQL, Rails, Django,
  Alembic, Knex, Laravel and others. Owner-accepted risks are marked and listed by the pre-ship scan.
- New `scripts/db-rehearse.mjs`: seeds a copy with realistic volumes (foreign keys respected), times migrations, flags full scans and
  unindexed sorts (SQLite via Node's built-in driver; Postgres from `EXPLAIN (FORMAT JSON)`).
- New `/db`: local copies only, expand-migrate-contract, batched resumable backfills, runbook hand-over for the live change.
- Tested with real SQLite at 100,000 users and 200,000 orders.

## [2.9.0] — 2026-11-24
Big codebases.
- New `scripts/code-index.mjs`: symbols and import links for JS/TS, Python, Go, Rust, Java/Kotlin, PHP, Ruby, C/C++, C#, Swift, Dart, with
  `--find`, `--impact`, `--hubs`, `--areas`. Incremental (git content hashes; only changed files re-read); stored outside the project.
- New `scripts/scoped-tests.mjs`: the tests a change can affect; falls back to the full suite when it can't be sure.
- `Size: large` projects use scoped tests while building and the full suite at checkpoints and before shipping. The builder updates
  dependents before changing shared code; the reviewer checks dependents beyond the diff; the context pack names defining files.
- New `/onboard`: maps an existing codebase area by area (`AREAS.md`, one `CLAUDE.md` per area), changes no code.
- Tested on a synthetic 10,000-file repository and, read-only, on a real 9.2-million-line Python installation.

## [2.8.0] — 2026-11-24
Builds that last weeks.
- New `scripts/drift-check.mjs`: map paths that no longer exist, a handoff behind the latest code commits, a decision that picks what an
  earlier one rejected, oversized records. The session start reports drift before any work.
- New `scripts/compact-records.mjs`: older decisions and changelog releases move word for word into archive files (lossless, idempotent);
  an oversized handoff or master document is flagged for rewriting, never cut.
- New `scripts/checkpoint.mjs`: every 3 merged features, a forced re-verification (suite, roadmap proofs, drift, plan versus build).
- Stall detection: the flight recorder fingerprints the next roadmap item at each session start; the same item three sessions running, or
  four builder launches in one session, is reported at session start with an instruction to stop retrying.
- Tested with a simulated 50-session project: session note stays flat, no decision lost, checkpoints on time, drift caught.

## [2.7.0] — 2026-11-24
Trial runs, a flight recorder, taste, and memory for long builds. No API calls anywhere: everything runs locally or in your normal session.
- New flight recorder hook (`hooks/flight-recorder.mjs`, `scripts/flight-lib.mjs`): a private log of names only (workflows, agents, tools, the
  program a shell command started), stored outside the project. Actions that started but never finished are the blocked or failed ones.
  Never records prompts, code, arguments, paths or secrets (tested with a planted secret). Off with `{ "flightLog": false }`.
- New `/dogfood` and `scripts/flight-report.mjs`: reads the log, compares with what should have happened (plan, builder, reviewer, challenger,
  acceptance), and turns gaps into fixes or a `KIT-FEEDBACK.md`. New `DOGFOOD.md`: three trial apps to run in a normal session.
- Taste: the plan asks which apps you like and dislike; `DESIGN.md` gains References and a Quality bar; new `scripts/design-check.mjs` checks the
  sections and color contrast (WCAG math); the UI reviewer scores each screen 1 to 5 and blocks below 4; acceptance asks what feels off;
  `/full-scan` runs the design check.
- Long builds: append-only `DECISIONS.md` (newest shown at session start), a `## Map` in `PROJECT.md`, and `scripts/context-pack.mjs`, which gives each
  builder only the roadmap item, decisions, related map lines and design brief that matter.

## [2.6.0] — 2026-11-24
Legal, licenses, analytics and feedback.
- New `/legal`: builds the data inventory, works out which rules apply from current sources (privacy, terms, cookies, children, data rights,
  payments, email, accessibility, AI disclosure, app stores, regulated areas), drafts the privacy policy and terms from how the app really behaves
  (DRAFT banner, no invented owner details, nothing promised that the code doesn't do), and builds the matching features.
- New `scripts/legal-check.mjs`: data inventory filled in, both documents present, no placeholders, each marked draft or reviewed. Required by the
  pre-ship scan for a first public launch.
- New `scripts/license-check.mjs`: classifies the licenses of shipped libraries (npm and Python), flags restrictive and unknown ones, follows
  nested dependencies, handles OR / AND expressions, writes a third-party notices list.
- `PROJECT.md` gains a "Data inventory"; the builder must report any personal data or third-party service it adds.
- The plan covers how success is measured and how users send feedback; `/launch` sets both up.
- Dead-reference tests: every script, command and agent that an instruction names must exist, every workflow command must be reachable from the routing table, and every command needs a description that says when to use it (verified by planting a bad reference).
- Fixed: the `status` and `launch` command descriptions contained `: ` and failed YAML parsing (the plugin validator caught it); both are quoted now and a test prevents a repeat.

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
