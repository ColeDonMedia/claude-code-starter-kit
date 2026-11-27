---
description: Use for small code changes made directly in this conversation (a few lines, one file). Runs one strict TDD cycle (red → green → refactor) for a single fix or tweak.
---

Run ONE TDD cycle for: $ARGUMENTS

## Scope
- **Job:** one strict red, green, refactor cycle for a small change in this conversation.
- **Starts when:** a change of a few lines in one file.
- **May:** write one failing test, the least code to pass it, then tidy.
- **Must not:** write code before a failing test, touch other features, weaken a test, or grow into a bigger change (use a feature build).
- **Done when:** the new test failed for the right reason, now passes, and the full suite passes.
- **Hands back:** the failing and passing output, and the change.

Use the test command from CLAUDE.md ("Commands"). If CLAUDE.md is missing or has no test command,
stop and suggest running `/starter-kit:init` first.

1. RED: write the failing test first. Run it. Show the output and confirm it FAILS for the right reason
   (the behavior is missing — not a typo or import error).
2. GREEN: write the minimum code to make it pass, changing existing files with small edits rather than rewriting them. Show the
   passing output.
3. REFACTOR: clean up without changing behavior. Re-run the tests.

When it's green and reviewed, commit it locally with a clear message (never push unless asked), then keep the
records true in a second small commit: one plain-words line in `CHANGELOG.md` with the commit id, a touch-up of
`PROJECT.md` if what exists or a decision changed, and `HANDOFF.md` rewritten for the next session with its
`Covers-through:` line set to the newest code commit (`git log -1 --format=%H -- . ':(exclude)*.md' ':(exclude).claude'`).
Say only what was really done.

Never delete or weaken a test to make it pass. If the change falls under the TDD exemptions in
CLAUDE.md, say so and skip RED. Do not move on to the next feature until this cycle is green.
