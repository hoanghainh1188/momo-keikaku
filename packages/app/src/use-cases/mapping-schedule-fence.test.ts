/**
 * Story 5.9 — Mapping writers must not reach the schedule fence (matrix: Schedule fence).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('mapping write schedule fence (story 5.9)', () => {
  it('project-writes (map/unmap) never imports recalculate or applyPlanChange', () => {
    const src = readFileSync(join(here, 'project-writes.ts'), 'utf8');
    expect(src).not.toMatch(/recalculate/);
    expect(src).not.toMatch(/applyPlanChange/);
    expect(src).not.toMatch(/patch_actual_dates/);
  });

  it('story 5.10: every rule path (use cases, repository, pure evaluation) writes no date and never recalculates', () => {
    const files = [
      join(here, 'mapping-rules.ts'),
      join(here, 'mapping-rule-input.ts'),
      join(here, '../../../db/src/repo-mapping-rules.ts'),
      join(here, '../../../domain/src/mapping.ts'),
    ];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).not.toMatch(/recalculate/);
      expect(src, file).not.toMatch(/applyPlanChange/);
      expect(src, file).not.toMatch(/patch_actual_dates/);
      expect(src, file).not.toMatch(/wpStatusEvent|wp_status_event/);
      expect(src, file).not.toMatch(/schedule\//);
    }
  });

  it('MappingTicketBoard DnD/keyboard submit the same FormData fields as MapTicketForm', () => {
    const board = readFileSync(
      join(here, '../../../../apps/web/src/components/mapping-ticket-board.tsx'),
      'utf8',
    );
    const form = readFileSync(
      join(here, '../../../../apps/web/src/components/map-ticket-form.tsx'),
      'utf8',
    );
    expect(board).toMatch(/fd\.set\('projectId'/);
    expect(board).toMatch(/fd\.set\('ticketId'/);
    expect(board).toMatch(/fd\.set\('wpId'/);
    expect(board).toMatch(/mapSingleTicket/);
    expect(form).toMatch(/name="projectId"/);
    expect(form).toMatch(/name="ticketId"/);
    expect(form).toMatch(/name="wpId"/);
    expect(form).toMatch(/mapSingleTicket/);
    expect(form).toMatch(/release_option/);
  });
});
