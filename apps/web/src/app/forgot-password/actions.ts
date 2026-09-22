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
 * One answer for EVERY submission: a known address, an unknown one, a Google-only account with no
 * credential to reset, and even a well-formed-looking but non-existent one Better Auth itself
 * refuses downstream all land on the same `?sent=1` (NFR-S5) — nothing here, or in the composition
 * binding it calls, tells them apart. The schema below only rejects an EMPTY or oversized field
 * before the binding is called; it has no `.email()` check, so a non-empty, malformed address is
 * still forwarded, still refused (silently, inside the binding), and still redirects here the
 * same way.
 */
export async function requestReset(formData: FormData): Promise<void> {
  const parsed = forgotPasswordForm.safeParse({ email: formData.get('email') });
  if (parsed.success) await requestPasswordReset(parsed.data.email);
  redirect('/forgot-password?sent=1');
}
