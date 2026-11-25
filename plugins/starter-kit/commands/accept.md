---
description: Use when a roadmap milestone is finished and waiting for the owner's OK. Starts the app, tells the user exactly what to try, and records their verdict in their own words.
---

Get the owner's acceptance of a finished milestone: $ARGUMENTS

Nothing counts as accepted because the tests pass. The owner has to see it and say so. A milestone is a group of roadmap features
(`## Milestone N — name` in ROADMAP.md) with an `Accepted:` line.

1. **Find it.** Run `node "<SCRIPTS>/roadmap-check.mjs" --project . --acceptance` to see which finished milestone is waiting. If
   none is, say so and stop.
2. **Make it easy to try.** Start the app (the run command in CLAUDE.md) and give the user the way in (an address to open, a
   command, a file). If it can't be started here, say what is missing.
3. **Say exactly what to try**, in plain words and in order, taken from the acceptance criteria of that milestone's features:
   "Create an account. Sign out and back in. Save a recipe and find it in your list." Five to eight steps at most, each one a thing a
   non-programmer can do and see. Include what they should see if it works.
4. **Ask for a verdict:** works, or what's wrong or different from what they wanted. Wait for their answer.
5. **Record it.**
   - They are happy: set the milestone's line to `Accepted: yes (<today's date>) — owner said: "<their own words, shortened if long>"`.
     Quote them truthfully; never write an acceptance they did not give. Commit it.
   - They want changes: add each as an unticked feature under the milestone (so it can't be accepted until built), write what they said
     in `HANDOFF.md`, and carry on with `/starter-kit:feature`. Ask again when the changes are done.
   - If a change alters what the project is for, update the plan and tell them what it adds or delays.
5. Before any launch the check `roadmap-check.mjs --acceptance` must report nothing waiting.
