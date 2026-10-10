import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS, audit, isAuditAction, refusingNonMembers } from '.';
/**
 * `audit.record` and the closed action enum, against a recording sink — no database.
 * The rollback half of AD-14 is the transaction's (`project-writes.test.ts`,
 * `tests/audited-use-cases.test.ts`, and the write harness against Postgres).
 */
const STAMP = { actor: 'user:test', at: new Date('2026-09-01T00:00:00Z') };
function recordingScope() {
    const entries = [];
    const scope = {
        audit: {
            append: async (entry) => {
                entries.push(entry);
            },
        },
    };
    return { scope, entries };
}
describe('AUDIT_ACTIONS', () => {
    it('starts with the six strings packages/db wrote before this slice, in order — existing rows carry them', () => {
        // A prefix, not the whole enum: later stories append members.
        expect(AUDIT_ACTIONS.slice(0, 6)).toEqual([
            'disposition.map',
            'disposition.plan',
            'disposition.explain',
            'disposition.cr_candidate',
            'mapping.map',
            'mapping.unmap',
        ]);
    });
    it('has no duplicate', () => {
        expect(new Set(AUDIT_ACTIONS).size).toBe(AUDIT_ACTIONS.length);
    });
    it('recognises its members and nothing else', () => {
        for (const action of AUDIT_ACTIONS)
            expect(isAuditAction(action)).toBe(true);
        for (const other of ['disposition.forged', 'Disposition.map', '', 'mapping.map ', null, 7]) {
            expect(isAuditAction(other)).toBe(false);
        }
    });
});
describe('audit.record', () => {
    it('appends one entry on the scope\'s sink — actor, time, action, target and payload as given', async () => {
        const { scope, entries } = recordingScope();
        const payload = { wpId: 'wp-1', effort: 1500n };
        await audit.record(scope, STAMP, 'mapping.map', 'tkt-1', payload);
        expect(entries).toEqual([{ ...STAMP, action: 'mapping.map', target: 'tkt-1', payload }]);
    });
    it('does not typecheck with an action outside the enum', () => {
        // The compile-time half: `tsc` fails here if the enum ever widens to `string`.
        const call = (scope) => 
        // @ts-expect-error — 'disposition.forged' is not a member of AUDIT_ACTIONS
        audit.record(scope, STAMP, 'disposition.forged', 'prj-1', {});
        expect(typeof call).toBe('function');
    });
    it('refuses an action forced past the type, before the sink is called', async () => {
        const { scope, entries } = recordingScope();
        await expect(audit.record(scope, STAMP, 'disposition.forged', 'prj-1', {})).rejects.toThrow(/"disposition\.forged", which is not a member of AUDIT_ACTIONS/);
        expect(entries).toEqual([]);
    });
    it('propagates a refused append, so the use case\'s transaction rolls back', async () => {
        const refused = new Error('audit_log insert refused');
        const scope = { audit: { append: async () => Promise.reject(refused) } };
        await expect(audit.record(scope, STAMP, 'mapping.unmap', 'tkt-1', { wpId: '' })).rejects.toBe(refused);
    });
});
describe('refusingNonMembers', () => {
    it('refuses a direct append with a non-enum action, and passes a member through', async () => {
        const { scope, entries } = recordingScope();
        const guarded = refusingNonMembers(scope.audit);
        const forged = { ...STAMP, action: 'disposition.forged', target: 'prj-1', payload: {} };
        await expect(guarded.append(forged)).rejects.toThrow(/not a member of AUDIT_ACTIONS/);
        expect(entries).toEqual([]);
        const member = { ...STAMP, action: 'mapping.map', target: 'tkt-1', payload: { wpId: 'wp-1' } };
        await guarded.append(member);
        expect(entries).toEqual([member]);
    });
});
