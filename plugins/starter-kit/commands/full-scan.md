---
description: Use before the user pushes, opens a pull request, deploys, releases or otherwise ships (a hook blocks `git push` until it has passed). Full pre-ship sweep — entire test suite, typecheck, lint, build, then the security review.
---

Run the full pre-ship sweep using the commands listed under "Commands" in CLAUDE.md:
1. Full test suite (run once, not watch mode).
2. Typecheck / static analysis.
3. Lint.
4. Production build / package / compile.
5. Dependency vulnerability audit, using the ecosystem's own tool if there is one (`npm audit --omit=dev`,
   `pip-audit`, `cargo audit`, `bundler-audit`, `govulncheck`). Report high and critical findings. Don't
   auto-fix or upgrade packages; list what needs upgrading and why. If the tool isn't installed, say so
   and mark the step "not run" rather than skipping it silently.
6. Only once steps 1–5 are green: the starter-kit `security-reviewer` agent on everything changed since
   the last ship.

Choosing what "since the last ship" means (never use a plain diff against the current branch — after
`/starter-kit:feature` you are already on it, so that diff is empty). Take the first that exists:
  a. the latest tag: `git describe --tags --abbrev=0`  → `git diff <tag>..HEAD`
  b. the upstream branch: `git rev-parse --abbrev-ref @{upstream}` → `git diff <upstream>..HEAD`
  c. `origin/HEAD` → `git diff $(git merge-base origin/HEAD HEAD)..HEAD`
  d. none of these: ask the user which commit to review from.
Tell the user which range you chose. If the range has no changes, say so and skip step 6.
Pass the range to security-reviewer.

Rules:
- Use only commands from CLAUDE.md or the project's own manifest and scripts. Never invent one.
- If the project genuinely has no command for a step (for example no typecheck in a shell-script
  project), report that step as "not applicable" with the reason. Do not silently skip it.
- Report each step's real output.
- Ship only when every applicable step is green AND security-reviewer returns APPROVE.
  If anything fails, fix it and re-run the full sweep.

When — and only when — every applicable step is green and security-reviewer returned APPROVE, record it
so the push gate lets the push through: `git rev-parse HEAD > .claude/last-full-scan`. Never write that
file on a failing or partial run. If there are uncommitted changes, tell the user the scan covers only
the committed code at HEAD.
