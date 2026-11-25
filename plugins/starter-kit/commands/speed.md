---
description: "Use when anything feels slow, laggy or heavy, when the user says make it faster or snappier, when a page, screen or request is slow, or before a launch. Measures first, then fixes the biggest cause at each level (page, browser, server, database, delivery), and proves the numbers improved."
---

Make this fast, and prove it: $ARGUMENTS

Speed is measured, never guessed: a change that was not timed before and after is not an optimisation. Work from the biggest cost down
and stop when the budget is met. Over-tuning costs more than it saves.

1. **Know the target.** Read `.claude/speed.json` (create it with `node "<SCRIPTS>/speed-check.mjs" --project . --init`). The defaults mean
   "on a mid-range phone on slow 4G: main content in 2.5 s, no jumping, taps answer in 100 ms". Tighten them for the pages and actions that
   matter most (sign-in, the core action). If the user named something that feels slow, put exactly that page or action in the budget.
2. **Measure, in a real browser.** Run the speed test (`CLAUDE.md` names it; `e2e/speed.spec.js`), then
   `node "<SCRIPTS>/speed-check.mjs" --project .`. It names which measure is over and what usually fixes it. No browser test set up yet:
   run `/starter-kit:init`'s browser step first, or say plainly that you could only measure the build (`perf-budget.mjs`, `delivery-check.mjs`).
3. **Find the cause at the right level**, in this order, because each level hides the next:
   - **Delivery:** `node "<SCRIPTS>/delivery-check.mjs" --dir <build folder> --project .` (blocking scripts, unsized images, nothing lazy,
     giant images, fonts, caching, compression) and `perf-budget.mjs` (bundle size). Cheapest fixes, often the biggest win.
   - **Browser work:** long tasks and big bundles: split code by page, load heavy parts on demand, remove libraries for one function, avoid
     re-rendering everything on each change, never block the first paint on data the user doesn't see yet.
   - **Server and API:** `node "<SCRIPTS>/api-check.mjs" --project .` (queries in loops, unbounded lists), then time the slow endpoint and count
     its queries. Add caching only for what is read far more than written, with a clear way to expire it.
   - **Database:** `/starter-kit:db`'s rehearsal at real volume (`db-rehearse.mjs --explain`): missing indexes, full scans, sorts without an index.
   - **Slow work in the user's way:** email, reports, image processing, third-party calls: move them to a background job and answer immediately.
4. **Make it feel fast too.** Real time and felt time differ: show a skeleton or the old data at once instead of a blank screen, change the
   button the moment it is tapped, save optimistically and fix up if the server disagrees, keep layout from shifting, and prefetch what the
   next tap will need. These cost little and often matter more than shaving 100 ms off a request.
5. **Fix one cause at a time, then re-measure.** Keep the change only if the number improved; record before and after in `PROJECT.md`
   under `## Performance` (page or endpoint, measure, before, after, what changed). Add a test that fails if it regresses (a query-count
   assertion, a size budget, the speed test itself).
6. **Report in plain words:** what was slow, what it was caused by, what changed, the numbers before and after, and what is still over
   budget and why. Say that these are lab numbers on a developer's computer: real phones and networks will differ, and real-user timing
   after launch is the final check.
