# Trial builds (dogfooding)

[← Back to the README](../README.md) · [All documentation](README.md)

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
| 2026-11-25 | A real idea instead of trial 1: a freelancer quote builder, from an empty folder, on 2.17.0 | Stopped after the first message | 1. In an empty folder the session note never appeared, so Claude planned to write code straight away with no plan, questions or approval. 2. The session start carried no model name, so the one-time Haiku and Fable notices cannot fire (shape now recorded). Good: the hooks ran live (the flight log recorded the session and its commands). | 2.17.1 |
| 2026-11-27 | Trial 3, a self-hosted client portal, milestone 1 of 4 (3 features), on 2.17.2 in one session of about 40 hours | Owner tried it and said "Works, accept it"; plan, design, conductor builds, reviews and acceptance all ran in order | Good: spec with research and a plan check, owner decisions asked at the right moments (four), every merge re-checked in the main conversation, honest NOT VERIFIED for Docker. Numbers: review rounds 6, 2, 2; 46 agent runs; 4.4M agent tokens, 84% on Opus; the first feature alone had 6 rounds and 5 red-team attacks. 1. Builders' results: 5 accepted, 7 sent back (6 were the conductor stopping "to wait", one wording still missed; 1 was a true MERGED with a sentence in front). 2. The owner's acceptance could not be recorded: two Docker criteria waited for GitHub as prose, and nothing said how to write them. 3. The question about running the project's checks automatically sat at the end of a long report and took three asks. 4. One long session never picked up 2.18.0 or 2.19.0 (updates apply at session start). | 2.18.0 (rounds, red team once, challenger and re-checks on Sonnet, `→ ci:`, wait detection), 2.19.1 (items 1-3) |
| 2026-11-25 | The same quote builder, restarted on 2.17.1 | A working app (13 browser tests, a real PDF checked), but built the wrong way | Good: setup ran by itself in the empty folder (2.17.1's fix), plain-words report, honest about what was not checked. 1. It skipped the plan anyway ("the request already listed every field"): no questions beyond setup's, no roadmap, defaults chosen for the owner. 2. So no feature workflow: no conductor, builder branch, reviewer or challenger; the flight report flagged "code edited without the feature workflow". Phases M and S went untested. 3. Git had no author; the owner said "use my GitHub username" and got a made-up name and email. 4. The accessibility test called a native date box a keyboard trap (its parts take several Tabs). 5. Failed commands showed up as "blocked". 6. Session start: model field "absent". | 2.17.2 |
