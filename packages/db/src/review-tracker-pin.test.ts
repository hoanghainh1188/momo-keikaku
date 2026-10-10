import { describe, expect, it } from 'vitest';
import {
  captureReviewTrackerPin,
  resolveTrackerPins,
  type ReviewTrackerPin,
} from './review-tracker-pin';

const t0 = new Date('2026-10-01T00:00:00.000Z');
const t1 = new Date('2026-10-09T00:00:00.000Z');

describe('resolveTrackerPins (Story 6.7 Q1→C)', () => {
  const rows = [
    { id: 'snap-old', seq: 1, connectorId: 'c1', observedAt: t0 },
    { id: 'snap-new', seq: 2, connectorId: 'c1', observedAt: t1 },
  ];

  it('uses live heads when freeze is absent', () => {
    const r = resolveTrackerPins({ snapshotRows: rows, connectorIds: ['c1'] });
    expect(r.usedFreeze).toBe(false);
    expect(r.overallSnapshotId).toBe('snap-new');
    expect(r.trackerSnapshotIdByConnector.get('c1')).toBe('snap-new');
  });

  it('applies a valid freeze so later ingest does not move the pin', () => {
    const freeze: ReviewTrackerPin = {
      overallSnapshotId: 'snap-old',
      snapshotIdByConnector: { c1: 'snap-old' },
    };
    const r = resolveTrackerPins({
      snapshotRows: rows,
      connectorIds: ['c1'],
      freeze,
    });
    expect(r.usedFreeze).toBe(true);
    expect(r.overallSnapshotId).toBe('snap-old');
    expect(r.trackerSnapshotIdByConnector.get('c1')).toBe('snap-old');
  });

  it('falls back to live when freeze names unknown snapshot ids', () => {
    const freeze: ReviewTrackerPin = {
      overallSnapshotId: 'snap-gone',
      snapshotIdByConnector: { c1: 'snap-gone' },
    };
    const r = resolveTrackerPins({
      snapshotRows: rows,
      connectorIds: ['c1'],
      freeze,
    });
    expect(r.usedFreeze).toBe(false);
    expect(r.overallSnapshotId).toBe('snap-new');
  });
});

describe('captureReviewTrackerPin', () => {
  it('returns null for empty pin', () => {
    expect(
      captureReviewTrackerPin({
        overallSnapshotId: '',
        trackerSnapshotIdByConnector: new Map(),
      }),
    ).toBeNull();
  });

  it('serializes Maps to a persistable record', () => {
    expect(
      captureReviewTrackerPin({
        overallSnapshotId: 'snap-1',
        trackerSnapshotIdByConnector: new Map([['c1', 'snap-1']]),
      }),
    ).toEqual({
      overallSnapshotId: 'snap-1',
      snapshotIdByConnector: { c1: 'snap-1' },
    });
  });
});
