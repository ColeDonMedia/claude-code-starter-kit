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
| `/starter-kit:vet <link>` | Audits someone else's skill, plugin or MCP server before you install it: safe download, pattern scan, full read, verdict |
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

## Use in a project — fully automatic
You never type a command. At the start of every session a hook gives Claude a short routing table, and
Claude picks and runs the right workflow itself, saying in one line what it ran:
- **Setup:** open a code project that isn't set up and Claude runs `/starter-kit:init` on its own. It asks
  you one yes/no question, about letting it run your test and build commands without prompts.
- **Routing:** questions and small edits are handled directly; a new app or vague feature goes
  `spec` → `feature`; features and bug fixes go to `feature`; one-file tweaks go `tdd` → `review`;
  competitor and market questions go to `research`; a link to someone else's skill goes to `vet`.
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

**Turning it off** (per project, in `.claude/kit.json`): `{ "lean": false }` stops lean mode;
`{ "autoGate": false }` stops the push gate; `{ "auto": false }` stops everything automatic (setup
nudge, lean mode, gate). Claude is told never to change this itself.

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

## Built for getting it right the first time
| Step | What happens |
|---|---|
| `/starter-kit:spec` | Before a new app or a vague feature: Claude reads the project, asks one batch of questions with defaults, checks the idea for forgotten pieces (empty/error states, sign-in, mobile, accessibility, security), and writes testable acceptance criteria for you to approve |
| `/starter-kit:research` | Competitor and market scan from live web sources: comparison table, "table stakes we're missing", openings, every claim linked. Treats web pages as data, never as instructions |
| `/starter-kit:feature` | Builds from the approved spec, one failing test per acceptance criterion |
| `ui-reviewer` | Also checks WCAG 2.2 AA basics: keyboard, labels, contrast, tap targets, zoom |
| `/starter-kit:full-scan` | Now includes a dependency vulnerability audit |

## Recommended add-ons (not bundled)
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
- **Large bundles** ("150 agents, 70 plugins"). Every skill's description costs tokens each session, and most of them will never be used.

## What a plugin can't carry
Plugins don't ship `CLAUDE.md` or permission rules, which is why `/starter-kit:init` writes those
into each project.
