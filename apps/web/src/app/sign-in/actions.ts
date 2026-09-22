'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { googleSignIn, signInWithEmail, signOut } from '@/server/composition';
import { GOOGLE_REFUSED } from './google-refusal';

/**
 * Sign-in and sign-out (story 1.4 slices 1 and 3) — the composition root's auth bindings, called
 * from forms. Rate-limiting is deferred on purpose (deferred-work.md): Better Auth's limiter runs
 * only in its HTTP router, and these actions call its API directly. THE DEFERRAL COVERS FIVE
 * ACTIONS, not the two here: story 1.4 slice 4 added `requestReset` and `submitReset`, which are
 * unauthenticated by definition — one triggers mail to an address the caller names, the other
 * guesses a token — so they are the ones the Epic 8 throttle matters most for.
 */


export interface SignInState {
  /** True after a refusal. One flag, one message: nothing tells an unknown email from a wrong password. */
  readonly refused: boolean;
}

/**
 * The form, validated at the boundary (zod, like every inbound boundary). An email is at most 254
 * characters (RFC 5321); a password 1–128. Anything else is refused without reaching Better Auth.
 */
const signInForm = z.object({
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(128),
});

/** Signs in with email + password, then lands on `/` — never on a return path from the URL. */
export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = signInForm.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { refused: true };

  const signedIn = await signInWithEmail(parsed.data);
  if (!signedIn) return { refused: true };
  redirect('/');
}

/**
 * Starts a Google sign-in and sends the browser to the provider. The state cookie is set on this
 * response by `nextCookies()`. The provider comes back to `/api/auth/callback/google`, which lands
 * on `/` — or on `/sign-in?google=refused`, like this action when Google is not available.
 */
export async function signInWithGoogle(): Promise<void> {
  const url = await googleSignIn();
  redirect(url ?? GOOGLE_REFUSED);
}

/** Ends the session and returns to the sign-in page. */
export async function signOutAction(): Promise<void> {
  await signOut();
  redirect('/sign-in');
}
