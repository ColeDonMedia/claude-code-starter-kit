# Safety and security

[← Back to the README](../README.md) · [All documentation](README.md)

Every guard below watches both shell tools: Bash and, on Windows, PowerShell (read the PowerShell way: backtick escapes, script
blocks, `$( )` inside strings, here-strings, `-EncodedCommand`).

## Safety guard: dangerous commands

- **Blocks** catastrophic commands: `rm -rf` on `/`, your home folder or a drive; force-pushing `main`/`master`; writing to disks;
  fork bombs; wiping a drive from PowerShell (`Remove-Item -Recurse C:\`, `Format-Volume` and friends).
- **Asks you first** for risky but sometimes intended ones: `git reset --hard`, `git clean -f`, discarding changes, force-pushing
  other branches, `curl | sh`, `DROP TABLE`, database resets, printing `.env` or SSH keys, hidden `-EncodedCommand` payloads.
- **Lets through** ordinary work: `rm -rf node_modules`, and any text that only *mentions* a dangerous command (a commit message,
  an `echo`, a search).
- Allow one rule per project with `{ "guardAllow": ["reset-hard"] }` (rule ids are listed at the top of `hooks/safety-guard.mjs`),
  or turn the guard off with `{ "guard": false }`. Both need your approval on this computer before they count (see below).

## Proof that the guards are running

A silently broken hook looks exactly like a working one, so the kit checks itself:

- **The canary:** the command `starter-kit-canary` does nothing and is always refused ("canary ok").
- **The self-check:** the first session after each update asks Claude to run the canary with every shell tool and to tell you
  plainly if it was not refused.
- **Fail closed:** if a guard crashes on a shell command, the command is refused rather than run unchecked.
- **The tripwire:** every project's `CLAUDE.md` carries a line that notices when the kit's session note is missing.
- **The doctor:** `scripts/doctor.mjs` checks Node, git, the hooks, both canaries and the data folder, in plain words.

## Secret guard: keys never leave your computer

- Before `git commit`, `git push`, `gh pr create`, a publish or a deploy, it scans what is about to leave, including commits
  that were later removed.
- It blocks API keys (AWS, GitHub, Anthropic, OpenAI, Stripe, Square, Google, Slack, npm and more), private keys, JSON web tokens,
  credential-named values like `API_KEY=...`, and `.env`, `.pem` and `.key` files.
- It also blocks anything on your private list at `~/.claude/plugins/data/starter-kit/private-terms.txt` (your name, email,
  client names).
- The reason shows the file and line with the value redacted, never the secret. Placeholders such as `your-key-here` pass.
- The same scan runs as a real git pre-commit hook (so it protects commits from any tool, or from you) and in a GitHub check.
- If a real key was ever committed, rotate it: deleting it later does not remove it from git history.

### Private repositories, and features that need keys

- Private repositories get the same rule. A private repository can be made public with one click, shared, forked or copied into
  build logs, and git keeps every old version.
- Features that need keys still work. The guard never changes your code: the code names a key (`process.env.STRIPE_SECRET_KEY`),
  the value lives in `.env` on your computer (git ignores it) and, for the live site, in the hosting service's secret settings.
  That is what Stripe and Square tell developers to do, and the block message says exactly where the key goes.
- Payment keys: Stripe secret and restricted keys (`sk_`, `rk_`, live and test), webhook signing secrets (`whsec_`), and Square
  access tokens and application secret are refused. The Stripe publishable key (`pk_`) and Square's application ID are meant for
  front-end code and pass.
- Limits: Square does not publish its token formats, so its rules use the prefixes common secret scanners use; other providers'
  keys are caught only when assigned to a key-like name (`PAYPAL_SECRET=...`).

## Package guard: no invented packages

- Before an install, each package is looked up in its public registry (npm, PyPI, crates.io).
- A name that doesn't exist is blocked: AI tools invent plausible names, and attackers register them.
- Brand-new, barely used, deprecated or script-running packages, and installs from a URL or a git repo, ask you first.

## Push gate: nothing ships unchecked

- Pushes, pull requests, releases, `npm publish`, `docker push` and deploy commands (`vercel --prod`, `fly deploy` and others)
  are blocked until the full pre-ship scan has passed for that exact commit. A new commit means a new scan.

## Databases

A database guard keeps Claude on local copies: connections to any database on another computer, migrations with production
settings, and hosting platforms' database tools are refused. Details: [Databases](databases.md).

## A project can't switch your protections off

- A project's `.claude/kit.json` can list check commands and off-switches, but a stranger's project must not be able to run code
  on your computer or disable the guards.
- So those entries do nothing until you approve them on this computer: one plain yes/no when a project is set up, then a
  permission prompt that lists the exact commands.
- The approvals are stored outside the project (`~/.claude/plugins/data/starter-kit/trusted.json`). Changing the file in any way
  from a shell or Claude's file tools is refused, and changing a command voids its approval.

## Security at every stage

| Stage | What happens |
|---|---|
| Planning | A threat check (what's worth stealing, who could misuse it, the likely attacks) turns each defence into a test, such as "user A cannot read user B's data". High-risk features are tagged. |
| Building | Secure-coding defaults: check who is asking on every request, validate input on the server, parameterized queries, secrets only in environment variables, hashed passwords, rate limits, safe cookies. |
| After risky features | Sign-in, payments, uploads, permissions, database rules and secrets get the security reviewer right away, not only at the end. |
| Shipping | The pre-ship scan, plus a launch-readiness checklist for the first launch (HTTPS, security headers, CORS, database rules, key privileges, rate limits, backups, rollback). |
| Whole project | Ask "is it secure?" and a full-codebase audit runs (tools first, then the security reviewer). |

Attacking the app on purpose (the red team, mutation testing) is in [Quality](quality.md).
