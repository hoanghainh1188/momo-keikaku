/**
 * Story 2.12 fence cases: publishCalendarVersion, national toggles, Project days,
 * refuse missing calendar, serial fan-out, AR-52 allow-list via schedule-closure.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  addProjectNonWorkingDay,
  patchNationalCalendarFlags,
  publishCalendarVersion,
  publishCalendarVersionFanOut,
  removeProjectNonWorkingDay,
} from '../../packages/app/src/calendar/publish-calendar-version';
import { applyPlanChange } from '../../packages/app/src/schedule/apply-plan-change';
import { NATIONAL_DATASET_VERSION, resolveCalendarVersion } from '../../packages/domain/src/calendar';
import { closeAllPools, getDb, getPool } from '../../packages/db/src/client';
import {
  assertProbeTenantsDisjoint,
  buildProbeTenant,
  createProbeTenant,
  removeProbeTenant,
} from '../../packages/db/src/probe-tenants';
import * as s from '../../packages/db/src/schema';
import { acquireSeedSuiteLock, releaseSeedSuiteLock } from '../../packages/db/src/seed-suite-lock';
import { inTenantTransaction } from '../../packages/db/src/tenant-transaction';
import { withTenant } from '../../packages/db/src/with-tenant';

const OWNER_DATABASE_URL = process.env.DATABASE_URL;
const APP_DATABASE_URL = process.env.APP_DATABASE_URL;
const REQUIRE_DB = process.env.REQUIRE_DB === '1';

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
  throw new Error('REQUIRE_DB=1 but DATABASE_URL or APP_DATABASE_URL is unreachable.');
}

const PROBE = buildProbeTenant('xtprobe-s212', 954_000_000);
assertProbeTenantsDisjoint([PROBE]);

if (reachable) {
  await acquireSeedSuiteLock(OWNER_DATABASE_URL!, 'shared');
}

afterAll(async () => {
  if (reachable) {
    await removeProbeTenant(getDb(OWNER_DATABASE_URL!), PROBE).catch(() => {});
  }
  await releaseSeedSuiteLock();
  await closeAllPools();
});

function ctx(projectId = PROBE.projectId) {
  return {
    tenantId: PROBE.tenantId,
    userId: 'user-s212',
    roles: ['pm'] as const,
    locale: 'en' as const,
    projectIds: [projectId],
  };
}

async function prepareSchedulable(owner: ReturnType<typeof getDb>, probe = PROBE) {
  await createProbeTenant(owner, probe);
  const leaf = probe.state.wps.find((w) => w.isLeaf && !w.isMilestone);
  if (!leaf) throw new Error('fixture needs a leaf WP');
  await withTenant(owner, probe.tenantId, async (tx) => {
    await tx
      .update(s.project)
      .set({ projectStart: '2026-09-01', dataDate: '2026-10-05', projectFinish: null })
      .where(eq(s.project.id, probe.projectId));
    await tx
      .update(s.workPackage)
      .set({ durationDays: 3, constraintType: 'asap', constraintDate: null })
      .where(
        and(
          eq(s.workPackage.tenantId, probe.tenantId),
          eq(s.workPackage.projectId, probe.projectId),
          eq(s.workPackage.id, leaf.id),
        ),
      );
  });
  return leaf;
}

describe('resolveCalendarVersion (pure)', () => {
  it('lists weekends exhaustively and merges nationals + project days over the default range', () => {
    const resolved = resolveCalendarVersion({
      calendarJp: true,
      calendarVn: false,
      projectDays: ['2026-10-14'],
    });
    expect(resolved.rangeStart).toBe('2025-01-01');
    expect(resolved.rangeEnd).toBe('2028-12-31');
    expect(resolved.nationalDatasetVersion).toBe(NATIONAL_DATASET_VERSION);
    expect(resolved.nationalSets).toEqual(['jp']);
    expect(resolved.nonWorkingDays).toContain('2026-01-01');
    expect(resolved.nonWorkingDays).toContain('2026-10-10'); // Saturday
    expect(resolved.nonWorkingDays).toContain('2026-10-14');
    // An unlisted weekday Monday in range is working (not in the set).
    expect(resolved.nonWorkingDays).not.toContain('2026-10-05');
  });

  it('with both national flags false stores weekends (+ project days) only — no JP/VN nationals', () => {
    const resolved = resolveCalendarVersion({
      calendarJp: false,
      calendarVn: false,
      projectDays: ['2026-10-14'],
    });
    expect(resolved.nationalSets).toEqual([]);
    // JP New Year 2026 is a Thursday — not a weekend; must be absent when flags are off.
    expect(resolved.nonWorkingDays).not.toContain('2026-01-01');
    // VN Liberation Day 2026 is a Thursday — same.
    expect(resolved.nonWorkingDays).not.toContain('2026-04-30');
    expect(resolved.nonWorkingDays).toContain('2026-10-10'); // Saturday
    expect(resolved.nonWorkingDays).toContain('2026-10-14'); // Project day
  });
});

describe.skipIf(!reachable)('publishCalendarVersion (story 2.12)', () => {
  it('seed materialises a real version — not synthetic-2.9', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    await createProbeTenant(owner, PROBE);
    const [row] = await withTenant(owner, PROBE.tenantId, async (tx) =>
      tx
        .select({
          nationalDatasetVersion: s.holidayCalendarVersion.nationalDatasetVersion,
          nationalSets: s.holidayCalendarVersion.nationalSets,
          rangeStart: s.holidayCalendarVersion.rangeStart,
          rangeEnd: s.holidayCalendarVersion.rangeEnd,
        })
        .from(s.holidayCalendarVersion)
        .where(eq(s.holidayCalendarVersion.projectId, PROBE.projectId))
        .orderBy(desc(s.holidayCalendarVersion.seq))
        .limit(1),
    );
    expect(row?.nationalDatasetVersion).toBe(NATIONAL_DATASET_VERSION);
    expect(row?.nationalDatasetVersion).not.toBe('synthetic-2.9');
    expect(row?.rangeStart).toBe('2025-01-01');
    expect(row?.rangeEnd).toBe('2028-12-31');
    expect(row?.nationalSets).toContain('jp');
  });

  it('refuses recalculation when no calendar version exists', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    await createProbeTenant(owner, PROBE);
    await withTenant(owner, PROBE.tenantId, async (tx) => {
      await tx.execute(sql`select set_config('app.maintenance', 'on', true)`);
      await tx
        .delete(s.holidayCalendarVersion)
        .where(eq(s.holidayCalendarVersion.projectId, PROBE.projectId));
      await tx
        .update(s.project)
        .set({ projectStart: '2026-09-01', dataDate: '2026-10-05' })
        .where(eq(s.project.id, PROBE.projectId));
    });

    const leaf = PROBE.state.wps.find((w) => w.isLeaf && !w.isMilestone)!;
    await withTenant(owner, PROBE.tenantId, async (tx) => {
      await tx
        .update(s.workPackage)
        .set({ durationDays: 3 })
        .where(eq(s.workPackage.id, leaf.id));
    });

    const result = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'patch_duration',
        projectId: PROBE.projectId,
        wpId: leaf.id,
        durationDays: 5,
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_input');
    expect(result.error.details?.calendar).toEqual(['required']);
  });

  it('publishes a new version on national flag toggle and recalculates with cause calendar', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    await prepareSchedulable(owner);

    const before = await withTenant(app, PROBE.tenantId, async (tx) =>
      tx
        .select({ seq: s.holidayCalendarVersion.seq })
        .from(s.holidayCalendarVersion)
        .where(eq(s.holidayCalendarVersion.projectId, PROBE.projectId)),
    );

    const result = await patchNationalCalendarFlags(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      { projectId: PROBE.projectId, calendarJp: true, calendarVn: true },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const after = await withTenant(app, PROBE.tenantId, async (tx) =>
      tx
        .select({
          seq: s.holidayCalendarVersion.seq,
          nationalSets: s.holidayCalendarVersion.nationalSets,
          nationalDatasetVersion: s.holidayCalendarVersion.nationalDatasetVersion,
        })
        .from(s.holidayCalendarVersion)
        .where(eq(s.holidayCalendarVersion.projectId, PROBE.projectId))
        .orderBy(desc(s.holidayCalendarVersion.seq))
        .limit(1),
    );
    expect(after[0]!.seq).toBeGreaterThan(before.length > 0 ? Math.max(...before.map((b) => b.seq)) : 0);
    expect(after[0]!.nationalSets.sort()).toEqual(['jp', 'vn']);
    expect(after[0]!.nationalDatasetVersion).toBe(NATIONAL_DATASET_VERSION);

    const runs = await withTenant(app, PROBE.tenantId, async (tx) =>
      tx
        .select({ cause: s.scheduleRun.cause })
        .from(s.scheduleRun)
        .where(eq(s.scheduleRun.projectId, PROBE.projectId))
        .orderBy(desc(s.scheduleRun.seq))
        .limit(1),
    );
    expect(runs[0]?.cause).toBe('calendar');

    const audits = await withTenant(app, PROBE.tenantId, async (tx) =>
      tx
        .select({ action: s.auditLog.action })
        .from(s.auditLog)
        .where(eq(s.auditLog.action, 'calendar.publish_version')),
    );
    expect(audits.length).toBeGreaterThan(0);
  });

  it('adds and removes Project days via append-only events and new versions', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    await prepareSchedulable(owner);

    const added = await addProjectNonWorkingDay(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      { projectId: PROBE.projectId, day: '2026-10-14' },
    );
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    const [ver] = await withTenant(app, PROBE.tenantId, async (tx) =>
      tx
        .select({ nonWorkingDays: s.holidayCalendarVersion.nonWorkingDays, seq: s.holidayCalendarVersion.seq })
        .from(s.holidayCalendarVersion)
        .where(eq(s.holidayCalendarVersion.projectId, PROBE.projectId))
        .orderBy(desc(s.holidayCalendarVersion.seq))
        .limit(1),
    );
    expect(ver?.nonWorkingDays).toContain('2026-10-14');
    const seqAfterAdd = ver!.seq;

    const dup = await addProjectNonWorkingDay(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      { projectId: PROBE.projectId, day: '2026-10-14' },
    );
    expect(dup.ok).toBe(false);

    const removed = await removeProjectNonWorkingDay(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      { projectId: PROBE.projectId, day: '2026-10-14' },
    );
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;

    const [ver2] = await withTenant(app, PROBE.tenantId, async (tx) =>
      tx
        .select({ nonWorkingDays: s.holidayCalendarVersion.nonWorkingDays, seq: s.holidayCalendarVersion.seq })
        .from(s.holidayCalendarVersion)
        .where(eq(s.holidayCalendarVersion.projectId, PROBE.projectId))
        .orderBy(desc(s.holidayCalendarVersion.seq))
        .limit(1),
    );
    expect(ver2!.seq).toBeGreaterThan(seqAfterAdd);
    expect(ver2?.nonWorkingDays).not.toContain('2026-10-14');

    const events = await withTenant(app, PROBE.tenantId, async (tx) =>
      tx
        .select({ effect: s.calendarDayEvent.effect })
        .from(s.calendarDayEvent)
        .where(eq(s.calendarDayEvent.projectId, PROBE.projectId)),
    );
    expect(events.map((e) => e.effect).sort()).toEqual(['add', 'remove']);
  });

  it('fan-out publishes serially and continues after a failure', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    await prepareSchedulable(owner, PROBE);

    const fan = await publishCalendarVersionFanOut(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        projectIds: [PROBE.projectId, 'missing-project'],
        reason: 'national dataset correction',
      },
    );
    expect(fan.ok).toBe(true);
    if (!fan.ok) return;
    expect(fan.value.results).toHaveLength(2);
    expect(fan.value.results[0]?.status).toBe('ok');
    expect(fan.value.results[1]?.status).toBe('failed');
  });

  it('publish alone appends a version with dataset provenance', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    await prepareSchedulable(owner);
    const result = await publishCalendarVersion(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      { projectId: PROBE.projectId, reason: 'operator extend' },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.calendarVersionSeq).toBeGreaterThan(0);
    expect(result.value.run.kind === 'scheduled' || result.value.run.kind === 'halted').toBe(true);
  });

  it('when calendar publish moves WP dates, at least one WP carries FR-28 cause calendar changed', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    const leaf = await prepareSchedulable(owner);

    // First run: establish prevInputs / prevOutputs so FR-28 can name a move cause.
    const first = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'patch_duration',
        projectId: PROBE.projectId,
        wpId: leaf.id,
        durationDays: 5,
      },
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.kind).toBe('scheduled');
    const finishBefore = first.value.outputs?.wps.find((w) => w.wpId === leaf.id)?.earlyFinish;
    expect(finishBefore).toBeTruthy();

    // Punch a hole in the leaf's working span (dataDate 2026-10-05 Mon + duration 5 →
    // mid-week). Making Wednesday non-working shifts early finish → calendar changed.
    const published = await addProjectNonWorkingDay(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      { projectId: PROBE.projectId, day: '2026-10-07' },
    );
    expect(published.ok).toBe(true);
    if (!published.ok) return;
    expect(published.value.run.kind).toBe('scheduled');
    expect(published.value.run.outputs).not.toBeNull();

    const runs = await withTenant(app, PROBE.tenantId, async (tx) =>
      tx
        .select({ cause: s.scheduleRun.cause })
        .from(s.scheduleRun)
        .where(eq(s.scheduleRun.projectId, PROBE.projectId))
        .orderBy(desc(s.scheduleRun.seq))
        .limit(1),
    );
    expect(runs[0]?.cause).toBe('calendar');

    const leafOut = published.value.run.outputs!.wps.find((w) => w.wpId === leaf.id);
    expect(leafOut?.earlyFinish).not.toBe(finishBefore);
    expect(leafOut?.cause).toBe('calendar changed');
    expect(
      published.value.run.outputs!.wps.some((w) => w.cause === 'calendar changed'),
    ).toBe(true);
  });

  it('toggling both national flags off publishes weekends (+ project days) only', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    await prepareSchedulable(owner);

    const result = await patchNationalCalendarFlags(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      { projectId: PROBE.projectId, calendarJp: false, calendarVn: false },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [ver] = await withTenant(app, PROBE.tenantId, async (tx) =>
      tx
        .select({
          nonWorkingDays: s.holidayCalendarVersion.nonWorkingDays,
          nationalSets: s.holidayCalendarVersion.nationalSets,
        })
        .from(s.holidayCalendarVersion)
        .where(eq(s.holidayCalendarVersion.projectId, PROBE.projectId))
        .orderBy(desc(s.holidayCalendarVersion.seq))
        .limit(1),
    );
    expect(ver?.nationalSets).toEqual([]);
    expect(ver?.nonWorkingDays).not.toContain('2026-01-01'); // JP New Year (Thu)
    expect(ver?.nonWorkingDays).toContain('2026-10-10'); // Saturday
  });
});
