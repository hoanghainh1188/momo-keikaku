/**
 * Story 5.15 — NFR-P1 at load shape (5 Projects × 500 WPs × 2,000 Tickets), REQUIRE_DB only.
 *
 * One `beforeAll` writes a load-shaped probe Tenant through the load seed's own writer
 * (`writeLoadTenantRows`, namespaced ids + its own seq band) and logs how long that took. Both
 * timed gates then run against it:
 *
 *   1. The full snapshot (founder decision 1A / matrix row "Timed full snapshot"): a week-5 read
 *      of the same 2,000 Tickets, hours advanced, written by `writeIngestSnapshot` onto a
 *      load-shaped Project — deltas against week 4, not Opening Balances into an empty Project
 *      (that is `ingest-nfr.test.ts`). Budget 5 minutes.
 *   2. The Review (decision 2A): server-side `getProjectReview` — DB load + compute — for one
 *      load Project; warmup + 20 samples, p75 < 2 s and p95 < 4 s. THIS IS NOT NFR-P1's page-load
 *      figure: it excludes RSC render and network. The page-load harness is deferred to Epic 6.
 *
 * Lives under `tests/` rather than `packages/db` because it drives a `packages/app` use case,
 * and `packages/db` may not import `@momo/app` (AD-1). The Tenant is removed with
 * `removeTenant` (never TRUNCATE) before the seed-suite lock is released.
 */
import { performance } from 'node:perf_hooks';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, count, eq } from 'drizzle-orm';
import { mappingHead } from '@momo/domain';
import pg from 'pg';
import { getProjectReview } from '../packages/app/src/use-cases';
import { closeAllPools, getDb } from '../packages/db/src/client';
import {
  generateLoadFixture,
  LOAD_FIXTURE_SEED,
  LOAD_PROJECT_COUNT,
  LOAD_TICKETS_PER_PROJECT,
  LOAD_WP_PER_PROJECT,
  loadProjectAsDemoState,
  loadWeek5Read,
} from '../packages/db/src/load-generator';
import { probeMemberIds, removeTenant } from '../packages/db/src/probe-tenants';
import { loadProjectBundle, loadReview } from '../packages/db/src/repo';
import { loadRuleEvaluation } from '../packages/db/src/repo-mapping-rules';
import { ingestWriteRepositoryOn } from '../packages/db/src/repositories/ingest';
import * as s from '../packages/db/src/schema';
import { writeLoadTenantRows } from '../packages/db/src/seed';
import { acquireSeedSuiteLock, releaseSeedSuiteLock } from '../packages/db/src/seed-suite-lock';
import { withTenant } from '../packages/db/src/with-tenant';

const REQUIRE_DB = process.env.REQUIRE_DB === '1';
const OWNER_DATABASE_URL = process.env.DATABASE_URL;
const APP_DATABASE_URL = process.env.APP_DATABASE_URL;

const SNAPSHOT_BUDGET_MS = 5 * 60 * 1000;
const REVIEW_P75_BUDGET_MS = 2_000;
const REVIEW_P95_BUDGET_MS = 4_000;
const REVIEW_SAMPLES = 20;
/** Founder decision 1A: a seed slower than this locally is a stop-and-report, not a pass. */
const SEED_REPORT_THRESHOLD_MS = 2 * 60 * 1000;

/** Namespaced shape: same numbers as `SEED_PROFILE=load`, ids that collide with nothing. */
const NAMESPACE = 'xtload';
const SHAPE = generateLoadFixture(LOAD_FIXTURE_SEED, { namespace: NAMESPACE });
const TENANT = SHAPE.tenant.id;
/** Probe seq band (story 1.8: load probes ≥ 870_000_000); clear of every other suite's band. */
const WRITE_OPTIONS = { idPrefix: `${NAMESPACE}-`, seqOffset: 975_000_000 } as const;
const MEMBER_IDS = probeMemberIds({ writeOptions: WRITE_OPTIONS });

/** The Project the timed snapshot writes into, and the one the Review reads (left untouched). */
const SNAPSHOT_PROJECT_INDEX = 0;
const REVIEW_PROJECT_INDEX = 1;

async function reachable(url: string | undefined): Promise<boolean> {
  if (!url) return false;
  const client = new pg.Client({ connectionString: url, application_name: 'momo-load-nfr' });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

const live = (await reachable(OWNER_DATABASE_URL)) && (await reachable(APP_DATABASE_URL));
if (REQUIRE_DB && !live) {
  throw new Error('REQUIRE_DB=1 but DATABASE_URL / APP_DATABASE_URL are not reachable');
}
if (live) await acquireSeedSuiteLock(OWNER_DATABASE_URL!, 'shared');

// The Tenant goes BEFORE the lock does: a seed waiting on the exclusive lock must never see it.
afterAll(async () => {
  if (!live) return;
  try {
    await removeTenant(getDb(OWNER_DATABASE_URL!), TENANT, MEMBER_IDS);
  } finally {
    await releaseSeedSuiteLock();
    await closeAllPools();
  }
});

/** Inclusive empirical percentile — the ceil(p × n)-th sample of the ascending samples. */
function percentile(samplesMs: readonly number[], p: number): number {
  if (samplesMs.length === 0) throw new Error('percentile: empty samples');
  const sorted = [...samplesMs].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]!;
}

const fmt = (samples: readonly number[]) => samples.map((x) => x.toFixed(0)).join(',');

describe.skipIf(!live)('NFR-P1 at load shape (story 5.15, REQUIRE_DB)', () => {
  beforeAll(async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    await removeTenant(owner, TENANT, MEMBER_IDS);
    const started = performance.now();
    const written = await withTenant(owner, TENANT, (tx) =>
      writeLoadTenantRows(tx, SHAPE, WRITE_OPTIONS),
    );
    const seedMs = performance.now() - started;
    const c = written.counts;
    console.log(
      `[load-fixture-nfr] probe seed: ${c.projects} Projects, ${c.wps} WPs, ${c.tickets} Tickets, ` +
        `${c.snapshots} snapshots, ${c.ledgerEntries} ledger entries, ${c.mappingEvents} ` +
        `mapping events in ${(seedMs / 1000).toFixed(1)} s`,
    );
    if (seedMs > SEED_REPORT_THRESHOLD_MS) {
      console.warn(
        `[load-fixture-nfr] probe seed took ${(seedMs / 1000).toFixed(1)} s — over the 2 min ` +
          'line founder decision 1A sets for stop-and-report',
      );
    }
    expect(c.projects).toBe(LOAD_PROJECT_COUNT);
    expect(c.wps).toBe(LOAD_PROJECT_COUNT * LOAD_WP_PER_PROJECT);
    expect(c.tickets).toBe(LOAD_PROJECT_COUNT * LOAD_TICKETS_PER_PROJECT);
  }, 10 * 60 * 1000);

  it('has the load shape on disk: 5 × 2,000 Tickets, every bk-load-* account linked', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    await withTenant(owner, TENANT, async (tx) => {
      const tickets = await tx
        .select({ projectId: s.ticket.projectId, n: count() })
        .from(s.ticket)
        .where(eq(s.ticket.tenantId, TENANT))
        .groupBy(s.ticket.projectId);
      expect(tickets.map((r) => Number(r.n))).toEqual(
        Array.from({ length: LOAD_PROJECT_COUNT }, () => LOAD_TICKETS_PER_PROJECT),
      );

      const links = await tx
        .select({ accountId: s.trackerAccount.accountId, resourceId: s.trackerAccountLinkEvent.resourceId })
        .from(s.trackerAccountLinkEvent)
        .innerJoin(
          s.trackerAccount,
          and(
            eq(s.trackerAccount.tenantId, s.trackerAccountLinkEvent.tenantId),
            eq(s.trackerAccount.id, s.trackerAccountLinkEvent.trackerAccountId),
          ),
        )
        .where(eq(s.trackerAccountLinkEvent.tenantId, TENANT));
      const linked = new Map(links.map((l) => [l.accountId, l.resourceId]));
      for (const r of SHAPE.resources) expect(linked.get(r.accountId), r.accountId).toBe(r.id);

      const accounts = await tx
        .select({ accountId: s.trackerAccount.accountId })
        .from(s.trackerAccount)
        .where(eq(s.trackerAccount.tenantId, TENANT));
      expect(accounts.every((a) => linked.has(a.accountId))).toBe(true);
    });
  });

  it(
    'writes a full week-5 snapshot onto a load-shaped Project within 5 minutes',
    async () => {
      const app = getDb(APP_DATABASE_URL!);
      const project = SHAPE.projects[SNAPSHOT_PROJECT_INDEX]!;
      const week4 = project.snapshots.at(-1)!;
      const week5 = loadWeek5Read(SHAPE, SNAPSHOT_PROJECT_INDEX);
      const prevById = new Map(week4.tickets.map((t) => [t.trackerIssueId, t.actualMh!]));
      const advanced = week5.tickets.filter((t) => t.actualMh! > prevById.get(t.trackerIssueId)!);

      const [connector] = await withTenant(app, TENANT, (tx) =>
        tx
          .select({ id: s.connector.id })
          .from(s.connector)
          .where(and(eq(s.connector.tenantId, TENANT), eq(s.connector.projectId, project.id))),
      );
      expect(connector, 'the load Project has its fixture Connector').toBeDefined();

      let id = 0;
      const started = performance.now();
      await withTenant(app, TENANT, async (tx) => {
        const result = await ingestWriteRepositoryOn({ tx, tenantId: TENANT }).writeIngestSnapshot({
          projectId: project.id,
          connectorId: connector!.id,
          read: {
            complete: true,
            observedAt: week5.observedAt,
            tickets: week5.tickets,
            accounts: week5.accounts ?? [],
            hoursFieldPresent: week5.hoursFieldPresent,
            adapterKind: 'fixture',
          },
          snapshotId: week5.snapshotId,
          nextId: () => `${NAMESPACE}-w5-${(id += 1)}`,
          actor: 'system:load-nfr',
          at: new Date(week5.observedAt),
        });
        expect(result).toEqual({ kind: 'written', snapshotId: week5.snapshotId });
      });
      const elapsed = performance.now() - started;
      console.log(
        `[load-fixture-nfr] week-5 snapshot (${week5.tickets.length} Tickets, ` +
          `${advanced.length} advanced) in ${(elapsed / 1000).toFixed(2)} s`,
      );
      expect(elapsed).toBeLessThan(SNAPSHOT_BUDGET_MS);

      await withTenant(app, TENANT, async (tx) => {
        const [snap] = await tx
          .select({ ticketCount: s.trackerSnapshot.ticketCount })
          .from(s.trackerSnapshot)
          .where(and(eq(s.trackerSnapshot.tenantId, TENANT), eq(s.trackerSnapshot.id, week5.snapshotId)));
        expect(snap?.ticketCount).toBe(LOAD_TICKETS_PER_PROJECT);

        const entries = await tx
          .select({
            kind: s.actualsLedgerEntry.kind,
            prevSnapshotId: s.actualsLedgerEntry.prevSnapshotId,
          })
          .from(s.actualsLedgerEntry)
          .where(
            and(
              eq(s.actualsLedgerEntry.tenantId, TENANT),
              eq(s.actualsLedgerEntry.snapshotId, week5.snapshotId),
            ),
          );
        // Deltas against week 4 only — the same Tickets, so no Opening Balance anywhere.
        expect(entries).toHaveLength(advanced.length);
        expect(entries.every((e) => e.kind === 'delta')).toBe(true);
        expect(entries.every((e) => e.prevSnapshotId === week4.snapshotId)).toBe(true);

        // The seeded identity rows were found, not duplicated.
        const [tickets] = await tx
          .select({ n: count() })
          .from(s.ticket)
          .where(and(eq(s.ticket.tenantId, TENANT), eq(s.ticket.projectId, project.id)));
        expect(Number(tickets?.n)).toBe(LOAD_TICKETS_PER_PROJECT);
      });
    },
    SNAPSHOT_BUDGET_MS + 60_000,
  );

  it(
    'computes the server-side Review for a load Project under p75 2 s / p95 4 s',
    async () => {
      const app = getDb(APP_DATABASE_URL!);
      const projectId = SHAPE.projects[REVIEW_PROJECT_INDEX]!.id;
      const deps = { handle: app, projectRead: { loadProjectBundle, loadReview, loadRuleEvaluation } };
      const ctx = {
        tenantId: TENANT,
        userId: `${NAMESPACE}-nfr-pm`,
        roles: ['pm'] as const,
        projectIds: [projectId],
        locale: 'en' as const,
      };
      const review = () => getProjectReview(deps, ctx, { projectId });

      // The fixture's own Unmapped count for this Project — the persisted Mappings and rules must
      // reproduce it, or the timing would be of a Project that is not the full shape.
      const fixtureState = loadProjectAsDemoState(SHAPE, REVIEW_PROJECT_INDEX);
      const head = mappingHead(fixtureState.mappingEvents);
      const expectedUnmapped = fixtureState.snapshots
        .at(-1)!
        .tickets.filter((t) => (head.get(t.trackerIssueId)?.wpId ?? null) === null).length;
      expect(expectedUnmapped).toBeGreaterThan(0);

      for (let i = 0; i < 3; i += 1) {
        const warm = await review();
        if (!warm.ok) throw new Error(`getProjectReview answered ${warm.error.code}`);
        // The Review is over the load data, with hours valued — not an empty Project.
        // Its own Project's week-4 snapshot (snapshot ids are not idPrefixed), never another's.
        expect(warm.value.review.snapshot.id).toBe(
          SHAPE.projects[REVIEW_PROJECT_INDEX]!.snapshots.at(-1)!.snapshotId,
        );
        expect(warm.value.review.measurementBasis).toBe('hours');
        expect(warm.value.review.attribution.cumulative.totalMh).toBeGreaterThan(0n);
        expect(
          warm.value.review.coverage.unmappedTickets,
          `Review pinned snapshot ${warm.value.review.snapshot.id}`,
        ).toBe(expectedUnmapped);
        // AC in yen, valued at the linked Resources' Rates.
        expect(warm.value.review.attribution.cumulative.totalJpy).toBeGreaterThan(0n);
      }

      const samples: number[] = [];
      for (let i = 0; i < REVIEW_SAMPLES; i += 1) {
        const t0 = performance.now();
        const result = await review();
        samples.push(performance.now() - t0);
        expect(result.ok).toBe(true);
      }
      const p75 = percentile(samples, 0.75);
      const p95 = percentile(samples, 0.95);
      console.log(
        `[load-fixture-nfr] server-side Review (getProjectReview) p75=${p75.toFixed(0)} ms ` +
          `p95=${p95.toFixed(0)} ms samples=[${fmt(samples)}]`,
      );
      expect(p75, `p75=${p75.toFixed(1)}ms samples=[${fmt(samples)}]`).toBeLessThan(
        REVIEW_P75_BUDGET_MS,
      );
      expect(p95, `p95=${p95.toFixed(1)}ms samples=[${fmt(samples)}]`).toBeLessThan(
        REVIEW_P95_BUDGET_MS,
      );
    },
    5 * 60 * 1000,
  );
});
