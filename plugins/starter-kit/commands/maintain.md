---
description: Use when a launched app is due for routine care (30+ days since the last maintenance) or the user says keep it up to date. Updates dependencies safely, re-checks security, backups and speed, reviews errors, and logs what was done in MAINTENANCE.md.
---

Do the routine maintenance for this launched project: $ARGUMENTS

Software goes stale: libraries get security fixes, certificates and keys expire, backups silently stop. This is the monthly visit a
good agency's maintenance plan covers. Check first: `node "${CLAUDE_PLUGIN_ROOT}/scripts/maintenance-due.mjs" --project .` (not launched means there is nothing to do yet).
Keep the user's attention for decisions only; do the rest yourself and report in plain words.

## 1. Updates, safely
- List what is out of date with the ecosystem's own tool (`npm outdated`, `pip list --outdated`, `cargo outdated`, ...). Have the
  `researcher` agent read the release notes for those version ranges and list breaking changes with links; you decide what to update.
- Do the updates as ONE `/starter-kit:feature` ("maintenance: update dependencies") so they get a separate worktree, the full test suite,
  the browser tests, review and the proof checks. Patch and minor updates go together. A major version that changes behavior is a
  decision: list it for the user with what it changes and the risk, and don't apply it unasked. Never loosen or delete a test to get an update through.
- New or changed packages go through the package guard as usual.
- After a major update of a part listed in `.claude/rules/stack.md`, read that part's installed CHANGELOG and correct any note there
  the new version makes wrong, in the same maintenance feature.
- GitHub workflow steps: for each `uses: <owner>/<action>@<commit> # v<N>`, look up the newest release tag of that action with
  `git ls-remote --tags --sort=-v:refname https://github.com/<owner>/<action>` and move the pin to its commit, in the same
  maintenance feature. A new major version is listed like any other.

## 2. Security re-check
Run `/starter-kit:audit` on what changed since the last maintenance (secret scan, the dependency audit, `node "${CLAUDE_PLUGIN_ROOT}/scripts/license-check.mjs"` if it exists),
and re-read the red team's last findings for anything still open. Rotate any key that is old or may have been exposed.

## 3. Operations health
- Backups: confirm the most recent automatic backup exists and RUNBOOK.md's `Restore last tested` date is under 90 days old; if not, do a restore test now and update the date.
- Errors and uptime: summarize the top error reports and any downtime since the last visit, in plain words, with what you changed or recommend.
- Speed: run the speed budget again (`perf-budget.mjs`, the speed test with `speed-check.mjs`, `api-check.mjs`) and compare with the numbers recorded under `## Performance` in PROJECT.md; if anything got worse, use `/starter-kit:speed`. Also look at real-user timing if the launch set it up.
- Size: take the real numbers (accounts or installs, and the busiest moment's users, from analytics or the host's dashboard) and run
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scale-profile.mjs" --project . --actual usersTotal=<n> usersPeak=<n>`. Past half of the plan, re-run the
  load test (or the desktop check) at the planned size now; past the plan, update the profile with its suggested numbers, re-test, and tell
  the owner in plain words what will need to change before the next doubling.
- Costs: compare this month's bill or usage with the estimate in RUNBOOK.md and say if it is drifting.
- Expiring things: domain renewal, certificates, API keys with an end date, free trials.

## 4. Record it
Append to `MAINTENANCE.md` (create it if missing, newest entry last):
```markdown
## YYYY-MM-DD
Updated: <packages, from -> to>
Decisions waiting: <major updates or anything needing the owner>
Security: <what was checked, anything found, anything rotated>
Backups: <last backup date, restore last tested>
Errors and uptime: <summary>
Speed and cost: <summary>
```
Update `CHANGELOG.md` and `HANDOFF.md`, then tell the user in a few plain lines what was done, what needs their decision, and when the next visit is due.
