import {
  EXPLAIN_NOTE_MAX,
  type ChangeRequestCandidatesInput,
  type ExplainTicketsInput,
  type MapTicketInput,
  type MapTicketsInput,
  type PlanTicketsInput,
} from '@momo/app';

/**
 * The five write forms, read out of `FormData` into the commands the write use cases take.
 *
 * PURE, and deliberately dumb: they read the fields the forms post
 * (`components/disposition-rail.tsx`, `components/map-ticket-form.tsx`) and apply the same
 * shaping the actions always did — split the comma-joined Ticket ids and drop the empties,
 * trim the name and the note, cut the note at 1000 characters — and decide NOTHING about
 * validity. An empty list, a blank name, a missing id all go through as they are, and the use
 * case answers `invalid_input` for them, so the rule lives in one place (`packages/app`) rather
 * than in two that can disagree.
 *
 * A field that is absent, or a file rather than a string, reads as the empty string. (The
 * actions used to read it as `String(null)`, the four characters `null`, which was never a
 * Project id anybody meant.)
 */

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

function ticketIds(form: FormData): string[] {
  return text(form, 'ticketIds').split(',').filter(Boolean);
}

/** The Disposition rail's *Map* form. */
export function parseMapTicketsForm(form: FormData): MapTicketsInput {
  return { projectId: text(form, 'projectId'), wpId: text(form, 'wpId'), ticketIds: ticketIds(form) };
}

/** The Disposition rail's *Plan* form. */
export function parsePlanTicketsForm(form: FormData): PlanTicketsInput {
  return {
    projectId: text(form, 'projectId'),
    name: text(form, 'name').trim(),
    ticketIds: ticketIds(form),
  };
}

/** The Disposition rail's *Explain* form. The note is trimmed, then cut to the stored maximum. */
export function parseExplainTicketsForm(form: FormData): ExplainTicketsInput {
  return {
    projectId: text(form, 'projectId'),
    note: text(form, 'note').trim().slice(0, EXPLAIN_NOTE_MAX),
    ticketIds: ticketIds(form),
  };
}

/** The Disposition rail's *Change Request candidate* form. */
export function parseChangeRequestCandidatesForm(form: FormData): ChangeRequestCandidatesInput {
  return { projectId: text(form, 'projectId'), ticketIds: ticketIds(form) };
}

/** The Mapping surface's per-Ticket form. An empty `wpId` is the "unmapped" option. */
export function parseMapTicketForm(form: FormData): MapTicketInput {
  return {
    projectId: text(form, 'projectId'),
    ticketId: text(form, 'ticketId'),
    wpId: text(form, 'wpId'),
  };
}
