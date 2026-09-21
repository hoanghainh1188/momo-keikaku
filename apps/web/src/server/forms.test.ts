import { describe, expect, it } from 'vitest';
import {
  parseChangeRequestCandidatesForm,
  parseExplainTicketsForm,
  parseMapTicketForm,
  parseMapTicketsForm,
  parsePlanTicketsForm,
} from './forms';

/**
 * The five write forms' parsers. They are the only logic left in `apps/web/src/app/actions.ts`'s
 * path besides the use-case call, and they carry the one shaping rule the use case does not:
 * the Explain note is cut at 1000 characters rather than refused.
 */

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
}

describe('the Ticket list', () => {
  it('splits the comma-joined ids and drops the empties, as the actions always did', () => {
    const parsed = parseMapTicketsForm(
      form({ projectId: 'prj-ec2', wpId: 'wp-1', ticketIds: 'tkt-1,,tkt-2,' }),
    );
    expect(parsed).toEqual({ projectId: 'prj-ec2', wpId: 'wp-1', ticketIds: ['tkt-1', 'tkt-2'] });
  });

  it('is empty — for the use case to refuse — when the field is empty or absent', () => {
    expect(parseChangeRequestCandidatesForm(form({ projectId: 'p', ticketIds: '' })).ticketIds).toEqual(
      [],
    );
    expect(parseChangeRequestCandidatesForm(form({ projectId: 'p' })).ticketIds).toEqual([]);
  });
});

describe('absent fields', () => {
  it('read as the empty string, never as the text "null"', () => {
    expect(parseMapTicketsForm(new FormData())).toEqual({ projectId: '', wpId: '', ticketIds: [] });
    expect(parseMapTicketForm(new FormData())).toEqual({ projectId: '', ticketId: '', wpId: '' });
  });

  it('read a file posted in place of text as the empty string', () => {
    const data = form({ ticketIds: 'tkt-1' });
    data.append('projectId', new Blob(['prj-ec2']), 'project.txt');
    expect(parseChangeRequestCandidatesForm(data).projectId).toBe('');
  });
});

describe('parsePlanTicketsForm', () => {
  it('trims the Work Package name', () => {
    expect(
      parsePlanTicketsForm(form({ projectId: 'p', name: '  New scope \n', ticketIds: 't' })).name,
    ).toBe('New scope');
  });
});

describe('parseExplainTicketsForm', () => {
  it('trims the note', () => {
    expect(parseExplainTicketsForm(form({ projectId: 'p', note: '  why  ', ticketIds: 't' })).note).toBe(
      'why',
    );
  });

  it('cuts an over-long note to 1000 characters after trimming, rather than refusing it', () => {
    const note = parseExplainTicketsForm(
      form({ projectId: 'p', note: `   ${'a'.repeat(1200)}`, ticketIds: 't' }),
    ).note;
    expect(note).toBe('a'.repeat(1000));
  });
});

describe('parseMapTicketForm', () => {
  it('keeps an empty wpId — the unmap — as the empty string', () => {
    expect(parseMapTicketForm(form({ projectId: 'p', ticketId: 'tkt-1', wpId: '' }))).toEqual({
      projectId: 'p',
      ticketId: 'tkt-1',
      wpId: '',
    });
  });
});
