---
description: "Use after a trial build, or when the kit seemed to skip a step, do something odd, or stall. Reads the local flight recorder for what the kit actually did, compares it with what should have happened, and turns every gap into a fix or a written note."
---

Review how the kit behaved in a session and turn the gaps into fixes: $ARGUMENTS

## Scope
- **Job:** review how the kit itself behaved in a session and turn every gap into a fix or a written note.
- **Starts when:** after a trial build, or when the kit skipped a step, did something odd or stalled.
- **May:** run doctor, the canary and the flight report; read the kit's files; in the kit's own repository, fix bugs test-first.
- **Must not:** change the kit from any other project (write `KIT-FEEDBACK.md` instead), or judge output quality the log cannot show.
- **Done when:** every gap is explained as a kit bug, a too-strict guard, an unclear instruction or correct behaviour, and fixed or written down.
- **Hands back:** what went right, what went wrong, what was fixed or noted, and what the log could not tell.

The flight recorder keeps a private log of names only (which workflows and agents ran, which actions were blocked or never
finished). It holds no code, prompts or secrets and lives outside the project. Nothing here sends anything anywhere.

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/doctor.mjs" --project .` (is the kit able to run here at all?), then run the shell command
   `starter-kit-canary` with each shell tool you have: it must be blocked with "canary ok". If either fails, that is the first finding.
   Then run `node "${CLAUDE_PLUGIN_ROOT}/scripts/flight-report.mjs" --project .` (add `--all` to include earlier sessions). Read it as it is,
   including its usage lines (tokens per model, shortened output, rewrites). Run `doctor.mjs --project . --plugins` too, and tell the
   owner which other plugins load into every session here.
2. Compare with what should have happened for what the user asked: a new app should show spec, then feature runs with the implementer,
   reviewer and challenger agents, then accept at each milestone and full-scan before any push. Anything else is a gap.
3. For each gap and each action that was blocked or never finished, find out why: read the relevant command, hook or guard.
   Decide which it is: a kit bug, a guard that is too strict, an instruction that is unclear, or correct behaviour.
4. If this is the starter kit's own repository: fix each kit bug with a test first, then follow the release steps in CLAUDE.md. In any
   other project: don't change the kit; write the gaps as a short list in plain words (what happened, what should have happened, the
   likely cause) in `KIT-FEEDBACK.md` so it can be fixed later, and tell the user it exists.
5. Tell the user in plain words: what went right, what went wrong, what you fixed or wrote down, and what you could not tell from the log.
   The log shows what ran, not whether the result was good, so say if the quality of the output still needs the user's eyes.
