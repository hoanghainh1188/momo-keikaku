'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requestPasswordReset } from '@/server/composition';

/**
 * The form, validated at the boundary (zod, like every inbound boundary) — and LOWERCASED AND
 * TRIMMED here, before Better Auth ever sees it: an answer must not depend on how the visitor
 * capitalised their own email (NFR-S5's "one generic answer" extends to the lookup itself).
 */
const forgotPasswordForm = z.object({
  email: z.string().trim().toLowerCase().min(1).max(254),
});

/**
 * Requests a password reset, then REDIRECTS to the same generic outcome — matching
 * `/sign-in?google=refused`'s shape, never returning a distinguishable refusal to re-render.
 *
 * One answer for every submission that could name an email at all: a known address, an unknown
 * one, and a Google-only account with no credential to reset all land on the same
 * `?sent=1` (NFR-S5) — nothing here, or in the composition binding it calls, tells them apart.
 * Only a submission with no usable email at all is refused before it reaches the binding, and it
 * still lands on the very same place.
 */
export async function requestReset(formData: FormData): Promise<void> {
  const parsed = forgotPasswordForm.safeParse({ email: formData.get('email') });
  if (parsed.success) await requestPasswordReset(parsed.data.email);
  redirect('/forgot-password?sent=1');
}
