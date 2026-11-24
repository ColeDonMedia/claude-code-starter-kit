---
description: Build one feature in an isolated branch/worktree with a subagent, review it, then merge it into the main branch. Keeps the main conversation small.
---

Build this in isolation and merge it when it's proven: $ARGUMENTS

The point is to keep this conversation small: the implementing and reviewing happen in subagents, and
only their short reports come back here. Do not read the implementation files or paste test output here
yourself unless something fails.

## 0. Preconditions
- The project must be a git repository with at least one commit. If it isn't, explain that and ask
  before running `git init` and making a first commit.
- The main checkout must be clean (`git status`). If there are uncommitted changes, stop and ask the
  user whether to commit or stash them first.
- Note the current branch name (normally `main`) and its tip commit (`git rev-parse HEAD`). Call them
  MAIN and BASE. The feature merges back into MAIN.
- Check CLAUDE.md has a "Commands" section with test, install and build/typecheck/lint commands. If it
  doesn't, suggest `/starter-kit:init` first and stop.

## 1. Implement (subagent, own worktree)
Launch the starter-kit `implementer` agent. It runs in a new git worktree on its own branch. It cannot
see this conversation, so write it a complete brief:
- what to build, why, the acceptance criteria, relevant files or areas, anything already decided here
- MAIN and BASE, so it can confirm its worktree starts from BASE
- the reminder that it must install dependencies first (a new worktree has none)

It commits on its own branch and reports the BRANCH name and the WORKTREE path. Keep its agent ID —
you will need it in step 2.

## 2. Review (subagents)
Launch the starter-kit `reviewer` agent, plus `ui-reviewer` in parallel if UI files changed. Give them:
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
Only when the implementer reported a green full suite AND the reviewer said APPROVE:
- Confirm the main checkout is still clean and still on MAIN.
- `git merge --no-ff BRANCH` into MAIN.
- If there is a merge conflict, run `git merge --abort`, and report it. Do not resolve conflicts unasked.
- Run the full test suite once on the merged result. If it fails, report it; do not continue.
- On success: remove the worktree (`git worktree remove WORKTREE`) and delete the branch (`git branch -d BRANCH`).
- Never push. Pushing is the user's call.

## 4. Report
In a few lines: what was built, the merge commit, the test result on the merged branch, and anything
the reviewer flagged that was left as-is. If anything stopped early, say exactly where the work is
(branch and worktree path) so nothing is lost.
