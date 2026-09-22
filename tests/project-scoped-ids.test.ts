import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProject, mapTicket, mapTickets } from '../packages/app/src/use-cases';
import { closeAllPools } from '../packages/db/src/client';
import {
  assertProbeTenantsDisjoint,
  buildProbeTenant,
  createProbeTenant,
  removeProbeTenant,
} from '../packages/db/src/probe-tenants';
import * as schema from '../packages/db/src/schema';
import { withTenant } from '../packages/db/src/with-tenant';
import { adminContextFor, requestContextFor } from './request-context';
import {
  allRows,
  connectWriteHarness,
  idPort,
  owner,
  restrictedWriteDeps,
  rowCounts,
  targetOf,
} from './write-harness';

/**
 * AD-12: A PROJECT-SCOPED CALL'S OTHER IDS BELONG TO ITS PROJECT — against Postgres, as the
 * restricted role (story 1.5 follow-up).
 *
 * The unit suite (`project-writes.test.ts`) proves the use cases ask and refuse. This proves the
 * repository's answer: a Work Package of ANOTHER PROJECT OF THE SAME TENANT — which row-level
 * security does not hide — is refused by `mapTickets` and `mapTicket` with `not_found`, and not one
 * row changes in any tenant table. The same Tenant is the point: a Work Package of another Tenant
 * would be refused by RLS alone, so it could not show the `project_id` condition is there.
 */

const reachable = await connectWriteHarness({
  ownerUrl: process.env.DATABASE_URL,
  appUrl: process.env.APP_DATABASE_URL,
  requireDb: process.env.REQUIRE_DB === '1',
});

const PROBE = buildProbeTenant('xtprobe-sid', 820_000_000);
assertProbeTenantsDisjoint([PROBE]);

const IDS = idPort('xtsid-id');
const deps = () => restrictedWriteDeps(IDS);
const ctx = adminContextFor(PROBE.tenantId);

describe.skipIf(!reachable)('Work Package ids belong to the Project a write names (AD-12)', () => {
  /** A leaf Work Package of a SECOND Project of the probe Tenant. */
  const otherWpId = `${PROBE.writeOptions.idPrefix}wp-other-project`;

  beforeAll(async () => {
    await createProbeTenant(owner(), PROBE);
    const created = await createProject(deps(), ctx, {
      name: 'Second Project',
      departmentId: PROBE.state.fixture.department.id,
      programId: null,
      clientName: 'C',
      contractType: '請負',
    });
    if (!created.ok) throw new Error(`could not create the second Project: ${JSON.stringify(created)}`);
    const otherProjectId = created.value.id;
    await withTenant(owner(), PROBE.tenantId, (tx) =>
      tx.insert(schema.workPackage).values({
        id: otherWpId,
        tenantId: PROBE.tenantId,
        projectId: otherProjectId,
        wbsCode: '1',
        name: 'Another Project\'s Work Package',
        parentId: null,
        isLeaf: true,
        isMilestone: false,
        isCatchAll: false,
        start: null,
        finish: null,
        plannedMh: 0n,
        completedAt: null,
        milestoneDoneAt: null,
        assignedResourceIds: [],
        deletedAt: null,
      }),
    );
  }, 120_000);

  afterAll(async () => {
    await removeProbeTenant(owner(), PROBE);
    const left = Object.entries(await rowCounts(PROBE.tenantId)).filter(([, n]) => n > 0);
    expect(left, 'the scoped-ids suite left probe rows behind').toEqual([]);
    await closeAllPools();
  }, 120_000);

  it('mapTickets refuses another Project\'s Work Package with not_found, landing nothing', async () => {
    const own = targetOf(PROBE, PROBE.tenantId);
    const before = await allRows(PROBE.tenantId);

    const result = await mapTickets(deps(), ctx, {
      projectId: own.projectId,
      wpId: otherWpId,
      ticketIds: [...own.ticketIds],
    });

    expect(result).toEqual({ ok: false, error: { code: 'not_found', messageKey: 'errors.not_found' } });
    expect(await allRows(PROBE.tenantId)).toEqual(before);
  });

  it('mapTicket refuses another Project\'s Work Package with not_found, landing nothing', async () => {
    const own = targetOf(PROBE, PROBE.tenantId);
    const before = await allRows(PROBE.tenantId);

    const result = await mapTicket(deps(), ctx, {
      projectId: own.projectId,
      ticketId: own.ticketIds[0],
      wpId: otherWpId,
    });

    expect(result).toEqual({ ok: false, error: { code: 'not_found', messageKey: 'errors.not_found' } });
    expect(await allRows(PROBE.tenantId)).toEqual(before);
  });

  it('refuses a Work Package id that exists nowhere, landing nothing', async () => {
    const own = targetOf(PROBE, PROBE.tenantId);
    const before = await allRows(PROBE.tenantId);
    const result = await mapTicket(deps(), ctx, {
      projectId: own.projectId,
      ticketId: own.ticketIds[0],
      wpId: `${PROBE.writeOptions.idPrefix}wp-nowhere`,
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'not_found' } });
    expect(await allRows(PROBE.tenantId)).toEqual(before);
  });

  it('refuses a PM assigned to the Project who names another Project\'s Work Package', async () => {
    // The scenario AD-12's rule exists for: reach on projectId alone would let this through.
    const own = targetOf(PROBE, PROBE.tenantId);
    const pm = requestContextFor(PROBE.tenantId, undefined, ['pm'], [own.projectId]);
    const before = await allRows(PROBE.tenantId);
    const result = await mapTickets(deps(), pm, {
      projectId: own.projectId,
      wpId: otherWpId,
      ticketIds: [...own.ticketIds],
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'not_found' } });
    expect(await allRows(PROBE.tenantId)).toEqual(before);
  });

  it('mapTickets still maps to the Project\'s own Work Package', async () => {
    const own = targetOf(PROBE, PROBE.tenantId);
    const result = await mapTickets(deps(), ctx, {
      projectId: own.projectId,
      wpId: own.wpId,
      ticketIds: [...own.ticketIds],
    });
    expect(result).toEqual({ ok: true, value: undefined });
  });

  it('mapTicket still maps to the Project\'s own Work Package', async () => {
    const own = targetOf(PROBE, PROBE.tenantId);
    const result = await mapTicket(deps(), ctx, {
      projectId: own.projectId,
      ticketId: own.ticketIds[0],
      wpId: own.wpId,
    });
    expect(result).toEqual({ ok: true, value: undefined });
  });
});
