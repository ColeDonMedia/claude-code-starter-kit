# Card: separating customers' data (multi-tenant apps)

**When:** one app serves several customers (companies, teams, workspaces, organisations, client accounts) whose data must never
mix. A leak here is the worst kind of bug: one customer sees another's invoices.

## Rules
1. **Every table that holds a customer's data has a tenant column** (`tenant_id`, `organization_id`), not null, indexed, and part
   of every unique rule (`unique(tenant_id, email)`, not `unique(email)`).
2. **The tenant comes from the signed-in session, never from the request.** Never trust a tenant id in a URL, form field or header.
3. **Scope every query in one place:** a base query, repository or framework scope that adds the tenant filter automatically
   (in Laravel a global scope on a `BelongsToTenant` trait; in Rails `default_scope` or a `Current.tenant`; in Prisma/Drizzle a
   helper every query goes through). Code that skips it (`withoutGlobalScopes`, raw SQL, `unscoped`) is allowed only in reviewed,
   named admin code.
4. **Look records up by id AND tenant:** `where(id, tenant)`, never `find(id)` alone. A wrong tenant gives "not found" (404), never
   "forbidden", so ids can't be probed.
5. **Everything that runs outside a request carries the tenant explicitly:** queued jobs, scheduled tasks, emails, exports,
   webhooks. Store the tenant id on the job and set it before doing anything.
6. **Shared stores are split by tenant:** cache keys (`t:{tenant}:...`), file storage paths (`tenants/{tenant}/...`, private by
   default), search indexes, rate limits.
7. **Admin screens that look across tenants are separate,** behind their own role, and say so on screen.

## Prove it with tests
- Two tenants with the same data shapes. User of tenant A asks for each of tenant B's records **by id**, on every read, update,
  delete and export route: each answers not-found, and B's data is unchanged.
- A list, search, count, total and export for tenant A contains none of B's rows (seed B with distinctive names).
- A queued job created by A runs with A's tenant even when B's job runs in between.
- A cached value or uploaded file of A is not returned to B (same cache key or file name in both).
- Creating a record with B's tenant id in the request body still saves it under A.

## Common mistakes
A unique email across all tenants; a cache key without the tenant; a job that reads "the current tenant" after the request
ended; an export or report query written by hand without the scope; counting "all customers" on a tenant's dashboard.
