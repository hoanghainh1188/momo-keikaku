import { describe, expect, it } from 'vitest';
import { pushCreatedRefusal, RECREATE_HINT } from './db-migrate';

/**
 * The `db:migrate` guard. No database: the decision is pure, and the query that feeds it is two
 * catalogue reads. What matters is which shapes are refused, and that the refusal names the fix.
 */
describe('pushCreatedRefusal', () => {
  it('lets an empty database through (the first migration creates everything)', () => {
    expect(pushCreatedRefusal({ publicTables: 0, hasMigrationJournal: false })).toBeNull();
  });

  it('lets a migration-created database through, however many tables it holds', () => {
    expect(pushCreatedRefusal({ publicTables: 29, hasMigrationJournal: true })).toBeNull();
  });

  it('refuses a push-created database: tables in public but no drizzle journal', () => {
    const refusal = pushCreatedRefusal({ publicTables: 24, hasMigrationJournal: false });
    expect(refusal).toContain('24 table(s)');
    expect(refusal).toContain('drizzle-kit push');
    expect(refusal, 'the refusal must name the fix, not only the cause').toContain(RECREATE_HINT);
  });
});
