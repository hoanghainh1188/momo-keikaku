/**
 * `apps/web`'s composition root for the database, and the only place in the web app that
 * decides which role it connects as.
 *
 * It is the restricted `momo_app` role, not the owner. That is the change this story turns
 * on: `FORCE ROW LEVEL SECURITY` does nothing against a superuser — measured on
 * 2026-09-20, as `momo` a table with FORCE and a policy still returns every row — so while
 * the web app connected as `momo` the policies were inert and every test over them would
 * have passed while proving nothing.
 *
 * `@momo/db` cannot read the configuration itself: it may not read `process.env` (the
 * environment fence) and may not import `@momo/app` (that inverts the architecture's
 * import direction, since `packages/db` implements ports `packages/app` declares). So the
 * connection string is read here, in the inbound adapter, and passed in.
 *
 * NOTE on scope: this file is NOT the rewiring of the eight files that reach `@momo/db`
 * directly. That is the next slice, which moves them onto use cases and then switches on
 * the dependency-cruiser gate. This is the minimum those eight need to keep working once
 * `getDb` takes a connection string and every read runs inside `withTenant` — a handle and
 * a Tenant, named once instead of eight times.
 */
import { config } from '@momo/app';
import { getDb, DEMO_TENANT_ID, type Db } from '@momo/db';

/** The handle, on the restricted application role. Pools are memoised inside `getDb`. */
export function webDb(): Db {
  return getDb(config.APP_DATABASE_URL);
}

/**
 * The Tenant every request in this release belongs to.
 *
 * There is no auth yet (story 1.4), so there is no RequestContext to take it from and the
 * single seeded Tenant is stated here instead of guessed per page. When
 * `resolveRequestContext` lands, this constant is what it replaces — one place, not eight.
 */
export const WEB_TENANT_ID = DEMO_TENANT_ID;

export type { Db };
