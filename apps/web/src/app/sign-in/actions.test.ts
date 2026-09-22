import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The sign-in server action (story 1.4 slice 1), with the composition root mocked: the form is
 * validated before Better Auth is reached, every refusal is the same `{ refused: true }`, and a
 * success redirects to `/` (a NEXT_REDIRECT error, as `next/navigation` throws it).
 */
const signInWithEmail = vi.hoisted(() => vi.fn(async (_credentials: { email: string; password: string }) => false));
const googleSignIn = vi.hoisted(() => vi.fn(async (): Promise<string | null> => null));

vi.mock('@/server/composition', () => ({ signInWithEmail, googleSignIn, signOut: vi.fn() }));

const { signIn, signInWithGoogle } = await import('./actions');
const { isGoogleRefusal } = await import('./google-refusal');

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

const INITIAL = { refused: false };

beforeEach(() => {
  signInWithEmail.mockReset();
  googleSignIn.mockReset();
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

describe('the Google sign-in action (story 1.4 slice 3)', () => {
  it('redirects to the provider URL the binding answers', async () => {
    googleSignIn.mockResolvedValue('http://127.0.0.1:4455/authorize?client_id=x&state=s');
    expect(await redirectedTo(() => signInWithGoogle())).toBe('http://127.0.0.1:4455/authorize?client_id=x&state=s');
  });

  it('lands on the one refusal when Google cannot start', async () => {
    googleSignIn.mockResolvedValue(null);
    expect(await redirectedTo(() => signInWithGoogle())).toBe('/sign-in?google=refused');
  });
});

describe('isGoogleRefusal', () => {
  it('reads google=refused as a string or among repeated values, and nothing else', () => {
    expect(isGoogleRefusal('refused')).toBe(true);
    expect(isGoogleRefusal(['x', 'refused'])).toBe(true);
    expect(isGoogleRefusal(undefined)).toBe(false);
    expect(isGoogleRefusal('')).toBe(false);
    expect(isGoogleRefusal('REFUSED')).toBe(false);
    expect(isGoogleRefusal(['1'])).toBe(false);
  });
});
