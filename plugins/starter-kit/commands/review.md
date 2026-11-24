---
description: Fresh-context correctness review of the current diff, plus a UI/UX review when the diff touches UI.
---

Review the current diff with fresh subagents, launched in parallel:
1. The starter-kit `reviewer` agent — correctness, edge cases, regressions (it runs the tests).
2. The starter-kit `ui-reviewer` agent — only if the diff changes user-interface files. Skip it otherwise.

Do NOT run `security-reviewer` here; it runs once before shipping, in `/starter-kit:full-scan`.

Tell each agent what the change is meant to do and which files changed. Report each verdict
(APPROVE or CHANGES REQUESTED) with its findings. Do not ship on a CHANGES REQUESTED verdict.
