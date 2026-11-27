# Changelog

What changed in each release of the starter-kit plugin, newest first, in plain words. The commit ids are in this
repository's history. Every release bumps `version` in `plugins/starter-kit/.claude-plugin/plugin.json`; a test
fails if this file has no entry for the current version.

## [2.21.0] — 2026-11-27
Protection against deleting code or data by mistake, taking over half-built apps, and a strict scope for every stage (all asked for by the owner):
- **Deleting code now asks first** (new safety-guard rule `rm-code`). Before, `rm -rf src` or `Remove-Item -Recurse src` ran without
  a question: only system, home and drive folders and "everything here" were caught. Now any recursive delete (`rm -r`,
  `Remove-Item -Recurse`, `rd /s`, `find -delete`, `rmSync`/`rmtree` in a one-line script, nested in `bash -c` or `cmd /c`) of a
  folder or file holding code asks, and the question starts "DELETES CODE" and names the files.
  Rebuildable folders (`node_modules`, `dist`, `build`, ...), untracked scratch with no code and paths that don't exist still pass.
  With no git history, deleting a folder of code asks, since nothing could be brought back.
- **A way back after a wrong "yes".** Before any risky command (deleting code, hard reset, `git clean`, discarding changes,
  dropping a stash or branch, rewriting history, destructive SQL, database resets), the new snapshot hook (`scripts/snapshot-lib.mjs`)
  saves the work as it is, unsaved files included, under `refs/kit-snapshots/` in the project's own git (built in a separate index, so
  the branch and working copy are untouched; ignored files like `.env` are never in it; never pushed), keeps a branch or stash about
  to be dropped, and copies local SQLite database files to `.claude/backups/`. The newest 20 snapshots and 10 database copies are
  kept. New `scripts/snapshot.mjs` lists and restores them (a restore saves the current state first and deletes nothing); the debug
  workflow uses it when something was deleted by mistake.
- **Taking over an app that is already partly built** (the owner asked whether the kit can pick up mid-project): planning now has
  a take-over part for code with no `ROADMAP.md`, or "finish this app". It maps the app, runs its checks, proves each existing
  feature, and records it under "Milestone 0 — what already works" as `(existing <commit>)`, which `roadmap-check.mjs` accepts with
  the same proof rules as a merge. Broken or unproven features become the first work, `dup-check.mjs` over the whole project turns
  numbers worked out in several places into "make it one" items, and it asks and researches only what is left. The session note
  routes code with no roadmap there.
- **The safety guard stays read-only.** It decides "does this delete take code with it?" by reading folders (`scripts/delete-lib.mjs`,
  a read-only check enforced by test). Saving snapshots is a separate hook, `hooks/snapshot-guard.mjs`, which runs on every shell
  command after the guard, saves only before commands that could destroy work, never blocks and prints nothing. Off only with the
  owner's approval: `{ "snapshots": false }`.
- **A strict scope for every stage** (the owner asked for clearly defined scopes): all 21 commands, 11 agents and the feature
  workflow now open with a six-line `## Scope` block: Job, Starts when, May, Must not, Done when, Hands back. It says exactly
  where each stage's work ends, for example that the builder never touches the main checkout or writes a second version of shared
  logic, and that reviewers never edit. `scripts/scope.test.mjs` fails if one is missing, out of order, vague or over 130 words.
- **Citation check** (the owner asked for it): new `scripts/cite-check.mjs` fetches every page a research report cites and checks
  the quoted words are really on it, so a misquote or an invented source is caught by a machine, not trusted. The researcher now
  writes each sourced claim as `[source: <url> | "<exact words>"]`; research and planning drop or re-source every NOT FOUND claim.
  A number or price must match exactly (a changed figure is never a "close" quote), quotes match whole words ("$1" is not "$12"),
  script and style text doesn't count as page text, and only public pages are fetched (never this computer, a private network or a
  cloud metadata address). Checked against a real page: the true quote was VERIFIED, an invented price NOT FOUND.
- Not covered: databases on other computers (the database guard already refuses them), files outside a git project, and commands
  the owner runs themselves.

## [2.20.0] — 2026-11-27
- **Stack recipes (plan item OC-7).** Four tested starting points in `presets/`: a website (Astro 7), a web app with sign-in and a
  database (SvelteKit 3, SQLite with Drizzle, Better Auth), an API (Fastify 5, SQLite) and a desktop app (Electron 45 with Forge 8).
  Each is data: the official setup tool at a pinned version, exact extra packages, follow-up steps, the project's commands, the host,
  the accounts and settings the owner will need, and the stack's known mistakes. `scripts/presets.mjs` matches a recipe to the scale
  profile, prints the steps (it never runs them, so the builder runs them through the guards), gives a fresh empty folder to set up
  in and merges the result into the project without touching its own files, fills `.env` secrets without printing them, writes
  `.claude/rules/stack.md`, and lists pins with newer releases. Building them showed why they're needed: three of the four official
  setup tools differed from what a model would guess (Forge 8 renamed its template, the API starter's TypeScript settings fail on
  TypeScript 6, the web app's example test fails its own lint, and Astro silently picks another folder when the target isn't empty).
  The real setup of all four, with their tests, type checks, lint and build, runs with `KIT_PRESET_SCAFFOLD=1`. Deploying is not
  part of that test, and D9 (which host to prefer) is still open.
- **The plan offers the stack choice** (the owner asked for this): the recommended stack (a recipe when one fits) plus one or two
  alternatives with plain pros and cons. Approving the plan keeps the recommendation; the owner can pick another or name their own.
- **Installed docs first.** The builder looks up an API it isn't sure of in the installed package (exact version, no cost), then a
  docs tool, then the official docs, and reads `.claude/rules/stack.md` first.
- **One source for each number and rule** (the owner asked for this after a SaaS showed six different monthly incomes on six pages).
  The plan defines every number and rule once, in plain words, and `PROJECT.md` gets a `## One source` list naming the one function
  for each. Before writing anything new, the builder asks "does this already exist, and does it do what this feature needs?": reuse it,
  extend that one function, or give a genuinely different meaning its own name on the list. New `scripts/dup-check.mjs` finds copied
  code even with renamed variables (only what the change added, with `--base`), and checks every list entry still exists. The reviewer
  runs it: a second version of a calculation, query, validation, permission check or listed rule blocks the merge.
- **Market check in the research** (the owner asked for this): for apps meant to sell, demand, buyers and what they pay today, how
  crowded it is, gaps and what would be hard to copy. The plan gets a "Worth building?" verdict (build it, build it narrower, pivot, or
  think again), the gap features worth building, and up to three less crowded directions, all with sources. The owner decides.
- **GitHub page:** new sections on the stack recipes and on how the kit saves tokens without cutting checks.

## [2.19.1] — 2026-11-27
Fixes from trial 3's first finished milestone, which ran on 2.17.2 (see [docs/trials.md](docs/trials.md)):
- **A true "merged" report is no longer sent back for a sentence in front of it.** A tool refused, the builder said so in one line,
  then gave a correct `RESULT: MERGED` report, and the check made it repeat the whole report. A RESULT line within the first three
  lines now counts, and is still checked against git.
- **One more way of saying "I'm waiting" is recognised** ("Still in progress. I'll keep waiting."), so the conductor is told how to
  wait instead of ending its run. All six of trial 3's wordings are now in the tests.
- **A milestone held back only by checks GitHub must run now says how to fix it.** The owner said "Works, accept it", but two Docker
  criteria were written as "NOT VERIFIED, CI will prove it", so the milestone could not be marked accepted and nothing said why.
  `roadmap-check.mjs` now spots this, names the workflow jobs that can prove them, and says to write them as `→ ci:`. The
  acceptance step does that and records the owner's acceptance, and the launch still waits for those jobs to pass.
- **The question about running the project's checks automatically is asked on its own.** In the trial it sat at the end of a long
  merge report and took three asks over four hours.

## [2.19.0] — 2026-11-27
- **A UI checklist, checked by measurement and by eye.** `scripts/ui-checklist.mjs` holds 83 questions grouped by the parts a screen
  has (every screen, buttons and links, lists and tables, detail pages, forms, popups and menus, messages, states, safety, phone,
  account screens, navigation), plus an 8-question whole-app sweep and an 8-question launch polish list. Examples: does an inner page
  have a way back, does a popup have an X and close on Escape, does a list the plan says will hold 500 items have search, filters,
  sort and paging, do two buttons do the same job, does a button label wrap onto two lines. Each item either holds the merge (42 of
  them: dead ends, popups you can't close, lost input) or goes to "Harden before launch", and points at the matching rows of the
  bundled UX library, which no reviewer used before.
- **`templates/ui-checkpoint.js`**, copied into `e2e/`: browser tests call `checkpoint(page, testInfo, "<state>")` at every state
  and `checkEscape()` with a popup open. It saves the screenshot and measures more than 40 things in the real page, including serious
  accessibility failures in every state, not only on page load. It also watches console and page errors, and offers `STRESS`
  values for a second run with long names, a long unbroken word, 0, 1 and 300 items and a huge number.
- **`scripts/ui-check.mjs`** judges the measurements (BLOCKING / Later). It uses the plan's screen list and item counts in
  `.claude/ui.json`, so "needs search?" is judged against real numbers and not three test rows. It skips the accepted exceptions
  recorded there with who decided. `--manual --parts` prints the checklist by part, `--sweep` compares screens at milestone
  acceptance (one action named two ways, mixed date or money formats, Cancel on different sides, shared titles, unmeasured
  screens), and `--launch` adds the finishing touches (favicon, descriptions, link previews).
- Wired in at five places:
  - the plan lists the screens with their expected item counts
  - the builder reads the items before building, calls the checkpoint at every state, runs once with stress data, and fixes every BLOCKING line
  - the UI reviewer answers every item per changed screen, with evidence, and its checklist BLOCKS hold the merge on every look (only taste is limited to two rounds)
  - acceptance runs the sweep
  - launch runs the polish list and checks the not-found and error pages
- New tests: `ui.test.mjs` (12 tests), and `ui-e2e.test.mjs`, which runs the checkpoint in Playwright on a page with every planted
  problem and a page done right. All planted problems are caught and the good page has no false alarms. The browser test runs
  only where `KIT_PLAYWRIGHT_DIR` points at an installed Playwright, so GitHub skips it.
- **The GitHub page:**
  - a new [What using it looks like](docs/example.md) page: a short made-up example build, the files the kit adds to a project, usage on your own Claude plan, and how to switch it off or uninstall it
  - a test badge and a link for reporting problems
  - the UI checklist on the front page and the design page
  - a fixed "Which model does what" table: a paragraph had split it, and the conductor and UI reviewer rows were missing
  - an up-to-date test count

## [2.18.0] — 2026-11-26
- **Fixes from the first test run on macOS and Linux.** On Ubuntu, a check command whose tool is missing was reported as failing
  code (its shell words it "not found"). The add-on scan cut its own output at 64 KB on macOS and Linux. On Windows, a resumed
  build could think its worktree was gone when the same folder had a short and a long name, and the desktop check gave up when the
  first memory reading was slow; it now takes one direct reading first. The database tests skip on Node older than 22.5, as the
  features do, and the two browser templates are checked as modules on Node 18.
- **Reviews in proportion to the app (from trial 3).** The portal's first feature took six review rounds, mostly hardening a
  one-owner sign-in against floods. Now every reviewer marks each finding BLOCKS (it breaks an agreed criterion or a named threat,
  or lets an outsider reach someone else's data, account, code or secrets) or LATER. Only BLOCKS findings start another round; LATER
  ones go under "Harden before launch" in `PROJECT.md`, which the launch review checks. The red team attacks once per feature and
  then only re-checks; the UI reviewer's taste scores hold the merge for two looks, then go to the owner at acceptance.
- **Cheaper re-checks.** A reviewer confirming its own findings after a fix runs on Sonnet (the security reviewer stays on Opus,
  and a `critical` project keeps Opus everywhere). The challenger stays on Sonnet for risky features, which already get the
  security reviewer on Opus. In trial 3 the challenger ran 8 times on Opus.
- **One stop rule.** Three overlapping round limits are now one: from round 3, the worth-it check decides whether you are asked;
  round 6 always goes to you. A stronger builder after round 2 stays.
- **Plans this computer can prove.** Planning checks what is installed (Docker was not, so two of the portal's criteria could never
  be ticked). A criterion this computer cannot prove is reworded, or marked `→ ci: <workflow>::<job>`: the roadmap check accepts it
  when that job exists, and the launch waits until the job has passed on GitHub.
- **Cleanup after every merge.** `scripts/cleanup.mjs` removes build folders and branches whose work is already in main (merged,
  or the same change copied in, as red-team tests are), and keeps anything unsaved, unmerged, locked by a running agent, or not
  made by the kit. The portal had six left over.
- **The flight report counts rounds right.** It counted only the code reviewer, which approved early, so F-001 showed 2 rounds
  instead of 6. It now counts the busiest reviewer per build.
- **Exact pins.** Setup's GitHub checks file pins each official action to an exact commit (looked up with `git ls-remote`), adds
  time limits, cancels runs a newer push replaced, and keeps the checkout's credentials out of the job. Maintenance refreshes the
  pins. Repeated unpinned steps in one file are one finding.
- **Tokens per feature.** The progress line after each merge says how many tokens that feature used and how much was on Opus.
- **The kit tests itself on GitHub, and updates only from `stable`.** `.github/workflows/tests.yml` runs every test on Windows,
  macOS and Linux with the oldest and newest supported Node, and moves the `stable` branch to `main` only when all of it passes.
  The README now installs from `@stable`, so a bad commit on `main` never reaches anyone.
- **Security: Claude's own file and web tools are now guarded too.** The shell guards never saw the Read and WebFetch tools,
  so a prompt injection could read `~/.ssh` with one and leak it inside a web address with the other. Setup now writes deny rules
  for the credential files in your home folder (the doctor reports missing ones). A new fetch guard refuses web addresses carrying a key or a private term, and asks first for throwaway capture
  services. A new injection warning flags web pages, search results and MCP answers that look like orders to an AI, without
  blocking them. A new dangerous-code warning tells the builder the moment it writes `eval`, HTML or SQL built from strings, shell
  commands, unsafe deserialising, switched-off certificate checks, weak hashes or random numbers, or a CI workflow change, with
  the safe form. All of it is pattern matching on this computer: no model, no network.
- **Security: the kit's own scanners, nothing to install.** A new built-in check (plain Node, like the rest of the kit) runs in
  the pre-ship scan, the audit and `vet`: every dependency in every language's lockfile against OSV.dev, the free public database of
  known flaws and known malware (only names and versions are sent; with no internet it says "not checked", never "passed"); GitHub
  workflows (untrusted text in shell steps, `pull_request_target` running a stranger's code, secrets in logs, unpinned actions);
  Dockerfiles (baked-in secrets, downloads piped into a shell, unpinned images, root); and Compose files (privileged containers, the
  Docker socket, databases open to the network). For the red team and launch it also checks the running local copy: security
  headers, CORS, sign-in cookies, a served `.env` or `.git`, stack traces. A HIGH finding blocks shipping. Four free scanners
  (zizmor, hadolint, Trivy, Opengrep or Semgrep) run too if they happen to be on the computer, but the kit
  never lists a missing one or asks for an install. `launch` pins actions with git and makes the parts list (SBOM) with npm.
- **Security: sharper reviews, safer add-ons.** The security reviewer now traces each hole from input to harm before reporting
  it, reports by confidence, skips test files and values only the server controls, and numbers its findings. The add-on vetting
  scan now catches MCP tool poisoning (hidden orders in tool descriptions, tools that try to change other tools), unpinned MCP
  servers and plain-http remote servers. The vetting record lists the security add-ons that were read, with what was adopted.
  Ideas from Anthropic's security-guidance plugin, Trail of Bits' claude-code-config, Lasso's claude-hooks and Sentry's
  security-review skill; no text or code copied.
- Fixed: when a related test failed after an edit, other warnings from the same edit were dropped.
- **A first-time user tries each milestone before you do.** A new `user-tester` agent (Sonnet) gets only the plan's description
  of the milestone, never the code or the builder's tests, starts the app on this computer and uses it in a real browser at phone
  and desktop sizes, including normal mistakes (wrong password, empty form, Back, refresh, double click). It writes one browser
  test per journey; a step that doesn't work becomes a failing test and a fix on the roadmap before you are asked. Passing journeys
  are kept as tests. It runs in `/starter-kit:accept`; `{ "userTester": false }` skips it. Found in the third trial: the builder
  wrote the only browser tests of its own work, so a misread feature would have reached the owner first.
- **Each milestone is checked against the plan you approved.** Before you are asked, a new script (`milestone-gaps.mjs`) compares
  the finished milestone with the roadmap as first committed. It lists approved features or criteria that were dropped or
  reworded, cited tests marked to skip, one test cited for several criteria, and high-risk criteria checked only by hand. The
  challenger judges only those leads. A dropped promise with no recorded decision becomes a question for you; the rest become
  fixes. The same check runs on each feature as it is recorded (`--feature F-001`), so a criterion lost while the builder's
  brief was written is caught right away, not at the end of the milestone.
- **"Is another round worth it?"** From review round 4 on, and before any blocked report, a new script (`worth-it.mjs`) reads
  the feature's history from git, the build state and the logs: each round's size, the files it touched, and the tokens it cost.
  It says whether the findings are shrinking or the same area is being dug deeper, and recommends one of four choices: keep
  going, accept the rest as known risks and merge, split the rest into a later item, or start smaller. Unless the findings are
  shrinking, the conductor stops and asks you, with those numbers. The build state now records when each round starts. Found in
  trial 3: F-001 reached round 6, each round answering a deeper flood attack on sign-in.
- **Progress against the scope you approved, after every feature.** The status report now weighs progress by size (a large
  feature counts more than a small one), counts acceptance criteria proven, shows how the scope moved since you approved it
  (features added, dropped, criteria reworded), and names the feature being built right now and its stage ("in review, round
  2"), which it could not see before. Every merge report ends with a one-line PROGRESS summary of the same numbers. Fixed: a
  bulleted "None." under "Questions waiting for the user" was shown as a question.
- **The feature conductor no longer stops halfway to wait.** In trial 3 it twice ended its turn "waiting for the builder", which
  ends its run, and the report check called that a bad report. It now waits with a new script (`wait-agent.mjs`, which watches the
  builder's folder and returns when it has committed) and launches reviewers in the foreground; the check recognises a stop to
  wait and says how to wait instead.
- **Real token counts for every agent.** Agents started in the background returned no count, so the flight report missed the
  conductor and everything it started. Each kit agent's own use is now read from its transcript when it finishes (the model and
  four numbers, never its words), each message counted once, and the report shows per model what was written, read new and
  re-read from the cache, and which roles wrote most. Trial 3's real numbers: the builder wrote about half of all Opus output.
- Re-review stays as it was: trial 3 re-ran all five reviewers in round 2 because all five had objected in round 1, and only the
  three that objected in round 2 ran in round 3. The workflow now also says the red team re-runs its own tests and attacks only
  what the fix changed, which is what it did.

## [2.17.2] — 2026-11-25
Fixes from the second live trial, which built a working quote builder but skipped the plan and every review.
- **Plan first, enforced.** Told to plan first, Claude decided the request was detailed enough and built the whole app itself: no
  questions, no plan, no builder branch, no reviewer. In a project the kit started from an empty folder, a new hook now refuses
  app code until the owner has approved a plan (`ROADMAP.md`); setup files, records and test configuration are still fine, and
  existing projects are never affected. A small app gets a short plan (a few questions with defaults, one screen to approve). Only
  the owner can switch it off (`{ "planGate": false }`).
- **Your commits carry your name, not your email.** When git has no author, setup takes the name from the signed-in GitHub account
  and uses GitHub's private no-reply address, for that project only. It never invents a name (the trial got "Quote Builder").
- The accessibility test no longer calls a native date box a keyboard trap (its month, day and year parts take several Tabs).
- The flight report tells a command that ran and failed (a failing test before the fix) from one a guard blocked.
- Claude Code does not tell the kit which model a chat runs on, so the docs no longer promise the Haiku and Fable reminders.

## [2.17.1] — 2026-11-25
Fixes from the first live trial.
- **A new app in an empty folder now starts with a plan.** The kit only spoke up in a folder that already looked like a project, so
  in a brand-new empty folder Claude heard nothing and went straight to writing code, with no questions and no plan to approve. An
  empty folder now gets a short note: set the project up, then plan with the owner before any code. A folder of unrelated files
  (Downloads, say) stays quiet. Setup itself now ends with the same rule.
- The session start carried no model name, so the one-time Haiku and Fable notices could not appear. The flight log now records
  how that field arrives (its type and key names, never a value), so the next trial shows what to read.
- Good news from the same trial: the kit's hooks ran live on 2.17.0 and the flight recorder logged the session.

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
