---
description: Use when a roadmap milestone is finished and waiting for the owner's OK. Starts the app, tells the user exactly what to try, and records their verdict in their own words.
---

Get the owner's acceptance of a finished milestone: $ARGUMENTS

Nothing counts as accepted because the tests pass. The owner has to see it and say so. A milestone is a group of roadmap features
(`## Milestone N — name` in ROADMAP.md) with an `Accepted:` line.

1. **Find it.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/roadmap-check.mjs" --project . --acceptance` to see which finished milestone is waiting. If
   none is, say so and stop.
2. **Check it against the approved plan.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/milestone-gaps.mjs" --project . --milestone <N>`.
   It compares the milestone with ROADMAP.md as first committed and lists DROPPED (an approved feature or criterion gone or
   reworded), SKIPPED (a cited test that never runs), SHARED (one test cited for several criteria) and MANUAL (a high-risk
   criterion checked only by hand). If it lists any, launch the `challenger` in milestone mode with the model and effort
   `model-route.mjs --project . --role challenger --mode milestone` prints, giving it only that list and the milestone's lines, and asking per item: DROPPED, is the approved promise gone, or only
   reworded and still tested, and is there an owner decision for it in `DECISIONS.md`? SKIPPED, does the test really never run?
   SHARED, does that one test check each criterion it is cited for? MANUAL, should a test prove it?
   Each gap it confirms: a DROPPED item with no owner decision in `DECISIONS.md` goes to the owner in step 6 as a question; any
   other becomes an unticked fix under the milestone, built with `/starter-kit:feature` before going on.
3. **A first-time user tries it before the owner does.** In a project with a browser UI and an "End-to-end (browser) tests"
   command (unless `.claude/kit.json` has `{ "userTester": false }`), run
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/model-route.mjs" --project . --role user-tester` and launch the starter-kit `user-tester`
   agent with that model and effort. Give it the milestone's name and its features' acceptance criteria, copied from ROADMAP.md,
   and nothing about how they were built. It writes a test per journey on its own branch.
   - Anything **Broken**: do not ask the owner yet. Add each as an unticked fix under the milestone naming the failing test and the
     tester's BRANCH (the builder starts by merging that branch, so the failing test comes along), run `/starter-kit:feature` for
     each, then run this command again.
   - All journeys worked: if `git diff --name-only <main>...<BRANCH>` lists only files under `e2e/journeys/`, run the browser
     tests on that branch, then `git merge --no-ff <BRANCH>` so the journeys keep guarding the app. Otherwise leave it unmerged and
     say so. Take its **Confusing** list to the owner in step 5 as things to look at.
   - It reports NOT RUN LIVE: say so in one line and carry on; the owner's try-out is then the only one.
4. **Make it easy to try.** Start the app (the run command in CLAUDE.md) and give the user the way in (an address to open, a
   command, a file). If it can't be started here, say what is missing.
5. **Say exactly what to try**, in plain words and in order, taken from the acceptance criteria of that milestone's features:
   "Create an account. Sign out and back in. Save a recipe and find it in your list." Five to eight steps at most, each one a thing a
   non-programmer can do and see. Include what they should see if it works, and one line on what the user tester already walked.
6. **Ask for a verdict:** works, or what's wrong or different from what they wanted. For anything with a screen also ask:
   "Which screen feels least like the apps you like, and what feels off?" Taste is theirs: write their answer into
   `DESIGN.md` (References or a "Never" list) so every later screen follows it. Wait for their answer.
   Before asking, do the accessibility checks a person must do yourself on this milestone's screens (`node "${CLAUDE_PLUGIN_ROOT}/scripts/a11y-check.mjs" --manual`
   lists them): keyboard only, 200% zoom, 320 px wide, reduce motion, error messages, sign-in. Tell the owner in one line what you
   checked, and ask them to try one thing themselves: use the new screens with the keyboard only (Tab, Enter, Space, arrow keys).
7. **Record it.**
   - They are happy: set the milestone's line to `Accepted: yes (<today's date>) — owner said: "<their own words, shortened if long>"`.
     Quote them truthfully; never write an acceptance they did not give. Commit it.
   - They want changes: add each as an unticked feature under the milestone (so it can't be accepted until built), write what they said
     in `HANDOFF.md`, and carry on with `/starter-kit:feature`. Ask again when the changes are done.
   - If a change alters what the project is for, update the plan and tell them what it adds or delays.
8. Before any launch the check `roadmap-check.mjs --acceptance` must report nothing waiting.
