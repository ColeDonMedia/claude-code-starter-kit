# Trial builds (dogfooding)

The kit's unit tests prove each part works alone. Only real builds show whether the whole flow works, and every real
run so far has found bugs the tests could not. This file is the plan for finding the rest. It uses your normal Claude
Code session only: no separate model calls, no API keys.

## How to run a trial
1. Open a new, empty folder in Claude Code with the starter kit installed.
2. Paste the idea from the list below as your first message. Answer its questions in everyday words, say "yes" to its defaults, and
   try each milestone when it asks.
3. Afterwards, say "that's the end of the trial". The kit reads its own flight log and writes down what went wrong.
4. Bring the result back to the session that maintains the kit (or open the kit's repository and say "fix what the trial found").

## The three trials
| # | Idea to paste | What it proves |
|---|---|---|
| 1 | "A to-do list website where I can add, finish and delete tasks." | The basic flow: plan, build, review, accept, records, no stalls |
| 2 | "A recipe box with sign-in, where each person only sees their own recipes." | Sign-in, one user cannot reach another's data, red team, security criteria |
| 3 | "A small paid service: people sign up, pick a monthly plan, and see a dashboard of their usage." | Payments (test mode only), multi-tenant data, launch and runbook, legal drafts |

## What to look for (the flight report shows most of it)
- The plan was shown and approved before any code. Questions were few, in plain words, each with a default.
- Features were built one at a time by the implementer, then reviewed by the reviewer and challenger (and the red team for risky ones).
- Roadmap ticks carry a merge id and test names; milestones wait for your OK.
- Screens look like the apps you named, and the design check passed.
- No guard blocked something harmless, and nothing dangerous slipped through.
- A fresh session in the same folder picks up where the last one stopped, without you re-explaining.

## Log of trials
| Date | Trial | Result | Bugs found | Fixed in |
|---|---|---|---|---|
| (none run yet) | | | | |
