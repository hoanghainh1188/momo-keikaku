import { v7 } from 'uuid';
import type { Clock } from './clock';

/**
 * App-generated UUIDv7 ids (ARCHITECTURE-SPINE: "IDs are app-generated UUIDv7") — the adapter
 * behind `packages/app`'s `IdGenerator` port, which it satisfies structurally.
 *
 * Version 7 because its leading 48 bits are the Unix millisecond, so ids sort roughly by creation
 * and index well; the rest is random. The millisecond comes from the `Clock` it is given, never
 * from `uuid`'s own `Date.now()` (AD-15: wall time only through the Clock), so a fixture-mode
 * clock also governs the ids. The composition root wires this in; tests hand the use cases a
 * predictable generator instead.
 */
export function uuidV7IdsOn(clock: Pick<Clock, 'nowMs'>): { next(): string } {
  return { next: (): string => v7({ msecs: clock.nowMs() }) };
}
