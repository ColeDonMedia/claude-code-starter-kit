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
- `plugins/starter-kit/agents/` — implementer (worktree-isolated), researcher (web reading, read-only), reviewer, security-reviewer, ui-reviewer (the reviewers are read-only)
- `plugins/starter-kit/scripts/vet-scan.mjs` — static scanner behind /vet (read-only, never executes scanned code)
- `plugins/starter-kit/commands/` — init, spec, research, vet, debug, audit, feature, tdd, review, full-scan (every command description is loaded each session: keep them to one or two sentences)
- `VETTED.md` records every third-party repo that was vetted (with pinned commits); update it whenever you vet another.
- Third-party skills are never copied in; list vetted ones under "Recommended add-ons" in the README instead.
- `plugins/starter-kit/hooks/` — hooks.json; test-related.mjs (related tests after edits), session-start.mjs (nudge to run init, or lean-mode token-saving rules in set-up projects; keep everything it injects under 400 words), push-gate.mjs (blocks `git push` until /full-scan passed), safety-guard.mjs (blocks or asks before destructive shell commands), auto-update.mjs (daily background self-update of this plugin; launcher + `--worker`), secret-guard.mjs (blocks commit/push/PR/publish/deploy when secrets or private terms are present; scanner in scripts/secret-scan.mjs), package-guard.mjs (registry check before installs; scripts/pkg-check.mjs), file-guard.mjs (keeps file tools off the approval list), scripts/trust-lib.mjs + trust.mjs (per-computer approval of a project's commands and switches), scripts/install-git-hooks.mjs (pre-commit secret scan), verify-gate.mjs (Stop hook: runs the project's `verify` commands and blocks the turn from ending while they fail)
- `.claude/kit.json` — turns the automatic hooks off for this repo itself (it is not a managed project)

# Rules
- No project names, frameworks or package managers hard-coded in agents or commands; they read the project's CLAUDE.md.
- The CLAUDE.md template lives inside `commands/init.md` — edit it there.
- After changing a hook, run its tests: `node --test plugins/starter-kit/hooks/test-related.test.mjs plugins/starter-kit/hooks/auto.test.mjs plugins/starter-kit/hooks/safety-guard.test.mjs plugins/starter-kit/hooks/auto-update.test.mjs plugins/starter-kit/hooks/verify-gate.test.mjs plugins/starter-kit/hooks/secret-guard.test.mjs plugins/starter-kit/hooks/hardening.test.mjs plugins/starter-kit/scripts/vet-scan.test.mjs plugins/starter-kit/scripts/install-git-hooks.test.mjs` (add a test for every bug you fix). The routing text in `session-start.mjs` is how Claude learns which command to run; any new command must be added there.
- Bump `version` in plugin.json on every release: self-updating machines only pick up a change when the version number changes.
- The kit's users are not programmers: every command and agent must do the work itself and report in plain words, never hand the user a command to run.
- Test real behavior end to end with a current CLI: `npx -y @anthropic-ai/claude-code@latest -p "<plain request>" --plugin-dir plugins/starter-kit --setting-sources "" --output-format stream-json --verbose` in a throwaway project.
- SECURITY RULE: nothing that comes from a project's own files (kit.json commands, switches, allowed rule ids) may run or take effect unless the user approved it on this computer (trust-lib). Never add a hook that executes project-supplied text, or reads an off-switch from the project, without that check. Test real registries and git, not only fixtures.
- Validate before committing: `claude plugin validate .`
