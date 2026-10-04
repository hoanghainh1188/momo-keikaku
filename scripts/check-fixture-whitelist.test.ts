import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

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
