# Taking over an app that is already partly built

Read by `/starter-kit:spec` only when the project has code but no `ROADMAP.md`, or the owner says "finish / continue / pick up
this app". Never start over and never re-plan what exists.

## Scope
- **Job:** turn an app that is already partly built into a plan whose first milestone is what already works.
- **Starts when:** planning finds code but no `ROADMAP.md`, or the owner asks to finish or continue an existing app.
- **May:** map the code, run its tests, type checks and build, open it in a browser, write Milestone 0 into `ROADMAP.md`.
- **Must not:** re-plan or rebuild what works, tick anything without proof, mark work built later as "existing", or change the stack.
- **Done when:** every existing feature is either ticked with proof under Milestone 0 or listed as broken or unproven.
- **Hands back:** what works, what is broken or untested, and what is left, for the plan.

1. **Map it.** Big or unfamiliar: run `/starter-kit:onboard` first. Then list what the app does today from its screens, routes,
   data tables and commits, and run its tests, type checks and build. Run
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/dup-check.mjs" --project .` over the whole project: every number or rule worked out in more
   than one place becomes a "make it one" roadmap item, and goes into PROJECT.md's `## One source` list once it is.
2. **Check each existing feature** by its tests, or by opening it in the running app. Write it into `ROADMAP.md` under
   `## Milestone 0 — what already works` (`Accepted: pending`) as `- [x] Name — goal (existing <current commit>)`, with one
   criterion per thing it does and `→ test:` or `→ manual:` proof for each, exactly as for new work. `roadmap-check.mjs` accepts
   "existing" only under Milestone 0 and only for a commit from before the roadmap was first committed. A feature that is there but
   broken or unproven stays unticked with what is wrong, and becomes the first work.
3. **Ask only about what is left**, in one message, with defaults taken from the code ("it has invoices and clients; next: payments
   and reminders?"). Don't ask what the code already answers (stack, look, who signs in). Keep the existing stack and `DESIGN.md`
   (if there is none, write one from the screens that exist); no recipe applies. Write the stack guidelines
   (`stack-guides.mjs --write --project .`).
4. **Research only the new parts.** Run the market check only if the app is meant to sell and hasn't launched, or the owner asks.
5. Then continue planning from step 5 (compare with the code). The plan says what was found working, what is broken or untested,
   and what is left. `/starter-kit:accept` on Milestone 0 lets the owner confirm the starting point.
