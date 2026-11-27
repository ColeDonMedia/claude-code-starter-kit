# Planning, records and memory

[← Back to the README](../README.md) · [All documentation](README.md)

## The plan (`/starter-kit:spec`)

Before a new app or a vague feature, Claude reads the project, asks one batch of questions with defaults, researches similar
products, and checks the idea for forgotten pieces (empty and error states, sign-in, phones, accessibility, security). The plan
you approve includes:

- **Acceptance criteria:** testable statements, each of which becomes a test.
- **How we'll know it worked:** two or three measurable goals, tied to why you wanted the app.
- **Size:** how many people, how many at once, and what that means for how it is built ([Speed and scale](speed-and-scale.md)).
- **Design:** directions from the style library for you to pick ([Design and accessibility](design-and-accessibility.md)).
- **Estimates:** each feature sized small, medium or large (labelled as a guess).
- **Risks:** the top five, each with its trigger and the plan if it happens.
- **A roadmap:** features in build order, grouped into milestones of about three.

## Running it like a project

- **Change control:** when you change your mind, Claude first tells you what it adds or delays and records your decision.
- **Your acceptance:** when a milestone is finished, Claude starts the app (`/starter-kit:accept`), tells you exactly what to try in
  everyday words, and records your verdict in your own words with the date. Nothing ships while a milestone waits for your OK.
- **Status:** ask "where are we?" (`/starter-kit:status`) for progress, what's next, a rough forecast, risks, and exactly what
  Claude needs from you. Every line is built from the project's files and git history by a script. Progress is measured against
  the roadmap you approved: weighted by feature size, criteria proven, what was added or dropped since, and the feature being
  built right now with its stage. After every merged feature you also get one PROGRESS line with the same numbers.

## Records any session can pick up from

| File | What it holds |
|---|---|
| `PROJECT.md` | The master document: what the app is, the stack and why, how to run it, the data inventory, success measures, risks. |
| `HANDOFF.md` | What the last session leaves for the next: done, half-done (and exactly where), what to do first, what wasn't verified. |
| `CHANGELOG.md` | One plain-words entry per merged change, with the commit. |
| `ROADMAP.md` | The checklist. A box can only be ticked with proof: the merge commit and, per criterion, the test that covers it. |
| `DECISIONS.md` | Every decision with its reason; superseded ones are marked, never deleted. |

- When a turn ends and the handoff doesn't cover the newest code commit, or a tick is unproven, the turn is held until the records
  are fixed (once per problem; it never loops). Switch off with `{ "docsGate": false }`.
- Builders also document as they go (a purpose comment at the top of every file), and a reviewer must find a real test for every
  criterion, so "done" has to be shown, not claimed.

## Builds that last weeks

- **Drift check** (`scripts/drift-check.mjs`): at every session start, the records are checked against reality: a code map naming
  files that are gone, a handoff behind the latest commits, a decision that picks what an earlier one rejected, records too long.
- **Compaction** (`scripts/compact-records.mjs`): older decisions and releases move, word for word, into archive files, so the
  session note stays the same size in month three as on day one.
- **Checkpoints** (`scripts/checkpoint.mjs`): every three merged features, everything is re-verified (full suite, roadmap proofs,
  drift, the plan against what was really built) before more is built.
- **Stalls:** the same roadmap item "next" for three sessions, or a builder relaunched four times, is reported, and Claude stops
  retrying and tells you what is blocking it.

## Maps that keep memory honest

- **`SCHEMA.md`** (`scripts/schema-map.mjs`): the whole database on one page, with a diagram, rebuilt from migrations (SQL, Prisma,
  Rails, a schema dump or a local SQLite file). The session start warns when it no longer matches.
- **`ARCHITECTURE.md`** (`scripts/arch-map.mjs`): the areas of the codebase, who depends on whom, the files everything leans on,
  and circular dependencies, plus a hand-written section that is never overwritten.
- **Linked notes** (`scripts/notes-graph.mjs`): decisions, features, areas and tables carry ids (`{#D-014}`) and link to each other
  (`[[D-014]]`). The check reports broken links and plans that still rely on a superseded decision. `--export` writes a folder you
  can open as an Obsidian vault.
- **Context pack** (`scripts/context-pack.mjs`): each builder gets only the roadmap item, live decisions, related code and tables,
  and the design brief that matter.

## Trial runs and the flight recorder

- The unit tests prove each part alone; only real builds show whether the whole flow works. [Trials](trials.md) describes three
  trial apps of rising difficulty, run in your normal session.
- A flight recorder writes a private log of names only (which workflows and agents ran, which actions were blocked). It never
  records prompts, code, command arguments, paths or secrets, and lives outside the project. Switch off with `{ "flightLog": false }`.
- After a trial, `/starter-kit:dogfood` reads the log and turns each gap into a fix or a written note.

Limits: the checks compare records with files and git, not with what you meant; the flight log shows what ran, not whether the
result was good.
