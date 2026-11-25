---
description: Use BEFORE building a new app or a large or vague feature. Turns the idea into a short approved plan (research, stack, design, testable acceptance criteria, roadmap) so the build comes out right the first time.
---

Turn this into a build-ready plan: $ARGUMENTS

Goal: get it right BEFORE any code, because fixing a wrong assumption later costs far more than asking now.
The user is not a programmer: you make the technical choices and explain them in a line each.

## 1. Look first, ask second
Read CLAUDE.md and skim the project (manifest, folders, existing screens or routes). Don't ask what you can see.

## 2. Ask once, with defaults
Send ONE message with at most 6 plain-language questions, each with your proposed default so the user can just
say "yes". Ask only about what they'd care about: who it's for, the one thing it must do well, must-haves versus
later, phone, computer or both, whether people sign in, anything it must connect to, budget or deadline, and (if it
has a screen) two or three apps whose look they like and one they dislike.
Always include ONE question about size, because it decides how the app is built: "Will this run on each person's own computer,
or online for everyone? About how many people in a year, and how many using it at the same moment at the busiest time? What
does it cost you if it is down for an hour?" Offer your guess as the default (for example "a free download, a few thousand
people, one at a time each" or "a business tool: 2,000 accounts, 200 at once, an hour down costs money").
Never ask them to choose technology. Then wait. If they say "you decide", use your defaults and say so.

## 2b. Size it
Write the answers into the scale profile: `node "${CLAUDE_PLUGIN_ROOT}/scripts/scale-profile.mjs" --project . --set kind=<web|saas|api|desktop|cli|mobile|library|game> usersTotal=<n> usersPeak=<n> downtime=<minutes|hour-costs-money|never>`
(add `actionsPerMinute`, `recordsPerUser`, `realtime=true` when you know them). It prints the numbers that follow (requests a
second at the busy moment, table sizes after a year, connections) and what to build, test and deliberately skip at that size.
Choose the stack and design to fit it: a one-person desktop app gets no servers, queues or caches; a big SaaS gets them from the
start. Don't build for a size the owner did not ask for, in either direction.

## 3. Research (new apps and unfamiliar territory; skip for a small feature)
Launch two or three starter-kit `researcher` agents (they run on cheap, fast Haiku), one per angle, in parallel with
your own reading of the code. Check their claims yourself before using them, and re-check prices, legal or privacy
rules and security advice with a stronger model (the same agent with `model` set to `sonnet`). They find: 4–6
competing or similar products, what every one of them has (table stakes), and what users complain about. Use the
result in the gap check. If there are no web tools, say so and continue.

## 4. Choose the stack (new projects only)
Pick boring, widely used, well-documented technology that suits the product and can be hosted cheaply. One line
per choice with the reason. Check the current stable versions from the official docs or package registry — never
from memory. Prefer what the project already uses.

## 5. Compare with the existing code (when there is code)
Mark each requirement: already works, partly there, missing, or conflicts with how the code is built. Reuse
existing patterns and name the files you'd extend.

## 6. Gap check
Check the idea against what people expect and what usually gets forgotten. Mark each: add, later, or not needed.
- Screens and states: empty, loading, error, offline, success; not-found and no-permission pages
- Accounts: sign-up, sign-in, password reset, roles, who can see or change what
- Data: validation, limits, duplicates, deletion, export, backup
- Money and email, if any: failure paths, receipts, retries
- Phones: small screens, touch targets, slow connections
- Accessibility: keyboard use, contrast, labels
- Security and privacy: secrets, user data, rate limits, children's data if relevant
- Running it: settings it needs, where it's hosted, how the owner sees errors
- Table stakes from the research that the plan lacks

## 6b. Threat check (security designed in, not bolted on)
Spend a few minutes thinking like an attacker, before any code, and write the result into the plan:
- **What's worth protecting?** Personal data, payments, private content, accounts, admin powers.
- **Who could misuse it?** A stranger, a signed-in user reaching another user's data, a bot, someone with a stolen
  password, a malicious file or message sent to the app.
- **The likely attacks for this kind of app** and the defence for each. For example: one user reading another's data
  (permission checks on every endpoint and row-level rules in the database), guessing or stealing passwords (rate
  limits, hashed passwords), injected input (validated input and parameterized queries), leaked keys (secrets in
  environment variables only), abuse of expensive actions (rate limits and quotas), unsafe uploads (type and size
  limits, stored privately).
- Turn each defence into a **security acceptance criterion** a test can prove ("user A requesting user B's
  recipe gets a 403, not the recipe"; "the 6th wrong password in a minute is refused"). They go into the roadmap
  with the feature they belong to, and the security-reviewer checks they have tests.
- Name the **riskiest features** (sign-in, payments, uploads, anything touching other people's data). They get a
  security review as soon as they're built, not only at the end.

## 7. Design brief (anything with a screen)
Write `DESIGN.md` (about 25 lines, each part under its own heading: Feel, Colors, Type, Spacing, Components, Speed feel, References, Quality bar) so every screen looks like one product. "High end" is taste, so start from the user's:
ask in step 2 which two or three apps they like the look of and one they dislike, look at those (use a browser tool if you
have one, otherwise the product's own pages) and write what you see into a `References` section: what each does well
(spacing, hierarchy, density, motion) and what to avoid. Then write: the feel in three words, colors as lines like
`background: #ffffff`, `text: #111111`, `muted: #555555`, `accent: #2563eb`, `error: #b00020` (text at least 4.5:1 on the
background), one or two fonts and a size scale, spacing scale, corner and shadow style, component rules (buttons, inputs,
cards), the layout at phone and desktop widths, a `Speed feel` section (a tap shows a result or a pressed state within 100 ms; a skeleton
or the previous data instead of a blank screen; actions save optimistically; images and embeds reserve their space so nothing jumps; one
spinner at most per screen), and a `Quality bar` section: one primary action per screen, a clear visual
hierarchy, a real empty/loading/error state on every screen, no placeholder text, specific microcopy ("Save recipe", not
"Submit"), motion short and subtle, nothing that looks like an unstyled browser default. Use the project's existing design
system if it has one. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/design-check.mjs" --project .` and fix what it reports. Every later screen follows this
file, and the ui-reviewer scores each screen against the Quality bar.

## 8. Present the plan — short, plain words
- **Goal** — one sentence
- **How it works for the user** — numbered steps
- **Built with** — the stack, one line each
- **Acceptance criteria** — observable, testable statements ("a visitor can reset their password by email
  and sign in with the new one"). Each becomes a test.
- **Security** — what's protected, the main threats and the defence for each, as testable criteria, and which
  features count as high-risk
- **How we'll know it worked** — two or three measurable goals tied to why the user wants this ("20 bookings in the
  first month", "a visitor can finish signing up in under a minute"). Ask what success looks like if they haven't said.
- **Roadmap** — 3 to 10 features in build order, smallest useful version first, each with its criteria and a size
  (`[S]` a few hours of work, `[M]` about a day, `[L]` several days: your honest guess, labelled as a guess), grouped
  into milestones of about three features. Each milestone ends with the user trying it and saying whether it is what they wanted.
- **Size** — in plain words, from the scale profile: how many people, how many at once, what that means in numbers, and what
  will be built (and deliberately not built) because of it. Then how it will be proven: an app on the user's own computer gets a
  start-up, memory and download check; an online app gets its database rehearsed at the one-year size and a local load test at
  the target rate (and, for big apps, the same test on the host's staging copy, run or approved by the owner).
- **Real-world checks** — for anything with a screen: the three to five user journeys that must always work (sign up,
  sign in, the core action) will be end-to-end tests that click through the running app at phone and desktop sizes, and the
  app gets a **speed budget**: on a mid-range phone on slow 4G the main content shows in 2.5 s, nothing jumps around, a tap answers within 100 ms
  and finishes within a second, and an API answer takes under 200 ms (say which pages and actions matter most, and ask whether anything
  needs to be faster; write them into `.claude/speed.json`). Lists are always paged, and slow work (email, reports, images) runs in the background. Say so in the plan.
- **Measuring and listening** — how the success goals will be measured once it is live (a privacy-friendly analytics tool, or simple
  counts from the app's own database, so no needless tracking), the few events that matter (sign-up, the core action), and how users
  can reach the owner (an in-app "Report a problem" or "Send feedback" that reaches an inbox the owner reads). Check current options and
  prices from their own pages before naming a service.
- **Rules that apply** — whether personal data, children, payments or an AI model are involved, because each brings legal duties
  (`/starter-kit:legal` works them out before launch). Start the `Data inventory` in `PROJECT.md` now.
- **Biggest risks** — the top five, each with what would trigger it and what you'd do (a service that may refuse
  approval, a hard feature, a cost that could grow, a rule that may apply, something only the user can supply)
- **Not now** — what is deliberately left for later
- **Assumptions** — every default you picked, so they can correct any of them
Ask the user to approve or correct it. Don't build until they do.

## 9. Save and hand off
On approval, write the project's memory so any later session can pick up with full context:
- `ROADMAP.md`: milestones, each a heading `## Milestone 1 — what the user can do by then` followed by the line
  `Accepted: pending`, then one checkbox per feature, in order (`- [ ] Feature name [M] — one-line goal`), with that
  feature's acceptance criteria (including its security criteria, and a `high-risk` tag where it applies) indented
  beneath it as unticked checkboxes. A box is ticked later, and only with proof: `- [x] Name — goal (merged <commit>)` and, per
  criterion, `→ test: <file>::<test name>` or `→ manual: <how it was checked>`. A hook rejects ticks without proof.
- `PROJECT.md` (the master document): what it is, the stack and why, how to run it, the architecture map, the
  decisions made in this planning (with the reasons and what was rejected), current state, known problems, next steps,
  plus `## Success measures` and `## Risks` (one line each, as agreed in the plan).
- `DECISIONS.md`: append-only, one line per decision with an id (`- <date> — <decision> {#D-001}, because <reason>; rejected: <alternative>`;
  next number from `node "${CLAUDE_PLUGIN_ROOT}/scripts/notes-graph.mjs" --project . --next-id D`); record the planning decisions in it now. Give each roadmap
  feature an id (`{#F-001}`) and have it point at the decisions it follows (`[[D-001]]`). A decision that is replaced later gets
  `status: superseded by [[D-nnn]]` (or `status: reversed`) on its old line. Add a `## Map` heading to `PROJECT.md` (one line per folder or key file) as soon as code exists.
- `HANDOFF.md` and `CHANGELOG.md`: start them as described in `/starter-kit:init` if they don't exist.
Commit them. Then build the items in order with `/starter-kit:feature`, one at a time: after each merge the records
are updated (see that command), tell the user in a line or two what now works and how to see it, and carry on to
the next without being asked. When the last feature of a milestone is merged, run `/starter-kit:accept` before building
the next milestone. Stop only for a real decision, a failing check you cannot fix, a milestone waiting for the user's
OK, or when the list is done.

## 10. When the user changes their mind (change control)
A new idea or a changed requirement is normal; surprises are not. Before building anything that wasn't in the approved plan:
say in plain words what it adds or delays (a size, and which milestone it moves), whether it replaces something, and what
you recommend (now, later, or not at all). Once they decide, update `ROADMAP.md`, record the decision and its reason in
`PROJECT.md` (Decisions), and carry on. Never quietly absorb extra scope, and never drop an agreed feature without saying so.
