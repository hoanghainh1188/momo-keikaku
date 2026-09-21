import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import type { ProjectWriteDeps } from '../packages/app/src/ports/project-write';
import type { AppError } from '../packages/app/src/result';
import { mapTicket } from '../packages/app/src/use-cases';
import { closeAllPools, getDb, getPool, schema, type Db } from '../packages/db/src/client';
import {
  assertProbeTenantsDisjoint,
  buildProbeTenant,
  createProbeTenant,
  removeProbeTenant,
  type ProbeTenant,
} from '../packages/db/src/probe-tenants';
import {
  recordChangeRequestCandidates,
  recordExplainDisposition,
  recordManualMapping,
  recordMapDisposition,
  recordPlanDisposition,
} from '../packages/db/src/repo-writes';
import { TENANT_OWNED } from '../packages/db/src/table-classes';
import { withTenant } from '../packages/db/src/with-tenant';
import { READ_USE_CASES, REGISTRY_MODULE, type ReadUseCase, type WriteTarget } from './read-use-cases';

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
 *      Project's anchor), actor, audit action and payload, and the new Work Package for a
 *      Plan — on a dedicated probe Tenant, removed afterwards. Every write entry must have an
 *      expectation below, and that is asserted with no database too.
 *
 * Its own probe Tenants, not `cross-tenant.test.ts`'s: vitest runs the two files in parallel,
 * and the reads there compare two probes' results for symmetry — a write landing on one of
 * them mid-run would be a flake with a misleading name. The seq bands are clear of that file's
 * (700M, 710M), the demo seed's and `rls.test.ts`'s.
 */

const REQUIRE_DB = process.env.REQUIRE_DB === '1';
const OWNER_DATABASE_URL = process.env.DATABASE_URL;
const APP_DATABASE_URL = process.env.APP_DATABASE_URL;

/** The Tenant whose Project is written to. */
const PROBE_W = buildProbeTenant('xtprobe-wa', 720_000_000);
/** The foreign Tenant, replaying W's ids. */
const PROBE_V = buildProbeTenant('xtprobe-wb', 730_000_000);
assertProbeTenantsDisjoint([PROBE_W, PROBE_V]);

/** Distinct from every fixture actor, so the rows a write lands can be told apart. */
const TEST_ACTOR = 'user:xtprobe-writer';

const WRITES: readonly ReadUseCase[] = READ_USE_CASES.filter((entry) => entry.kind === 'write');

if (REQUIRE_DB && !(OWNER_DATABASE_URL && APP_DATABASE_URL)) {
  throw new Error(
    'REQUIRE_DB=1 but DATABASE_URL and APP_DATABASE_URL are not both set. The write half of ' +
      'the cross-tenant harness needs the owner to write the probe Tenants and the application ' +
      'role to drive the writes; it must not be skipped here.',
  );
}

async function reachableAs(connectionString: string | undefined): Promise<boolean> {
  if (!connectionString) return false;
  try {
    const client = await getPool(connectionString).connect();
    client.release();
    return true;
  } catch {
    return false;
  }
}

const reachable =
  (await reachableAs(OWNER_DATABASE_URL)) && (await reachableAs(APP_DATABASE_URL));

if (REQUIRE_DB && !reachable) {
  throw new Error(
    'REQUIRE_DB=1 but the database is not reachable as both roles. Run `pnpm pgboss:migrate` ' +
      'and `pnpm db:policies` first.',
  );
}

function owner(): Db {
  return getDb(OWNER_DATABASE_URL!);
}

/**
 * The write port, wired: `packages/db`'s write functions as `packages/app` declares them, on
 * the RESTRICTED role's handle. The same structural check the web app's composition root
 * makes — this file is a composition root too.
 */
function restrictedWriteDeps() {
  return {
    handle: getDb(APP_DATABASE_URL!),
    actor: TEST_ACTOR,
    projectWrite: {
      recordMapDisposition,
      recordPlanDisposition,
      recordExplainDisposition,
      recordChangeRequestCandidates,
      recordManualMapping,
    },
  } satisfies ProjectWriteDeps<Db>;
}

/** W's own ids: two Tickets it has Mapping history for, and a leaf, non-Catch-all WP. */
function targetOf(probe: ProbeTenant, tenantId: string): WriteTarget {
  const tickets = [...new Set(probe.state.mappingEvents.map((m) => m.ticketId))];
  const leaf = probe.state.wps.find((w) => w.isLeaf && !w.isCatchAll);
  if (tickets.length < 2 || !leaf) {
    throw new Error(`${probe.token}'s fixture has too few Tickets or no leaf Work Package`);
  }
  return { tenantId, projectId: probe.projectId, ticketIds: [tickets[0]!, tickets[1]!], wpId: leaf.id };
}

interface Outcome {
  readonly ok?: true;
  readonly refused?: AppError;
  readonly error?: unknown;
}

async function drive(entry: ReadUseCase, target: WriteTarget): Promise<Outcome> {
  try {
    const returned = (await entry.invokeWrite!(restrictedWriteDeps(), target)) as {
      ok?: boolean;
      error?: AppError;
    } | null;
    if (returned?.ok === true) return { ok: true };
    if (returned?.ok === false && returned.error) return { refused: returned.error };
    return { error: new Error(`${entry.name} did not return a Result`) };
  } catch (error) {
    return { error };
  }
}

/** Rows per tenant-owned table for one Tenant, counted inside its own tenant scope. */
async function rowCounts(tenantId: string): Promise<Record<string, number>> {
  return withTenant(owner(), tenantId, async (tx) => {
    // Sequential: one transaction is one connection, and pg refuses overlapping queries on it.
    const entries: (readonly [string, number])[] = [];
    for (const owned of TENANT_OWNED) {
      const res = await tx.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM ${sql.identifier(owned.table)}
             WHERE ${sql.identifier(owned.tenantColumn!)} = ${tenantId}`,
      );
      entries.push([owned.table, Number(res.rows[0]?.n ?? 0)]);
    }
    return Object.fromEntries(entries);
  });
}

// --- the pure gate ---------------------------------------------------------------------------

/** What an own-Tenant write must land, per write entry — keyed by the registry's name. */
type Expect = (ctx: ExpectContext) => ExpectedRows;

interface ExpectContext {
  readonly target: WriteTarget;
  readonly at: Date;
  /** The `9.` Work Packages the Project had before the write. */
  readonly ninesBefore: number;
}

interface ExpectedRows {
  readonly mappingEvents: readonly Record<string, unknown>[];
  readonly dispositions: readonly Record<string, unknown>[];
  readonly audits: readonly Record<string, unknown>[];
  readonly workPackages: readonly Record<string, unknown>[];
}

const NO_ROWS: ExpectedRows = { mappingEvents: [], dispositions: [], audits: [], workPackages: [] };

function dispositionMappings(target: WriteTarget, at: Date, wpId: string) {
  return target.ticketIds.map((ticketId) => ({
    id: `map-${ticketId}-${at.getTime()}`,
    tenantId: target.tenantId,
    projectId: target.projectId,
    ticketId,
    wpId,
    source: 'disposition',
    ruleId: null,
    at,
    actor: TEST_ACTOR,
  }));
}

function disposition(
  target: WriteTarget,
  at: Date,
  kind: string,
  wpId: string | null,
  note: string | null,
) {
  return {
    dispositions: [
      {
        id: `disp-${kind}-${at.getTime()}`,
        tenantId: target.tenantId,
        projectId: target.projectId,
        kind,
        ticketIds: [...target.ticketIds],
        wpId,
        note,
        at,
        actor: TEST_ACTOR,
      },
    ],
    audits: [
      {
        tenantId: target.tenantId,
        actor: TEST_ACTOR,
        action: `disposition.${kind}`,
        target: target.projectId,
        payload: { ticketIds: [...target.ticketIds], wpId, note },
        at,
      },
    ],
  };
}

const EXPECTED: Readonly<Record<string, Expect>> = {
  mapTickets: ({ target, at }) => ({
    ...NO_ROWS,
    mappingEvents: dispositionMappings(target, at, target.wpId),
    ...disposition(target, at, 'map', target.wpId, null),
  }),
  planTicketsAsWorkPackage: ({ target, at, ninesBefore }) => {
    const wpId = `wp-new-${at.getTime()}`;
    return {
      mappingEvents: dispositionMappings(target, at, wpId),
      ...disposition(target, at, 'plan', wpId, null),
      workPackages: [
        {
          id: wpId,
          tenantId: target.tenantId,
          projectId: target.projectId,
          wbsCode: `9.${ninesBefore + 1}`,
          name: 'Harness Plan',
          parentId: null,
          isLeaf: true,
          isMilestone: false,
          isCatchAll: false,
          start: null,
          finish: null,
          plannedMh: 0,
          completedAt: null,
          milestoneDoneAt: null,
          assignedResourceIds: [],
          deletedAt: null,
        },
      ],
    };
  },
  explainTickets: ({ target, at }) => ({
    ...NO_ROWS,
    ...disposition(target, at, 'explain', null, 'Harness note.'),
  }),
  markChangeRequestCandidates: ({ target, at }) => ({
    ...NO_ROWS,
    ...disposition(target, at, 'cr_candidate', null, null),
  }),
  mapTicket: ({ target, at }) => manualMapping(target, at, target.wpId),
};

/** FR-21's manual Mapping rows. `wpId` is the raw command value: `''` is the unmap. */
function manualMapping(target: WriteTarget, at: Date, wpId: string): ExpectedRows {
  const ticketId = target.ticketIds[0];
  return {
    ...NO_ROWS,
    mappingEvents: [
      {
        id: `map-${ticketId}-${at.getTime()}`,
        tenantId: target.tenantId,
        projectId: target.projectId,
        ticketId,
        wpId: wpId === '' ? null : wpId,
        source: 'manual',
        ruleId: null,
        at,
        actor: TEST_ACTOR,
      },
    ],
    audits: [
      {
        tenantId: target.tenantId,
        actor: TEST_ACTOR,
        action: wpId === '' ? 'mapping.unmap' : 'mapping.map',
        target: ticketId,
        payload: { wpId },
        at,
      },
    ],
  };
}

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

/** The rows a write may land, for one Tenant, keyed so a later read can be diffed. */
async function landedRows(tenantId: string) {
  return withTenant(owner(), tenantId, async (tx) => ({
    mappingEvents: await tx
      .select()
      .from(schema.mappingEvent)
      .where(eq(schema.mappingEvent.tenantId, tenantId)),
    dispositions: await tx
      .select()
      .from(schema.dispositionEvent)
      .where(eq(schema.dispositionEvent.tenantId, tenantId)),
    audits: await tx.select().from(schema.auditLog).where(eq(schema.auditLog.tenantId, tenantId)),
    workPackages: await tx
      .select()
      .from(schema.workPackage)
      .where(eq(schema.workPackage.tenantId, tenantId)),
  }));
}

type Landed = Awaited<ReturnType<typeof landedRows>>;

/** What appeared between two reads — rows are append-only here, so "new" is by key. */
function newSince(before: Landed, after: Landed) {
  const seqs = (rows: readonly { seq: number }[]) => new Set(rows.map((row) => row.seq));
  const mapSeqs = seqs(before.mappingEvents);
  const dispSeqs = seqs(before.dispositions);
  const auditSeqs = seqs(before.audits);
  const wpIds = new Set(before.workPackages.map((row) => row.id));
  return {
    mappingEvents: after.mappingEvents
      .filter((row) => !mapSeqs.has(row.seq))
      .sort((a, b) => a.seq - b.seq),
    dispositions: after.dispositions.filter((row) => !dispSeqs.has(row.seq)),
    audits: after.audits.filter((row) => !auditSeqs.has(row.seq)),
    workPackages: after.workPackages.filter((row) => !wpIds.has(row.id)),
  };
}

/** Drops the database-allocated `seq`, which the expectations cannot know. */
function withoutSeq<T extends { seq: number }>(rows: readonly T[]): Omit<T, 'seq'>[] {
  return rows.map(({ seq: _seq, ...rest }) => rest);
}

describe.skipIf(!reachable)('the write use cases, against two probe Tenants as the restricted role', () => {
  let anchor: Date;
  const ownTarget = () => targetOf(PROBE_W, PROBE_W.tenantId);

  beforeAll(async () => {
    await createProbeTenant(owner(), PROBE_W);
    await createProbeTenant(owner(), PROBE_V);
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
        await removeProbeTenant(owner(), probe.tenantId);
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

  describe.each(WRITES.map((entry) => [entry.name, entry] as const))(
    'write use case %s',
    (_name, entry) => {
      it('answers not_found and lands nothing, for either Tenant, when WB replays WA\'s ids', async () => {
        const before = { w: await rowCounts(PROBE_W.tenantId), v: await rowCounts(PROBE_V.tenantId) };
        const outcome = await drive(entry, targetOf(PROBE_W, PROBE_V.tenantId));
        const after = { w: await rowCounts(PROBE_W.tenantId), v: await rowCounts(PROBE_V.tenantId) };

        expect(
          outcome.error,
          `${entry.name} THREW when probe Tenant WB wrote to WA's Project, instead of answering ` +
            `not_found: ${String((outcome.error as Error | undefined)?.message ?? outcome.error)}`,
        ).toBeUndefined();
        expect(
          outcome.refused?.code,
          `${entry.name} did not answer not_found when probe Tenant WB wrote to WA's Project` +
            (outcome.refused ? ` — it answered ${outcome.refused.code}` : ' — it answered ok'),
        ).toBe('not_found');
        expect(
          JSON.stringify(outcome).includes(PROBE_W.token),
          `${entry.name}'s refusal carried data of probe Tenant WA`,
        ).toBe(false);
        expect(
          after,
          `${entry.name} changed row counts when probe Tenant WB wrote to WA's Project — a ` +
            'foreign write must land nothing in any tenant-owned table, for either Tenant',
        ).toEqual(before);
      });
    },
  );

  describe('own-Tenant writes land exactly the rows the action always wrote', () => {
    let foreignBefore: Record<string, number>;

    beforeAll(async () => {
      foreignBefore = await rowCounts(PROBE_V.tenantId);
    });

    it.each(WRITES.map((entry) => [entry.name, entry] as const))('%s', async (_name, entry) => {
      const target = ownTarget();
      const before = await landedRows(PROBE_W.tenantId);
      const ninesBefore = before.workPackages.filter(
        (w) => w.projectId === target.projectId && w.wbsCode.startsWith('9.'),
      ).length;

      const outcome = await drive(entry, target);
      expect(outcome, `${entry.name} did not answer ok for its own Tenant's Project`).toEqual({
        ok: true,
      });

      const landed = newSince(before, await landedRows(PROBE_W.tenantId));
      const expected = EXPECTED[entry.name]!({ target, at: anchor, ninesBefore });
      expect(
        {
          mappingEvents: withoutSeq(landed.mappingEvents),
          dispositions: withoutSeq(landed.dispositions),
          audits: withoutSeq(landed.audits),
          workPackages: landed.workPackages,
        },
        `${entry.name} did not land the rows the action always wrote`,
      ).toEqual(expected);
      // Mapping seqs are allocated as one consecutive run, in Ticket order.
      const seqs = landed.mappingEvents.map((row) => row.seq);
      expect(seqs).toEqual(seqs.map((_, index) => seqs[0]! + index));
    });

    it('mapTicket with an empty wpId unmaps: a null Work Package, audited as mapping.unmap', async () => {
      const target = ownTarget();
      const before = await landedRows(PROBE_W.tenantId);
      const result = await mapTicket(
        restrictedWriteDeps(),
        { tenantId: target.tenantId },
        { projectId: target.projectId, ticketId: target.ticketIds[0], wpId: '' },
      );
      expect(result).toEqual({ ok: true, value: undefined });

      const landed = newSince(before, await landedRows(PROBE_W.tenantId));
      expect({
        mappingEvents: withoutSeq(landed.mappingEvents),
        dispositions: withoutSeq(landed.dispositions),
        audits: withoutSeq(landed.audits),
        workPackages: landed.workPackages,
      }).toEqual(manualMapping(target, anchor, ''));
    });

    it('landed nothing for the other probe Tenant', async () => {
      expect(await rowCounts(PROBE_V.tenantId)).toEqual(foreignBefore);
    });
  });
});

afterAll(async () => {
  await closeAllPools();
});
