---
description: Use when the user asks about competitors, the market, alternatives, how others solve something, or what's missing from their product. Researches the web in a subagent and returns a short sourced comparison and gap list.
---

Research this and report back briefly: $ARGUMENTS

1. **Pin down the question.** In one line: what decision will this inform? Look at CLAUDE.md and the project
   first so you know what the user is building. Ask one question only if the product or market is truly unclear.
2. **Delegate the reading.** Launch the starter-kit `researcher` agent with a complete brief: the question, what
   the user is building, what a useful answer looks like, and anything already known. Web pages are long; keeping
   them in the subagent keeps this conversation small. For a broad topic, launch two or three researchers in
   parallel on separate angles (for example: direct competitors, pricing, user complaints).
3. **Check the report before passing it on.** Every important claim needs a link. If the confidence is low or key
   facts are unverified, send the researcher back once with the specific gaps. Never fill gaps from memory.
4. **Report to the user in plain words:** the takeaway first, then the comparison table, then the gaps (table
   stakes we're missing, openings, things to ignore), then confidence and sources. One page at most.
5. If this research was for a product decision, say what you'd change in the plan because of it.
