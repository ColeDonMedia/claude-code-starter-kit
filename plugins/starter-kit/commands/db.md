---
description: "Use for any database change or problem: a new table or column, a migration, changing or moving existing data, a slow query, a big table, seeding test data. Works only on local copies, checks every migration for locks and data loss, rehearses at real size, and hands the owner the plan for the live database."
---

Make this database change safely: $ARGUMENTS

Database mistakes are the ones that can't be undone: lost data, a site frozen while a table is locked, a deploy that breaks because
the running code still uses the old column. Work slowly and prove each step on a copy.

1. **Only ever a local copy.** A guard blocks connections to any database that isn't on this computer, migrations with production
   settings, and hosting platforms' database tools. Don't look for ways around it. Use a local database (Docker, or the project's
   SQLite file) filled with generated test data. Never copy real customer data here unless the owner provides an anonymised copy.
2. **Design the change so the running app never breaks.** For anything that removes, renames or retypes a column or table, use
   expand, migrate, contract: (1) add the new thing alongside the old, (2) ship code that writes both and reads the new, (3) backfill
   old rows, (4) only in a later release remove the old one. Required columns start optional (or with a default) and become required
   after the backfill. Big-table indexes are built without blocking writes (Postgres: `CONCURRENTLY`).
3. **Check every migration:** `node "<SCRIPTS>/migration-check.mjs" --project .`. Fix every HIGH finding by following its "Safer" line.
   Only the owner may accept a risk: explain it in plain words (what could go wrong, for how long, how it would be undone) and, if they
   accept, add the comment `kit: accepted-risk — owner said "<their words>"` on that line.
4. **Rehearse at real size.** Ask (or estimate from the plan) how many rows the main tables will have after a year; use at least
   100,000 for anything users create, 1,000,000 for logs and events. SQLite:
   `node "<SCRIPTS>/db-rehearse.mjs" --sqlite <db file> --seed <parent>=<rows> --seed <child>=<rows> --migrate <file.sql> --explain "<each new query>"`.
   Postgres or MySQL: fill a local Docker copy (`generate_series`), run `EXPLAIN (FORMAT JSON)` for each new query, save it and pass it with
   `--pg-plan <file>`. Fix every full scan of a big table (usually a missing index) and say how long the migration took.
5. **Data changes are backfills, not migrations.** Write them as a separate script that:
   - works in batches by primary key range (1,000 to 10,000 rows), each batch in its own short transaction
   - is safe to run twice (`WHERE new_col IS NULL`, or upserts), and records the last finished id so it resumes after a crash
   - pauses briefly between batches, prints progress, and has a dry run that only counts what it would change
   Test it on the seeded copy: run it, interrupt it, resume it, run it again; the result must be identical.
6. **Hand over the live change.** Write a section in `RUNBOOK.md` (or `PROJECT.md` if there is no runbook): the exact commands in order
   (backup first, then deploy, migrate, backfill, contract), how long each took in the rehearsal, what to watch, and how to undo each step.
   Tell the owner in plain words that they run it, and that you will check the result with them. Never run it yourself.
7. Record the design in `DECISIONS.md`, and add tests for the new queries and the backfill.
