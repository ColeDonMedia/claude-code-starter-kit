---
description: Run one strict TDD cycle (red → green → refactor) for a single feature or fix.
---

Run ONE TDD cycle for: $ARGUMENTS

Use the test command from CLAUDE.md ("Commands"). If CLAUDE.md is missing or has no test command,
stop and suggest running `/starter-kit:init` first.

1. RED: write the failing test first. Run it. Show the output and confirm it FAILS for the right reason
   (the behavior is missing — not a typo or import error).
2. GREEN: write the minimum code to make it pass. Show the passing output.
3. REFACTOR: clean up without changing behavior. Re-run the tests.

Never delete or weaken a test to make it pass. If the change falls under the TDD exemptions in
CLAUDE.md, say so and skip RED. Do not move on to the next feature until this cycle is green.
