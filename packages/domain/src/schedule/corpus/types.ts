import type { ScheduleInputs, ScheduleOutputs } from '../recalculate';

/**
 * One golden scheduler corpus case: hand-computed `expected` outputs, never captured from the
 * implementation (story 2.8 / AD-27). `engineVersion` is the registry key CI re-derives under.
 */
export interface CorpusCase {
  readonly id: string;
  /** Short title matching the I/O matrix row. */
  readonly title: string;
  readonly engineVersion: string;
  /** Prose of the hand arithmetic a reviewer checks. */
  readonly note: string;
  readonly inputs: ScheduleInputs;
  readonly expected: ScheduleOutputs;
}
