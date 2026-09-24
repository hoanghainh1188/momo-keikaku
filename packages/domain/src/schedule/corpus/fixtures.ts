/**
 * Fixture builders for the golden corpus cases. Kept inside `domain/schedule/corpus` so
 * case modules do not import `tests/support` (depcruise: no-test-or-tooling-in-source).
 * Mirrors the helpers in `tests/support/schedule-fixtures.ts`.
 */
import { addDays, isWeekend, type CalendarVersion, type IsoDate } from '../../calendar';
import type { Ratio } from '../../units';
import type { ScheduleEdge, ScheduleInputs, ScheduleWp } from '../recalculate';

export const PROJECT = 'prj-a';

/** A hand-built version: every weekend in range, plus `holidays`. */
export function calendar(rangeStart: IsoDate, rangeEnd: IsoDate, holidays: IsoDate[] = []): CalendarVersion {
  const nonWorkingDays: IsoDate[] = [...holidays];
  for (let d = rangeStart; d <= rangeEnd; d = addDays(d, 1)) if (isWeekend(d)) nonWorkingDays.push(d);
  return { nonWorkingDays, rangeStart, rangeEnd };
}

export const CAL = calendar('2026-09-01', '2027-12-31');

/** Synthetic JP: weekends + Wed 7 Oct 2026. */
export const CAL_JP = calendar('2026-09-01', '2027-12-31', ['2026-10-07']);

/** Synthetic VN: weekends + Tue 13 Oct 2026. */
export const CAL_VN = calendar('2026-09-01', '2027-12-31', ['2026-10-13']);

export interface WpSpec {
  parentId?: string | null;
  durationDays?: number | null;
  plannedMh?: bigint;
  actualStart?: IsoDate | null;
  actualFinish?: IsoDate | null;
  recordedPct?: Ratio | null;
  projectId?: string;
  constraintType?: ScheduleWp['constraintType'];
  constraintDate?: IsoDate | null;
}

export const wp = (id: string, spec: WpSpec = {}): ScheduleWp => ({
  id,
  wbsCode: id,
  projectId: spec.projectId ?? PROJECT,
  parentId: spec.parentId ?? null,
  durationDays: spec.durationDays === undefined ? 1 : spec.durationDays,
  plannedMh: spec.plannedMh ?? 0n,
  actualStart: spec.actualStart ?? null,
  actualFinish: spec.actualFinish ?? null,
  recordedPct: spec.recordedPct ?? null,
  constraintType: spec.constraintType ?? 'asap',
  constraintDate: spec.constraintDate ?? null,
});

export const edge = (predecessorId: string, successorId: string, lagDays = 0): ScheduleEdge => ({
  predecessorId,
  successorId,
  lagDays,
});

export function inputs(
  wps: ScheduleWp[],
  edges: ScheduleEdge[] = [],
  over: Partial<ScheduleInputs> = {},
): ScheduleInputs {
  return {
    projectId: PROJECT,
    wps,
    edges,
    projectStart: '2026-09-01',
    dataDate: '2026-10-05',
    projectFinish: null,
    calendar: CAL,
    ...over,
  };
}
