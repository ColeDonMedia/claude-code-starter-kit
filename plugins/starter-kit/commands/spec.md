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
- **Security** — what's protected, the main threats and the defence for each, as testable criteria, and which
  features count as high-risk
- **Roadmap** — 3 to 10 features in build order, smallest useful version first, each with its criteria
- **Not now** — what is deliberately left for later
- **Assumptions** — every default you picked, so they can correct any of them
Ask the user to approve or correct it. Don't build until they do.

## 9. Save and hand off
On approval, write `ROADMAP.md`: one checkbox per feature, in order (`- [ ] Feature name — one-line goal`), with
that feature's acceptance criteria (including its security criteria, and a `high-risk` tag where it applies)
indented beneath it. Commit it. Then build the items in order with
`/starter-kit:feature`, one at a time: tick each box when it's merged, tell the user in a line or two what now
works and how to see it, and carry on to the next without being asked. Stop only for a real decision, a failing
check you cannot fix, or when the list is done.
