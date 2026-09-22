import { t, type Locale } from '@momo/i18n';
import type { AppErrorMessageKey } from '@momo/app';

/** Maps a use-case `messageKey` to catalog prose (AR-19). R0 UI locale is always `en`. */
export function messageFromKey(key: AppErrorMessageKey, locale: Locale = 'en'): string {
  return t(locale, key);
}
