import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ratio } from '../units';
import { bigintJson, CodecError, decode, encode, parse, ratioJson, stringify } from './codec';
describe('the jsonb codec (AD-4)', () => {
    const schema = z.object({ a: bigintJson, r: ratioJson });
    it('round-trips a bigint and an unreduced Ratio exactly, through decimal strings', () => {
        const value = { a: 2n ** 63n - 1n, r: ratio(3n, 9n) };
        const encoded = encode(value);
        expect(encoded).toEqual({ a: '9223372036854775807', r: { den: '9', num: '3' } });
        const decoded = decode(encoded, schema);
        expect(decoded).toEqual(value);
        expect(decoded.r).toEqual({ num: 3n, den: 9n }); // still 3/9, never reduced
    });
    it('is canonical: equal values encode to the same text whatever their key order', () => {
        expect(stringify({ b: 1, a: [2n, 'x', null, true] })).toBe('{"a":["2","x",null,true],"b":1}');
        expect(stringify({ a: 1, b: 2 })).toBe(stringify({ b: 2, a: 1 }));
        expect(parse(stringify({ a: 5n, r: ratio(-1n, 2n) }), schema)).toEqual({ a: 5n, r: ratio(-1n, 2n) });
    });
    it('carries the audit payloads the writes record, unchanged', () => {
        const payload = { ticketIds: ['t1', 't2'], wpId: null, note: 'n' };
        expect(encode(payload)).toEqual(payload);
    });
    it.each([
        ['a float', { share: 0.5 }, '$.share'],
        ['NaN', { x: [1, Number.NaN] }, '$.x[1]'],
        ['Infinity', { x: Number.POSITIVE_INFINITY }, '$.x'],
        ['an undefined field', { a: { b: undefined } }, '$.a.b'],
        ['a Date', { at: new Date(0) }, '$.at'],
        ['a Map', { m: new Map() }, '$.m'],
        ['an unsafe integer', { n: 2 ** 53 }, '$.n'],
    ])('refuses %s, naming the path', (_label, value, path) => {
        expect(() => encode(value)).toThrow(CodecError);
        expect(() => encode(value)).toThrow(`codec: ${path} `);
    });
    it('refuses to decode what the reader did not ask for, naming the path', () => {
        expect(() => decode({ a: '1.5', r: { num: '1', den: '2' } }, schema)).toThrow('codec: $.a ');
        expect(() => decode({ a: '1', r: { num: '1', den: '0' } }, schema)).toThrow(/zero denominator/);
        expect(() => decode({ a: 1, r: { num: '1', den: '2' } }, schema)).toThrow('codec: $.a ');
    });
});
