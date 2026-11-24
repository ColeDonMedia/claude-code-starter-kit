---
description: Use BEFORE building a new app or a large or vague feature. Turns the idea into a short spec with testable acceptance criteria and a gap check, so the build comes out right the first time.
---

Turn this into a build-ready spec: $ARGUMENTS

Goal: get the requirements right BEFORE any code, because fixing a wrong assumption later costs far more
than asking now. Keep it short — a spec a person can read in two minutes.

## 1. Look first, ask second
Read CLAUDE.md and skim the project (manifest, folder layout, existing screens or routes). Don't ask
what you can see. For a brand-new project, note the stack from CLAUDE.md or propose one in a sentence.

## 2. Ask once, with defaults
Send ONE message with at most 6 questions, each with your proposed default so the user can just say
"yes". Cover only what you can't infer: who it's for, the one core flow, must-haves versus later,
platforms (web, mobile, both), data it stores, whether users sign in, and hard constraints (budget,
deadline, existing services). Then wait. If the user says "you decide", use your defaults and say so.

## 3. Gap check
Before writing, check the idea against what people expect and what usually gets forgotten. Note each gap
as: add it, defer it, or not needed (with a reason).
- Screens and states: empty, loading, error, offline, success; 404 and permission-denied pages
- Accounts: sign-up, sign-in, password reset, roles, who can see or change what
- Data: validation, limits, duplicates, deletion, export, backup
- Money and email, if any: failure paths, receipts, retries
- Phones: small screens, touch targets, slow connections
- Accessibility: keyboard use, contrast, labels
- Security and privacy: secrets, user data, rate limits, children's data if relevant
- Running it: environment variables, deploy target, logging, errors the owner will see
If the user wants to compare against competitors (or the product is new and the market is unclear),
run `/starter-kit:research` and fold its "table-stakes we're missing" list into this check.

## 4. Write the spec
Present, in the conversation (write a file only if the user asks):
- **Goal** — one sentence
- **Users and main flow** — numbered steps
- **Acceptance criteria** — a checklist of observable, testable statements ("a visitor can reset their
  password by email and log in with the new one"). Each one will become a test.
- **Out of scope** — what is deliberately left for later
- **Assumptions** — every default you picked for the user, so they can correct any of them
Then ask the user to approve or correct it. Don't start building until they do.

## 5. Hand off
On approval, run `/starter-kit:feature` with the approved spec as the brief (for a large app, split it
into a few features, each with its own acceptance criteria, and build them in order). Tell the
implementer to write one failing test per acceptance criterion.
