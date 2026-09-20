import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as schemaModule from './schema';
import {
  APPEND_ONLY,
  APP_PRIVILEGES,
  CANONICAL_APP_ROLE,
  CANONICAL_MAINTENANCE_ROLE,
  CLIENT_ALLOCATED_SEQ,
  MAINTENANCE_PRIVILEGES,
  REGISTERED_TABLES,
  TABLE_REGISTRY,
  TENANT_OWNED,
} from './table-classes';
import { generateAll, seqAllocatorName } from './sql/generate';

/**
 * The registry, against the ORM and against the checked-in SQL. No database.
 *
 * `rls.test.ts` is the other half: it compares the registry to the live catalog, which is
 * what catches a migration that added a table. This file catches the two failures that can
 * happen without any migration at all — a table added to `schema.ts` and not classed, and a
 * hand edit to `packages/db/sql/*.sql` that would make the checked-in SQL a lie about what
 * `pnpm db:policies` applies.
 */

const SQL_DIR = fileURLToPath(new URL('../sql/', import.meta.url));

/** Every table `schema.ts` declares, by its SQL name, read off the Drizzle objects. */
function schemaTableNames(): string[] {
  const names: string[] = [];
  for (const value of Object.values(schemaModule.schemaTables)) {
    // Drizzle keeps the SQL name behind a symbol rather than a property, so it is read
    // from the symbol registry rather than assumed to match the exported binding — which
    // it does not: `rateEntry` is `rate_entry`.
    const nameSymbol = Object.getOwnPropertySymbols(value).find(
      (symbol) => symbol.description === 'drizzle:Name',
    );
    expect(nameSymbol, 'a Drizzle table without a name symbol').toBeDefined();
    names.push((value as unknown as Record<symbol, string>)[nameSymbol!]);
  }
  return names.sort();
}

describe('the table-class registry is the single source', () => {
  it('names every table in schema.ts, exactly once, and no others', () => {
    expect(REGISTERED_TABLES).toEqual(schemaTableNames());
    expect(new Set(REGISTERED_TABLES).size, 'a table is registered twice').toBe(
      REGISTERED_TABLES.length,
    );
  });

  it('holds the 17 tables of this release, 16 of them tenant-owned', () => {
    // Pinned as numbers as well as names: a future change that removes a table and adds
    // another keeps the name lists agreeing with `schema.ts` while silently changing what
    // this story was reasoned about.
    expect(TABLE_REGISTRY).toHaveLength(17);
    expect(TENANT_OWNED).toHaveLength(16);
    expect(TABLE_REGISTRY.filter((e) => e.tenantColumn === null).map((e) => e.table)).toEqual([
      'tenant',
    ]);
  });

  it('classes the nine insert-only tables append-only', () => {
    expect(APPEND_ONLY.map((e) => e.table).sort()).toEqual(
      [
        'actuals_ledger_entry',
        'audit_log',
        'baseline_version',
        'baseline_wp',
        'disposition_event',
        'mapping_event',
        'rate_entry',
        'ticket_observation',
        'tracker_snapshot',
      ].sort(),
    );
  });

  it('never grants the application role UPDATE or DELETE on an append-only table', () => {
    // Half of the double enforcement, asserted at its source rather than only in the
    // catalog: a class whose privilege list grew an UPDATE would install the grant on nine
    // tables at once, and the catalog assertion would report nine failures without saying
    // why they all moved together.
    expect(APP_PRIVILEGES['append-only']).toEqual(['SELECT', 'INSERT']);
    // And the maintenance role holds the exception on those tables and nowhere else.
    expect(MAINTENANCE_PRIVILEGES['append-only']).toEqual(['SELECT', 'UPDATE', 'DELETE']);
    for (const klass of ['mutable-audited', 'derived', 'global', 'operational'] as const) {
      expect(MAINTENANCE_PRIVILEGES[klass], `maintenance holds something on ${klass}`).toEqual([]);
    }
  });

  it('gives the application role read-only access to the global class', () => {
    // `tenant` has no isolation policy — it is what `tenant_id` points at — so the grant
    // is the only thing standing between the application role and writing another Tenant's
    // row. It reads, and that is all.
    expect(APP_PRIVILEGES.global).toEqual(['SELECT']);
  });
});

describe('the checked-in SQL is what the generator emits', () => {
  // `scripts/db-policies.ts` regenerates rather than reading these files, so a hand edit
  // cannot reach a database — it can only be caught here. Run `pnpm db:sql` to refresh.
  for (const [name, expected] of Object.entries(
    generateAll(CANONICAL_APP_ROLE, CANONICAL_MAINTENANCE_ROLE),
  )) {
    it(`packages/db/sql/${name} has not drifted`, () => {
      const onDisk = readFileSync(`${SQL_DIR}${name}`, 'utf8');
      expect(onDisk).toBe(expected);
    });
  }

  it('emits ENABLE and FORCE and a policy for every tenant-owned table', () => {
    const rls = generateAll(CANONICAL_APP_ROLE, CANONICAL_MAINTENANCE_ROLE)['rls.sql']!;
    for (const entry of TENANT_OWNED) {
      expect(rls, `${entry.table} is missing ENABLE`).toContain(
        `ALTER TABLE public."${entry.table}" ENABLE ROW LEVEL SECURITY;`,
      );
      expect(rls, `${entry.table} is missing FORCE`).toContain(
        `ALTER TABLE public."${entry.table}" FORCE ROW LEVEL SECURITY;`,
      );
      expect(rls, `${entry.table} is missing its policy`).toContain(
        `CREATE POLICY "tenant_isolation" ON public."${entry.table}"`,
      );
    }
    // …and nothing for the table that is not tenant-owned.
    expect(rls).not.toContain('public."tenant" ENABLE');
  });

  it('binds nothing into the policy: it compares against a session setting', () => {
    const rls = generateAll(CANONICAL_APP_ROLE, CANONICAL_MAINTENANCE_ROLE)['rls.sql']!;
    expect(rls).toContain(
      `"tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')`,
    );
    // `missing_ok = true` is what makes an unset tenant return no rows instead of raising,
    // and NULLIF is what folds the empty string into that same NULL — nothing in the schema
    // forbids a tenant_id of '', so without it a session that set the tenant to '' would
    // match those rows.
    expect(rls).not.toContain(`current_setting('app.tenant_id')`);
  });

  it('applies the triggers before the grants, because the grants reference them', () => {
    // Insertion order is apply order in `scripts/db-policies.ts`, and grants.sql grants
    // EXECUTE on the `seq` allocator functions triggers.sql creates. The other order fails
    // with "function does not exist", which is a confusing way to learn about an ordering.
    const names = Object.keys(generateAll(CANONICAL_APP_ROLE, CANONICAL_MAINTENANCE_ROLE));
    expect(names.indexOf('triggers.sql')).toBeLessThan(names.indexOf('grants.sql'));
  });

  it('emits a SECURITY DEFINER seq allocator for every caller-allocated seq, and grants it narrowly', () => {
    // `MAX(seq) + 1` under row-level security is the caller's Tenant's maximum, so two
    // Tenants collide on a key unique across all of them. These are the functions that read
    // the true maximum as the owner. EXECUTE must be revoked from PUBLIC: Postgres grants it
    // to PUBLIC by default and these are SECURITY DEFINER.
    const files = generateAll(CANONICAL_APP_ROLE, CANONICAL_MAINTENANCE_ROLE);
    expect(CLIENT_ALLOCATED_SEQ.map((e) => e.table).sort()).toEqual([
      'actuals_ledger_entry',
      'mapping_event',
    ]);
    for (const entry of CLIENT_ALLOCATED_SEQ) {
      const fn = `public."${seqAllocatorName(entry.table)}"()`;
      expect(files['triggers.sql']!).toContain(`CREATE OR REPLACE FUNCTION ${fn} RETURNS bigint`);
      expect(files['grants.sql']!).toContain(`REVOKE ALL ON FUNCTION ${fn} FROM PUBLIC;`);
      expect(files['grants.sql']!).toContain(
        `GRANT EXECUTE ON FUNCTION ${fn} TO "${CANONICAL_APP_ROLE}";`,
      );
    }
  });

  it('pins search_path on every function it emits', () => {
    // A guard whose `current_setting`/`pg_has_role` resolve through the caller's search_path
    // can be switched off by a caller who can create objects in an earlier schema; for the
    // SECURITY DEFINER allocators the same hole is a privilege escalation.
    const triggers = generateAll(CANONICAL_APP_ROLE, CANONICAL_MAINTENANCE_ROLE)['triggers.sql']!;
    const functionCount = (triggers.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length;
    const pinnedCount = (triggers.match(/SET search_path = pg_catalog, pg_temp/g) ?? []).length;
    expect(functionCount).toBeGreaterThan(0);
    expect(pinnedCount, 'a function was emitted without a pinned search_path').toBe(functionCount);
  });

  it('checks the maintenance role exists before asking whether the caller is a member', () => {
    // `pg_has_role` raises 42704 on a role that is not there, which would make "the hatch
    // role was never created" look like an unrelated catalog error and mask the MOMO1 the
    // guard exists to raise.
    const triggers = generateAll(CANONICAL_APP_ROLE, CANONICAL_MAINTENANCE_ROLE)['triggers.sql']!;
    const existence = triggers.indexOf('FROM pg_catalog.pg_roles WHERE rolname');
    const membership = triggers.indexOf('pg_catalog.pg_has_role(current_user');
    expect(existence).toBeGreaterThan(-1);
    expect(existence).toBeLessThan(membership);
  });

  it('guards TRUNCATE with a statement-level trigger on every append-only table', () => {
    // A FOR EACH ROW trigger does not fire for TRUNCATE, so without this the grant is the
    // only control on the one verb that empties a table in a single statement.
    const triggers = generateAll(CANONICAL_APP_ROLE, CANONICAL_MAINTENANCE_ROLE)['triggers.sql']!;
    for (const entry of APPEND_ONLY) {
      expect(triggers, `${entry.table} has no TRUNCATE guard`).toContain(
        `  BEFORE TRUNCATE ON public."${entry.table}"`,
      );
    }
  });

  it('never grants TRUNCATE to the application role, in any class', () => {
    for (const [klass, privileges] of Object.entries(APP_PRIVILEGES)) {
      expect(privileges, `${klass} grants TRUNCATE`).not.toContain('TRUNCATE');
    }
  });
});
