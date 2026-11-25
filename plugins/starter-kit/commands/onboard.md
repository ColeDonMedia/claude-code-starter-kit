---
description: "Use the first time you work in an existing codebase that is big (thousands of files) or new to you, and before changing an area that has no rules file yet. Maps it area by area over several sessions, writes each area's rules, and changes no code."
---

Map this codebase before changing it: $ARGUMENTS

A big codebase cannot be read in one go, and changing what you don't understand is how things break. This builds understanding in
pieces that later sessions reuse. Change NO code while onboarding.

1. **Index it.** Run `node "<SCRIPTS>/code-index.mjs" --project .` (it is incremental, so re-running is cheap), then `--areas` and
   `--hubs` (the files most others depend on). If it reports more than about 2,000 files, add the line `Size: large` under CLAUDE.md's
   "Commands" section, so building and reviewing use scoped tests and impact checks. Say what the index does not cover (languages it
   didn't recognise, generated code).
2. **Keep a map of the map.** Create or update `AREAS.md`: one row per area (`| area | files | languages | status | rules file |`), status
   `not mapped`, `mapped <date>` or `no-go`. Areas that are generated, vendored, migrations history or build output are `no-go` (never edited
   by hand).
3. **Map one to three areas per session**, starting with the one the user's task touches, then the hubs. For each: read its entry points and
   its most-depended-on files (not every file), its tests, and a few recent commits (`git log --oneline -15 -- <area>`). Then write
   `<area>/CLAUDE.md` (Claude Code loads it automatically when working there), at most 40 lines:
   - what the area is for, and its entry points
   - conventions actually used here (naming, error handling, data access, how tests are written), each with one example file
   - how to test just this area (the exact command), and how long it takes
   - what depends on it (from `--impact` on its hub files) and what it must not break
   - traps: generated files, magic, slow or flaky tests, things that look unused but are not
   Write only what you saw in the code; mark guesses as guesses. Set the area's status in `AREAS.md`.
4. **Update the master records:** `PROJECT.md` gets a `## Map` (one line per area, pointing to its rules file) and the commands; a line
   per decision in `DECISIONS.md` if you settled anything. Commit the docs.
5. **Tell the user** in plain words: how big it is, what is mapped now, what is next, and anything risky you noticed. If their task's
   area is mapped, carry on with it (`/starter-kit:feature`); otherwise say how many more sessions mapping will take.
