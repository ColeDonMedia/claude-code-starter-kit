---
description: Use when the user asks to build a new feature, add functionality, or fix a non-trivial bug (more than a few lines, or touching several files). Builds it in an isolated branch/worktree with a subagent, reviews it, then merges it into the main branch. Keeps the main conversation small.
---

Build this in isolation and merge it when it's proven: $ARGUMENTS

1. **Check first, here.** A git repository with a commit (else `git init`, a `.gitignore`, a first commit, and say so). A clean main
   checkout (commit your own finished, tested work; anything else: ask the user). A new app, or a large or vague request without
   acceptance criteria: `/starter-kit:spec` first. A big codebase not yet mapped: `/starter-kit:onboard` first. No "Commands" in
   CLAUDE.md: suggest `/starter-kit:init` and stop. MAIN is the current branch, BASE its tip (`git rev-parse HEAD`).
2. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/build-state.mjs" --project . --plan --feature "<the feature>"`.
3. **RUN IN conductor:** launch the `conductor` agent with the feature, MAIN, BASE and START or RESUME as printed, on the model and
   effort `node "${CLAUDE_PLUGIN_ROOT}/scripts/model-route.mjs" --project . --role conductor --feature "<the feature>"` prints. Then:
   MERGED: tell the owner in plain words what works and how to see it, run `/starter-kit:accept` if NEXT says a milestone finished,
   and carry on with the next roadmap item. NEEDS OWNER: ask the owner, then send the answer to the same conductor (a new one if it
   cannot be resumed). BLOCKED: tell the owner plainly, and where the work is. CANNOT DELEGATE, or the launch failed: step 4.
4. **RUN HERE:** read `${CLAUDE_PLUGIN_ROOT}/workflows/feature.md` and follow it in this conversation.
