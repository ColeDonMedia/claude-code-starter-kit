# Quality: tests, reviews and people trying to break it

[← Back to the README](../README.md) · [All documentation](README.md)

## Test first, every time

- Features are built test-first: one failing test per acceptance criterion, then the code, then a tidy-up. A test is never deleted
  or weakened to make it pass.
- Each feature is built in its own branch and folder by the `implementer` agent, then merged only when the full suite is green
  and the reviewers approve.
- `tdd` runs one red → green → refactor cycle for a small change in the current conversation.

## Reviewers

| Reviewer | What it checks |
|---|---|
| `reviewer` | Correctness, edge cases and regressions; finds the real test behind every acceptance criterion; checks what the change could break beyond the diff. Read-only. |
| `ui-reviewer` | Looks at the running app and its screenshots at phone and desktop size; scores each screen against `DESIGN.md`; checks accessibility. Read-only. |
| `security-reviewer` | Hardening review of risky features and before shipping; a launch-readiness checklist for the first launch. Read-only, runs on Opus. |
| `challenger` | Assumes the work is NOT done and tries to prove it: claims without evidence, tests that couldn't fail, missing cases, collateral damage. Must show what it tried; "does not hold up" blocks the merge. Before you approve a plan, it also checks the plan itself (on Opus): criteria no test could prove, features in the wrong order, sizes that look wrong, promises no roadmap item delivers. Read-only. |
| `investigator` | Reproduces a bug and finds its root cause with `file:line` evidence, outside the main conversation, so logs and long searches never fill it. Read-only. |

Which model each one runs on is decided by one script from the feature's size and risk: see [Which model does what](how-it-works.md#which-model-does-what).

## Real-browser tests and screenshots

- For apps with a screen, setup installs Playwright and creates end-to-end tests that open the running app and click through it at
  phone (375 px) and desktop (1280 px) sizes. Every feature a person can see gets one.
- Each test saves screenshots, and the UI reviewer opens the images and judges what a person would actually see, state by state.
- Before the browser download (several hundred MB), `scripts/disk-free.mjs` checks the drive has room.

## Adversarial review

- **The red team** (`red-team` agent, `/starter-kit:redteam`) attacks a local copy of the app like a hostile user: reading other
  users' data, bypassing sign-in, injecting input, abusing prices and business rules, bad uploads, leaks, and tricking any AI model
  the app uses. Each confirmed break gets a failing test that stays in the project. It runs on high-risk features and before the
  first launch, and only ever attacks this computer: attack tools aimed anywhere else are refused.
- **Mutation testing** (`scripts/mutate.mjs`) deliberately breaks the code one small mistake at a time (flips a comparison, swaps
  `&&` and `||`) and checks the tests notice. A change the tests don't notice is behaviour nobody checks. It never touches your
  main folder.
- **The kit attacks itself.** Fuzz tests throw hundreds of disguised attacks at the guards and the secret scanner (quote tricks,
  nested shells, encoded payloads, download-then-run, PowerShell tricks, a dozen key formats), alongside harmless look-alikes that
  must not be blocked. The first run found 63 real gaps; every new disguise is added there first.

Limits: a red team only finds what it is clever enough to try, cannot test third-party services, and does not replace a
professional penetration test for an app that holds payments or sensitive data.
