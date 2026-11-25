# Databases

[← Back to the README](../README.md) · [All documentation](README.md)

Database mistakes are the ones that can't be undone, so the kit works on local copies and hands live changes to you.

## The database guard

- **Refused:** any connection to a database that isn't on this computer (connection strings, `-h` hosts, and the project's `.env`
  when a migration tool has no explicit target), migrations run with production settings, and hosting platforms' database tools
  (Heroku, Fly, Railway, Supabase push, RDS and others). Docker Compose services count as local.
- **Asks first:** destructive SQL on a local database (dropping or emptying tables, `UPDATE` or `DELETE` with no `WHERE`, resets).
- **Never repeated:** passwords in connection strings.
- **No automatic test runs** while the project's `.env` points at a database on another computer, and the session note says why.

## Changing the schema safely (`/starter-kit:db`)

| Step | Tool |
|---|---|
| Check every migration for what locks or loses data: dropped or renamed columns and tables, required columns with no default, type changes, index and foreign-key builds that block writes, data changes inside migrations, missing rollbacks. Each finding comes with the safe way to do it; only you can accept a risk. | `scripts/migration-check.mjs` |
| Rehearse on a copy (never the original) filled to realistic size: time the migration, find full-table scans (SQLite directly; Postgres from saved `EXPLAIN` output). | `scripts/db-rehearse.mjs` |
| Change things without breaking the running app: expand, migrate, contract. | `/starter-kit:db` |
| Move data with batched, resumable backfills, tested by interrupting them. | `/starter-kit:db` |
| Keep a one-page picture of the database. | `scripts/schema-map.mjs` → `SCHEMA.md` |
| Hand the live change to you: exact commands, timings from the rehearsal, how to undo each step, in the runbook. | `/starter-kit:db` |

Limits: the guard reads commands, so a script that connects on its own (the app's own code, a custom tool) isn't seen; the migration
rules are patterns, not a database engine; Postgres and MySQL rehearsals need a local copy you run in Docker.
