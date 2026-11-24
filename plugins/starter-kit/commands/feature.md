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
- Note the current branch name; that is the branch to merge into (normally `main`).

## 1. Implement (subagent, own worktree)
Launch the starter-kit `implementer` agent with worktree isolation. It cannot see this conversation, so
write it a complete brief: what to build, why, the acceptance criteria, relevant files or areas, and
anything already decided here. It commits on its own branch and reports the branch name.

## 2. Review (subagent)
Launch the starter-kit `reviewer` agent on that branch's diff against the main branch
(`git diff <main>...<branch>`), plus `ui-reviewer` in parallel if UI files changed.
On CHANGES REQUESTED: send the findings back to the implementer (same worktree and branch), then review
again. Stop after 3 rounds and ask the user.

## 3. Merge
Only when the implementer reported a green full suite AND the reviewer said APPROVE:
- `git merge --no-ff <branch>` into the branch noted in step 0.
- If there is a merge conflict, run `git merge --abort`, and report it. Do not resolve conflicts unasked.
- Run the full test suite once on the merged result. If it fails, report it; do not push or continue.
- On success: remove the worktree (`git worktree remove <path>`) and delete the branch (`git branch -d <branch>`).
- Never push. Pushing is the user's call.

## 4. Report
In a few lines: what was built, the merge commit, the test result on the merged branch, and anything
the reviewer flagged that was left as-is. If anything stopped early, say exactly where the work is
(branch and worktree path) so nothing is lost.
