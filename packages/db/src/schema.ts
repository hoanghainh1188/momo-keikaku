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
});

export const department = pgTable('department', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
});

export const appUser = pgTable('app_user', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull(), // tenant_admin | pm | client_viewer
});

export const project = pgTable('project', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  departmentId: text('department_id').notNull(),
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
});

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
    plannedMh: bigint('planned_mh', { mode: 'number' }).notNull(),
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
  baselineMh: bigint('baseline_mh', { mode: 'number' }).notNull(),
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
    estimateMh: bigint('estimate_mh', { mode: 'number' }),
    actualMh: bigint('actual_mh', { mode: 'number' }),
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
    deltaMh: bigint('delta_mh', { mode: 'number' }).notNull(),
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
  appUser,
  project,
  resource,
  rateEntry,
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
