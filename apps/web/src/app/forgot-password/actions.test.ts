import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The forgot-password server action (story 1.4 slice 4), with the composition root mocked: the
 * email is lowercased and trimmed BEFORE the binding sees it, and every outcome — a well-formed
 * email whatever the binding does with it, and a malformed one that never reaches the binding at
 * all — redirects to the same `?sent=1` (NFR-S5's one generic answer).
 */
const requestPasswordReset = vi.hoisted(() => vi.fn(async (_email: string) => {}));

vi.mock('@/server/composition', () => ({ requestPasswordReset }));

const { requestReset } = await import('./actions');

/** Where a server action redirected (`next/navigation` throws a NEXT_REDIRECT error). */
async function redirectedTo(action: () => Promise<unknown>): Promise<string> {
  const digest = await action().then(
    () => 'returned',
    (error: { digest?: string }) => error.digest ?? 'no digest',
  );
  const match = /^NEXT_REDIRECT;[a-z]+;(.*);\d+;?$/.exec(digest);
  if (match === null) throw new Error(`expected a redirect, got ${digest}`);
  return match[1]!;
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

beforeEach(() => {
  requestPasswordReset.mockReset();
});

describe('the forgot-password action', () => {
  it('lowercases and trims the email at the boundary before it reaches the binding', async () => {
    expect(await redirectedTo(() => requestReset(form({ email: ' Hoang@Momo-Digital.Example ' })))).toBe(
      '/forgot-password?sent=1',
    );
    expect(requestPasswordReset).toHaveBeenCalledWith('hoang@momo-digital.example');
  });

  it('reaches the same generic outcome for an unknown email as for a known one', async () => {
    expect(await redirectedTo(() => requestReset(form({ email: 'nobody@example.test' })))).toBe(
      '/forgot-password?sent=1',
    );
    expect(requestPasswordReset).toHaveBeenCalledWith('nobody@example.test');
  });

  it('reaches the same outcome for a malformed submission too, without calling the binding', async () => {
    for (const fields of [{ email: '' }, { email: '   ' }, {}] as Record<string, string>[]) {
      requestPasswordReset.mockClear();
      expect(await redirectedTo(() => requestReset(form(fields)))).toBe('/forgot-password?sent=1');
      expect(requestPasswordReset).not.toHaveBeenCalled();
    }
  });

  it('refuses an oversized email without calling the binding', async () => {
    requestPasswordReset.mockClear();
    expect(
      await redirectedTo(() => requestReset(form({ email: `${'a'.repeat(250)}@b.cd` }))),
    ).toBe('/forgot-password?sent=1');
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });
});
