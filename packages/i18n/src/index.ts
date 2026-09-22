import { createTranslator } from 'use-intl/core';
import en from './messages/en.json';
import ja from './messages/ja.json';

/** Supported locales for catalogs and mail (R0 UI stays English regardless). */
export const LOCALES = ['en', 'ja'] as const;
export type Locale = (typeof LOCALES)[number];

export type Messages = typeof en;

const CATALOGS: Record<Locale, Messages> = { en, ja };

/** Normalises a stored locale to a catalog locale; unknown values fall back to `en`. */
export function resolveLocale(locale: string | null | undefined): Locale {
  if (locale == null || locale === '') return 'en';
  const norm = locale.trim().toLowerCase();
  if (norm === 'ja' || norm.startsWith('ja-')) return 'ja';
  return 'en';
}

/** Flatten nested messages to dotted keys for parity checks. */
export function flattenKeys(messages: unknown, prefix = ''): string[] {
  if (messages === null || typeof messages !== 'object' || Array.isArray(messages)) {
    return prefix ? [prefix] : [];
  }
  const keys: string[] = [];
  for (const [key, value] of Object.entries(messages as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') keys.push(path);
    else keys.push(...flattenKeys(value, path));
  }
  return keys.sort();
}

export function messagesOf(locale: Locale): Messages {
  return CATALOGS[locale];
}

function translatorFor(locale: Locale) {
  const effective = resolveLocale(locale);
  return createTranslator({ locale: effective, messages: messagesOf(effective) });
}

/**
 * Looks up a catalog string. Unknown locale falls back to `en`. Missing keys throw so CI
 * catches drift between code and catalogs.
 */
export function t(locale: Locale | string, key: string, values?: Record<string, unknown>): string {
  const tr = translatorFor(resolveLocale(locale));
  // Catalog keys are validated by the key-parity test; runtime lookup stays stringly for dotted paths.
  return tr(key as never, values as never);
}

export interface RenderMailInput {
  readonly locale: string | null | undefined;
  readonly key: string;
  readonly params?: Record<string, unknown>;
}

/** Pure mail renderer — same ICU engine as next-intl (`use-intl`). */
export function renderMail({ locale, key, params }: RenderMailInput): string {
  return t(resolveLocale(locale), key, params);
}

export interface ResetPasswordMailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

/** Password-reset mail body, rendered in the user's locale (story 1.4 / 1.9). */
export function buildResetPasswordMail(
  locale: string,
  input: { readonly to: string; readonly link: string },
  hours: number,
): ResetPasswordMailMessage {
  const loc = resolveLocale(locale);
  const subject = t(loc, 'mail.resetPassword.subject');
  const intro = t(loc, 'mail.resetPassword.body.intro');
  const linkLine = t(loc, 'mail.resetPassword.body.linkLine', { link: input.link });
  const expiry = t(loc, 'mail.resetPassword.body.expiry', { hours });
  return {
    to: input.to,
    subject,
    text: [intro, '', linkLine, '', expiry].join('\n'),
  };
}

export { en, ja };
