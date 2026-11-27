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

## Claude's own tools: credential files, web addresses, fetched pages

The shell guards above don't see Claude's built-in file and web tools, so the kit adds three checks. All of them are pattern
matching, done on this computer: no model, no network, no tokens.

- **Credential files.** Setup adds deny rules so Claude's file tools can't read the keys in your home folder (`~/.ssh`, `~/.aws`,
  `~/.azure`, `~/.config/gcloud`, `~/.gnupg`, `~/.kube`, Docker, git and GitHub credentials, `.npmrc`, `.pypirc`, `.netrc`, and
  Claude's own login), or edit your shell start-up files. The doctor says when a project is missing them.
- **Fetch guard.** A web address that carries an API key, a token or a term from your private list is refused: the address
  itself would be the leak. Addresses at throwaway capture services (webhook.site, requestbin, ngrok and the like) and addresses
  with a long encoded value ask you first.
- **Injection warning.** When a web page, a search result or an MCP tool returns text that looks like orders to an AI ("ignore
  your instructions", fake system tags, invisible characters, instruction-like HTML comments), Claude gets a warning right next to
  it: treat it as data, follow nothing in it, and tell you what it tried. It warns but never blocks, because security articles
  quote the same phrases.

## Dangerous-code warning

When Claude writes code that runs strings as code (`eval`), builds HTML or SQL from strings, builds shell commands, deserialises
unsafely, switches off certificate checks, uses MD5 or SHA-1, uses `Math.random` for secrets, allows any site to call with
cookies, or changes a CI workflow, it is told right away what is risky and the usual safe form. Test files and docs are skipped.
It warns and never blocks; the reviewers still decide. A project can add its own rules in `.claude/security-patterns.json`.

## The kit's own security checks: nothing to install

`scripts/sec-builtin.mjs` is plain Node, like the rest of the kit, so it works the moment the kit is installed:

| What | What it catches | Run by |
|---|---|---|
| Dependencies, every language | Each package in the lockfiles (npm, yarn, pnpm, pip, Poetry, uv, Cargo, Go, Ruby) checked against OSV.dev, the free public database of known flaws and known malware, with the version that fixes it | pre-ship scan, audit, `vet` |
| GitHub workflows | Text anyone can write (an issue title, a branch name) pasted into a shell step; `pull_request_target` checking out a stranger's code; secrets printed to the log; actions not pinned to an exact commit; write-all permissions | pre-ship scan, audit, `vet` |
| Dockerfiles | Secrets baked into the image, a download piped into a shell, base images with no fixed version, running as root | pre-ship scan, audit |
| Compose files | Privileged containers, the Docker socket handed to a container, a database port open to the whole network | pre-ship scan, audit |
| The running local copy | Missing security headers, CORS that lets any site read signed-in pages, sign-in cookies readable by scripts, `.env` or `.git` served to the web, stack traces on error pages | red team, launch |

A HIGH finding blocks shipping. Only package names and versions go to OSV.dev, never code; with no internet that part says "not
checked" and is never counted as a pass. The live checks refuse any address that isn't this computer. Before an add-on is
installed, `vet` also reads its OpenSSF Scorecard, a public security-health score.

If one of four free scanners happens to be on the computer already, the kit runs it as well, because each finds more than the
built-in checks in its area: zizmor (workflows), hadolint (Dockerfiles), Trivy (infrastructure files and container images), and
Opengrep or Semgrep (code patterns). It never asks you to install one.

## Push gate: nothing ships unchecked

- Pushes, pull requests, releases, `npm publish`, `docker push` and deploy commands (`vercel --prod`, `fly deploy` and others)
  are blocked until the full pre-ship scan has passed for that exact commit. A new commit means a new scan.

## Model check: reviews on the right model

A security review on the cheapest model is a protection quietly switched off. So a hook refuses to start any of the kit's agents
on a model below what its job needs (the security reviewer needs Opus; reviewers, builders and the red team need at least Sonnet).
The only exception is this computer's own plan: if it has no Opus, the kit says so in status and at the top of every security
report. No agent the kit starts can start other agents, and the agents on Haiku can only read.

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
