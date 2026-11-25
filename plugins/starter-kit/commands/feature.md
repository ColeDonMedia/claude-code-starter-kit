---
description: Use when the user asks to build a new feature, add functionality, or fix a non-trivial bug (more than a few lines, or touching several files). Builds it in an isolated branch/worktree with a subagent, reviews it, then merges it into the main branch. Keeps the main conversation small.
---

Build this in isolation and merge it when it's proven: $ARGUMENTS

The point is to keep this conversation small: the implementing and reviewing happen in subagents, and
only their short reports come back here. Do not read the implementation files or paste test output here
yourself unless something fails.

## 0. Preconditions
- The project must be a git repository with at least one commit. If it isn't, create one yourself
  (`git init`, add a sensible `.gitignore`, first commit) and say so in one line. It is local and harmless.
- The main checkout must be clean (`git status`). If the uncommitted changes are your own finished, tested
  work from this conversation, commit them yourself with a clear message. If you don't know where they came
  from, or tests are failing, stop and ask the user in plain words what to do with them.
- Note the current branch name (normally `main`) and its tip commit (`git rev-parse HEAD`). Call them
  MAIN and BASE. The feature merges back into MAIN.
- If this is a whole new app, or the request is large or vague and has no written acceptance criteria,
  run `/starter-kit:spec` first and use the approved spec as the brief. Skip this for a clear, small request.
- Check CLAUDE.md has a "Commands" section with test, install and build/typecheck/lint commands. If it
  doesn't, suggest `/starter-kit:init` first and stop.

## 1. Implement (subagent, own worktree)
Launch the starter-kit `implementer` agent. It runs in a new git worktree on its own branch. It cannot
see this conversation, so write it a complete brief. Start it from `node "<SCRIPTS>/context-pack.mjs" --project . --feature "<the feature>"`,
which pulls the roadmap item, the latest decisions, the related parts of the code map and the design brief out of the
project's records, so a big project doesn't mean a big brief. Then add:
- what to build, why, the acceptance criteria, relevant files or areas, anything already decided here
- MAIN and BASE, so it can confirm its worktree starts from BASE
- the reminder that it must install dependencies first (a new worktree has none)
- the acceptance criteria, if there are any, with the instruction to write one failing test per criterion

It commits on its own branch and reports the BRANCH name and the WORKTREE path. Keep its agent ID —
you will need it in step 2.

## 2. Review (subagents)
Launch the starter-kit `reviewer` agent, plus `ui-reviewer` in parallel if UI files changed, plus the
`security-reviewer` agent (range mode, on `git diff MAIN...BRANCH`) right now — not only at ship time — whenever the
feature is tagged `high-risk` in ROADMAP.md or its diff touches sign-in or sessions, permissions or roles,
payments, file uploads, database rules or migrations, secrets or environment settings, network or CORS settings,
or anything that handles other people's personal data. Treat its CHANGES REQUESTED like the reviewer's.
Also launch the `challenger` agent, always: it assumes the work is NOT done and tries to prove it (claims without
evidence, tests that couldn't fail, missing cases, collateral damage), and must show what it tried. Its
"DOES NOT HOLD UP" is treated like CHANGES REQUESTED; its findings that block "done" must be fixed, and any it
could not confirm must be answered, not ignored.
For `high-risk` features (same list as above), also run ONE round of the `red-team` agent against the feature
branch (tell it `git checkout --detach BRANCH`, the run command, and the feature's security criteria). Every
break it confirms comes with a failing test: send those to the implementer to fix, and keep the tests in the project.
Give each reviewer:
- the WORKTREE path — they must run every command there (`cd` into it, or `git -C`), because the main
  checkout does not have the feature's code and would be testing the old version
- the diff to review: `git diff MAIN...BRANCH`
- what the change is meant to do

If a reviewer says CHANGES REQUESTED:
- Send the findings to the SAME implementer (message it with its agent ID) so it keeps working in its
  existing worktree. Do not launch a fresh implementer: that would create a second, empty worktree.
- If the original implementer can't be resumed, launch a new one and tell it to ignore the worktree it
  was given, and instead work in the existing WORKTREE path on the existing BRANCH.
- Then review again. Stop after 3 rounds and ask the user.

## 3. Merge
Only when the implementer reported a green full suite AND the reviewer said APPROVE AND the challenger's findings
that block "done" are resolved (and, for high-risk features, no red-team break is left unfixed):
- Confirm the main checkout is still clean and still on MAIN.
- `git merge --no-ff BRANCH` into MAIN.
- If there is a merge conflict, run `git merge --abort`, and report it. Do not resolve conflicts unasked.
- Run the full test suite once on the merged result. If it fails, report it; do not continue.
- On success: remove the worktree (`git worktree remove WORKTREE`) and delete the branch (`git branch -d BRANCH`).
- Never push. Pushing is the user's call.

## 4. Prove it, write it down, report, continue
Done is something you can show, not something you say. Before reporting or ticking anything:
- **Prove it on the merged code.** Take the merge commit id (`git rev-parse --short HEAD` right after the merge).
  The implementer's report must map each acceptance criterion to a test (`file::test name`); open each test file
  yourself and confirm those tests exist and cover the criterion (a criterion no test checks is not done). Run the
  full suite once more and quote its result.
- **Write the records**, all in one docs commit:
  - `ROADMAP.md`: tick the feature as `- [x] <name> — <goal> (merged <short id>)`, tick each criterion and add
    `→ test: <file>::<test name>` (or `→ manual: <how it was checked by hand>` for things a test can't show, such as how a screen looks).
    Run `node "<SCRIPTS>/roadmap-check.mjs" --project .` and fix anything it reports; it checks the commit and tests are real.
  - `CHANGELOG.md`: one plain-words entry with the commit id.
  - `PROJECT.md`: update current state, the architecture map (one line per folder or key file under a `## Map` heading: `- path — what it is for`), known problems, next steps.
  - `DECISIONS.md`: one new line per decision made (`- <date> — <decision>, because <reason>; rejected: <alternative>`). Append only; it is
    what later sessions read first, so keep each line short.
  - `HANDOFF.md`: rewrite it for the next session, and set its `Covers-through:` line to the newest code commit
    (`git log -1 --format=%H -- . ':(exclude)*.md' ':(exclude).claude'`).
  Write only what is true. If something was not verified, say so in "Failed or not verified" instead of leaving it out.
- If `ROADMAP.md` lists this feature, tick its box as described above and commit that.
- Tell the user in plain words, a few lines at most: what now works, how to see it for themselves (the command
  to run or the page to open), and anything the reviewer flagged that was left as-is. No git details unless
  something went wrong.
- If anything stopped early, say exactly where the work is (branch and worktree path) so nothing is lost.
- If `ROADMAP.md` has more unticked items and nothing needs the user's decision, start the next one now.
