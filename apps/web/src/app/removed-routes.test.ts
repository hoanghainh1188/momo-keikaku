import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acquireTreeProbeLock } from '../../../../tests/support/tree-probe-lock';

/**
 * Story 2.2 removed the spike's Client View route, `app/c/[projectId]/page.tsx`. The Client View
 * is FR-36, which is R1. The App Router answers a path no route file matches with 404, so this test
 * pins the two conditions that 404 depends on. First, no `c` segment exists. Second, no top-level
 * dynamic or catch-all segment exists that would capture `/c/<id>` instead. A later story that
 * rebuilds the Client View deletes this test deliberately.
 */
const APP_DIR = fileURLToPath(new URL('.', import.meta.url));

// `approximate-guards.test.ts` (story 5.14) probes its depcruise rule with a temporary
// `app/(__probe-approximate)/c/` page — exactly the shape the second case below rejects — so this suite reads
// `app/` under the tree-probe lock (`tests/support/tree-probe-lock.ts`).
let releaseTree = (): void => {};
beforeAll(async () => {
  releaseTree = await acquireTreeProbeLock();
}, 300_000);
afterAll(() => releaseTree());

const topLevelSegments = (): string[] =>
  readdirSync(APP_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

describe('the removed Client View route answers 404 (story 2.2)', () => {
  it('has no `c` route segment', () => {
    expect(topLevelSegments()).not.toContain('c');
  });

  it('has no top-level dynamic or catch-all segment that could capture /c/<id>', () => {
    // Route groups `(name)` are transparent, so a dynamic segment nested inside one would capture
    // `/c` just the same. None exist today; if one is added, this test must be revisited.
    const capturing = topLevelSegments().filter((name) => name.startsWith('[') || name.startsWith('('));
    expect(capturing).toEqual([]);
  });
});
