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
 * isolation policy. 22 of the 29 tables today are tenant-owned. `tenant` itself is not — it is
 * the table the column points at — so it is `global`, which is the class for rows that exist
 * before any tenant is resolved. Story 1.4 slice 1 put the four Better Auth tables and the
 * tenant-membership bridge in that class beside it; slice 4 adds `identity_event`. Story 1.6
 * adds `project_default_rate_entry`. Story 2.1 (AD-30) adds the scheduling slice: `wp_dependency`,
 * `wp_status_event`, `holiday_calendar_version`, `schedule_run` and `wp_schedule`.
 *
 * THREE PER-ENTRY PROPERTIES, each stated where it applies rather than by a new class:
 *
 *   * `appPrivileges` overrides the class's grant. The four Better Auth tables are `global`
 *     (no tenant policy) but Better Auth writes them on the application role's connection, so
 *     they need DML. `tenant_membership` gets SELECT, UPDATE and DELETE and no INSERT (story 1.4
 *     slice 2): its audited use cases revoke a membership, change its role and its Projects, and
 *     adding a user to a Tenant is invitation work, later. `identity_event` gets SELECT and INSERT
 *     and neither UPDATE nor DELETE (story 1.4 slice 4): its one writer only ever inserts, and the
 *     missing grant is half of what makes a row that landed there permanent. `tenant` keeps the
 *     class's SELECT.
 *   * `tenantBridge` marks the ONE table that carries `tenant_id` without row-level security:
 *     `tenant_membership`, read to decide which Tenant a request acts in, and so read before any
 *     Tenant is known. `rls.test.ts` otherwise fails a `tenant_id` column with a null
 *     `tenantColumn`, and `registry.test.ts` fails the flag on any second table.
 *   * `appendOnlyGuard` puts the BEFORE UPDATE OR DELETE and TRUNCATE triggers, and the
 *     append-only class's maintenance grant (`SELECT, UPDATE, DELETE`), on a table whose class
 *     is not `append-only`. Every `append-only` entry implies it; `identity_event` is `global`
 *     with it (AD-5 / AD-21). Read through `appendOnlyGuardOf`, never directly.
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
  /**
   * True when the table carries the append-only trigger pair and the append-only maintenance
   * grant, even if its class is not `append-only`. Every `append-only` entry implies it
   * (`appendOnlyGuardOf`); set it explicitly for `identity_event`.
   */
  readonly appendOnlyGuard?: true;
}

/**
 * The 39 tables of this release (story 1.3 slice 2 added `program`; story 1.4 slice 1 removed
 * `app_user` and added the four Better Auth tables and `tenant_membership`; slice 4 added
 * `identity_event`; story 1.6 `project_default_rate_entry`; story 2.1 the five scheduling tables;
 * story 2.10 `pct_override_event` + Custom Field definition/value; story 2.12
 * `calendar_day_event`; story 5.1 `ticket`, `tracker_account`, `fixture_cursor`; story 5.2
 * `connector_scope_event`, `tracker_snapshot_attempt`; story 5.5 `project_setting_event`),
 * in DEPENDENCY ORDER: every table comes after each table its foreign keys reference, so this order
 * is an insert order and its reverse is a delete order (`probe-tenants.ts` deletes by it). Story
 * 2.1's composite foreign keys made that load-bearing: `schedule_run` before `baseline_version`,
 * `mapping_rule` before `mapping_event`.
 *
 * Eighteen are insert-only and are classed `append-only` accordingly:
 * rate_entry, project_default_rate_entry, wp_status_event, pct_override_event,
 * calendar_day_event, holiday_calendar_version, schedule_run, baseline_version, baseline_wp,
 * project_setting_event, connector_scope_event, tracker_snapshot_attempt, tracker_snapshot,
 * ticket_observation, actuals_ledger_entry, mapping_event, disposition_event, audit_log.
 */
export const TABLE_REGISTRY: readonly TableEntry[] = [
  {
    table: 'tenant',
    class: 'global',
    tenantColumn: null,
    why:
      'The Tenant row itself. It is what `tenant_id` points at, so it cannot be discriminated by one. ' +
      'Story 1.9: `currency` may be set to JPY before any Rate exists — UPDATE only, never INSERT/DELETE.',
    appPrivileges: ['SELECT', 'UPDATE'],
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
    why: 'A user\'s credentials: the password hash, and a Google link (no provider tokens kept). Belongs to the person, not to a Tenant.',
    appPrivileges: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  },
  {
    table: 'verification',
    class: 'global',
    tenantColumn: null,
    why: 'Better Auth\'s one-time values: the OAuth state of a Google sign-in (story 1.4 slice 3) and password-reset tokens (slice 4). Issued before any Tenant is known.',
    appPrivileges: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  },
  {
    table: 'tenant_membership',
    class: 'global',
    tenantColumn: null,
    why: 'The bridge: which Tenants a user belongs to, as which role. Read to resolve the Tenant, so it cannot be filtered by one. One reader for request resolution (resolveRequestContext), one writer (the audited membership use cases, story 1.4 slice 2), which filter by tenant_id explicitly. No INSERT: adding a user is invitation work.',
    tenantBridge: true,
    appPrivileges: ['SELECT', 'UPDATE', 'DELETE'],
  },
  {
    table: 'identity_event',
    class: 'global',
    tenantColumn: null,
    why: 'Identity events: a change to a user\'s credentials or identity links (a password reset today; a link or unlink later), which carries no Tenant (story 1.4 slice 4, AD-14). A membership change — invitation acceptance included — is a tenant-scoped audited use case and writes audit_log, not here. Insert-only by grant plus appendOnlyGuard (trigger + maintenance hatch).',
    appPrivileges: ['SELECT', 'INSERT'],
    appendOnlyGuard: true,
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
    table: 'project_setting_event',
    class: 'append-only',
    tenantColumn: 'tenant_id',
    why:
      'Project tz / teirei history (story 5.5 / FR-25). Period placement reads the head; ' +
      'editing history would move ledger entries across Reporting Periods.',
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
    table: 'project_default_rate_entry',
    class: 'append-only',
    tenantColumn: 'tenant_id',
    why: 'The Project default Rate is bitemporal like rate_entry (FR-12, story 1.6). A live cache sits on project.default_rate_jpy; history and pins read this table.',
  },
  {
    table: 'work_package',
    class: 'mutable-audited',
    tenantColumn: 'tenant_id',
    why: 'The Current Plan is edited. Deletion is soft (`deleted_at`) so the Baseline still resolves it.',
  },
  {
    table: 'wp_dependency',
    class: 'mutable-audited',
    tenantColumn: 'tenant_id',
    why: 'FS dependency edges with lag (AD-25): a scheduling input, edited through app/schedule\'s fence and audited. Edges are removed explicitly by the writer (2.10/2.14); the FKs never cascade.',
  },
  {
    table: 'wp_status_event',
    class: 'append-only',
    tenantColumn: 'tenant_id',
    why: 'The single home of a WP\'s actual start and actual finish (AD-25). Each row restates the full actual state; the head is the latest seq. A correction is a new row.',
  },
  {
    table: 'pct_override_event',
    class: 'append-only',
    tenantColumn: 'tenant_id',
    why: 'Recorded Percent Complete for Plan-grid edits (story 2.10, AD-25). Append-only; the head feeds schedule_run.inputs. FR-30\'s audited override ceremony is Epic 6.',
  },
  {
    table: 'custom_field_definition',
    class: 'mutable-audited',
    tenantColumn: 'tenant_id',
    why: 'Custom Field schema per Project (FR-8). Edited through the fence; NFR-P1 tested bound is 100 definitions.',
  },
  {
    table: 'custom_field_value',
    class: 'mutable-audited',
    tenantColumn: 'tenant_id',
    why: 'Custom Field values on Work Packages (FR-8). Plan inputs, not scheduling inputs; still written only through the fence.',
  },
  {
    table: 'calendar_day_event',
    class: 'append-only',
    tenantColumn: 'tenant_id',
    why: 'Project-specific non-working days (FR-14, story 2.12). Append-only; the head per day feeds publishCalendarVersion. A remove is a tombstone row.',
  },
  {
    table: 'holiday_calendar_version',
    class: 'append-only',
    tenantColumn: 'tenant_id',
    why: 'A resolved non-working-day set over a range (AD-29). A Baseline re-derives against the version it pinned, so a version is never edited.',
  },
  {
    table: 'schedule_run',
    class: 'append-only',
    tenantColumn: 'tenant_id',
    why: 'One recalculation: fully resolved inputs, outputs, cause and engine version (AD-26). Baselines and Published Snapshots pin it by reference.',
  },
  {
    table: 'wp_schedule',
    class: 'derived',
    tenantColumn: 'tenant_id',
    why: 'The tree grid\'s projection of the latest schedule_run (AD-26), rebuilt from it by app/schedule and never pinned by anything.',
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
    table: 'connector_scope_event',
    class: 'append-only',
    tenantColumn: 'tenant_id',
    why:
      'Connector scope history (story 5.2 / AR-19). Snapshots record the scope_seq they read under; ' +
      'editing history would rewrite which scope a figure came from.',
  },
  {
    table: 'tracker_snapshot_attempt',
    class: 'append-only',
    tenantColumn: 'tenant_id',
    why:
      'Failed snapshot attempts (story 5.2 / AR-16). Approval refuse and credential auth failures; ' +
      'a correction is a later successful snapshot, never an edit of a failed attempt.',
  },
  {
    table: 'ticket',
    class: 'derived',
    tenantColumn: 'tenant_id',
    why:
      'AD-6 Ticket identity (story 5.1). UNIQUE (tenant_id, tracker_kind, tracker_site, tracker_issue_id); ' +
      'rebuilt from snapshot observations by the ingest writer.',
  },
  {
    table: 'tracker_account',
    class: 'mutable-audited',
    tenantColumn: 'tenant_id',
    why:
      'AD-6 Tracker Account identity (story 5.1). Upserted only from TrackerAccountObservation; ' +
      'display name and email are personal data (NFR-S6).',
  },
  {
    table: 'fixture_cursor',
    class: 'operational',
    tenantColumn: 'tenant_id',
    why:
      'AD-6 / AD-17 fixture-replay page cursor (story 5.1). Operational bookkeeping behind FixtureCursorPort; ' +
      'tenant-owned so withTenant isolates Connectors.',
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
  },
  {
    table: 'mapping_rule',
    class: 'mutable-audited',
    tenantColumn: 'tenant_id',
    why: 'Rules are edited and re-prioritised. The events they produced are append-only.',
  },
  {
    table: 'mapping_event',
    class: 'append-only',
    tenantColumn: 'tenant_id',
    why: 'Mapping is an event log; the current Mapping is its head. Editing history would move hours retroactively.',
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
  // today, the tenant-provisioning use case in story 1.3). The Better Auth tables and the
  // membership bridge are the stated exceptions, per entry (`appPrivileges`).
  'global': ['SELECT'],
  'operational': ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
} as const;

/**
 * The privileges the `maintenance` role holds *by class*. The append-only hatch grant is
 * also applied to any entry with `appendOnlyGuard` — read through `maintenancePrivilegesOf`,
 * never this map alone — and only with `app.maintenance = 'on'` set, which the trigger checks.
 * On every other class (and every entry without the guard) it holds nothing.
 */
export const MAINTENANCE_PRIVILEGES: Readonly<Record<TableClass, readonly string[]>> = {
  'append-only': ['SELECT', 'UPDATE', 'DELETE'],
  'mutable-audited': [],
  'derived': [],
  'global': [],
  'operational': [],
} as const;

/** The maintenance grant every guarded table receives — the append-only class's grant. */
export const APPEND_ONLY_MAINTENANCE_PRIVILEGES: readonly string[] =
  MAINTENANCE_PRIVILEGES['append-only'];

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

/** The tables whose class is `append-only` (tenant-owned insert-only product tables). */
export const APPEND_ONLY: readonly TableEntry[] = TABLE_REGISTRY.filter(
  (e) => e.class === 'append-only',
);

/**
 * True when the entry carries the append-only trigger pair and maintenance grant.
 * Every `append-only` class implies it; `identity_event` sets the flag explicitly.
 */
export function appendOnlyGuardOf(entry: TableEntry): boolean {
  return entry.class === 'append-only' || entry.appendOnlyGuard === true;
}

/** Every table that gets the BEFORE UPDATE OR DELETE / TRUNCATE triggers. */
export const APPEND_ONLY_GUARDED: readonly TableEntry[] = TABLE_REGISTRY.filter(appendOnlyGuardOf);

/** What the application role holds on one table: its entry's override, or its class's grant. */
export function appPrivilegesOf(entry: TableEntry): readonly string[] {
  return entry.appPrivileges ?? APP_PRIVILEGES[entry.class];
}

/** What the maintenance role holds on one table: the hatch grant when guarded, else the class. */
export function maintenancePrivilegesOf(entry: TableEntry): readonly string[] {
  return appendOnlyGuardOf(entry)
    ? APPEND_ONLY_MAINTENANCE_PRIVILEGES
    : MAINTENANCE_PRIVILEGES[entry.class];
}

/** The tables that carry `tenant_id` without row-level security. Exactly one: the bridge. */
export const TENANT_BRIDGES: readonly TableEntry[] = TABLE_REGISTRY.filter(
  (e) => e.tenantBridge === true,
);

/** Looks a table up, or `undefined` when it is not registered. */
export function tableEntry(table: string): TableEntry | undefined {
  return TABLE_REGISTRY.find((e) => e.table === table);
}
