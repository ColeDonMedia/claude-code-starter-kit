# Speed and scale

[← Back to the README](../README.md) · [All documentation](README.md)

## Built for its size

A free screen recorder that one person runs on their own computer and a SaaS with 15,000 people online at once need opposite
things. So the plan asks one size question (own computer or online, how many people in a year, how many at the busiest moment,
what an hour of downtime costs) and records it as a **scale profile** (`.claude/scale.json`).

`scripts/scale-profile.mjs` turns the answer into numbers and three lists:

- **Numbers:** for 15,000 people at once, each causing four requests a minute: about 1,000 requests a second (tested at 2,000),
  a connection pool size, and a 30-million-row table after a year at 200 records each.
- **What to build** at that size: a desktop app gets no servers, queues or caches; a large SaaS gets connection pools, background
  jobs and servers that can be multiplied, from the start.
- **How to prove it**, and **what to deliberately skip**.

## Proving it

| Kind of app | Check |
|---|---|
| On the user's own computer | `scripts/desktop-check.mjs` starts the app, times how long until it is ready, and measures the memory and processor use of it and everything it started, plus the download size. |
| Online for many people | `scripts/load-test.mjs` sends a growing crowd of simulated users at a copy running on this computer until it reaches the target rate or breaks: HOLDS, BREAKS or NOT REACHED. It refuses any address that is not this computer. |
| Any database | `scripts/db-rehearse.mjs` takes its table sizes from the profile (`--seed users=users --seed orders=per-user:200`). |
| After launch | Maintenance compares real numbers with the plan and re-tests before they are reached. |

## Fast and snappy

Speed is a budget set in the plan and checked on every feature, not a clean-up at the end.

- **The budget** (`.claude/speed.json`): on a mid-range phone on slow 4G, the main content shows in 2.5 s, nothing jumps around,
  a tap answers within 100 ms and finishes within a second, an API answers in under 200 ms.
- **The browser test** (`templates/speed.spec.js`) loads each page with the network and processor slowed down and measures what a
  visitor feels; `scripts/speed-check.mjs` judges the numbers in plain words, with the usual fix for each.
- **The build** (`scripts/delivery-check.mjs`, `scripts/perf-budget.mjs`): render-blocking scripts, images without a size or lazy
  loading, giant images, fonts that hide text, files that can't be cached, missing compression, oversized bundles.
- **The code** (`scripts/api-check.mjs`): database queries and network calls inside loops (the "N+1" problem), and unbounded lists.
- Builders follow fast-by-default rules (paged lists, an index for every new query, background jobs for slow work, optimistic
  updates and skeletons); `/starter-kit:speed` measures and fixes the biggest cause first, recording before and after.

Limits: lab numbers on a developer's computer are a proxy, so real-user timing after launch is the final check; a load test on one
computer (which is both the crowd and the server) finds weak code but does not prove what the host can carry, so big apps need the
same test on the host's staging copy; "feels fast" is partly judgement.
