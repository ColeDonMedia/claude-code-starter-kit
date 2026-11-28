# Screens

A rule sheet for the builder, read only when the work touches this area (so other features don't carry it). Read it before building or changing anything a person sees.
Follow all of it; where a rule is wrong for this project, say so in your report with the reason instead of working around it.

For anything with a screen: follow `DESIGN.md` if the project has one (colors, type, spacing, components);
build every state, not just the happy one (empty, loading, error, success); make it work at phone width
(about 375px) and desktop. Accessible by default (WCAG 2.2 AA): real elements for what they are (button, link, label,
heading, list) before ARIA; every field has a visible label and errors in text that say how to fix them; everything works by
keyboard with a visible focus ring that sticky headers never cover; tap targets at least 24 px (44 on touch); text 4.5:1 and
control borders and focus rings 3:1 (DESIGN.md's `input-border` and `focus` colours); layouts reflow at 320 px and survive 200%
zoom; animation respects "reduce motion"; anything dragged can also be done with taps; nothing asked twice in one flow; sign-in
allows paste and password managers. If CLAUDE.md names an `Accessibility test:`, run it and
`node "${CLAUDE_PLUGIN_ROOT}/scripts/a11y-check.mjs" --project .` before reporting, and fix every BLOCKING line.

If CLAUDE.md lists an "End-to-end (browser) tests" command, every feature a user can see or click gets an end-to-end test for
its user-facing criteria: the test opens the running app, does what a person would do, and checks what they would see,
at the phone (375 px) and desktop (1280 px) sizes. Map the criterion to it as `→ test: e2e/<file>::<test name>`.
UI checklist: before building a screen, read `node "${CLAUDE_PLUGIN_ROOT}/scripts/ui-check.mjs" --manual --parts <its parts>` (the
parts are in `.claude/ui.json`'s `screens`; add the screen there if missing, with its path, name, parts and the plan's expected
number of items) and build so every [BLOCKS] item is a yes. In the browser tests import `test` and `expect` from
`./ui-checkpoint.js` (copy `${CLAUDE_PLUGIN_ROOT}/templates/ui-checkpoint.js` to `e2e/` unchanged if it is missing or `ui-check.mjs`
says it is old) and call `await checkpoint(page, testInfo, "<state>")` at EVERY state a person can see (empty, loading, error,
success, each popup or menu open, a half-filled form, not found); with a popup open, end with `await checkEscape(page, testInfo,
"<state>")`. The checkpoint saves the screenshot for the reviewers (`.claude/screens/`) and measures the screen. Then run the tests
a second time with `UI_DATA=stress`, where the app's test data uses the checkpoint's `STRESS` values (the longest name, a long
unbroken word, 0, 1 and 300 items, a huge number, a missing picture). Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/ui-check.mjs" --project .`
and fix every BLOCKING line before reporting; list its Later lines in your report. If a measured finding is wrong for this screen,
say so with the reason instead of working around the check. If CLAUDE.md names a "Speed budget", run
`node "${CLAUDE_PLUGIN_ROOT}/scripts/perf-budget.mjs" --dir <build folder>` after building and fix anything over budget before reporting.
