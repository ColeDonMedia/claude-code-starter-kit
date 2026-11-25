# This repo
A Claude Code plugin marketplace containing one plugin, `starter-kit`, in `plugins/starter-kit/`.
It is a generic foundation for any project type — keep everything language-agnostic.
Start with `HANDOFF.md` (what is true now) and `IMPROVEMENT-PLAN.md` (the work list, in order).

# PUBLIC REPO — NO PRIVATE DETAILS
This repository is public. Anything committed here is visible to everyone, forever (git history keeps it).
Never add: names, emails, usernames, company or client names, file paths from a personal computer,
API keys, tokens, passwords, `.env` contents, project-specific code or business details, or anything
copied from a private project. Keep every file generic. Before each commit, run
`git diff --cached` and read it for anything personal. If something private is committed by mistake,
tell the user right away — deleting it in a later commit does not remove it from history.

# NEVER SPEND API TOKENS
Do not start headless or scripted model runs to test the kit: no `claude -p`, no `npx` runs of the Claude Code package, no
SDK calls, no `claude plugin eval`. Test with the unit tests and `claude plugin validate` only. Live behaviour is checked by
the owner's trial runs in a normal session (`DOGFOOD.md`) and by the hook canary (`starter-kit-canary`).

# Layout
- `.claude-plugin/marketplace.json` — marketplace manifest; `plugins/starter-kit/.claude-plugin/plugin.json` — plugin manifest.
- `plugins/starter-kit/commands/` — the workflows Claude picks by itself (their descriptions are loaded every session: keep each to two sentences).
- `plugins/starter-kit/agents/` — subagents. Reviewers are read-only; the implementer and red team work in their own worktrees.
- `plugins/starter-kit/hooks/` — `hooks.json` starts `gate.mjs`, which runs the individual hook scripts in one process
  (`scripts/inprocess.mjs`): guards before shell commands and edits, the session note, the flight recorder, related tests,
  and the stop-time checks. Every hook script is also runnable and tested on its own.
- `plugins/starter-kit/scripts/` — the helper scripts the commands, agents and hooks call, each with its own test file.
- `plugins/starter-kit/templates/` — files copied into projects (the speed and accessibility tests).
- `plugins/starter-kit/library/` — vetted third-party DATA (no instructions, no code), each folder with its license and a NOTICE
  naming the source commit and what was left out. Read only by the kit's own scripts, as data.
- `VETTED.md` — every third-party repo that was vetted, with pinned commits. Third-party skills, scripts and settings are never
  copied in; data may be, under a permissive license, after vetting, into `library/` with its license and notice.
- `.claude/kit.json` — turns the automatic hooks off for this repo itself (it is not a managed project).

# Rules
- No project names, frameworks or package managers hard-coded in agents or commands; they read the project's CLAUDE.md.
- The CLAUDE.md template for projects lives inside `commands/init.md` — edit it there.
- Commands, agents and the session note refer to the kit's scripts as `${CLAUDE_PLUGIN_ROOT}/scripts/…`; never a personal path.
- Run all tests after any change: `node --test plugins/starter-kit/hooks/*.test.mjs plugins/starter-kit/scripts/*.test.mjs`,
  and the hook tests again through the merged runner: `KIT_VIA_GATE=1 node --test plugins/starter-kit/hooks/*.test.mjs`.
  Add a test for every bug you fix.
- The session note in `hooks/session-start.mjs` is how Claude learns which command to run; a new command must be routed there.
- The kit's users are not programmers: every command and agent must do the work itself and report in plain words, never hand the user a command to run.
- RED-TEAM RULE: every time a guard or the scanner is bypassed (or blocks something harmless), add the exact command or text to the
  fuzz tests FIRST (`guard-fuzz.test.mjs`, `guard-fuzz-powershell.test.mjs`, `secret-fuzz.test.mjs`), watch it fail, then fix.
  Fuzz entries come in three kinds: must be denied, must prompt, must pass. Guards must cover every shell tool (Bash and PowerShell).
- SECURITY RULE: nothing that comes from a project's own files (kit.json commands, switches, allowed rule ids) may run or take effect unless the user approved it on this computer (trust-lib). Never add a hook that executes project-supplied text, or reads an off-switch from the project, without that check.
- Hooks: never call `process.exit` inside a `try` that has a `catch` (the merged runner could not stop there; a test enforces it).
- EVERY RELEASE: bump `version` in plugin.json (machines only update when it changes), add a `CHANGELOG.md` entry, rewrite
  `HANDOFF.md` (what is verified and what is not), tick the tasks done in `IMPROVEMENT-PLAN.md`, run all tests both ways,
  run `claude plugin validate plugins/starter-kit`, then push. `scripts/docs.test.mjs` fails if the changelog or handoff don't
  match the version, or a hook, command or agent is undocumented.
