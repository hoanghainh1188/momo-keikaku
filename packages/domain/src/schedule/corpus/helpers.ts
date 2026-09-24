import type { IsoDate } from '../../calendar';
import type {
  NotSchedulableReason,
  ScheduleState,
  WpScheduleOutput,
} from '../recalculate';

/** A leaf (or summary) row for a hand-pinned expected `ScheduleOutputs`. */
export function out(
  wpId: string,
  fields: {
    readonly state: ScheduleState | null;
    readonly earlyStart: IsoDate | null;
    readonly earlyFinish: IsoDate | null;
    readonly remainingDays: number | null;
    readonly lateStart?: IsoDate | null;
    readonly lateFinish?: IsoDate | null;
    readonly floatDays?: number | null;
    readonly isCritical?: boolean;
    readonly drivingPredecessors?: readonly string[];
    readonly notSchedulableReason?: NotSchedulableReason | null;
    readonly plannedMh?: bigint;
  },
): WpScheduleOutput {
  return {
    wpId,
    state: fields.state,
    earlyStart: fields.earlyStart,
    earlyFinish: fields.earlyFinish,
    remainingDays: fields.remainingDays,
    notSchedulableReason: fields.notSchedulableReason ?? null,
    plannedMh: fields.plannedMh ?? 0n,
    lateStart: fields.lateStart ?? null,
    lateFinish: fields.lateFinish ?? null,
    floatDays: fields.floatDays ?? null,
    isCritical: fields.isCritical ?? false,
    drivingPredecessors: fields.drivingPredecessors ?? [],
  };
}
