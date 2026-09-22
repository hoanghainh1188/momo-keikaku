import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { eq, sql } from 'drizzle-orm';
import { closeAllPools, getDb } from './client';
import * as s from './schema';
import {
  APPEND_ONLY_GUARDED,
  appPrivilegesOf,
  CANONICAL_MAINTENANCE_ROLE,
  REGISTERED_TABLES,
  TABLE_REGISTRY,
  TENANT_OWNED,
} from './table-classes';
import {
  APPEND_ONLY_ERRCODE,
  APPEND_ONLY_TRIGGER,
  APPEND_ONLY_TRUNCATE_TRIGGER,
  MAINTENANCE_POLICY,
  TENANT_POLICY,
  tenantPredicate,
} from './sql/generate';
import { currentTenant, withTenant } from './with-tenant';

/**
 * The SQLSTATE of a rejected query, through Drizzle.
 *
 * Drizzle 0.45 wraps a driver error in a `DrizzleQueryError` and puts the `pg` error on
 * `cause`, so `toMatchObject({ code })` against the thrown value silently never matches —
 * and a `rejects` assertion that never matches still *passes* if the rejection happens for
 * any reason at all. Reading the code explicitly is what keeps these assertions about the
 * privilege they name rather than about "something went wrong".
 */
function sqlstateOf(error: unknown): string | undefined {
  const candidates = [error, (error as { cause?: unknown } | undefined)?.cause];
  for (const candidate of candidates) {
    const code = (candidate as { code?: unknown } | undefined)?.code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

interface PolicyRow {
  readonly tablename: string;
  readonly policyname: string;
  readonly roles: string[];
  readonly qual: string | null;
  readonly with_check: string | null;
}

interface RlsFlagRow {
  readonly relname: string;
  readonly relrowsecurity: boolean;
  readonly relforcerowsecurity: boolean;
}

/** The RLS flags and every policy in `public`, in one owner connection. */
async function readPolicyCatalog(): Promise<{
  flags: RlsFlagRow[];
  policies: PolicyRow[];
}> {
  return asOwner(async (client) => {
    const flags = await client.query<RlsFlagRow>(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
         FROM pg_catalog.pg_class c
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'`,
    );
    const policies = await client.query<PolicyRow>(
      `SELECT tablename, policyname, roles, qual, with_check
         FROM pg_policies WHERE schemaname = 'public'`,
    );
    return { flags: flags.rows, policies: policies.rows };
  });
}

/**
 * Puts a predicate into a form the generator's text and the catalog's can be compared in.
 *
 * Postgres does not store what was written: it re-renders the parsed expression, stripping
 * identifier quotes, adding explicit `::text` casts and wrapping the whole thing in parens.
 * Normalising both sides — case, quotes, casts, whitespace, outer parens — compares the
 * *shape* while still failing on any real difference, which is the only thing that matters
 * here: `USING (true)` and the tenant comparison do not normalise to each other.
 */
function normalisePredicate(predicate: string): string {
  return predicate
    .toLowerCase()
    .replace(/::[a-z ]+/g, '')
    .replace(/"/g, '')
    .replace(/\s+/g, '')
    .replace(/^\(+|\)+$/g, '');
}

/** Runs `work`, expecting it to be refused, and returns the SQLSTATE it was refused with. */
async function refusalCode(work: Promise<unknown>): Promise<string | undefined> {
  try {
    await work;
    return undefined;
  } catch (error) {
    return sqlstateOf(error);
  }
}

/**
 * The isolation gates, against a real server and as the RESTRICTED application role.
 *
 * Four separate claims live here, and each one fails for its own reason:
 *
 *   1. THE REGISTRY MATCHES THE DATABASE. Every table in `public` is classed, and every
 *      classed table exists. This is the assertion that turns "a migration added a table
 *      and nobody registered it" into a red build instead of an unprotected table.
 *   2. FORCE AND THE POLICY ARE ACTUALLY THERE — read from `pg_class.relrowsecurity`,
 *      `pg_class.relforcerowsecurity` and `pg_policies`, never assumed because the
 *      generator emitted them. A statement that ran against the wrong database, or a
 *      policy someone dropped by hand, is invisible to every other gate.
 *   3. ISOLATION BITES. A read with no tenant set returns nothing; a read inside tenant A
 *      sees A and not B, and the same read inside B sees B and not A. As the application
 *      role, because FORCE does nothing against a superuser: measured on 2026-09-20, as
 *      `momo` a table with FORCE and a policy still returns every row.
 *   4. APPEND-ONLY IS DOUBLE. The application role is refused by the missing grant (42501);
 *      the maintenance role, which *holds* the grant, is refused by the trigger
 *      (SQLSTATE MOMO1) until `app.maintenance` is set — and then succeeds. Two distinct
 *      SQLSTATEs, so neither half can be mistaken for the other.
 *
 * Requires a database prepared by `drizzle-kit push`, `pnpm pgboss:migrate` and
 * `pnpm db:policies`, and seeded. Set REQUIRE_DB=1 (CI does) to turn an unreachable
 * database into a failure instead of a skip.
 */

const REQUIRE_DB = process.env.REQUIRE_DB === '1';
const OWNER_DATABASE_URL = process.env.DATABASE_URL;
const APP_DATABASE_URL = process.env.APP_DATABASE_URL;

/** The Tenant `seed.ts` writes. */
const TENANT_A = 'ten-momo';
/** A second Tenant, created here by the owner and removed again afterwards. */
const TENANT_B = 'ten-rls-probe';
const DEPARTMENT_B = 'dep-rls-probe';
/**
 * Tenant B also gets a row in an APPEND-ONLY table that carries money.
 *
 * With only a `tenant` and a `department` row, `department` was the only table any
 * behavioural assertion could target — so an over-permissive policy on any of the other
 * fifteen (say `actuals_ledger_entry` with `USING (true)`, which leaks every Tenant's
 * Actuals) could not be demonstrated by a read at all. The catalog assertions compare the
 * predicate on every table; these two make at least one of the money tables observable too.
 */
const CONNECTOR_B = 'con-rls-probe';
const LEDGER_B_SEQ = 9_000_001;

if (REQUIRE_DB && !(OWNER_DATABASE_URL && APP_DATABASE_URL)) {
  throw new Error(
    'REQUIRE_DB=1 but DATABASE_URL and APP_DATABASE_URL are not both set. This file needs the ' +
      'owner to read the catalog and seed a second Tenant, and the application role to prove the ' +
      'policies bite. It is the gate on tenant isolation, so it must not be skipped here.',
  );
}

async function reachableAs(connectionString: string | undefined): Promise<boolean> {
  if (!connectionString) return false;
  const client = new pg.Client({ connectionString, application_name: 'momo-rls-test' });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

const reachable =
  (await reachableAs(OWNER_DATABASE_URL)) && (await reachableAs(APP_DATABASE_URL));

if (REQUIRE_DB && !reachable) {
  throw new Error(
    'REQUIRE_DB=1 but the database is not reachable as both roles. Run `pnpm pgboss:migrate` ' +
      'and `pnpm db:policies` first; this is the gate on tenant isolation, so it must not be skipped.',
  );
}

/** A raw owner connection. Used for catalog reads and for creating tenant B's rows. */
async function asOwner<T>(work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({
    connectionString: OWNER_DATABASE_URL,
    application_name: 'momo-rls-test-owner',
  });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

beforeAll(async () => {
  if (!reachable) return;
  // Written by the owner, which is a superuser locally and in CI and therefore bypasses
  // RLS entirely — deliberately: the row has to exist *outside* the application role's
  // reach for "tenant A cannot see it" to mean anything.
  await asOwner(async (client) => {
    await removeTenantB(client);
    await client.query('INSERT INTO tenant (id, name) VALUES ($1, $2)', [TENANT_B, 'RLS probe']);
    await client.query('INSERT INTO department (id, tenant_id, name) VALUES ($1, $2, $3)', [
      DEPARTMENT_B,
      TENANT_B,
      'Probe department',
    ]);
    await client.query(
      `INSERT INTO connector (id, tenant_id, project_id, adapter, scope, space_label)
       VALUES ($1, $2, 'prj-rls-probe', 'fixture', 'probe', 'probe')`,
      [CONNECTOR_B, TENANT_B],
    );
    // Money. `deltaMh` is what AC is summed from, so a policy that leaked this table would
    // show one Tenant another's cost.
    await client.query(
      `INSERT INTO actuals_ledger_entry
         (seq, id, tenant_id, connector_id, ticket_id, kind, delta_mh, window_end, snapshot_id)
       VALUES ($1, 'led-rls-probe', $2, $3, 'TKT-PROBE', 'delta', 4242, now(), 'snap-rls-probe')`,
      [LEDGER_B_SEQ, TENANT_B, CONNECTOR_B],
    );
  });
}, 30_000);

/**
 * Removes tenant B's rows, in reverse dependency order.
 *
 * The append-only tables refuse DELETE to everybody, owner included, unless the maintenance
 * hatch is open — so opening it here is the test cleaning up through the same sanctioned path
 * the seed uses, rather than a special case that only works because the owner is a superuser.
 */
async function removeTenantB(client: pg.Client): Promise<void> {
  await client.query(`SELECT set_config('app.maintenance', 'on', false)`);
  try {
    await client.query('DELETE FROM actuals_ledger_entry WHERE tenant_id = $1', [TENANT_B]);
    await client.query('DELETE FROM connector WHERE tenant_id = $1', [TENANT_B]);
    await client.query('DELETE FROM department WHERE tenant_id = $1', [TENANT_B]);
    await client.query('DELETE FROM tenant WHERE id = $1', [TENANT_B]);
  } finally {
    await client.query(`SELECT set_config('app.maintenance', 'off', false)`);
  }
}

afterAll(async () => {
  if (reachable) await asOwner(removeTenantB);
  await closeAllPools();
});

describe.skipIf(!reachable)('the registry is the database, and the database is the registry', () => {
  it('classes every table in the public schema, and classes no table that is absent', async () => {
    const live = await asOwner(async (client) => {
      const { rows } = await client.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
          ORDER BY table_name`,
      );
      return rows.map((row) => row.table_name);
    });

    const unregistered = live.filter((table) => !REGISTERED_TABLES.includes(table));
    const missing = REGISTERED_TABLES.filter((table) => !live.includes(table));

    // Named, not counted. "17 !== 18" sends whoever added the table reading a diff; this
    // sends them straight to `packages/db/src/table-classes.ts` with the name in hand.
    expect(
      unregistered,
      `these tables exist but packages/db/src/table-classes.ts does not class them: ` +
        `${unregistered.join(', ')}. Add an entry — a table without a class gets no policy, ` +
        'no grant and no trigger.',
    ).toEqual([]);
    expect(
      missing,
      `these tables are classed but do not exist: ${missing.join(', ')}.`,
    ).toEqual([]);
  });

  it('refuses any relation in public that is not an ordinary table', async () => {
    // The assertion above filters `BASE TABLE`, so a view or materialised view over a
    // tenant-owned table would be neither registered nor unregistered — it would simply not
    // be looked at. That matters more than it sounds: a view runs with its OWNER's
    // permissions unless it is created `WITH (security_invoker = true)`, so an unclassed view
    // over a protected table hands out every Tenant's rows through a relation no gate
    // mentions. The registry has no class for one, so the honest answer is to refuse it and
    // make adding one a decision.
    const unexpected = await asOwner(async (client) => {
      const { rows } = await client.query<{ relname: string; relkind: string }>(
        `SELECT c.relname, c.relkind
           FROM pg_catalog.pg_class c
           JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            -- 'r' ordinary tables are the registry's subject; 'i' indexes and 'S' sequences
            -- are implementation detail of those tables and carry no rows of their own.
            AND c.relkind NOT IN ('r', 'i', 'S')
          ORDER BY c.relname`,
      );
      return rows;
    });

    expect(
      unexpected.map((row) => `${row.relname} (relkind ${row.relkind})`),
      'public holds relations the table-class registry has no class for. A view or matview ' +
        'over a tenant-owned table bypasses its policy unless created WITH ' +
        '(security_invoker = true) — give it a class in packages/db/src/table-classes.ts and ' +
        'teach the generator what to emit for it, rather than leaving it unexamined.',
    ).toEqual([]);
  });

  it('agrees with the catalog about which tables carry tenant_id', async () => {
    // `tenantColumn` is hand-written, and it is the field that decides whether a table gets a
    // policy at all. An entry marked `tenantColumn: null` on a table that HAS the column
    // yields no RLS, no policy and a green suite — the quietest possible way to leave a table
    // unprotected. So it is compared against information_schema rather than trusted.
    const columns = await asOwner(async (client) => {
      const { rows } = await client.query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND column_name = 'tenant_id'`,
      );
      return rows.map((row) => row.table_name);
    });

    // The one sanctioned exception is the tenant-membership bridge (`tenantBridge`), which
    // carries `tenant_id` and is read before any Tenant is known. `registry.test.ts` pins that
    // exactly one table carries the flag.
    const wronglyExempt = TABLE_REGISTRY.filter(
      (entry) =>
        entry.tenantColumn === null && entry.tenantBridge !== true && columns.includes(entry.table),
    ).map((entry) => entry.table);
    const bridgesWithoutColumn = TABLE_REGISTRY.filter(
      (entry) => entry.tenantBridge === true && !columns.includes(entry.table),
    ).map((entry) => entry.table);
    expect(
      bridgesWithoutColumn,
      `the registry flags these tables as the tenant bridge and they carry no tenant_id: ${bridgesWithoutColumn.join(', ')}`,
    ).toEqual([]);
    const wronglyOwned = TABLE_REGISTRY.filter(
      (entry) => entry.tenantColumn !== null && !columns.includes(entry.table),
    ).map((entry) => entry.table);

    expect(
      wronglyExempt,
      `these tables carry tenant_id but the registry marks them tenantColumn: null, so they ` +
        `get no policy and no isolation at all: ${wronglyExempt.join(', ')}`,
    ).toEqual([]);
    expect(
      wronglyOwned,
      `the registry claims these tables carry tenant_id and they do not: ${wronglyOwned.join(', ')}`,
    ).toEqual([]);
  });
});

describe.skipIf(!reachable)('FORCE row-level security and the policy are on every tenant-owned table', () => {
  it('reads relrowsecurity, relforcerowsecurity and pg_policies from the catalog', async () => {
    const { flags, policies } = await readPolicyCatalog();

    const withoutForce: string[] = [];
    const withoutPolicy: string[] = [];
    for (const entry of TENANT_OWNED) {
      const flag = flags.find((row) => row.relname === entry.table);
      if (!flag?.relrowsecurity || !flag.relforcerowsecurity) withoutForce.push(entry.table);
      if (!policies.some((row) => row.tablename === entry.table && row.policyname === TENANT_POLICY)) {
        withoutPolicy.push(entry.table);
      }
    }

    expect(
      withoutForce,
      `these tenant-owned tables lack ENABLE or FORCE ROW LEVEL SECURITY: ${withoutForce.join(', ')}. ` +
        'Without FORCE the policy is skipped for the table owner, which is who the seed and ' +
        '`drizzle-kit push` connect as. Run `pnpm db:policies`.',
    ).toEqual([]);
    expect(
      withoutPolicy,
      `these tenant-owned tables have no '${TENANT_POLICY}' policy: ${withoutPolicy.join(', ')}. ` +
        'RLS with no policy denies everything; RLS with a missing policy on one table leaks it.',
    ).toEqual([]);
  });

  it('leaves the identity tables and the membership bridge without row-level security (story 1.4)', async () => {
    // They are read to resolve WHICH Tenant a request acts in, so a tenant policy on any of them
    // would make every session invisible. They must exist, and carry no RLS and no policy.
    const { flags, policies } = await readPolicyCatalog();
    // Every `global` table, not a hand-kept subset: `identity_event` (story 1.4 slice 4) joined
    // the class and was missed here, and row-level security switched on there would make the app
    // role's own reset events invisible to it with every other gate still green. Derived from the
    // registry so the sixth table cannot be forgotten the way it was, and so a seventh cannot be.
    const identity = TABLE_REGISTRY.filter((entry) => entry.class === 'global').map((e) => e.table);
    for (const table of identity) {
      const flag = flags.find((row) => row.relname === table);
      expect(flag, `${table} does not exist — run drizzle-kit push`).toBeDefined();
      expect(flag!.relrowsecurity, `${table} has row-level security switched on`).toBe(false);
      expect(
        policies.filter((row) => row.tablename === table).map((row) => row.policyname),
        `${table} carries a policy`,
      ).toEqual([]);
    }
  });

  it('holds the generator\'s own predicate in every policy — not merely a policy by that name', async () => {
    // A policy NAMED `tenant_isolation` with `USING (true)` leaks every Tenant's rows and
    // passes a name check, so the name check is not the assertion — the predicate is. Both
    // `qual` (reads) and `with_check` (writes) are compared, because an over-permissive
    // `with_check` alone lets one Tenant write into another's data, which is the quieter leak.
    const { policies } = await readPolicyCatalog();

    const wrong: string[] = [];
    for (const entry of TENANT_OWNED) {
      const policy = policies.find(
        (row) => row.tablename === entry.table && row.policyname === TENANT_POLICY,
      );
      if (!policy) continue; // the assertion above already names a missing policy
      const want = normalisePredicate(tenantPredicate(entry));
      for (const [half, actual] of [
        ['USING', policy.qual],
        ['WITH CHECK', policy.with_check],
      ] as const) {
        if (normalisePredicate(actual ?? '') !== want) {
          wrong.push(`${entry.table} ${half}: ${actual ?? '(absent)'}`);
        }
      }
    }

    expect(
      wrong,
      'these policies do not carry the predicate packages/db/src/sql/generate.ts emits:\n' +
        `${wrong.join('\n')}\nRun \`pnpm db:policies\`. A policy with the right name and the ` +
        'wrong predicate is worse than none, because every other gate reports it as present.',
    ).toEqual([]);
  });

  it('gives the maintenance role a hatch that can actually reach a row', async () => {
    // The tenant policy applies to PUBLIC, which includes the maintenance role, and
    // permissive policies are OR'd — so without a second policy granted to that role the
    // hatch matches zero rows unless the session ALSO set app.tenant_id. The trigger would
    // let the statement through and it would update nothing, which reads like a working
    // hatch and is not one.
    const { policies } = await readPolicyCatalog();
    const missing = TENANT_OWNED.filter(
      (entry) =>
        !policies.some(
          (row) =>
            row.tablename === entry.table &&
            row.policyname === MAINTENANCE_POLICY &&
            row.roles.includes(CANONICAL_MAINTENANCE_ROLE),
        ),
    ).map((entry) => entry.table);

    expect(
      missing,
      `these tenant-owned tables have no '${MAINTENANCE_POLICY}' policy for ` +
        `'${CANONICAL_MAINTENANCE_ROLE}': ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('installs BOTH append-only triggers on every append-only-guarded table', async () => {
    // Two triggers, because a FOR EACH ROW trigger does not fire for TRUNCATE at all — there
    // are no rows to fire per. Without the statement-level one, TRUNCATE is guarded by the
    // absent grant alone, which is the single point of failure the trigger exists to backstop.
    // `information_schema.triggers` does not report TRUNCATE triggers, so pg_trigger is read
    // directly and the event bitmask is checked. `identity_event` (global + appendOnlyGuard)
    // is in the set alongside the nine `append-only` tables.
    for (const [triggerName, label] of [
      [APPEND_ONLY_TRIGGER, 'UPDATE/DELETE'],
      [APPEND_ONLY_TRUNCATE_TRIGGER, 'TRUNCATE'],
    ] as const) {
      const tables = await asOwner(async (client) => {
        const { rows } = await client.query<{ relname: string }>(
          `SELECT c.relname
             FROM pg_catalog.pg_trigger t
             JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
             JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND t.tgname = $1 AND NOT t.tgisinternal`,
          [triggerName],
        );
        return rows.map((row) => row.relname);
      });

      const missing = APPEND_ONLY_GUARDED.map((e) => e.table).filter(
        (table) => !tables.includes(table),
      );
      expect(
        missing,
        `these append-only-guarded tables carry no '${triggerName}' (${label}) trigger: ${missing.join(', ')}.`,
      ).toEqual([]);
      // And no table that is not guarded carries it: a trigger on a mutable table would
      // refuse edits the product depends on, and would do so only under load.
      const unexpected = tables.filter(
        (table) => !APPEND_ONLY_GUARDED.some((e) => e.table === table),
      );
      expect(unexpected, `unexpected '${triggerName}' trigger on: ${unexpected.join(', ')}`).toEqual(
        [],
      );
    }
  });

  it('holds the application role to the grants the registry states, and nothing more', async () => {
    // `has_table_privilege` rather than `information_schema.role_table_grants`, because the
    // claim is "and nothing more" and that view answers a narrower question: it lists grants
    // whose grantee IS this role. A privilege reaching it through PUBLIC — which is how
    // `GRANT ... TO PUBLIC` and several Postgres defaults work — or through membership of
    // another role is invisible there and fully effective in practice.
    // `has_table_privilege` answers what the role can actually do, which is the claim.
    const role = new URL(APP_DATABASE_URL!).username;
    const verbs = [
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER',
    ] as const;

    const effective = await asOwner(async (client) => {
      const held = new Map<string, string[]>();
      for (const entry of TABLE_REGISTRY) {
        const { rows } = await client.query<Record<string, boolean>>(
          `SELECT ${verbs
            .map((verb, index) => `has_table_privilege($1, $2, '${verb}') AS v${index}`)
            .join(', ')}`,
          [role, `public.${entry.table}`],
        );
        held.set(
          entry.table,
          verbs.filter((_verb, index) => rows[0]?.[`v${index}`] === true),
        );
      }
      return held;
    });

    for (const entry of TABLE_REGISTRY) {
      const actual = [...(effective.get(entry.table) ?? [])].sort();
      const expected = [...appPrivilegesOf(entry)].sort();
      expect(
        actual,
        `${entry.table} (${entry.class}): the application role can do something the registry ` +
          'does not state, or cannot do something it does. TRUNCATE in particular must never ' +
          'appear — a role that can empty audit_log makes the append-only argument false.',
      ).toEqual(expected);
    }
  });
});

describe.skipIf(!reachable)('tenant isolation, as the application role', () => {
  const app = () => getDb(APP_DATABASE_URL!);

  it('returns nothing when no tenant is set — the sabotage', async () => {
    // The bare handle: connected, granted SELECT, and outside any `withTenant` block. The
    // policy compares `tenant_id` to `current_setting('app.tenant_id', true)`, which is
    // NULL here, so every comparison is NULL and no row qualifies. This is the shape a
    // forgotten `withTenant` takes: empty, not an error.
    const rows = await app()
      .transaction((tx) => tx.select().from(s.department));
    expect(rows).toEqual([]);
  });

  it('sees tenant A and not tenant B inside withTenant(A)', async () => {
    const rows = await withTenant(app(), TENANT_A, (tx) => tx.select().from(s.department));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.tenantId === TENANT_A)).toBe(true);
    expect(rows.some((row) => row.id === DEPARTMENT_B)).toBe(false);
  });

  it('sees tenant B and not tenant A inside withTenant(B) — the same query', async () => {
    const rows = await withTenant(app(), TENANT_B, (tx) => tx.select().from(s.department));
    expect(rows.map((row) => row.id)).toEqual([DEPARTMENT_B]);
    expect(rows.every((row) => row.tenantId === TENANT_B)).toBe(true);
  });

  it('sees none of tenant B\'s money inside withTenant(A), and all of it inside withTenant(B)', async () => {
    // The Actuals Ledger, not `department`: this is the table whose rows are money, and a
    // policy here that read `USING (true)` would show one client another's cost while every
    // assertion about `department` stayed green.
    const asA = await withTenant(app(), TENANT_A, (tx) => tx.select().from(s.actualsLedgerEntry));
    expect(asA.length, 'tenant A should still see its own seeded ledger').toBeGreaterThan(0);
    expect(asA.every((row) => row.tenantId === TENANT_A)).toBe(true);
    expect(asA.some((row) => row.id === 'led-rls-probe')).toBe(false);

    const asB = await withTenant(app(), TENANT_B, (tx) => tx.select().from(s.actualsLedgerEntry));
    expect(asB.map((row) => row.id)).toEqual(['led-rls-probe']);
    expect(asB[0]!.deltaMh).toBe(4242n);
  });

  it('reports the tenant in force, and nothing outside a withTenant block', async () => {
    // `withTenant`'s own view of the setting, which is what every policy reads. `null` on the
    // bare handle is the same NULL that makes each tenant-owned table read as empty.
    expect(await withTenant(app(), TENANT_B, (tx) => currentTenant(tx))).toBe(TENANT_B);
    expect(await app().transaction((tx) => currentTenant(tx))).toBeNull();
  });

  it('cannot reach tenant B by asking for its row by id', async () => {
    // Filtering by a primary key is how a leak actually happens: an id that arrived in a
    // URL, used without a tenant predicate. The policy makes the predicate unnecessary.
    const rows = await withTenant(app(), TENANT_A, (tx) =>
      tx.select().from(s.department).where(eq(s.department.id, DEPARTMENT_B)),
    );
    expect(rows).toEqual([]);
  });

  it('refuses to write a row belonging to another tenant', async () => {
    // WITH CHECK, not USING. Without it a tenant could *insert* into another's data even
    // though it cannot read it — a leak in the other direction, and a quieter one.
    const code = await refusalCode(
      withTenant(app(), TENANT_A, (tx) =>
        tx.insert(s.department).values({
          id: 'dep-rls-cross-write',
          tenantId: TENANT_B,
          name: 'should not land',
        }),
      ),
    );
    expect(code, 'the cross-tenant insert was not refused by the policy').toBe('42501');
  });

  it('resets the setting at the end of the transaction, so a pooled connection carries nothing over', async () => {
    // `set_config(..., true)` is transaction-local. If it were session-local the next
    // borrower of this pooled connection would inherit tenant A, which is the failure mode
    // that makes pooling and session settings a bad pair — and it would look like
    // *working* isolation right up until two tenants used the app at once.
    await withTenant(app(), TENANT_B, (tx) => tx.select().from(s.department));
    const after = await app().transaction((tx) => tx.select().from(s.department));
    expect(after).toEqual([]);
  });
});

/** Inserts one disposable `audit_log` row as the owner and returns its `seq`. */
async function seedProbeAuditRow(): Promise<string> {
  return asOwner(async (client) => {
    const { rows } = await client.query<{ seq: string }>(
      `INSERT INTO audit_log (tenant_id, actor, action, target, payload, at)
       VALUES ($1, 'test', 'rls.probe', 'probe', NULL, now()) RETURNING seq`,
      [TENANT_A],
    );
    return rows[0]!.seq;
  });
}

/** Removes it again, through the maintenance hatch — DELETE is refused without it. */
async function removeProbeAuditRow(seq: string): Promise<void> {
  await asOwner(async (client) => {
    await client.query(`SELECT set_config('app.maintenance', 'on', false)`);
    try {
      await client.query('DELETE FROM audit_log WHERE seq = $1', [seq]);
    } finally {
      await client.query(`SELECT set_config('app.maintenance', 'off', false)`);
    }
  });
}

describe.skipIf(!reachable)('append-only is enforced twice', () => {
  const app = () => getDb(APP_DATABASE_URL!);

  it('refuses UPDATE and DELETE to the application role for want of a grant', async () => {
    // Scoped to one probe row, not the whole table. These statements are expected to be
    // REFUSED, so today they change nothing — but the day the grant regresses they would
    // rewrite every actor in the audit log, or delete the lot, inside a transaction that
    // commits on success, and every later assertion in this run would be reading a table the
    // test emptied. A gate must not be able to destroy the fixture it is checking.
    const seq = await seedProbeAuditRow();
    for (const statement of [
      `UPDATE audit_log SET actor = 'tampered' WHERE seq = ${seq}`,
      `DELETE FROM audit_log WHERE seq = ${seq}`,
    ]) {
      // 42501 is insufficient_privilege: the statement never reaches the trigger, because
      // the role has no UPDATE/DELETE grant to attempt it with. Asserting the SQLSTATE
      // rather than the message is what keeps this from passing on the trigger's refusal
      // and reporting a grant that had quietly been handed out.
      const code = await refusalCode(
        withTenant(app(), TENANT_A, (tx) => tx.execute(sql.raw(statement))),
      );
      expect(code, `${statement} was not refused for want of a grant`).toBe('42501');
    }
    await removeProbeAuditRow(seq);
  });

  it('refuses the maintenance role too, until the flag is set — and then allows it', async () => {
    const seq = await seedProbeAuditRow();
    await asOwner(async (client) => {
      // SET ROLE drops the superuser's RLS bypass along with everything else, so from here
      // the connection is subject to the policies and the triggers exactly as a real
      // maintenance session would be.
      await client.query(`SET ROLE ${pg.escapeIdentifier(CANONICAL_MAINTENANCE_ROLE)}`);
      try {
        await client.query('BEGIN');
        // Deliberately WITHOUT setting app.tenant_id: the `maintenance_bypass` policy is what
        // lets the hatch reach a row, and if it were missing this statement would match
        // nothing and the refusal below would never be raised — a hatch that looks like it
        // works because the trigger let an update of zero rows through.
        const triggerCode = await refusalCode(
          client.query('UPDATE audit_log SET actor = $1 WHERE seq = $2', ['tampered', seq]),
        );
        expect(
          triggerCode,
          'the maintenance role holds the UPDATE grant and a policy that reaches the row, so ' +
            'only the trigger can refuse it — and it did not',
        ).toBe(APPEND_ONLY_ERRCODE);
        await client.query('ROLLBACK');

        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.maintenance', 'on', true)`);
        const updated = await client.query('UPDATE audit_log SET actor = $1 WHERE seq = $2', [
          'maintenance',
          seq,
        ]);
        expect(updated.rowCount, 'the escape hatch did not let the update through').toBe(1);
        const deleted = await client.query('DELETE FROM audit_log WHERE seq = $1', [seq]);
        expect(deleted.rowCount, 'the escape hatch did not let the delete through').toBe(1);
        await client.query('COMMIT');
      } finally {
        await client.query('RESET ROLE');
      }
    });
    // Committed inside the hatch above; this only cleans up if the assertions bailed early.
    await removeProbeAuditRow(seq).catch(() => {});
  }, 30_000);

  it('refuses TRUNCATE on an append-only table, to the owner as well', async () => {
    // The verb a FOR EACH ROW trigger cannot see. The application role has no TRUNCATE grant
    // (42501), and the OWNER — who needs no grant at all — is refused by the statement-level
    // trigger (MOMO1). The owner case is the one that matters: it is the only control on a
    // verb that empties the whole table in one statement, and `seed.ts` is the one caller that
    // opens the hatch to use it.
    const appCode = await refusalCode(
      withTenant(app(), TENANT_A, (tx) => tx.execute(sql.raw('TRUNCATE audit_log'))),
    );
    expect(appCode, 'the application role was not refused TRUNCATE').toBe('42501');

    const ownerCode = await refusalCode(
      asOwner(async (client) => {
        await client.query('BEGIN');
        try {
          await client.query('TRUNCATE audit_log');
        } finally {
          await client.query('ROLLBACK');
        }
      }),
    );
    expect(
      ownerCode,
      'the owner was not refused TRUNCATE by the statement-level trigger — without it the ' +
        'grant is the only control on the one verb that empties the table',
    ).toBe(APPEND_ONLY_ERRCODE);
  });

  it('refuses UPDATE, DELETE and TRUNCATE on identity_event to the owner, until the hatch opens', async () => {
    // `identity_event` is `global` with `appendOnlyGuard`: same trigger pair as the nine
    // append-only tables, but no tenant policy. The owner needs no grant, so only the trigger
    // can refuse — which is the half of the double enforcement the grant cannot cover.
    const id = await asOwner(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO identity_event (id, user_id, action, at, payload)
         VALUES ('idt-rls-probe', 'usr-rls-probe', 'password.reset', now(), NULL)
         RETURNING id`,
      );
      return rows[0]!.id;
    });

    try {
      await asOwner(async (client) => {
        const updateCode = await refusalCode(
          client.query(`UPDATE identity_event SET action = 'tampered' WHERE id = $1`, [id]),
        );
        expect(updateCode, 'owner UPDATE on identity_event was not refused by the trigger').toBe(
          APPEND_ONLY_ERRCODE,
        );
        const deleteCode = await refusalCode(
          client.query(`DELETE FROM identity_event WHERE id = $1`, [id]),
        );
        expect(deleteCode, 'owner DELETE on identity_event was not refused by the trigger').toBe(
          APPEND_ONLY_ERRCODE,
        );
        const truncateCode = await refusalCode(
          (async () => {
            await client.query('BEGIN');
            try {
              await client.query('TRUNCATE identity_event');
            } finally {
              await client.query('ROLLBACK');
            }
          })(),
        );
        expect(
          truncateCode,
          'owner TRUNCATE on identity_event was not refused by the statement-level trigger',
        ).toBe(APPEND_ONLY_ERRCODE);

        await client.query(`SELECT set_config('app.maintenance', 'on', false)`);
        try {
          const deleted = await client.query(`DELETE FROM identity_event WHERE id = $1`, [id]);
          expect(deleted.rowCount, 'the escape hatch did not let the delete through').toBe(1);
        } finally {
          await client.query(`SELECT set_config('app.maintenance', 'off', false)`);
        }
      });
    } finally {
      // If an assertion failed before the hatch DELETE, the probe row must not survive.
      await asOwner(async (client) => {
        await client.query(`SELECT set_config('app.maintenance', 'on', false)`);
        try {
          await client.query(`DELETE FROM identity_event WHERE id = $1`, [id]);
        } finally {
          await client.query(`SELECT set_config('app.maintenance', 'off', false)`);
        }
      }).catch(() => {});
    }
  });
});
