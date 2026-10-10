import { z } from 'zod';
export class CodecError extends Error {
    path;
    constructor(path, reason) {
        super(`codec: ${path} ${reason}`);
        this.path = path;
        this.name = 'CodecError';
    }
}
const isPlainObject = (value) => {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
};
/** A value as canonical plain JSON, or a `CodecError` naming the first path it cannot carry. */
export function encode(value, path = '$') {
    switch (typeof value) {
        case 'bigint':
            return value.toString();
        case 'string':
        case 'boolean':
            return value;
        case 'number':
            if (!Number.isSafeInteger(value)) {
                throw new CodecError(path, `is ${value}, which is not an exact integer; carry effort and money as bigint and a ratio as a Ratio`);
            }
            return value === 0 ? 0 : value; // folds -0
        case 'undefined':
            throw new CodecError(path, 'is undefined; store null or omit the field');
        case 'object': {
            if (value === null)
                return null;
            if (Array.isArray(value))
                return value.map((item, index) => encode(item, `${path}[${index}]`));
            if (!isPlainObject(value)) {
                throw new CodecError(path, `is a ${value.constructor?.name ?? 'non-plain object'}, which JSON cannot carry exactly`);
            }
            const out = {};
            for (const key of Object.keys(value).sort()) {
                out[key] = encode(value[key], `${path}.${key}`);
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
export function decode(json, schema) {
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const path = ['$', ...(issue?.path ?? []).map((p) => (typeof p === 'number' ? `[${p}]` : `.${String(p)}`))].join('');
        throw new CodecError(path, `does not decode: ${issue?.message ?? 'invalid'}`);
    }
    return parsed.data;
}
/** Canonical JSON text. The one sanctioned `JSON.stringify` in non-test source. */
export const stringify = (value) => JSON.stringify(encode(value));
/** The inverse of `stringify`, through the shape the reader states. */
export const parse = (text, schema) => decode(JSON.parse(text), schema);
