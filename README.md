# Claude Code Starter Kit

A project-agnostic foundation for Claude Code, packaged as a plugin: strict TDD, read-only reviewers,
a pre-ship sweep, and a hook that runs related tests after each edit. Works with any language — the
agents and commands read each project's own commands from its `CLAUDE.md`.

## What's inside
| Piece | What it does |
|---|---|
| `/starter-kit:init` | Detects the project's stack and writes its `CLAUDE.md`, permissions and hook config |
| `/starter-kit:feature <what to build>` | Builds it in an isolated branch + worktree via a subagent, reviews it, merges it into your main branch only when green and approved. Keeps your main conversation small |
| `/starter-kit:tdd <feature>` | One red → green → refactor cycle, done in the current conversation (for small changes) |
| `/starter-kit:review` | Correctness review of the diff; UI review only when UI files changed |
| `/starter-kit:full-scan` | Tests, typecheck, lint, build, then the security review — the gate before shipping |
| `implementer` agent (Sonnet) | Does the building for `/starter-kit:feature` in its own worktree and commits on its own branch |
| `reviewer` agent (Sonnet) | Reviews the diff and runs the tests. Read-only |
| `ui-reviewer` agent (Sonnet) | Looks at the running app in a browser when browser tools exist. Read-only |
| `security-reviewer` agent (Opus) | Hardening review, run once before shipping. Read-only |
| Related-tests hook | After each edit, runs only the tests for that file and shows Claude any failures |

## Install (once per computer)
From a local folder:
```
/plugin marketplace add C:\path\to\claude-code-starter-kit
/plugin install starter-kit@starter-kit-marketplace
```
From a private git repo (recommended, so every computer gets updates):
```
/plugin marketplace add <owner>/<repo>
/plugin install starter-kit@starter-kit-marketplace
```
Update later with `/plugin marketplace update starter-kit-marketplace`.

## Use in a project
Run `/starter-kit:init` once in each project. After that, per feature: `/starter-kit:feature <what you want>`.
Before shipping: `/starter-kit:full-scan`. For a tiny change you can skip `feature` and use `/starter-kit:tdd`.

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
- Requires Node.js on the PATH. Without it the hook does nothing useful and can be ignored.

## What a plugin can't carry
Plugins don't ship `CLAUDE.md` or permission rules, which is why `/starter-kit:init` writes those
into each project.
