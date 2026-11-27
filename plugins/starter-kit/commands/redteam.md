---
description: Use when the user asks to try to break, hack, red-team or pen-test the app, or before a first launch. Attacks a LOCAL copy like a hostile user, writes a failing test for every break found, and checks whether the tests would catch broken code.
---

Red-team this project and report in plain words: $ARGUMENTS

## Scope
- **Job:** attack a LOCAL copy like a hostile user and prove every break with a failing test.
- **Starts when:** the owner asks to break, hack or pen-test the app, or before a first launch with sign-in, payments or personal data.
- **May:** run the app locally, launch the red team in its own copy, run the tests and the mutation check.
- **Must not:** point anything at a deployed site, a real service, real accounts or real data, or fix what it finds in the same run.
- **Done when:** every attack tried is listed with its result, and every break has a failing test.
- **Hands back:** the breaks, most serious first, and the fixes to schedule.

Attacks only ever run against this computer: a guard hook denies attack tools aimed at anything else. Never point
anything at a deployed site, a real service, real accounts or real data.

## 1. Get ready
- Read `CLAUDE.md` for how to install, run and test the app, and `PROJECT.md` / `ROADMAP.md` for what it does and
  which features are `high-risk`. If there is no way to run it locally, say so and run the code-level mode in step 2.
- Check the working tree is clean (the red team works in its own copy, but start from known state).

## 2. Attack
Launch the starter-kit `red-team` agent (it works in its own worktree). Give it the run command, the main
features and routes, the security acceptance criteria, and where to focus. For anything beyond a small app, launch two or
three in parallel on separate areas (sign-in and data access; input and uploads; business logic and any AI-model
features), each told to use a different localhost port. Pass the `model` and `effort` that
`node "${CLAUDE_PLUGIN_ROOT}/scripts/model-route.mjs" --project . --role red-team` prints. If `--role scout` prints SCOUT USE, give
each attacker the `scout` agent's list of entry points with "this list may be incomplete: find what it missed".
Each confirmed break comes back with a failing test on its branch and the exact request that proves it.

## 3. Check the tests themselves (mutation testing)
Create a separate worktree for the current code (`git worktree add`), install dependencies there, then run
`node "${CLAUDE_PLUGIN_ROOT}/scripts/mutate.mjs" --project <that worktree> --test "<the project's test command>" --diff <base>` where `<base>` is
the last release or first commit. It breaks the code in small ways, one at a time, and reports every change the tests
did NOT notice (each is behavior no test checks). Remove the worktree afterwards. A score below about 70% on
the main logic means the tests are too weak to trust: say so.

## 4. Argue against "done"
Launch the `challenger` agent on the whole feature set (brief: the roadmap's acceptance criteria and ticked items;
worktree: the red team's or a fresh one), on the model `model-route.mjs --role challenger` prints. It must show what it tried
even when it finds nothing.

## 5. Deal with what was found
- Rank everything: critical and high (a stranger can read or change other people's data, take over accounts, run
  code, spend money, or take the site down) versus medium and low.
- For critical and high: offer to fix them now, one at a time with `/starter-kit:feature`, using the red-team's failing
  test as the acceptance criterion (the test must pass afterwards and is kept in the project as a permanent
  regression test). For the weak spots mutation testing found: add tests that fail when that line is wrong.
- Record it in `PROJECT.md` ("Known problems" until fixed), and add a line to `CHANGELOG.md` and `HANDOFF.md`.

## 6. Report — plain words, short
- **Verdict** in one line: safe to launch / fix first / stop and fix now.
- **What broke** (each: what a stranger could do, in everyday words; how bad; the test that proves it).
- **What held up**, so the user knows the coverage, and **what could not be tested** and why.
- **How good the tests are** (the mutation score, and the weakest areas).
- Say plainly that a red team lowers risk but cannot prove an app is secure, and that apps handling payments or
  sensitive data deserve a professional penetration test before launch.
