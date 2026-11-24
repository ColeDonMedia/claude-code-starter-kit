---
description: Set this project up for the starter kit — detect the stack, write CLAUDE.md, permissions, and hook config.
---

Set up the current project for the starter kit. Work from what the project actually contains; where
you cannot find something, write `TODO` rather than guessing.

## 1. Detect the stack
Read the manifests and scripts that exist: package.json, pyproject.toml / requirements.txt / tox.ini,
go.mod, Cargo.toml, Gemfile, pom.xml / build.gradle, *.csproj, composer.json, Makefile / justfile /
Taskfile, CI workflow files. From them work out the real commands for: dev/run, tests (run once),
typecheck or static analysis, lint, build. Note the test runner and whether the project has a UI.

## 2. CLAUDE.md
- If the project has no CLAUDE.md, create one from the template below with every placeholder filled in.
- If it already has one, do NOT overwrite it. Show the sections it is missing and ask before adding them.

## 3. Permissions (`.claude/settings.json`)
Merge into the existing file if there is one; never drop existing entries.
- allow: the exact test, typecheck, lint and build commands you found (as `Bash(<command>:*)`), plus
  `Bash(git status:*)`, `Bash(git diff:*)`, `Bash(git log:*)`.
- deny: `Read(./.env)`, `Read(./.env.*)`, `Read(./**/*.pem)`, `Read(./**/*.key)`.
Add `.claude/settings.local.json` to `.gitignore` if the project uses git.

## 4. Related-tests hook (`.claude/kit.json`)
The plugin's hook runs the tests related to each edited file. It auto-detects Vitest, Jest, pytest and
Go. For anything else, write `.claude/kit.json`:
```json
{ "relatedTests": "<command with {file} where the edited file path goes>", "extensions": [".ext"] }
```
Use `{ "relatedTests": false }` if the project has no fast way to run a subset of tests.
Skip this file when auto-detection already covers the project.

## 5. Preview (only for projects with a web UI)
Offer to create `.claude/launch.json` with the real dev command and port.

## 6. Report
List every file you created or changed, the commands you detected, and every `TODO` left for the user.

## CLAUDE.md template
```markdown
# Project
<name> — <what it does, one line>. Stack: <language, framework, test runner, data store, hosting>.

# Commands
- Dev/run: <command>
- Tests (run once, not watch): <command>
- Typecheck / static analysis: <command or "none">
- Lint: <command or "none">
- Build: <command or "none">

# Workflow — TDD mode: strict
<!-- Change "strict" to "relaxed" for prototypes: tests are then written alongside the code, not first. -->
1. RED: write a failing test first. Run it. Confirm it FAILS.
2. GREEN: write the minimum code to make it pass.
3. REFACTOR: clean up without changing behavior. Re-run tests.
- Never write implementation without a failing test first.
- Never write more implementation than the current test requires.
- Never delete or weaken a test to make it pass.
- Build features with `/starter-kit:feature` (isolated branch + worktree, reviewed, then merged); use `/starter-kit:tdd` for tiny changes.
- After every feature: run the FULL suite, then `/starter-kit:review` (`feature` does both itself).
- Before shipping: `/starter-kit:full-scan` (tests, typecheck, lint, build, then the security review).

TDD exemptions (no test-first; still run the full suite after): styling-only changes, config files,
generated code, and database migrations (verify by applying locally).
Anything with logic — pricing, validation, auth, business rules — is never exempt.

# Conventions
- Layout: <where source, tests and config live>
- Patterns: <data access, error handling, naming — only what can't be seen from the code>
- Never read or commit `.env*` files, keys or other secrets.

# Git
- Branches: <naming, and whether direct commits to main are allowed>
- Commits: <message style>
- Commit or push only when asked.

# Reviews
- After each feature: reviewer (correctness), plus ui-reviewer only when UI files changed.
- Before shipping only: security-reviewer. It must APPROVE.
- Never accept "done" — accept a passing test run, a diff, or a log.

# Token discipline
- Delegate to the Explore subagent, without being asked, any search likely to touch more than 3 files and any long log or test output. In the main session, read only the files you are about to edit.
- When a new request is unrelated to the work so far in this conversation, say so in one line and suggest `/clear` first. Carry on if the user doesn't.
- Quote the relevant lines instead of pasting whole files or full command output.
```
