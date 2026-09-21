import { z } from 'zod';

/**
 * AD-4: THE ONE CODEC every `jsonb` read and write of a stored value goes through.
 *
 * `JSON.stringify` throws on a `bigint` and silently turns `NaN` into `null`, so a stored value
 * never meets it directly: `encode` turns a value into plain JSON — a `bigint` into its decimal
 * string, and therefore a `Ratio` into `{ den: string, num: string }` — and REFUSES anything it
 * could not give back exactly (a float, `NaN`, `undefined`, a `Date`, a `Map`...), naming the
 * path. `decode` is schema-driven, because a decimal string alone cannot say whether it was a
 * string or a `bigint`: the reader states the shape, with `bigintJson` and `ratioJson` below.
 *
 * CANONICAL FORM. `encode` sorts object keys, so equal values encode to equal JSON. That is a
 * convenience, not a guarantee about the column: `jsonb` reorders keys and renormalises
 * numbers, so "identical" always means identical once decoded, never identical column text.
 *
 * `stringify` is the only sanctioned `JSON.stringify` in non-test source (the lint fence in
 * `eslint.config.js`); it cannot meet a `bigint`, because it only ever sees `encode`'s output.
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export class CodecError extends Error {
  constructor(
    readonly path: string,
    reason: string,
  ) {
    super(`codec: ${path} ${reason}`);
    this.name = 'CodecError';
  }
}

const isPlainObject = (value: object): boolean => {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/** A value as canonical plain JSON, or a `CodecError` naming the first path it cannot carry. */
export function encode(value: unknown, path = '$'): Json {
  switch (typeof value) {
    case 'bigint':
      return value.toString();
    case 'string':
    case 'boolean':
      return value;
    case 'number':
      if (!Number.isSafeInteger(value)) {
        throw new CodecError(
          path,
          `is ${value}, which is not an exact integer; carry effort and money as bigint and a ratio as a Ratio`,
        );
      }
      return value === 0 ? 0 : value; // folds -0
    case 'undefined':
      throw new CodecError(path, 'is undefined; store null or omit the field');
    case 'object': {
      if (value === null) return null;
      if (Array.isArray(value)) return value.map((item, index) => encode(item, `${path}[${index}]`));
      if (!isPlainObject(value)) {
        throw new CodecError(path, `is a ${value.constructor?.name ?? 'non-plain object'}, which JSON cannot carry exactly`);
      }
      const out: { [key: string]: Json } = {};
      for (const key of Object.keys(value).sort()) {
        out[key] = encode((value as Record<string, unknown>)[key], `${path}.${key}`);
      }
      return out;
    }
    default:
      throw new CodecError(path, `is a ${typeof value}, which JSON cannot carry`);
  }
}

/** A `bigint` as stored: its decimal string. */
export const bigintJson = z
  .string()
  .regex(/^-?(0|[1-9][0-9]*)$/, 'not a decimal integer string')
  .transform((text) => BigInt(text));

/** A `Ratio` as stored: `{ num, den }` decimal strings, unreduced, `den` never zero. */
export const ratioJson = z
  .object({ num: bigintJson, den: bigintJson })
  .strict()
  .refine((r) => r.den !== 0n, 'a ratio may not have a zero denominator');

/** Reads stored JSON back through the shape the reader states. Throws naming the path. */
export function decode<S extends z.ZodType>(json: unknown, schema: S): z.output<S> {
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = ['$', ...(issue?.path ?? []).map((p) => (typeof p === 'number' ? `[${p}]` : `.${String(p)}`))].join('');
    throw new CodecError(path, `does not decode: ${issue?.message ?? 'invalid'}`);
  }
  return parsed.data;
}

/** Canonical JSON text. The one sanctioned `JSON.stringify` in non-test source. */
export const stringify = (value: unknown): string => JSON.stringify(encode(value));

/** The inverse of `stringify`, through the shape the reader states. */
export const parse = <S extends z.ZodType>(text: string, schema: S): z.output<S> =>
  decode(JSON.parse(text) as unknown, schema);
