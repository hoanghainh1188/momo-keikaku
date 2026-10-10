import { ADMIN_ONLY } from '../authz/authorize';
/**
 * THE AUDIT-LOG READER (story 1.7, NFR-A1): list (and filter) the Tenant's `audit_log` rows.
 *
 * Tenant Admin only; refusal is `not_found` (FR-2). Runs inside `withTenant` through the port.
 * Non-enum actions (seed `demo.seed`) stay visible as opaque strings. Actor display resolves
 * through IdentityPort when the stored actor is `user:<id>`.
 */
import { z } from 'zod';
import { authorize, TENANT_ADMIN_ROLES } from '../authz/authorize';
import { decodeAuditPayload, isAuditAction, } from '../audit';
import { fail, ok } from '../result';
import { invalidInputDetails } from './audited-write';
const instant = z
    .string()
    .min(1)
    .refine((value) => !Number.isNaN(Date.parse(value)), 'must be an ISO-8601 instant or date');
const listAuditLogInputSchema = z
    .object({
    /** When set, must be a member of `AUDIT_ACTIONS` — filters exact action string. */
    action: z.string().min(1).optional(),
    /** Exact match on the stored `actor` string (e.g. `user:<id>`). */
    actor: z.string().min(1).optional(),
    /** Inclusive lower bound on `at`. */
    from: instant.optional(),
    /** Inclusive upper bound on `at`. */
    to: instant.optional(),
})
    .strict()
    .superRefine((value, ctx) => {
    if (value.action !== undefined && !isAuditAction(value.action)) {
        ctx.addIssue({
            code: 'custom',
            path: ['action'],
            message: 'must be a member of AUDIT_ACTIONS',
        });
    }
    if (value.from !== undefined && value.to !== undefined) {
        if (Date.parse(value.from) > Date.parse(value.to)) {
            ctx.addIssue({
                code: 'custom',
                path: ['from'],
                message: 'from must be <= to',
            });
        }
    }
});
const USER_ACTOR = /^user:(.+)$/;
function userIdFromActor(actor) {
    const match = USER_ACTOR.exec(actor);
    return match?.[1] ?? null;
}
/**
 * Lists the caller's Tenant's audit log. Role refusal is before parse. Filters are optional.
 */
export async function listAuditLog(deps, ctx, input = {}) {
    const gate = authorize(ctx, { roles: TENANT_ADMIN_ROLES });
    if (!gate.ok)
        return gate;
    const parsed = listAuditLogInputSchema.safeParse(input);
    if (!parsed.success)
        return fail('invalid_input', invalidInputDetails(parsed.error));
    const { action, actor, from, to } = parsed.data;
    const rows = await deps.auditLogRead.list(deps.handle, ctx.tenantId, {
        action,
        actor,
        from: from !== undefined ? new Date(from) : undefined,
        to: to !== undefined ? new Date(to) : undefined,
    });
    const userIds = [
        ...new Set(rows
            .map((row) => userIdFromActor(row.actor))
            .filter((id) => id !== null)),
    ];
    const identities = new Map((await Promise.all(userIds.map(async (userId) => {
        const user = await deps.lookupUser(userId);
        return user === null ? null : [userId, user];
    }))).filter((entry) => entry !== null));
    return ok({
        rows: rows.map((row) => {
            const userId = userIdFromActor(row.actor);
            const user = userId === null ? null : (identities.get(userId) ?? null);
            return {
                seq: row.seq,
                actor: row.actor,
                actorDisplay: user?.email ?? row.actor,
                action: row.action,
                target: row.target,
                payload: decodeAuditPayload(row.payload),
                at: row.at,
            };
        }),
    });
}
/** Role declaration for this use case (colocated — see `role-declarations.ts`). */
export const AUDIT_LOG_READ_ROLES = {
    listAuditLog: ADMIN_ONLY,
};
