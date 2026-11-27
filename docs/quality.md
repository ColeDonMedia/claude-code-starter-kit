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
| `ui-reviewer` | Looks at the running app and its screenshots at phone and desktop size; scores each screen against `DESIGN.md`; checks accessibility; goes through the UI checklist for every changed screen (below). Read-only. |
| `security-reviewer` | Hardening review of risky features and before shipping; a launch-readiness checklist for the first launch. Read-only, runs on Opus. |
| `challenger` | Assumes the work is NOT done and tries to prove it: claims without evidence, tests that couldn't fail, missing cases, collateral damage. Must show what it tried; its BLOCKS findings hold the merge, LATER ones go to "Harden before launch". Before you approve a plan, it also checks the plan itself (on Opus): criteria no test could prove, features in the wrong order, sizes that look wrong, promises no roadmap item delivers. When a milestone is finished, it judges the leads from `milestone-gaps.mjs`: approved promises dropped or reworded since the plan, tests that never run, one test standing in for several criteria, high-risk criteria checked only by hand. (The same script runs on each feature as it is recorded.) Read-only. |
| `investigator` | Reproduces a bug and finds its root cause with `file:line` evidence, outside the main conversation, so logs and long searches never fill it. Read-only. |

Which model each one runs on is decided by one script from the feature's size and risk: see [Which model does what](how-it-works.md#which-model-does-what).

## Real-browser tests and screenshots

- For apps with a screen, setup installs Playwright and creates end-to-end tests that open the running app and click through it at
  phone (375 px) and desktop (1280 px) sizes. Every feature a person can see gets one.
- Each test saves screenshots, and the UI reviewer opens the images and judges what a person would actually see, state by state.
- Before the browser download (several hundred MB), `scripts/disk-free.mjs` checks the drive has room.

## The UI checklist

What a careful agency checks on every screen, in `scripts/ui-checklist.mjs`: 83 questions grouped by the parts a screen has (every
screen, buttons and links, lists and tables, detail pages, forms, popups and menus, messages, states, safety, phone, account
screens, navigation), plus an 8-question whole-app sweep for each milestone and an 8-question polish list for launch. Examples: does this inner page have a
way back; does this popup have an X and close on Escape; with the plan's 500 invoices, can a person search, filter, sort and page;
do two buttons do the same job; does any button label wrap onto two lines; is anything typed lost after a failed save. Each item
either holds the merge (a dead end, a popup you can't close, lost input) or goes to "Harden before launch", and points at the
matching rules in the kit's bundled UX library.

It works in five places:
- **The plan** lists every screen, its popups, and how many items each list will really hold (`.claude/ui.json`), so "does this need
  search?" is judged against real numbers, not three rows of test data.
- **The builder** reads the items for the parts it is building, calls `checkpoint()` from `e2e/ui-checkpoint.js` at every state in
  its browser tests (empty, loading, error, success, each popup open), runs them again with stress data (the longest name, a long
  unbroken word, 0, 1 and 300 items, a huge number), and fixes everything `ui-check.mjs` blocks.
- **The UI reviewer** reads the measurements, then answers every item for each changed screen with yes, no or not applicable and
  the evidence. These hold the merge on every look; only taste is limited to two rounds.
- **Milestone acceptance** runs the sweep across all screens (the same action named two ways, mixed date formats, Cancel on
  different sides, pages sharing a title) before you are asked to try it.
- **Launch** checks the finishing touches: the tab icon, page descriptions, link previews, and real "not found" and "something went
  wrong" pages.

The checkpoint and judge measure more than 40 things in the real browser: text that wraps or is cut off, controls that are covered, off-screen,
too small, crowded, unnamed or duplicated, links to nowhere, visible "undefined", "NaN" or "Lorem ipsum", broken or stretched
images, tiny text, text boxes that make iPhones zoom, too many font sizes, popups with no close, no title, too tall or stacked,
popups Escape leaves open, long lists with no search or paging, tables with no sort or left-aligned numbers, inner pages with no way
back, console and page errors, and serious accessibility failures in every state, not only on page load. A deliberate exception
(no search on a five-item settings list) is written once in `.claude/ui.json` with the reason and who decided, and not raised again.
Measurement finds roughly half of real problems; the by-eye answers cover the rest.

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
