import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The sign-in server action (story 1.4 slice 1), with the composition root mocked: the form is
 * validated before Better Auth is reached, every refusal is the same `{ refused: true }`, and a
 * success redirects to `/` (a NEXT_REDIRECT error, as `next/navigation` throws it).
 */
const signInWithEmail = vi.hoisted(() => vi.fn(async (_credentials: { email: string; password: string }) => false));

vi.mock('@/server/composition', () => ({ signInWithEmail, signOut: vi.fn() }));

const { signIn } = await import('./actions');

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const INITIAL = { refused: false };

beforeEach(() => {
  signInWithEmail.mockReset();
});

describe('the sign-in action', () => {
  it('returns refused, and does not redirect, when the binding refuses', async () => {
    signInWithEmail.mockResolvedValue(false);
    expect(await signIn(INITIAL, form({ email: ' linh@momo-digital.example ', password: 'pw' }))).toEqual({
      refused: true,
    });
    expect(signInWithEmail).toHaveBeenCalledWith({ email: 'linh@momo-digital.example', password: 'pw' });
  });

  it('refuses empty, missing or oversized fields without calling the binding', async () => {
    for (const fields of <Record<string, string>[]>[
      { email: '', password: 'pw' },
      { email: '   ', password: 'pw' },
      { email: 'a@b.c', password: '' },
      { email: 'a@b.c' },
      { email: `${'a'.repeat(250)}@b.cd`, password: 'pw' },
      { email: 'a@b.c', password: 'p'.repeat(129) },
    ]) {
      expect(await signIn(INITIAL, form(fields)), JSON.stringify(fields).slice(0, 60)).toEqual({ refused: true });
    }
    expect(signInWithEmail).not.toHaveBeenCalled();
  });

  it('redirects to / on success', async () => {
    signInWithEmail.mockResolvedValue(true);
    const outcome = await signIn(INITIAL, form({ email: 'linh@momo-digital.example', password: 'pw' })).then(
      () => 'returned',
      (error: { digest?: string }) => error.digest,
    );
    expect(outcome).toMatch(/^NEXT_REDIRECT;[a-z]+;\/;/);
  });
});
