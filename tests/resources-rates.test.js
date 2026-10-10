import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { appendProjectDefaultRate, appendResourceRate, createResource, } from '../packages/app/src/use-cases';
import { closeAllPools } from '../packages/db/src/client';
import * as schema from '../packages/db/src/schema';
import { assertProbeTenantsDisjoint, buildProbeTenant, createProbeTenant, removeProbeTenant, } from '../packages/db/src/probe-tenants';
import { withTenant } from '../packages/db/src/with-tenant';
import { allRows, idPort, landedRows, owner, connectWriteHarness, restrictedWriteDeps, } from './write-harness';
import { adminContextFor, pmContextFor } from './request-context';
/**
 * Resource / Rate writes against Postgres (story 1.6): I/O matrix, ledger untouched on Rate
 * append, foreign ids → `not_found`. Probe seq base ≥ 830_000_000 (820_000_000 taken).
 */
const reachable = await connectWriteHarness({
    ownerUrl: process.env.DATABASE_URL,
    appUrl: process.env.APP_DATABASE_URL,
    requireDb: process.env.REQUIRE_DB === '1',
});
const PROBE_O = buildProbeTenant('xtprobe-rates', 830_000_000);
const PROBE_F = buildProbeTenant('xtprobe-rfgn', 840_000_000);
assertProbeTenantsDisjoint([PROBE_O, PROBE_F]);
const IDS = idPort('xtrr-id');
const deps = () => restrictedWriteDeps(IDS);
const admin = adminContextFor(PROBE_O.tenantId);
const homeDepartment = PROBE_O.state.fixture.department.id;
const homeResource = PROBE_O.state.fixture.resources[0].id;
const homeProject = PROBE_O.projectId;
function createdId(result) {
    expect(result).toMatchObject({ ok: true, value: { id: expect.any(String) } });
    return result.value.id;
}
describe.skipIf(!reachable)('Resource and Rate writes against Postgres', () => {
    beforeAll(async () => {
        await createProbeTenant(owner(), PROBE_O);
        await createProbeTenant(owner(), PROBE_F);
    }, 120_000);
    afterAll(async () => {
        const failures = [];
        for (const probe of [PROBE_O, PROBE_F]) {
            try {
                await removeProbeTenant(owner(), probe);
            }
            catch (error) {
                failures.push(String(error));
            }
        }
        await closeAllPools();
        if (failures.length > 0)
            throw new Error(failures.join('\n'));
    }, 120_000);
    it('creates a Resource with no Rate row', async () => {
        const beforeRates = (await landedRows(PROBE_O.tenantId)).rateEntries.length;
        const id = createdId(await createResource(deps(), admin, {
            departmentId: homeDepartment,
            name: 'New Engineer',
            role: 'Engineer',
        }));
        const landed = await landedRows(PROBE_O.tenantId);
        expect(landed.resources.some((r) => r.id === id && r.name === 'New Engineer')).toBe(true);
        expect(landed.rateEntries.filter((r) => r.resourceId === id)).toEqual([]);
        expect(landed.rateEntries.length).toBe(beforeRates);
        const audit = [...landed.audits].sort((a, b) => a.seq - b.seq).at(-1);
        expect(audit).toMatchObject({ action: 'resource.create', target: id });
    });
    it('lets a PM create a Resource', async () => {
        const pm = pmContextFor(PROBE_O.tenantId, homeProject);
        const id = createdId(await createResource(deps(), pm, {
            departmentId: homeDepartment,
            name: 'PM Hire',
            role: 'QA',
        }));
        expect((await landedRows(PROBE_O.tenantId)).resources.some((r) => r.id === id)).toBe(true);
    });
    it('answers not_found for a foreign Department and lands nothing', async () => {
        const before = await allRows(PROBE_O.tenantId);
        const foreignDep = PROBE_F.state.fixture.department.id;
        expect(await createResource(deps(), admin, {
            departmentId: foreignDep,
            name: 'X',
            role: 'Y',
        })).toMatchObject({ error: { code: 'not_found' } });
        expect(await allRows(PROBE_O.tenantId)).toEqual(before);
    });
    it('appends a Resource Rate without touching the Actuals Ledger', async () => {
        const before = await allRows(PROBE_O.tenantId);
        const ledgerBefore = before.actuals_ledger_entry;
        expect(await appendResourceRate(deps(), admin, {
            resourceId: homeResource,
            effectiveFrom: '2026-03-15',
            yenPerHour: 7000,
        })).toEqual({ ok: true, value: undefined });
        const after = await allRows(PROBE_O.tenantId);
        expect(after.actuals_ledger_entry).toEqual(ledgerBefore);
        expect(after.rate_entry.length).toBe(before.rate_entry.length + 1);
    });
    it('answers not_found when a PM appends a Resource Rate', async () => {
        const before = await allRows(PROBE_O.tenantId);
        const pm = pmContextFor(PROBE_O.tenantId, homeProject);
        expect(await appendResourceRate(deps(), pm, {
            resourceId: homeResource,
            effectiveFrom: '2026-04-01',
            yenPerHour: 1,
        })).toMatchObject({ error: { code: 'not_found' } });
        expect(await allRows(PROBE_O.tenantId)).toEqual(before);
    });
    it('appends a Project default Rate and dual-writes the column head', async () => {
        expect(await appendProjectDefaultRate(deps(), admin, {
            projectId: homeProject,
            effectiveFrom: '2026-05-01',
            yenPerHour: 4800,
        })).toEqual({ ok: true, value: undefined });
        const [project] = await withTenant(owner(), PROBE_O.tenantId, (tx) => tx.select().from(schema.project).where(eq(schema.project.id, homeProject)));
        expect(project?.defaultRateJpy).toBe(4800);
        const rates = (await landedRows(PROBE_O.tenantId)).projectDefaultRates.filter((r) => r.projectId === homeProject && r.yenPerHour === 4800);
        expect(rates.length).toBeGreaterThanOrEqual(1);
    });
    it('answers not_found for a foreign Project default Rate append', async () => {
        const before = await allRows(PROBE_O.tenantId);
        expect(await appendProjectDefaultRate(deps(), admin, {
            projectId: PROBE_F.projectId,
            effectiveFrom: '2026-05-01',
            yenPerHour: 1,
        })).toMatchObject({ error: { code: 'not_found' } });
        expect(await allRows(PROBE_O.tenantId)).toEqual(before);
    });
});
