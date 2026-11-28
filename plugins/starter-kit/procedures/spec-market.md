# The market check

Read by `/starter-kit:spec` (step 3) only for an app meant to be sold or to win users, not a private tool.

## Scope
- **Job:** judge whether the app can succeed: demand, buyers, crowding, gaps, what would be hard to copy, and a cheap first test.
- **Starts when:** planning researches an app meant to sell or to win users, or the owner asks whether an idea is worth building.
- **May:** launch researcher agents, run their reports through the citation check, and judge from the evidence.
- **Must not:** decide for the owner, present an unsourced claim as fact, or let a researcher give the verdict.
- **Done when:** the plan has a verdict with its evidence, the gap features, any pivots, and the cheapest real demand test.
- **Hands back:** the "Worth building?" part of the plan.

1. **Research, one researcher per angle:** **demand** (people asking for it on forums and review sites, searches, paid ads and job
   posts around the problem, competitors' growth); **buyers** (who pays, what they pay today for the current fix, and a few named
   kinds of first customers the owner could reach); **gaps** (what no competitor does well, the complaints nobody answers, a group
   of users everyone ignores). Every report goes through `cite-check.mjs` first.
2. **Judge it yourself** (not the researcher): how crowded it is (a few leaders with loyal users and free plans is crowded;
   scattered, old or disliked tools is open), and what would be hard to copy (a niche served better, data or connections others
   lack, a workflow built for one trade).
3. **Give a verdict:** **build it**, **build it narrower** (name the niche and why), **pivot**, or **think again** (say what evidence
   would change that). Always recommend the feature gaps worth building (each tied to the complaint or missing feature it answers,
   marked for the first version or later) and, when it is crowded, one to three **pivots**: nearby, less crowded directions the same
   idea could take (another group of users, one trade or niche, a neglected workflow), each with its evidence.
4. **The cheapest real test before building**, for anything that isn't certain: what the owner could do in a week for little or no
   money to see real demand (a one-page site with a sign-up or pre-order button, five conversations with the buyers named above, a
   post where those buyers gather), and the result that would stop or change the build ("fewer than 20 sign-ups from 500 visitors").
   It is a suggestion: the owner decides whether to run it before the build starts.
5. Every claim cites its source; say what you couldn't find. The verdict is a recommendation: the owner decides. If there are no
   web tools, say so and continue.
