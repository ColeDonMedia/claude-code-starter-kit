---
description: Use after finishing code changes made directly in this conversation (not needed after /starter-kit:feature, which reviews itself). Fresh-context correctness review of the current changes, plus a UI/UX review when they touch UI.
---

Review the current changes with fresh subagents, launched in parallel.

First decide what to review ($ARGUMENTS can name a commit range or branch to use instead):
1. Uncommitted changes: `git diff HEAD`.
2. If that is empty, the last commit: `git show HEAD`.
3. If neither has anything, say there is nothing to review and stop.

Then launch:
1. The starter-kit `reviewer` agent — correctness, edge cases, regressions (it runs the tests).
2. The starter-kit `ui-reviewer` agent — only if the changes touch user-interface files. Skip it otherwise.

Do NOT run `security-reviewer` here; it runs once before shipping, in `/starter-kit:full-scan`.

Tell each agent what the change is meant to do, which files changed, and exactly what to diff.
Report each verdict (APPROVE or CHANGES REQUESTED) with its findings. Do not ship on a CHANGES REQUESTED verdict.
A review that comes back marked partial (the agent hit its turn limit) is resumed once; if it is partial again, say so instead
of treating half a review as a verdict.
