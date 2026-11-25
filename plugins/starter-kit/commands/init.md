---
description: Run yourself, without asking, when the session-start hook says the project isn't set up. Detects the stack, writes CLAUDE.md and hook config, and asks one yes/no about command permissions.
---

Set up the current project for the starter kit. Work from what the project actually contains; where
you cannot find something, write `TODO` rather than guessing. The user is not a programmer: do every step
yourself and report in plain words.

## 1. Detect the stack
Read the manifests and scripts that exist: package.json, pyproject.toml / requirements.txt / tox.ini,
go.mod, Cargo.toml, Gemfile, pom.xml / build.gradle, *.csproj, composer.json, Makefile / justfile /
Taskfile, CI workflow files. From them work out the real commands for: install dependencies (for example
`npm ci`, `pip install -e .`, `bundle install`; a fresh git worktree has none installed), dev/run,
tests (run once), typecheck or static analysis, lint, build. Note the test runner and whether the project has a UI.
An empty folder is fine: write the template with `TODO` commands; `/starter-kit:spec` will choose the stack.

## 2. Git
If the folder is not a git repository, make it one yourself: `git init`, a `.gitignore` suited to the stack,
and a first commit. It is local, nothing is uploaded, and the build workflow needs it. Say so in one line.
If git has no author name or email here (`git config user.name` is empty), don't make the owner type them: when the GitHub CLI
is signed in (`gh api user --jq ".login, .id"`), set them for THIS repository only to the GitHub username and GitHub's private
no-reply address `<id>+<username>@users.noreply.github.com`, so commits link to their account without exposing a real email.
Otherwise ask for their GitHub username in plain words and use `<username>@users.noreply.github.com`. Never put a personal email
into a project's history, never invent a name, and never change the computer-wide git settings.

## 3. CLAUDE.md
- If the project has no CLAUDE.md, create one from the template below with every placeholder filled in.
- If it already has one, do NOT overwrite it: add the `starter-kit:managed` marker line and any missing
  sections at the end, leaving the user's text untouched, and say what you added.

## 4. Permissions (`.claude/settings.json`)
Merge into the existing file if there is one; never drop existing entries.
- deny (add without asking — these only restrict): `Read(./.env)`, `Read(./.env.*)`, `Read(./**/*.pem)`, `Read(./**/*.key)`.
- `"autoCompactWindow": 300000` (add without asking; it only changes when long chats here are summarised, not what runs): long
  chats compact at 300,000 tokens instead of near a million, so every message stops re-sending a huge history. Mention it in one
  line. Keep a value that is already there.
- allow: this lets commands run without a permission prompt, so ask the user ONE plain yes/no question first
  ("May I run this project's own test and build commands without asking each time?"), listing the commands:
  the install, test, typecheck, lint and build commands you found (as `Bash(<command>:*)`), plus
  `Bash(git status:*)`, `Bash(git diff:*)`, `Bash(git log:*)`. Add them only if the user says yes.
- For a typed language (TypeScript, Python, Go, Rust, Java, C#), mention in one line that the official marketplace's
  code-intelligence plugin for it cuts file reading; never install it yourself.
Add these lines to `.gitignore` (skip any already present): `.claude/settings.local.json`,
`.claude/worktrees/`, `.claude/logs/`, `.claude/last-full-scan`, `.claude/last-verified`, `.claude/last-docs-check`, `.claude/screens/`, `e2e/test-results/`, `playwright-report/`, and the secret files: `.env`, `.env.*`,
`*.pem`, `*.key`, `*.p12`, `*.pfx`, `credentials.json`. Then un-ignore only the templates with
`!.env.example` (they hold no real values). Never put real keys or passwords in a tracked file: store them in
`.env` (ignored) or the host's secret manager, and read them from the environment in code.
If `.env` or a key file already exists and is tracked by git, stop the usual flow and tell the user in one
plain sentence that it is public history risk, and that the key must be rotated. Do not run `git rm` on it yourself.

## 5. Kit settings (`.claude/kit.json`) — always write this file
```json
{ "verify": ["<typecheck command>", "<lint command>", "<test command, run once>"] }
```
- `verify` lists the project's own check commands, fastest first, leaving out any that don't exist. A hook runs
  them when Claude finishes a turn with changed code and won't let the turn end while one fails. Use `[]` if the
  project has no checks yet, and update the list when checks are added.
- The related-tests hook auto-detects Vitest, Jest, pytest and Go. For another runner add
  `"relatedTests": "<command with {file}>", "extensions": [".ext"]`, or `"relatedTests": false` if there is no
  fast way to run a subset.
- Off switches exist (`"auto"`, `"guard"`, `"secretGuard"`, `"packageGuard"`, `"dbGuard"`, `"autoGate"`, `"verifyGate"`,
  `"docsGate"`, `"flightLog"`, `"lean"`, `"plainLanguage"`, `"autoUpdate"`, and `"guardAllow": [rule ids]`). Never set one on your own. Only if the user
  asks in chat to turn something off may you set it, and it then does nothing until the user approves it in a
  permission prompt (step 6). A project file alone can never switch a protection off.

## 6. Approve what this project may run automatically
The checks, the related-tests runner and any switch above come from a file inside the project, so they run only
after the user approves them on this computer. Ask the user ONE plain yes/no question that covers this and the
permission question in step 4 together: "May I run this project's own tests and checks without asking each time
(<the commands>)?" If they say yes, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/trust.mjs" --project .` (Claude Code
then shows them a permission prompt listing the exact commands, which is their real approval). If they say no, skip
it: the project works, only the automatic checks stay off, and you don't ask again this session.


## 7. Guard every commit (any tool, not only Claude)
Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/install-git-hooks.mjs" --project .`. It copies the secret scanner into
`.claude/tools/` and installs a git pre-commit hook, so a key, env file or private detail is refused by git itself
whoever commits. It never changes a pre-commit hook it didn't write. Skip it if the folder is not a git repository.
Tell the user, once, that they can list their name, email and client names (one per line) in
`~/.claude/plugins/data/starter-kit/private-terms.txt` so those are never committed either.

## 8. Checks on GitHub (only if the project has a GitHub remote or the user plans to use GitHub)
Create `.github/workflows/checks.yml` that runs on every push and pull request. Use ONLY official actions from the
`actions/` organisation pinned to a major version, give the workflow read-only permissions, and no secrets:
```yaml
name: checks
on: [push, pull_request]
permissions:
  contents: read
jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      # <stack setup, e.g. actions/setup-node@v4 with node-version-file, or actions/setup-python@v5>
      - run: <install command>
      - run: <each verify command, one step each>
      - run: <dependency audit, e.g. npm audit --omit=dev --audit-level=high | pip-audit | cargo audit>
      - run: node .claude/tools/secret-scan.mjs --files $(git ls-files)
```
Adapt the setup and commands to the detected stack and leave out any step the project has no command for. Never
add a third-party action. Tell the user the free protections they can switch on in GitHub's settings (secret
scanning with push protection, Dependabot alerts) and that two-factor sign-in on their account matters most.

## 9. Preview and real-browser tests (only for projects with a web UI)
Create `.claude/launch.json` with the real dev command and port, so the app can be opened and looked at.

Then set up end-to-end tests that open the real app in a browser and click through it, at phone and desktop sizes. Unit
tests can all pass while the page is broken; this is what catches that.
- First check there is room: `node "${CLAUDE_PLUGIN_ROOT}/scripts/disk-free.mjs" --path . --need-mb 800`. The browser download is several hundred
  megabytes. If it says NOT ENOUGH or TIGHT, tell the user in plain words and put the browsers on a drive with space
  (set `PLAYWRIGHT_BROWSERS_PATH` to a folder there) instead of letting the install fail halfway.
- Use Playwright (JavaScript or TypeScript projects: add `@playwright/test` as a dev dependency, then `npx playwright install chromium`; the package guard vets
  the install). Other stacks: Playwright for Python, or the project's own browser-test tool.
- Create `e2e/` with `playwright.config.*` that has two projects, a phone (375 x 812) and a desktop (1280 x 800), and a
  `webServer` that starts the app with the dev command. Save screenshots under `.claude/screens/` (git-ignored) so reviewers can look at them.
- Record the command in CLAUDE.md as `End-to-end (browser) tests: <command>` and put the build folder and limits in
  `Speed budget:` (see the template). Add the e2e command to the GitHub checks workflow.
- Write ONE smoke test now: the home page loads at both sizes and shows no console errors. `/starter-kit:feature` adds more per feature.
- Copy `${CLAUDE_PLUGIN_ROOT}/templates/speed.spec.js` to `e2e/speed.spec.js` unchanged (it measures how fast pages load and taps respond on a throttled
  phone profile and writes `.claude/speed-results.json`), run `node "${CLAUDE_PLUGIN_ROOT}/scripts/speed-check.mjs" --project . --init` to create the budget
  `.claude/speed.json`, and record `Speed test: <command that runs e2e/speed.spec.js>` in CLAUDE.md. Add `.claude/speed-results.json` to `.gitignore`.
- Accessibility: add `@axe-core/playwright` as a dev dependency (the package guard vets it; it is MPL-2.0, fine as an unmodified
  dependency), copy `${CLAUDE_PLUGIN_ROOT}/templates/a11y.spec.js` to `e2e/a11y.spec.js` unchanged, and record
  `Accessibility test: <command that runs e2e/a11y.spec.js>` in CLAUDE.md. It checks WCAG 2.2 AA with axe plus a keyboard walk,
  reflow, zoom and motion; `a11y-check.mjs` judges the results. Add `.claude/a11y-results-*.json` to `.gitignore`.
Skip all of this, and write `none` in CLAUDE.md, for projects with no browser UI (a command-line tool, a library, an API only).

## 9b. Size (every project)
If `.claude/scale.json` does not exist and you can tell what kind of thing this is, ask the owner the one size question from
`/starter-kit:spec` (own computer or online, how many people, how many at once, what an hour of downtime costs) and record it with
`node "${CLAUDE_PLUGIN_ROOT}/scripts/scale-profile.mjs" --project . --set …`. Commit `.claude/scale.json` (it is plain numbers, no secrets).
Add `.claude/load-results.json` and `.claude/desktop-results.json` to `.gitignore`.

## 10. The project's memory: short documents any session can pick up from
Create these if missing (never overwrite ones that exist), fill what you know and leave `TODO` for the rest. Any
session, by any bot or person, must be able to read them and carry on with full context. Hooks keep them honest:
the handoff must cover the newest code commit, and roadmap ticks must be backed by merges and tests.

`PROJECT.md` — the master document. Short, plain, current; edit it, don't keep appending:
```markdown
# <Project name> — master document
## What it is
<two sentences, for someone who has never seen it>
## Stack and why
<each choice, one line, with the reason>
## How to run it
<install, run, test, build: the real commands>
## Architecture map
<folders and key files: what each is for, how a request or action flows through them>
## Decisions
- <date> — <decision> — because <reason> (and what was rejected)
## Current state
<what works now; what is in progress; what does not exist yet>
## Known problems
<bugs, shortcuts, things that were not verified>
## Data inventory
<each kind of personal data the app collects: what, why, where it is stored and who receives it, who can see it, how long it is kept, how it is deleted. Or "No personal data is collected.">
## Success measures
<two or three measurable goals: how the owner will know this worked>
## Risks
<top five, one line each: what could go wrong, what would trigger it, what we'd do>
## Next steps
<in order>
```

`HANDOFF.md` — what the previous session leaves for the next. Rewritten, never appended. Under 40 lines (the drift check warns above 60):
```markdown
# Handoff
Covers-through: none
## Done this session
## Half-done (state exactly where it stands, including any branch or worktree)
## Do this first next session
## Questions waiting for the user
## Failed or not verified
```
The `Covers-through:` line holds the full id of the newest code commit the notes describe; the docs hook tells you the
exact value to write when the notes fall behind.

`CHANGELOG.md` — one entry per merged feature or fix, newest first, in plain words with the commit:
```markdown
# Changelog
## Unreleased
- <date> — <what changed, as the user would describe it> (commit <short id>)
```
Also add to the project's CLAUDE.md template output (below) the "Records" section, so every session starts by reading them.

## 11. Report
In plain words, a few lines: what kind of project this is, what you set up, and anything marked `TODO`.
Commit the new files locally. Then carry on with whatever the user originally asked for. If that is a new app, website or tool,
or a big or vague feature, run `/starter-kit:spec` next: no app code before the owner has approved a plan.

## CLAUDE.md template
```markdown
<!-- starter-kit:managed — this marker tells the starter-kit hooks the project is set up. Keep it. -->
# Starter kit check
If no "STARTER KIT WORKFLOWS" note appeared at the start of this session, the starter kit's hooks are not running, so its
safety checks are off: tell the user that before doing anything else.

# Project
<name> — <what it does, one line>. Stack: <language, framework, test runner, data store, hosting>.

# Commands
- Install dependencies: <command — a fresh git worktree has nothing installed>
- Dev/run: <command>
- Tests (run once, not watch): <command>
- Typecheck / static analysis: <command or "none">
- Lint: <command or "none">
- Build: <command or "none">
- End-to-end (browser) tests: <command, or "none" if there is no browser UI>
- Speed budget: <build folder and limits for `perf-budget.mjs`, e.g. dist (JS 300 KB, CSS 100 KB, images 500 KB each), or "none">
- Speed test: <command that runs e2e/speed.spec.js, or "none" if there is no browser UI>
- Accessibility test: <command that runs e2e/a11y.spec.js, or "none" if there is no browser UI>
- Size: <"normal", or "large" for thousands of files: building and reviewing then use scoped tests and impact checks>
- Database: <kind and where local development's copy runs, e.g. "Postgres in Docker (docker compose up db)", or "none">
  Never point local development, tests or the kit at a database on another computer.

# Workflow — TDD mode: strict
<!-- Change "strict" to "relaxed" for prototypes: tests are then written alongside the code, not first. -->
Test first: write a failing test, confirm it fails, write the minimum code to pass, then tidy up.
Never delete or weaken a test to make it pass. Never write more than the current test needs.
Exempt from test-first (still run the full suite after): styling-only changes, config files, generated code,
database migrations (verify by applying locally). Anything with logic is never exempt.
The starter-kit plugin decides which workflow to run for each request; nothing to configure here.

# Conventions
- Layout: <where source, tests and config live>
- Patterns: <data access, error handling, naming — only what can't be seen from the code>
- Design: follow `DESIGN.md` when it exists.
- Never read or commit `.env*` files, keys or other secrets.

# Records (read first, keep true)
- Resuming? Read `HANDOFF.md`, then `PROJECT.md` (the master document), before anything else.
- After real work, update `HANDOFF.md`, `PROJECT.md` and `CHANGELOG.md`. Describe only what was actually done and verified.
- A `ROADMAP.md` box is ticked only with `(merged <commit>)` and, per criterion, `→ test: <file>::<test name>`.
- Every source file starts with a short comment saying what it is for; comment the WHY of non-obvious code.

# Git
- Claude commits its own finished, verified work locally with clear messages.
- Never push, publish or deploy unless the user asks.
```
