import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');

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
});
