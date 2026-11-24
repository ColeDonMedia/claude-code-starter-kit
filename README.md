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
| `/starter-kit:tdd <feature>` | One red → green → refactor cycle, done in the current conversation (for small changes) |
| `/starter-kit:review` | Correctness review of the diff; UI review only when UI files changed |
| `/starter-kit:full-scan` | Tests, typecheck, lint, build, then the security review — the gate before shipping |
| `implementer` agent (Sonnet) | Does the building for `/starter-kit:feature` in its own worktree and commits on its own branch |
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

## Use in a project — mostly automatic
You don't need to remember the commands:
1. **Setup:** open a code project that isn't set up and Claude says so and offers to run `/starter-kit:init`. Say yes.
2. **Building:** the generated `CLAUDE.md` tells Claude to use `/starter-kit:feature` for features and bigger
   fixes, and `/starter-kit:tdd` plus `/starter-kit:review` for small tweaks. Just ask for what you want.
3. **Shipping:** a hook blocks `git push` and `gh pr create` until `/starter-kit:full-scan` has passed for the
   exact commit being pushed. Claude runs the scan, then the push goes through. A new commit means a new scan.

You can still type any command yourself.

**Turning it off** (per project, in `.claude/kit.json`): `{ "autoGate": false }` stops the push gate;
`{ "auto": false }` stops the setup nudge and the gate. Claude is told never to change this itself.

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
- Hook tests: `node --test plugins/starter-kit/hooks/test-related.test.mjs plugins/starter-kit/hooks/auto.test.mjs`

## What a plugin can't carry
Plugins don't ship `CLAUDE.md` or permission rules, which is why `/starter-kit:init` writes those
into each project.
