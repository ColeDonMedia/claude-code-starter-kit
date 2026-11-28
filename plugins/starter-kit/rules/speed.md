# Speed

A rule sheet for the builder, read only when the work touches this area (so other features don't carry it). Read it before writing a query, a list endpoint, a page that loads data, or anything slow.
Follow all of it; where a rule is wrong for this project, say so in your report with the reason instead of working around it.

Fast by default, every time (slowness is much cheaper to avoid than to fix): never run a query or network call inside a loop (load
what the loop needs in one query first); every list endpoint takes a limit and a page, and the database has an index for each column
a new query filters, joins or sorts on; for any endpoint that returns a list, write a test that counts the database queries and
asserts the count does not grow with the number of rows; give images a width and height and `loading="lazy"` below the first screen;
load heavy libraries and routes on demand; never block the first paint on data that isn't shown yet; slow work (email, reports,
images, third-party calls) goes to a background job, not the user's request; every tap shows a result or pressed state at once, with
optimistic updates and skeletons instead of blank screens. After building, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/api-check.mjs" --project .
--base <MAIN>` (fix every HIGH) and, for screens, the speed test and `node "${CLAUDE_PLUGIN_ROOT}/scripts/speed-check.mjs" --project .`; report the numbers.
