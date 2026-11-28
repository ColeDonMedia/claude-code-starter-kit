# The cost check

Read by `/starter-kit:spec` (step 3) for every app that will be hosted, published in a store, or use a paid service, and by
`/starter-kit:launch` (step 7) to check the prices again before going live.

## Scope
- **Job:** work out what the app will cost to start and to run at every size, from prices on the providers' own pages.
- **Starts when:** planning an app that will be hosted, sold in a store or use paid services; or a launch re-checking its costs.
- **May:** launch researcher agents, fetch pricing pages, write `.claude/costs.json`, and run `cost-model.mjs` and `cite-check.mjs`.
- **Must not:** give a price from memory, do the arithmetic itself, open an account, or present an estimate as a quote.
- **Done when:** `cost-model.mjs --verify` passes and the plan has the running costs with the date the prices were checked.
- **Hands back:** the "Running costs" part of the plan, and `.claude/costs.json` for the launch to check again.

Prices change often and pages differ from what a model remembers, so no number in this check comes from memory. Every price is
quoted from the provider's own pricing page, a script checks the quote is on that page and that the number is in the quote, and a
second script does all the arithmetic. You choose what to compare and explain the result.

## 1. List every cost the app will have
Go through the plan and the scale profile, and write down every line that applies, including the ones that are free today (a free
plan has limits, and the limit is part of the answer). Leave out what doesn't apply, and say so in the plan.
- **Domain:** the first-year price AND the renewal price (they often differ), privacy for the owner's details, DNS hosting, and
  whether the name is a premium one. Certificates for https are usually free from the host; check.
- **Hosting:** the server, container or serverless plan; what each plan includes (memory, CPU, requests, run time, build minutes);
  paid team seats; extra regions; and the hidden lines: data sent out to users (egress), load balancers, public IP addresses,
  NAT gateways, log storage, snapshots.
- **Database:** the managed plan, storage, backups and point-in-time restore, connection limits, and a standby copy when an hour
  of downtime costs money (scale profile `downtime`).
- **Files and bandwidth:** stored GB, requests per thousand, data sent out, and a CDN when pages or files are heavy.
- **Email:** sign-up, password reset, receipts and notifications (transactional), counted per user per month; marketing email
  separately; a dedicated sending address if volumes need one; and the owner's own inbox, if the app needs a business address.
- **Texts (SMS):** the price per message for each country the users are in, the monthly phone-number rental, any registration
  fees the carriers require (in the US, business texting registration), and verification services if sign-in uses codes.
- **Sign-in:** the provider's price per monthly active user above its free amount, when sign-in is not built in.
- **AI and other APIs:** price per million input and output tokens (and cached input), images, speech; maps, search,
  geocoding. Count usage per user per month from the features that call them.
- **Free credits:** start-up credits and monthly free amounts, when they expire, and what the bill is once they have. Credits
  are never the running cost: plan with the price after them.
- **Payments:** the card percentage and fixed fee, extra for international cards and currency conversion, dispute fees,
  subscription billing and tax calculation add-ons, and the merchant-of-record alternative (a higher percentage that also handles
  sales tax and VAT). Payment fees come out of what customers pay; the report shows them apart.
- **Monitoring and backups:** error tracking, uptime checks, log retention, off-site backup storage.
- **Stores and signing:** developer accounts for app stores (yearly or one-time), code-signing certificates for desktop apps
  (yearly), notarisation requirements.
- **Tools:** paid plans for the code host, CI minutes beyond the free amount, and anything else the build or the owner needs.
- **Not covered, said plainly:** taxes, company registration, an accountant, insurance, and the owner's own time.

## 2. Estimate usage per user
From the plan's features and the scale profile, estimate per user per month: `emails`, `sms`, `storageMb` (all data kept: records
per user times their size, plus uploads), `egressMb` (page and file weight times visits), `payments`, `revenue` (what a user pays
a month, when it is sold), and any API amount (`aiInputTokens`, `aiOutputTokens`, `mapLoads`). Write each as an assumption in the
plan ("4 emails a user a month: sign-up, two notifications, a receipt"), so the owner can correct it.

## 3. Research the prices
Launch starter-kit `researcher` agents with `model` set to `sonnet` (prices are where a wrong answer costs money), one per angle:
**hosting, database and storage** (two or three real options that fit the stack and the scale profile; for example a VM host, a
platform host and a serverless host); **email, texts and sign-in**; **domain, APIs, AI, payments, stores, monitoring and tools**.
Tell each one: only the provider's own pricing page or its official price list, every price written as
`<claim> [source: <url> | "<the exact words on that page, with the number>"]`, the plan limits and free amounts too, and the
date. Where a provider publishes a machine-readable price list (for example AWS's Price List bulk files or Azure's Retail Prices
API, both public with no key), it is the most current source. Run each report through `cite-check.mjs` and drop or re-source every NOT
FOUND line. Pages that need scripts to show prices come back UNREACHABLE: re-source them from a page that loads without scripts,
or mark them "checked by hand" in the plan.

## 4. Write `.claude/costs.json` and run the model
One item per line from step 1, with its `category`, `provider`, `source`, `quote` (each plan can carry its own `quote`), and the
price: `billing` (`once`, `monthly`, `yearly`) with `price`; or `tiers` with `monthly`, `limits` (`peakUsers`, `storageGb`,
`egressGb`, or any usage total), `included` and `overage`; or `metered` (`per`, `free`, `unitPrice`, `unitSize`); or `percent`
of `revenue`. Alternatives for the same need share a `group` with different `option` names; mark the one you recommend
`"chosen": true` only after comparing them. The format is at the top of `${CLAUDE_PLUGIN_ROOT}/scripts/cost-model.mjs`. A plan's
`limits` are what the provider states or what the stack needs at that size (a server's people at once comes from the load test
assumptions in the scale profile): say which.
Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/cost-model.mjs" --project . --verify` and fix every PROBLEMS line. It prints:
- **Minimum to begin:** the smallest plans that fit the first users, a month.
- **Recommended:** the plans that fit the expected size with the scale profile's headroom, a month, payment fees shown apart.
- **To invest:** what is paid once, and the first year in total at both sizes.
- **At each size:** the monthly bill and cost per user from the start to ten times the expected size, with every alternative.
- **Upgrade when:** the user count at which each plan runs out of room, what to move to, and what it adds a month.
- **Break-even:** when what users pay covers the bill.

## 5. Put it in the plan
A **Running costs** part, in plain words, from the script's output and nothing else: minimum to begin, recommended and why, what
to invest, the size table, the upgrade points ("at about 2,500 users, move the database to the 4 GB plan: $45 more a month"),
break-even, the cheaper or simpler alternatives you did not pick and why, every free-tier limit and what happens when it is
reached (the service stops, or starts charging), what is not covered, and the date the prices were checked. Say these are
estimates from today's public prices, not quotes. Then the Biggest risks list names any cost that could grow faster than users
(texts, AI tokens, egress). Save `.claude/costs.json` with the plan and copy the totals into `PROJECT.md` under `## Costs`.
