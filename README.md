<p align="center">
  <img src="docs/assets/logo.png" alt="Starter Kit" width="480">
</p>

<p align="center">
  <b>A Claude Code plugin that plans, builds, tests, reviews and ships software for you, safely.</b><br>
  Any language, any kind of project. Made for people who don't code, and useful for people who do.
</p>

<p align="center">
  <a href="https://github.com/ColeDonMedia/claude-code-starter-kit/actions/workflows/tests.yml"><img src="https://github.com/ColeDonMedia/claude-code-starter-kit/actions/workflows/tests.yml/badge.svg?branch=main" alt="Tests"></a></p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#how-you-use-it">How you use it</a> ·
  <a href="#every-step-from-idea-to-launch">Every step</a> ·
  <a href="docs/example.md">See an example</a> ·
  <a href="#whats-inside">What's inside</a> ·
  <a href="#protection-built-in">Protection</a> ·
  <a href="docs/README.md">Full documentation</a>
</p>

---

## What it does

- **Runs the right workflow by itself.** You describe what you want in plain words; Claude picks the plan, build, test, review or
  ship workflow and says in one line what it ran. You never type a command.
- **Plans before it builds.** A new app gets researched, sized, designed and broken into a checklist you approve once.
- **Builds test-first, in isolation.** Each feature is built in its own branch and its own fresh context, reviewed separately, and
  merged only when the tests pass, so your chat stays small.
- **Guards your computer and secrets.** Dangerous commands, leaked keys, fake packages and unchecked pushes are stopped, and its
  own security checks need nothing installed.
- **Checks every screen like an agency would.** A way back from every page, an X on every popup, search on long lists, no
  duplicate or wrapping buttons: measured in a real browser and checked by eye.
- **Reviews in proportion.** Only problems that break what you agreed, or let a stranger in, hold a feature back; the rest is
  listed to fix before launch.
- **Remembers where it left off.** Say "continue" to resume from the last verified step.

## Install

Once per computer:

```
claude plugin marketplace add ColeDonMedia/claude-code-starter-kit@stable
claude plugin install starter-kit@starter-kit-marketplace
```

Restart Claude Code. The kit then updates itself daily, only to versions that passed their tests.

<details>
<summary>Install trouble?</summary>

- Inside Claude Code, the same commands are `/plugin marketplace add …` and `/plugin install …`.
- If the `owner/repo` form fails because SSH isn't set up, use
  `https://github.com/ColeDonMedia/claude-code-starter-kit.git#stable` instead.
- Update by hand: `claude plugin marketplace update starter-kit-marketplace`.
</details>

## How you use it

Open a project folder in Claude Code and talk normally.

| You say | What happens |
|---|---|
| *(open a project that isn't set up)* | It sets the project up and asks you one yes/no question. |
| "Build me an app that…" | A researched plan and roadmap. You approve it once; it builds feature by feature. |
| "Add a…" / "Fix the…" | The feature is built test-first in its own branch, reviewed, and merged when green. |
| "This error keeps happening" | It finds the cause with evidence and adds a test so it stays fixed. |
| "Continue" | It carries on with the next roadmap item, or resumes one that was cut off. |
| "Where are we?" | Progress, what's next, what it needs from you. |
| "Ship it" | The full pre-ship scan runs; pushes wait until it passes. |

See [a whole example build](docs/example.md), with the files it adds, usage and switching it off. More in
[How it works](docs/how-it-works.md).

## Every step, from idea to launch

<p align="center"><img src="docs/assets/from-idea-to-launch.png" alt="Starter Kit from idea to launch: setup, plan, look, build each feature with up to five reviewers, proof, you try it, 17 checks behind a push gate, launch; guards on every action" width="720"></p>

This is the whole path a new app takes. Each stage runs by itself; you're only asked where your answer changes the result.
[Every step in full detail](docs/every-step.md) covers what you see, what Claude does, which files change and what can stop it.

**1. Every session starts with a briefing.** Before you type, a short note tells Claude which workflow fits which request, that
you're not a programmer, how far the roadmap is, what's waiting for you, and whether a build was cut off. The first session after an
update proves the guards are running. Updates install themselves once a day, only versions that passed their tests.

**2. Setup** (first time in a folder, even an empty one):
- works out how to install, run, test and build the project, and makes it a git project if it isn't one (nothing is uploaded)
- writes `CLAUDE.md` (the project's rulebook for Claude), locks your keys and login files away from Claude, and adds a git hook that
  refuses secrets in any commit
- for anything with a screen, sets up real-browser tests at phone and desktop size, plus speed, accessibility and screen checks
- starts the project's memory: `PROJECT.md`, `HANDOFF.md`, `CHANGELOG.md`
- asks you **one question**: may it run the project's own checks automatically?

**3. The plan** (new apps; a hook refuses app code until it exists):
- one message of questions, each with a suggested answer, always including how many people will use it
- researchers look at 4 to 6 similar products; the technology is chosen and checked against what your computer can run
- a gap check (empty and error screens, password reset, deleting data, phones, keyboard use) and a threat check (who could misuse it,
  and a test for each defence)
- a plan with testable criteria, a roadmap in milestones of about three features, a speed budget and a screen list
- a second agent attacks the plan before you see it; **you approve once**

**4. The look.** Two or three directions from the style library (89 styles, 194 palettes, 74 font pairings), shown side by side for
you to pick. The choice becomes `DESIGN.md`, which every screen follows.

**5. Each feature, in its own fresh context:**
- a **conductor** agent runs the whole build away from your chat; the build's progress is recorded so a cut-off resumes where it stopped
- a **builder** works in its own copy of the project, on its own branch, **test first**: one failing test per agreed criterion, then
  the code, committing after every passing test
- for screens it builds every state, measures each one in a real browser at phone and desktop size, and re-runs with extreme data (the
  longest name, 300 items, a missing picture)
- a **reviewer**, a **challenger** (who assumes it's not done), a **UI reviewer** and, for risky features, a **security reviewer** and a
  **red team** check it in parallel
- only problems that break what you agreed or let a stranger in go back for a fix; the rest is listed to fix before launch
- from round 3 a script decides if more rounds are worth it; round 6 always comes to you
- it's merged only when everything passes, the roadmap is ticked **only with the test that proves each criterion**, the records are
  updated, and you get a short report: what works, how to see it, and what it used

**6. A checkpoint every three features.** All tests, every roadmap tick, the records and the approved plan are checked against what
was really built.

**7. You try each milestone before more is built.** A first-time-user agent walks it in a browser first, every screen is compared with
every other, and accessibility is checked by hand. Then you get five to eight things to try. Your verdict is recorded in your own words,
and changes you ask for become roadmap items.

**8. Nothing leaves without the pre-ship scan.** Seventeen checks: tests, types, lint, build, dependency and configuration scanners, a
security review, browser tests, your acceptance, database changes, records, speed, design, load and accessibility. A hook blocks every
push and deploy until that exact commit has passed.

**9. The first launch.** Separate test and live copies, payments in test mode first, automatic deploys, error and uptime alerts,
a backup that has actually been restored, a practised rollback, HTTPS and security headers, cost estimates, and a `RUNBOOK.md`.
It asks for your go-ahead before going live.

**10. After launch.** A monthly check-up (updates, security, backups, speed, costs), outage handling that restores service first, and
speed work that's measured before and after.

**All the way through, guards watch every command and edit:** dangerous commands, leaked secrets, invented packages, remote databases,
unchecked pushes, code before a plan, and roadmap ticks without proof. When Claude finishes a turn with changed code, the project's own
checks run, and the turn can't end while one fails.

## What's inside

### 21 workflows

Claude starts these itself; you can also type them.

| Stage | Workflow | What it does |
|---|---|---|
| **Plan** | `/starter-kit:init` | Sets up a project: detects the stack, writes its `CLAUDE.md` |
| | `/starter-kit:spec` | Turns an idea into an approved plan and roadmap |
| | `/starter-kit:research` | Competitors and the market, every claim linked |
| | `/starter-kit:design` | Picks a look from the style library and checks accessibility |
| | `/starter-kit:onboard` | Maps a big existing codebase, area by area |
| | `/starter-kit:vet` | Checks someone else's add-on before you install it |
| **Build** | `/starter-kit:feature` | Builds a feature test-first in its own branch, reviews it, merges it |
| | `/starter-kit:tdd` | One small test-first fix in the current conversation |
| | `/starter-kit:debug` | Finds a bug's root cause with evidence, then fixes it; handles a live outage |
| | `/starter-kit:db` | Database changes on a local copy, rehearsed at real size |
| **Check** | `/starter-kit:review` | Reviews changes made in the conversation |
| | `/starter-kit:audit` | Security audit of the whole project |
| | `/starter-kit:redteam` | Attacks a local copy like a hostile user |
| | `/starter-kit:speed` | Measures what's slow and fixes the biggest cause |
| | `/starter-kit:accept` | You try the finished milestone; your verdict is recorded |
| | `/starter-kit:dogfood` | Checks what the kit itself did after a trial build |
| **Ship and run** | `/starter-kit:full-scan` | The pre-ship sweep: every test, build and security review |
| | `/starter-kit:launch` | The first go-live: environments, backups, alerts, a runbook |
| | `/starter-kit:legal` | Privacy policy, terms and library licenses |
| | `/starter-kit:maintain` | The monthly check-up |
| | `/starter-kit:status` | Where things stand, in plain words |

### 11 agents

| Agent | Model | Job |
|---|---|---|
| `conductor` | Sonnet; Opus for large or risky features | Runs one feature's whole build in a fresh context |
| `implementer` | Sonnet; Opus for medium, large or risky features | Builds one feature in its own branch and folder |
| `scout` | Haiku | In big projects, finds the files and lines a job needs |
| `researcher` | Haiku | Researches the web, returns a sourced report |
| `reviewer` | Opus | Reviews correctness and runs the tests (read-only) |
| `ui-reviewer` | Sonnet | Looks at the running app at phone and desktop size; goes through the UI checklist (read-only) |
| `security-reviewer` | Opus | Hardening review of risky features and before shipping (read-only) |
| `challenger` | Sonnet; Opus for plans and large features | Tries to prove the work isn't done; checks the plan (read-only) |
| `investigator` | Sonnet; Opus once a first guess fails | Finds a bug's root cause outside the main conversation (read-only) |
| `red-team` | Opus | Attacks a local copy like a hostile user, writes a test for every break |
| `user-tester` | Sonnet | Tries each finished milestone like a first-time user, before you do |

How models are picked: [which model does what](docs/how-it-works.md#which-model-does-what).

## Protection built in

| Guard | Stops |
|---|---|
| Safety guard | Commands that wipe drives or history, in Bash and PowerShell; asks before risky ones |
| Secret guard | Keys, `.env` files and your private terms leaving in a commit, push or deploy |
| Package guard | Installing packages that don't exist (invented names attackers register) |
| Push gate | Pushes and deploys before the pre-ship scan passes for that exact commit |
| Database guard | Connecting to any database that isn't on your computer |
| Model check | A review started on a weaker model than its job needs |
| File and web guards | Claude reading your key files, or keys leaving in a web address; warns about injected orders in pages |
| Built-in scanners | Known flaws and malware in dependencies, unsafe workflows, Dockerfiles and Compose files, missing headers |

The guards prove they are running, a crashed guard refuses the command, and a project can't switch them off without your approval.
Details: [Safety and security](docs/safety.md).

## What still needs you

- Creating accounts and paying for services (hosting, domains, payment providers).
- Approving the plan, trying each milestone, and saying "ship it".
- A lawyer's review of the legal drafts, and a professional security test for apps that hold payments or sensitive data.

## What's proven and what isn't

- **Proven:** over 570 automated tests over the hooks and scripts, including hundreds of disguised attacks thrown at the guards. Every push runs them on Windows, macOS and Linux.
- **Not yet proven:** a full real-world build from idea to launch. A [trial](docs/trials.md) has built a real app's first milestone
  (three features, accepted by its owner) on Windows; what it found is fixed, but those fixes haven't run in a live build yet. Found a problem? [Open an issue](https://github.com/ColeDonMedia/claude-code-starter-kit/issues).

## Requirements

- A current Claude Code (very old versions fail with "tool_use ids must be unique"). It runs on your own Claude plan: no API key.
- Node.js 18 or newer, and git. Database features need Node 22.5 or newer.

## Documentation

[Every step, in full](docs/every-step.md), [What using it looks like](docs/example.md), [How it works](docs/how-it-works.md), [Safety and security](docs/safety.md),
[Quality and testing](docs/quality.md), [Planning, records and memory](docs/planning-and-records.md),
[Design and accessibility](docs/design-and-accessibility.md), [Speed and scale](docs/speed-and-scale.md),
[Databases](docs/databases.md), [Big codebases](docs/big-codebases.md), [Launch, operations and legal](docs/launch-and-operations.md),
[Add-ons and vetting](docs/add-ons.md), [Settings](docs/settings.md), [Changelog](CHANGELOG.md).

## Contributing

> **Public repository:** no names, emails, client details, personal file paths, keys, tokens or private code.

Run the tests before every change:

```
node --test plugins/starter-kit/hooks/*.test.mjs plugins/starter-kit/scripts/*.test.mjs
```

## License

MIT. See [LICENSE](LICENSE). The design data in `plugins/starter-kit/library/ui-ux-pro-max/` is MIT-licensed and keeps its
own license file; no other project's code is copied here ([vetting record](docs/vetted.md)).
