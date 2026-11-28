---
description: "Use for the FIRST launch of an app that real people will use (after the pre-ship scan passes). Sets up what an agency sets up at go-live (separate test and live environments, automated deploys, error tracking, uptime alerts, tested backups, a practised rollback, a cost estimate, and a RUNBOOK.md)."
---

Take this project live properly: $ARGUMENTS

## Scope
- **Job:** the first launch of an app real people will use, set up the way an agency would.
- **Starts when:** the pre-ship scan has passed and the owner wants it live for the first time.
- **May:** set up test and live environments, deploys, error tracking, uptime alerts, backups, rollback and `RUNBOOK.md`; guide the owner through accounts.
- **Must not:** put a secret in chat or a file, create accounts or spend money without asking, or go live without the owner's go-ahead.
- **Done when:** every launch item is done or listed as waiting on the owner, and the owner said go.
- **Hands back:** what is live, how to watch it, and how to roll back.

A launch is where careless work becomes a public failure. This is the checklist a good agency runs before a client's first day
live. The user is not a programmer: you do the technical work and guide them through only what needs their own hands (creating
accounts, adding a payment method, pasting keys into a hosting dashboard). Never ask them to paste a secret into the chat, never
put a secret value in any file, and ask before anything that costs money or creates an account.

## 0. Before you start
- Every job `roadmap-check.mjs --project .` lists as "proven only on GitHub" has passed on the pushed commit (`gh run list`, or the
  owner checks the repository's Actions tab); until then those criteria are not proven.
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/roadmap-check.mjs" --project . --acceptance` must show nothing waiting (the owner has tried every finished
  milestone), and `/starter-kit:full-scan` must have passed. If the app has sign-in, payments, personal data or uploads, the
  red team (`/starter-kit:redteam`) must have run, and `node "${CLAUDE_PLUGIN_ROOT}/scripts/legal-check.mjs" --project .` must pass (privacy policy, terms and
  the data inventory; `/starter-kit:legal` builds them). If not, do those first.
- Read `PROJECT.md` for the stack and `CLAUDE.md` for the commands. Pick the hosting that fits the stack and the owner's budget;
  if undecided, have the `researcher` agent compare current options and prices (cheap and simple wins) and give the user a recommendation.

## 1. Separate environments
Development (this computer), a preview/staging copy that looks like the real thing, and production. Each has its OWN database
and its OWN keys; staging never touches live data. List the setting NAMES each environment needs in RUNBOOK.md ("Environments and
settings"), never the values. Values go into the host's settings page, put there by the user.

## 1b. Payments (only if the app takes money: Stripe, Square, PayPal, Lemon Squeezy, Paddle ...)
Billing keys never go in the code or the repository, public or private (the secret guard and the pre-commit hook refuse them); the
code reads them by name from the environment, so billing works the moment the host has them. Check current details on the provider's
own docs pages before naming a setting. Work through this with the user, in plain words:
- **Which keys go where.** Server only, in the host's secret settings: secret keys (Stripe `sk_`), restricted keys (`rk_`, preferred:
  give the server only the permissions it uses), webhook signing secrets (`whsec_`), Square access tokens and application secret.
  Allowed in front-end code: the publishable key (`pk_`) and Square's application ID. Locally they live in `.env`; `.env.example` lists
  the names with empty values so the next person knows what to set.
- **Test first, live last.** Build and test everything with test-mode keys and the provider's test cards. Live keys are set only in the
  production environment's settings, by the user, at launch; staging keeps test keys.
- **Webhooks.** Each environment has its own webhook endpoint and its own signing secret. The handler verifies the signature on the raw
  request body, ignores events it has already processed (webhooks are retried), and answers quickly (slow work goes to a background job).
- **What happens when it fails.** Failed and retried payments, cancelled and expired subscriptions, refunds and disputes: each has a
  test in the test suite, using the provider's test events.
- **Prices are decided on the server**, never taken from the browser.
- **If a key ever leaked** (committed, pasted in a chat, shown in a log): roll it in the provider's dashboard now. Write the steps in
  RUNBOOK.md ("Common problems").
Record in RUNBOOK.md, under "Environments and settings", the NAMES of the payment settings per environment, never the values.

## 2. Automated, repeatable deploys
Deploys come from git, not from someone's laptop: merging to `main` updates staging automatically; production is a deliberate
second step (a promote button, or a tagged release). Use the host's own git integration, or an official-actions-only workflow
in `.github/workflows/` (read-only permissions, secrets only from the host's secret store). Write the steps into "How to deploy".
Pin every action to an exact commit: `git ls-remote https://github.com/<owner>/<action> refs/tags/<tag>` gives the hash; write
`uses: <owner>/<action>@<hash> # <tag>` (the kit's own checks flag any left unpinned).
Record what the release contains: for a Node project `npm sbom --sbom-format cyclonedx > sbom.cdx.json` (built into npm); for
other stacks skip it without mentioning it. The parts list is kept with the release so a later security alert can be checked against it in minutes.

## 3. Know when it breaks
- **Errors:** add an error-tracking service with a free tier. Vet the package first (`node "${CLAUDE_PLUGIN_ROOT}/scripts/pkg-check.mjs"`), scrub personal data
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
reviewer's launch checklist lists. Test the live staging address, not just localhost. Before that, run the LIVE lines of
`node "${CLAUDE_PLUGIN_ROOT}/scripts/sec-tools.mjs" --project . --url <the local copy's address>` (the kit's own header, CORS,
cookie and exposed-file checks, plus any extra scanner already on this computer).
For the public staging or live address, the owner can check headers at https://developer.mozilla.org/en-US/observatory (Mozilla's
own site scans it; the address becomes visible to Mozilla, nothing else is sent).

## 6b. Finishing touches
What separates a finished app from a prototype at first sight. Run the browser tests, then
`node "${CLAUDE_PLUGIN_ROOT}/scripts/ui-check.mjs" --project . --launch`: it adds the launch checks (favicon, page descriptions, link
previews) to the whole-app sweep and prints the launch list to go through by hand. Do each item, and check two things on the local
copy yourself: a mistyped address shows the app's own "page not found" page with a way home, and a forced server error shows a
friendly "something went wrong" page, never a stack trace or a blank screen (add a browser test for both, calling `checkpoint()`).
Every BLOCKING line is fixed before launch; also clear the UI items in PROJECT.md `Harden before launch`, or tell the owner which
are left and why.

## 7. Costs and limits
Check the costs again from CURRENT pricing pages: follow `${CLAUDE_PLUGIN_ROOT}/procedures/spec-costs.md` (re-check every price
`cost-model.mjs` calls STALE, add whatever the launch set-up added, such as error tracking or uptime checks), and run
`node "${CLAUDE_PLUGIN_ROOT}/scripts/cost-model.mjs" --project . --verify` until it passes. Tell the owner what changed since the plan.
Set a spending alert on every paid service, just above the recommended monthly figure, and write into "Costs and limits" the
estimate, the upgrade points (each as the number to watch: "move the database up at about 2,500 users"), each free-tier limit and
what happens when it is reached, and the date the prices were checked. Say they are estimates.

## 7b. Measure and listen
Set up what the plan promised: the analytics (or counts) behind the success measures, with consent handled as `/starter-kit:legal` decided,
and a visible way for users to report a problem or send feedback that lands in an inbox the owner actually reads. Write where to look
for the numbers into "Monitoring and alerts" and the first date to review them against the goals. Include real-user speed: the page-load
and responsiveness figures real visitors get on their own phones and networks (most privacy-friendly analytics and hosting dashboards
report Core Web Vitals; otherwise the free `web-vitals` library can send the three numbers to the same place as the counts, with no personal
data). Lab numbers from the speed test are a proxy; these are the truth, so write the first date to compare them with `.claude/speed.json`.

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
<monthly estimate, alerts, upgrade points, free-tier limits, date the prices were checked>
## Accounts
<which services have accounts and who owns each; never passwords or keys>
```
Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/runbook-check.mjs" --project .` and fix every problem it prints.

## 9. The go-ahead
Do a final smoke check against the live-like staging address (the home page loads, sign-up works, the error alert fires on a test
error). Then tell the user, in plain words, what is ready, what it will cost, and what you are about to do, and ASK for the go-ahead
before the first production deploy: going live is public and hard to take back. After it, add the `Launched:` line, watch the
first error reports and uptime for a while, and add a line to `CHANGELOG.md` and `HANDOFF.md`. Then `/starter-kit:legal` should be
done (privacy policy, terms) if it has not been already.
