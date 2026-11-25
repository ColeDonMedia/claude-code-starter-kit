<p align="center">
  <img src="docs/assets/logo.png" alt="Starter Kit" width="480">
</p>

<p align="center">
  <b>A Claude Code plugin that plans, builds, tests, reviews and ships software for you, safely.</b><br>
  Any language, any kind of project. Made for people who don't code, and useful for people who do.
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#how-you-use-it">How you use it</a> ·
  <a href="#whats-inside">What's inside</a> ·
  <a href="#protection-built-in">Protection</a> ·
  <a href="docs/README.md">Full documentation</a>
</p>

---

## What it does

- **Runs the right workflow by itself.** You describe what you want in plain words; Claude picks the plan, build, test, review or
  ship workflow and says in one line what it ran. You never type a command.
- **Plans before it builds.** A new app gets researched, sized, designed and broken into a checklist you approve once.
- **Builds test-first, in isolation.** Each feature is built in its own branch, reviewed by separate reviewers, and merged only
  when the tests pass.
- **Guards your computer and your secrets.** Dangerous commands, leaked keys, invented packages, remote databases and unchecked
  pushes are stopped before they happen.
- **Remembers where it left off.** Project records keep any session able to say "continue" and pick up exactly where the last one stopped.

## Install

Once per computer:

```
claude plugin marketplace add ColeDonMedia/claude-code-starter-kit
claude plugin install starter-kit@starter-kit-marketplace
```

Restart Claude Code. That's it: the kit updates itself once a day from this repository.

<details>
<summary>Install trouble?</summary>

- Inside Claude Code, the same commands are `/plugin marketplace add …` and `/plugin install …`.
- If the `owner/repo` form fails because SSH isn't set up, use
  `https://github.com/ColeDonMedia/claude-code-starter-kit.git` instead.
- Update by hand: `claude plugin marketplace update starter-kit-marketplace`.
- If something seems off, tell Claude the kit is misbehaving. It runs the kit's health check (Node, git, the hooks, the guards)
  and tells you in plain words what's wrong.
</details>

## How you use it

Open a project folder in Claude Code and talk normally.

| You say | What happens |
|---|---|
| *(open a project that isn't set up)* | It detects the stack, writes the project's `CLAUDE.md`, and asks you one yes/no question. |
| "Build me an app that…" | A plan with research, size, design and a roadmap. You approve it once, then it builds feature by feature. |
| "Add a…" / "Fix the…" | The feature is built test-first in its own branch, reviewed, and merged when green. |
| "This error keeps happening" | It finds the root cause with evidence before changing code, then adds a test so it can't come back. |
| "Continue" | It reads the records and carries on with the next item on the roadmap. |
| "Where are we?" | Progress, what's next, risks, and exactly what it needs from you. |
| "Ship it" | The full pre-ship scan runs first; pushes and deploys are blocked until it passes. |

More in [How it works](docs/how-it-works.md).

## What's inside

### 21 workflows

Claude starts these itself; you can also type them.

| Plan | Build | Check | Ship and run |
|---|---|---|---|
| `/starter-kit:init` set up a project | `/starter-kit:feature` build a feature | `/starter-kit:review` review changes | `/starter-kit:full-scan` pre-ship sweep |
| `/starter-kit:spec` plan an app | `/starter-kit:tdd` small test-first fix | `/starter-kit:audit` security audit | `/starter-kit:launch` first go-live |
| `/starter-kit:research` competitors | `/starter-kit:debug` root-cause a bug | `/starter-kit:redteam` try to break it | `/starter-kit:maintain` monthly care |
| `/starter-kit:design` pick a look | `/starter-kit:db` database changes | `/starter-kit:speed` make it faster | `/starter-kit:legal` privacy and terms |
| `/starter-kit:onboard` map a codebase | | `/starter-kit:accept` you try it | `/starter-kit:status` where are we |
| `/starter-kit:vet` check an add-on | | `/starter-kit:dogfood` check the kit | |

### 7 agents

| Agent | Model | Job |
|---|---|---|
| `implementer` | Sonnet | Builds one feature in its own branch and folder |
| `researcher` | Haiku | Searches and reads the web, returns a short sourced report |
| `reviewer` | Sonnet | Reviews correctness and runs the tests (read-only) |
| `ui-reviewer` | Sonnet | Looks at the running app at phone and desktop size (read-only) |
| `security-reviewer` | Opus | Hardening review of risky features and before shipping (read-only) |
| `challenger` | Sonnet | Assumes the work isn't done and tries to prove it (read-only) |
| `red-team` | Sonnet | Attacks a local copy like a hostile user, writes a test for every break |

Plus a design library of 89 styles, 194 palettes and 74 font pairings, WCAG 2.2 AA accessibility checks, speed and load tests,
database migration checks, and a code index for very large codebases.

## Protection built in

| Guard | Stops |
|---|---|
| Safety guard | Commands that wipe drives or history, in Bash and PowerShell; asks before risky ones |
| Secret guard | API keys, private keys, `.env` files and your private terms leaving in a commit, push or deploy |
| Package guard | Installing packages that don't exist (AI-invented names attackers register) |
| Push gate | Pushes, releases and deploys before the full pre-ship scan passes for that exact commit |
| Database guard | Connecting to any database that isn't on your computer |

The guards prove they are running: each update triggers a self-check, and a guard that crashes refuses the command instead of
letting it through. A project can't switch your protections off without your approval on this computer.
Details: [Safety and security](docs/safety.md).

## What still needs you

- Creating accounts and paying for services (hosting, domains, payment providers).
- Approving the plan, trying each milestone, and saying "ship it".
- A lawyer's review of the legal drafts, and a professional security test for apps that hold payments or sensitive data.

## What's proven and what isn't

- **Proven:** 445 automated tests over the hooks and scripts, including fuzz tests that throw hundreds of disguised attacks at
  the guards. They run before every release.
- **Not yet proven:** a full real-world build from idea to launch. [Trial runs](docs/trials.md) describe how that is being tested.
- Tested on Windows so far; macOS and Linux are intended.

## Requirements

- A current Claude Code (very old versions fail with "tool_use ids must be unique").
- Node.js 18 or newer, and git. Database rehearsals and SQLite schema reading need Node 22.5 or newer.

## Documentation

| | |
|---|---|
| [How it works](docs/how-it-works.md) | [Safety and security](docs/safety.md) |
| [Quality and testing](docs/quality.md) | [Planning, records and memory](docs/planning-and-records.md) |
| [Design and accessibility](docs/design-and-accessibility.md) | [Speed and scale](docs/speed-and-scale.md) |
| [Databases](docs/databases.md) | [Big codebases](docs/big-codebases.md) |
| [Launch, operations and legal](docs/launch-and-operations.md) | [Add-ons and vetting](docs/add-ons.md) |
| [Settings](docs/settings.md) | [Changelog](CHANGELOG.md) |

## Contributing

> **This is a public repository.** Do not put private details in it: no names, emails, company or client details, personal
> file paths, keys, tokens, or code from private projects.

Run the tests before every change:

```
node --test plugins/starter-kit/hooks/*.test.mjs plugins/starter-kit/scripts/*.test.mjs
```

Plugins can't ship a `CLAUDE.md` or permission rules, which is why the `init` workflow writes those into each project.
Notes for people working on the kit: [handoff](docs/development/HANDOFF.md) and [improvement plan](docs/development/IMPROVEMENT-PLAN.md).

## License

MIT. See [LICENSE](LICENSE). The design data in `plugins/starter-kit/library/ui-ux-pro-max/` comes from the MIT-licensed
ui-ux-pro-max project and keeps its own license file. Other repositories in the [vetting record](docs/vetted.md) keep their own
licenses; none of their code is copied here.
