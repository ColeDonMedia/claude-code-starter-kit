# The feature workflow

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

It commits on its own branch and reports the BRANCH name and the WORKTREE path. Keep its agent ID —
you will need it in step 2.

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

If a reviewer says CHANGES REQUESTED:
- Send the findings to the SAME implementer (message it with its agent ID) so it keeps working in its
  existing worktree. Do not launch a fresh implementer: that would create a second, empty worktree.
- If the original implementer can't be resumed, launch a new one and tell it to ignore the worktree it
  was given, and instead work in the existing WORKTREE path on the existing BRANCH.
- Then review again, but only the fix, and only by the reviewers that objected: give each `git diff <the commit it reviewed>..BRANCH`
  and its own earlier findings, to confirm each is resolved and that the fix broke nothing that depends on it. A reviewer that
  approved is not re-run, except that a fix touching a risky area (the list above) also goes to the security reviewer, and a fix
  larger than the original change is reviewed as new. The full suite still runs on the final commit. If round 2 still fails, run model-route.mjs with `--attempt 3`: if it names a stronger model than the
  builder had, start a new implementer on it in the existing WORKTREE and BRANCH (as above) with every finding so far. If that
  round fails too, or the model is no stronger, stop and ask the user.

An agent whose report comes back marked partial (it hit its turn limit) is resumed once; if it is partial again, report that
instead of trusting half a build or half a review.

## 3. Merge
Only when the implementer reported a green full suite AND the reviewer said APPROVE AND the challenger's findings
that block "done" are resolved (and, for high-risk features, no red-team break is left unfixed):
- Confirm the main checkout is still clean and still on MAIN.
- `git merge --no-ff BRANCH` into MAIN.
- If there is a merge conflict, run `git merge --abort`, and report it. Do not resolve conflicts unasked.
- Run the full test suite once on the merged result. If it fails, report it; do not continue. In a project whose CLAUDE.md says
  `Size: large`, run the scoped tests instead (`node "${CLAUDE_PLUGIN_ROOT}/scripts/scoped-tests.mjs" --project . --base BASE`, or the full suite when it
  says FULL SUITE); the full suite then runs at every checkpoint and before shipping, and you say so in the report.
- On success: remove the worktree (`git worktree remove WORKTREE`) and delete the branch (`git branch -d BRANCH`).
- Never push. Pushing is the user's call.

## 4. Prove it, write it down, report, continue
Done is something you can show, not something you say. Before reporting or ticking anything:
- **Prove it on the merged code.** Take the merge commit id (`git rev-parse --short HEAD` right after the merge).
  The implementer's report must map each acceptance criterion to a test (`file::test name`); open each test file
  yourself and confirm those tests exist and cover the criterion (a criterion no test checks is not done). Run the
  full suite once more and quote its result.
- **Write the records**, all in one docs commit:
  - `ROADMAP.md`: tick the feature as `- [x] <name> — <goal> (merged <short id>)`, tick each criterion and add
    `→ test: <file>::<test name>` (or `→ manual: <how it was checked by hand>` for things a test can't show, such as how a screen looks).
    Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/roadmap-check.mjs" --project .` and fix anything it reports; it checks the commit and tests are real.
  - `CHANGELOG.md`: one plain-words entry with the commit id.
  - `PROJECT.md`: update current state, the architecture map (one line per folder or key file under a `## Map` heading: `- path — what it is for`), known problems, next steps.
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
  something went wrong.
- If anything stopped early, say exactly where the work is (branch and worktree path) so nothing is lost.
- **Checkpoint.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/checkpoint.mjs" --project .`. If one is due (every 3 merged features), stop building and
  re-verify everything first: the full test suite, `roadmap-check.mjs`, `drift-check.mjs`, and the approved plan in `PROJECT.md`
  read against what was really built (anything missing, changed or added without agreement). Fix what you can, report the rest in plain
  words, refresh `ARCHITECTURE.md` (`node "${CLAUDE_PLUGIN_ROOT}/scripts/arch-map.mjs" --project . --write`, in a project with a code index) and
  `SCHEMA.md`, run `notes-graph.mjs --project .` and fix what it reports, run `compact-records.mjs` if a record is oversized, then `checkpoint.mjs --project . --record` and commit.
- **Going in circles?** If the same feature has failed review 3 times, or you are about to try an approach that already failed, stop and
  tell the user what is blocking it, with a smaller step or a different approach to choose from.
- In the main conversation: if `ROADMAP.md` has more unticked items and nothing needs the user's decision, start the next one now.
  A conductor stops after its one item, and says in NEXT when this item finished a milestone.
