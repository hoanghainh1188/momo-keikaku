import { getRequestConfig } from 'next-intl/server';
import { messagesOf } from '@momo/i18n';

/**
 * R0 renders English UI from the `en` catalog even when `auth_user.locale` is `ja`.
 * Locale cookie sync for mail and R1 UI lands in a follow-up; messages always come from `en` today.
 */
export default getRequestConfig(async () => {
  const locale = 'en';
  return { locale, messages: messagesOf(locale) };
});
