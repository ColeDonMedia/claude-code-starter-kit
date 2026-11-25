# Changelog

What changed in each release of the starter-kit plugin, newest first, in plain words. The commit ids are in this
repository's history. Every release bumps `version` in `plugins/starter-kit/.claude-plugin/plugin.json`; a test
fails if this file has no entry for the current version.

## [2.17.0] — 2026-11-25
A fresh context for every feature, so the main chat stays small, and builds that resume from their last verified step (plan
Phase S, part B).
- **The conductor (new agent).** `/starter-kit:feature` is now a short dispatcher. It hands the roadmap item to a `conductor` that
  runs the whole build in its own fresh context (builder, reviewers, merge, proof, records) and returns about a dozen lines, so the
  main chat grows by a short report per feature instead of every brief, report and test result. The procedure moved, unchanged in
  substance, to `workflows/feature.md`. When the conductor needs the owner it stops and hands back the question; the main chat asks
  and sends the answer back. If the conductor cannot start agents, or `{ "freshContext": false }` is set, the same workflow runs in
  the main chat as before.
- **Guards for it.** Only the conductor may start agents (a test), only the kit's own and never another conductor (the model-check
  hook, which now knows who is launching). Its "MERGED <commit>" is checked against git before anyone believes it; a wrong report is
  sent back once.
- **The build state.** Each feature's stage, branch, worktree, last passing commit and pending question are kept outside the project.
  After a session ends, a usage limit or a compaction, the session note says where the build stopped and "continue" resumes it;
  git is trusted over the record (a vanished branch clears it; uncommitted work in the worktree is shown to the next builder).
- **Compaction, steered.** New projects compact their chats at 300,000 tokens instead of near a million. Before every compaction the
  kit tells the summary what to keep (the feature in progress, questions for the owner, unrecorded decisions, anything unverified)
  and what to drop (tool output, file contents, finished features). Compactions are counted in the flight report.
- The kit cannot clear a chat or open a new session by itself (Claude Code does not allow it); the docs now say so plainly.

## [2.16.0] — 2026-11-25
Token savings that cost no code quality (plan Phase S, part A).
- **Noisy output is shortened, enforced.** When a test run, install or build succeeds and prints more than 120 lines, Claude now
  gets the start, every failure line with two lines of context, and the summary, instead of thousands of lines. The full output is
  saved in `.claude/logs/` (a folder that ignores itself, newest ten kept) and the short version says where. The command itself is
  never changed, git output is never shortened, and a failing command is never touched. Off with `{ "quietOutput": false }`.
- **A second review round reads only the fix,** and only the reviewers that objected re-check it (a risky fix still goes to the
  security reviewer; a fix larger than the change is reviewed as new).
- **Edit, don't rewrite.** Builders change existing files with small edits and commit after each passing criterion; the flight
  report counts whole-file rewrites.
- **One-time notices** for what only the owner controls: reopening a large chat whose cache has expired (a new chat is cheaper),
  and building on Fable (about twice Opus). `doctor.mjs --plugins` lists the other plugins that load into every session; `/dogfood`
  reports them. Setup mentions the official code-intelligence plugin for typed languages.
- A test keeps the `CLAUDE.md` template small, since every agent launch re-reads it.

## [2.15.0] — 2026-11-25
The right model for each job, decided in one place; a Haiku scout that finds code for the stronger models; two new checks (plan
Phase M, part B).
- **Which model does what.** New `scripts/model-route.mjs` decides each agent's model and effort from what the project records: the
  roadmap item's size and `high-risk` tag, risky areas in the feature's words (sign-in, payments, uploads, personal data and the
  like), whether the code involved has 10 or more dependents, how many review rounds failed, and the project's rigor. Builders start
  on Sonnet and move to Opus for medium, large, risky or far-reaching features and after two failed rounds; the reviewer and red
  team now run on Opus; the security reviewer always does. More risk never gives a weaker model (a test checks over 30,000 cases).
  The kit never picks Fable by itself.
- **Enforced.** A new hook refuses to start a kit agent on a model below its job's minimum (a security review on Haiku or Sonnet,
  for example). A plan without Opus is handled: the kit drops to Sonnet, tells the owner, remembers it for this computer only, and
  says so in status and at the top of every security report. `"rigor": "critical"` in kit.json puts everything on Opus;
  `"prototype"` (cheaper reviews) counts only after the owner approves it on this computer.
- **The scout (new agent, Haiku).** In big projects it finds the files, line ranges and tests a job needs and hands over pointers
  with one quoted line each, never summaries. A script checks every pointer when the scout finishes and sends a wrong report back
  once. Used before building, while onboarding, while debugging, and as a head start for security audits. Off with `{ "scout": false }`.
- **The investigator (new agent).** Finds a bug's root cause with file-and-line evidence outside the main conversation, for big
  projects or once a first guess fails.
- **A second opinion on the plan.** Before the owner approves a plan, the challenger checks it on Opus: criteria no test could
  prove, features in the wrong order, sizes that look wrong, promises no roadmap item delivers.
- **The live site is down.** `/debug` now starts with the runbook's rollback (with the owner's yes) before looking for the cause,
  and records the incident.
- Monthly maintenance has the researcher read dependency release notes; a Haiku main conversation during a build gets one
  suggestion to switch to a stronger model; the flight report shows scout pointer checks and files builders had to find themselves.

## [2.14.1] — 2026-11-25
Safer agents, steady effort, and a record of which model did what (plan Phase M, part A).
- Closed a hole: the researcher (which reads untrusted web pages on the cheapest model) and the UI reviewer could start other
  agents, including ones that can write files, and the researcher could run PowerShell commands. Both are now refused. A test
  checks every agent: none may start another agent, and an agent on Haiku may only read.
- Every agent now sets its own effort level (high for builders and reviewers, medium for the researcher), so a session set to low
  effort no longer weakens a security review. Reviewers and the red team get a turn limit; an agent that stops at it is resumed
  once and otherwise reported, never trusted half-done.
- The flight recorder now notes, per agent launch, the model asked for, the model that actually ran and the tokens used (names and
  numbers only; anything in a model field that is not a model name is recorded as "other"). The flight report shows models per
  agent, tokens per model and review rounds per build: the numbers needed to judge model choices after a trial.

## Repository tidy-up — 2026-11-25 (documentation only; the plugin is unchanged, so no new version)
- New logo, and a short README (about 1,400 words instead of 7,000): what it does, install, how you use it, every workflow and
  agent in tables, the guards, what still needs you, and what is proven.
- The detail moved into one page per topic in `docs/` (how it works, safety, quality, planning and records, design, speed and
  scale, databases, big codebases, launch, add-ons, settings), indexed in `docs/README.md`.
- Moved: `DOGFOOD.md` → `docs/trials.md`, `VETTED.md` → `docs/vetted.md`, `HANDOFF.md` and `IMPROVEMENT-PLAN.md` →
  `docs/development/`. Corrected while moving: the researcher runs on Haiku, there are 21 workflows, and the license note now says
  the design data is included under MIT.
- `docs.test.mjs` now checks every relative link and image in the README and docs, that the README stays short, and that every
  docs page links back to it.

## [2.14.0] — 2026-11-25
Design and accessibility: a real style library, and WCAG 2.2 AA tested, not eyeballed.
- Vetted design data in `library/ui-ux-pro-max/` (MIT, pinned commit, LICENSE and NOTICE): 89 UI styles, 194 palettes, 74 font pairings,
  194 product types, 141 UX rules. Only data was taken; the source's instructions, scripts, other skills (some send prompts and API keys
  to outside AI services) and MCP settings were left out. Recorded in `VETTED.md` under a new "Data included in the kit" section.
- New `scripts/style-library.mjs` (the kit's own reader): match a product and its references to three directions (style + palette +
  font pairing), list and show entries, a side-by-side preview page, `--write` a complete DESIGN.md, `--css` design tokens with a focus
  ring and reduce-motion rules. Every palette is contrast-checked; 81 are nudged for the kit's stricter accent and error-text pairs, and
  the tool says which. The table's "AI prompt" column is never printed.
- New `/design` workflow; `/spec` uses it for the design brief.
- New `templates/a11y.spec.js` (Playwright + axe-core, WCAG 2.0 to 2.2 A and AA): axe results plus the kit's own keyboard walk (focus
  visible, not hidden, no trap), small tap targets, reflow at 320 and 640 px, and motion under "reduce motion". New `scripts/a11y-check.mjs`
  sorts blocking from advice; `scripts/wcag.mjs` holds all 55 WCAG 2.2 A and AA criteria in plain words with how each is checked.
- `design-check.mjs` requires an Accessibility section and gains `ensureContrast()`. The builder, the UI reviewer, `/init` (installs the
  test), `/full-scan` (step 17), `/accept` (the checks a person must do) and the session routing all use it.

## [2.13.0] — 2026-11-25
Built for its size: a one-person desktop app and a SaaS for thousands are planned, built and tested differently.
- New scale profile (`.claude/scale.json`, `scripts/scale-profile.mjs`): the plan asks one size question and records kind, people in a
  year, people at the busiest moment and what downtime costs. The script derives requests a second at peak and the test target,
  requests in progress, a connection pool size, table sizes after a year and open connections, and prints what to build, how to
  prove it, and what to deliberately skip for that size (five tiers, from single-user to very large). `--actual` compares real
  numbers after launch and says when to re-test.
- New `scripts/load-test.mjs`: a ramp of simulated users against a copy on this computer (plain Node, nothing to install), with
  requests a second, p50/p95/p99 and error rate per step, and a verdict: HOLDS, BREAKS, or NOT REACHED (this computer hit its limit
  first). Refuses any address that is not this computer.
- New `scripts/desktop-check.mjs`: for desktop and command-line apps: time until ready, memory and processor use of the whole
  process tree while idle, download size, against budgets by kind. Always stops the app it started.
- `db-rehearse.mjs` takes row counts from the profile (`users`, `main`, `per-user:N`), caps very large plans and scales the timing up.
- Wired in: `/spec` (the size question, a Size section in the plan), `/init`, the builder (follow the Build and Skip lists),
  `/speed` (which check fits which kind of app), `/db`, `/full-scan` (step 16), `/maintain` (real numbers versus the plan), and a
  session-start reminder for projects with a roadmap and no profile.

## [2.12.2] — 2026-11-25
Payment keys: caught, and the block message says where they go so billing keeps working.
- The secret scanner now catches Stripe test secret and restricted keys (`sk_test_`, `rk_test_`, not only live ones), Stripe webhook
  signing secrets (`whsec_`), and Square access tokens and the application secret, even when written bare in code with no telling
  variable name. Stripe's docs say no key belongs in code checked into version control. Square does not publish its token formats,
  so its rules use the prefixes the established secret scanners use.
- Publishable keys (Stripe `pk_`) and Square's application ID are meant for front-end code and are never flagged, even under a
  key-like name such as `STRIPE_PUBLISHABLE_KEY=`.
- When the guard or the pre-commit hook refuses a key, the message says the same rule applies to private repositories and why, and
  where the value goes instead (read by name from the environment; `.env` locally; the host's secret settings for the live site),
  plus, for payment keys, which keys may reach the browser, test keys until launch, and rolling a leaked key.
- `/launch` has a payments checklist (which key goes where, restricted keys, test first, a webhook secret per environment, signature
  checks and repeated events, failed-payment tests, server-side prices, what to do after a leak). The builder follows the same rules.
- Tests: 10 payment leak formats, 11 look-alikes that must pass, the advice text, and a commit blocked or allowed end to end.

## [2.12.1] — 2026-11-25
Safety and correctness fixes from the audit (`IMPROVEMENT-PLAN.md`, Phase 0). No new features.
- **The guards now watch the PowerShell tool.** Before, every protection (dangerous commands, secrets, push gate, packages,
  databases) only looked at Bash, so on Windows they could all be skipped by using PowerShell. The safety guard reads PowerShell
  the PowerShell way: backtick escapes and line continuations, `{ }` script blocks, `$( )` inside strings, here-strings handed to
  `Invoke-Expression`, `-EncodedCommand` (decoded and checked, and always asked about), `& { }`, `cmd /c`, `Get-ChildItem C:\ | Remove-Item`,
  `Format-Volume` and the other disk cmdlets, download-then-run with `-OutFile`/`Start-Process`, and reading or uploading `.env`.
  New `guard-fuzz-powershell.test.mjs`: 101 cases (47 denied, 20 asked, 31 allowed, 3 database), through the real entry point and the
  safety guard alone. All 47 dangerous ones had been let through before the fix.
- **Two reviewers were not read-only.** `challenger` and `security-reviewer` had an unquoted `: ` in their headers, so they loaded with
  no description and every tool (and the security reviewer not on Opus). Fixed, with a test over every agent header.
- **Subagents can find the kit's scripts.** Commands and agents name them as `${CLAUDE_PLUGIN_ROOT}/scripts/…` (filled in by Claude Code),
  a new SubagentStart hook gives every starter-kit agent the real folder, and the session note asks for it in every brief.
- **Hooks no longer start for every tool call.** Read, Grep and Glob start no hook process (since 2.7.0 every call started Node twice).
- **Proof that the guards run:** the `starter-kit-canary` command is always refused; the first session after an update asks Claude to
  run it with each shell tool; a guard that crashes on a shell command now refuses the command instead of letting it run unchecked;
  the project CLAUDE.md template has a tripwire line for a missing session note; new `scripts/doctor.mjs`.
- **No automatic test runs against a remote database:** when a project's `.env` points at a database on another computer, the related-tests
  hook and the stop-time checks do not run, and the session note says why.
- The approval-file rule blocks only changes to it (writes, moves, deletes, edits), not reading or mentioning it (it blocked a read-only audit).
- The repo's `CLAUDE.md` no longer tells a session to run headless model tests (which spend API credit); it states the opposite.
- Smaller: init's off-switch list, `Speed test:`/`Size:`/`Database:` lines in the CLAUDE.md template, one speed step in `/full-scan` and a
  final rule naming every blocking step, current descriptions and an author in the manifests, `.gitattributes`, Node requirement in the README.

## [2.12.0] — 2026-11-25
Fast and snappy, at every level.
- Speed budget: `.claude/speed.json` (defaults: main content 2.5 s, no layout jumping, taps answer in 100 ms, results in 1 s, 600 KB first load)
  written in the plan, tightened per page and action. New `scripts/speed-check.mjs` judges measurements in plain words with the usual fix.
- New `templates/speed.spec.js` (Playwright, copied to `e2e/` by init): throttled phone profile (slow 4G, 4x slower CPU); measures TTFB, FCP,
  LCP, layout shift, total blocking time, bytes, requests, and per-action feedback and completion time.
- New `scripts/delivery-check.mjs`: render-blocking scripts, missing viewport, unsized and never-lazy images, giant images, fonts without
  `font-display`, unfingerprinted assets, missing compression and cache rules.
- New `scripts/api-check.mjs`: queries and requests inside loops (JS/TS, Python, Ruby) and unbounded lists; marked exceptions are reported as accepted.
- New `/speed`: measure, find the cause by level, fix one thing at a time, prove before and after, record under `## Performance`.
- Builders follow fast-by-default rules and write a query-count test for list endpoints; the UI reviewer scores how fast each screen feels
  (`Speed feel` is now a required `DESIGN.md` section); `/full-scan` blocks on over-budget pages and HIGH findings; launch sets up real-user timing.
- Hooks run in one process: new `hooks/gate.mjs` and `scripts/inprocess.mjs` run the same hook scripts for each event instead of up to seven
  processes per shell command. All 225 hook tests also run through the gate (`KIT_VIA_GATE=1`) to prove no decision changed. Fixed on the way: the
  flight recorder's off switch and two other hooks called exit inside a try block (a test now forbids that).

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
