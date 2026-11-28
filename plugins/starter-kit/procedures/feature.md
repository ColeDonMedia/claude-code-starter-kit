# The feature workflow

## Scope
- **Job:** the steps of one feature build: brief, builder, reviews, fixes, merge, proof, records.
- **Starts when:** the conductor (or the main conversation on RUN HERE) is given one item, MAIN, BASE and START or RESUME.
- **May:** launch the kit's agents, merge into MAIN when every gate passes, update the roadmap and records.
- **Must not:** read or edit the implementation itself unless something fails, take on another item, merge unproven work, or skip a reviewer.
- **Done when:** the item is merged with every criterion ticked with proof and the records updated, or stopped with the reason.
- **Hands back:** the result block.

Run by the `conductor` agent in its own fresh context, or by the main conversation when `/starter-kit:feature` says RUN HERE.
You are given the roadmap item or request, MAIN (the branch it merges into), BASE (MAIN's tip commit) and START or RESUME.
`/starter-kit:feature` has already checked the preconditions (a git repository, a clean main checkout, a plan and the project's
rules where needed). The implementing and reviewing happen in subagents and only their short reports come back: do not read the
implementation files or paste test output yourself unless something fails. Wherever this file says to ask or stop and ask the
user, a conductor stops and returns NEEDS OWNER with the question instead.

## 0. Build state (so a cut-off costs minutes, not the feature)
Record each stage with `node "${CLAUDE_PLUGIN_ROOT}/scripts/build-state.mjs" --project . --set key=value ...`:
- START: `--set item="<the item>" stage=brief main=<MAIN> base=<BASE>`.
- RESUME: run it with `--resume` first, trust what it reports from git, and continue from the stage it names.
- Then, as you go: `stage=build builder=<model>` before launching the builder; `stage=review round=1 branch=<BRANCH>
  worktree=<WORKTREE> lastGood=<its last commit>` when it reports; `reviewed.<agent>=<commit>` for each approval and `round=<n>`
  for each new round; `stage=merge`; `stage=prove lastGood=<merge commit>` after the merge; `stage=records`; `stage=done` once the
  records are committed; `question="<the question>"` whenever you wait for the owner.

## 1. Implement (subagent, own worktree)
**Models.** Before each agent launch in this workflow, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/model-route.mjs" --project . --role <agent> --feature "<the feature>"`
and pass the `model` and `effort` it prints (reviewer and challenger also get `--builder <the builder's model>`). Tell the owner
only when it matters ("this touches payments, so the stronger model builds it"). If `--role scout` prints SCOUT USE, launch the
`scout` agent first with the feature and the context pack, and put its checked pointers in the brief under "Start here (a head
start, not a boundary)".

Launch the starter-kit `implementer` agent. It runs in a new git worktree on its own branch. It cannot
see this conversation, so write it a complete brief. Start it from `node "${CLAUDE_PLUGIN_ROOT}/scripts/context-pack.mjs" --project . --feature "<the feature>"`,
which pulls the roadmap item, the latest decisions, the related parts of the code map and the design brief out of the
project's records, so a big project doesn't mean a big brief. Then add:
- what to build, why, the acceptance criteria, relevant files or areas, anything already decided here
- MAIN and BASE, so it can confirm its worktree starts from BASE
- the reminder that it must install dependencies first (a new worktree has none)
- the acceptance criteria, if there are any, with the instruction to write one failing test per criterion
- a branch the roadmap item names as holding failing tests (from the user tester or the red team): merge it first, keep its tests
- the pattern cards for this feature: `node "${CLAUDE_PLUGIN_ROOT}/scripts/cards.mjs" --match "<item title, goal and criteria>"`
  prints a path per CARD (separating customers' data, payments, sign-in, roles, background jobs, email). Tell the builder to read
  each one, follow its rules and write the tests from its "Prove it with tests" list that apply. Give the same paths to the
  reviewer, challenger and security reviewer: a card rule broken or a card test missing for a case the feature has is BLOCKS.

It commits on its own branch and reports its CUT LIST (what it planned to touch, written before any code), the BRANCH name and
the WORKTREE path. Keep its agent ID — you will need it in step 2 — and give the CUT LIST to the reviewer with the brief.

## 2. Review (subagents)
Launch the starter-kit `reviewer` agent, plus `ui-reviewer` in parallel if UI files changed, plus the
`security-reviewer` agent (range mode, on `git diff MAIN...BRANCH`) right now — not only at ship time — whenever the
feature is tagged `high-risk` in ROADMAP.md or its diff touches sign-in or sessions, permissions or roles,
payments, file uploads, database rules or migrations, secrets or environment settings, network or CORS settings,
or anything that handles other people's personal data. Treat its CHANGES REQUESTED like the reviewer's.
Also launch the `challenger` agent, always: it assumes the work is NOT done and tries to prove it (claims without
evidence, tests that couldn't fail, missing cases, collateral damage), and must show what it tried. Its
"DOES NOT HOLD UP" is treated like CHANGES REQUESTED; its findings that block "done" must be fixed, and any it
could not confirm must be answered, not ignored.
For `high-risk` features (same list as above), also run ONE round of the `red-team` agent against the feature
branch (tell it `git checkout --detach BRANCH`, the run command, and the feature's security criteria). Every
break it confirms comes with a failing test: send those to the implementer to fix, and keep the tests in the project.
Give each reviewer:
- the WORKTREE path — they must run every command there (`cd` into it, or `git -C`), because the main
  checkout does not have the feature's code and would be testing the old version
- the diff to review: `git diff MAIN...BRANCH`
- what the change is meant to do

**In proportion.** Every reviewer marks its findings BLOCKS or LATER. Only BLOCKS findings go to the builder; LATER ones are
collected for the records (step 4) and never start a round. The red team attacks once per feature; after that it only re-checks.
Tell the UI reviewer which look this is (first, second, third ...).

If a reviewer says CHANGES REQUESTED:
- Send the findings to the SAME implementer (message it with its agent ID) so it keeps working in its
  existing worktree. Do not launch a fresh implementer: that would create a second, empty worktree.
- If the original implementer can't be resumed, launch a new one and tell it to ignore the worktree it
  was given, and instead work in the existing WORKTREE path on the existing BRANCH.
- Then review again, but only the fix, and only by the reviewers that objected, each launched with the model `model-route.mjs ...
  --mode recheck` prints: give each `git diff <the commit it reviewed>..BRANCH`
  and its own earlier findings, to confirm each is resolved and that the fix broke nothing that depends on it. A reviewer that
  approved is not re-run, except that a fix touching a risky area (the list above) also goes to the security reviewer, and a fix
  larger than the original change is reviewed as new. The red team re-runs its own failing tests and attacks only what the fix
  changed. While the builder fixes, wait for its reply without ending your turn (`scripts/wait-agent.mjs`). The full suite still runs on the final commit.
- **A stronger builder.** If round 2 still has BLOCKS findings, run model-route.mjs with `--attempt 3`: if it names a stronger model
  than the builder had, start a new implementer on it in the existing WORKTREE and BRANCH (as above) with every finding so far.
- **When to stop (the only stop rule).** From round 3 on, before sending a round's findings to the builder, and before any BLOCKED,
  run `node "${CLAUDE_PLUGIN_ROOT}/scripts/worth-it.mjs" --project .` (rounds, size, files and tokens per round, from git and the
  logs). Unless it recommends KEEP GOING, stop with NEEDS OWNER: the question is its RECOMMEND line, the two or three reasons that
  matter, and the other choices, in plain words. Round 6 always goes to the owner, whatever it recommends. With the owner's answer:
  ACCEPT THE REST, send the builder only what blocks an acceptance criterion, put the rest under `PROJECT.md` "Harden before launch"
  (with the tests that show them, marked as known) and a decision in `DECISIONS.md`, then merge as usual; SPLIT IT, the same, with
  the rest as a new unticked roadmap item; START SMALLER, report BLOCKED with the branch kept and a proposed split; KEEP GOING, run
  the round.

An agent whose report comes back marked partial (it hit its turn limit) is resumed once; if it is partial again, report that
instead of trusting half a build or half a review.

## 3. Merge
Only when the implementer reported a green full suite AND the reviewer said APPROVE AND every BLOCKS finding from the
challenger, the security reviewer and the UI reviewer is resolved (and, for high-risk features, no red-team BLOCKS break is left unfixed):
- Confirm the main checkout is still clean and still on MAIN.
- `git merge --no-ff BRANCH` into MAIN.
- If there is a merge conflict, run `git merge --abort`, and report it. Do not resolve conflicts unasked.
- Run the full test suite once on the merged result. If it fails, report it; do not continue. In a project whose CLAUDE.md says
  `Size: large`, run the scoped tests instead (`node "${CLAUDE_PLUGIN_ROOT}/scripts/scoped-tests.mjs" --project . --base BASE`, or the full suite when it
  says FULL SUITE); the full suite then runs at every checkpoint and before shipping, and you say so in the report.
- On success: `node "${CLAUDE_PLUGIN_ROOT}/scripts/cleanup.mjs" --project .` removes every finished worktree and branch (the
  builder's, the red team's, and any left from earlier builds) whose work is fully merged and has nothing unsaved. It never
  forces: anything with unmerged commits or unsaved changes is kept and listed; say where those are in the report.
- Never push. Pushing is the user's call.

## 4. Prove it, write it down, report, continue
Done is something you can show, not something you say. Before reporting or ticking anything:
- **Prove it on the merged code.** Take the merge commit id (`git rev-parse --short HEAD` right after the merge).
  The implementer's report must map each acceptance criterion to a test (`file::test name`); open each test file
  yourself and confirm those tests exist and cover the criterion (a criterion no test checks is not done). Run the
  full suite once more and quote its result.
- **Write the records**, all in one docs commit:
  - `ROADMAP.md`: tick the feature as `- [x] <name> — <goal> (merged <short id>)`, tick each criterion and add
    `→ test: <file>::<test name>` (or `→ manual: <how it was checked by hand>` for things a test can't show, such as how a screen looks, or
    `→ ci: .github/workflows/<file>::<job>` for what this computer cannot run, such as a container build; the job must exist).
    Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/roadmap-check.mjs" --project .` and fix anything it reports; it checks the commit and tests are real.
    Then run `node "${CLAUDE_PLUGIN_ROOT}/scripts/milestone-gaps.mjs" --project . --feature <its F-id, or its name>`, which compares the
    feature with the roadmap the owner approved. DROPPED (an approved criterion gone or reworded) with no owner decision in
    `DECISIONS.md`: put the approved wording back, unticked, untick the feature, and stop with NEEDS OWNER asking whether to build it
    now or drop it. SKIPPED, SHARED or MANUAL: treat each as a review finding. Either fix it (a new implementer on a new branch from
    MAIN with the gap list, the reviewers that apply on that fix only, merge, then tick) or, when it is not a real gap (one test that
    truly checks both criteria, a look only a person can judge), say why in LEFT AS IS.
  - `CHANGELOG.md`: one plain-words entry with the commit id.
  - `PROJECT.md`: update current state, the architecture map (one line per folder or key file under a `## Map` heading: `- path — what it is for`), known problems, next steps.
    Every LATER finding goes under `## Harden before launch` (one line each: what, which feature, which reviewer, the test if any);
    the launch review checks that list.
  - `DECISIONS.md`: one new line per decision made (`- <date> — <decision> {#D-nnn}, because <reason>; rejected: <alternative>`), with the next
    number from `node "${CLAUDE_PLUGIN_ROOT}/scripts/notes-graph.mjs" --project . --next-id D`. Append only; it is what later sessions read first, so keep each
    line short. If a decision replaces an earlier one, add `status: superseded by [[D-nnn]]` to the OLD line (or `status: reversed`), then
    run `notes-graph.mjs --project .` and update every note it lists as still relying on it. In `ROADMAP.md` and `PROJECT.md`, point at
    decisions with `[[D-nnn]]` and give features and areas their own `{#F-nnn}` / `{#A-name}` anchors, so a change shows what depends on it.
  - `SCHEMA.md`, when migrations changed: `node "${CLAUDE_PLUGIN_ROOT}/scripts/schema-map.mjs" --project . --write` (the one-page picture of the database).
  - `HANDOFF.md`: rewrite it for the next session, and set its `Covers-through:` line to the newest code commit
    (`git log -1 --format=%H -- . ':(exclude)*.md' ':(exclude).claude'`).
  Write only what is true. If something was not verified, say so in "Failed or not verified" instead of leaving it out.
- If `ROADMAP.md` lists this feature, tick its box as described above and commit that.
- Tell the user in plain words, a few lines at most (a conductor puts this in its report): what now works, how to see it for
  themselves (the command to run or the page to open), and anything the reviewer flagged that was left as-is. No git details unless
  something went wrong. End with the line `node "${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs" --project . --line` prints after the
  records commit, word for word: progress against the approved scope.
- If anything stopped early, say exactly where the work is (branch and worktree path) so nothing is lost.
- **Checkpoint.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/checkpoint.mjs" --project .`. If one is due (every 3 merged features), stop building and
  re-verify everything first: the full test suite, `roadmap-check.mjs`, `drift-check.mjs`, and the approved plan in `PROJECT.md`
  read against what was really built (anything missing, changed or added without agreement). Fix what you can, report the rest in plain
  words, refresh `ARCHITECTURE.md` (`node "${CLAUDE_PLUGIN_ROOT}/scripts/arch-map.mjs" --project . --write`, in a project with a code index) and
  `SCHEMA.md`, run `notes-graph.mjs --project .` and fix what it reports, run `compact-records.mjs` if a record is oversized, then `checkpoint.mjs --project . --record` and commit.
- **Going in circles?** If you are about to try an approach that already failed, stop and tell the user what is blocking it, with a
  smaller step or a different approach to choose from. (Review rounds have their own stop rule in step 2.)
- In the main conversation: if `ROADMAP.md` has more unticked items and nothing needs the user's decision, start the next one now.
  A conductor stops after its one item, and says in NEXT when this item finished a milestone.
