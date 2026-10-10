import { describe, expect, it, vi } from 'vitest';
import { changeTenantCurrency, TENANT_CURRENCY_JPY, TENANT_CURRENCY_LOCKED } from './tenant-currency';
const ADMIN = {
    tenantId: 'ten-a',
    userId: 'usr-1',
    roles: ['tenant_admin'],
    projectIds: [],
    locale: 'en',
};
describe('changeTenantCurrency', () => {
    it('allows JPY before any Rate exists', async () => {
        const setCurrency = vi.fn(async () => { });
        const result = await changeTenantCurrency({ hasAnyRate: vi.fn(async () => false), setCurrency }, ADMIN, { currency: TENANT_CURRENCY_JPY });
        expect(result).toEqual({ ok: true, value: undefined });
        expect(setCurrency).toHaveBeenCalledWith('ten-a', 'JPY');
    });
    it('refuses once a Rate exists', async () => {
        const result = await changeTenantCurrency({ hasAnyRate: vi.fn(async () => true), setCurrency: vi.fn() }, ADMIN, { currency: TENANT_CURRENCY_JPY });
        expect(result).toEqual({
            ok: false,
            error: {
                code: 'invalid_input',
                messageKey: 'errors.invalid_input',
                details: { currency: [TENANT_CURRENCY_LOCKED] },
            },
        });
    });
});
