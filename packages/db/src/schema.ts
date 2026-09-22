import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * AD-3: every tenant-owned table carries tenant_id.
 * DEMO DEVIATION: Row Level Security, composite FKs and the non-owner application
 * role are NOT set up here (out of scope for the single-user local demo, per the
 * build brief). tenant_id is present so RLS can be switched on later without a
 * data migration.
 *
 * AD-5 append-only tables carry a monotonic `seq`. The demo does not install the
 * BEFORE UPDATE/DELETE triggers or revoke UPDATE/DELETE grants.
 * TODO(review-adversarial H1): watermarks must be allocated under a per-project
 * advisory lock before this is anything but a single-user demo.
 */

export const tenant = pgTable('tenant', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** Fixed to JPY once any Rate exists for this Tenant (story 1.9, FR-4 / AD-4). */
  currency: text('currency').notNull().default('JPY'),
});

export const department = pgTable('department', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
});

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
  (t) => ({ byDepartment: index('program_department_idx').on(t.departmentId) }),
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
 * No foreign keys, per the demo deviation above; Better Auth deletes a user's sessions and
 * accounts itself, and nothing in this slice deletes a user.
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
 * no grant to correct or remove a row with. `userId` names an `auth_user` row with no foreign key,
 * per this schema's demo deviation (see the module note); Better Auth deletes no user today, so
 * there is nothing yet that would orphan the reference.
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
     * Optional (story 1.3 slice 2): a Program of THIS Project's owning Department, or none. The
     * rule is the use cases' (`packages/app`'s org writes check it inside the transaction); there
     * is no foreign key, per the demo deviation above. Moving a Project between Programs changes
     * this column and nothing else.
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
  },
  (t) => ({ byProgram: index('project_program_idx').on(t.programId) }),
);

export const resource = pgTable('resource', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  departmentId: text('department_id').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  /** FR-13: linked Tracker Accounts. Unlinked accounts produce Unattributed hours. */
  trackerAccountIds: text('tracker_account_ids').array().notNull(),
});

export const rateEntry = pgTable('rate_entry', {
  seq: bigint('seq', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  tenantId: text('tenant_id').notNull(),
  resourceId: text('resource_id').notNull(),
  effectiveFrom: date('effective_from').notNull(),
  yenPerHour: integer('yen_per_hour').notNull(),
});

/**
 * FR-12's Project default Rate, bitemporal like `rate_entry` (story 1.6). The live head is also
 * cached on `project.default_rate_jpy`; history and pinned lookups read this table.
 */
export const projectDefaultRateEntry = pgTable('project_default_rate_entry', {
  seq: bigint('seq', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  tenantId: text('tenant_id').notNull(),
  projectId: text('project_id').notNull(),
  effectiveFrom: date('effective_from').notNull(),
  yenPerHour: integer('yen_per_hour').notNull(),
});

export const workPackage = pgTable(
  'work_package',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    wbsCode: text('wbs_code').notNull(),
    name: text('name').notNull(),
    parentId: text('parent_id'),
    isLeaf: boolean('is_leaf').notNull(),
    isMilestone: boolean('is_milestone').notNull(),
    isCatchAll: boolean('is_catch_all').notNull(),
    start: date('start'),
    finish: date('finish'),
    plannedMh: bigint('planned_mh', { mode: 'bigint' }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    milestoneDoneAt: date('milestone_done_at'),
    assignedResourceIds: text('assigned_resource_ids').array().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({ byProject: index('wp_project_idx').on(t.projectId) }),
);

export const baselineVersion = pgTable('baseline_version', {
  seq: bigint('seq', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  id: text('id').notNull(),
  tenantId: text('tenant_id').notNull(),
  projectId: text('project_id').notNull(),
  reason: text('reason').notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  actor: text('actor').notNull(),
});

export const baselineWp = pgTable('baseline_wp', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  baselineVersionSeq: bigint('baseline_version_seq', { mode: 'number' }).notNull(),
  wpId: text('wp_id').notNull(),
  start: date('start').notNull(),
  finish: date('finish').notNull(),
  baselineMh: bigint('baseline_mh', { mode: 'bigint' }).notNull(),
  isMilestone: boolean('is_milestone').notNull(),
});

export const connector = pgTable('connector', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  projectId: text('project_id').notNull(),
  adapter: text('adapter').notNull(), // backlog | fixture | jira
  scope: text('scope').notNull(),
  spaceLabel: text('space_label').notNull(),
});

export const trackerSnapshot = pgTable('tracker_snapshot', {
  seq: bigint('seq', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  id: text('id').notNull(),
  tenantId: text('tenant_id').notNull(),
  connectorId: text('connector_id').notNull(),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
  measurementBasis: text('measurement_basis').notNull(),
  ticketCount: integer('ticket_count').notNull(),
});

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
  (t) => ({ bySnapshot: index('obs_snapshot_idx').on(t.snapshotId) }),
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
  (t) => ({ byTicket: index('ledger_ticket_idx').on(t.ticketId) }),
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
  (t) => ({ byTicket: index('mapping_ticket_idx').on(t.ticketId) }),
);

export const mappingRule = pgTable('mapping_rule', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  projectId: text('project_id').notNull(),
  priority: integer('priority').notNull(),
  name: text('name').notNull(),
  wpId: text('wp_id').notNull(),
  matchField: text('match_field').notNull(),
  matchValue: text('match_value').notNull(),
});

export const dispositionEvent = pgTable('disposition_event', {
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
});

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
  baselineVersion,
  baselineWp,
  connector,
  trackerSnapshot,
  ticketObservation,
  actualsLedgerEntry,
  mappingEvent,
  mappingRule,
  dispositionEvent,
  auditLog,
};

export const _unusedIndexHelpers = { uniqueIndex };
