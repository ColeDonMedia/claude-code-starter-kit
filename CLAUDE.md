# This repo
A Claude Code plugin marketplace containing one plugin, `starter-kit`, in `plugins/starter-kit/`.
It is a generic foundation for any project type — keep everything language-agnostic.

# Layout
- `.claude-plugin/marketplace.json` — marketplace manifest
- `plugins/starter-kit/.claude-plugin/plugin.json` — plugin manifest (bump `version` on every change)
- `plugins/starter-kit/agents/` — implementer (worktree-isolated), reviewer, security-reviewer, ui-reviewer (the reviewers are read-only)
- `plugins/starter-kit/commands/` — init, feature, tdd, review, full-scan
- `plugins/starter-kit/hooks/` — hooks.json + test-related.mjs (related-tests hook)

# Rules
- No project names, frameworks or package managers hard-coded in agents or commands; they read the project's CLAUDE.md.
- The CLAUDE.md template lives inside `commands/init.md` — edit it there.
- After changing the hook, test it by piping a sample payload: `echo '{"tool_input":{"file_path":"<file>"}}' | node plugins/starter-kit/hooks/test-related.mjs`
- Validate before committing: `claude plugin validate .`
