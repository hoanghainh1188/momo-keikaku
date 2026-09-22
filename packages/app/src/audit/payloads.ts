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

/** Every shape a committed `audit_log.payload` may take today. */
export const auditPayloadSchema = z.union([
  z.object({ ticketIds: z.array(z.string()), wpId: z.string().nullable(), note: z.string().nullable() }).strict(),
  z.object({ wpId: z.string() }).strict(),
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
