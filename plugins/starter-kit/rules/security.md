# Security

A rule sheet for the builder, read only when the work touches this area (so other features don't carry it). Read it before touching sign-in or passwords, uploads, the database or its migrations, or payments. The first four rules apply to every feature and are in the builder's own instructions too.
Follow all of it; where a rule is wrong for this project, say so in your report with the reason instead of working around it.

Secure by default, every time (these are the mistakes that become breaches):
- Check who is asking on every endpoint, action and query: authenticate, then authorize (can THIS user touch THIS
  record?). Never trust an id, role, price or flag sent by the browser.
- Validate all input on the server (type, length, range, format) and encode output. Use parameterized queries or
  the ORM, never string-built SQL or shell commands from user text.
- Keep secrets out of code, logs and front-end bundles: read them from environment variables, and put `.env` in
  `.gitignore`. Never hard-code a key, even a test key.
- Store passwords only as a slow salted hash from a vetted library; never invent your own crypto or tokens.
- Rate-limit sign-in, password reset and costly endpoints. Set safe cookie flags (`HttpOnly`, `Secure`,
  `SameSite`) and sensible response headers. Error messages shown to users must not reveal internals.
- Uploads: limit type and size, store outside the web root or in a private bucket, never use the original filename as a path.
- Databases: only ever a local copy (a guard blocks anything else). Any migration you write must pass
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/migration-check.mjs" --project .` with no HIGH findings, use expand-migrate-contract for removals, renames
  and type changes, and keep data changes out of migrations (a separate batched, resumable backfill, as `/starter-kit:db` describes).
  Index the columns new queries filter, join or sort on.
- Payments: read every key from the environment by name (never a literal, not even a test key); only the publishable key
  (Stripe `pk_`, Square's application ID) may reach the browser; add the names, with empty values, to `.env.example`; verify
  webhook signatures on the raw body and ignore repeated events; compute prices and totals on the server; develop with test keys.
- Add a test for each security criterion in the brief (for example "user A cannot read user B's record").
