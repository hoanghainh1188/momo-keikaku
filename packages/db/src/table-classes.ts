/**
 * The table-class registry (AD-21).
 *
 * This file is the ONLY source from which the row-level-security policies, the role
 * grants and the append-only triggers are produced. `packages/db/src/sql/generate.ts`
 * renders them; `scripts/db-policies.ts` applies them; `packages/db/sql/*.sql` is the
 * checked-in rendering, and a test fails when it drifts from what the generator emits.
 * Nothing is hand-written per table, and nothing may be: a hand-edited policy is a
 * policy nobody re-derives when the class changes.
 *
 * Every table in the `public` schema is named here exactly once, with exactly one class.
 * `packages/db/src/rls.test.ts` reads `information_schema.tables` and fails naming any
 * table the registry does not carry — which is what makes a migration that adds a table
 * without a class a CI failure rather than a silently unprotected table.
 *
 * The registry covers ORDINARY TABLES only. A view or materialised view over a tenant-owned
 * table is not registrable here — it would need a class of its own, and a view runs with its
 * owner's permissions unless it is created `WITH (security_invoker = true)`, which means an
 * unclassed view over a protected table would hand out every Tenant's rows. Rather than
 * guess, `packages/db/src/rls.test.ts` fails on any relation in `public` that is not an
 * ordinary table, naming it and its relkind. Adding one is therefore a deliberate decision
 * about classes, not a migration nobody noticed.
 *
 * `tenantColumn` is the second, independent axis. A table is *tenant-owned* when it
 * carries one, and a tenant-owned table gets ENABLE + FORCE row-level security and the
 * isolation policy. 16 of the 22 tables today are tenant-owned. `tenant` itself is not — it is
 * the table the column points at — so it is `global`, which is the class for rows that exist
 * before any tenant is resolved. Story 1.4 slice 1 put the four Better Auth tables and the
 * tenant-membership bridge in that class beside it.
 *
 * TWO PER-ENTRY EXCEPTIONS, each stated where it applies rather than by a new class:
 *
 *   * `appPrivileges` overrides the class's grant. The four Better Auth tables are `global`
 *     (no tenant policy) but Better Auth writes them on the application role's connection, so
 *     they need DML; `tenant` and `tenant_membership` keep the class's SELECT.
 *   * `tenantBridge` marks the ONE table that carries `tenant_id` without row-level security:
 *     `tenant_membership`, read to decide which Tenant a request acts in, and so read before any
 *     Tenant is known. `rls.test.ts` otherwise fails a `tenant_id` column with a null
 *     `tenantColumn`, and `registry.test.ts` fails the flag on any second table.
 */

/** AD-21's five classes. A table has exactly one. */
export type TableClass =
  /** Rows are written once. No UPDATE/DELETE grant, plus a BEFORE UPDATE OR DELETE trigger. */
  | 'append-only'
  /** Rows change, and every change is recorded in the audit log (story 1.3). */
  | 'mutable-audited'
  /** Rows are recomputable from other tables; losing one costs time, not truth. */
  | 'derived'
  /** Not owned by a tenant: no tenant policy, because the session resolves before a Tenant is known. */
  | 'global'
  /** Infrastructure bookkeeping (queues, leases, watermarks) rather than product data. */
  | 'operational';

export interface TableEntry {
  /** The unqualified table name in the `public` schema. */
  readonly table: string;
  readonly class: TableClass;
  /**
   * The tenant-discriminating column, or `null` when the table is not tenant-owned.
   * A non-null value is what turns on FORCE row-level security and the isolation policy.
   */
  readonly tenantColumn: string | null;
  /** Why this class, in one line. Read by whoever is about to change it. */
  readonly why: string;
  /**
   * True when the table's `seq` primary key is allocated by the CALLER rather than by a
   * Postgres identity column.
   *
   * It matters for exactly one reason: under row-level security the caller cannot compute
   * `MAX(seq) + 1`, because the MAX it can see is its own Tenant's. Two Tenants would each
   * compute the same next value and collide on a globally unique key. The generator emits a
   * SECURITY DEFINER allocator for each of these, which reads the true maximum as the table
   * owner; `packages/db/src/sql/generate.ts` has the detail.
   *
   * The real fix is the watermark work a later slice owns (`pg_advisory_xact_lock` before
   * allocation). This field is what keeps the collision from being a live bug until then.
   */
  readonly clientAllocatedSeq?: true;
  /**
   * The application role's privileges on this table when they differ from its class's
   * (`APP_PRIVILEGES`). Read through `appPrivilegesOf`, never directly, so the generator and the
   * catalog assertion cannot disagree about which one applies.
   */
  readonly appPrivileges?: readonly string[];
  /**
   * True for the tenant-membership bridge alone: a table that carries `tenant_id` and has NO
   * tenant policy, because it is what the Tenant is resolved from. Exactly one table may carry it.
   */
  readonly tenantBridge?: true;
}

/**
 * The 22 tables of this release (story 1.3 slice 2 added `program`; story 1.4 slice 1 removed
 * `app_user` and added the four Better Auth tables and `tenant_membership`), in dependency order.
 *
 * Nine are insert-only today and are classed `append-only` accordingly:
 * baseline_version, baseline_wp, tracker_snapshot, ticket_observation,
 * actuals_ledger_entry, mapping_event, rate_entry, disposition_event, audit_log.
 */
export const TABLE_REGISTRY: readonly TableEntry[] = [
  {
    table: 'tenant',
    class: 'global',
    tenantColumn: null,
    why: 'The Tenant row itself. It is what `tenant_id` points at, so it cannot be discriminated by one.',
  },
  {
    table: 'auth_user',
    class: 'global',
    tenantColumn: null,
    why: 'A person (Better Auth\'s user model, story 1.4). One user may belong to several Tenants, so no Tenant owns the row.',
    appPrivileges: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  },
  {
    table: 'session',
    class: 'global',
    tenantColumn: null,
    why: 'A signed-in browser. Resolved before the Tenant is known; its active Tenant is validated against tenant_membership on every request.',
    appPrivileges: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  },
  {
    table: 'account',
    class: 'global',
    tenantColumn: null,
    why: 'A user\'s credential (the password hash; Google later). Belongs to the person, not to a Tenant.',
    appPrivileges: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  },
  {
    table: 'verification',
    class: 'global',
    tenantColumn: null,
    why: 'Better Auth\'s one-time tokens (password reset, story 1.4 slice 4). Issued before any Tenant is known.',
    appPrivileges: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  },
  {
    table: 'tenant_membership',
    class: 'global',
    tenantColumn: null,
    why: 'The bridge: which Tenants a user belongs to, as which role. Read to resolve the Tenant, so it cannot be filtered by one. Read by resolveRequestContext alone; written by audited use cases only (slice 2).',
    tenantBridge: true,
  },
  {
    table: 'department',
    class: 'mutable-audited',
    tenantColumn: 'tenant_id',
    why: 'Org shape. Renamed and re-parented by Tenant Admins; every change is audited (story 1.3).',
  },
  {
    table: 'program',
    class: 'mutable-audited',
    tenantColumn: 'tenant_id',
    why: 'Org shape between Department and Project (FR-1). Created and renamed by Tenant Admins; every change is audited (story 1.3 slice 2).',
  },
  {
    table: 'project',
    class: 'mutable-audited',
    tenantColumn: 'tenant_id',
    why: 'Project configuration is edited in place; moving a Project between Programs changes roll-up only.',
  },
  {
    table: 'resource',
    class: 'mutable-audited',
    tenantColumn: 'tenant_id',
    why: 'Resources are renamed and re-linked to Tracker Accounts. The dated Rates behind them are not (see rate_entry).',
  },
  {
    table: 'rate_entry',
    class: 'append-only',
    tenantColumn: 'tenant_id',
    why: 'Rates are bitemporal: a retroactive correction appends a row. Rewriting one would change an already-published figure.',
  },
  {
    table: 'work_package',
    class: 'mutable-audited',
    tenantColumn: 'tenant_id',
    why: 'The Current Plan is edited. Deletion is soft (`deleted_at`) so the Baseline still resolves it.',
  },
  {
    table: 'baseline_version',
    class: 'append-only',
    tenantColumn: 'tenant_id',
    why: 'A Baseline is a pinned historical fact. Re-baselining appends a version; it never edits one.',
  },
  {
    table: 'baseline_wp',
    class: 'append-only',
    tenantColumn: 'tenant_id',
    why: 'The per-WP rows of a pinned Baseline version. Immutable for the same reason the version is.',
  },
  {
    table: 'connector',
    class: 'mutable-audited',
    tenantColumn: 'tenant_id',
    why: 'Scope and credentials are re-pointed by a PM. The Snapshots it produced are not (see tracker_snapshot).',
  },
  {
    table: 'tracker_snapshot',
    class: 'append-only',
    tenantColumn: 'tenant_id',
    why: 'An observation of the tracker at one instant. Editing it would rewrite what was observed.',
  },
  {
    table: 'ticket_observation',
    class: 'append-only',
    tenantColumn: 'tenant_id',
    why: 'The Tickets inside one Snapshot. Same argument as the Snapshot that carries them.',
  },
  {
    table: 'actuals_ledger_entry',
    class: 'append-only',
    tenantColumn: 'tenant_id',
    why: 'The Actuals Ledger. A correction is a compensating delta, never an edit — that is what makes AC reproducible.',
    clientAllocatedSeq: true,
  },
  {
    table: 'mapping_event',
    class: 'append-only',
    tenantColumn: 'tenant_id',
    why: 'Mapping is an event log; the current Mapping is its head. Editing history would move hours retroactively.',
    clientAllocatedSeq: true,
  },
  {
    table: 'mapping_rule',
    class: 'mutable-audited',
    tenantColumn: 'tenant_id',
    why: 'Rules are edited and re-prioritised. The events they produced are append-only.',
  },
  {
    table: 'disposition_event',
    class: 'append-only',
    tenantColumn: 'tenant_id',
    why: 'A PM decision at a point in time (FR-29). The record of a decision is not editable.',
  },
  {
    table: 'audit_log',
    class: 'append-only',
    tenantColumn: 'tenant_id',
    why: 'The audit trail. An editable audit log is not one.',
  },
] as const;

/** The privileges the application role holds on a table, by class. Nothing more is granted. */
export const APP_PRIVILEGES: Readonly<Record<TableClass, readonly string[]>> = {
  // No UPDATE, no DELETE. That absence is half of the double enforcement; the
  // BEFORE UPDATE OR DELETE trigger is the other half.
  'append-only': ['SELECT', 'INSERT'],
  'mutable-audited': ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  'derived': ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  // Read-only for the application role: rows here are created by the owner (the seed
  // today, the tenant-provisioning use case in story 1.3). The Better Auth tables are the
  // stated exception, per entry (`appPrivileges`).
  'global': ['SELECT'],
  'operational': ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
} as const;

/**
 * The privileges the `maintenance` role holds. It exists for exactly one purpose: the
 * sanctioned escape hatch on append-only tables, and only with `app.maintenance = 'on'`
 * set, which the trigger checks. On every other class it holds nothing.
 */
export const MAINTENANCE_PRIVILEGES: Readonly<Record<TableClass, readonly string[]>> = {
  'append-only': ['SELECT', 'UPDATE', 'DELETE'],
  'mutable-audited': [],
  'derived': [],
  'global': [],
  'operational': [],
} as const;

/** The canonical role names. `scripts/db-policies.ts` takes the application role's name
 *  from APP_DATABASE_URL instead, so the role the web app connects as and the role the
 *  grants name cannot disagree; these are what the checked-in SQL renders with. */
export const CANONICAL_APP_ROLE = 'momo_app';
export const CANONICAL_MAINTENANCE_ROLE = 'momo_maintenance';

/** The transaction-scoped setting `withTenant` binds and every isolation policy reads. */
export const TENANT_SETTING = 'app.tenant_id';

/** The transaction-scoped setting the append-only trigger accepts as the escape hatch. */
export const MAINTENANCE_SETTING = 'app.maintenance';

/** Every registered table name, sorted — the shape the catalog assertion compares against. */
export const REGISTERED_TABLES: readonly string[] = TABLE_REGISTRY.map((e) => e.table)
  .slice()
  .sort();

/** The tenant-owned tables: the ones that get ENABLE + FORCE RLS and the isolation policy. */
export const TENANT_OWNED: readonly TableEntry[] = TABLE_REGISTRY.filter(
  (e) => e.tenantColumn !== null,
);

/** The append-only tables: the ones that get the BEFORE UPDATE OR DELETE trigger. */
export const APPEND_ONLY: readonly TableEntry[] = TABLE_REGISTRY.filter(
  (e) => e.class === 'append-only',
);

/** The append-only tables whose `seq` the caller allocates, and which therefore need the
 *  SECURITY DEFINER allocator: `MAX(seq)` under RLS is the caller's Tenant's maximum. */
export const CLIENT_ALLOCATED_SEQ: readonly TableEntry[] = TABLE_REGISTRY.filter(
  (e) => e.clientAllocatedSeq === true,
);

/** What the application role holds on one table: its entry's override, or its class's grant. */
export function appPrivilegesOf(entry: TableEntry): readonly string[] {
  return entry.appPrivileges ?? APP_PRIVILEGES[entry.class];
}

/** The tables that carry `tenant_id` without row-level security. Exactly one: the bridge. */
export const TENANT_BRIDGES: readonly TableEntry[] = TABLE_REGISTRY.filter(
  (e) => e.tenantBridge === true,
);

/** Looks a table up, or `undefined` when it is not registered. */
export function tableEntry(table: string): TableEntry | undefined {
  return TABLE_REGISTRY.find((e) => e.table === table);
}
