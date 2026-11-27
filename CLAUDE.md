# This repo
A Claude Code plugin marketplace containing one plugin, `starter-kit`, in `plugins/starter-kit/`.
It is a generic foundation for any project type — keep everything language-agnostic.
Start with `docs/development/HANDOFF.md` (what is true now) and `docs/development/IMPROVEMENT-PLAN.md` (the work list, in order).

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
the owner's trial runs in a normal session (`docs/trials.md`) and by the hook canary (`starter-kit-canary`).

# Layout
- `.claude-plugin/marketplace.json` — marketplace manifest; `plugins/starter-kit/.claude-plugin/plugin.json` — plugin manifest.
- `plugins/starter-kit/commands/` — the workflows Claude picks by itself (their descriptions are loaded every session: keep each to two sentences).
- `plugins/starter-kit/workflows/` — a command's full procedure, read on demand by whoever runs it (the `conductor` agent in a
  fresh context, or the main conversation as the fallback). The command file stays a short dispatcher. Checked like commands.
- `plugins/starter-kit/agents/` — subagents. Reviewers are read-only; the implementer and red team work in their own worktrees.
- `plugins/starter-kit/hooks/` — `hooks.json` starts `gate.mjs`, which runs the individual hook scripts in one process
  (`scripts/inprocess.mjs`): guards before shell commands and edits, the session note, the flight recorder, related tests,
  and the stop-time checks. Every hook script is also runnable and tested on its own.
- `plugins/starter-kit/scripts/` — the helper scripts the commands, agents and hooks call, each with its own test file.
- `plugins/starter-kit/templates/` — files copied into projects (the speed and accessibility tests).
- `plugins/starter-kit/library/` — vetted third-party DATA (no instructions, no code), each folder with its license and a NOTICE
  naming the source commit and what was left out. Read only by the kit's own scripts, as data.
- `README.md` — the front page (logo and infographics in `docs/assets/`). The owner wants it detailed, explaining every step the
  kit takes, with no word limit as long as it is relevant; keep it scannable (headings, bullets, tables, infographics). The full
  walkthrough is `docs/every-step.md`; other detail lives in `docs/` (one page per topic, indexed in `docs/README.md`). Keep both
  true when a workflow changes. A test checks every relative link.
- `docs/vetted.md` — every third-party repo that was vetted, with pinned commits. Third-party skills, scripts and settings are
  never copied in; data may be, under a permissive license, after vetting, into `library/` with its license and notice.
- `docs/trials.md` — the owner's trial runs. `docs/development/` — the handoff and the improvement plan for working on the kit.
- `.claude/kit.json` — turns the automatic hooks off for this repo itself (it is not a managed project).

# Rules
- No project names, frameworks or package managers hard-coded in agents or commands; they read the project's CLAUDE.md.
- The CLAUDE.md template for projects lives inside `commands/init.md` — edit it there.
- Commands, agents and the session note refer to the kit's scripts as `${CLAUDE_PLUGIN_ROOT}/scripts/…`; never a personal path.
- Run all tests after any change: `node --test plugins/starter-kit/hooks/*.test.mjs plugins/starter-kit/scripts/*.test.mjs`,
  and the hook tests again through the merged runner: `KIT_VIA_GATE=1 node --test plugins/starter-kit/hooks/*.test.mjs`.
  Add a test for every bug you fix.
- The session note in `hooks/session-start.mjs` is how Claude learns which command to run; a new command must be routed there.
- MODEL RULE: models are chosen in one place, `scripts/model-route.mjs`. Agent files carry its starting models (a test compares
  them) and `hooks/agent-route.mjs` enforces its minimums. A project file can make the kit more careful, never less without the
  user's approval on this computer. The kit never picks Fable by itself.
- HAIKU RULE: a Haiku agent finds and points. It never writes code, gives a verdict (review, security, vetting, legal) or writes a
  record another session will trust, and it has no write, shell or agent tools (a test enforces it). It hands over `path:lines`
  pointers with a quoted line, checked by `scripts/pointer-check.mjs`, never summaries.
- Only the `conductor` may start other agents (it runs a whole feature workflow in a fresh context). Every other agent's allow-list
  leaves `Agent` out, or its deny-list names it; `hooks/agent-route.mjs` lets the conductor start only the kit's own agents, never
  another conductor, and refuses launches by any other kit agent (tests enforce both).
- The kit's users are not programmers: every command and agent must do the work itself and report in plain words, never hand the user a command to run.
- RED-TEAM RULE: every time a guard or the scanner is bypassed (or blocks something harmless), add the exact command or text to the
  fuzz tests FIRST (`guard-fuzz.test.mjs`, `guard-fuzz-powershell.test.mjs`, `secret-fuzz.test.mjs`), watch it fail, then fix.
  Fuzz entries come in three kinds: must be denied, must prompt, must pass. Guards must cover every shell tool (Bash and PowerShell).
- SECURITY RULE: nothing that comes from a project's own files (kit.json commands, switches, allowed rule ids) may run or take effect unless the user approved it on this computer (trust-lib). Never add a hook that executes project-supplied text, or reads an off-switch from the project, without that check.
- Hooks: never call `process.exit` inside a `try` that has a `catch` (the merged runner could not stop there; a test enforces it).
- EVERY RELEASE: bump `version` in plugin.json (machines only update when it changes), add a `CHANGELOG.md` entry, rewrite
  `docs/development/HANDOFF.md` (what is verified and what is not), tick the tasks done in `docs/development/IMPROVEMENT-PLAN.md`,
  run all tests both ways, run `claude plugin validate plugins/starter-kit`, then push. `scripts/docs.test.mjs` fails if the
  changelog or handoff don't match the version, a command or agent is undocumented, or a link in the docs is broken.
