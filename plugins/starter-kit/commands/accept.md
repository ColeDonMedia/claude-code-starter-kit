---
description: Use when a roadmap milestone is finished and waiting for the owner's OK. Starts the app, tells the user exactly what to try, and records their verdict in their own words.
---

Get the owner's acceptance of a finished milestone: $ARGUMENTS

Nothing counts as accepted because the tests pass. The owner has to see it and say so. A milestone is a group of roadmap features
(`## Milestone N — name` in ROADMAP.md) with an `Accepted:` line.

1. **Find it.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/roadmap-check.mjs" --project . --acceptance` to see which finished milestone is waiting. If
   none is, say so and stop.
2. **Make it easy to try.** Start the app (the run command in CLAUDE.md) and give the user the way in (an address to open, a
   command, a file). If it can't be started here, say what is missing.
3. **Say exactly what to try**, in plain words and in order, taken from the acceptance criteria of that milestone's features:
   "Create an account. Sign out and back in. Save a recipe and find it in your list." Five to eight steps at most, each one a thing a
   non-programmer can do and see. Include what they should see if it works.
4. **Ask for a verdict:** works, or what's wrong or different from what they wanted. For anything with a screen also ask:
   "Which screen feels least like the apps you like, and what feels off?" Taste is theirs: write their answer into
   `DESIGN.md` (References or a "Never" list) so every later screen follows it. Wait for their answer.
   Before asking, do the accessibility checks a person must do yourself on this milestone's screens (`node "${CLAUDE_PLUGIN_ROOT}/scripts/a11y-check.mjs" --manual`
   lists them): keyboard only, 200% zoom, 320 px wide, reduce motion, error messages, sign-in. Tell the owner in one line what you
   checked, and ask them to try one thing themselves: use the new screens with the keyboard only (Tab, Enter, Space, arrow keys).
5. **Record it.**
   - They are happy: set the milestone's line to `Accepted: yes (<today's date>) — owner said: "<their own words, shortened if long>"`.
     Quote them truthfully; never write an acceptance they did not give. Commit it.
   - They want changes: add each as an unticked feature under the milestone (so it can't be accepted until built), write what they said
     in `HANDOFF.md`, and carry on with `/starter-kit:feature`. Ask again when the changes are done.
   - If a change alters what the project is for, update the plan and tell them what it adds or delays.
5. Before any launch the check `roadmap-check.mjs --acceptance` must report nothing waiting.
