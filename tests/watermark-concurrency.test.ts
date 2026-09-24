import { performance } from 'node:perf_hooks';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  appendProjectDefaultRate,
  appendResourceRate,
  mapTicket,
  mapTickets,
  renameDepartment,
} from '../packages/app/src/use-cases';
import { closeAllPools, schema as s } from '../packages/db/src/client';
import {
  assertProbeTenantsDisjoint,
  buildProbeTenant,
  createProbeTenant,
  removeProbeTenant,
  type ProbeTenant,
} from '../packages/db/src/probe-tenants';
import { inTenantTransaction } from '../packages/db/src/tenant-transaction';
import {
  WATERMARK_NAMESPACE,
  lockWatermark,
  lockWatermarkShared,
  watermarkKey,
  type WatermarkScope,
} from '../packages/db/src/watermark-lock';
import { withTenant, type Tx } from '../packages/db/src/with-tenant';
import { adminContextFor } from './request-context';
import {
  connectWriteHarness,
  idPort,
  owner,
  restrictedWriteDeps,
  rowCounts,
  targetOf,
  TEST_NOW,
} from './write-harness';

/**
 * THE WATERMARK LOCK, AGAINST POSTGRES (story 1.2 watermark slice; AD-20, AR-37).
 *
 * Every row of the spec's I/O matrix, on REAL connections of the restricted role's pool —
 * `inTenantTransaction` and `withTenant` check out one client per transaction — against two probe
 * Tenants of this suite's own (vitest runs files in parallel, so its seq bands are its own too):
 *
 *   * same Project: the second append WAITS (seen in `pg_locks`, not guessed from a timer), both
 *     commit, and `seq` order equals commit order — for `mapping_event` specifically, the lock
 *     precedes the INSERT that obtains its `seq`;
 *   * every lock site waits on its key: map Disposition, manual Mapping and Project default Rate
 *     (Project key), Resource Rate and an audit-only org write (Tenant key);
 *   * different Projects — in two Tenants and in one — do not wait on each other;
 *   * a SHARED holder (the future `ComputationInputs` capture) makes an append wait;
 *   * a rolled-back append releases the lock, and its error propagates unchanged;
 *   * a Project default Rate waiting on the lock does not deadlock a Mapping append's FK check
 *     (`findProject` is `FOR NO KEY UPDATE`);
 *   * twenty parallel map Dispositions across both Projects land in full with no
 *     `mapping_event_pkey` 23505 — the flake `momo_next_mapping_event_seq()` produced (2 in 17).
 */

const reachable = await connectWriteHarness({
  ownerUrl: process.env.DATABASE_URL,
  appUrl: process.env.APP_DATABASE_URL,
  requireDb: process.env.REQUIRE_DB === '1',
});

const PROBE_A = buildProbeTenant('xtprobe-wma', 952_000_000);
const PROBE_B = buildProbeTenant('xtprobe-wmb', 953_000_000);
assertProbeTenantsDisjoint([PROBE_A, PROBE_B]);

const IDS = idPort('xtwm-id');
const deps = () => restrictedWriteDeps(IDS);
const app = () => deps().handle;
const asAdmin = (probe: ProbeTenant) => adminContextFor(probe.tenantId);

/** How long `waiterOn` polls before declaring the contender lost; generous, never the pass path. */
const WAIT_DEADLINE_MS = 15_000;

/** A deferred the test resolves by hand. */
function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

function mapCommand(probe: ProbeTenant) {
  const target = targetOf(probe, probe.tenantId);
  return {
    kind: 'map' as const,
    projectId: probe.projectId,
    wpId: target.wpId,
    ticketIds: target.ticketIds,
  };
}

const projectScope = (probe: ProbeTenant): WatermarkScope => ({
  kind: 'project',
  projectId: probe.projectId,
});

/** A map Disposition on the probe's Project, stamped with its own actor so its rows are findable. */
function appendAs(
  probe: ProbeTenant,
  actor: string,
  hold?: { locked: () => void; until: Promise<void> },
) {
  return inTenantTransaction(app(), probe.tenantId, async (scope) => {
    await scope.projectWrite.recordMapDisposition({ actor, at: TEST_NOW }, mapCommand(probe));
    if (hold) {
      hold.locked();
      await hold.until;
    }
  });
}

/**
 * A transaction that takes `scope`'s exclusive watermark lock, signals, and holds it until
 * `release()`; then runs `beforeCommit` (if any) on its `tx` and commits.
 */
function holdLock(
  probe: ProbeTenant,
  scope: WatermarkScope,
  beforeCommit?: (tx: Tx) => Promise<void>,
) {
  const locked = gate();
  const held = gate();
  const done = withTenant(app(), probe.tenantId, async (tx) => {
    await lockWatermark({ tx, tenantId: probe.tenantId }, scope);
    locked.open();
    await held.opened;
    if (beforeCommit) await beforeCommit(tx);
  });
  return { locked: locked.opened, release: held.open, done };
}

/** The `mapping_event.seq` values `actor` landed in the probe's Tenant, ascending. */
async function seqsOf(probe: ProbeTenant, actor: string): Promise<number[]> {
  const rows = await withTenant(owner(), probe.tenantId, (tx) =>
    tx
      .select({ seq: s.mappingEvent.seq })
      .from(s.mappingEvent)
      .where(and(eq(s.mappingEvent.actor, actor), eq(s.mappingEvent.tenantId, probe.tenantId))),
  );
  return rows.map((r) => r.seq).sort((a, b) => a - b);
}

/**
 * How many `mapping_event` and `disposition_event` rows the probe's Tenant holds. Filtered by
 * `tenant_id` explicitly: a superuser owner bypasses row-level security.
 */
async function eventCounts(probe: ProbeTenant) {
  return withTenant(owner(), probe.tenantId, async (tx) => {
    const [m] = await tx
      .select({ n: sql<string>`count(*)` })
      .from(s.mappingEvent)
      .where(eq(s.mappingEvent.tenantId, probe.tenantId));
    const [d] = await tx
      .select({ n: sql<string>`count(*)` })
      .from(s.dispositionEvent)
      .where(eq(s.dispositionEvent.tenantId, probe.tenantId));
    return { mappings: Number(m!.n), dispositions: Number(d!.n) };
  });
}

/**
 * Resolves once some session is WAITING (not granted) on the two-argument advisory lock for
 * `scope` in the probe's Tenant. Throws if `contender` — the write expected to wait — settles
 * first (it went through without waiting), or if nothing waits within `WAIT_DEADLINE_MS`.
 * `pg_locks` stores the two int4 keys in `classid` and `objid` (as unsigned oids), `objsubid = 2`.
 */
async function waiterOn(
  probe: ProbeTenant,
  scope: WatermarkScope,
  contender: Promise<unknown>,
): Promise<void> {
  let settled = false;
  void contender.then(
    () => (settled = true),
    () => (settled = true),
  );
  const namespace = WATERMARK_NAMESPACE[scope.kind];
  const scopeId = scope.kind === 'project' ? scope.projectId : probe.tenantId;
  const objid = watermarkKey(probe.tenantId, scopeId) >>> 0;
  const deadline = performance.now() + WAIT_DEADLINE_MS;
  for (;;) {
    const res = await owner().execute<{ waiting: string }>(
      sql`SELECT count(*)::text AS waiting FROM pg_catalog.pg_locks
           WHERE locktype = 'advisory' AND NOT granted AND objsubid = 2
             AND classid = ${namespace}::oid AND objid = ${objid}::oid`,
    );
    if (Number(res.rows[0]?.waiting ?? 0) > 0) return;
    if (settled) throw new Error(`the contending write on ${scope.kind} ${scopeId} never waited`);
    if (performance.now() > deadline) {
      throw new Error(`nothing waited on ${scope.kind} ${scopeId} within ${WAIT_DEADLINE_MS} ms`);
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/**
 * Holds `scope`'s lock, starts `contend`, proves it waits on that key, then releases. Resolves to
 * the contender's outcome. The holder is released in `finally`, so a failed proof never leaves it
 * open.
 */
async function expectWaits<T>(
  probe: ProbeTenant,
  scope: WatermarkScope,
  contend: () => Promise<T>,
): Promise<T> {
  const holder = holdLock(probe, scope);
  await holder.locked;
  const contender = contend();
  try {
    await waiterOn(probe, scope, contender);
  } finally {
    holder.release();
  }
  await holder.done;
  return contender;
}

describe.skipIf(!reachable)('the watermark lock serialises appends per scope', () => {
  beforeAll(async () => {
    await createProbeTenant(owner(), PROBE_A);
    await createProbeTenant(owner(), PROBE_B);
  }, 120_000);

  afterAll(async () => {
    const left: string[] = [];
    for (const probe of [PROBE_A, PROBE_B]) {
      await removeProbeTenant(owner(), probe);
      left.push(
        ...Object.entries(await rowCounts(probe.tenantId))
          .filter(([, n]) => n > 0)
          .map(([table]) => `${probe.tenantId}.${table}`),
      );
    }
    await closeAllPools();
    expect(left, 'the watermark suite left probe rows behind').toEqual([]);
  }, 120_000);

  it('same Project: the second append waits, both commit, and seq order is commit order', async () => {
    const held = gate();
    const locked = gate();
    const committed: string[] = [];
    const first = appendAs(PROBE_A, 'user:wm-same-1', {
      locked: locked.open,
      until: held.opened,
    }).then(() => committed.push('first'));
    await locked.opened;
    const second = appendAs(PROBE_A, 'user:wm-same-2').then(() => committed.push('second'));

    try {
      await waiterOn(PROBE_A, projectScope(PROBE_A), second);
      expect(committed, 'the second append committed while the first held the lock').toEqual([]);
    } finally {
      held.open();
    }
    await Promise.all([first, second]);

    expect(committed).toEqual(['first', 'second']);
    const firstSeqs = await seqsOf(PROBE_A, 'user:wm-same-1');
    const secondSeqs = await seqsOf(PROBE_A, 'user:wm-same-2');
    expect(firstSeqs.length).toBeGreaterThan(0);
    expect(secondSeqs.length).toBeGreaterThan(0);
    expect(Math.max(...firstSeqs)).toBeLessThan(Math.min(...secondSeqs));
  }, 60_000);

  it('mapping_event: the lock precedes the INSERT that obtains its seq', async () => {
    // The holder takes the lock and inserts nothing yet. Were the Mapping append's `seq` obtained
    // before its lock (only the Disposition's lock guarding the transaction), the contender would
    // hold a LOWER seq than the row the holder inserts later, while committing after it.
    const holder = holdLock(PROBE_A, projectScope(PROBE_A), async (tx) => {
      const { ticketIds } = mapCommand(PROBE_A);
      await tx.insert(s.mappingEvent).values({
        id: 'wm-order-holder',
        tenantId: PROBE_A.tenantId,
        projectId: PROBE_A.projectId,
        ticketId: ticketIds[0]!,
        wpId: null,
        source: 'manual',
        ruleId: null,
        at: TEST_NOW,
        actor: 'user:wm-order-holder',
      });
    });
    await holder.locked;
    const contender = appendAs(PROBE_A, 'user:wm-order-contender');
    try {
      await waiterOn(PROBE_A, projectScope(PROBE_A), contender);
      expect(await seqsOf(PROBE_A, 'user:wm-order-contender')).toEqual([]);
    } finally {
      holder.release();
    }
    await holder.done;
    await contender;

    const [holderSeq] = await seqsOf(PROBE_A, 'user:wm-order-holder');
    const contenderSeqs = await seqsOf(PROBE_A, 'user:wm-order-contender');
    expect(contenderSeqs.length).toBeGreaterThan(0);
    expect(holderSeq!).toBeLessThan(Math.min(...contenderSeqs));
  }, 60_000);

  it('a manual Mapping waits on the Project key', async () => {
    const { wpId, ticketIds } = mapCommand(PROBE_A);
    const result = await expectWaits(PROBE_A, projectScope(PROBE_A), () =>
      mapTicket(deps(), asAdmin(PROBE_A), {
        projectId: PROBE_A.projectId,
        ticketId: ticketIds[0]!,
        wpId,
      }),
    );
    expect(result).toEqual({ ok: true, value: undefined });
  }, 60_000);

  it('a Project default Rate waits on the Project key', async () => {
    const result = await expectWaits(PROBE_A, projectScope(PROBE_A), () =>
      appendProjectDefaultRate(deps(), asAdmin(PROBE_A), {
        projectId: PROBE_A.projectId,
        effectiveFrom: '2026-10-01',
        yenPerHour: 9100,
      }),
    );
    expect(result).toEqual({ ok: true, value: undefined });
  }, 60_000);

  it('a Resource Rate waits on the Tenant key', async () => {
    const result = await expectWaits(PROBE_A, { kind: 'tenant' }, () =>
      appendResourceRate(deps(), asAdmin(PROBE_A), {
        resourceId: PROBE_A.state.fixture.resources[0]!.id,
        effectiveFrom: '2026-10-01',
        yenPerHour: 7300,
      }),
    );
    expect(result).toEqual({ ok: true, value: undefined });
  }, 60_000);

  it('an audit-only write (a Department rename) takes the Tenant key as its fallback', async () => {
    const result = await expectWaits(PROBE_A, { kind: 'tenant' }, () =>
      renameDepartment(deps(), asAdmin(PROBE_A), {
        departmentId: PROBE_A.state.fixture.department.id,
        name: 'Watermark Department',
      }),
    );
    expect(result).toEqual({ ok: true, value: undefined });
  }, 60_000);

  it('a Project default Rate waiting on the lock does not deadlock a Mapping append (no 40P01)', async () => {
    // The holder takes the Project key first; the default-Rate append then locks the Project row
    // (`findProject`) and waits on the key. The holder's Mapping insert needs FOR KEY SHARE on
    // that row for its foreign key: under `FOR UPDATE` the two wait on each other and Postgres
    // aborts one with 40P01; under `FOR NO KEY UPDATE` both commit.
    const holder = holdLock(PROBE_A, projectScope(PROBE_A), async (tx) => {
      const { ticketIds } = mapCommand(PROBE_A);
      await tx.insert(s.mappingEvent).values({
        id: 'wm-deadlock-holder',
        tenantId: PROBE_A.tenantId,
        projectId: PROBE_A.projectId,
        ticketId: ticketIds[0]!,
        wpId: null,
        source: 'manual',
        ruleId: null,
        at: TEST_NOW,
        actor: 'user:wm-deadlock-holder',
      });
    });
    await holder.locked;
    const rate = appendProjectDefaultRate(deps(), asAdmin(PROBE_A), {
      projectId: PROBE_A.projectId,
      effectiveFrom: '2026-10-02',
      yenPerHour: 9200,
    });
    try {
      await waiterOn(PROBE_A, projectScope(PROBE_A), rate);
    } finally {
      holder.release();
    }
    const [holderOutcome, rateOutcome] = await Promise.allSettled([holder.done, rate]);
    expect(holderOutcome.status).toBe('fulfilled');
    expect(rateOutcome).toEqual({ status: 'fulfilled', value: { ok: true, value: undefined } });
    expect(await seqsOf(PROBE_A, 'user:wm-deadlock-holder')).toHaveLength(1);
  }, 60_000);

  it('different Projects in two Tenants: an append does not wait on another Project’s holder', async () => {
    const held = gate();
    const locked = gate();
    const first = appendAs(PROBE_A, 'user:wm-diff-1', { locked: locked.open, until: held.opened });
    await locked.opened;
    try {
      // Completes while A's transaction still holds A's key; were it to wait, this await would
      // never resolve and the test would fail on its timeout.
      await appendAs(PROBE_B, 'user:wm-diff-2');
      expect(await seqsOf(PROBE_B, 'user:wm-diff-2')).not.toEqual([]);
    } finally {
      held.open();
    }
    await first;
  }, 60_000);

  it('different Projects in one Tenant: neither key waits on the other', async () => {
    const holder = holdLock(PROBE_A, projectScope(PROBE_A));
    await holder.locked;
    try {
      // A second Project id of the same Tenant: a different key, granted while A's is held.
      await withTenant(app(), PROBE_A.tenantId, (tx) =>
        lockWatermark(
          { tx, tenantId: PROBE_A.tenantId },
          { kind: 'project', projectId: `${PROBE_A.projectId}-second` },
        ),
      );
    } finally {
      holder.release();
    }
    await holder.done;
  }, 60_000);

  it('a shared holder makes an append wait until it commits', async () => {
    const held = gate();
    const locked = gate();
    const committed: string[] = [];
    const reader = withTenant(app(), PROBE_A.tenantId, async (tx) => {
      await lockWatermarkShared({ tx, tenantId: PROBE_A.tenantId }, projectScope(PROBE_A));
      locked.open();
      await held.opened;
    }).then(() => committed.push('reader'));
    await locked.opened;
    const writer = appendAs(PROBE_A, 'user:wm-shared').then(() => committed.push('writer'));

    try {
      await waiterOn(PROBE_A, projectScope(PROBE_A), writer);
      expect(committed).toEqual([]);
    } finally {
      held.open();
    }
    await Promise.all([reader, writer]);
    expect(committed).toEqual(['reader', 'writer']);
  }, 60_000);

  it('a rolled-back append releases the lock, and its error propagates unchanged', async () => {
    const held = gate();
    const locked = gate();
    const boom = new Error('watermark rollback probe');
    const failing = inTenantTransaction(app(), PROBE_A.tenantId, async (scope) => {
      await scope.projectWrite.recordMapDisposition(
        { actor: 'user:wm-rolled-back', at: TEST_NOW },
        mapCommand(PROBE_A),
      );
      locked.open();
      await held.opened;
      throw boom;
    });
    const settled = failing.then(
      () => 'resolved',
      (error: unknown) => error,
    );
    await locked.opened;
    const next = appendAs(PROBE_A, 'user:wm-after-rollback');

    try {
      await waiterOn(PROBE_A, projectScope(PROBE_A), next);
    } finally {
      held.open();
    }
    expect(await settled).toBe(boom);
    await next;
    expect(await seqsOf(PROBE_A, 'user:wm-rolled-back')).toEqual([]);
    expect(await seqsOf(PROBE_A, 'user:wm-after-rollback')).not.toEqual([]);
  }, 60_000);

  it('refuses a Project key after the Tenant key (lock order)', async () => {
    await withTenant(app(), PROBE_A.tenantId, async (tx) => {
      const bound = { tx, tenantId: PROBE_A.tenantId };
      await lockWatermark(bound, { kind: 'tenant' });
      await expect(lockWatermark(bound, projectScope(PROBE_A))).rejects.toThrow(
        /watermark lock order/,
      );
    });
  }, 60_000);

  it('twenty parallel map Dispositions across two Projects: no 23505, every row lands', async () => {
    const before = await Promise.all([PROBE_A, PROBE_B].map(eventCounts));
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => {
        const probe = i % 2 === 0 ? PROBE_A : PROBE_B;
        const { projectId, wpId, ticketIds } = mapCommand(probe);
        return mapTickets(deps(), asAdmin(probe), { projectId, wpId, ticketIds: [...ticketIds] });
      }),
    );
    expect(results.filter((r) => !r.ok)).toEqual([]);

    const after = await Promise.all([PROBE_A, PROBE_B].map(eventCounts));
    [PROBE_A, PROBE_B].forEach((probe, i) => {
      // Ten Dispositions per Project, each mapping that probe's two Tickets.
      const ticketCount = mapCommand(probe).ticketIds.length;
      expect(after[i]!.dispositions - before[i]!.dispositions).toBe(10);
      expect(after[i]!.mappings - before[i]!.mappings).toBe(10 * ticketCount);
    });
  }, 120_000);
});
