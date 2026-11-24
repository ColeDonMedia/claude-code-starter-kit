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

## 3. CLAUDE.md
- If the project has no CLAUDE.md, create one from the template below with every placeholder filled in.
- If it already has one, do NOT overwrite it: add the `starter-kit:managed` marker line and any missing
  sections at the end, leaving the user's text untouched, and say what you added.

## 4. Permissions (`.claude/settings.json`)
Merge into the existing file if there is one; never drop existing entries.
- deny (add without asking — these only restrict): `Read(./.env)`, `Read(./.env.*)`, `Read(./**/*.pem)`, `Read(./**/*.key)`.
- allow: this lets commands run without a permission prompt, so ask the user ONE plain yes/no question first
  ("May I run this project's own test and build commands without asking each time?"), listing the commands:
  the install, test, typecheck, lint and build commands you found (as `Bash(<command>:*)`), plus
  `Bash(git status:*)`, `Bash(git diff:*)`, `Bash(git log:*)`. Add them only if the user says yes.
Add these lines to `.gitignore` (skip any already present): `.claude/settings.local.json`,
`.claude/worktrees/`, `.claude/last-full-scan`, `.claude/last-verified`.

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
- Off switches, which only the user may set (never set them yourself): `"auto": false` (everything automatic),
  `"lean": false`, `"plainLanguage": false`, `"guard": false`, `"guardAllow": [...]`, `"autoGate": false`,
  `"verifyGate": false`, `"autoUpdate": false`.

## 6. Preview (only for projects with a web UI)
Create `.claude/launch.json` with the real dev command and port, so the app can be opened and looked at.

## 7. Report
In plain words, a few lines: what kind of project this is, what you set up, and anything marked `TODO`.
Commit the new files locally. Then carry on with whatever the user originally asked for.

## CLAUDE.md template
```markdown
<!-- starter-kit:managed — this marker tells the starter-kit hooks the project is set up. Keep it. -->
# Project
<name> — <what it does, one line>. Stack: <language, framework, test runner, data store, hosting>.

# Commands
- Install dependencies: <command — a fresh git worktree has nothing installed>
- Dev/run: <command>
- Tests (run once, not watch): <command>
- Typecheck / static analysis: <command or "none">
- Lint: <command or "none">
- Build: <command or "none">

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

# Git
- Claude commits its own finished, verified work locally with clear messages.
- Never push, publish or deploy unless the user asks.
```
