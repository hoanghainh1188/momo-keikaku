import { describe, expect, it } from 'vitest';
import {
  generateLoadFixture,
  loadFixtureFingerprint,
  LOAD_FIXTURE_SEED,
  LOAD_PROJECT_COUNT,
  LOAD_WP_PER_PROJECT,
  loadProjectAsDemoState,
} from './load-generator';

describe('generateLoadFixture', () => {
  it('is deterministic for the fixed seed', () => {
    const a = generateLoadFixture(LOAD_FIXTURE_SEED);
    const b = generateLoadFixture(LOAD_FIXTURE_SEED);
    expect(loadFixtureFingerprint(a)).toBe(loadFixtureFingerprint(b));
  });

  it('emits 5 Projects × 500 Work Packages plus Resources', () => {
    const shape = generateLoadFixture();
    expect(shape.projects).toHaveLength(LOAD_PROJECT_COUNT);
    expect(shape.resources.length).toBeGreaterThan(0);
    for (const project of shape.projects) {
      expect(project.wps).toHaveLength(LOAD_WP_PER_PROJECT);
      const leaves = project.wps.filter((w) => w.isLeaf);
      expect(leaves.every((w) => w.assignedResourceIds.length > 0)).toBe(true);
    }
  });

  it('builds a DemoState per project with empty Tickets / ledger', () => {
    const shape = generateLoadFixture();
    const state = loadProjectAsDemoState(shape, 0);
    expect(state.wps).toHaveLength(LOAD_WP_PER_PROJECT);
    expect(state.snapshots).toHaveLength(0);
    expect(state.ledger).toHaveLength(0);
    expect(state.baselineVersions[0]!.seq).toBe(1);
    expect(loadProjectAsDemoState(shape, 4).baselineVersions[0]!.seq).toBe(5);
  });
});
