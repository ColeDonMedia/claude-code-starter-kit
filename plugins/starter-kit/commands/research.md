---
description: Use when the user asks about competitors, the market, alternatives, how others solve something, or what's missing from their product. Researches the web in a subagent and returns a short sourced comparison and gap list.
---

Research this and report back briefly: $ARGUMENTS

## Scope
- **Job:** answer one research question with a short, sourced report.
- **Starts when:** the owner asks about competitors, the market, alternatives or how others solve something.
- **May:** launch researcher agents with a full brief and check their claims, re-checking important ones on a stronger model.
- **Must not:** present an unsourced claim as fact, change project files, or decide for the owner.
- **Done when:** the question has an answer with sources, and what could not be found is said.
- **Hands back:** the answer in a few lines, a comparison if useful, and the sources.

1. **Pin down the question.** In one line: what decision will this inform? Look at CLAUDE.md and the project
   first so you know what the user is building. Ask one question only if the product or market is truly unclear.
2. **Delegate the reading.** Launch the starter-kit `researcher` agent with a complete brief: the question, what
   the user is building, what a useful answer looks like, and anything already known. Web pages are long; keeping
   them in the subagent keeps this conversation small. For a broad topic, launch two or three researchers in
   parallel on separate angles (for example: direct competitors, pricing, user complaints).
   The researcher runs on Haiku (fast and cheap), which suits gathering. It is weaker at judging source quality and
   spotting subtle contradictions, so the checking in the next step is yours, not its.
3. **Check the report before passing it on.** Every important claim needs a link. Save the report to a file outside the project
   (your scratchpad) and run `node "${CLAUDE_PLUGIN_ROOT}/scripts/cite-check.mjs" --file <that file>`: it fetches every cited page
   and checks the quoted words are really there. Drop or re-source every NOT FOUND claim, check every CLOSE one, and mark
   UNREACHABLE ones as unchecked. If the confidence is low or key
   facts are unverified, send the researcher back once with the specific gaps. Never fill gaps from memory.
   Re-check the claims that matter most yourself, or with a stronger researcher (launch the same agent with the
   `model` set to `sonnet`), whenever a wrong answer would cost real money or cause harm: prices and limits, legal,
   privacy or compliance rules, security advice, and any claim two researchers disagree on.
4. **Report to the user in plain words:** the takeaway first, then the comparison table, then the gaps (table
   stakes we're missing, openings, things to ignore), then confidence and sources. One page at most.
5. If this research was for a product decision, say what you'd change in the plan because of it.
