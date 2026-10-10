import { describe, expect, it } from 'vitest';
import { captureReviewTrackerPin, resolveTrackerPins, } from './review-tracker-pin';
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
        const freeze = {
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
        const freeze = {
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
    it('falls back when freeze omits a current connector', () => {
        const multi = [
            ...rows,
            { id: 'snap-c2', seq: 3, connectorId: 'c2', observedAt: t1 },
        ];
        const freeze = {
            overallSnapshotId: 'snap-old',
            snapshotIdByConnector: { c1: 'snap-old' },
        };
        const r = resolveTrackerPins({
            snapshotRows: multi,
            connectorIds: ['c1', 'c2'],
            freeze,
        });
        expect(r.usedFreeze).toBe(false);
        expect(r.trackerSnapshotIdByConnector.get('c1')).toBe('snap-new');
        expect(r.trackerSnapshotIdByConnector.get('c2')).toBe('snap-c2');
    });
    it('falls back when a mapped snapshot belongs to another connector', () => {
        const multi = [
            ...rows,
            { id: 'snap-c2', seq: 3, connectorId: 'c2', observedAt: t1 },
        ];
        const freeze = {
            overallSnapshotId: 'snap-old',
            snapshotIdByConnector: { c1: 'snap-old', c2: 'snap-old' },
        };
        const r = resolveTrackerPins({
            snapshotRows: multi,
            connectorIds: ['c1', 'c2'],
            freeze,
        });
        expect(r.usedFreeze).toBe(false);
    });
});
describe('captureReviewTrackerPin', () => {
    it('returns null for empty pin', () => {
        expect(captureReviewTrackerPin({
            overallSnapshotId: '',
            trackerSnapshotIdByConnector: new Map(),
        })).toBeNull();
    });
    it('serializes Maps to a persistable record', () => {
        expect(captureReviewTrackerPin({
            overallSnapshotId: 'snap-1',
            trackerSnapshotIdByConnector: new Map([['c1', 'snap-1']]),
        })).toEqual({
            overallSnapshotId: 'snap-1',
            snapshotIdByConnector: { c1: 'snap-1' },
        });
    });
});
