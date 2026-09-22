/**
 * Audit-log read against Postgres (story 1.7): I/O matrix, role gate, cross-tenant empty,
 * non-enum row visible, filters / order / actor email. Probe seq base ≥ 850_000_000.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encode } from '@momo/domain';
import { listAuditLog } from '../packages/app/src/use-cases';
import type { AuditLogReadDeps } from '../packages/app/src/ports/audit-log-read';
import { closeAllPools, getDb, type Db } from '../packages/db/src/client';
import { actorOf, DEMO_USERS } from '../packages/db/src/demo-identities';
import { lookupUserOn } from '../packages/db/auth/src/identity';
import { listAuditLog as listAuditLogRows } from '../packages/db/src/repo-audit';
import * as schema from '../packages/db/src/schema';
import {
  assertProbeTenantsDisjoint,
  buildProbeTenant,
  createProbeTenant,
  removeProbeTenant,
} from '../packages/db/src/probe-tenants';
import { withTenant } from '../packages/db/src/with-tenant';
import { connectWriteHarness, owner } from './write-harness';
import { adminContextFor, pmContextFor } from './request-context';

const reachable = await connectWriteHarness({
  ownerUrl: process.env.DATABASE_URL,
  appUrl: process.env.APP_DATABASE_URL,
  requireDb: process.env.REQUIRE_DB === '1',
});

const PROBE_O = buildProbeTenant('xtprobe-aud', 850_000_000);
const PROBE_F = buildProbeTenant('xtprobe-afg', 860_000_000);
assertProbeTenantsDisjoint([PROBE_O, PROBE_F]);

const prefix = PROBE_O.writeOptions.idPrefix;
const probeAdminId = `${prefix}${DEMO_USERS.hoang.id}`;
const probeAdminEmail = `${prefix}${DEMO_USERS.hoang.email}`;
const probeAdminActor = actorOf(probeAdminId);

function readDeps(): AuditLogReadDeps<Db> {
  const handle = getDb(process.env.APP_DATABASE_URL!);
  return {
    handle,
    auditLogRead: { list: listAuditLogRows },
    lookupUser: (userId) => lookupUserOn(handle, userId),
  };
}

const admin = adminContextFor(PROBE_O.tenantId);
const foreignAdmin = adminContextFor(PROBE_F.tenantId);

describe.skipIf(!reachable)('listAuditLog against Postgres', () => {
  beforeAll(async () => {
    await createProbeTenant(owner(), PROBE_O);
    await createProbeTenant(owner(), PROBE_F);
    // Extra rows so filter / order / actor-email assertions observe real DB behaviour.
    await withTenant(owner(), PROBE_O.tenantId, async (tx) => {
      await tx.insert(schema.auditLog).values([
        {
          tenantId: PROBE_O.tenantId,
          actor: probeAdminActor,
          action: 'department.create',
          target: 'dep-extra-aud',
          payload: encode({ name: 'Extra Dept' }),
          at: new Date('2026-09-10T00:00:00Z'),
        },
        {
          tenantId: PROBE_O.tenantId,
          actor: 'system:test',
          action: 'resource.create',
          target: 'res-extra-aud',
          payload: encode({ departmentId: 'dep-1', name: 'Extra', role: 'QA' }),
          at: new Date('2026-09-11T00:00:00Z'),
        },
      ]);
    });
  }, 120_000);

  afterAll(async () => {
    const failures: string[] = [];
    for (const probe of [PROBE_O, PROBE_F]) {
      try {
        await removeProbeTenant(owner(), probe);
      } catch (error) {
        failures.push(String(error));
      }
    }
    await closeAllPools();
    if (failures.length > 0) throw new Error(failures.join('\n'));
  }, 120_000);

  it('lists newest-first by seq, including demo.seed', async () => {
    const result = await listAuditLog(readDeps(), admin, {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows.some((r) => r.action === 'demo.seed')).toBe(true);
    expect(result.value.rows.some((r) => r.target === PROBE_O.projectId)).toBe(true);
    const seqs = result.value.rows.map((r) => r.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => b - a));
  });

  it('filter by action shrinks the result', async () => {
    const all = await listAuditLog(readDeps(), admin, {});
    const filtered = await listAuditLog(readDeps(), admin, { action: 'department.create' });
    expect(all.ok && filtered.ok).toBe(true);
    if (!(all.ok && filtered.ok)) return;
    expect(filtered.value.rows.length).toBeGreaterThan(0);
    expect(filtered.value.rows.length).toBeLessThan(all.value.rows.length);
    expect(filtered.value.rows.every((r) => r.action === 'department.create')).toBe(true);
  });

  it('filter by actor keeps only that stored stamp', async () => {
    const result = await listAuditLog(readDeps(), admin, { actor: 'system:test' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows.length).toBeGreaterThan(0);
    expect(result.value.rows.every((r) => r.actor === 'system:test')).toBe(true);
  });

  it('filter by from/to inclusive window excludes out-of-range rows', async () => {
    const result = await listAuditLog(readDeps(), admin, {
      from: '2026-09-10T00:00:00.000Z',
      to: '2026-09-10T23:59:59.000Z',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows.length).toBeGreaterThan(0);
    expect(
      result.value.rows.every(
        (r) =>
          r.at.getTime() >= Date.parse('2026-09-10T00:00:00.000Z') &&
          r.at.getTime() <= Date.parse('2026-09-10T23:59:59.000Z'),
      ),
    ).toBe(true);
    expect(result.value.rows.some((r) => r.target === 'res-extra-aud')).toBe(false);
  });

  it('lookupUserOn returns the probe Admin email; actorDisplay uses it', async () => {
    const handle = getDb(process.env.APP_DATABASE_URL!);
    const user = await lookupUserOn(handle, probeAdminId);
    expect(user?.email).toBe(probeAdminEmail);

    const result = await listAuditLog(readDeps(), admin, { action: 'department.create' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = result.value.rows.find((r) => r.actor === probeAdminActor);
    expect(row).toBeDefined();
    expect(row!.actorDisplay).toBe(probeAdminEmail);
  });

  it('refuses a non-enum action filter as invalid_input', async () => {
    const result = await listAuditLog(readDeps(), admin, { action: 'demo.seed' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_input');
  });

  it('returns only own-Tenant rows for each Admin', async () => {
    const own = await listAuditLog(readDeps(), admin, {});
    const foreign = await listAuditLog(readDeps(), foreignAdmin, {});
    expect(own.ok && foreign.ok).toBe(true);
    if (!(own.ok && foreign.ok)) return;
    for (const row of own.value.rows) {
      expect(row.target).not.toBe(PROBE_F.projectId);
    }
    for (const row of foreign.value.rows) {
      expect(row.target).not.toBe(PROBE_O.projectId);
    }
  });

  it('refuses a PM with not_found', async () => {
    const pm = pmContextFor(PROBE_O.tenantId, PROBE_O.projectId);
    const result = await listAuditLog(readDeps(), pm, {});
    expect(result).toMatchObject({ ok: false, error: { code: 'not_found' } });
  });
});
