# What using it looks like

[← Back to the README](../README.md)

A shortened, made-up example of a first build, to show the shape of the conversation. The app, names and numbers are invented;
real replies are longer, and the wording changes from run to run.

## 1. You open an empty folder and say what you want

> **You:** Build me a simple app where I can keep track of my plant-watering schedule.

The kit notices the folder isn't set up, sets it up, and asks its one setup question:

> **Claude:** I've set this folder up for the starter kit (ran: setup). One question: may I run this project's own checks
> (tests, build) automatically whenever I finish a change? You'll see a permission prompt showing the exact commands. **Yes / no?**

## 2. It asks a few questions, each with a default

> **Claude:** (ran: plan) Before I build, a few questions. Reply "yes" to take all my defaults.
> 1. Who is it for? *Default: just you, on your own computer.*
> 2. Phone, computer or both? *Default: both, in the browser.*
> 3. Do people sign in? *Default: no.*
> 4. How many plants, at most? *Default: about 50.*
> 5. Two or three apps whose look you like? *Default: you pick something calm and simple.*

## 3. You approve one short plan

> **Claude:** The plan. **Goal:** never forget to water a plant. **Built with:** a small web app that keeps its data on this
> computer. **Screens:** Plants (a list of about 50, with search), a plant's page, an add/edit form, a delete confirmation.
> **Roadmap:** Milestone 1 "I can see what needs water today": 1. add and edit plants [S], 2. today's list [S], 3. mark as watered
> [S]. **Not now:** reminders by email. **Assumptions:** (each default listed). **Approve or correct?**
>
> **You:** Approved.

## 4. It builds feature by feature, and tells you what now works

Each feature is built in its own branch by a builder agent. Reviewers, a challenger and the UI checklist then check it, and it is
merged only when its tests pass. You see a short report after each one:

> **Claude:** Merged "add and edit plants". You can now add a plant with a name, a photo and how often it needs water, and change
> it later. Try it: open http://localhost:5173 and press "Add plant". Checked: 9 tests, including the form at phone and desktop size,
> a missing photo, and a 60-character plant name.
> PROGRESS: 1 of 3 features done (33% by size); 4 of 11 criteria proven; Milestone 1: 1 of 3; this feature used 410K tokens in 7
> agent runs (30% on Opus).

## 5. At the end of a milestone, you try it

Before you are asked, a first-time-user tester walks through the milestone in a real browser, and the whole-app sweep compares the
screens. Then:

> **Claude:** Milestone 1 is ready for you to try. Open http://localhost:5173 and:
> 1. Add two plants, one watered every 3 days and one every week.
> 2. Open "Today": the 3-day plant should be there.
> 3. Press "Watered" on it: it should leave today's list.
>
> Does it work the way you wanted? And which screen feels least like the apps you like?

Your answer is recorded in your own words. Changes you ask for become new items on the roadmap.

## 6. Anytime

- "Where are we?" gives the plain-words status: done, next, and anything waiting on you.
- "Continue" picks up where it stopped, even after the computer was turned off mid-build.
- "Ship it" runs the full pre-ship scan; a push waits until it passes.

## What it adds to your project

All plain files in your project folder, so you can read them:

| File | What it is |
|---|---|
| `CLAUDE.md` | The project's rules for Claude: how to run, test and build it |
| `ROADMAP.md` | The approved features and milestones, ticked off only with proof |
| `PROJECT.md` | The master record: what it is, the decisions and why, known problems, what to harden before launch |
| `DECISIONS.md`, `HANDOFF.md`, `CHANGELOG.md` | Every decision, where things stand for the next session, and what changed |
| `DESIGN.md` | The chosen look (anything with a screen) |
| `.claude/` | Settings (`kit.json`), the screen list (`ui.json`), speed budgets, and working files that are kept out of git |
| `e2e/` | The browser tests (anything with a screen) |

In an existing project it reads first and changes no code until you ask for something.

## Usage

It runs on your own Claude plan; there is no separate charge and no API key. It adds about 1,900 tokens to every session. A
feature uses far more than a chat would, because a builder and several reviewers each work in their own context. Large and
risky features use Opus, which costs about twice Sonnet. The progress line after every merge shows what that feature used, so
nothing is hidden. Ways to use less are in [Keeping usage down](how-it-works.md#keeping-usage-down). Measured averages will be
published after the trial builds finish ([trials](trials.md)).

## Switching it off

- For one project: put `{ "auto": false }` in `.claude/kit.json` ([all settings](settings.md)).
- Everywhere, for now: `claude plugin disable starter-kit@starter-kit-marketplace` (and `enable` to bring it back).
- For good: `claude plugin uninstall starter-kit@starter-kit-marketplace`. The files it wrote in your projects stay; they are yours.
