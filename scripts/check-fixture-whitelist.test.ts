import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  LOAD_PROJECT_COUNT,
  LOAD_TICKET_HISTORY,
} from '../packages/db/src/load-generator';
import { checkFixturePage, generatedLoadPages, runWhitelistGate } from './check-fixture-whitelist';

const ROOT = join(import.meta.dirname, '..');
const CHECKER = join(ROOT, 'scripts', 'check-fixture-whitelist.ts');

/** Story 5.1 required scenario directories (hours = ec-phase2). */
const REQUIRED = [
  'ec-phase2',
  'no-hours',
  'page-shift',
  'leave-and-return',
  'scope-change',
] as const;

describe('fixture scenarios (story 5.1)', () => {
  it('keeps all five required scenario directories', () => {
    for (const name of REQUIRED) {
      expect(existsSync(join(ROOT, 'fixtures', 'backlog', name, '0001.json')), name).toBe(true);
    }
  });

  it('rejects a fixture file containing description (whitelist gate)', () => {
    const clean = spawnSync('pnpm', ['exec', 'tsx', CHECKER], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(clean.status, clean.stderr + clean.stdout).toBe(0);

    const probeDir = join(ROOT, 'fixtures', 'backlog', '_probe-whitelist');
    const probeFile = join(probeDir, '0001.json');
    mkdirSync(probeDir, { recursive: true });
    try {
      writeFileSync(
        probeFile,
        JSON.stringify({
          scenario: '_probe-whitelist',
          page: 1,
          observedAtOffsetHours: 0,
          recordedObservedAt: '2026-09-16T09:00:00.000Z',
          hoursFieldPresent: false,
          tickets: [
            {
              trackerIssueId: 'x',
              key: 'X-1',
              title: 'probe',
              statusId: 'Open',
              estimateMh: null,
              actualMh: null,
              assigneeAccountId: null,
              createdAt: '2026-06-01T01:00:00.000Z',
              parentIssueId: null,
              issueTypeId: 'Task',
              trackerProjectId: 'X',
              attributes: [],
              description: 'banned',
            },
          ],
        }),
      );
      const dirty = spawnSync('pnpm', ['exec', 'tsx', CHECKER], {
        cwd: ROOT,
        encoding: 'utf8',
      });
      expect(dirty.status).not.toBe(0);
      expect(dirty.stderr + dirty.stdout).toMatch(/description/);
    } finally {
      rmSync(probeDir, { recursive: true, force: true });
    }
  });
});

describe('fixture whitelist page check (story 5.15)', () => {
  it('covers every generated load-fixture page and finds them clean', () => {
    const pages = generatedLoadPages();
    expect(pages).toHaveLength(LOAD_PROJECT_COUNT * LOAD_TICKET_HISTORY.length);
    const observations = pages.reduce(
      (sum, { page }) => sum + (page as { tickets: readonly unknown[] }).tickets.length,
      0,
    );
    expect(observations).toBe(
      LOAD_PROJECT_COUNT * LOAD_TICKET_HISTORY.reduce((a, b) => a + b, 0),
    );
    for (const { label, page } of pages) expect(checkFixturePage(page), label).toBeNull();
    const gate = runWhitelistGate();
    if (!gate.ok) throw new Error(gate.error);
    // The gate itself walked the generated pages, not only the committed files.
    expect(gate.summary).toContain(
      `${LOAD_PROJECT_COUNT * LOAD_TICKET_HISTORY.length} generated load pages / ` +
        `${observations} Ticket observations`,
    );
  });

  it('names the offending field when a generated Ticket carries one outside the whitelist', () => {
    const [first] = generatedLoadPages();
    const page = first!.page as { tickets: Record<string, unknown>[] };
    const dirty = {
      ...page,
      tickets: [{ ...page.tickets[0], description: 'leaked' }, ...page.tickets.slice(1)],
    };
    expect(checkFixturePage(dirty)).toMatch(/tickets\[0\] has banned field "description"/);

    const extra = { ...page, tickets: [{ ...page.tickets[0], dueDate: 'x' }] };
    expect(checkFixturePage(extra)).toMatch(/out-of-whitelist field "dueDate"/);
  });

  it('refuses an attribute kind outside the closed Backlog set', () => {
    const [first] = generatedLoadPages();
    const page = first!.page as { tickets: Record<string, unknown>[] };
    const dirty = {
      ...page,
      tickets: [{ ...page.tickets[0], attributes: [{ kind: 'label', id: 'x' }] }],
    };
    expect(checkFixturePage(dirty)).toMatch(/attributes\[0\]\.kind must be one of/);
  });
});
