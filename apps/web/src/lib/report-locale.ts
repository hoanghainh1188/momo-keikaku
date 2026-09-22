/** R0 UI locale for `@momo/domain/present` and `Intl` formatters on web surfaces. */
export const REPORT_LOCALE = 'en' as const;

/** Project report dates (Asia/Tokyo wall calendar). */
export function formatReportDate(iso: string, locale: string = REPORT_LOCALE): string {
  const tag = locale === 'ja' ? 'ja-JP' : 'en-GB';
  return new Date(iso).toLocaleDateString(tag, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Tokyo',
  });
}
