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
later, phone, computer or both, whether people sign in, anything it must connect to, budget or deadline.
Never ask them to choose technology. Then wait. If they say "you decide", use your defaults and say so.

## 3. Research (new apps and unfamiliar territory; skip for a small feature)
Launch the starter-kit `researcher` agent, in parallel with your own reading of the code, to find: 4–6 competing
or similar products, what every one of them has (table stakes), and what users complain about. Use the result in
the gap check. If there are no web tools, say so and continue.

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

## 7. Design brief (anything with a screen)
Write `DESIGN.md` (about 15 lines) so every screen looks like one product: the feel in three words, colors
(background, text, one accent, success/warning/error; contrast at least 4.5:1), one or two fonts and a size
scale, spacing scale, corner and shadow style, component rules (buttons, inputs, cards), and the layout at phone
and desktop widths. Use the project's existing design system if it has one. Every later screen follows this file.

## 8. Present the plan — short, plain words
- **Goal** — one sentence
- **How it works for the user** — numbered steps
- **Built with** — the stack, one line each
- **Acceptance criteria** — observable, testable statements ("a visitor can reset their password by email
  and sign in with the new one"). Each becomes a test.
- **Roadmap** — 3 to 10 features in build order, smallest useful version first, each with its criteria
- **Not now** — what is deliberately left for later
- **Assumptions** — every default you picked, so they can correct any of them
Ask the user to approve or correct it. Don't build until they do.

## 9. Save and hand off
On approval, write `ROADMAP.md`: one checkbox per feature, in order (`- [ ] Feature name — one-line goal`), with
that feature's acceptance criteria indented beneath it. Commit it. Then build the items in order with
`/starter-kit:feature`, one at a time: tick each box when it's merged, tell the user in a line or two what now
works and how to see it, and carry on to the next without being asked. Stop only for a real decision, a failing
check you cannot fix, or when the list is done.
