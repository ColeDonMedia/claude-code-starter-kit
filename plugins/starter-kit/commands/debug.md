---
description: Use for a bug, error message, crash or failing test whose cause isn't obvious. Finds the root cause with evidence before changing code, then fixes it with a regression test.
---

Find and fix the root cause of: $ARGUMENTS

The rule: no fix until you can explain WHY it fails, with evidence. Guessing and patching symptoms is how
bugs come back.

## 1. Reproduce
Get the exact failure: the full error and stack trace, the command or steps that trigger it, and whether it
happens every time. Run it yourself and quote the output. If you can't reproduce it, say so and ask for what
you need (a log, input data, versions) instead of guessing.

## 2. Pin it down with a test
Write the smallest failing test that captures the bug (see CLAUDE.md for the test command). A failing
test is the proof the bug exists and the proof it's fixed. If a test truly isn't possible (a visual or
environment problem), write down the exact manual check instead.

## 3. Isolate
Narrow where it goes wrong: read the code on the failing path, check recent changes (`git log -p`,
`git bisect` when it used to work), add temporary logging at the boundaries, remove variables one at a
time. Compare a working case with the failing one.

## 4. Hypotheses, one at a time
List 2–4 possible causes, most likely first, each with how you'd confirm or rule it out. Test ONE at a
time with a quick experiment and record the result. Never change two things at once.
If three hypotheses in a row are wrong, stop: report what you've ruled out and what you now suspect, and
ask the user, instead of trying a fourth guess.

## 5. Fix the cause, not the symptom
State the root cause in one or two sentences, backed by the evidence from step 3 or 4. Make the smallest
change that removes it. Don't weaken or delete tests, add blanket try/catch, or special-case the failing
input. Check whether the same mistake exists elsewhere (`grep` for the same pattern) and fix or report those.

## 6. Prove it
Run the regression test (it must now pass), then the full suite, typecheck and lint. Remove temporary
logging. Report in a few lines: root cause, the fix, the test added, and the evidence it's resolved. If the
fix is large or touches many files, hand it to `/starter-kit:feature` with the root-cause findings as the brief.
