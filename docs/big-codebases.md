# Big codebases

[← Back to the README](../README.md) · [All documentation](README.md)

Nobody, human or model, can hold a million lines in their head, so the kit doesn't try.

## The code index (`scripts/code-index.mjs`)

- Indexes every source file in 15+ languages: what each file defines and which files import which.
- Stored outside the project and updated incrementally. In git repositories it uses git's own content hashes, so re-indexing
  10,000 unchanged files takes about two seconds.
- `--find <name>`: where something lives. `--impact <file>`: everything a change could break, up to three steps away.
  `--hubs`: the files everything depends on. `--areas`: the codebase by folder.

## Testing only what a change can affect

- `scripts/scoped-tests.mjs` picks the tests a change can affect, and says to run the full suite when it cannot be sure (a build or
  dependency file changed, an unindexed language, nothing found).
- Projects marked `Size: large` in `CLAUDE.md` use scoped tests while building, and the full suite at checkpoints and before shipping.
- The reviewer checks the dependents of every change, not just the diff.

## Mapping an existing codebase (`/starter-kit:onboard`)

- Maps it area by area over several sessions, writing an `AREAS.md` overview and a `CLAUDE.md` rules file per area (Claude Code
  loads it automatically when working there), plus `ARCHITECTURE.md` and, if there is a database, `SCHEMA.md`.
- Changes no code while onboarding.

Tested on a synthetic 10,000-file repository and, read-only, on a real 9-million-line Python installation (31,000 files: about
3.5 minutes for the first index).

Limits: the index reads patterns, not a real compiler, so dynamic imports, reflection, dependency injection and generated code are
missed; outside git, re-indexing a very large folder is slow on Windows; knowledge that isn't written down anywhere stays unknown.
