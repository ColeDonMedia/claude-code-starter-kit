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
- `plugins/starter-kit/commands/` — init, feature, tdd, review, full-scan
- `plugins/starter-kit/hooks/` — hooks.json + test-related.mjs (related-tests hook)

# Rules
- No project names, frameworks or package managers hard-coded in agents or commands; they read the project's CLAUDE.md.
- The CLAUDE.md template lives inside `commands/init.md` — edit it there.
- After changing the hook, run its tests: `node --test plugins/starter-kit/hooks/test-related.test.mjs` (add a test for every bug you fix).
- Validate before committing: `claude plugin validate .`
