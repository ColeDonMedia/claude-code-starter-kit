# How it works

[← Back to the README](../README.md) · [All documentation](README.md)

## You talk, it picks the workflow

You never type a command. At the start of every session a hook gives Claude a short routing note, and Claude picks and runs
the right workflow itself, saying in one line what it ran.

| When you… | It runs |
|---|---|
| open a code project that isn't set up | `init`: detects the stack, writes `CLAUDE.md`, asks one yes/no about running your test and build commands |
| describe a new app or a big, vague feature | `spec` (a plan you approve), then builds the roadmap |
| ask for a feature or a real bug fix | `feature` |
| ask for a one-file tweak | `tdd`, then `review` |
| report an error with no obvious cause | `debug` |
| ask about competitors or the market | `research` |
| ask "where are we?" | `status` |
| finish a milestone | `accept` (you try it before more is built) |
| say "ship it", "push" or "release" | `full-scan` (pushes and deploys are blocked until it passes) |

The routing note lives in the plugin, so updates reach every project automatically. You can still type any command yourself.

## Built for people who don't code

- Claude is told the owner is not a programmer. It explains results in plain words: what works now, how to see it, what isn't done.
- It makes routine technical choices itself, and asks only when a choice changes what you get, costs money, or can't be undone.
- It creates the git repository, commits its own verified work locally, and never pushes unless you ask.
- Switch the wording rule off with `{ "plainLanguage": false }` in `.claude/kit.json`.

## Lean mode (saves tokens)

- A short rule block in every session: lead with the answer, no preamble or recaps, read files narrowly, make the smallest change,
  send broad searches to a subagent.
- It never shortens code, commands, paths or error text, and warnings and security issues are written in full.
- Expect modest savings (roughly 15–30%), not the 65%+ some tools claim. The whole session note is kept under 520 words.
- Switch off with `{ "lean": false }`.

## Builds that continue by themselves

- For a new app, the plan researches similar products, picks the technology, writes a design brief (`DESIGN.md`) and a
  `ROADMAP.md` checklist, and asks you to approve it once.
- Claude then builds the roadmap one feature at a time, ticking each off with proof.
- Every later session starts by telling Claude how far the roadmap is and what's next, so "continue" is all you need to say.

## Branches and worktrees, in plain words

- A **branch** is a separate line of work inside your project's history. `main` is the good, working copy.
- A **worktree** is a second folder on disk, checked out to its own branch. Claude builds each feature there, so your main
  folder and your conversation stay untouched while it works.
- A **merge** copies the finished branch's work into `main`. `feature` does that only after the tests are green and the
  reviewers approve, then deletes the branch and the extra folder.
- Nothing is pushed to GitHub or anywhere else unless you ask. If anything conflicts or fails, it stops and says where the work is.
- It needs a git project with at least one commit and no uncommitted changes in the main folder; it checks this and asks first.

## Checks run before a turn ends

- When Claude finishes a turn and code has changed, a hook runs the project's own checks (the `verify` list in `.claude/kit.json`:
  typecheck, lint, tests).
- If one fails, the turn doesn't end: Claude gets the failure and must fix it or tell you plainly what's broken.
- Passing checks cost no tokens, and it blocks at most once per turn. Switch off with `{ "verifyGate": false }`.
- After each edit, a related-tests hook runs only the tests for that file (Vitest, Jest, pytest and Go are detected; other runners:
  `{ "relatedTests": "bundle exec rspec {file}", "extensions": [".rb"] }`). Failures are shown to Claude but never block the edit.
  It never downloads a test runner, skips file names with shell-special characters, and tests a file edited in a worktree
  against that worktree's own files.

## Which model does what

The kit uses three models: **Haiku** (fast and cheap) for finding and reading, **Sonnet** for everyday building, and **Opus**
where a mistake is expensive. By list price Sonnet costs about 20 times Haiku and Opus about twice Sonnet, so the kit saves on
reading and spends on judgement. It never picks Fable (about four times Sonnet) by itself.

One script, `scripts/model-route.mjs`, decides before each agent starts, from facts the project already records:

| Agent | Starts on | Moves up to Opus when |
|---|---|---|
| Builder (`implementer`) | Sonnet | the roadmap item is medium or large, is risky (sign-in, payments, uploads, personal data and the like), touches code that 10 or more files depend on, or two review rounds have failed |
| `reviewer` | Opus | already there, and never weaker than the builder |
| `challenger` | Sonnet | it is checking the plan, the feature is large or risky, or two rounds have failed |
| `investigator` | Sonnet | a first guess about a bug was wrong, the area is risky, or the live site is down |
| `security-reviewer`, `red-team` | Opus | already there; the security review is never lowered |
| `scout`, `researcher` | Haiku | never: if Haiku isn't enough, the job goes to a stronger agent instead |

- **Enforced, not just advised:** a hook refuses to start a review on a weaker model than its job needs.
- **More care is easy, less needs you:** `{ "rigor": "critical" }` in `.claude/kit.json` puts every builder and reviewer on Opus.
  `"prototype"` lets small builds be reviewed on the builder's own model, but only after you approve it on this computer.
- **Plans without Opus:** if a launch fails because the plan has no Opus, the kit uses Sonnet, tells you in one sentence, and
  remembers it for this computer. Status and every security report then say so at the top.
- **Your own conversation matters most.** Planning, debugging and database work happen in the main conversation, on the model you
  picked. If that is Haiku during a build, the kit suggests a stronger one once.
- **Measured:** the flight log records which model each agent asked for, which one ran and how many tokens it used.

### What Haiku does, and what it never does

Haiku **finds and points**. The `scout` reads a big codebase and hands back `file:lines` pointers, each with one line quoted word
for word; a script checks every pointer before anyone relies on it, and a wrong one sends the report back. The stronger model then
reads the real code. Scouts run only in big projects (over 150 source files, or `Size: large`), because in a small one the free code
index already does this. The `researcher` reads the web and dependency release notes.

Haiku never writes code, reviews, security or legal verdicts, or project records (changelog, handoff, decisions, code comments).
Writing a record needs what the main conversation already knows, so handing that to Haiku costs about as much as writing it, and a
wrong record misleads every later session. The mechanical records (database map, architecture map, status) are already written by
scripts, for free.

## Keeping usage down

**What the kit does by itself:**
- **Noisy output is shortened.** When a test run, install or build prints more than 120 lines and succeeds, Claude gets the start,
  any failure lines with a little context, and the summary. The full output is saved in `.claude/logs/` (a folder that ignores
  itself, so it is never committed) and the short version says where. Git output is never shortened, and the command itself is never
  changed. Off with `{ "quietOutput": false }`.
- **A second review round reads only the fix,** and only the reviewers that objected re-check it.
- **Builders edit instead of rewriting files,** and commit after every passing test.
- **Agents use the right model** (see above), and the flight report shows tokens per model, shortened output and whole-file rewrites.

**What only you control (the kit tells you once when it matters):**
- **A new chat per task.** Every message re-sends the whole conversation, and after a pause the cache has expired, so all of it is
  charged in full again. The project's records let a new chat pick up for much less. When you reopen a large old chat, the kit says so.
- **The model of your own chat.** Fable costs about twice Opus: worth it for planning a big app or a hard problem, rarely for the build.
- **Plugins.** Every plugin you switch on loads into every session. Ask "which plugins load here?" and the kit lists them
  (`scripts/doctor.mjs --plugins`); it can switch one off for this project only if you ask.

## Cheap research

Web searching and reading run on Haiku (fast and inexpensive), in parallel by angle. The main conversation checks the claims,
and anything costing real money or affecting security or legal choices is re-checked with a stronger model.

## Self-updating

- At most once a day, at the start of a session, a background job updates the plugin from this GitHub repository. It never
  delays the session; the new version takes effect the session after that.
- It runs exactly two fixed commands, for this plugin only, and skips plugins loaded straight from a folder (development).
  The last result is in `~/.claude/plugins/data/starter-kit/auto-update.log`.
- Trade-off: this repository is the source of code that runs on every computer, so keep that GitHub account secured
  (two-factor on, no shared access).
- Switch off with `{ "autoUpdate": false }` or the environment variable `KIT_AUTOUPDATE=0`.

## What's enforced and what's guidance

The kit is instructions plus hooks. Hooks enforce (the push gate, the guards, the records check); instructions guide (for example
"use `feature` for features"). Both are covered by tests, but only the hooks are guaranteed. See [Settings](settings.md) for every switch.
