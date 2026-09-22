import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The reset-password server action (story 1.4 slice 4), with the composition root mocked: a
 * success redirects to `/sign-in`; every refusal — a malformed submission, an invalid or expired
 * token, a password Better Auth refuses — redirects back to the SAME page with the SAME token and
 * one generic `?refused=1`.
 */
const resetPassword = vi.hoisted(() =>
  vi.fn(async (_input: { token: string; password: string }) => true),
);

vi.mock('@/server/composition', () => ({ resetPassword }));

const { submitReset } = await import('./actions');
const { tokenOf } = await import('./reset-token');

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
  resetPassword.mockReset();
});

describe('the reset-password action', () => {
  it('redirects to /sign-in on success, and only then', async () => {
    resetPassword.mockResolvedValue(true);
    expect(
      await redirectedTo(() => submitReset(form({ token: 'tok-1', password: 'new-password' }))),
    ).toBe('/sign-in');
    expect(resetPassword).toHaveBeenCalledWith({ token: 'tok-1', password: 'new-password' });
  });

  it('redirects back to this page, with the same token and ?refused=1, when the binding refuses', async () => {
    resetPassword.mockResolvedValue(false);
    expect(
      await redirectedTo(() => submitReset(form({ token: 'tok-2', password: 'new-password' }))),
    ).toBe('/reset-password?token=tok-2&refused=1');
  });

  it('refuses an empty or missing password before calling the binding', async () => {
    for (const fields of <Record<string, string>[]>[{ token: 'tok-3', password: '' }, { token: 'tok-3' }]) {
      resetPassword.mockClear();
      expect(await redirectedTo(() => submitReset(form(fields)))).toBe(
        '/reset-password?token=tok-3&refused=1',
      );
      expect(resetPassword).not.toHaveBeenCalled();
    }
  });

  it('refuses an oversized password before calling the binding', async () => {
    expect(
      await redirectedTo(() => submitReset(form({ token: 'tok-4', password: 'p'.repeat(129) }))),
    ).toBe('/reset-password?token=tok-4&refused=1');
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('refuses a missing token before calling the binding, without inventing one in the redirect', async () => {
    expect(await redirectedTo(() => submitReset(form({ password: 'new-password' })))).toBe(
      '/reset-password?token=&refused=1',
    );
    expect(resetPassword).not.toHaveBeenCalled();
  });
});

describe('tokenOf', () => {
  it('reads a plain string, the first of a repeated one, or the empty string when absent', () => {
    expect(tokenOf('tok-1')).toBe('tok-1');
    expect(tokenOf(['tok-a', 'tok-b'])).toBe('tok-a');
    expect(tokenOf(undefined)).toBe('');
    expect(tokenOf([])).toBe('');
  });
});
