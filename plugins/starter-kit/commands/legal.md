---
description: Use before a public launch, when the app collects any personal data, or when the user asks about privacy policy, terms, cookies, children's data, or whether something is legal. Works out which rules apply, drafts the documents from how the app really works, and checks library licenses.
---

Get the legal basics right for this project: $ARGUMENTS

You are not a lawyer and say so, but most launch failures here are not exotic: no privacy policy, a policy that says something the app
doesn't do, collecting children's data carelessly, or a library whose license forbids commercial use. Work from FACTS about the app,
never from boilerplate.

## 1. The data inventory (the foundation of everything below)
Open `PROJECT.md`'s `## Data inventory` section. If it is missing or thin, build it by reading the code, forms, database schema and
third-party services the app calls (analytics, payments, email, error tracking, hosting, sign-in providers), then show the user the
table and ask them to correct it. One row per kind of personal data: **what** (email, name, IP address, payment details, photos,
location, messages, device id, cookies), **why**, **where it is stored and which services receive it**, **who can see it**,
**how long it is kept**, **how a person can have it deleted**. If the app collects none, write "No personal data is collected."

## 2. Which rules apply
Ask where the owner's customers live and where the business is based (two plain questions). Then use the `researcher` agent to check
CURRENT rules, because laws change; every claim needs a link and a date. Mark each line **applies / doesn't / unsure**:
- Privacy policy (almost always); terms of service; cookie and tracking consent (needed in the EU and UK and some other places for
  non-essential cookies and most analytics)
- Children: US COPPA (under 13), UK Children's Code, GDPR rules for minors. If young people can use the app, this changes what
  you may collect and how consent works; flag it loudly
- People's rights to see, export and delete their data (GDPR, CCPA/CPRA and similar): these become features
- Payments: use a hosted checkout so card numbers never touch your servers (this keeps you in the lightest compliance tier)
- Email: unsubscribe link and honest sender (CAN-SPAM, GDPR); SMS needs explicit opt-in
- Accessibility law (ADA in the US, European Accessibility Act): aim for WCAG 2.2 AA
- AI features: tell users they are talking to an AI where the law or the platform says to; don't send private data to an AI service you haven't listed
- App stores: Apple privacy labels and Google data-safety forms must match the inventory
- User-generated content: a way to report it and take it down
- Regulated areas: health (HIPAA), finance, education, anything for minors. If one applies, tell the owner a professional is needed
- Sales tax or VAT on what is sold: an accountant's job; say so
Present the result as a short table, in plain words, with what is required before launch versus what can follow.

## 3. Draft the documents
Create `legal/PRIVACY_POLICY.md` and `legal/TERMS.md` (and a cookie notice if section 2 says one is needed) from the inventory and the
real behavior of the app: name every service that receives data, the real retention and deletion, how to contact the owner. Rules:
- Start each with the banner `> DRAFT — written by an AI assistant from how this app actually works. Not legal advice. Have a lawyer review it before relying on it.`
- Never invent facts about the owner. Leave `[Company legal name]`, `[Contact email]`, `[Postal address]` for the user to fill in (the launch check refuses to pass while placeholders remain).
- Never promise what the app doesn't do ("we never share your data") unless you verified it in the code and the inventory.
- Replace the banner with `Reviewed by: <name, date>` only when the owner tells you a professional has reviewed it.

## 4. Make the app match
Everything the policy promises must exist: footer links to the documents; a consent banner only if needed (and nothing non-essential
loads before consent); account deletion and data export if section 2 requires them; an unsubscribe link in emails; the report-content
button. These are normal features: build each through `/starter-kit:feature` with its own tests.

## 5. Library licenses
Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/license-check.mjs" --project .` (after installing dependencies). Restrictive licenses (GPL, AGPL, non-commercial, source-available)
and libraries with no stated license are problems: replace them or have the owner decide. Generate the attribution list with `--notices` into
`THIRD_PARTY_LICENSES.md` and link it from the app's about or legal page.

## 6. Check and record
Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/legal-check.mjs" --project .` and fix what it reports. Add a "Legal" note and any open items to `PROJECT.md` and
`HANDOFF.md`, and a line to `CHANGELOG.md`. Tell the user in plain words what is done, what only a lawyer can settle, and what they must fill in.
