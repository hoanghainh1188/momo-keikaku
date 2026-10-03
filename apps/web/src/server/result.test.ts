import { describe, expect, it } from 'vitest';
import type { Result } from '@momo/app';
import { valueOrNotFound, writeLanded } from './result';

/**
 * The seven project pages' error arm. Without this, `valueOrNotFound` regressing from Next's
 * 404 to a thrown 500 — or to rendering a default — would pass every gate, because `apps/web`
 * has no other test.
 *
 * The Results are built as literals: `packages/app` keeps `ok`/`fail` internal, so an inbound
 * adapter (and its test) cannot fabricate a use case's answer with them.
 */

/** What Next 15's `notFound()` throws: an error whose digest routes the request to a 404. */
const NOT_FOUND_DIGEST = 'NEXT_HTTP_ERROR_FALLBACK;404';

function digestOf(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return (error as { digest?: unknown }).digest;
  }
  throw new Error('expected valueOrNotFound to throw, and it returned');
}

describe('valueOrNotFound', () => {
  it('returns the ok value unchanged', () => {
    const value = { marker: 'bundle' };
    const result: Result<typeof value> = { ok: true, value };
    expect(valueOrNotFound(result)).toBe(value);
  });

  it.each([
    ['not_found', { code: 'not_found', messageKey: 'errors.not_found' }],
    [
      'invalid_input',
      { code: 'invalid_input', messageKey: 'errors.invalid_input', details: { projectId: ['custom'] } },
    ],
  ] as const)('throws Next\'s not-found error for %s', (_code, error) => {
    const result: Result<never> = { ok: false, error };
    expect(digestOf(() => valueOrNotFound(result))).toBe(NOT_FOUND_DIGEST);
  });
});

describe('writeLanded', () => {
  // The five write actions revalidate on `true` only. `false` for both codes is what keeps a
  // refused write from revalidating — and a throw here instead would turn an unusable form into
  // an error page, which it never was.
  it('is true for ok', () => {
    const result: Result<void> = { ok: true, value: undefined };
    expect(writeLanded(result)).toBe(true);
  });

  // Valued writers (e.g. setBaseline → Result<SetBaselineResult>) must typecheck the same way.
  it('is true for ok with a non-void value', () => {
    const result: Result<{ baselineVersionSeq: number }> = {
      ok: true,
      value: { baselineVersionSeq: 1 },
    };
    expect(writeLanded(result)).toBe(true);
  });

  it.each([
    ['not_found', { code: 'not_found', messageKey: 'errors.not_found' }],
    [
      'invalid_input',
      { code: 'invalid_input', messageKey: 'errors.invalid_input', details: { ticketIds: ['too_small'] } },
    ],
  ] as const)('is false, without throwing, for %s', (_code, error) => {
    const result: Result<void> = { ok: false, error };
    expect(writeLanded(result)).toBe(false);
  });
});
