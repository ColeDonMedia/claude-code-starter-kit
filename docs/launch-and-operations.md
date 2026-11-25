# Launch, operations and legal

[← Back to the README](../README.md) · [All documentation](README.md)

## Going live (`/starter-kit:launch`)

An agency doesn't launch by pushing a button and hoping. For the first public launch, Claude sets up what they set up and writes it
into `RUNBOOK.md`:

- separate test and live environments, each with its own keys
- deploys that come from git, not from someone's laptop
- error tracking, and an uptime check that emails you
- daily backups that have actually been restored once, and a rollback that has been practised
- the domain and HTTPS, and a cost estimate with spending alerts
- for apps that take money: a payments checklist (which key goes where, test keys until launch, a webhook secret per environment,
  failed-payment tests, prices decided on the server)

`scripts/runbook-check.mjs` refuses an incomplete runbook: every section filled in, the restore test and rollback practice dated,
no secret value anywhere. Claude does the technical work and guides you only through what needs your hands (creating accounts,
adding a payment method), and asks before anything that costs money or goes public.

## Staying healthy (`/starter-kit:maintain`)

The monthly visit, logged in `MAINTENANCE.md`:

- updates (major versions are left for you to decide), through the normal build-and-review workflow
- a security re-check, backup and restore dates, errors, speed and cost
- real user numbers compared with the plan's size, and a re-test before they are reached

The session start tells Claude when 30 days have passed since the last visit, so you don't have to remember.

## Legal basics, licenses, analytics and feedback (`/starter-kit:legal`)

Most launch embarrassments are not exotic: no privacy policy, a policy that says something the app does not do, careless handling
of children's data, or a library whose license forbids commercial use.

- `PROJECT.md` keeps a **data inventory** (what personal data, why, where it goes, who sees it, how it is deleted) that every
  feature must keep true.
- Claude works out which rules apply (privacy, terms, cookies, children, people's rights to see and delete their data, payments,
  email, accessibility law, AI disclosure, app stores, regulated areas) from current sources, drafts the privacy policy and terms
  from how the app really behaves, and builds the missing features (deletion, export, consent).
- Drafts carry a DRAFT banner and leave `[Company legal name]`-style gaps for you; the launch check refuses placeholders.
- `scripts/license-check.mjs` reads the licenses of the libraries you ship, flags restrictive ones (GPL, AGPL, non-commercial) and
  ones with no license, and writes the attribution list.
- The plan also decides how success will be measured (a privacy-friendly analytics tool or plain counts) and gives users a way
  to send feedback.

Limits: Claude can't create accounts or pay for you; a restore test needs a real scratch database; cost figures are estimates from
the pricing pages of the day; legal documents are AI drafts and screening tools, not legal advice, so a lawyer must review them,
and apps handling health, finance or children need a professional.
