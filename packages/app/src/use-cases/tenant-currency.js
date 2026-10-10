import { ADMIN_ONLY } from '../authz/authorize';
import { z } from 'zod';
import { authorize, TENANT_ADMIN_ROLES } from '../authz/authorize';
import { fail, ok } from '../result';
/** Raised when any Rate row exists for the Tenant — currency is then fixed. */
export const TENANT_CURRENCY_LOCKED = 'tenant_currency_locked';
/** Only JPY ships in R0 (FR-4 / AD-4). */
export const TENANT_CURRENCY_JPY = 'JPY';
const inputSchema = z.object({
    currency: z.literal(TENANT_CURRENCY_JPY),
});
export async function changeTenantCurrency(deps, ctx, input) {
    const gate = authorize(ctx, { roles: TENANT_ADMIN_ROLES });
    if (!gate.ok)
        return gate;
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success)
        return fail('invalid_input');
    if (await deps.hasAnyRate(ctx.tenantId)) {
        return fail('invalid_input', { currency: [TENANT_CURRENCY_LOCKED] });
    }
    await deps.setCurrency(ctx.tenantId, parsed.data.currency);
    return ok(undefined);
}
/**
 * Not on NFR-A1's list. R0 accepts only JPY, and refuses once any Rate exists — a probe Tenant
 * already has Rates, so the successful write never changes a reported figure. The refusal writes
 * nothing.
 */
export const TENANT_CURRENCY_AUDIT = {
    changeTenantCurrency: {
        unaudited: 'R0 accepts only JPY and refuses once any Rate exists; that refusal writes nothing, and a probe Tenant already has Rates so the success path never changes a reported figure.',
    },
};
/** Role declaration for this use case (colocated — see `role-declarations.ts`). */
export const TENANT_CURRENCY_ROLES = {
    changeTenantCurrency: ADMIN_ONLY,
};
