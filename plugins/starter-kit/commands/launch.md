---
description: Use for the FIRST launch of an app that real people will use (after the pre-ship scan passes). Sets up what an agency sets up at go-live: separate test and live environments, automated deploys, error tracking, uptime alerts, tested backups, a practised rollback, a cost estimate, and a RUNBOOK.md.
---

Take this project live properly: $ARGUMENTS

A launch is where careless work becomes a public failure. This is the checklist a good agency runs before a client's first day
live. The user is not a programmer: you do the technical work and guide them through only what needs their own hands (creating
accounts, adding a payment method, pasting keys into a hosting dashboard). Never ask them to paste a secret into the chat, never
put a secret value in any file, and ask before anything that costs money or creates an account.

## 0. Before you start
- `node "<SCRIPTS>/roadmap-check.mjs" --project . --acceptance` must show nothing waiting (the owner has tried every finished
  milestone), and `/starter-kit:full-scan` must have passed. If the app has sign-in, payments, personal data or uploads, the
  red team (`/starter-kit:redteam`) must have run, and `node "<SCRIPTS>/legal-check.mjs" --project .` must pass (privacy policy, terms and
  the data inventory; `/starter-kit:legal` builds them). If not, do those first.
- Read `PROJECT.md` for the stack and `CLAUDE.md` for the commands. Pick the hosting that fits the stack and the owner's budget;
  if undecided, have the `researcher` agent compare current options and prices (cheap and simple wins) and give the user a recommendation.

## 1. Separate environments
Development (this computer), a preview/staging copy that looks like the real thing, and production. Each has its OWN database
and its OWN keys; staging never touches live data. List the setting NAMES each environment needs in RUNBOOK.md ("Environments and
settings"), never the values. Values go into the host's settings page, put there by the user.

## 2. Automated, repeatable deploys
Deploys come from git, not from someone's laptop: merging to `main` updates staging automatically; production is a deliberate
second step (a promote button, or a tagged release). Use the host's own git integration, or an official-actions-only workflow
in `.github/workflows/` (read-only permissions, secrets only from the host's secret store). Write the steps into "How to deploy".

## 3. Know when it breaks
- **Errors:** add an error-tracking service with a free tier. Vet the package first (`node "<SCRIPTS>/pkg-check.mjs"`), scrub personal data
  from what it records, and make sure a test error shows up.
- **Uptime:** set a check that visits the home page and one important page every minute or two, and emails the owner on failure.
- **Where to look:** put the dashboard links and what "normal" looks like in "Monitoring and alerts".

## 4. Backups that have been restored
Turn on automatic daily database backups (and file/upload storage backups if the app has uploads), with a retention period.
Then ACTUALLY RESTORE one into a scratch database and check the data is there. A backup nobody has restored is only a hope.
Write the steps, and `Restore last tested: <today's date>`, under "Backups and restore".

## 5. A rollback you have practised
Write how to undo a bad deploy (redeploy the previous version; and for database changes, how they are reversed or why they are
safe to leave). Practise it once on staging. Write the steps and `Rollback last practiced: <today's date>` under "How to roll back".

## 6. The front door
Domain and DNS, HTTPS only with an automatic certificate, www/non-www redirect, the security headers and CORS settings the security
reviewer's launch checklist lists. Test the live staging address, not just localhost.

## 7. Costs and limits
Estimate the monthly cost at the expected traffic from CURRENT pricing pages (say they are estimates and when you checked), set a spending
alert on every paid service, and note each free-tier limit and what happens when it is reached ("Costs and limits").

## 7b. Measure and listen
Set up what the plan promised: the analytics (or counts) behind the success measures, with consent handled as `/starter-kit:legal` decided,
and a visible way for users to report a problem or send feedback that lands in an inbox the owner actually reads. Write where to look
for the numbers into "Monitoring and alerts" and the first date to review them against the goals.

## 8. Write RUNBOOK.md
Create it from this template; every section filled in, plain words, no secret values, and a line `Launched: <date>` right under the title once it goes live:
```markdown
# Runbook — <project>
## Overview
<where it runs, the live address, how the pieces fit, who to contact>
## Environments and settings
<each environment, and the NAMES of the settings it needs and where they are set>
## How to deploy
<exact steps, staging then production>
## How to roll back
<exact steps>
Rollback last practiced: YYYY-MM-DD
## Backups and restore
<what is backed up, how often, kept for how long, the restore steps>
Restore last tested: YYYY-MM-DD
## Monitoring and alerts
<error tracking, uptime checks, who is alerted, where to look first>
## Common problems
<symptom — likely cause — what to do>
## Costs and limits
<monthly estimate, alerts, free-tier limits>
## Accounts
<which services have accounts and who owns each; never passwords or keys>
```
Run `node "<SCRIPTS>/runbook-check.mjs" --project .` and fix every problem it prints.

## 9. The go-ahead
Do a final smoke check against the live-like staging address (the home page loads, sign-up works, the error alert fires on a test
error). Then tell the user, in plain words, what is ready, what it will cost, and what you are about to do, and ASK for the go-ahead
before the first production deploy: going live is public and hard to take back. After it, add the `Launched:` line, watch the
first error reports and uptime for a while, and add a line to `CHANGELOG.md` and `HANDOFF.md`. Then `/starter-kit:legal` should be
done (privacy policy, terms) if it has not been already.
