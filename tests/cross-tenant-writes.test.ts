import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { WriteDeps } from '../packages/app/src/ports/write-deps';
import { mapTicket } from '../packages/app/src/use-cases';
import { closeAllPools, schema, type Db } from '../packages/db/src/client';
import {
  assertProbeTenantsDisjoint,
  buildProbeTenant,
  createProbeTenant,
  removeProbeTenant,
} from '../packages/db/src/probe-tenants';
import { inTenantTransaction } from '../packages/db/src/tenant-transaction';
import { withTenant } from '../packages/db/src/with-tenant';
import { READ_USE_CASES, REGISTRY_MODULE, type ReadUseCase, type WriteTarget } from './read-use-cases';
import { EXPECTED, manualMapping } from './write-expectations';
import {
  TEST_ACTOR,
  TEST_NOW,
  drive as driveWith,
  idPort,
  LANDED_TABLE,
  REMOVED_TABLE,
  landedRows,
  newSince,
  owner,
  connectWriteHarness,
  restrictedWriteDeps as restrictedWriteDepsWith,
  allRows,
  rowCounts,
  stageProbeMembers,
  targetOf,
  withoutSeq,
  type Outcome,
} from './write-harness';
import { requestContextFor } from './request-context';

/**
 * THE WRITE HALF OF THE CROSS-TENANT HARNESS (story 1.2 slice 4).
 *
 * `tests/cross-tenant.test.ts` enumerates the use-case surface mechanically and fails, with no
 * database, naming any export — read or write — that has no registry entry. This file drives
 * every entry of `kind: 'write'` against real row-level security, as the RESTRICTED role, and
 * asserts two things of each:
 *
 *   1. A FOREIGN-TENANT WRITE ANSWERS `not_found` AND LANDS NOTHING. Probe Tenant WB replays
 *      probe Tenant WA's Project, Ticket and Work Package ids — the id-from-a-URL shape. The
 *      use case must answer the error arm with `not_found` (not a throw, not `ok`), the refusal
 *      must carry nothing of WA, and the row count of EVERY tenant-owned table must be
 *      unchanged for BOTH Tenants. Counting every table rather than the four a write touches
 *      is what catches a write that landed somewhere nobody expected.
 *   2. AN OWN-TENANT WRITE LANDS EXACTLY THE ROWS THE ACTION ALWAYS WROTE — ids, `at` (the
 *      Project's anchor for a project write, the Clock for an organisation write), actor, audit
 *      action and payload, the new Work Package for a Plan, the org row after a create, rename
 *      or reassignment — on a dedicated probe Tenant, removed afterwards. Every write entry must
 *      have an expectation (`tests/write-expectations.ts`), asserted with no database too.
 *
 * Story 1.3 slice 2 put the organisation writes on the same surface, so they are driven here like
 * every other write: a foreign Department, Program or Project id answers `not_found` and lands
 * nothing for either Tenant. Story 1.4 slice 2's membership writes too — called as a Tenant Admin
 * who holds a `tenant_admin` membership in BOTH probes (`stageProbeMembers`), so WB replaying WA's
 * member is refused at the target lookup; the tenant-membership bridge, which has no row-level
 * security, is read and counted by an explicit `tenant_id` filter beside the tenant-owned tables. The one write that names no existing row (`createDepartment`, marked
 * `namesNoExistingRow` in the registry) is asserted to land in the caller's Tenant only.
 *
 * Its own probe Tenants, not `cross-tenant.test.ts`'s: vitest runs the two files in parallel,
 * and the reads there compare two probes' results for symmetry — a write landing on one of
 * them mid-run would be a flake with a misleading name. The seq bands are clear of that file's
 * (700M, 710M), the demo seed's and `rls.test.ts`'s.
 */

const reachable = await connectWriteHarness({
  ownerUrl: process.env.DATABASE_URL,
  appUrl: process.env.APP_DATABASE_URL,
  requireDb: process.env.REQUIRE_DB === '1',
});

/** The Tenant whose Project is written to. */
const PROBE_W = buildProbeTenant('xtprobe-wa', 720_000_000);
/** The foreign Tenant, replaying W's ids. */
const PROBE_V = buildProbeTenant('xtprobe-wb', 730_000_000);
assertProbeTenantsDisjoint([PROBE_W, PROBE_V]);

const WRITES: readonly ReadUseCase[] = READ_USE_CASES.filter((entry) => entry.kind === 'write');

/** The id port for every write this file drives — one sequence for the run, never reused. */
const IDS = idPort('xtwa-id');

function restrictedWriteDeps() {
  return restrictedWriteDepsWith(IDS);
}

function drive(entry: ReadUseCase, target: WriteTarget, deps: WriteDeps<Db> = restrictedWriteDeps()): Promise<Outcome> {
  return driveWith(entry.name, entry.invokeWrite!, target, deps);
}

// --- the pure gate ---------------------------------------------------------------------------

describe('every write use case is accounted for', () => {
  it('has an own-Tenant row expectation for every write entry, and none for anything else', () => {
    const names = WRITES.map((entry) => entry.name);
    const missing = names.filter((name) => !(name in EXPECTED));
    const stale = Object.keys(EXPECTED).filter((name) => !names.includes(name));
    expect(
      { missing, stale },
      `every entry of kind 'write' in ${REGISTRY_MODULE} needs the rows it must land in ` +
        'tests/cross-tenant-writes.test.ts EXPECTED, and every expectation needs an entry. ' +
        'A write with no expectation is a write nobody checked lands the right thing.',
    ).toEqual({ missing: [], stale: [] });
  });

  it('drives at least one write', () => {
    expect(WRITES.length, 'no entry is a write, so this file would drive nothing').toBeGreaterThan(0);
  });
});

// --- against the database --------------------------------------------------------------------

describe.skipIf(!reachable)('the write use cases, against two probe Tenants as the restricted role', () => {
  let anchor: Date;
  const ownTarget = () => targetOf(PROBE_W, PROBE_W.tenantId);
  type WriteScopeOf = Parameters<Parameters<typeof inTenantTransaction>[2]>[0];

  beforeAll(async () => {
    await createProbeTenant(owner(), PROBE_W);
    await createProbeTenant(owner(), PROBE_V);
    // The harness's user is a Tenant Admin of BOTH probes (the membership writes re-check the
    // caller against the bridge), so a foreign membership write can only be refused at the target.
    await stageProbeMembers(PROBE_W);
    await stageProbeMembers(PROBE_V);
    const [project] = await withTenant(owner(), PROBE_W.tenantId, (tx) =>
      tx.select().from(schema.project).where(eq(schema.project.id, PROBE_W.projectId)),
    );
    if (!project) throw new Error(`${PROBE_W.projectId} was not written`);
    anchor = project.demoAnchor;
  }, 120_000);

  afterAll(async () => {
    // Each removal in its own try, and verified — for the reason `cross-tenant.test.ts` gives:
    // `pnpm seed` refuses to run beside a second Tenant, so a leaked probe is a broken
    // workspace, and this hook matters most when something already went wrong.
    const failures: string[] = [];
    for (const probe of [PROBE_W, PROBE_V]) {
      try {
        await removeProbeTenant(owner(), probe);
        const left = Object.entries(await rowCounts(probe.tenantId)).filter(([, n]) => n > 0);
        if (left.length > 0) failures.push(`${probe.tenantId} left rows in ${left.map(([t]) => t).join(', ')}`);
      } catch (error) {
        failures.push(`removing ${probe.tenantId}: ${String(error)}`);
      }
    }
    if (failures.length > 0) {
      throw new Error(`the write harness did not clean up after itself:\n${failures.join('\n')}`);
    }
  }, 120_000);

  const FOREIGN = WRITES.filter((entry) => entry.namesNoExistingRow === undefined);
  const NO_FOREIGN_ID = WRITES.filter((entry) => entry.namesNoExistingRow !== undefined);

  describe.each(FOREIGN.map((entry) => [entry.name, entry] as const))(
    'write use case %s',
    (_name, entry) => {
      it('answers not_found and lands nothing, for either Tenant, when WB replays WA\'s ids', async () => {
        // EVERY ROW, NOT COUNTS — the rule this file states thirty lines below, applied here too.
        // Three of the four membership writes are UPDATEs and `tenant_membership` has no row-level
        // security, so a count cannot see one rewriting the other Tenant's row in place.
        //
        // HONEST SCOPE, because it was measured rather than argued: this is defence in depth, not
        // a hole being closed. Dropping the `tenant_id` predicate from the writer fails this test
        // either way — the `not_found` assertion above catches it, because a writer that can reach
        // the other Tenant's row stops refusing. Counts would only hide a defect that refuses AND
        // writes, which the rollback cases below already cover. The change is here so the file
        // obeys the rule it states, and so a future write that fails more quietly has one fewer
        // place to hide.
        const before = { w: await allRows(PROBE_W.tenantId), v: await allRows(PROBE_V.tenantId) };
        const outcome = await drive(entry, targetOf(PROBE_W, PROBE_V.tenantId));
        const after = { w: await allRows(PROBE_W.tenantId), v: await allRows(PROBE_V.tenantId) };

        expect(
          outcome.error,
          `${entry.name} THREW when probe Tenant WB wrote to WA's rows, instead of answering ` +
            `not_found: ${String((outcome.error as Error | undefined)?.message ?? outcome.error)}`,
        ).toBeUndefined();
        expect(
          outcome.refused?.code,
          `${entry.name} did not answer not_found when probe Tenant WB wrote to WA's rows` +
            (outcome.refused ? ` — it answered ${outcome.refused.code}` : ' — it answered ok'),
        ).toBe('not_found');
        expect(
          JSON.stringify(outcome).includes(PROBE_W.token),
          `${entry.name}'s refusal carried data of probe Tenant WA`,
        ).toBe(false);
        expect(
          after,
          `${entry.name} changed a row when probe Tenant WB wrote to WA's rows — a foreign ` +
            'write must land nothing in any tenant-owned table or in the bridge, for either Tenant',
        ).toEqual(before);
      });

      it('answers not_found and lands nothing when every id it names exists in neither Tenant', async () => {
        // Run as WA, where the same caller's own writes succeed (below) — for the membership
        // writes, a Tenant Admin with a membership there — so this not_found comes from the
        // target lookup, not from who is asking; the foreign replay above is the same refusal.
        const absent = (id: string) => `xt-absent-${id}`;
        const own = ownTarget();
        const target: WriteTarget = {
          ...own,
          projectId: absent('project'),
          ticketIds: [absent('ticket-1'), absent('ticket-2')],
          wpId: absent('wp'),
          departmentId: absent('department'),
          programId: absent('program'),
          memberUserId: absent('member'),
          staleProjectId: absent('stale'),
          secondAdminUserId: absent('admin'),
        };
        const before = { w: await allRows(PROBE_W.tenantId), v: await allRows(PROBE_V.tenantId) };
        const outcome = await drive(entry, target);
        const after = { w: await allRows(PROBE_W.tenantId), v: await allRows(PROBE_V.tenantId) };

        expect(outcome.error, `${entry.name} threw on ids that exist nowhere`).toBeUndefined();
        expect(outcome.refused?.code, `${entry.name} did not answer not_found on ids that exist nowhere`).toBe(
          'not_found',
        );
        expect(after, `${entry.name} changed rows on ids that exist nowhere`).toEqual(before);
      });
    },
  );

  describe.skipIf(NO_FOREIGN_ID.length === 0).each(NO_FOREIGN_ID.map((entry) => [entry.name, entry] as const))(
    'write use case %s (names no existing row)',
    (_name, entry) => {
      it('lands in the calling Tenant only — nothing for the other', async () => {
        const before = { w: await rowCounts(PROBE_W.tenantId), v: await rowCounts(PROBE_V.tenantId) };
        const outcome = await drive(entry, targetOf(PROBE_W, PROBE_V.tenantId));
        const after = { w: await rowCounts(PROBE_W.tenantId), v: await rowCounts(PROBE_V.tenantId) };

        expect(outcome, `${entry.name} did not answer ok for probe Tenant WB`).toEqual({ ok: true });
        expect(after.w, `${entry.name}, run as WB, changed probe Tenant WA's rows`).toEqual(before.w);
        const grew = Object.entries(after.v)
          .map(([table, n]) => [table, n - before.v[table]!] as const)
          .filter(([, delta]) => delta !== 0);
        expect(grew.length, `${entry.name} landed nothing for the Tenant that called it`).toBeGreaterThan(0);
        expect(
          grew.filter(([, delta]) => delta !== 1),
          `${entry.name} must land exactly one row per table it touches for WB`,
        ).toEqual([]);
      });
    },
  );

  /**
   * AD-14 against Postgres: the change and its audit record are ONE transaction. Each write is
   * driven on its own Tenant's Project through `packages/db`'s real tenant transaction, with one
   * thing wrapped — and nothing may land in any tenant-owned table either way.
   *
   *   * THE WORK FAILS AFTER THE AUDIT CALL: the use case's work resolves (the change made, the
   *     record appended — counted), then the transaction's callback throws before COMMIT.
   *   * THE AUDIT INSERT IS REFUSED: the sink's insert is handed a target Postgres rejects (a NUL
   *     in a text column — a real refusal by the database, not a thrown stub), after the change.
   *
   * Run before the own-Tenant writes below, so a leak here would also surface there as a
   * duplicate key rather than pass unnoticed.
   */
  describe('the change and its audit record commit together or not at all', () => {
    const AFTER_AUDIT = 'the work failed after audit.record';

    /** The real transaction, with `wrap` applied to the scope it hands the use case. */
    function wrappedDeps(
      wrap: (scope: WriteScopeOf) => WriteScopeOf,
      afterWork?: () => never,
    ): WriteDeps<Db> {
      return {
        ...restrictedWriteDeps(),
        transaction: <T>(handle: Db, tenantId: string, work: (scope: WriteScopeOf) => Promise<T>) =>
          inTenantTransaction(handle, tenantId, async (scope) => {
            const result = await work(wrap(scope));
            if (afterWork) afterWork();
            return result;
          }),
      };
    }

    it.each(WRITES.map((entry) => [entry.name, entry] as const))(
      '%s: the work failing after audit.record lands neither the change nor the record',
      async (_name, entry) => {
        let appended = 0;
        const deps = wrappedDeps(
          (scope) => ({
            ...scope,
            audit: {
              append: async (record) => {
                await scope.audit.append(record);
                appended += 1;
              },
            },
          }),
          () => {
            throw new Error(AFTER_AUDIT);
          },
        );
        // Every row, not counts: a count cannot see an UPDATE (a rename) that committed.
        const before = await allRows(PROBE_W.tenantId);
        const outcome = await drive(entry, ownTarget(), deps);

        expect(appended, `${entry.name} did not reach audit.record before the failure`).toBe(1);
        expect((outcome.error as Error | undefined)?.message).toBe(AFTER_AUDIT);
        expect(
          await allRows(PROBE_W.tenantId),
          `${entry.name}: rows survived a transaction that failed after its audit record`,
        ).toEqual(before);
      },
    );

    it.each(WRITES.map((entry) => [entry.name, entry] as const))(
      '%s: an audit_log insert refused by Postgres rolls the change back',
      async (_name, entry) => {
        let attempted = 0;
        const deps = wrappedDeps((scope) => ({
          ...scope,
          audit: {
            append: (record) => {
              attempted += 1;
              return scope.audit.append({ ...record, target: `${record.target}\0` });
            },
          },
        }));
        const before = await allRows(PROBE_W.tenantId);
        const outcome = await drive(entry, ownTarget(), deps);

        expect(attempted, `${entry.name} never tried to write its audit record`).toBe(1);
        expect(outcome.error, `${entry.name} reported a refused audit insert as a result`).toBeDefined();
        // Postgres's own refusal of the NUL (SQLSTATE 22021), not a client-side or wrapper throw.
        const refusal = outcome.error as { code?: string; cause?: { code?: string } };
        expect(
          refusal.code ?? refusal.cause?.code,
          `${entry.name} failed, but not with Postgres refusing the audit insert: ${String(outcome.error)}`,
        ).toBe('22021');
        expect(
          await allRows(PROBE_W.tenantId),
          `${entry.name}: the change committed although its audit record was refused`,
        ).toEqual(before);
      },
    );
  });

  describe('own-Tenant writes land exactly the rows the action always wrote', () => {
    let foreignBefore: Record<string, number>;

    beforeAll(async () => {
      foreignBefore = await rowCounts(PROBE_V.tenantId);
    });

    it.each(WRITES.map((entry) => [entry.name, entry] as const))('%s', async (_name, entry) => {
      const target = ownTarget();
      const rowsBefore = await allRows(PROBE_W.tenantId);
      const before = await landedRows(PROBE_W.tenantId);
      const ninesBefore = before.workPackages.filter(
        (w) => w.projectId === target.projectId && w.wbsCode.startsWith('9.'),
      ).length;

      const issuedBefore = IDS.issued.length;
      const outcome = await drive(entry, target);
      expect(outcome, `${entry.name} did not answer ok for its own Tenant's rows`).toEqual({
        ok: true,
      });

      const landed = newSince(before, await landedRows(PROBE_W.tenantId));
      const expected = EXPECTED[entry.name]!({
        target,
        at: anchor,
        now: TEST_NOW,
        actor: TEST_ACTOR,
        ninesBefore,
        newIds: IDS.issued.slice(issuedBefore),
        before,
      });
      expect(
        {
          ...landed,
          mappingEvents: withoutSeq(landed.mappingEvents),
          dispositions: withoutSeq(landed.dispositions),
          audits: withoutSeq(landed.audits),
        },
        `${entry.name} did not land the rows it must`,
      ).toEqual(expected);
      // …and nothing else moved: every other table — any not in `landedRows`, and any in it the
      // write is expected to leave alone — holds exactly the rows it held, row for row. The diff
      // above only sees the tables `landedRows` reads, and only new or changed rows by key.
      const tableOf: Readonly<Record<keyof typeof expected, string>> = { ...LANDED_TABLE, ...REMOVED_TABLE };
      const expectedTables = new Set(
        (Object.keys(tableOf) as (keyof typeof expected)[])
          .filter((key) => expected[key].length > 0)
          .map((key) => tableOf[key]),
      );
      const untouched = (rows: Record<string, readonly string[]>) =>
        Object.fromEntries(Object.entries(rows).filter(([table]) => !expectedTables.has(table)));
      expect(
        untouched(await allRows(PROBE_W.tenantId)),
        `${entry.name} changed a table it must leave alone`,
      ).toEqual(untouched(rowsBefore));
      // Mapping seqs are allocated as one consecutive run, in Ticket order.
      const seqs = landed.mappingEvents.map((row) => row.seq);
      expect(seqs).toEqual(seqs.map((_, index) => seqs[0]! + index));
    });

    it('mapTicket with an empty wpId unmaps: a null Work Package, audited as mapping.unmap', async () => {
      const target = ownTarget();
      const before = await landedRows(PROBE_W.tenantId);
      const result = await mapTicket(
        restrictedWriteDeps(),
        requestContextFor(target.tenantId),
        { projectId: target.projectId, ticketId: target.ticketIds[0], wpId: '' },
      );
      expect(result).toEqual({ ok: true, value: undefined });

      const landed = newSince(before, await landedRows(PROBE_W.tenantId));
      expect({
        ...landed,
        mappingEvents: withoutSeq(landed.mappingEvents),
        dispositions: withoutSeq(landed.dispositions),
        audits: withoutSeq(landed.audits),
      }).toEqual(manualMapping(target, anchor, TEST_ACTOR, ''));
    });

    it('landed nothing for the other probe Tenant', async () => {
      expect(await rowCounts(PROBE_V.tenantId)).toEqual(foreignBefore);
    });
  });
});

afterAll(async () => {
  await closeAllPools();
});
