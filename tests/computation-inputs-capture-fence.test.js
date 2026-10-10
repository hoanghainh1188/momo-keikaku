/**
 * Story 6.1 / AR-37 — source fence for live Review capture (Q2-A).
 *
 * The watermark-concurrency suite proves shared-lock wait behaviour against Postgres.
 * This fence runs without a database: `loadBundleInTenant` must take `lockWatermarkShared`
 * before any ledger / snapshot-head reads that feed the pin.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO = join(ROOT, 'packages/db/src/repo.ts');
describe('ComputationInputs capture fence (AR-37 / Q2-A)', () => {
    it('loadBundleInTenant takes lockWatermarkShared before selectLedgerForPin', () => {
        const source = readFileSync(REPO, 'utf8');
        const fnStart = source.indexOf('async function loadBundleInTenant');
        expect(fnStart, 'loadBundleInTenant missing').toBeGreaterThanOrEqual(0);
        const body = source.slice(fnStart);
        const lockAt = body.indexOf('lockWatermarkShared');
        const filterAt = body.indexOf('selectLedgerForPin');
        expect(lockAt, 'lockWatermarkShared not called in loadBundleInTenant').toBeGreaterThanOrEqual(0);
        expect(filterAt, 'selectLedgerForPin not called in loadBundleInTenant').toBeGreaterThanOrEqual(0);
        expect(lockAt).toBeLessThan(filterAt);
    });
    it('loadBundleInTenant takes the shared lock before reading tracker snapshots', () => {
        const source = readFileSync(REPO, 'utf8');
        const fnStart = source.indexOf('async function loadBundleInTenant');
        const body = source.slice(fnStart);
        const lockAt = body.indexOf('lockWatermarkShared');
        const snapAt = body.indexOf('trackerSnapshot');
        expect(lockAt).toBeGreaterThanOrEqual(0);
        expect(snapAt).toBeGreaterThanOrEqual(0);
        expect(lockAt).toBeLessThan(snapAt);
    });
    it('loadBundleInTenant takes the shared lock before actualsLedgerEntry and measurementBasisEvent', () => {
        const source = readFileSync(REPO, 'utf8');
        const fnStart = source.indexOf('async function loadBundleInTenant');
        const body = source.slice(fnStart);
        const lockAt = body.indexOf('lockWatermarkShared');
        const ledgerAt = body.indexOf('actualsLedgerEntry');
        const basisAt = body.indexOf('measurementBasisEvent');
        expect(lockAt, 'lockWatermarkShared not called in loadBundleInTenant').toBeGreaterThanOrEqual(0);
        expect(ledgerAt, 'actualsLedgerEntry missing in loadBundleInTenant').toBeGreaterThanOrEqual(0);
        expect(basisAt, 'measurementBasisEvent missing in loadBundleInTenant').toBeGreaterThanOrEqual(0);
        expect(lockAt).toBeLessThan(ledgerAt);
        expect(lockAt).toBeLessThan(basisAt);
    });
});
