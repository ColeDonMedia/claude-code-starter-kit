# This repo
A Claude Code plugin marketplace containing one plugin, `starter-kit`, in `plugins/starter-kit/`.
It is a generic foundation for any project type — keep everything language-agnostic.

# PUBLIC REPO — NO PRIVATE DETAILS
This repository is public. Anything committed here is visible to everyone, forever (git history keeps it).
Never add: names, emails, usernames, company or client names, file paths from a personal computer,
API keys, tokens, passwords, `.env` contents, project-specific code or business details, or anything
copied from a private project. Keep every file generic. Before each commit, run
`git diff --cached` and read it for anything personal. If something private is committed by mistake,
tell the user right away — deleting it in a later commit does not remove it from history.

# Layout
- `.claude-plugin/marketplace.json` — marketplace manifest
- `plugins/starter-kit/.claude-plugin/plugin.json` — plugin manifest (bump `version` on every change)
- `plugins/starter-kit/agents/` — implementer (worktree-isolated), reviewer, security-reviewer, ui-reviewer (the reviewers are read-only)
- `plugins/starter-kit/scripts/vet-scan.mjs` — static scanner behind /vet (read-only, never executes scanned code)
- `plugins/starter-kit/commands/` — init, spec, research, vet, debug, feature, tdd, review, full-scan (every command description is loaded each session: keep them to one or two sentences)
- `VETTED.md` records every third-party repo that was vetted (with pinned commits); update it whenever you vet another.
- Third-party skills are never copied in; list vetted ones under "Recommended add-ons" in the README instead.
- `plugins/starter-kit/hooks/` — hooks.json; test-related.mjs (related tests after edits), session-start.mjs (nudge to run init, or lean-mode token-saving rules in set-up projects; keep everything it injects under 400 words), push-gate.mjs (blocks `git push` until /full-scan passed), safety-guard.mjs (blocks or asks before destructive shell commands)
- `.claude/kit.json` — turns the automatic hooks off for this repo itself (it is not a managed project)

# Rules
- No project names, frameworks or package managers hard-coded in agents or commands; they read the project's CLAUDE.md.
- The CLAUDE.md template lives inside `commands/init.md` — edit it there.
- After changing a hook, run its tests: `node --test plugins/starter-kit/hooks/test-related.test.mjs plugins/starter-kit/hooks/auto.test.mjs plugins/starter-kit/hooks/safety-guard.test.mjs plugins/starter-kit/scripts/vet-scan.test.mjs` (add a test for every bug you fix). The routing text in `session-start.mjs` is how Claude learns which command to run; any new command must be added there.
- Validate before committing: `claude plugin validate .`
