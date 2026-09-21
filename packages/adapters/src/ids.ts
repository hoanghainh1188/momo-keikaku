import { v7 } from 'uuid';
import type { Clock } from './clock';

/** `v7`'s `seq` is a 32-bit counter; a fresh millisecond starts it in the lower half. */
const SEQ_SPAN = 2 ** 32;

/** A random 31-bit start for a millisecond's `seq`, leaving the upper half for increments. */
function randomSeqSeed(): number {
  return (globalThis.crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) >>> 1;
}

/**
 * App-generated UUIDv7 ids (ARCHITECTURE-SPINE: "IDs are app-generated UUIDv7") — the adapter
 * behind `packages/app`'s `IdGenerator` port, which it satisfies structurally.
 *
 * Version 7 because its leading 48 bits are the Unix millisecond, so ids sort by creation and
 * index well. The millisecond comes from the `Clock` it is given, never from `uuid`'s own
 * `Date.now()` (AD-15: wall time only through the Clock), so a fixture-mode clock also governs
 * the ids. The composition root wires this in; tests hand the use cases a predictable generator.
 *
 * Monotonic: passing `msecs` makes `uuid` skip its own monotonic state and draw a random `seq`,
 * so ids minted in one Clock millisecond — every id, under a fixed fixture clock — would sort
 * randomly. The generator therefore keeps that state itself (RFC 9562 §6.2, method 1): a new
 * millisecond seeds `seq` at random in the lower half of its range; the same or an earlier one
 * (a clock stepping back) keeps the last millisecond and increments `seq`, carrying into the
 * millisecond when `seq` overflows. Each id is thus greater than the one before it.
 */
export function uuidV7IdsOn(clock: Pick<Clock, 'nowMs'>): { next(): string } {
  let lastMs = -Infinity;
  let seq = 0;
  return {
    next: (): string => {
      const ms = clock.nowMs();
      if (ms > lastMs) {
        lastMs = ms;
        seq = randomSeqSeed();
      } else {
        seq += 1;
        if (seq >= SEQ_SPAN) {
          seq = 0;
          lastMs += 1;
        }
      }
      return v7({ msecs: lastMs, seq });
    },
  };
}
