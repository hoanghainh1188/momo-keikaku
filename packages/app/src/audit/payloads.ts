/**
 * Audit payload decode schemas (story 1.7) — beside `AUDIT_ACTIONS`, so the writer and the
 * Tenant-Admin reader agree on shape. The write harness imports from here; product code
 * decodes through `decodeAuditPayload`.
 *
 * Payloads go through the domain codec (AD-4) on write; decode reverses that. Unknown or
 * non-enum rows (e.g. seed `demo.seed`) best-effort decode, else surface the raw value.
 */
import { z } from 'zod';
import { decode } from '@momo/domain';

const placement = z.object({ departmentId: z.string(), programId: z.string().nullable() }).strict();

/** A Mapping Rule as its audit records carry it (story 5.10). */
const mappingRule = z
  .object({
    name: z.string(),
    priority: z.number().int(),
    wpId: z.string(),
    matchField: z.string(),
    matchValue: z.string(),
  })
  .strict();

const ruleCreatePayload = z
  .object({ projectId: z.string(), rule: mappingRule, moved: z.number().int() })
  .strict();
const ruleUpdatePayload = z
  .object({ projectId: z.string(), before: mappingRule, after: mappingRule, moved: z.number().int() })
  .strict();
const ruleDeletePayload = z
  .object({ projectId: z.string(), before: mappingRule, moved: z.number().int() })
  .strict();
const ruleReorderPayload = z
  .object({
    projectId: z.string(),
    before: z.array(z.string()),
    after: z.array(z.string()),
    moved: z.number().int(),
  })
  .strict();

/** Every shape a committed `audit_log.payload` may take today. */
export const auditPayloadSchema = z.union([
  z.object({ ticketIds: z.array(z.string()), wpId: z.string().nullable(), note: z.string().nullable() }).strict(),
  z.object({ wpId: z.string() }).strict(),
  // Mapping Rule writes (story 5.10).
  ruleCreatePayload,
  ruleUpdatePayload,
  ruleDeletePayload,
  ruleReorderPayload,
  z
    .object({
      snapshots: z.number().int(),
      ledgerEntries: z.number().int(),
      mappingEvents: z.number().int(),
      anchor: z.string(),
    })
    .strict(),
  // Organisation writes (story 1.3 slice 2).
  z.object({ name: z.string() }).strict(),
  z.object({ departmentId: z.string(), name: z.string() }).strict(),
  z
    .object({
      name: z.string(),
      departmentId: z.string(),
      programId: z.string().nullable(),
      clientName: z.string(),
      contractType: z.string(),
      tzOffsetMinutes: z.number().int(),
      teireiWeekday: z.number().int(),
      defaultRateJpy: z.number().int(),
      eacMethod: z.string(),
      calendarJp: z.boolean(),
      calendarVn: z.boolean(),
      demoAnchor: z.string(),
    })
    .strict(),
  z.object({ before: z.string().nullable(), after: z.string().nullable() }).strict(),
  z.object({ before: placement, after: placement }).strict(),
  // Membership writes (story 1.4 slice 2).
  z.object({ before: z.object({ role: z.string(), projectIds: z.array(z.string()) }).strict() }).strict(),
  z.object({ before: z.array(z.string()), after: z.array(z.string()) }).strict(),
  // Resource / Rate writes (story 1.6).
  z.object({ departmentId: z.string(), name: z.string(), role: z.string() }).strict(),
  z.object({ effectiveFrom: z.string(), yenPerHour: z.number().int() }).strict(),
  // Scheduling fence (story 2.9).
  z
    .object({
      kind: z.string(),
      runSeq: z.number().int(),
      haltedReason: z.string().nullable(),
    })
    .strict(),
  // Holiday Calendar publish (story 2.12).
  z
    .object({
      calendarVersionSeq: z.number().int(),
      runSeq: z.number().int().nullable(),
      kind: z.string(),
      haltedReason: z.string().nullable(),
      reason: z.string().nullable().optional(),
      calendarJp: z.boolean().optional(),
      calendarVn: z.boolean().optional(),
      day: z.string().optional(),
      effect: z.enum(['add', 'remove']).optional(),
    })
    .strict(),
  // First Set Baseline (story 4.1).
  z
    .object({
      baselineVersionSeq: z.number().int(),
      baselineVersionId: z.string(),
      scheduleRunSeq: z.number().int(),
      leafCount: z.number().int(),
      reason: z.string(),
    })
    .strict(),
  // Connector writes (story 5.2) — never secrets.
  z
    .object({
      projectId: z.string(),
      site: z.string(),
      scope: z.string(),
      approvalName: z.string(),
      scopeSeq: z.number().int(),
      settingSeq: z.number().int().optional(),
    })
    .strict(),
  z.object({ projectId: z.string() }).strict(),
  z
    .object({
      projectId: z.string(),
      before: z.string(),
      after: z.string(),
    })
    .strict(),
  // Story 5.6 ownership confirm.
  z
    .object({
      projectId: z.string(),
      trackerIssueId: z.string(),
      resolution: z.enum(['keep', 'transfer']),
      toConnectorId: z.string(),
    })
    .strict(),
  // Story 5.7 Resolved-status append (tests/API).
  z
    .object({
      projectId: z.string().min(1),
      resolvedStatusIds: z.array(z.string().min(1)).min(1),
    })
    .strict(),
]);

/**
 * Optional per-action narrowing. The union above is what decode uses; this map documents
 * which action produced which shape when a later story wants typed `record` overloads.
 */
export const AUDIT_PAYLOAD_BY_ACTION = {
  'disposition.map': z
    .object({ ticketIds: z.array(z.string()), wpId: z.string().nullable(), note: z.string().nullable() })
    .strict(),
  'disposition.plan': z
    .object({ ticketIds: z.array(z.string()), wpId: z.string().nullable(), note: z.string().nullable() })
    .strict(),
  'disposition.explain': z
    .object({ ticketIds: z.array(z.string()), wpId: z.string().nullable(), note: z.string().nullable() })
    .strict(),
  'disposition.cr_candidate': z
    .object({ ticketIds: z.array(z.string()), wpId: z.string().nullable(), note: z.string().nullable() })
    .strict(),
  'mapping.map': z.object({ wpId: z.string() }).strict(),
  'mapping.unmap': z.object({ wpId: z.string() }).strict(),
  'mapping.rule_create': ruleCreatePayload,
  'mapping.rule_update': ruleUpdatePayload,
  'mapping.rule_delete': ruleDeletePayload,
  'mapping.rule_reorder': ruleReorderPayload,
  'department.create': z.object({ name: z.string() }).strict(),
  'department.rename': z.object({ before: z.string().nullable(), after: z.string().nullable() }).strict(),
  'program.create': z.object({ departmentId: z.string(), name: z.string() }).strict(),
  'program.rename': z.object({ before: z.string().nullable(), after: z.string().nullable() }).strict(),
  'project.create': z
    .object({
      name: z.string(),
      departmentId: z.string(),
      programId: z.string().nullable(),
      clientName: z.string(),
      contractType: z.string(),
      tzOffsetMinutes: z.number().int(),
      teireiWeekday: z.number().int(),
      defaultRateJpy: z.number().int(),
      eacMethod: z.string(),
      calendarJp: z.boolean(),
      calendarVn: z.boolean(),
      demoAnchor: z.string(),
    })
    .strict(),
  'project.rename': z.object({ before: z.string().nullable(), after: z.string().nullable() }).strict(),
  'project.reassign_program': z.object({ before: z.string().nullable(), after: z.string().nullable() }).strict(),
  'project.reassign_department': z.object({ before: placement, after: placement }).strict(),
  'membership.revoke': z
    .object({ before: z.object({ role: z.string(), projectIds: z.array(z.string()) }).strict() })
    .strict(),
  'membership.change_role': z.object({ before: z.string().nullable(), after: z.string().nullable() }).strict(),
  'membership.assign_project': z.object({ before: z.array(z.string()), after: z.array(z.string()) }).strict(),
  'membership.unassign_project': z.object({ before: z.array(z.string()), after: z.array(z.string()) }).strict(),
  'resource.create': z.object({ departmentId: z.string(), name: z.string(), role: z.string() }).strict(),
  'rate.append': z.object({ effectiveFrom: z.string(), yenPerHour: z.number().int() }).strict(),
  'project_default_rate.append': z.object({ effectiveFrom: z.string(), yenPerHour: z.number().int() }).strict(),
  'tracker_account.link': z
    .object({ resourceId: z.string(), accountId: z.string() })
    .strict(),
  'tracker_account.unlink': z.object({ accountId: z.string() }).strict(),
  'schedule.apply_plan_change': z
    .object({
      kind: z.string(),
      runSeq: z.number().int().nullable(),
      haltedReason: z.string().nullable(),
      warnings: z.array(z.string()).optional(),
      before: z
        .object({
          projectStart: z.string().nullable(),
          projectFinish: z.string().nullable(),
          dataDate: z.string().nullable(),
        })
        .strict()
        .optional(),
      after: z
        .object({
          projectStart: z.string().nullable(),
          projectFinish: z.string().nullable(),
          dataDate: z.string().nullable(),
        })
        .strict()
        .optional(),
      // Story 6.4 — Recorded % Accept / Plan-grid audit fields.
      wpId: z.string().optional(),
      recordedPctNum: z.string().optional(),
      recordedPctDen: z.string().optional(),
      reason: z.string().nullable().optional(),
      source: z.enum(['pm_override', 'plan_edit']).optional(),
    })
    .strict(),
  'calendar.publish_version': z
    .object({
      calendarVersionSeq: z.number().int(),
      runSeq: z.number().int().nullable(),
      kind: z.string(),
      haltedReason: z.string().nullable(),
      reason: z.string().nullable().optional(),
      calendarJp: z.boolean().optional(),
      calendarVn: z.boolean().optional(),
      day: z.string().optional(),
      effect: z.enum(['add', 'remove']).optional(),
    })
    .strict(),
  'baseline.set': z
    .object({
      baselineVersionSeq: z.number().int(),
      baselineVersionId: z.string(),
      scheduleRunSeq: z.number().int(),
      leafCount: z.number().int(),
      reason: z.string(),
    })
    .strict(),
  'baseline.rebaseline': z
    .object({
      baselineVersionSeq: z.number().int(),
      baselineVersionId: z.string(),
      scheduleRunSeq: z.number().int(),
      leafCount: z.number().int(),
      reason: z.string(),
    })
    .strict(),
  'connector.add': z
    .object({
      projectId: z.string(),
      site: z.string(),
      scope: z.string(),
      approvalName: z.string(),
      scopeSeq: z.number().int(),
      settingSeq: z.number().int().optional(),
    })
    .strict(),
  'connector.rotate_credentials': z.object({ projectId: z.string() }).strict(),
  'connector.change_scope': z
    .object({
      projectId: z.string(),
      before: z.string(),
      after: z.string(),
    })
    .strict(),
  'connector.confirm_ownership': z
    .object({
      projectId: z.string(),
      trackerIssueId: z.string(),
      resolution: z.enum(['keep', 'transfer']),
      toConnectorId: z.string(),
    })
    .strict(),
  'connector.append_resolved_statuses': z
    .object({
      projectId: z.string().min(1),
      resolvedStatusIds: z.array(z.string().min(1)).min(1),
    })
    .strict(),
} as const;

/**
 * Decodes an `audit_log.payload` through the codec + union schema. On failure (seed / unknown
 * shape), returns the raw value so the row still renders.
 */
export function decodeAuditPayload(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  try {
    return decode(raw, auditPayloadSchema);
  } catch {
    return raw;
  }
}
