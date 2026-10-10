import { describe, expect, it } from 'vitest';
import { INGEST_SNAPSHOT_QUEUE, INGEST_SNAPSHOT_QUEUE_OPTIONS, SNAPSHOT_TICK_CRON, SNAPSHOT_TICK_QUEUE, SNAPSHOT_TICK_SCHEDULE_OPTIONS, } from './ingest-snapshot-queue';
describe('ingest-snapshot / snapshot-tick registration (story 5.4 matrix)', () => {
    it('creates ingest-snapshot as stately with retryLimit 3 (not standard)', () => {
        expect(INGEST_SNAPSHOT_QUEUE).toBe('ingest-snapshot');
        expect(INGEST_SNAPSHOT_QUEUE_OPTIONS.policy).toBe('stately');
        expect(INGEST_SNAPSHOT_QUEUE_OPTIONS.policy).not.toBe('standard');
        expect(INGEST_SNAPSHOT_QUEUE_OPTIONS.retryLimit).toBe(3);
        expect(INGEST_SNAPSHOT_QUEUE_OPTIONS.retryDelayMax).toBeLessThan(45 * 60);
    });
    it('registers snapshot-tick hourly in Asia/Tokyo with missed: skip', () => {
        expect(SNAPSHOT_TICK_QUEUE).toBe('snapshot-tick');
        expect(SNAPSHOT_TICK_CRON).toBe('0 * * * *');
        expect(SNAPSHOT_TICK_SCHEDULE_OPTIONS).toEqual({ tz: 'Asia/Tokyo', missed: 'skip' });
    });
});
