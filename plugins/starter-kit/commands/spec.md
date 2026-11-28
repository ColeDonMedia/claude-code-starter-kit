---
description: Use BEFORE building a new app or a large or vague feature. Turns the idea into a short approved plan (research, stack, design, testable acceptance criteria, roadmap) so the build comes out right the first time.
---

Turn this into a build-ready plan: $ARGUMENTS

## Scope
- **Job:** turn an idea, or an app already partly built, into one approved plan and roadmap.
- **Starts when:** a new app, a large or vague feature, or code with no `ROADMAP.md`.
- **May:** read the project, ask one round of questions with defaults, research, choose or offer the stack, write the plan and the records.
- **Must not:** write app code, ask the owner technology questions outside the plan, re-plan what already works, or build before approval.
- **Done when:** the owner approved the plan and `ROADMAP.md`, `PROJECT.md` and `DECISIONS.md` are written and committed.
- **Hands back:** the plan in plain words, then the build starts with the first roadmap item.

Goal: get it right BEFORE any code, because fixing a wrong assumption later costs far more than asking now.
The user is not a programmer: you make the technical choices and explain them in a line each.

**A small app or tool** (one or two screens, a few features, no accounts, payments or other people's data) gets a SHORT plan, never
none: one message of at most four questions with defaults (include the size question and two or three apps whose look they like,
or "you pick"), no research agents unless the owner asks, a plan that fits on one screen (what it does, the defaults you chose,
what it will not do), and a roadmap of one milestone. A detailed request is not a reason to skip this: the owner must see and
correct your defaults before any code. In a new project a hook refuses app code until `ROADMAP.md` exists.

**Taking over an app that is already partly built** (code but no `ROADMAP.md`, or "finish / continue / pick up this app"): read
`${CLAUDE_PLUGIN_ROOT}/procedures/spec-takeover.md` and follow it before the steps below. Never start over or re-plan what works.

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
Don't ask technology questions here: the plan offers the stack choice (step 4). Then wait. If they say "you decide", use your defaults and say so.

## 2b. Size it
Write the answers into the scale profile: `node "${CLAUDE_PLUGIN_ROOT}/scripts/scale-profile.mjs" --project . --set kind=<web|saas|api|desktop|cli|mobile|library|game> usersTotal=<n> usersPeak=<n> downtime=<minutes|hour-costs-money|never>`
(add `actionsPerMinute`, `recordsPerUser`, `realtime=true` when you know them). It prints the numbers that follow (requests a
second at the busy moment, table sizes after a year, connections) and what to build, test and deliberately skip at that size.
Choose the stack and design to fit it: a one-person desktop app gets no servers, queues or caches; a big SaaS gets them from the
start. Don't build for a size the owner did not ask for, in either direction.

## 3. Research (new apps and unfamiliar territory; skip for a small feature)
Launch two or three starter-kit `researcher` agents (they run on cheap, fast Haiku), one per angle, in parallel with
your own reading of the code. Run every report through `node "${CLAUDE_PLUGIN_ROOT}/scripts/cite-check.mjs" --file <the report,
saved in your scratchpad>` and drop or re-source each NOT FOUND claim before using it. Check their claims yourself, and re-check prices, legal or privacy
rules and security advice with a stronger model (the same agent with `model` set to `sonnet`). They find: 4–6
competing or similar products, what every one of them has (table stakes), and what users complain about. Use the
result in the gap check.
For an app meant to be sold or to win users (not a private tool), also read `${CLAUDE_PLUGIN_ROOT}/procedures/spec-market.md` and
run the market check it describes: demand, buyers, gaps, a verdict (**build it**, **build it narrower**, **pivot** or **think
again**) and the cheapest real demand test. For an app that will be hosted, sold in a store or use paid services, also read
`${CLAUDE_PLUGIN_ROOT}/procedures/spec-costs.md` and run the cost check: every price from the provider's own page, the arithmetic
by `cost-model.mjs`. If there are no web tools, say so and continue.

## 4. Choose the stack (new projects only)
First run `node "${CLAUDE_PLUGIN_ROOT}/scripts/presets.mjs" --match --project .`: the kit has tested recipes for common kinds of
app. If one FITS and the plan needs nothing it lists under "Not for", use it (`--show <id>` prints it): its stack, versions,
commands, host, accounts and settings go into the plan as they are, and the first roadmap feature is "set up from the
`<id>` recipe". Say in the plan that a recipe was used and which. Otherwise (NO RECIPE, or the plan needs what a recipe is not
for), choose freely: pick boring, widely used, well-documented technology that suits the product and can be hosted cheaply. One
line per choice with the reason.
Offer the owner the choice inside the plan, never as a separate question: your recommended stack first (a fitting recipe when there
is one, since it is tested), then one or two real alternatives, each with two or three plain pros and cons (cost to host, speed,
how common it is so help is easy to find, what it is good and bad at, whether a kit recipe covers it). Approving the plan accepts the
recommendation. If the owner picks an alternative or names their own (any language, C++ included), use it: no recipe applies,
the free-choice rules below do, and the plan says that set-up is not pre-tested. Check the current stable versions from the official docs or package registry — never
from memory. Prefer what the project already uses.
Check what this computer has before relying on it (`docker --version`, `git --version`, the browsers Playwright needs): every
criterion must be provable here. Don't choose Docker for local development or proof unless it is installed or the host requires it.
A criterion this computer cannot prove (a container build, another operating system) is either reworded to what it can prove ("a
backup restores into a fresh local copy and the data is there") or marked to be proven by a named GitHub job (`→ ci:` in the
roadmap); say which in the plan, so the owner knows those parts are only proven after the first push.

## 5. Compare with the existing code (when there is code)
Mark each requirement: already works, partly there, missing, or conflicts with how the code is built. Reuse
existing patterns and name the files you'd extend. If `node "${CLAUDE_PLUGIN_ROOT}/scripts/model-route.mjs" --project . --role scout --feature "<the idea>"`
prints SCOUT USE, first have the `scout` agent point at what already exists that the idea overlaps.

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
Spend a few minutes thinking like an attacker, before any code, and write the result into the plan. First run
`node "${CLAUDE_PLUGIN_ROOT}/scripts/cards.mjs" --match "<the whole idea>"`: for each CARD it prints (customers' data kept apart,
payments, sign-in, roles, background jobs, email), read it and turn its tests into acceptance criteria of the features they belong to.
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
Use the project's existing design system if it has one. Otherwise run `/starter-kit:design`: it looks at the apps the owner likes,
searches the kit's style library (89 styles, 194 contrast-checked palettes, 74 font pairings) for two or three directions that fit
the product and those references, shows them side by side for the owner to pick, and writes `DESIGN.md` (Feel, Colors, Type,
Spacing, Components, Speed feel, Accessibility, References, Quality bar), which must pass `design-check.mjs`. Every later screen follows
this file, and the ui-reviewer scores each screen against it. The accessibility target is WCAG 2.2 AA unless the owner needs more.

## 8. Present the plan — short, plain words
- **Goal** — one sentence
- **How it works for the user** — numbered steps
- **Worth building?** (apps meant to sell or win users) — the verdict, the demand and buyers found, how crowded it is, the gap and
  what would be hard to copy, the recommended gap features and any pivots, each with its source
- **Built with** — the recommended stack, one line each, marked "kit recipe: <id>" when it is one; then the alternatives
  with their pros and cons, and "approving the plan keeps the recommendation; name another stack if you want it"
- **Running costs** (hosted, store or paid-service apps) — from the cost check: the minimum to begin, the recommended setup, what
  to invest, the bill at each size, when to upgrade each plan, break-even, the alternatives, free-tier limits, the date checked
- **Numbers and rules** — every number shown to users or used to decide something (monthly income, totals, counts, prices,
  tax, "active customer", "overdue"), each with one plain definition ("monthly income: paid invoices this calendar month,
  refunds subtracted"). Approving the plan approves the definitions; the same number must mean the same thing everywhere.
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
- **Screens** — for anything with a screen, one line per screen: its address, what it is for, the popups it opens, and for every list
  about how many items a busy user will have after a year (from the scale profile's records per user: "Invoices, /invoices, a list
  with a delete popup, about 500"). That number decides whether it needs search, filters, sort and paging, so the UI checklist judges
  against the plan, not against three rows of test data.
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
Before showing it, have it checked once (skip at `prototype` rigor): launch the `challenger` agent in plan mode, with the model
and effort `model-route.mjs --role challenger --mode plan` prints, giving it the draft plan, the scale profile and the decisions. Fix
what it finds, and bring the owner only the choices that are really theirs.
Ask the user to approve or correct it. Don't build until they do.

## 9. Save and hand off
On approval, write the project's memory so any later session can pick up with full context:
- `ROADMAP.md`: milestones, each a heading `## Milestone 1 — what the user can do by then` followed by the line
  `Accepted: pending`, then one checkbox per feature, in order (`- [ ] Feature name [M] — one-line goal`), with that
  feature's acceptance criteria (including its security criteria, and a `high-risk` tag where it applies) indented
  beneath it as unticked checkboxes. A box is ticked later, and only with proof: `- [x] Name — goal (merged <commit>)` and, per
  criterion, `→ test: <file>::<test name>` or `→ manual: <how it was checked>`, or `→ ci: <workflow file>::<job>` for what only GitHub can prove. A hook rejects ticks without proof.
- `PROJECT.md` (the master document): what it is, the stack and why, how to run it, the architecture map, the
  decisions made in this planning (with the reasons and what was rejected), current state, known problems, next steps,
  plus `## Success measures` and `## Risks` (one line each, as agreed in the plan), and `## One source`: one line per number and
  rule from the plan (`- Monthly income: <file>::<function> — the definition. Shown on: <file>, <file>`), the file and the files
  that show it filled in as they are built. Add `## Costs` (the totals and upgrade points) when the cost check ran, and commit
  `.claude/costs.json` with the plan.
- `DECISIONS.md`: append-only, one line per decision with an id (`- <date> — <decision> {#D-001}, because <reason>; rejected: <alternative>`;
  next number from `node "${CLAUDE_PLUGIN_ROOT}/scripts/notes-graph.mjs" --project . --next-id D`); record the planning decisions in it now. Give each roadmap
  feature an id (`{#F-001}`) and have it point at the decisions it follows (`[[D-001]]`). A decision that is replaced later gets
  `status: superseded by [[D-nnn]]` (or `status: reversed`) on its old line. Add a `## Map` heading to `PROJECT.md` (one line per folder or key file) as soon as code exists.
- `.claude/ui.json` (anything with a screen): the Screens list as `{ "screens": [{ "path": "/invoices", "name": "Invoices", "parts":
  ["list", "dialog", "messages"], "items": 500 }], "exceptions": [] }`. Parts come from `node "${CLAUDE_PLUGIN_ROOT}/scripts/ui-check.mjs" --parts`;
  `/invoices/:id` matches any one invoice. Every builder and reviewer works from it.
- `HANDOFF.md` and `CHANGELOG.md`: start them as described in `/starter-kit:init` if they don't exist.
- `.claude/rules/stack.md` when a recipe was used: `node "${CLAUDE_PLUGIN_ROOT}/scripts/presets.mjs" --write <id> --project .` (the
  stack's known mistakes and where its docs are; Claude Code reads it in every session).
- `.claude/rules/stack-guides-<stack>.md`, recipe or not: `node "${CLAUDE_PLUGIN_ROOT}/scripts/stack-guides.mjs" --write --project .` once the
  first setup has added the stack's files (add `--stack <name>` to write it before then).
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
