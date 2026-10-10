import { describe, expect, it } from 'vitest';
import { resolveLocale } from './index';
describe('resolveLocale', () => {
    it('maps ja variants to ja', () => {
        expect(resolveLocale('ja')).toBe('ja');
        expect(resolveLocale('ja-JP')).toBe('ja');
        expect(resolveLocale('JA')).toBe('ja');
    });
    it('falls back unknown locales to en', () => {
        expect(resolveLocale('en')).toBe('en');
        expect(resolveLocale('vi')).toBe('en');
        expect(resolveLocale(null)).toBe('en');
    });
});
