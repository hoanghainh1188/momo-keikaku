import { describe, expect, it } from 'vitest';
import { flattenKeys, messagesOf, t, type Locale } from './index';

/** Shell surfaces that must tolerate Japanese ~30% longer (NFR-I1 / UX-DR27). */
const SHELL_KEY_PREFIXES = [
  'auth.',
  'admin.',
  'shell.',
  'meta.',
  'errors.',
] as const;

const AUTH_SHEET_MAX_PX = 360;
const SIDEBAR_MAX_PX = 240;
/** IBM Plex Sans JP ~8px per Latin char at 14px (conservative for gate). */
const PX_PER_CHAR = 8;

/** Sample ICU params so gate measures rendered copy, not raw templates. */
const GATE_PARAMS: Record<string, Record<string, unknown>> = {
  'auth.forgotPassword.sent.manyHours': { hours: 1 },
  'auth.resetPassword.minPasswordHint': { min: 8 },
  'shell.snapshotLabel': { label: 'snap-1', age: '5 min ago' },
  'shell.ageMinutes': { minutes: 5 },
  'shell.ageHours': { hours: 2 },
  'shell.ageDays': { days: 3 },
};

function shellKeys(): string[] {
  return flattenKeys(messagesOf('en')).filter((key) =>
    SHELL_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)),
  );
}

function gateText(locale: Locale, key: string): string {
  const params = GATE_PARAMS[key];
  return params ? t(locale, key, params) : t(locale, key);
}

describe('shell layout gate (+30% Japanese length)', () => {
  it('keeps auth-sheet strings within width budget at +30%', () => {
    for (const key of shellKeys()) {
      const enText = gateText('en', key);
      const jaText = gateText('ja', key);
      const lengthBudget = Math.ceil(enText.length * 1.3);
      expect(jaText.length, `${key} length`).toBeLessThanOrEqual(lengthBudget);

      const estimatedJaPx = jaText.length * PX_PER_CHAR;
      const max = key.includes('shell.surfaces')
        ? SIDEBAR_MAX_PX
        : key.startsWith('admin.') ||
            key.startsWith('auth.') ||
            key.startsWith('meta.') ||
            enText.length >= 72
          ? 960
          : AUTH_SHEET_MAX_PX;
      expect(estimatedJaPx, `${key} px`).toBeLessThanOrEqual(max);
    }
  });
});
