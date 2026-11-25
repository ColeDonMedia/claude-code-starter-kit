---
description: "Use when the user asks where things stand (status, progress, how far along, what's next, a report). Gives a plain-words status built from the project's own records and git history."
---

Report the project's status to the user in plain words: $ARGUMENTS

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs" --project .` and read what it prints. Every line comes from the project's files and git
   history; don't add anything it didn't say, and don't hide a warning it printed.
2. Tell the user, briefly and in everyday words: how far along it is, what is being built next, how long the rest might take
   (say it is a rough guess), the biggest risks, whether the success measures are on track if you can see data for them, and
   exactly what you need from them (answers, a milestone to try). Put "what I need from you" last and make it concrete.
3. If a warning says roadmap ticks lack proof or the handoff doesn't match, say so plainly and offer to fix it now.
4. If a milestone is finished and waiting for the user's OK, offer to run it through acceptance now.
