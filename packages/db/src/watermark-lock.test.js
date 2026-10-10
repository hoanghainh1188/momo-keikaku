import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { WATERMARK_NAMESPACE, watermarkKey } from './watermark-lock';
/**
 * The watermark key derivation (`watermark-lock.ts`), with no database: the application derives
 * the int4 key, so its stability is the application's to pin. A key that changed between two
 * releases would let an old and a new process append to one Project without serialising.
 */
const INT32_MIN = -(2 ** 31);
const INT32_MAX = 2 ** 31 - 1;
describe('watermarkKey', () => {
    it('is the first 4 bytes of SHA-256 over tenantId NUL scopeId, as a signed big-endian int32', () => {
        const digest = createHash('sha256').update('ten-momo\0prj-alpha').digest();
        expect(watermarkKey('ten-momo', 'prj-alpha')).toBe(digest.readInt32BE(0));
    });
    it('is stable: pinned to numeric literals for fixed identifiers', () => {
        // Literals, not a recomputation: a change to the derivation (hash, encoding, separator, byte
        // order, signedness) fails here, and would otherwise let an old and a new process disagree.
        expect(watermarkKey('ten-a', 'p-1')).toBe(886066221);
        expect(watermarkKey('ten-momo', 'prj-alpha')).toBe(1099995400);
        expect(watermarkKey('ten-momo', 'prj-1')).toBe(-80180242);
    });
    it('is a signed int32, and takes negative values', () => {
        const keys = Array.from({ length: 200 }, (_, i) => watermarkKey('ten-momo', `prj-${i}`));
        for (const key of keys) {
            expect(Number.isInteger(key)).toBe(true);
            expect(key).toBeGreaterThanOrEqual(INT32_MIN);
            expect(key).toBeLessThanOrEqual(INT32_MAX);
        }
        // Two hundred keys all non-negative would mean the high bit is being dropped (unsigned read).
        expect(keys.some((k) => k < 0)).toBe(true);
    });
    it('differs by Tenant for the same scope id', () => {
        expect(watermarkKey('ten-a', 'prj-shared')).not.toBe(watermarkKey('ten-b', 'prj-shared'));
    });
    it('separates the identifiers, so a shifted boundary is a different key', () => {
        expect(watermarkKey('ten-ab', 'c')).not.toBe(watermarkKey('ten-a', 'bc'));
    });
    it('keeps the two namespaces fixed: 1 = Project, 2 = Tenant', () => {
        expect(WATERMARK_NAMESPACE).toEqual({ project: 1, tenant: 2 });
    });
});
