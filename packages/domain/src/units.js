export const H = 1000n;
/** A ratio, unreduced. Refuses a zero denominator: callers decide "unavailable" before this. */
export function ratio(num, den) {
    if (den === 0n)
        throw new RangeError(`ratio ${num}/0 has a zero denominator`);
    return { num, den };
}
export const ZERO = { num: 0n, den: 1n };
export const ONE = { num: 1n, den: 1n };
const abs = (x) => (x < 0n ? -x : x);
function gcd(a, b) {
    let x = abs(a);
    let y = abs(b);
    while (y !== 0n)
        [x, y] = [y, x % y];
    return x;
}
/** The only way a ratio is ever reduced — explicitly. The sign is carried on `num`. */
export function reduce(r) {
    const g = gcd(r.num, r.den) || 1n;
    const sign = r.den < 0n ? -1n : 1n;
    return { num: (sign * r.num) / g, den: (sign * r.den) / g };
}
/**
 * `n / d` to the nearest integer, ties to even. Exact for every sign combination.
 * One of AD-4's two sanctioned integer steps (see the header).
 */
export function divRoundHalfEven(n, d) {
    if (d === 0n)
        throw new RangeError(`divRoundHalfEven(${n}, 0)`);
    const negative = n < 0n !== d < 0n;
    const an = abs(n);
    const ad = abs(d);
    let q = an / ad;
    const twiceRemainder = 2n * (an % ad);
    if (twiceRemainder > ad || (twiceRemainder === ad && q % 2n === 1n))
        q += 1n;
    return negative ? -q : q;
}
/** The ceiling of `n / d`. AD-27's whole-working-days step. */
export function ceilDiv(n, d) {
    if (d === 0n)
        throw new RangeError(`ceilDiv(${n}, 0)`);
    const q = n / d; // truncates toward zero
    const exact = q * d === n;
    return !exact && n < 0n === d < 0n ? q + 1n : q;
}
/**
 * Hours written as an exact decimal (at most three fraction digits) into milli-hours. Refuses
 * anything that would need rounding, so it can never be where precision is lost.
 */
export function hoursToMh(h) {
    // A number whose integer part is past 2^53 was already rounded before it got here.
    if (typeof h === 'number' && !(Math.abs(h) <= Number.MAX_SAFE_INTEGER)) {
        throw new RangeError(`hoursToMh: ${h} is not exactly representable; pass it as a string`);
    }
    const text = typeof h === 'number' ? String(h) : h.trim();
    const m = /^(-?)(\d+)(?:\.(\d{1,3}))?$/.exec(text);
    if (!m)
        throw new RangeError(`hoursToMh: ${text} is not an exact hour count to 1/1000 h`);
    const whole = BigInt(m[2]) * H + BigInt((m[3] ?? '').padEnd(3, '0'));
    return m[1] === '-' ? -whole : whole;
}
/** AD-4: hours × Rate, per ledger entry, then summed — half-even, from the exact product. */
export function costOf(mh, yenPerHour) {
    return divRoundHalfEven(mh * yenPerHour, H);
}
/**
 * AD-4: allocate `total` integer units across equal-share cells by largest remainder.
 * Every cell gets `floor(total / n)`; the `total % n` remainder units go to cells with the
 * largest fractional part. Equal shares share one fractional part, so remainders are assigned
 * by the declared tie-break: date ascending, then resource id ascending (stable on input order).
 * Returns amounts aligned to the input `cells` order; their sum equals `total`.
 */
export function allocateLargestRemainder(total, cells) {
    const n = cells.length;
    if (n === 0) {
        if (total !== 0n) {
            throw new RangeError(`allocateLargestRemainder(${total}, []): no cells for a non-zero total`);
        }
        return [];
    }
    if (total < 0n)
        throw new RangeError(`allocateLargestRemainder: negative total ${total}`);
    const nBig = BigInt(n);
    const quotient = total / nBig;
    const remainder = total % nBig;
    const order = cells
        .map((cell, index) => ({ cell, index }))
        .sort((a, b) => {
        if (a.cell.date !== b.cell.date)
            return a.cell.date < b.cell.date ? -1 : 1;
        if (a.cell.resourceId !== b.cell.resourceId) {
            return a.cell.resourceId < b.cell.resourceId ? -1 : 1;
        }
        return a.index - b.index;
    });
    const out = Array.from({ length: n }, () => quotient);
    for (let k = 0; k < Number(remainder); k += 1) {
        out[order[k].index] += 1n;
    }
    return out;
}
export function sum(xs) {
    let t = 0n;
    for (const x of xs)
        t += x;
    return t;
}
export const minBigint = (a, b) => (a < b ? a : b);
export const maxBigint = (a, b) => (a > b ? a : b);
/** A sort comparator for bigints (`Array.prototype.sort` needs a `number`). */
export const compareBigint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export const mhValue = (value, coverage = null) => ({
    kind: 'value',
    value,
    unit: 'mh',
    coverage,
});
export const ratioValue = (value, coverage = null) => ({
    kind: 'value',
    value,
    unit: 'ratio',
    coverage,
});
export const countValue = (value, coverage = null) => ({
    kind: 'value',
    value,
    unit: 'count',
    coverage,
});
export const unavailable = (reasonCode) => ({ kind: 'unavailable', reasonCode });
/** Extract the milli-hour amount from a value metric; throws if unavailable. */
export function mhAmount(m) {
    if (m.kind !== 'value') {
        throw new Error(`expected mh value, got unavailable (${m.reasonCode})`);
    }
    return m.value;
}
/** Soft extract — `0n` when unavailable (UI notes / money that already gated on the metric). */
export function mhAmountOrZero(m) {
    return m.kind === 'value' ? m.value : 0n;
}
