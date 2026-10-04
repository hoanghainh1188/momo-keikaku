/**
 * Story 1.9 / UX-DR27: "every layout is checked with Japanese strings **30% longer** than the
 * English ones, because a layout that only fits English is an R1 refactor" (`epics.md:740`).
 *
 * WHAT THIS GATE USED TO DO. It asserted `ja.length <= ceil(en.length * 1.3)` — a CAP on the
 * Japanese catalog rather than an INFLATION of it — and the `ja` catalog is currently a
 * byte-identical English mirror (364 keys, 364 identical values). So the assertion reduced to
 * `n <= ceil(n * 1.3)`, true for every n, and the width check measured the English string. The
 * gate could not fail, including if the layouts fitted nothing at all. Epic 1 retrospective, F23.
 *
 * WHAT IT DOES NOW. It builds the stressed string the criterion describes — the Japanese text
 * padded with full-width kana to 130% of the English length — and checks THAT against the width
 * budget. Turning the gate on measured eight strings over budget; they are named in
 * `KNOWN_OVERFLOW` below with the width they actually need, and the list is exact in both
 * directions: a key not on it must fit, and a key on it that starts fitting fails the gate until
 * it is removed. So the list can only shrink.
 *
 * WHAT IT STILL DOES NOT DO. It is character arithmetic, not rendering: no font, no wrapping, no
 * screenshot. `PX_PER_CHAR` also charges a full-width kana the same 8px as a Latin character,
 * which understates real Japanese width. Both are recorded in `deferred-work.md`; the visual
 * check belongs with the Project/Client layout gate deferred to story 2.2.
 */
import { describe, expect, it } from 'vitest';
import { flattenKeys, messagesOf, t, type Locale } from './index';

/** Shell surfaces that must tolerate Japanese ~30% longer (NFR-I1 / UX-DR27). */
const SHELL_KEY_PREFIXES = ['auth.', 'admin.', 'shell.', 'meta.', 'errors.'] as const;

const AUTH_SHEET_MAX_PX = 360;
const SIDEBAR_MAX_PX = 240;
const WIDE_MAX_PX = 960;
/** IBM Plex Sans JP ~8px per Latin char at 14px (conservative for gate). */
const PX_PER_CHAR = 8;

/** How much longer than the English the stressed Japanese string must be. */
const STRESS_RATIO = 1.3;

/**
 * Padding for the stressed string. A real kana rather than a Latin filler, so the stressed text
 * is at least made of the script it stands in for.
 */
const PAD_CHAR = 'あ';

/** Sample ICU params so gate measures rendered copy, not raw templates. */
const GATE_PARAMS: Record<string, Record<string, unknown>> = {
  'auth.forgotPassword.sent.manyHours': { hours: 1 },
  'auth.resetPassword.minPasswordHint': { min: 8 },
  'shell.snapshotLabel': { label: 'snap-1', age: '5 min ago' },
  'shell.ageMinutes': { minutes: 5 },
  'shell.ageHours': { hours: 2 },
  'shell.ageDays': { days: 3 },
  'admin.org.rename_named': { name: 'Delivery' },
  'admin.org.reassign_program_named': { name: 'EC Phase 2' },
  'admin.org.reassign_department_named': { name: 'EC Phase 2' },
};

/**
 * The strings that do NOT fit at +30%, with the width each one actually needs.
 *
 * Every entry is a real gap, measured when this gate was corrected — not a waiver. Each is either
 * copy to shorten or a layout to widen, and until one of those happens the number here stops it
 * getting worse. Remove an entry when its key fits; the gate fails if a listed key no longer
 * needs its exemption, so this list cannot rot.
 */
const KNOWN_OVERFLOW: Readonly<Record<string, number>> = {
  'shell.surfaces.mapping.title': 304,
  'errors.invalid_input': 408,
  'shell.snapshotPinTitle': 448,
  'shell.the_tracker_snapshot_this_view_is_pinned_to': 448,
  'auth.forgotPassword.sent.manyHours': 968,
  'auth.forgotPassword.sent.oneHour': 968,
  'auth.noAccess.you_are_signed_in_but_no_workspace_can_be_opened': 984,
  'auth.resetPassword.that_did_not_work_the_link_may_have_been_used_al': 1120,
  // Story 5.4: pin popover slowdown reason — wide caption, not auth-sheet width.
  'shell.scheduleSlowdown': 1304,
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

/**
 * The Japanese string the criterion asks the layout to survive: the real `ja` copy, padded to
 * 130% of the English length. When `ja` carries real translations this pads less, or not at all
 * once a translation is already that long — the target is a floor on length, not a rewrite.
 */
function stressedJapanese(enText: string, jaText: string): string {
  const target = Math.ceil(enText.length * STRESS_RATIO);
  if (jaText.length >= target) return jaText;
  return jaText + PAD_CHAR.repeat(target - jaText.length);
}

function budgetFor(key: string, enText: string): number {
  if (key.includes('shell.surfaces')) return SIDEBAR_MAX_PX;
  const wide =
    key.startsWith('admin.') ||
    key.startsWith('auth.') ||
    key.startsWith('meta.') ||
    enText.length >= 72;
  return wide ? WIDE_MAX_PX : AUTH_SHEET_MAX_PX;
}

describe('shell layout gate (+30% Japanese length)', () => {
  it('fits every shell string at 130% of its English length', () => {
    const unexpected: string[] = [];

    for (const key of shellKeys()) {
      const enText = gateText('en', key);
      const stressed = stressedJapanese(enText, gateText('ja', key));

      expect(
        stressed.length,
        `${key}: the stressed string must actually be 30% longer than the English`,
      ).toBeGreaterThanOrEqual(Math.ceil(enText.length * STRESS_RATIO));

      const px = stressed.length * PX_PER_CHAR;
      const budget = budgetFor(key, enText);
      const allowed = KNOWN_OVERFLOW[key] ?? budget;

      if (px > allowed) {
        unexpected.push(
          `${key}: needs ${px}px at +30%, ${key in KNOWN_OVERFLOW ? 'recorded' : 'budget'} ` +
            `${allowed}px (en ${enText.length} chars)`,
        );
      }
    }

    expect(
      unexpected,
      'these shell strings do not survive Japanese 30% longer than the English — shorten the ' +
        'copy, widen the surface, or record the measured width in KNOWN_OVERFLOW with a reason',
    ).toEqual([]);
  });

  /**
   * The exemption list is exact in the other direction too. Without this, a key whose copy got
   * shorter would keep a stale exemption and the gate would quietly stop checking it.
   */
  it('keeps no exemption a string no longer needs', () => {
    const stale: string[] = [];

    for (const [key, recorded] of Object.entries(KNOWN_OVERFLOW)) {
      const enText = gateText('en', key);
      const px = stressedJapanese(enText, gateText('ja', key)).length * PX_PER_CHAR;
      const budget = budgetFor(key, enText);

      if (px <= budget) stale.push(`${key}: now fits in ${budget}px — remove it from KNOWN_OVERFLOW`);
      else if (px < recorded) {
        stale.push(`${key}: now needs only ${px}px, not ${recorded}px — lower it in KNOWN_OVERFLOW`);
      }
    }

    expect(stale, 'KNOWN_OVERFLOW must shrink as the copy and the layouts improve').toEqual([]);
  });

  /**
   * Every listed key must still exist. A rename would otherwise leave a dead exemption behind and
   * the renamed key would be checked against the full budget with no one noticing the swap.
   */
  it('exempts only keys that are still in the catalog', () => {
    const known = new Set(shellKeys());
    for (const key of Object.keys(KNOWN_OVERFLOW)) {
      expect(known.has(key), `${key} is exempted but is no longer a shell key`).toBe(true);
    }
  });
});
