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

7. Launch readiness, only for something that serves real users (a web app, an API, a hosted service) and only the
   first time it ships or when hosting, security settings or access rules changed: have the `security-reviewer`
   run its launch-readiness checklist (HTTPS, security headers, CORS, database access rules, key privileges,
   rate limits, error handling, backups, a rollback plan). Anything FAIL blocks the launch; NOT CHECKED items go
   to the user in plain words with what to look at. This gate covers pushes, pull requests, releases, package
   publishes and deploy commands (`npm publish`, `vercel --prod`, `fly deploy`, `docker push`, and so on).
   For that first launch of anything with sign-in, payments, personal data or uploads, also run `/starter-kit:redteam`
   (it attacks a local copy and checks the tests with mutation testing): a launch is blocked while any critical or
   high break it found is unfixed, and a low mutation score on the main logic is reported to the user.
8. Real-browser tests, only for projects with a browser UI: run CLAUDE.md's "End-to-end (browser) tests" command. A failing
   end-to-end test blocks shipping; say in plain words which page and what to do. (Speed is step 14.)
9. The owner's acceptance: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/roadmap-check.mjs" --project . --acceptance`. If any finished milestone is
   still waiting for the owner's OK, stop and run `/starter-kit:accept` first: nothing ships that its owner has not tried.
10. Operations, only for the first public launch of a hosted app: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/runbook-check.mjs" --project .`. If RUNBOOK.md is
   missing or incomplete (deploy, rollback, backups with a dated restore test, monitoring, costs), run `/starter-kit:launch` to
   build it before anything goes live. After launch, routine care is `/starter-kit:maintain`.
11. Legal basics, only for the first public launch of something with users, accounts, personal data or analytics: run
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/legal-check.mjs" --project .` and `node "${CLAUDE_PLUGIN_ROOT}/scripts/license-check.mjs" --project .`. A missing privacy policy or terms, an
   empty data inventory, unfilled placeholders, or a restrictive or unknown library license blocks the launch; run `/starter-kit:legal`.
   Say plainly that the documents are drafts until a lawyer has reviewed them.
12. Database, when migrations changed since the last ship: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/migration-check.mjs" --project . --base <last ship>`.
   A HIGH finding blocks shipping (follow `/starter-kit:db`). List every `accepted-risk` line for the owner, and remind them that the
   live database change is theirs to run from the runbook.
13. Records, for projects with linked notes or a database: `node "${CLAUDE_PLUGIN_ROOT}/scripts/notes-graph.mjs" --project .` must report the notes consistent
   (no broken links, nothing relying on a superseded decision), and `schema-map.mjs --project .` and `arch-map.mjs --project .` (when those
   files exist) must say current. Regenerate with `--write` and say what changed.
14. Speed: for anything with a screen, build and run `node "${CLAUDE_PLUGIN_ROOT}/scripts/perf-budget.mjs" --dir <build folder>` (with the limits from
   CLAUDE.md's `Speed budget:`), run the speed test (CLAUDE.md's `Speed test:`), then `node "${CLAUDE_PLUGIN_ROOT}/scripts/speed-check.mjs" --project .` and
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/delivery-check.mjs" --dir <build folder> --project .`; for any server code run `node "${CLAUDE_PLUGIN_ROOT}/scripts/api-check.mjs" --project . --base <last ship>`.
   Over budget, a FAIL, or a HIGH finding blocks shipping: say in plain words which page or endpoint and what to do (`/starter-kit:speed`).
   `ACCEPTED` and MEDIUM lines are listed for the owner. Exit 2 from speed-check means it was never measured: measure it.
15. Design, for anything with a screen: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/design-check.mjs" --project .`. A missing or incomplete DESIGN.md, or
   colors with unreadable contrast, blocks shipping; fix it.
16. Size: `node "${CLAUDE_PLUGIN_ROOT}/scripts/scale-profile.mjs" --project . --check` (no profile blocks a first launch: set it with the owner).
   On the user's own computer: run `desktop-check.mjs` (see `/starter-kit:speed`); over budget blocks. Online: run `load-test.mjs` against a
   local copy seeded to the profile's size; BREAKS blocks; NOT REACHED does not block on its own, but for a large or very large profile
   say plainly that the host's staging copy must carry the target before launch, and that the owner runs or approves that test.

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
- Ship only when every applicable step is green AND security-reviewer returns APPROVE. Every numbered step above can block:
  1–5 and 8 must pass; 6 must APPROVE; 7 must have no FAIL; 9 must have nothing waiting; 10 and 11 must be complete for a first
  public launch; 12 must have no HIGH; 13 must be consistent and current; 14 must be within budget with no FAIL or HIGH; 15 must pass;
  16 must have a profile and no BREAKS or over-budget result.
  ADVICE, MEDIUM and `ACCEPTED` lines do not block, but list them for the owner. If anything fails, fix it and re-run the full sweep.

When — and only when — every applicable step is green and security-reviewer returned APPROVE, record it
so the push gate lets the push through: `git rev-parse HEAD > .claude/last-full-scan`. Never write that
file on a failing or partial run. If there are uncommitted changes, tell the user the scan covers only
the committed code at HEAD.
