import { describe, expect, it } from 'vitest';
import { buildResetPasswordMail, renderMail, t } from './index';
describe('renderMail', () => {
    it('renders reset mail copy with ICU plural', () => {
        const text = renderMail({
            locale: 'en',
            key: 'mail.resetPassword.body.expiry',
            params: { hours: 1 },
        });
        expect(text).toContain('1 hour');
    });
    it('falls back to en for an unknown locale', () => {
        expect(t('xx', 'errors.not_found')).toBe(t('en', 'errors.not_found'));
    });
    it('renders reset mail in ja when locale is ja-JP', () => {
        const mail = buildResetPasswordMail('ja-JP', { to: 'a@b.c', link: 'https://x/y' }, 1);
        expect(mail.subject).toBe(t('ja', 'mail.resetPassword.subject'));
        expect(mail.text).toContain('https://x/y');
    });
});
