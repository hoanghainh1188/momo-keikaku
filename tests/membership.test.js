import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { systemClock, uuidV7IdsOn } from '../packages/adapters/src';
import { resolveRequestContext, } from '../packages/app/src/authz/resolve-request-context';
import { assignMemberProject, changeMemberRole, revokeMembership, unassignMemberProject, } from '../packages/app/src/use-cases';
import { LAST_TENANT_ADMIN } from '../packages/app/src/use-cases/membership-writes';
import { createAuth, identityOn } from '../packages/db/auth/src';
import { testResetPasswordMailRenderer } from './support/reset-mail-renderer';
import { hashPassword } from '../packages/db/auth/src/password';
import { closeAllPools, getDb, getPool } from '../packages/db/src/client';
import { DEMO_USERS } from '../packages/db/src/demo-identities';
import { assertProbeTenantsDisjoint, buildProbeTenant, createProbeTenant, removeProbeTenant, } from '../packages/db/src/probe-tenants';
import { membershipsOf } from '../packages/db/src/repo-membership';
import { account, authUser, session } from '../packages/db/src/schema';
import { tenantMembership } from '../packages/db/src/schema-membership';
import { adminContextFor, requestContextFor } from './request-context';
import { TEST_NOW, allRows, connectWriteHarness, idPort, landedRows, owner, restrictedWriteDeps, } from './write-harness';
/**
 * STORY 1.4 SLICE 2's I/O MATRIX, against Postgres (FR-3): the four membership writes on the
 * restricted role through `packages/db`'s real tenant transaction, and revocation refusing the
 * revoked user's next request through `resolveRequestContext` with the REAL identity adapter.
 *
 * Two probe Tenants of this file's own — `xtprobe-mbr` (P), whose members sign in with a known
 * password, and `xtprobe-mbo` (O), the other Tenant. Before every test the bridge rows of both are
 * reset to one known shape, so each row of the matrix starts from the same place:
 *
 *   * P: `ADMIN` (the probe's seeded Tenant Admin, can sign in), `ADMIN2` (a second Tenant Admin),
 *     `PM` (the probe's seeded PM, can sign in, on P's Project), `BOTH` (a PM on P's Project);
 *   * O: its own seeded PM and Tenant Admin, and `BOTH` again, on O's Project.
 *
 * `BOTH` is the user with a membership in each Tenant: acting in P on it must leave its row in O
 * exactly as it was, which is what shows every writer statement filters by `tenant_id` (the bridge
 * has no row-level security). It is kept out of the write harness's `WriteTarget.memberUserId`.
 *
 * THE CONCURRENCY ROWS are raced behind a lock this file holds: an owner transaction locks P's
 * bridge rows, both writes start and queue on it, and releasing it lets them contend. With the one
 * ordered lock statement they serialise; split it in two and they deadlock or both pass the
 * last-admin check — either fails here.
 */
const reachable = await connectWriteHarness({
    ownerUrl: process.env.DATABASE_URL,
    appUrl: process.env.APP_DATABASE_URL,
    requireDb: process.env.REQUIRE_DB === '1',
});
const BASE_URL = 'http://localhost:3101';
const PASSWORD = 'membership-test-password';
const P = buildProbeTenant('xtprobe-mbr', 780_000_000);
const O = buildProbeTenant('xtprobe-mbo', 790_000_000);
assertProbeTenantsDisjoint([P, O]);
const ownP = (value) => `${P.writeOptions.idPrefix}${value}`;
const ownO = (value) => `${O.writeOptions.idPrefix}${value}`;
const ADMIN = ownP(DEMO_USERS.hoang.id);
const PM = ownP(DEMO_USERS.linh.id);
const ADMIN2 = ownP('admin-2');
const BOTH = ownP('both');
const O_PM = ownO(DEMO_USERS.linh.id);
const O_ADMIN = ownO(DEMO_USERS.hoang.id);
const EMAIL = { admin: ownP(DEMO_USERS.hoang.email), pm: ownP(DEMO_USERS.linh.email) };
const IDS = idPort('xtmb-id');
const deps = () => restrictedWriteDeps(IDS);
const asAdmin = (userId = ADMIN) => adminContextFor(P.tenantId, userId);
let auth;
/** The scrypt hash of `PASSWORD`, which P's members' credential accounts carry. */
let passwordHash;
/** The shape every test starts from. */
const BASELINE = [
    { userId: ADMIN, tenantId: P.tenantId, role: 'tenant_admin', projectIds: [] },
    { userId: ADMIN2, tenantId: P.tenantId, role: 'tenant_admin', projectIds: [] },
    { userId: PM, tenantId: P.tenantId, role: 'pm', projectIds: [P.projectId] },
    { userId: BOTH, tenantId: P.tenantId, role: 'pm', projectIds: [P.projectId] },
    { userId: O_ADMIN, tenantId: O.tenantId, role: 'tenant_admin', projectIds: [] },
    { userId: O_PM, tenantId: O.tenantId, role: 'pm', projectIds: [O.projectId] },
    { userId: BOTH, tenantId: O.tenantId, role: 'pm', projectIds: [O.projectId] },
];
async function resetMembers() {
    await owner().transaction(async (tx) => {
        await tx.delete(tenantMembership).where(inArray(tenantMembership.tenantId, [P.tenantId, O.tenantId]));
        await tx.insert(tenantMembership).values(BASELINE.map((row) => ({ ...row })));
        await tx.delete(session).where(inArray(session.userId, [ADMIN, PM]));
    });
}
/** Bridge rows of one Tenant, as the owner reads them, ordered by user. */
async function membersOf(tenantId) {
    const rows = await owner().transaction((tx) => tx.select().from(tenantMembership).where(eq(tenantMembership.tenantId, tenantId)));
    return rows.sort((a, b) => a.userId.localeCompare(b.userId));
}
async function memberOf(tenantId, userId) {
    return (await membersOf(tenantId)).find((row) => row.userId === userId);
}
/** The highest audit seq of P when the current test started: `audit_log` is append-only. */
let auditFloor = 0;
async function markAuditFloor() {
    const { audits } = await landedRows(P.tenantId);
    auditFloor = Math.max(0, ...audits.map((row) => row.seq));
}
/** The membership audit rows P gained during the current test, oldest first. */
async function membershipAudits() {
    const { audits } = await landedRows(P.tenantId);
    return audits
        .filter((row) => row.seq > auditFloor && row.action.startsWith('membership.'))
        .sort((a, b) => a.seq - b.seq);
}
/** Every row of both Tenants, the bridge included — what "nothing written" is measured against. */
async function everything() {
    return { p: await allRows(P.tenantId), o: await allRows(O.tenantId) };
}
function cookieFrom(setCookies) {
    return setCookies.map((cookie) => cookie.split(';')[0]).join('; ');
}
async function signIn(email) {
    const { headers } = await auth.api.signInEmail({
        body: { email, password: PASSWORD, rememberMe: true },
        headers: new Headers({ origin: BASE_URL }),
        returnHeaders: true,
    });
    return new Headers({ cookie: cookieFrom(headers.getSetCookie()), origin: BASE_URL });
}
function resolve(headers) {
    return resolveRequestContext({ identity: identityOn(auth, getDb(process.env.APP_DATABASE_URL)), handle: getDb(process.env.APP_DATABASE_URL), memberships: { membershipsOf } }, headers);
}
async function sessionsOf(userId) {
    return owner().transaction((tx) => tx.select({ activeTenantId: session.activeTenantId }).from(session).where(eq(session.userId, userId)));
}
const OK = { ok: true, value: undefined };
/**
 * Starts every write while an owner transaction holds P's bridge rows `FOR UPDATE`, waits until
 * each is queued behind THAT transaction, then releases it — so the writes contend with each other
 * rather than running one after the other by accident of timing. On any failure the blocker's
 * connection is destroyed rather than returned to the pool mid-transaction, so its locks go with it
 * and the file fails instead of hanging.
 */
async function raceBehindLock(writes) {
    const blocker = await getPool(process.env.DATABASE_URL).connect();
    let failed = true;
    try {
        await blocker.query('BEGIN');
        const { rows } = await blocker.query('SELECT pg_backend_pid() AS pid');
        const blockerPid = rows[0].pid;
        await blocker.query('SELECT user_id FROM tenant_membership WHERE tenant_id = $1 FOR UPDATE', [P.tenantId]);
        const pending = writes.map((write) => write().then((result) => ({ result }), (error) => ({ error })));
        await waitForWaitersOn(blockerPid, writes.length);
        await blocker.query('COMMIT');
        failed = false;
        return await Promise.all(pending);
    }
    finally {
        blocker.release(failed);
    }
}
/**
 * Polls until `count` backends wait behind the backend `blockerPid` — this file's, no other's.
 * Transitively: the first write to queue on a row waits on the blocker, the next one on that row's
 * lock queue waits on the first write, so "blocked by" is followed down the chain.
 */
async function waitForWaitersOn(blockerPid, count) {
    for (let attempt = 0; attempt < 500; attempt += 1) {
        const res = await owner().transaction((tx) => tx.execute(sql `
        WITH RECURSIVE behind(pid) AS (
          SELECT a.pid FROM pg_stat_activity a
           WHERE pg_blocking_pids(a.pid) @> ARRAY[${blockerPid}]::int[]
          UNION
          SELECT a.pid FROM pg_stat_activity a JOIN behind b ON pg_blocking_pids(a.pid) @> ARRAY[b.pid]
        )
        SELECT count(*)::int AS n FROM behind`));
        if (Number(res.rows[0]?.n ?? 0) >= count)
            return;
        await new Promise((resolveTick) => setTimeout(resolveTick, 10));
    }
    throw new Error(`the ${count} writes never queued on the blocker's lock`);
}
const codeOf = (settled) => settled.error !== undefined ? `threw: ${String(settled.error)}` : settled.result.ok ? 'ok' : settled.result.error.code;
describe.skipIf(!reachable)('membership writes and revocation, against Postgres (story 1.4 slice 2)', () => {
    beforeAll(async () => {
        auth = createAuth({
            db: getDb(process.env.APP_DATABASE_URL),
            secret: 'membership-test-secret-0123456789abcdef',
            baseURL: BASE_URL,
            idleHours: 8,
            generateId: uuidV7IdsOn(systemClock).next,
            // Story 1.4 slice 4 fields this file does not exercise.
            mailer: { send: async () => { } },
            now: systemClock.now,
            identityEvents: { record: async () => { } },
            resetPasswordMail: testResetPasswordMailRenderer(),
        });
        passwordHash = await hashPassword(PASSWORD);
        await createProbeTenant(owner(), { ...P, writeOptions: { ...P.writeOptions, passwordHash } });
        await createProbeTenant(owner(), O);
    }, 120_000);
    afterAll(async () => {
        await removeProbeTenant(owner(), P);
        await removeProbeTenant(owner(), O);
        // A revoked member has no membership left to be found by, so the probe's KNOWN member ids are
        // what removes its user row; a leak here would collide with the next run's probe.
        const left = await owner().transaction((tx) => tx
            .select({ id: authUser.id })
            .from(authUser)
            .where(sql `${authUser.id} LIKE ${`${P.writeOptions.idPrefix}%`} OR ${authUser.id} LIKE ${`${O.writeOptions.idPrefix}%`}`));
        expect(left, 'probe users outlived their Tenants').toEqual([]);
    }, 120_000);
    beforeEach(async () => {
        await resetMembers();
        await markAuditFloor();
    });
    describe('revocation takes effect on the next request (FR-3)', () => {
        it('deletes the row, audits the role and Projects, and signs the revoked user out, ending the session', async () => {
            const headers = await signIn(EMAIL.pm);
            const first = await resolve(headers);
            expect(first).toMatchObject({ status: 'signed_in', context: { tenantId: P.tenantId, userId: PM } });
            expect(await sessionsOf(PM)).toEqual([{ activeTenantId: P.tenantId }]);
            expect(await revokeMembership(deps(), asAdmin(), { userId: PM })).toEqual(OK);
            expect(await memberOf(P.tenantId, PM)).toBeUndefined();
            const [record] = await membershipAudits();
            expect(record).toMatchObject({
                tenantId: P.tenantId,
                actor: `user:${ADMIN}`,
                action: 'membership.revoke',
                target: PM,
                at: TEST_NOW,
                payload: { before: { role: 'pm', projectIds: [P.projectId] } },
            });
            expect(await resolve(headers)).toEqual({ status: 'signed_out' });
            expect(await sessionsOf(PM)).toEqual([]);
        });
        it('answers no_access, keeping the session, when the user had not reached a first page yet', async () => {
            const headers = await signIn(EMAIL.pm);
            expect(await sessionsOf(PM)).toEqual([{ activeTenantId: null }]);
            expect(await revokeMembership(deps(), asAdmin(), { userId: PM })).toEqual(OK);
            expect(await resolve(headers)).toEqual({ status: 'no_access', userId: PM, reason: 'no_membership' });
            expect(await sessionsOf(PM)).toEqual([{ activeTenantId: null }]);
        });
        it('lets an admin revoke themself while another admin remains; their next request is signed out', async () => {
            const headers = await signIn(EMAIL.admin);
            const resolved = await resolve(headers);
            if (resolved.status !== 'signed_in')
                throw new Error(`expected signed_in, got ${resolved.status}`);
            expect(resolved.context.roles).toEqual(['tenant_admin']);
            expect(await revokeMembership(deps(), resolved.context, { userId: ADMIN })).toEqual(OK);
            expect(await resolve(headers)).toEqual({ status: 'signed_out' });
            expect((await membersOf(P.tenantId)).filter((row) => row.role === 'tenant_admin').map((row) => row.userId)).toEqual([
                ADMIN2,
            ]);
        });
    });
    describe('role and Project changes', () => {
        it('reaches the member\'s next request: the resolved context carries the new role', async () => {
            const headers = await signIn(EMAIL.pm);
            expect(await resolve(headers)).toMatchObject({ status: 'signed_in', context: { roles: ['pm'] } });
            expect(await changeMemberRole(deps(), asAdmin(), { userId: PM, role: 'tenant_admin' })).toEqual(OK);
            expect(await resolve(headers)).toMatchObject({
                status: 'signed_in',
                context: { tenantId: P.tenantId, userId: PM, roles: ['tenant_admin'], projectIds: [P.projectId] },
            });
        });
        it('promotes a PM keeping their Projects, and records nothing when the role is unchanged', async () => {
            expect(await changeMemberRole(deps(), asAdmin(), { userId: PM, role: 'tenant_admin' })).toEqual(OK);
            expect(await memberOf(P.tenantId, PM)).toEqual({
                userId: PM,
                tenantId: P.tenantId,
                role: 'tenant_admin',
                projectIds: [P.projectId],
            });
            expect((await membershipAudits()).map((row) => [row.action, row.target, row.payload])).toEqual([
                ['membership.change_role', PM, { before: 'pm', after: 'tenant_admin' }],
            ]);
            const before = await everything();
            expect(await changeMemberRole(deps(), asAdmin(), { userId: PM, role: 'tenant_admin' })).toEqual(OK);
            expect(await everything(), 'a same-role change wrote something').toEqual(before);
        });
        it('assigns a Project of this Tenant once, and records nothing for one already held', async () => {
            expect(await assignMemberProject(deps(), asAdmin(), { userId: ADMIN2, projectId: P.projectId })).toEqual(OK);
            expect((await memberOf(P.tenantId, ADMIN2))?.projectIds).toEqual([P.projectId]);
            expect((await membershipAudits()).map((row) => [row.action, row.target, row.payload])).toEqual([
                ['membership.assign_project', ADMIN2, { before: [], after: [P.projectId] }],
            ]);
            const before = await everything();
            expect(await assignMemberProject(deps(), asAdmin(), { userId: ADMIN2, projectId: P.projectId })).toEqual(OK);
            expect(await everything(), 'assigning a held Project wrote something').toEqual(before);
        });
        it('unassigns a Project, and records nothing for one not held', async () => {
            expect(await unassignMemberProject(deps(), asAdmin(), { userId: PM, projectId: P.projectId })).toEqual(OK);
            expect((await memberOf(P.tenantId, PM))?.projectIds).toEqual([]);
            expect((await membershipAudits()).map((row) => [row.action, row.target, row.payload])).toEqual([
                ['membership.unassign_project', PM, { before: [P.projectId], after: [] }],
            ]);
            const before = await everything();
            expect(await unassignMemberProject(deps(), asAdmin(), { userId: PM, projectId: P.projectId })).toEqual(OK);
            expect(await everything(), 'unassigning a Project not held wrote something').toEqual(before);
        });
    });
    describe('refusals write nothing, for either Tenant', () => {
        const refusals = [
            ['an unknown member', () => revokeMembership(deps(), asAdmin(), { userId: ownP('nobody') }), 'not_found'],
            ['a member of the other Tenant only', () => changeMemberRole(deps(), asAdmin(), { userId: O_PM, role: 'tenant_admin' }), 'not_found'],
            ['a member of the other Tenant only (unassign)', () => unassignMemberProject(deps(), asAdmin(), { userId: O_PM, projectId: O.projectId }), 'not_found'],
            ['a Project of the other Tenant', () => assignMemberProject(deps(), asAdmin(), { userId: PM, projectId: O.projectId }), 'not_found'],
            ['an unassignable role', () => changeMemberRole(deps(), asAdmin(), { userId: PM, role: 'client_viewer' }), 'invalid_input'],
            ['a caller without tenant_admin', () => revokeMembership(deps(), requestContextFor(P.tenantId, PM), { userId: ADMIN2 }), 'not_found'],
            ['a non-admin sending malformed input', () => changeMemberRole(deps(), requestContextFor(P.tenantId, PM), { userId: '', role: 'owner' }), 'not_found'],
            ['an admin of the other Tenant acting here', () => revokeMembership(deps(), asAdmin(O_ADMIN), { userId: PM }), 'not_found'],
        ];
        it.each(refusals)('%s', async (_label, write, code) => {
            const before = await everything();
            const result = await write();
            expect(result).toMatchObject({ ok: false, error: { code } });
            expect(await everything()).toEqual(before);
        });
        it('refuses to revoke or demote the last tenant_admin — the caller included', async () => {
            await owner().transaction((tx) => tx.delete(tenantMembership).where(and(eq(tenantMembership.tenantId, P.tenantId), eq(tenantMembership.userId, ADMIN2))));
            const before = await everything();
            const refused = {
                ok: false,
                error: { code: 'invalid_input', messageKey: 'errors.invalid_input', details: { userId: [LAST_TENANT_ADMIN] } },
            };
            expect(await revokeMembership(deps(), asAdmin(), { userId: ADMIN })).toEqual(refused);
            expect(await changeMemberRole(deps(), asAdmin(), { userId: ADMIN, role: 'pm' })).toEqual(refused);
            expect(await everything()).toEqual(before);
        });
        it('refuses a caller demoted after its context was resolved', async () => {
            const stale = asAdmin(ADMIN2);
            await owner().transaction((tx) => tx
                .update(tenantMembership)
                .set({ role: 'pm' })
                .where(and(eq(tenantMembership.tenantId, P.tenantId), eq(tenantMembership.userId, ADMIN2))));
            const before = await everything();
            expect(await revokeMembership(deps(), stale, { userId: PM })).toMatchObject({ error: { code: 'not_found' } });
            expect(await everything()).toEqual(before);
        });
    });
    describe('a user with a membership in each Tenant', () => {
        it('is changed in the acting Tenant only — its other membership stays exactly as it was', async () => {
            const otherBefore = await allRows(O.tenantId);
            const steps = [
                ['promote', () => changeMemberRole(deps(), asAdmin(), { userId: BOTH, role: 'tenant_admin' })],
                ['unassign', () => unassignMemberProject(deps(), asAdmin(), { userId: BOTH, projectId: P.projectId })],
                ['assign', () => assignMemberProject(deps(), asAdmin(), { userId: BOTH, projectId: P.projectId })],
                ['revoke', () => revokeMembership(deps(), asAdmin(), { userId: BOTH })],
            ];
            for (const [label, step] of steps) {
                expect(await step(), label).toEqual(OK);
                expect(await allRows(O.tenantId), `${label} in P changed the other Tenant's rows`).toEqual(otherBefore);
            }
            expect(await memberOf(P.tenantId, BOTH)).toBeUndefined();
            expect(await memberOf(O.tenantId, BOTH)).toEqual({
                userId: BOTH,
                tenantId: O.tenantId,
                role: 'pm',
                projectIds: [O.projectId],
            });
        });
    });
    describe('probe cleanup', () => {
        it('removes a REVOKED probe member\'s user, sessions and accounts — found by its known id, not a membership', async () => {
            await signIn(EMAIL.pm);
            expect(await revokeMembership(deps(), asAdmin(), { userId: PM })).toEqual(OK);
            await removeProbeTenant(owner(), P);
            const prefix = `${P.writeOptions.idPrefix}%`;
            const left = await owner().transaction(async (tx) => ({
                users: await tx.select({ id: authUser.id }).from(authUser).where(sql `${authUser.id} LIKE ${prefix}`),
                sessions: await tx.select({ id: session.id }).from(session).where(sql `${session.userId} LIKE ${prefix}`),
                accounts: await tx.select({ id: account.id }).from(account).where(sql `${account.userId} LIKE ${prefix}`),
            }));
            expect(left).toEqual({ users: [], sessions: [], accounts: [] });
            // Later tests sign in to P again.
            await createProbeTenant(owner(), { ...P, writeOptions: { ...P.writeOptions, passwordHash } });
        });
    });
    describe('concurrent writes serialise on the one lock and never deadlock', () => {
        const admins = async () => (await membersOf(P.tenantId)).filter((row) => row.role === 'tenant_admin').map((row) => row.userId);
        beforeEach(async () => {
            // Exactly two admins, so each demotion races the last-admin rule.
            expect(await admins()).toEqual([ADMIN, ADMIN2].sort());
        });
        it('two admins demoting themselves at once: one ok, one last_tenant_admin', async () => {
            const settled = await raceBehindLock([
                () => changeMemberRole(deps(), asAdmin(ADMIN), { userId: ADMIN, role: 'pm' }),
                () => changeMemberRole(deps(), asAdmin(ADMIN2), { userId: ADMIN2, role: 'pm' }),
            ]);
            expect(settled.map(codeOf).sort()).toEqual(['invalid_input', 'ok']);
            const refused = settled.find((s) => s.result?.ok === false).result;
            expect(refused).toMatchObject({ error: { details: { userId: [LAST_TENANT_ADMIN] } } });
            expect(await admins()).toHaveLength(1);
            expect(await membershipAudits()).toHaveLength(1);
        });
        it('two admins demoting each other at once: one ok, one not_found (the loser is no admin any more)', async () => {
            const settled = await raceBehindLock([
                () => changeMemberRole(deps(), asAdmin(ADMIN), { userId: ADMIN2, role: 'pm' }),
                () => changeMemberRole(deps(), asAdmin(ADMIN2), { userId: ADMIN, role: 'pm' }),
            ]);
            expect(settled.map(codeOf).sort()).toEqual(['not_found', 'ok']);
            expect(await admins()).toHaveLength(1);
            expect(await membershipAudits()).toHaveLength(1);
        });
        it('two admins assigning Projects to each other at once: both ok', async () => {
            const settled = await raceBehindLock([
                () => assignMemberProject(deps(), asAdmin(ADMIN), { userId: ADMIN2, projectId: P.projectId }),
                () => assignMemberProject(deps(), asAdmin(ADMIN2), { userId: ADMIN, projectId: P.projectId }),
            ]);
            expect(settled.map(codeOf)).toEqual(['ok', 'ok']);
            expect((await memberOf(P.tenantId, ADMIN))?.projectIds).toEqual([P.projectId]);
            expect((await memberOf(P.tenantId, ADMIN2))?.projectIds).toEqual([P.projectId]);
            expect(await membershipAudits()).toHaveLength(2);
        });
    });
});
afterAll(async () => {
    await closeAllPools();
});
