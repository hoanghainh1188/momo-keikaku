'use server';

import { revalidatePath } from 'next/cache';
import { hours } from '@momo/domain/present';
import type {
  AppError,
  CreateMappingRuleInput,
  PreviewMappingRuleChangeInput,
  ReorderMappingRulesInput,
  Result,
} from '@momo/app';
import {
  createMappingRule,
  deleteMappingRule,
  previewMappingRuleChange,
  reorderMappingRules,
  updateMappingRule,
  explainTickets as explainTicketsUseCase,
  mapTicket,
  mapTickets as mapTicketsUseCase,
  markChangeRequestCandidates,
  planTicketsAsWorkPackage,
  requestContext,
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
 *
 * Each action RESOLVES THE REQUEST CONTEXT ONCE (story 1.4 slice 1) — `requestContext()`, which
 * redirects a signed-out request to /sign-in — and passes it to every binding it calls, so the
 * audit actor is the signed-in user and the Tenant is theirs.
 */

/** FR-29 *Map*: the hours leave Unplanned Work immediately (FR-21 attribution). */
export async function mapTickets(formData: FormData): Promise<void> {
  const input = parseMapTicketsForm(formData);
  const ctx = await requestContext();
  if (!writeLanded(await mapTicketsUseCase(input, ctx))) return;
  revalidatePath(`/p/${input.projectId}/review`);
  revalidatePath(`/p/${input.projectId}/mapping`);
}

/**
 * FR-29 *Plan*: creates a Work Package in the Current Plan and maps the Tickets to
 * it. Its hours stay Unplanned Work until a Re-baseline includes the WP.
 */
export async function planTickets(formData: FormData): Promise<void> {
  const input = parsePlanTicketsForm(formData);
  const ctx = await requestContext();
  if (!writeLanded(await planTicketsAsWorkPackage(input, ctx))) return;
  revalidatePath(`/p/${input.projectId}/review`);
  revalidatePath(`/p/${input.projectId}/plan`);
}

/** FR-29 *Explain*: attaches a note. Clients see it only if a snapshot is published. */
export async function explainTickets(formData: FormData): Promise<void> {
  const input = parseExplainTicketsForm(formData);
  const ctx = await requestContext();
  if (!writeLanded(await explainTicketsUseCase(input, ctx))) return;
  revalidatePath(`/p/${input.projectId}/review`);
}

/** FR-29 *Change Request candidate*: collects the Tickets into a list. */
export async function crCandidate(formData: FormData): Promise<void> {
  const input = parseChangeRequestCandidatesForm(formData);
  const ctx = await requestContext();
  if (!writeLanded(await markChangeRequestCandidates(input, ctx))) return;
  revalidatePath(`/p/${input.projectId}/review`);
}

/** Map a single Ticket from the Mapping surface (FR-21 manual Mapping). */
export async function mapSingleTicket(formData: FormData): Promise<void> {
  const input = parseMapTicketForm(formData);
  const ctx = await requestContext();
  if (!writeLanded(await mapTicket(input, ctx))) return;
  revalidatePath(`/p/${input.projectId}/mapping`);
  revalidatePath(`/p/${input.projectId}/review`);
}

// --- Story 5.10: Mapping Rules (FR-22, UX-DR22) -------------------------------------------------
//
// Called from the Rules editor with plain values rather than FormData: the editor needs the
// answer (the preview, or "N Tickets moved"), so each action returns a small serialisable value.
// The use cases validate the whole command (zod) — these actions only pass it through, resolve
// the request context, and revalidate the pages whose figures a rule change moves.

/** What a rule write answers the editor: how many Tickets moved, or why it was refused. */
export type RuleActionResult =
  | { readonly ok: true; readonly moved: number }
  | { readonly ok: false; readonly code: AppError['code']; readonly details: Readonly<Record<string, readonly string[]>> };

/** One flow of the preview, its hours already presented (no bigint crosses to the client). */
export interface RulePreviewFlowView {
  readonly wpId: string;
  readonly tickets: number;
  readonly hours: string;
}

/** The move preview as the editor renders it. */
export type RulePreviewResult =
  | {
      readonly ok: true;
      readonly arrivals: readonly RulePreviewFlowView[];
      readonly departures: readonly RulePreviewFlowView[];
      readonly toUnmapped: { readonly tickets: number; readonly hours: string };
      readonly moveCount: number;
      /** False in Ticket-Count Mode: the editor then shows counts only, never "+0h". */
      readonly hoursAvailable: boolean;
    }
  | { readonly ok: false; readonly code: AppError['code']; readonly details: Readonly<Record<string, readonly string[]>> };

function ruleWriteResult(projectId: string, result: Result<{ readonly moved: number }>): RuleActionResult {
  if (!result.ok) return { ok: false, code: result.error.code, details: result.error.details ?? {} };
  revalidatePath(`/p/${projectId}/mapping`);
  revalidatePath(`/p/${projectId}/review`);
  return { ok: true, moved: result.value.moved };
}

/** A rule draft as the editor sends it: create when `ruleId` is absent, edit otherwise. */
export type SaveMappingRuleInput = CreateMappingRuleInput & { readonly ruleId?: string };

/** FR-22: create or edit a rule; the same transaction re-evaluates the Project's Tickets. */
export async function saveMappingRule(input: SaveMappingRuleInput): Promise<RuleActionResult> {
  const ctx = await requestContext();
  const { ruleId, ...draft } = input;
  const result =
    ruleId === undefined
      ? await createMappingRule(draft, ctx)
      : await updateMappingRule({ ...draft, ruleId }, ctx);
  return ruleWriteResult(input.projectId, result);
}

/** FR-22: soft-delete a rule; the Tickets it mapped are re-evaluated against the rest. */
export async function removeMappingRule(input: {
  readonly projectId: string;
  readonly ruleId: string;
}): Promise<RuleActionResult> {
  const ctx = await requestContext();
  return ruleWriteResult(input.projectId, await deleteMappingRule(input, ctx));
}

/** UX-DR22: the rule list in a new order (drag handle or Alt+↑/↓); applies immediately. */
export async function reorderMappingRuleList(input: ReorderMappingRulesInput): Promise<RuleActionResult> {
  const ctx = await requestContext();
  return ruleWriteResult(input.projectId, await reorderMappingRules(input, ctx));
}

/** UX-DR22: the read-only move preview Save waits for. */
export async function previewMappingRule(input: PreviewMappingRuleChangeInput): Promise<RulePreviewResult> {
  const ctx = await requestContext();
  const result = await previewMappingRuleChange(input, ctx);
  if (!result.ok) return { ok: false, code: result.error.code, details: result.error.details ?? {} };
  const flow = (f: { wpId: string; tickets: number; mh: bigint }) => ({
    wpId: f.wpId,
    tickets: f.tickets,
    hours: hours(f.mh),
  });
  return {
    ok: true,
    arrivals: result.value.arrivals.map(flow),
    departures: result.value.departures.map(flow),
    toUnmapped: { tickets: result.value.toUnmapped.tickets, hours: hours(result.value.toUnmapped.mh) },
    moveCount: result.value.moves.length,
    hoursAvailable: result.value.hoursAvailable,
  };
}
