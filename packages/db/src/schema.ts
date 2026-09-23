import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

/**
 * THE SCHEMA, AS ONE MIGRATION (story 2.1, AD-30). `drizzle-kit generate` renders this file (and
 * `schema-membership.ts`) into `packages/db/drizzle/0000_*.sql`, which `pnpm db:migrate` applies;
 * `drizzle-kit push` is no longer how the schema reaches a database (AD-19).
 *
 * AD-3: every tenant-owned table carries `tenant_id`, and every foreign key between tenant-owned
 * tables is COMPOSITE and includes it, against a `UNIQUE (tenant_id, …)` target declared here. A
 * row can therefore never name a parent that belongs to another Tenant (23503), and — because
 * RI checks bypass row-level security — the check holds whichever role writes. `ON DELETE NO
 * ACTION` everywhere: Plan deletion is soft (`deleted_at`), and history is never cascaded away.
 *
 * WHAT DRIZZLE CANNOT SAY, AND WHERE IT IS SAID INSTEAD. Drizzle 0.45.2's `foreignKey` carries no
 * match type and no deferrability, so the migration file hand-edits two clauses into the FKs this
 * file declares, and `schema-catalog.test.ts` pins both against `pg_constraint` so a regeneration
 * that drops them fails naming the constraint:
 *   * `MATCH FULL` on every composite FK whose columns are all NOT NULL; the FKs with a nullable
 *     member (`FK_MATCH_SIMPLE` below) stay `MATCH SIMPLE`, because `MATCH FULL` would refuse a
 *     row whose nullable member is null while `tenant_id` is set (founder decision 3-A);
 *   * `DEFERRABLE INITIALLY DEFERRED` on `wp_dependency`'s two leaf FKs (AD-25).
 * The third clause AD-30 names, `is_leaf … GENERATED ALWAYS AS (child_count = 0) STORED`, IS
 * emitted by drizzle-kit 0.31.10 from `generatedAlwaysAs` below; it is asserted all the same
 * (`pg_attribute.attgenerated = 's'`), because PostgreSQL 18 defaults a generated column to
 * VIRTUAL and a virtual one cannot sit in a UNIQUE key or be an FK target.
 *
 * AD-5 append-only tables carry a monotonic `seq`. Their triggers, the grants and the row-level
 * security are generated from `table-classes.ts` (`pnpm db:policies`), not declared here.
 * TODO(review-adversarial H1): watermarks must be allocated under a per-project advisory lock
 * before this is anything but a single-user demo (AD-20).
 */

/**
 * The composite FKs whose referencing columns include a NULLABLE member, and which are therefore
 * `MATCH SIMPLE` (decision 3-A). Every other FK in this schema is `MATCH FULL`. The migration's
 * hand edits and `schema-catalog.test.ts` both read this list.
 */
export const FK_MATCH_SIMPLE: readonly string[] = [
  'project_program_fk',
  'work_package_parent_fk',
  'schedule_run_prev_run_fk',
  'actuals_ledger_entry_baseline_version_fk',
  'mapping_event_work_package_fk',
  'mapping_event_mapping_rule_fk',
  'disposition_event_work_package_fk',
];

/** The two FKs that are `DEFERRABLE INITIALLY DEFERRED` (AD-25): `wp_dependency`'s leaf endpoints. */
export const FK_DEFERRABLE: readonly string[] = [
  'wp_dependency_predecessor_fk',
  'wp_dependency_successor_fk',
];

export const tenant = pgTable('tenant', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** Fixed to JPY once any Rate exists for this Tenant (story 1.9, FR-4 / AD-4). */
  currency: text('currency').notNull().default('JPY'),
});

export const department = pgTable(
  'department',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    name: text('name').notNull(),
  },
  (t) => ({ tenantKey: unique('department_tenant_id_key').on(t.tenantId, t.id) }),
);

/**
 * FR-1's middle tier: Tenant › Department › Program › Project (story 1.3 slice 2). A Program
 * belongs to exactly one Department for life — there is no use case that moves it — and a Project
 * may sit in one of its owning Department's Programs, or in none. `mutable-audited`: renamed in
 * place, every change audited by the use case that makes it.
 */
export const program = pgTable(
  'program',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    departmentId: text('department_id').notNull(),
    name: text('name').notNull(),
  },
  (t) => ({
    byDepartment: index('program_department_idx').on(t.departmentId),
    tenantKey: unique('program_tenant_id_key').on(t.tenantId, t.id),
    department: foreignKey({
      name: 'program_department_fk',
      columns: [t.tenantId, t.departmentId],
      foreignColumns: [department.tenantId, department.id],
    }),
  }),
);

/**
 * THE IDENTITY TABLES (story 1.4 slice 1): Better Auth 1.7.5's four core models, bound only
 * through `packages/db/auth` (AD-1 carve-out 1). All four are `global` — a session resolves
 * before any Tenant is known — so they carry no `tenant_id` and no row-level security; the
 * application role holds DML on them because Better Auth writes them on its own connection.
 *
 * Better Auth's Drizzle adapter looks a model up as `schema[modelName]` and a field as
 * `table[fieldName]`, so the PROPERTY names below are Better Auth's own camelCase field names
 * (`emailVerified`, `userId`, `expiresAt`, …); only the column strings are snake_case. The user
 * model is renamed to the table `auth_user`, because `user` is a reserved word in Postgres.
 *
 * Two fields are this product's, not Better Auth's, and neither is client-writable (`input:
 * false` in `packages/db/auth`): `auth_user.locale` and `session.active_tenant_id`. The active
 * Tenant is written by `IdentityPort.setActiveTenant` from `resolveRequestContext`, which is also
 * the one place it is validated against `tenant_membership` — on every request.
 *
 * No foreign keys: these are `global` tables, outside AD-3's tenant-owned FK set (story 2.1).
 * Better Auth deletes a user's sessions and accounts itself, and nothing deletes a user yet.
 */
export const authUser = pgTable('auth_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  /** The UI language (FR-44). `en` until story 1.9 ships the Japanese catalog. */
  locale: text('locale').notNull().default('en'),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id').notNull(),
    /**
     * The Tenant this session acts in, or null until `resolveRequestContext` picks the user's one
     * membership. Deliberately NOT named `tenant_id`: the session is not tenant-owned, and the
     * value is only trusted after the resolver has matched it against `tenant_membership`.
     */
    activeTenantId: text('active_tenant_id'),
  },
  (t) => ({ byUser: index('session_user_idx').on(t.userId) }),
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    /** The credential provider's scrypt hash. Never returned by Better Auth. */
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => ({ byUser: index('account_user_idx').on(t.userId) }),
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => ({ byIdentifier: index('verification_identifier_idx').on(t.identifier) }),
);

/**
 * The four Better Auth models, keyed by MODEL name — the object `packages/db/auth` hands the
 * Drizzle adapter, which looks each model up as `schema[modelName]` (so the user model is keyed
 * `auth_user`). The tenant-membership bridge is not here and not in this module at all: see
 * `schema-membership.ts`.
 */
export const authSchema = {
  auth_user: authUser,
  session,
  account,
  verification,
};

/**
 * IDENTITY EVENTS (story 1.4 slice 4): the sink for identity events that happen before any Tenant
 * exists — `audit_log` cannot record them, because it needs a Tenant and these resolve none. A
 * password reset is the first; a later link, unlink or invitation acceptance records here too,
 * never in `audit_log` or `operator_audit` (the AD-1 adversarial review's F3).
 *
 * `global`, like the four Better Auth tables above, and — unlike them — insert-only: the
 * application role holds `SELECT, INSERT` on it and nothing else (`table-classes.ts`), so there is
 * no grant to correct or remove a row with. `userId` names an `auth_user` row with no foreign key:
 * the `global` identity tables sit outside AD-3's tenant-owned FK set (story 2.1). Better Auth
 * deletes no user today, so there is nothing yet that would orphan the reference.
 */
export const identityEvent = pgTable(
  'identity_event',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    action: text('action').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull(),
    payload: jsonb('payload'),
  },
  (t) => ({ byUser: index('identity_event_user_idx').on(t.userId) }),
);


export const project = pgTable(
  'project',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    departmentId: text('department_id').notNull(),
    /**
     * Optional (story 1.3 slice 2): a Program of THIS Project's owning Department, or none. That
     * the Program belongs to the Project's own Department is the use cases' rule (`packages/app`'s
     * org writes check it inside the transaction); that it belongs to the same Tenant is the
     * `project_program_fk` below — `MATCH SIMPLE`, because the column is nullable (decision 3-A).
     */
    programId: text('program_id'),
    name: text('name').notNull(),
    clientName: text('client_name').notNull(),
    contractType: text('contract_type').notNull(),
    tzOffsetMinutes: integer('tz_offset_minutes').notNull(),
    teireiWeekday: integer('teirei_weekday').notNull(),
    defaultRateJpy: integer('default_rate_jpy').notNull(),
    eacMethod: text('eac_method').notNull(),
    calendarJp: boolean('calendar_jp').notNull(),
    calendarVn: boolean('calendar_vn').notNull(),
    /**
     * AD-15 + review G-5: the demo runs on a fixed clock so fixture freshness and the
     * "current" Reporting Period behave as they did when the fixtures were recorded.
     */
    demoAnchor: timestamp('demo_anchor', { withTimezone: true }).notNull(),
    /**
     * AD-25's three Project schedule settings (FR-43). All nullable: a Project is created with
     * none, and is not scheduled until it has a Project start. The Data Date is never advanced
     * automatically. Scheduling inputs, so written only through `app/schedule`'s fence.
     */
    projectStart: date('project_start'),
    projectFinish: date('project_finish'),
    dataDate: date('data_date'),
  },
  (t) => ({
    byProgram: index('project_program_idx').on(t.programId),
    tenantKey: unique('project_tenant_id_key').on(t.tenantId, t.id),
    department: foreignKey({
      name: 'project_department_fk',
      columns: [t.tenantId, t.departmentId],
      foreignColumns: [department.tenantId, department.id],
    }),
    program: foreignKey({
      name: 'project_program_fk',
      columns: [t.tenantId, t.programId],
      foreignColumns: [program.tenantId, program.id],
    }),
  }),
);

export const resource = pgTable(
  'resource',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    departmentId: text('department_id').notNull(),
    name: text('name').notNull(),
    role: text('role').notNull(),
    /** FR-13: linked Tracker Accounts. Unlinked accounts produce Unattributed hours. */
    trackerAccountIds: text('tracker_account_ids').array().notNull(),
  },
  (t) => ({
    tenantKey: unique('resource_tenant_id_key').on(t.tenantId, t.id),
    department: foreignKey({
      name: 'resource_department_fk',
      columns: [t.tenantId, t.departmentId],
      foreignColumns: [department.tenantId, department.id],
    }),
  }),
);

export const rateEntry = pgTable(
  'rate_entry',
  {
    seq: bigint('seq', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    tenantId: text('tenant_id').notNull(),
    resourceId: text('resource_id').notNull(),
    effectiveFrom: date('effective_from').notNull(),
    yenPerHour: integer('yen_per_hour').notNull(),
  },
  (t) => ({
    resource: foreignKey({
      name: 'rate_entry_resource_fk',
      columns: [t.tenantId, t.resourceId],
      foreignColumns: [resource.tenantId, resource.id],
    }),
  }),
);

/**
 * FR-12's Project default Rate, bitemporal like `rate_entry` (story 1.6). The live head is also
 * cached on `project.default_rate_jpy`; history and pinned lookups read this table.
 */
export const projectDefaultRateEntry = pgTable(
  'project_default_rate_entry',
  {
    seq: bigint('seq', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    effectiveFrom: date('effective_from').notNull(),
    yenPerHour: integer('yen_per_hour').notNull(),
  },
  (t) => ({
    project: foreignKey({
      name: 'project_default_rate_entry_project_fk',
      columns: [t.tenantId, t.projectId],
      foreignColumns: [project.tenantId, project.id],
    }),
  }),
);

/**
 * The Current Plan's Work Packages (AD-25). It carries the scheduling INPUTS only: there is no
 * `start`, `finish`, `completed_at` or `milestone_done_at` column (AD-30 dropped them). Derived
 * dates live in `wp_schedule` / `schedule_run.outputs`; actual start and finish live in
 * `wp_status_event`, their single home.
 *
 * `is_leaf` is generated from `child_count`, which `app/schedule` maintains (through its fence,
 * `applyPlanChange`, the only plan-input writer) in the same transaction as
 * any parentage change — the one app-maintained integer the leaf story rests on (AD-25's honest
 * residual). The leaf-only CHECK is not deferrable, so turning a leaf into a summary must clear
 * its duration and constraint in the same statement that raises `child_count`.
 */
export const workPackage = pgTable(
  'work_package',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    wbsCode: text('wbs_code').notNull(),
    name: text('name').notNull(),
    parentId: text('parent_id'),
    childCount: integer('child_count').notNull().default(0),
    isLeaf: boolean('is_leaf')
      .notNull()
      .generatedAlwaysAs(sql`child_count = 0`),
    isMilestone: boolean('is_milestone').notNull(),
    isCatchAll: boolean('is_catch_all').notNull(),
    /** Working days; a milestone is 0. Null means "not schedulable yet", never 0 or 1. */
    durationDays: integer('duration_days'),
    constraintType: text('constraint_type').notNull().default('asap'),
    constraintDate: date('constraint_date'),
    plannedMh: bigint('planned_mh', { mode: 'bigint' }).notNull(),
    assignedResourceIds: text('assigned_resource_ids').array().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    byProject: index('wp_project_idx').on(t.projectId),
    projectKey: unique('work_package_tenant_project_id_key').on(t.tenantId, t.projectId, t.id),
    leafKey: unique('work_package_leaf_key').on(t.tenantId, t.projectId, t.id, t.isLeaf),
    constraintType: check(
      'work_package_constraint_type_check',
      sql`${t.constraintType} IN ('asap', 'must_start_on', 'must_finish_on')`,
    ),
    // SPINE:518, verbatim.
    leafOnlyInputs: check(
      'work_package_leaf_only_inputs_check',
      sql`is_leaf OR (duration_days IS NULL AND constraint_type = 'asap' AND constraint_date IS NULL)`,
    ),
    project: foreignKey({
      name: 'work_package_project_fk',
      columns: [t.tenantId, t.projectId],
      foreignColumns: [project.tenantId, project.id],
    }),
    parent: foreignKey({
      name: 'work_package_parent_fk',
      columns: [t.tenantId, t.projectId, t.parentId],
      foreignColumns: [t.tenantId, t.projectId, t.id],
    }),
  }),
);

/**
 * FS dependencies with lag (AD-25, FR-6a). `type` carries the four MS-Project types, and a CHECK
 * admits `FS` only in R0, so widening is one line of migration. Both endpoints are leaves of the
 * same Project, declaratively: `pred_is_leaf`/`succ_is_leaf` are pinned to `true` and the FKs point
 * into `work_package`'s `(tenant_id, project_id, id, is_leaf)` key, `DEFERRABLE INITIALLY
 * DEFERRED` (hand-written in the migration) so a restructure is judged at COMMIT. Edges are removed
 * explicitly by the writer (2.10/2.14); the FKs never cascade.
 */
export const wpDependency = pgTable(
  'wp_dependency',
  {
    seq: bigint('seq', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    predecessorWpId: text('predecessor_wp_id').notNull(),
    successorWpId: text('successor_wp_id').notNull(),
    type: text('type').notNull().default('FS'),
    lagDays: integer('lag_days').notNull().default(0),
    predIsLeaf: boolean('pred_is_leaf').notNull().default(true),
    succIsLeaf: boolean('succ_is_leaf').notNull().default(true),
  },
  (t) => ({
    edgeKey: unique('wp_dependency_edge_key').on(
      t.tenantId,
      t.projectId,
      t.predecessorWpId,
      t.successorWpId,
    ),
    // Indexes the referencing side of the leaf FKs, so a `child_count` change on a Work Package
    // does not scan the table. The predecessor side is covered by `wp_dependency_edge_key`.
    bySuccessor: index('wp_dependency_successor_idx').on(
      t.tenantId,
      t.projectId,
      t.successorWpId,
      t.succIsLeaf,
    ),
    fsOnly: check('wp_dependency_type_check', sql`${t.type} = 'FS'`),
    predLeaf: check('wp_dependency_pred_is_leaf_check', sql`${t.predIsLeaf} = true`),
    succLeaf: check('wp_dependency_succ_is_leaf_check', sql`${t.succIsLeaf} = true`),
    predecessor: foreignKey({
      name: 'wp_dependency_predecessor_fk',
      columns: [t.tenantId, t.projectId, t.predecessorWpId, t.predIsLeaf],
      foreignColumns: [workPackage.tenantId, workPackage.projectId, workPackage.id, workPackage.isLeaf],
    }),
    successor: foreignKey({
      name: 'wp_dependency_successor_fk',
      columns: [t.tenantId, t.projectId, t.successorWpId, t.succIsLeaf],
      foreignColumns: [workPackage.tenantId, workPackage.projectId, workPackage.id, workPackage.isLeaf],
    }),
  }),
);

/**
 * The single home of a WP's actual start and actual finish (AD-25, AD-21). Each row restates the
 * WP's FULL actual state — both dates, either of which may be null — so the head (max `seq` per
 * WP, at or below a watermark) is the state; there is no separate "done date". `source` says where
 * an actual date came from (NFR-A1).
 */
export const wpStatusEvent = pgTable(
  'wp_status_event',
  {
    seq: bigint('seq', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    wpId: text('wp_id').notNull(),
    actualStart: date('actual_start'),
    actualFinish: date('actual_finish'),
    source: text('source').notNull(),
    actor: text('actor').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    byWp: index('wp_status_event_wp_idx').on(t.tenantId, t.projectId, t.wpId, t.seq),
    workPackage: foreignKey({
      name: 'wp_status_event_work_package_fk',
      columns: [t.tenantId, t.projectId, t.wpId],
      foreignColumns: [workPackage.tenantId, workPackage.projectId, workPackage.id],
    }),
  }),
);

/**
 * A Holiday Calendar version (AD-29): the FULLY RESOLVED non-working-day set over
 * `[range_start, range_end]`, national tables and Project days already merged. Never edited.
 */
export const holidayCalendarVersion = pgTable(
  'holiday_calendar_version',
  {
    seq: bigint('seq', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    nonWorkingDays: date('non_working_days').array().notNull(),
    rangeStart: date('range_start').notNull(),
    rangeEnd: date('range_end').notNull(),
    nationalSets: text('national_sets').array().notNull(),
    nationalDatasetVersion: text('national_dataset_version').notNull(),
    reason: text('reason'),
    actor: text('actor').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    projectKey: unique('holiday_calendar_version_project_seq_key').on(t.tenantId, t.projectId, t.seq),
    range: check('holiday_calendar_version_range_check', sql`${t.rangeStart} <= ${t.rangeEnd}`),
    project: foreignKey({
      name: 'holiday_calendar_version_project_fk',
      columns: [t.tenantId, t.projectId],
      foreignColumns: [project.tenantId, project.id],
    }),
  }),
);

/**
 * One recalculation (AD-26): the fully resolved `inputs`, the `outputs` (absent on a halted run,
 * and droppable once the run is neither pinned nor latest), the cause and the engine version.
 * Appended only by `app/schedule` inside the fence's transaction.
 */
export const scheduleRun = pgTable(
  'schedule_run',
  {
    seq: bigint('seq', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    prevRunSeq: bigint('prev_run_seq', { mode: 'number' }),
    holidayCalendarVersionSeq: bigint('holiday_calendar_version_seq', { mode: 'number' }).notNull(),
    cause: text('cause').notNull(),
    actor: text('actor').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull(),
    inputs: jsonb('inputs').notNull(),
    outputs: jsonb('outputs'),
    engineVersion: text('engine_version').notNull(),
    anchor: date('anchor'),
    computedFinish: date('computed_finish'),
    haltedReason: text('halted_reason'),
  },
  (t) => ({
    projectKey: unique('schedule_run_project_seq_key').on(t.tenantId, t.projectId, t.seq),
    project: foreignKey({
      name: 'schedule_run_project_fk',
      columns: [t.tenantId, t.projectId],
      foreignColumns: [project.tenantId, project.id],
    }),
    calendar: foreignKey({
      name: 'schedule_run_calendar_fk',
      columns: [t.tenantId, t.projectId, t.holidayCalendarVersionSeq],
      foreignColumns: [
        holidayCalendarVersion.tenantId,
        holidayCalendarVersion.projectId,
        holidayCalendarVersion.seq,
      ],
    }),
    prevRun: foreignKey({
      name: 'schedule_run_prev_run_fk',
      columns: [t.tenantId, t.projectId, t.prevRunSeq],
      foreignColumns: [t.tenantId, t.projectId, t.seq],
    }),
  }),
);

/**
 * The `derived` projection of a Project's latest run for the tree grid (AD-26), rebuilt from it
 * and never the referent of anything pinned. `stale` is set by the calendar-range halt path and
 * cleared by the next successful run. Written only by `app/schedule`.
 */
export const wpSchedule = pgTable(
  'wp_schedule',
  {
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    wpId: text('wp_id').notNull(),
    scheduleRunSeq: bigint('schedule_run_seq', { mode: 'number' }).notNull(),
    earlyStart: date('early_start'),
    earlyFinish: date('early_finish'),
    lateStart: date('late_start'),
    lateFinish: date('late_finish'),
    floatDays: integer('float_days'),
    isCritical: boolean('is_critical').notNull().default(false),
    state: text('state'),
    notSchedulableReason: text('not_schedulable_reason'),
    stale: boolean('stale').notNull().default(false),
  },
  (t) => ({
    pk: primaryKey({ name: 'wp_schedule_pkey', columns: [t.tenantId, t.projectId, t.wpId] }),
    state: check(
      'wp_schedule_state_check',
      sql`${t.state} IS NULL OR ${t.state} IN ('complete', 'in_progress', 'remaining')`,
    ),
    workPackage: foreignKey({
      name: 'wp_schedule_work_package_fk',
      columns: [t.tenantId, t.projectId, t.wpId],
      foreignColumns: [workPackage.tenantId, workPackage.projectId, workPackage.id],
    }),
    run: foreignKey({
      name: 'wp_schedule_schedule_run_fk',
      columns: [t.tenantId, t.projectId, t.scheduleRunSeq],
      foreignColumns: [scheduleRun.tenantId, scheduleRun.projectId, scheduleRun.seq],
    }),
  }),
);

/**
 * A Baseline (AD-11, AD-26) pins a `schedule_run` by reference: `schedule_run_seq` is a real FK,
 * so the inputs behind the Baseline's dates have exactly one representation. Baselines written
 * before AD-30 pinned dates with no inputs behind them and were deleted, not migrated.
 */
export const baselineVersion = pgTable(
  'baseline_version',
  {
    seq: bigint('seq', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    id: text('id').notNull(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    scheduleRunSeq: bigint('schedule_run_seq', { mode: 'number' }).notNull(),
    reason: text('reason').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    actor: text('actor').notNull(),
  },
  (t) => ({
    tenantKey: unique('baseline_version_tenant_seq_key').on(t.tenantId, t.seq),
    projectKey: unique('baseline_version_project_seq_key').on(t.tenantId, t.projectId, t.seq),
    project: foreignKey({
      name: 'baseline_version_project_fk',
      columns: [t.tenantId, t.projectId],
      foreignColumns: [project.tenantId, project.id],
    }),
    run: foreignKey({
      name: 'baseline_version_schedule_run_fk',
      columns: [t.tenantId, t.projectId, t.scheduleRunSeq],
      foreignColumns: [scheduleRun.tenantId, scheduleRun.projectId, scheduleRun.seq],
    }),
  }),
);

/**
 * AD-26's cost projection of one leaf WP in a Baseline: the dates, the effort and the two flags
 * PV, BAC and Divergence read. Leaf-only declaratively, through `wp_is_leaf` and the FK into
 * `work_package`'s leaf key (not deferrable: a baselined leaf cannot become a summary).
 */
export const baselineWp = pgTable(
  'baseline_wp',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    baselineVersionSeq: bigint('baseline_version_seq', { mode: 'number' }).notNull(),
    wpId: text('wp_id').notNull(),
    wpIsLeaf: boolean('wp_is_leaf').notNull().default(true),
    start: date('start').notNull(),
    finish: date('finish').notNull(),
    baselineMh: bigint('baseline_mh', { mode: 'bigint' }).notNull(),
    isMilestone: boolean('is_milestone').notNull(),
    isCatchAll: boolean('is_catch_all').notNull(),
  },
  (t) => ({
    wpKey: unique('baseline_wp_version_wp_key').on(t.tenantId, t.baselineVersionSeq, t.wpId),
    // Indexes the referencing side of the FK into `work_package`'s leaf key (see wp_dependency).
    byWorkPackage: index('baseline_wp_work_package_idx').on(
      t.tenantId,
      t.projectId,
      t.wpId,
      t.wpIsLeaf,
    ),
    leaf: check('baseline_wp_wp_is_leaf_check', sql`${t.wpIsLeaf} = true`),
    version: foreignKey({
      name: 'baseline_wp_baseline_version_fk',
      columns: [t.tenantId, t.projectId, t.baselineVersionSeq],
      foreignColumns: [baselineVersion.tenantId, baselineVersion.projectId, baselineVersion.seq],
    }),
    workPackage: foreignKey({
      name: 'baseline_wp_work_package_fk',
      columns: [t.tenantId, t.projectId, t.wpId, t.wpIsLeaf],
      foreignColumns: [workPackage.tenantId, workPackage.projectId, workPackage.id, workPackage.isLeaf],
    }),
  }),
);

export const connector = pgTable(
  'connector',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    adapter: text('adapter').notNull(), // backlog | fixture | jira
    scope: text('scope').notNull(),
    spaceLabel: text('space_label').notNull(),
  },
  (t) => ({
    tenantKey: unique('connector_tenant_id_key').on(t.tenantId, t.id),
    project: foreignKey({
      name: 'connector_project_fk',
      columns: [t.tenantId, t.projectId],
      foreignColumns: [project.tenantId, project.id],
    }),
  }),
);

export const trackerSnapshot = pgTable(
  'tracker_snapshot',
  {
    seq: bigint('seq', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    id: text('id').notNull(),
    tenantId: text('tenant_id').notNull(),
    connectorId: text('connector_id').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    measurementBasis: text('measurement_basis').notNull(),
    ticketCount: integer('ticket_count').notNull(),
  },
  (t) => ({
    tenantKey: unique('tracker_snapshot_tenant_id_key').on(t.tenantId, t.id),
    connector: foreignKey({
      name: 'tracker_snapshot_connector_fk',
      columns: [t.tenantId, t.connectorId],
      foreignColumns: [connector.tenantId, connector.id],
    }),
  }),
);

export const ticketObservation = pgTable(
  'ticket_observation',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    snapshotId: text('snapshot_id').notNull(),
    trackerIssueId: text('tracker_issue_id').notNull(),
    key: text('key').notNull(),
    title: text('title').notNull(),
    statusId: text('status_id').notNull(),
    resolved: boolean('resolved').notNull(),
    estimateMh: bigint('estimate_mh', { mode: 'bigint' }),
    actualMh: bigint('actual_mh', { mode: 'bigint' }),
    assigneeAccountId: text('assignee_account_id'),
    issueTypeId: text('issue_type_id').notNull(),
    categoryIds: text('category_ids').array().notNull(),
    milestoneIds: text('milestone_ids').array().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    bySnapshot: index('obs_snapshot_idx').on(t.snapshotId),
    snapshot: foreignKey({
      name: 'ticket_observation_tracker_snapshot_fk',
      columns: [t.tenantId, t.snapshotId],
      foreignColumns: [trackerSnapshot.tenantId, trackerSnapshot.id],
    }),
  }),
);

export const actualsLedgerEntry = pgTable(
  'actuals_ledger_entry',
  {
    seq: bigint('seq', { mode: 'number' }).primaryKey(),
    id: text('id').notNull(),
    tenantId: text('tenant_id').notNull(),
    connectorId: text('connector_id').notNull(),
    ticketId: text('ticket_id').notNull(),
    kind: text('kind').notNull(), // opening_balance | delta
    deltaMh: bigint('delta_mh', { mode: 'bigint' }).notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }),
    windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
    assigneeAccountId: text('assignee_account_id'),
    activeBaselineVersionSeq: bigint('active_baseline_version_seq', { mode: 'number' }),
    snapshotId: text('snapshot_id').notNull(),
  },
  (t) => ({
    byTicket: index('ledger_ticket_idx').on(t.ticketId),
    connector: foreignKey({
      name: 'actuals_ledger_entry_connector_fk',
      columns: [t.tenantId, t.connectorId],
      foreignColumns: [connector.tenantId, connector.id],
    }),
    snapshot: foreignKey({
      name: 'actuals_ledger_entry_tracker_snapshot_fk',
      columns: [t.tenantId, t.snapshotId],
      foreignColumns: [trackerSnapshot.tenantId, trackerSnapshot.id],
    }),
    baseline: foreignKey({
      name: 'actuals_ledger_entry_baseline_version_fk',
      columns: [t.tenantId, t.activeBaselineVersionSeq],
      foreignColumns: [baselineVersion.tenantId, baselineVersion.seq],
    }),
  }),
);

export const mappingRule = pgTable(
  'mapping_rule',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    priority: integer('priority').notNull(),
    name: text('name').notNull(),
    wpId: text('wp_id').notNull(),
    matchField: text('match_field').notNull(),
    matchValue: text('match_value').notNull(),
  },
  (t) => ({
    projectKey: unique('mapping_rule_tenant_project_id_key').on(t.tenantId, t.projectId, t.id),
    project: foreignKey({
      name: 'mapping_rule_project_fk',
      columns: [t.tenantId, t.projectId],
      foreignColumns: [project.tenantId, project.id],
    }),
    workPackage: foreignKey({
      name: 'mapping_rule_work_package_fk',
      columns: [t.tenantId, t.projectId, t.wpId],
      foreignColumns: [workPackage.tenantId, workPackage.projectId, workPackage.id],
    }),
  }),
);

export const mappingEvent = pgTable(
  'mapping_event',
  {
    seq: bigint('seq', { mode: 'number' }).primaryKey(),
    id: text('id').notNull(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    ticketId: text('ticket_id').notNull(),
    wpId: text('wp_id'),
    source: text('source').notNull(), // manual | rule | disposition
    ruleId: text('rule_id'),
    at: timestamp('at', { withTimezone: true }).notNull(),
    actor: text('actor').notNull(),
  },
  (t) => ({
    byTicket: index('mapping_ticket_idx').on(t.ticketId),
    project: foreignKey({
      name: 'mapping_event_project_fk',
      columns: [t.tenantId, t.projectId],
      foreignColumns: [project.tenantId, project.id],
    }),
    workPackage: foreignKey({
      name: 'mapping_event_work_package_fk',
      columns: [t.tenantId, t.projectId, t.wpId],
      foreignColumns: [workPackage.tenantId, workPackage.projectId, workPackage.id],
    }),
    rule: foreignKey({
      name: 'mapping_event_mapping_rule_fk',
      columns: [t.tenantId, t.projectId, t.ruleId],
      foreignColumns: [mappingRule.tenantId, mappingRule.projectId, mappingRule.id],
    }),
  }),
);

export const dispositionEvent = pgTable(
  'disposition_event',
  {
    seq: bigint('seq', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    id: text('id').notNull(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    kind: text('kind').notNull(), // map | plan | cr_candidate | explain
    ticketIds: text('ticket_ids').array().notNull(),
    wpId: text('wp_id'),
    note: text('note'),
    at: timestamp('at', { withTimezone: true }).notNull(),
    actor: text('actor').notNull(),
  },
  (t) => ({
    project: foreignKey({
      name: 'disposition_event_project_fk',
      columns: [t.tenantId, t.projectId],
      foreignColumns: [project.tenantId, project.id],
    }),
    workPackage: foreignKey({
      name: 'disposition_event_work_package_fk',
      columns: [t.tenantId, t.projectId, t.wpId],
      foreignColumns: [workPackage.tenantId, workPackage.projectId, workPackage.id],
    }),
  }),
);

export const auditLog = pgTable('audit_log', {
  seq: bigint('seq', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  tenantId: text('tenant_id').notNull(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  target: text('target').notNull(),
  payload: jsonb('payload'),
  at: timestamp('at', { withTimezone: true }).notNull(),
});

export const schemaTables = {
  tenant,
  department,
  program,
  authUser,
  session,
  account,
  verification,
  identityEvent,
  project,
  resource,
  rateEntry,
  projectDefaultRateEntry,
  workPackage,
  wpDependency,
  wpStatusEvent,
  holidayCalendarVersion,
  scheduleRun,
  wpSchedule,
  baselineVersion,
  baselineWp,
  connector,
  trackerSnapshot,
  ticketObservation,
  actualsLedgerEntry,
  mappingRule,
  mappingEvent,
  dispositionEvent,
  auditLog,
};
