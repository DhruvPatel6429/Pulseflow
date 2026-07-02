---
name: Drizzle queryWithCache failure on Neon
description: Drizzle ORM's NodePgPreparedQuery.queryWithCache throws "Failed query" on Neon connections for parameterized queries even when direct pool.query() works — use raw pool for critical middleware paths.
---

## Rule
Do NOT use Drizzle `db.select()` in the `requireBusiness` middleware (or any auth-critical middleware). Use `pool.query()` directly instead.

**Why:** Drizzle's `NodePgPreparedQuery.queryWithCache` wraps every pg error in a `DrizzleQueryError` that loses the original error code. More critically, it fails with "Failed query" on Neon for parameterized user queries (`$1`, `$2`) even though:
- The startup `SELECT 1` via `db.execute(sql\`SELECT 1\`)` works fine
- The exact same query via `pool.query("SELECT id FROM businesses WHERE clerk_user_id = $1 LIMIT 1", [userId])` works fine

The root cause was not fully isolated (custom `types` object in `rawQueryConfig`, Neon compute wakeup timing, or Drizzle's session layer) but the fix is definitive.

**How to apply:**
- `requireBusiness.ts` uses `pool.query<{ id: number }>()` with a raw SQL string and positional parameters — keep this pattern
- For all other routes, Drizzle ORM is fine (the middleware is the only place this was observed failing)
- If "Failed query" appears again in a route handler, check `err.cause` in the logs (errorMiddleware now surfaces `cause.message`, `cause.code`, `cause.detail`)
- SQL injection safety: always use `$N` positional params, never string interpolation

## Drizzle error surfacing
`DrizzleQueryError` stores the original pg error as `err.cause`. The global error handler (`errorMiddleware.ts`) now logs `cause.message`, `cause.code`, and `cause.detail` alongside the Drizzle message.
