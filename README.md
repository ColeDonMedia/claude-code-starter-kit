# Claude Code Starter Kit

> **This is a public repository. Do not put private details in it** — no names, emails, company or
> client details, personal file paths, keys, tokens, or code from private projects. Keep it generic.
> Project-specific settings belong in each project's own `CLAUDE.md`, not here.

A project-agnostic foundation for Claude Code, packaged as a plugin: strict TDD, read-only reviewers,
a pre-ship sweep, and a hook that runs related tests after each edit. Works with any language — the
agents and commands read each project's own commands from its `CLAUDE.md`.

## What's inside
| Piece | What it does |
|---|---|
| `/starter-kit:init` | Detects the project's stack and writes its `CLAUDE.md`, permissions and hook config |
| `/starter-kit:feature <what to build>` | Builds it in an isolated branch + worktree via a subagent, reviews it, merges it into your main branch only when green and approved. Keeps your main conversation small |
| `/starter-kit:spec <idea>` | Requirements, gap check and acceptance criteria before building a new app or a vague feature |
| `/starter-kit:research <question>` | Sourced competitor and market research with a gap list |
| `/starter-kit:debug <problem>` | For a bug or failing test with an unclear cause: reproduce, write a failing test, isolate, test one hypothesis at a time, fix the root cause, prove it. Stops after three wrong guesses instead of flailing |
| `/starter-kit:audit` | Security audit of the whole project (secret scan, dependency audit, package check, then the security reviewer); asked for by saying things like "is this secure?" |
| `/starter-kit:vet <link>` | Audits someone else's skill, plugin or MCP server before you install it: safe download, pattern scan, full read, verdict |
| `/starter-kit:tdd <feature>` | One red → green → refactor cycle, done in the current conversation (for small changes) |
| `/starter-kit:review` | Correctness review of the diff; UI review only when UI files changed |
| `/starter-kit:full-scan` | Tests, typecheck, lint, build, then the security review — the gate before shipping |
| `implementer` agent (Sonnet) | Does the building for `/starter-kit:feature` in its own worktree and commits on its own branch |
| `researcher` agent (Sonnet) | Does the web reading for research and planning in its own context: at least six searches, primary sources, cross-checked claims, dated links, a confidence rating |
| `reviewer` agent (Sonnet) | Reviews the diff and runs the tests. Read-only |
| `ui-reviewer` agent (Sonnet) | Looks at the running app in a browser when browser tools exist. Read-only |
| `security-reviewer` agent (Opus) | Hardening review, run once before shipping. Read-only |
| Related-tests hook | After each edit, runs only the tests for that file and shows Claude any failures |

## Install (once per computer)
```
claude plugin marketplace add ColeDonMedia/claude-code-starter-kit
claude plugin install starter-kit@starter-kit-marketplace
```
(Inside Claude Code the same commands are `/plugin marketplace add …` and `/plugin install …`.)
Restart Claude Code afterwards. Update later with `claude plugin marketplace update starter-kit-marketplace`.
If the `owner/repo` form fails because SSH isn't set up, use the full URL
`https://github.com/ColeDonMedia/claude-code-starter-kit.git`.

## Use in a project — fully automatic
You never type a command. At the start of every session a hook gives Claude a short routing table, and
Claude picks and runs the right workflow itself, saying in one line what it ran:
- **Setup:** open a code project that isn't set up and Claude runs `/starter-kit:init` on its own. It asks
  you one yes/no question, about letting it run your test and build commands without prompts.
- **Routing:** questions and small edits are handled directly; a new app or vague feature goes
  `spec` → `feature`; features and bug fixes go to `feature`; one-file tweaks go `tdd` → `review`;
  bugs with an unclear cause go to `debug`; competitor and market questions go to `research`; a link to someone else's skill goes to `vet`.
- **Shipping:** saying "ship it", "push" or "done" runs `full-scan`. A hook also blocks `git push` and
  `gh pr create` until `/starter-kit:full-scan` has passed for the exact commit being pushed; a new commit
  means a new scan.

The routing text lives in the plugin, so updates reach every project automatically.

You can still type any command yourself.

**Lean mode (saves tokens).** In every set-up project, a short rule block (about 150 words) is added to each
new session: lead with the answer, no preamble or recaps, read files narrowly, make the smallest change,
send broad searches to a subagent. It never shortens code, commands, paths or error text, and warnings and
security issues are written in full. It only trims Claude's replies and reading habits, so expect modest
savings (roughly 15–30%), not the 65%+ some tools claim. Lean mode costs about 240 tokens per session, and the workflow routing another 240.

**Safety guard.** A hook reads every shell command before it runs (like a shell would, so text that merely
mentions a dangerous command, such as a commit message, is fine). It *blocks* catastrophic commands:
`rm -rf` on `/`, your home folder or a drive, force-pushing `main`/`master`, writing to disks, fork bombs. It
*asks you first* for risky but sometimes intended ones: `git reset --hard`, `git clean -f`, discarding changes,
force-push to other branches, `curl | sh`, `DROP TABLE`, database resets, printing `.env`/SSH keys. Normal
cleanups like `rm -rf node_modules` pass. Allow a specific rule per project with
`{ "guardAllow": ["reset-hard"] }` (rule ids are listed at the top of `hooks/safety-guard.mjs`), or turn the
guard off with `{ "guard": false }`.

**Built for people who don't code.** Claude is told the owner is not a programmer: it explains results in plain
words (what works now, how to see it, what isn't done), makes routine technical choices itself, and asks only
when a choice changes what you get, costs money, or can't be undone. It creates the git repository, commits its
own verified work locally, and never pushes unless asked. Switch the wording rule off with
`{ "plainLanguage": false }`.

**Builds that continue by themselves.** For a new app, the plan step researches similar products, picks the
technology, writes a design brief (`DESIGN.md`) and a `ROADMAP.md` checklist, and asks you to approve it once.
Claude then builds the roadmap one feature at a time, ticking each off. At the start of every later session the
kit tells Claude how far the roadmap is and what's next, so "continue" is all you need to say.

**Memory and proof: any session can pick up with full context.** A set-up project keeps four short records, and
hooks keep them honest:
- `PROJECT.md` is the master document: what the app is, the stack and why, how to run it, an architecture map,
  decisions with their reasons, what works now, known problems, next steps.
- `HANDOFF.md` is what the last session leaves for the next: what was done, what is half-done (and exactly where),
  what to do first, open questions, and what failed or wasn't verified. Every new session starts by loading it.
- `CHANGELOG.md` has one plain-words entry per merged change, with the commit.
- `ROADMAP.md` is the checklist, and a box can only be ticked with proof: the merge commit (checked against git)
  and, for each criterion, the test that covers it (the file must exist and contain that test name), or a written
  description of how it was checked by hand.
When a turn ends and the handoff doesn't cover the newest code commit, or a tick is unproven, the turn is held
until the records are fixed (once per problem; never loops). Switch off with `{ "docsGate": false }`. Builders also
document as they go (a purpose comment at the top of every file, the why of non-obvious code), reviewers check it, and
a reviewer must find a real test for every acceptance criterion, so "done" has to be shown, not claimed. Limits: Claude
still writes these notes, so the proof checks (git history, files and test names) are what keep them true, and they cannot
prove a test is a *good* test; the reviewer reads the test for that.

**Run like a project, not a pile of code.** The plan now includes what a program manager would write:
- *How we'll know it worked:* two or three measurable goals, tied to why you wanted the app.
- *Estimates:* each feature is sized small, medium or large (a labelled guess). The status report forecasts the
  rest from how fast earlier features actually merged, and says when it has too little data to guess.
- *Risks:* the top five, each with its trigger and the plan if it happens, kept in `PROJECT.md`.
- *Change control:* when you change your mind, Claude first tells you what it adds or delays and records your
  decision, instead of quietly absorbing the extra work or dropping an agreed feature.
- *Your acceptance:* features are grouped into milestones of about three. When one is finished, Claude starts
  the app (`/starter-kit:accept`), tells you exactly what to try in everyday words, and records your verdict in your own
  words, with the date, in `ROADMAP.md`. Nothing ships while a finished milestone is waiting for your OK. Claude writes
  the record from your reply, so the quote is only as honest as that step; it is what the owner reads back later.
- *Status report:* ask "where are we?" (`/starter-kit:status`) for progress, what's next, the rough forecast, risks, and
  exactly what Claude needs from you. Every line is built from the project's files and git history by a script.

**Real-browser tests, screenshots and a speed budget.** For apps with a screen, setup installs Playwright and creates end-to-end
tests that open the running app and click through it at phone (375 px) and desktop (1280 px) sizes. Every feature a person can see
gets one, mapped to its acceptance criteria. Each test saves screenshots, and the UI reviewer opens the images and judges what a
person would actually see, state by state. A speed check (`scripts/perf-budget.mjs`) totals the compressed size of the build and
fails over a budget (JavaScript 300 KB, CSS 100 KB, any one image 500 KB by default), naming the biggest files. Before the browser
download (several hundred MB), `scripts/disk-free.mjs` checks the drive has room and the install moves to another drive when
it doesn't. Limits: the speed check measures the whole build, not one page's first load, and cannot see server speed; real
phones and slow networks are not tested.

**Going live properly, and staying healthy afterwards.** An agency doesn't launch by pushing a button and hoping. For the first
public launch `/starter-kit:launch` sets up what they set up, and writes it into `RUNBOOK.md`: separate test and live environments
with their own keys, deploys that come from git, error tracking, an uptime check that emails you, daily backups that have actually been
restored once, a rollback that has been practised, the domain and HTTPS, and a cost estimate with spending alerts. A checker
(`scripts/runbook-check.mjs`) refuses an incomplete runbook: every section must be filled in, the restore test and the rollback
practice must carry dates, and no secret value may appear. Claude does the technical work and guides you only through what needs
your hands (creating accounts, adding a payment method), and asks before anything that costs money or goes public. After launch,
`/starter-kit:maintain` is the monthly visit: updates (major versions are left for you to decide), a security re-check, backup and
restore dates, errors, speed and cost, logged in `MAINTENANCE.md`. The session start tells Claude when 30 days have passed since the last
visit, so you don't have to remember. Limits: Claude can't create accounts or pay for you, a restore test needs a real scratch
database, and the cost figures are estimates from the pricing pages of the day.

**Legal basics, licenses, analytics and feedback.** Most launch embarrassments are not exotic: no privacy policy, a policy that says something the app does not do, careless handling of children's data, or a library whose license forbids commercial use. `PROJECT.md` keeps a **data inventory** (what personal data, why, where it goes, who sees it, how it is deleted) that every feature must keep true. `/starter-kit:legal` works out which rules apply (privacy, terms, cookies, children, people's rights to see and delete their data, payments, email, accessibility law, AI disclosure, app stores, regulated areas) from current sources, drafts the privacy policy and terms from how the app really behaves, and builds the missing features (deletion, export, consent). Drafts carry a DRAFT banner, leave `[Company legal name]`-style gaps for you to fill, and the launch check refuses placeholders. `scripts/license-check.mjs` reads the licenses of the libraries you ship, flags restrictive ones (GPL, AGPL, non-commercial) and ones with no license, and writes the attribution list. The plan also decides how success will be measured (a privacy-friendly analytics tool or plain counts) and gives users a way to send feedback. Limits: these are AI drafts and screening tools, not legal advice; a lawyer must review the documents, and apps handling health, finance or children need a professional; license checks read what libraries say about themselves.

**Trial runs, a flight recorder, taste, and memory for long builds.** The unit tests prove each part alone; only real builds show whether the whole flow works. `DOGFOOD.md` is the plan: three trial apps of rising difficulty that you run in your normal session (no API keys, no separate model calls). A *flight recorder* hook (`flight-recorder`) writes a private log of names only (which workflows and agents ran, and which actions started but never finished, meaning they were blocked or failed). It never records prompts, code, command arguments, paths or secrets, and it lives in your own folder, outside the project, so it can't be committed. After a trial, `/starter-kit:dogfood` reads it, compares it with what should have happened and turns each gap into a fix (in the kit's own repository) or a written note (`KIT-FEEDBACK.md`, in any other project). Switch it off with `{ "flightLog": false }` in `.claude/kit.json`. For *taste*, the plan asks which apps you like and dislike, writes them into `DESIGN.md` with a quality bar, `scripts/design-check.mjs` checks the sections and color contrast, the UI reviewer scores every screen 1 to 5 against it (below 4 blocks), and acceptance asks what feels off. For *long builds*, `DECISIONS.md` is an append-only list of decisions and reasons (the newest are shown at every session start), `PROJECT.md` keeps a `## Map` of the code, and `scripts/context-pack.mjs` hands each builder only the roadmap item, decisions, related map lines and design brief that matter. Limits: the log shows what ran, not whether the result was good; scoring screens is still a model's opinion, and your eye is the final judge.

**Builds that last weeks.** Over many sessions small mismatches pile up, so the session start checks the records against reality (`scripts/drift-check.mjs`): a code map naming files that are gone, a handoff that stops before the latest commits, a decision that picks what an earlier one rejected, records grown too long to read. `scripts/compact-records.mjs` moves older decisions and releases, word for word, into archive files, so the session note stays the same size in month three as on day one. Every three merged features is a *checkpoint* (`scripts/checkpoint.mjs`): full suite, every roadmap proof, the drift check, and the approved plan read against what was really built, before anything more is built. The flight recorder spots a *stall* (the same roadmap item "next" for three sessions, or a builder relaunched four times) and the session start says so, so Claude stops retrying and tells you what is blocking it. Tested with a simulated 50-session project. Limits: the checks compare records with files and git, not with what you meant; only the checkpoint's re-read of the plan (done by the model) catches a misunderstanding.

**Big codebases.** Nobody (human or model) can hold a million lines in their head, so the kit doesn't try. `scripts/code-index.mjs` builds an index of every source file in 15+ languages: what each file defines and which files import which. It is stored outside the project and updated incrementally (in git repositories it uses git's own content hashes, so re-indexing 10,000 unchanged files takes about two seconds). Claude uses it to find where something lives (`--find`), to see everything a change could break (`--impact`, up to three steps away), and to spot the files everything depends on (`--hubs`). `scripts/scoped-tests.mjs` picks only the tests a change can affect, and says to run the full suite when it cannot be sure (a build or dependency file changed, an unindexed language, nothing found). Projects marked `Size: large` use scoped tests while building and the full suite at checkpoints and before shipping. The reviewer checks the dependents of every change, not just the diff. `/starter-kit:onboard` maps an existing codebase area by area over several sessions, writing an `AREAS.md` overview and a `CLAUDE.md` rules file per area (Claude Code loads it automatically when working there) without changing any code. Tested on a synthetic 10,000-file repository and, read-only, on a real 9-million-line Python installation (31,000 files: about 3.5 minutes for the first index). Limits: the index reads patterns, not a real compiler, so dynamic imports, reflection, dependency injection and generated code are missed; outside git, re-indexing a very large folder is slow on Windows; tribal knowledge that isn't written anywhere stays unknown.

**Big databases and live data.** Database mistakes are the ones that can't be undone, so a *database guard* hook (`db-guard`) keeps Claude on local copies: it denies any connection to a database that isn't on this computer (connection strings, `-h` hosts, the project's `.env` when a migration tool has no explicit target; Docker Compose services count as local), migrations run with production settings, and hosting platforms' database tools (Heroku, Fly, Railway, Supabase push, RDS and others). Destructive SQL on a local database (dropping or emptying tables, `UPDATE`/`DELETE` with no `WHERE`, resets) asks you first. Passwords are never repeated. `scripts/migration-check.mjs` reads migrations in plain SQL and the common frameworks and flags what locks or loses data: dropped or renamed columns and tables, required columns with no default, type changes, index and foreign-key builds that block writes, data changes inside migrations, and missing rollbacks, each with the safe way to do it. Only you can accept a risk, and the pre-ship scan lists every accepted one. `scripts/db-rehearse.mjs` fills a copy (never the original) with realistic volumes, times the migration and finds full-table scans (SQLite directly; Postgres from saved `EXPLAIN` output). `/starter-kit:db` ties it together: expand-migrate-contract changes, batched resumable backfills tested by interrupting them, and a runbook entry so you run the live change yourself. Limits: the guard reads commands, so a script that connects on its own (an app's own code, a custom tool) isn't seen; the migration rules are patterns, not a database engine; Postgres and MySQL rehearsals need a local copy you run in Docker.

**Adversarial review: someone is always trying to prove it wrong.**
- *The challenger* (`challenger` agent) joins every feature review with one job: assume the work is NOT done and prove it.
  It checks the builder's claims against the files, hunts tests that couldn't fail, missing cases and collateral damage,
  and must show what it tried (a review that lists no attempts is invalid). "Does not hold up" blocks the merge.
- *The red team* (`red-team` agent, `/starter-kit:redteam`) attacks a local copy of the app like a hostile user: reading
  other users' data, bypassing sign-in, injecting input, abusing prices and business rules, bad uploads, leaks, and
  tricking any AI model the app uses. Each confirmed break gets a failing test that stays in the project as a permanent
  regression test. It runs on high-risk features right after they are built and on the first launch. It only ever
  attacks this computer: a guard hook denies attack tools (`nmap`, `sqlmap`, `hydra`, `nikto`, `ffuf` and others) aimed
  at anything else, and load-testing tools aimed at a remote host ask you first.
- *Mutation testing* (`scripts/mutate.mjs`) deliberately breaks the code, one small mistake at a time (flips a
  comparison, swaps `&&` and `||`, turns `true` into `false`), and checks that the tests notice. A change the tests don't
  notice is behavior nobody checks. It refuses to touch your main folder, restores every file afterwards, and discards
  mistakes that merely fail to compile.
- *The kit attacks itself.* `guard-fuzz` and `secret-fuzz` tests throw hundreds of disguised attacks at the safety guard
  and the secret scanner (quote tricks, nested shells, `ssh` and `python -c` one-liners, encoded payloads,
  download-then-run, uploads of `.env`, connection strings and a dozen key formats), alongside harmless look-alikes
  that must NOT be blocked. The first run found 63 real gaps, all fixed; every new disguise gets added there first.
Limits: a red team only finds what it is clever enough to try, cannot test what it cannot run locally or third-party
services, and does not replace a professional penetration test for an app that holds payments or sensitive data.

**Checks must pass before a turn ends.** When Claude finishes a turn and code has changed, a hook runs the
project's own checks (the `verify` list in `.claude/kit.json`: typecheck, lint, tests). If one fails, the turn
doesn't end; Claude gets the failure and must fix it or tell you plainly what's broken. Passing checks cost no
tokens, and it blocks at most once per turn. Switch off with `{ "verifyGate": false }`.

**Secret guard.** Before anything leaves your computer, a hook scans it: `git commit` (the staged changes),
`git push` and `gh pr create` (every commit not yet on GitHub, including ones later removed), and `git add` of
env or key files. It blocks on API keys (AWS, GitHub, Anthropic, OpenAI, Stripe, Google, Slack, npm), private keys,
JSON web tokens, credential-named values like `API_KEY=...`, and `.env`/`.pem`/`.key` files. It also blocks anything
in your private terms list at `~/.claude/plugins/data/starter-kit/private-terms.txt` (your name, email, client
names). The reason shows file and line with the value redacted, never the secret. Placeholders such as
`your-key-here` are allowed. If a real key ever got committed, rotate it: deleting it later does not remove it
from GitHub's history. Switch off with `{ "secretGuard": false }` in `.claude/kit.json`.

**Security, built in at every stage.**
- *Planning:* the plan includes a threat check (what's worth stealing, who could misuse it, the likely attacks) and turns
  each defence into a test, such as "user A cannot read user B's data". High-risk features are tagged.
- *Building:* the builder follows secure-coding defaults (check who is asking on every request, validate input on the
  server, parameterized queries, secrets only in environment variables, hashed passwords, rate limits, safe cookies).
- *Right after risky features* (sign-in, payments, uploads, permissions, database rules, secrets), the security
  reviewer runs immediately, not only at the end.
- *New packages:* a package guard looks each one up in its public registry before it installs. A name that doesn't
  exist is blocked (AI tools invent plausible names and attackers register them); brand-new, barely used, deprecated
  or script-running packages, and installs from a URL or git repo, ask you first.
- *Every commit:* the secret scan also runs as a real git pre-commit hook, so it protects commits from any tool or
  from you, and the same scan runs in a GitHub check on every push and pull request (read-only permissions,
  official actions only).
- *Shipping:* pushes, pull requests, releases, `npm publish`, `docker push` and deploy commands such as
  `vercel --prod` or `fly deploy` all wait for the pre-ship scan, and the secret scan covers the files being published.
  The first launch also gets a launch-readiness checklist (HTTPS, security headers, CORS, database rules, key
  privileges, rate limits, backups, rollback).
- *Whole project:* ask "is it secure?" and a full-codebase audit runs (tools first, then the security reviewer),
  not just a review of recent changes.

**A project can't switch your protections off or run its own commands.** A project's `.claude/kit.json` can list
check commands and off-switches, but a stranger's project must not be able to run code on your computer or disable
the guards. So those entries do nothing until you approve them on this computer. Approval is one plain yes/no
question when a project is set up; Claude Code then shows a permission prompt with the exact commands, and the
approval is stored outside the project (`~/.claude/plugins/data/starter-kit/trusted.json`, which neither shell
commands nor Claude's file tools can edit). Changing a command voids its approval.

**Cheap research.** Web searching and reading run on Haiku (fast and inexpensive), in parallel by angle. The main
conversation checks the claims, and anything costing real money or affecting security or legal choices is
re-checked with a stronger model.

**Self-updating.** At the start of a session (at most once a day) a background job updates this plugin from
its GitHub repo, so every computer stays current without anyone typing a command. It never delays the session
and applies the new version the next time Claude Code starts. It runs exactly two fixed commands, for this plugin
only (`claude plugin marketplace update starter-kit-marketplace`, then `claude plugin update
starter-kit@starter-kit-marketplace`), and skips plugins loaded straight from a folder (development). The last
result is in `~/.claude/plugins/data/starter-kit/auto-update.log`. Trade-off: the GitHub repo is the source of
code that runs on every computer, so keep that account secured (two-factor on, no shared access). Switch it off
with `{ "autoUpdate": false }` in `.claude/kit.json` or the environment variable `KIT_AUTOUPDATE=0`.

**Turning things off** (per project, in `.claude/kit.json`). Comfort settings take effect right away:
`{ "lean": false }` (token-saving replies), `{ "plainLanguage": false }`, `{ "autoUpdate": false }`,
`{ "verifyGate": false }`. Protections (`"guard"`, `"secretGuard"`, `"packageGuard"`, `"autoGate"`, `"auto"`, and
`"guardAllow": [rule ids]`) also need your approval before they count, as described above. Claude never turns any
of them off on its own; if you ask it to, it sets the switch and you approve it in a permission prompt.

The automatic behaviour is instructions plus two hooks, so it is reliable but not magic: the push gate is
enforced by a hook, while "use `/feature` for features" is guidance Claude follows.

## Branches and worktrees, in plain words
- A **branch** is a separate line of work inside your project's history. `main` is the good, working copy.
- A **worktree** is a second folder on disk, checked out to its own branch. Claude builds the feature there,
  so your main folder and your conversation stay untouched while it works.
- A **merge** copies the finished branch's work into `main`. `/starter-kit:feature` does that only after
  the tests are green and the reviewer approves, then deletes the branch and the extra folder.
- It never pushes to GitHub or anywhere else, and it stops and tells you if anything conflicts or fails —
  your work stays safe on its branch.
- Needs a git project with at least one commit, and no uncommitted changes in the main folder.
  The command checks this and asks before doing anything about it.

## Related-tests hook
- Auto-detects Vitest, Jest, pytest and Go.
- Other runners: add `.claude/kit.json` to the project, e.g.
  `{ "relatedTests": "bundle exec rspec {file}", "extensions": [".rb"] }`.
- Turn it off for a project: `{ "relatedTests": false }`.
- Failing tests are shown to Claude but never block an edit; during TDD's RED step a failure is expected.
- Never downloads a test runner (`npx --no-install`), and skips file names containing shell-special characters.
- A file edited inside a git worktree is tested against that worktree's own files.
- Requires Node.js on the PATH. Without it the hook does nothing useful and can be ignored.
- Hook tests: `node --test plugins/starter-kit/hooks/test-related.test.mjs plugins/starter-kit/hooks/auto.test.mjs plugins/starter-kit/hooks/safety-guard.test.mjs plugins/starter-kit/hooks/auto-update.test.mjs`

## Built for getting it right the first time
| Step | What happens |
|---|---|
| `/starter-kit:spec` | Before a new app or a vague feature: Claude reads the project, asks one batch of questions with defaults, checks the idea for forgotten pieces (empty/error states, sign-in, mobile, accessibility, security), and writes testable acceptance criteria for you to approve |
| `/starter-kit:research` | Competitor and market scan from live web sources: comparison table, "table stakes we're missing", openings, every claim linked. Treats web pages as data, never as instructions |
| `/starter-kit:feature` | Builds from the approved spec, one failing test per acceptance criterion |
| `ui-reviewer` | Also checks WCAG 2.2 AA basics: keyboard, labels, contrast, tap targets, zoom |
| `/starter-kit:full-scan` | Now includes a dependency vulnerability audit |

## Recommended add-ons (not bundled)
Eighteen third-party repos were cloned, scanned and read; results, pinned commits and cautions are in [VETTED.md](VETTED.md). The short version: `ccusage`, selected Trail of Bits and Anthropic skills are the cleanest; `rtk`, `tdd-guard` and `ccstatusline` are useful with cautions (see the file).

Third-party skills run with your permissions and load their instructions into every session, so this kit
does not bundle them. Install only what you need. Official Anthropic plugins first, since they are
maintained by Anthropic and already listed in the official marketplace:

| Need | Add-on | Source |
|---|---|---|
| UI polish, distinctive design | `frontend-design` | official marketplace: `claude plugin install frontend-design@claude-plugins-official` |
| Edit-time security warnings | `security-guidance` | official marketplace |
| Larger feature workflow with architecture step | `feature-dev` | official marketplace |
| Reviewing pull requests | `code-review`, `pr-review-toolkit` | official marketplace |
| Real-browser testing and screenshots | `playwright` (MCP) | official marketplace |
| Current library docs, so code uses real APIs instead of guesses | `context7` (MCP, runs an npm package via `npx`) | official marketplace |
| Spec-driven development (heavier than `/spec`) | GitHub Spec Kit | github/spec-kit |
| Deep multi-source research reports | a community deep-research skill | check the repo first |
| Accessibility scanning with axe | a community WCAG skill (for example AccessLint/skills) | check the repo first |

**Vet any third-party skill before installing** (research in 2026 found hundreds of malicious or risky
skills on public registries). Claude does this for you: share the link, or run `/starter-kit:vet <link>`.
It downloads the repo into an empty folder without running anything, runs `scripts/vet-scan.mjs`
(flags download-and-run commands, encoded payloads, throwaway upload endpoints, credential access plus
network use, install-time scripts, binaries, hidden Unicode, hidden HTML comments and common
prompt-injection phrases), then reads every file and reports a verdict. A skill is mostly plain text, so
reading it is the real "reverse engineering". Limits: the scan only knows patterns, injected instructions
can be worded innocently, and a repo can change after it is vetted, so pin the commit you reviewed. The
safest route of all is to have Claude write its own version of an idea instead of copying the source.
Tests: `node --test plugins/starter-kit/scripts/vet-scan.test.mjs`.

## Deliberately not included
- **Jailbreak or "safety bypass" skills** (for example Hermes's "godmode"). They don't make code better and they defeat the guardrails this kit relies on.
- **"Godmode"-style mode switches and mega-bundles.** Reviewed in this repo's history: a per-turn "max capability" hook adds tokens on every message (the opposite of lean mode) and rewrites your settings on install; a 56-skill orchestration bundle needs other vendors' API keys and has no track record; a discipline pipeline (noobygains/godmode: question, verify docs, plan, test-first, second-model review, prove) mostly duplicates `spec` / `feature` / `full-scan`. It was fully vetted at commit 97c3f62 and nothing malicious was found, but it injects about 2,000 tokens at every session start plus a reminder on every prompt (about 4,000 tokens baseline versus this kit's 480), and its "invoke a skill before any response" rule would fight this kit's routing and lean mode. The one new idea, verifying library APIs against current docs, is now in the implementer agent.
- **Large bundles** ("150 agents, 70 plugins"). Every skill's description costs tokens each session, and most of them will never be used.

## Requirements
- A current Claude Code. Very old versions of the `claude` command (2.1.0, for example) fail on any tool use
  with "tool_use ids must be unique"; update with `npm install -g @anthropic-ai/claude-code@latest`.
- Node.js on the PATH (the hooks are small Node scripts) and git.

## What a plugin can't carry
Plugins don't ship `CLAUDE.md` or permission rules, which is why `/starter-kit:init` writes those
into each project.

## License
MIT. See [LICENSE](LICENSE). Third-party repos listed in VETTED.md keep their own licenses; none of their code or text is copied here.
