import { readFileSync } from 'node:fs';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as schemaModule from './schema';
// A test, not application source: `source-discipline.test.ts` pins who may import the bridge's
// Drizzle symbol among the modules that ship, and a registry check has to be able to name it.
import { tenantMembership } from './schema-membership';
import { APPEND_ONLY, APPEND_ONLY_GUARDED, APPEND_ONLY_MAINTENANCE_PRIVILEGES, APP_PRIVILEGES, TENANT_BRIDGES, appendOnlyGuardOf, appPrivilegesOf, CANONICAL_APP_ROLE, CANONICAL_MAINTENANCE_ROLE, MAINTENANCE_PRIVILEGES, maintenancePrivilegesOf, REGISTERED_TABLES, TABLE_REGISTRY, TENANT_OWNED, } from './table-classes';
import { generateAll } from './sql/generate';
import { TRUNCATE_ORDER } from './seed';
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
/**
 * Every table `schema.ts` and `schema-membership.ts` declare, by its SQL name, read off the
 * Drizzle objects. (drizzle-kit reads both files; see `drizzle.config.ts`.)
 */
function schemaTableNames() {
    const names = [];
    for (const value of [...Object.values(schemaModule.schemaTables), tenantMembership]) {
        // Drizzle keeps the SQL name behind a symbol rather than a property, so it is read
        // from the symbol registry rather than assumed to match the exported binding — which
        // it does not: `rateEntry` is `rate_entry`.
        const nameSymbol = Object.getOwnPropertySymbols(value).find((symbol) => symbol.description === 'drizzle:Name');
        expect(nameSymbol, 'a Drizzle table without a name symbol').toBeDefined();
        names.push(value[nameSymbol]);
    }
    return names.sort();
}
describe('the table-class registry is the single source', () => {
    it('names every table in schema.ts, exactly once, and no others', () => {
        expect(REGISTERED_TABLES).toEqual(schemaTableNames());
        expect(new Set(REGISTERED_TABLES).size, 'a table is registered twice').toBe(REGISTERED_TABLES.length);
    });
    it('is what the reseed truncates, table for table', () => {
        // `TRUNCATE … CASCADE` would now reach a child through its foreign key, but only a child —
        // a table missing here with no referencing parent would keep its rows across `pnpm seed`.
        expect([...TRUNCATE_ORDER].sort()).toEqual([...REGISTERED_TABLES].sort());
        expect(new Set(TRUNCATE_ORDER).size, 'a table is truncated twice').toBe(TRUNCATE_ORDER.length);
    });
    it('holds the 45 tables of this release, 38 of them tenant-owned', () => {
        // Pinned as numbers as well as names: a future change that removes a table and adds
        // another keeps the name lists agreeing with `schema.ts` while silently changing what
        // this story was reasoned about. Story 1.4 slice 1: `app_user` out; the four Better Auth
        // tables and the tenant-membership bridge in, all `global`. Slice 4 adds `identity_event`,
        // also `global`. Story 1.6 adds `project_default_rate_entry` (tenant-owned, append-only).
        // Story 2.1 (AD-30) adds the five scheduling tables, all tenant-owned. Story 2.10 adds
        // `pct_override_event` and Custom Field definition/value. Story 2.12 adds `calendar_day_event`.
        // Story 5.1 adds `ticket`, `tracker_account`, `fixture_cursor` (all tenant-owned).
        // Story 5.2 adds `connector_scope_event`, `tracker_snapshot_attempt` (tenant-owned, append-only).
        // Story 5.5 adds `project_setting_event` (tenant-owned, append-only).
        // Story 5.6 adds `connector_ownership_event` (append-only) and `connector_overlap` (derived).
        // Story 5.7 adds `measurement_basis_event`, `connector_setting_event` (append-only).
        // Story 5.8 adds `tracker_account_link_event` (append-only).
        // Story 5.9 adds `mapping_head` (derived).
        // Story 5.12 adds `wp_flag_event` (append-only).
        // Story 6.5 adds `tenant_setting_event` (append-only Tenant Health defaults).
        expect(TABLE_REGISTRY).toHaveLength(47);
        expect(TENANT_OWNED).toHaveLength(40);
        expect(TABLE_REGISTRY.filter((e) => e.tenantColumn === null).map((e) => e.table)).toEqual([
            'tenant',
            'auth_user',
            'session',
            'account',
            'verification',
            'tenant_membership',
            'identity_event',
        ]);
        expect(TABLE_REGISTRY.filter((e) => e.class === 'global').map((e) => e.table).sort()).toEqual(['account', 'auth_user', 'identity_event', 'session', 'tenant', 'tenant_membership', 'verification']);
    });
    it('flags exactly one table as the tenant bridge, and it is tenant_membership', () => {
        // The flag is what lets `rls.test.ts` accept a `tenant_id` column with no policy. On a
        // second table it would switch isolation off there with every other gate still green.
        expect(TENANT_BRIDGES.map((e) => e.table)).toEqual(['tenant_membership']);
        expect(TENANT_BRIDGES[0].class).toBe('global');
        expect(TENANT_BRIDGES[0].tenantColumn).toBeNull();
    });
    it('classes the twenty-four insert-only tables append-only', () => {
        expect(APPEND_ONLY.map((e) => e.table).sort()).toEqual([
            'actuals_ledger_entry',
            'audit_log',
            'baseline_version',
            'baseline_wp',
            'calendar_day_event',
            'connector_ownership_event',
            'connector_scope_event',
            'connector_setting_event',
            'disposition_event',
            'holiday_calendar_version',
            'mapping_event',
            'measurement_basis_event',
            'pct_override_event',
            'project_default_rate_entry',
            'project_setting_event',
            'rate_entry',
            'schedule_run',
            'tenant_setting_event',
            'ticket_observation',
            'tracker_account_link_event',
            'tracker_snapshot',
            'tracker_snapshot_attempt',
            'wp_flag_event',
            'wp_status_event',
        ].sort());
    });
    it('classes the scheduling slice as AD-21 decides (story 2.1 / 2.10 / 2.12)', () => {
        const classOf = (table) => TABLE_REGISTRY.find((e) => e.table === table)?.class;
        expect(classOf('wp_dependency')).toBe('mutable-audited');
        expect(classOf('wp_status_event')).toBe('append-only');
        expect(classOf('pct_override_event')).toBe('append-only');
        expect(classOf('calendar_day_event')).toBe('append-only');
        expect(classOf('custom_field_definition')).toBe('mutable-audited');
        expect(classOf('custom_field_value')).toBe('mutable-audited');
        expect(classOf('holiday_calendar_version')).toBe('append-only');
        expect(classOf('schedule_run')).toBe('append-only');
        expect(classOf('wp_schedule')).toBe('derived');
    });
    it('lists every table after each table its foreign keys reference', () => {
        // The registry's order is an insert order and its reverse is `probe-tenants.ts`'s delete
        // order. With story 2.1's composite foreign keys, a parent listed after its child makes the
        // probe cleanup fail on 23503 — so the order is read off the Drizzle foreign keys and checked.
        const position = new Map(TABLE_REGISTRY.map((e, index) => [e.table, index]));
        const misordered = [];
        for (const table of [...Object.values(schemaModule.schemaTables), tenantMembership]) {
            const { name, foreignKeys } = getTableConfig(table);
            for (const fk of foreignKeys) {
                const parent = getTableConfig(fk.reference().foreignTable).name;
                if (parent !== name && position.get(parent) > position.get(name)) {
                    misordered.push(`${name} → ${parent}`);
                }
            }
        }
        expect(misordered, 'these tables are registered before a table they reference').toEqual([]);
    });
    it('never grants the application role UPDATE or DELETE on an append-only table', () => {
        // Half of the double enforcement, asserted at its source rather than only in the
        // catalog: a class whose privilege list grew an UPDATE would install the grant on nine
        // tables at once, and the catalog assertion would report nine failures without saying
        // why they all moved together.
        expect(APP_PRIVILEGES['append-only']).toEqual(['SELECT', 'INSERT']);
        // And the maintenance role holds the hatch grant on every guarded table — the nine
        // append-only ones plus `identity_event` — and nowhere else.
        expect(MAINTENANCE_PRIVILEGES['append-only']).toEqual(['SELECT', 'UPDATE', 'DELETE']);
        expect(APPEND_ONLY_MAINTENANCE_PRIVILEGES).toEqual(['SELECT', 'UPDATE', 'DELETE']);
        for (const klass of ['mutable-audited', 'derived', 'global', 'operational']) {
            expect(MAINTENANCE_PRIVILEGES[klass], `maintenance holds something on ${klass}`).toEqual([]);
        }
        expect(APPEND_ONLY_GUARDED.map((e) => e.table).sort()).toEqual([...APPEND_ONLY.map((e) => e.table), 'identity_event'].sort());
        for (const entry of TABLE_REGISTRY) {
            const expected = appendOnlyGuardOf(entry) ? APPEND_ONLY_MAINTENANCE_PRIVILEGES : [];
            expect(maintenancePrivilegesOf(entry), entry.table).toEqual(expected);
        }
    });
    it('gives the application role read-only access to the global class, except the Better Auth tables, the bridge and identity_event', () => {
        // `tenant` has no isolation policy — it is what `tenant_id` points at — so the grant
        // is the only thing standing between the application role and writing another Tenant's
        // row. It reads, and that is all. The membership bridge has one reader for request
        // resolution and one writer (story 1.4 slice 2's audited use cases, which filter by
        // `tenant_id` themselves): SELECT, UPDATE and DELETE — never INSERT, because adding a user
        // to a Tenant is invitation work, not a request's side effect. `identity_event` (slice 4)
        // is the third shape: SELECT and INSERT only — its one writer never updates or deletes.
        expect(APP_PRIVILEGES.global).toEqual(['SELECT']);
        const overridden = TABLE_REGISTRY.filter((e) => e.appPrivileges !== undefined);
        expect(overridden.map((e) => e.table).sort()).toEqual([
            'account',
            'auth_user',
            'identity_event',
            'session',
            'tenant',
            'tenant_membership',
            'verification',
        ]);
        const fullDml = overridden.filter((e) => e.table !== 'tenant_membership' && e.table !== 'identity_event' && e.table !== 'tenant');
        expect(fullDml.map((e) => e.table).sort()).toEqual(['account', 'auth_user', 'session', 'verification']);
        for (const entry of fullDml) {
            expect(appPrivilegesOf(entry), entry.table).toEqual(['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
        }
        expect(appPrivilegesOf(TABLE_REGISTRY.find((e) => e.table === 'tenant'))).toEqual([
            'SELECT',
            'UPDATE',
        ]);
        expect(appPrivilegesOf(TABLE_REGISTRY.find((e) => e.table === 'tenant_membership'))).toEqual(['SELECT', 'UPDATE', 'DELETE']);
        expect(appPrivilegesOf(TABLE_REGISTRY.find((e) => e.table === 'identity_event'))).toEqual(['SELECT', 'INSERT']);
    });
});
describe('the checked-in SQL is what the generator emits', () => {
    // `scripts/db-policies.ts` regenerates rather than reading these files, so a hand edit
    // cannot reach a database — it can only be caught here. Run `pnpm db:sql` to refresh.
    for (const [name, expected] of Object.entries(generateAll(CANONICAL_APP_ROLE, CANONICAL_MAINTENANCE_ROLE))) {
        it(`packages/db/sql/${name} has not drifted`, () => {
            const onDisk = readFileSync(`${SQL_DIR}${name}`, 'utf8');
            expect(onDisk).toBe(expected);
        });
    }
    it('emits ENABLE and FORCE and a policy for every tenant-owned table', () => {
        const rls = generateAll(CANONICAL_APP_ROLE, CANONICAL_MAINTENANCE_ROLE)['rls.sql'];
        for (const entry of TENANT_OWNED) {
            expect(rls, `${entry.table} is missing ENABLE`).toContain(`ALTER TABLE public."${entry.table}" ENABLE ROW LEVEL SECURITY;`);
            expect(rls, `${entry.table} is missing FORCE`).toContain(`ALTER TABLE public."${entry.table}" FORCE ROW LEVEL SECURITY;`);
            expect(rls, `${entry.table} is missing its policy`).toContain(`CREATE POLICY "tenant_isolation" ON public."${entry.table}"`);
        }
        // …and nothing for the table that is not tenant-owned.
        expect(rls).not.toContain('public."tenant" ENABLE');
    });
    it('binds nothing into the policy: it compares against a session setting', () => {
        const rls = generateAll(CANONICAL_APP_ROLE, CANONICAL_MAINTENANCE_ROLE)['rls.sql'];
        expect(rls).toContain(`"tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')`);
        // `missing_ok = true` is what makes an unset tenant return no rows instead of raising,
        // and NULLIF is what folds the empty string into that same NULL — nothing in the schema
        // forbids a tenant_id of '', so without it a session that set the tenant to '' would
        // match those rows.
        expect(rls).not.toContain(`current_setting('app.tenant_id')`);
    });
    it('emits no caller-allocated seq allocator: every seq is an identity column (D1)', () => {
        // `mapping_event.seq` and `actuals_ledger_entry.seq` were caller-allocated through two
        // SECURITY DEFINER `momo_next_*_seq()` functions until the watermark slice made both identity
        // columns. Nothing may emit or grant those functions again.
        const files = generateAll(CANONICAL_APP_ROLE, CANONICAL_MAINTENANCE_ROLE);
        for (const [name, text] of Object.entries(files)) {
            expect(text, `${name} still emits a seq allocator`).not.toContain('momo_next_');
            expect(text, `${name} still emits a SECURITY DEFINER function`).not.toContain('SECURITY DEFINER');
        }
    });
    it('gives every append-only table an identity seq', () => {
        // The watermark discipline (`watermark-lock.ts`) needs the `seq` obtained by the INSERT,
        // after the lock — which is what an identity default is. A plain `seq` column would put the
        // allocation back in the caller's hands.
        const guarded = new Set(APPEND_ONLY.map((e) => e.table));
        const missing = Object.values(schemaModule.schemaTables)
            .map((t) => getTableConfig(t))
            .filter((c) => guarded.has(c.name))
            .filter((c) => {
            const seq = c.columns.find((col) => col.name === 'seq');
            return seq !== undefined && seq.generatedIdentity === undefined;
        })
            .map((c) => c.name);
        expect(missing).toEqual([]);
    });
    it('pins search_path on every function it emits', () => {
        // A guard whose `current_setting`/`pg_has_role` resolve through the caller's search_path
        // can be switched off by a caller who can create objects in an earlier schema.
        const triggers = generateAll(CANONICAL_APP_ROLE, CANONICAL_MAINTENANCE_ROLE)['triggers.sql'];
        const functionCount = (triggers.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length;
        const pinnedCount = (triggers.match(/SET search_path = pg_catalog, pg_temp/g) ?? []).length;
        expect(functionCount).toBeGreaterThan(0);
        expect(pinnedCount, 'a function was emitted without a pinned search_path').toBe(functionCount);
    });
    it('checks the maintenance role exists before asking whether the caller is a member', () => {
        // `pg_has_role` raises 42704 on a role that is not there, which would make "the hatch
        // role was never created" look like an unrelated catalog error and mask the MOMO1 the
        // guard exists to raise.
        const triggers = generateAll(CANONICAL_APP_ROLE, CANONICAL_MAINTENANCE_ROLE)['triggers.sql'];
        const existence = triggers.indexOf('FROM pg_catalog.pg_roles WHERE rolname');
        const membership = triggers.indexOf('pg_catalog.pg_has_role(current_user');
        expect(existence).toBeGreaterThan(-1);
        expect(existence).toBeLessThan(membership);
    });
    it('guards TRUNCATE with a statement-level trigger on every append-only-guarded table', () => {
        // A FOR EACH ROW trigger does not fire for TRUNCATE, so without this the grant is the
        // only control on the one verb that empties a table in a single statement.
        const triggers = generateAll(CANONICAL_APP_ROLE, CANONICAL_MAINTENANCE_ROLE)['triggers.sql'];
        for (const entry of APPEND_ONLY_GUARDED) {
            expect(triggers, `${entry.table} has no TRUNCATE guard`).toContain(`  BEFORE TRUNCATE ON public."${entry.table}"`);
        }
    });
    it('grants the maintenance hatch on identity_event even though its class is global', () => {
        const grants = generateAll(CANONICAL_APP_ROLE, CANONICAL_MAINTENANCE_ROLE)['grants.sql'];
        expect(grants).toContain(`GRANT SELECT, UPDATE, DELETE ON public."identity_event" TO "${CANONICAL_MAINTENANCE_ROLE}";`);
    });
    it('never grants TRUNCATE to the application role, in any class', () => {
        for (const [klass, privileges] of Object.entries(APP_PRIVILEGES)) {
            expect(privileges, `${klass} grants TRUNCATE`).not.toContain('TRUNCATE');
        }
        // …nor through a per-entry override.
        for (const entry of TABLE_REGISTRY) {
            expect(appPrivilegesOf(entry), `${entry.table} grants TRUNCATE`).not.toContain('TRUNCATE');
        }
    });
});
