'use server';

import { revalidatePath } from 'next/cache';
import {
  explainTickets as explainTicketsUseCase,
  mapTicket,
  mapTickets as mapTicketsUseCase,
  markChangeRequestCandidates,
  planTicketsAsWorkPackage,
} from '@/server/composition';
import {
  parseChangeRequestCandidatesForm,
  parseExplainTicketsForm,
  parseMapTicketForm,
  parseMapTicketsForm,
  parsePlanTicketsForm,
} from '@/server/forms';
import { writeLanded } from '@/server/result';

/**
 * FR-29 Dispositions and FR-21 manual Mapping — the inbound adapter half.
 *
 * Each action reads its form (`server/forms.ts`), calls one write use case through the
 * composition root, and revalidates the pages that show the change — only when the change
 * landed. The writes themselves, their single transaction per action (AD-14), the Tenant and
 * the audit actor all live behind the use case now (story 1.2 slice 4): this file imports
 * neither the database package nor the ORM, and `pnpm depcruise` fails if it ever does again.
 *
 * `not_found` and `invalid_input` are both an early return, exactly as an unusable form always
 * was: nothing written, nothing revalidated. Anything else the use case throws propagates.
 */

/** FR-29 *Map*: the hours leave Unplanned Work immediately (FR-21 attribution). */
export async function mapTickets(formData: FormData): Promise<void> {
  const input = parseMapTicketsForm(formData);
  if (!writeLanded(await mapTicketsUseCase(input))) return;
  revalidatePath(`/p/${input.projectId}/review`);
  revalidatePath(`/p/${input.projectId}/mapping`);
}

/**
 * FR-29 *Plan*: creates a Work Package in the Current Plan and maps the Tickets to
 * it. Its hours stay Unplanned Work until a Re-baseline includes the WP.
 */
export async function planTickets(formData: FormData): Promise<void> {
  const input = parsePlanTicketsForm(formData);
  if (!writeLanded(await planTicketsAsWorkPackage(input))) return;
  revalidatePath(`/p/${input.projectId}/review`);
  revalidatePath(`/p/${input.projectId}/plan`);
}

/** FR-29 *Explain*: attaches a note. Clients see it only if a snapshot is published. */
export async function explainTickets(formData: FormData): Promise<void> {
  const input = parseExplainTicketsForm(formData);
  if (!writeLanded(await explainTicketsUseCase(input))) return;
  revalidatePath(`/p/${input.projectId}/review`);
  revalidatePath(`/c/${input.projectId}`);
}

/** FR-29 *Change Request candidate*: collects the Tickets into a list. */
export async function crCandidate(formData: FormData): Promise<void> {
  const input = parseChangeRequestCandidatesForm(formData);
  if (!writeLanded(await markChangeRequestCandidates(input))) return;
  revalidatePath(`/p/${input.projectId}/review`);
}

/** Map a single Ticket from the Mapping surface (FR-21 manual Mapping). */
export async function mapSingleTicket(formData: FormData): Promise<void> {
  const input = parseMapTicketForm(formData);
  if (!writeLanded(await mapTicket(input))) return;
  revalidatePath(`/p/${input.projectId}/mapping`);
  revalidatePath(`/p/${input.projectId}/review`);
}
