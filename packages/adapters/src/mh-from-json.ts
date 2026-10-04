/**
 * Integer JSON milli-hours as `bigint`, refusing non-safe integers (AD-4).
 * Kept local to adapters so fixture-replay does not import the database package.
 */
export function mhFromJsonNumber(n: number): bigint {
  if (!Number.isSafeInteger(n)) {
    throw new RangeError(
      `fixture value ${n} is not a safe integer, so it cannot be carried exactly`,
    );
  }
  return BigInt(n);
}
