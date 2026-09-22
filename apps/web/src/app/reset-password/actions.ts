'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { resetPassword as resetPasswordBinding } from '@/server/composition';

/**
 * Validated at the boundary. Better Auth's own `minPasswordLength` (8) is the length authority
 * for what counts as an acceptable new password — this only keeps an empty or absurdly long
 * field from reaching it.
 */
const passwordField = z.string().min(1).max(128);

/** The `?token=…&refused=1` this action sends a refusal back to, carrying the SAME token. */
function refusalUrl(token: string): string {
  return `/reset-password?token=${encodeURIComponent(token)}&refused=1`;
}

/**
 * Consumes a reset token and sets a new password — REDIRECTS rather than returning a refusal to
 * re-render, matching `/sign-in?google=refused`'s shape.
 *
 * ONE GENERIC REFUSAL for a malformed submission, a reused or expired token, and a password
 * Better Auth's `minPasswordLength` refuses alike — told apart by nothing (NFR-S5), and each one
 * lands back on THIS SAME PAGE with the token it was given, from the hidden field, never from the
 * URL. A success signs nobody in (this flow only replaces the password); it lands on `/sign-in`,
 * where the new password is what works from now on.
 */
export async function submitReset(formData: FormData): Promise<void> {
  const rawToken = formData.get('token');
  const token = typeof rawToken === 'string' ? rawToken : '';
  if (token === '') redirect(refusalUrl(token));

  const password = passwordField.safeParse(formData.get('password'));
  if (!password.success) redirect(refusalUrl(token));

  const ok = await resetPasswordBinding({ token, password: password.data });
  if (!ok) redirect(refusalUrl(token));
  redirect('/sign-in');
}
