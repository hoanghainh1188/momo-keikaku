import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeReview } from '@momo/domain';
import type { ProjectReview } from '../packages/app/src/ports/project-read';
import { MAPPING_TICKET_LIMIT } from '../packages/app/src/use-cases/get-project-mapping';
import { asOfDate, buildDemoState, currentPeriod } from '../packages/db/src/fixtures';

/**
 * The composition root's bindings — the five project writes, the eight organisation writes (story
 * 1.3 slice 2), the four membership writes (story 1.4 slice 2), then the four reads — wired to
 * spies, no database.
 *
 * The `satisfies` checks cannot see a binding pointed at the WRONG use case: `ExplainTicketsInput`
 * is assignable to `ChangeRequestCandidatesInput`, so `explainTickets` calling
 * `markChangeRequestCandidates` typechecks, and every harness test (which wires its own deps)
 * stays green. So each export is called once: exactly one tenant transaction must open, on the
 * restricted handle, for the Tenant THE SESSION RESOLVED TO; inside it exactly the matching
 * repository member must receive `({ actor: 'user:<the session's user>', at: anchor }, { ...input,
 * kind })`, and the audit sink exactly one record of the matching action.
 *
 * Story 1.4 slice 1: there is no constant Tenant or actor in the composition root any more. The
 * context comes from `resolveRequestContext` over the request's headers — here `next/headers` is
 * mocked, `@momo/db-auth`'s identity adapter answers a fake session, and `@momo/db`'s one
 * membership reader answers a fake membership — so every assertion below names the session's
 * Tenant and user, which appear nowhere in `apps/web`. The last block pins the resolution itself:
 * signed out, tampered, no access, the lazily built auth instance, and a context a server action
 * hands in.
 *
 * The organisation bindings the same way, plus the two outbound adapters the composition root
 * wires for them: `@momo/adapters` is mocked, so the test sees that the audit `at` is the Clock's
 * (`systemClock`) and a created row's id is the id port's (`uuidV7IdsOn`) — not a value the use case
 * or the binding made up.
 *
 * In `tests/`, not beside the file: it has to import and mock `@momo/db`, and AD-1 lets exactly
 * one `apps/web` file do that (`pnpm depcruise`, rule `apps-not-to-db`). `tests/` sits outside
 * that graph.
 */

const spies = vi.hoisted(() => {
  const anchor = new Date('2026-09-01T00:00:00Z');
  const repository = {
    projectAnchor: vi.fn(async (_projectId: string) => anchor),
    recordMapDisposition: vi.fn(async () => {}),
    recordPlanDisposition: vi.fn(async () => ({ wpId: 'wp-new-spy' })),
    recordExplainDisposition: vi.fn(async () => {}),
    recordChangeRequestCandidates: vi.fn(async () => {}),
    recordManualMapping: vi.fn(async () => {}),
  };
  const org = {
    findDepartment: vi.fn(async (id: string) => ({ id, name: 'Delivery' })),
    findProgram: vi.fn(async (id: string) => ({ id, departmentId: 'dep-delivery', name: 'EC platform' })),
    findProject: vi.fn(async (id: string) => ({
      id,
      name: 'EC phase 2',
      departmentId: 'dep-delivery',
      programId: 'prg-ec-platform',
    })),
    insertDepartment: vi.fn(async () => {}),
    renameDepartment: vi.fn(async () => {}),
    insertProgram: vi.fn(async () => {}),
    renameProgram: vi.fn(async () => {}),
    insertProject: vi.fn(async () => {}),
    renameProject: vi.fn(async () => {}),
    setProjectProgram: vi.fn(async () => {}),
    setProjectDepartment: vi.fn(async () => {}),
  };
  /** The session's user (below) is a Tenant Admin here, so the membership writes get past the lock. */
  const sessionUserId = '019b76da-a800-7000-8000-0c3333333333';
  const membership = {
    lockMembers: vi.fn(async (_ids: { callerId: string; targetId: string }) => [
      { userId: sessionUserId, role: 'tenant_admin', projectIds: [] as string[] },
      { userId: 'usr-member', role: 'pm', projectIds: ['prj-gone'] },
    ]),
    deleteMembership: vi.fn(async () => {}),
    setRole: vi.fn(async () => {}),
    setProjectIds: vi.fn(async () => {}),
  };
  const append = vi.fn(async (_entry: unknown) => {});
  type AuthBuild = { readonly generateId: () => string } & Record<string, unknown>;
  const authInstance = { marker: 'auth-instance' };
  const authBuilds: AuthBuild[] = [];
  /** The session the fake identity adapter answers: a user and the Tenant it last acted in. */
  const session = {
    token: 'tok-session',
    userId: sessionUserId,
    activeTenantId: 'ten-from-session' as string | null,
    locale: 'en',
  };
  const identity = {
    sessionFrom: vi.fn(async (_headers: Headers) => session as typeof session | null),
    setActiveTenant: vi.fn(async (_token: string, _tenantId: string) => {}),
    endSession: vi.fn(async (_token: string) => {}),
  };
  return {
    anchor,
    /** What the mocked `systemClock` answers — distinct from the anchor. */
    now: new Date('2026-09-21T08:00:00Z'),
    newId: '01890a5d-ac96-774b-bcce-b302099a8057',
    handle: { marker: 'restricted-handle' },
    getDb: vi.fn(),
    repository,
    org,
    membership,
    append,
    inTenantTransaction: vi.fn(
      async (_handle: unknown, _tenantId: string, work: (scope: unknown) => Promise<unknown>) =>
        work({ projectWrite: repository, org, membership, audit: { append } }),
    ),
    loadProjectBundle: vi.fn(),
    loadReview: vi.fn(),
    session,
    identity,
    membershipsOf: vi.fn(async (_handle: unknown, _userId: string) => [
      { tenantId: 'ten-from-session', role: 'pm', projectIds: ['prj-ec2'] },
    ]),
    authInstance,
    /** The middleware's instance: built WITHOUT Google (story 1.4 slice 3). */
    sessionAuthInstance: { marker: 'session-auth-instance' },
    /** Every options object `createAuth` was built with — never cleared, the instances are per process. */
    authBuilds,
    createAuth: vi.fn((options: AuthBuild) => {
      authBuilds.push(options);
      // The page instance is asked for Google; the middleware's is not (no `google` key at all).
      return 'google' in options ? authInstance : { marker: 'session-auth-instance' };
    }),
    googleRegistered: vi.fn(async (_auth: unknown) => true),
    googleSignIn: vi.fn(
      async (_auth: unknown, _headers: Headers): Promise<{ url: string; setCookies: string[] } | null> => ({
        url: 'http://127.0.0.1:4455/authorize?state=s',
        setCookies: ['momo.state=signed; Path=/'],
      }),
    ),
    sessionForMiddleware: vi.fn(async (_auth: unknown, _headers: Headers) => ({ signedIn: true, setCookies: [] })),
    requestHeaders: new Headers({ cookie: 'momo.session_token=signed' }),
  };
});

vi.mock('@momo/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@momo/db')>()),
  getDb: spies.getDb,
  inTenantTransaction: spies.inTenantTransaction,
  loadProjectBundle: spies.loadProjectBundle,
  loadReview: spies.loadReview,
  membershipsOf: spies.membershipsOf,
}));

vi.mock('@momo/db-auth', () => ({
  createAuth: spies.createAuth,
  identityOn: (auth: unknown) => {
    expect(auth).toBe(spies.authInstance);
    return spies.identity;
  },
  googleRegistered: spies.googleRegistered,
  googleSignIn: spies.googleSignIn,
  serveAllowlisted: vi.fn(),
  sessionForMiddleware: spies.sessionForMiddleware,
  signInWithPassword: vi.fn(),
  signOutOf: vi.fn(),
}));

/**
 * `next/headers` is resolved from `apps/web` (the root does not depend on `next`), so the mock is
 * registered under the path the composition root's import actually resolves to.
 */
const nextHeadersPath = await vi.hoisted(async () => {
  const { createRequire } = await import('node:module');
  return createRequire(new URL('../apps/web/package.json', import.meta.url)).resolve('next/headers');
});
vi.mock(nextHeadersPath, () => ({ headers: async () => spies.requestHeaders }));

vi.mock('@momo/adapters', () => ({
  systemClock: { now: () => spies.now, nowMs: () => spies.now.getTime() },
  uuidV7IdsOn: () => ({ next: () => spies.newId }),
}));

const APP_URL = 'postgres://momo_app:momo_app@localhost:55433/momo_keikaku';
vi.stubEnv('APP_DATABASE_URL', APP_URL);
vi.stubEnv('BETTER_AUTH_SECRET', 'web-composition-test-secret-0123456789');
vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3101');

const composition = await import('../apps/web/src/server/composition');
/** Importing the composition root builds nothing that reads configuration (`next build`). */
const authBuildsAtImport = spies.authBuilds.length;

/** The Tenant and the actor every binding must use: the SESSION's, never a constant. */
const SESSION_TENANT = 'ten-from-session';
const SESSION_ACTOR = `user:${spies.session.userId}`;

const RECORDERS = [
  'recordMapDisposition',
  'recordPlanDisposition',
  'recordExplainDisposition',
  'recordChangeRequestCandidates',
  'recordManualMapping',
] as const;

type Recorder = (typeof RECORDERS)[number];

const TICKETS = ['bk-issue-1', 'bk-issue-2'];

const CASES: readonly {
  readonly binding: string;
  readonly call: () => Promise<unknown>;
  readonly recorder: Recorder;
  readonly command: Record<string, unknown>;
  readonly action: string;
}[] = [
  {
    binding: 'mapTickets',
    call: () => composition.mapTickets({ projectId: 'prj-ec2', wpId: 'wp-1-2', ticketIds: TICKETS }),
    recorder: 'recordMapDisposition',
    command: { projectId: 'prj-ec2', wpId: 'wp-1-2', ticketIds: TICKETS, kind: 'map' },
    action: 'disposition.map',
  },
  {
    binding: 'planTicketsAsWorkPackage',
    call: () =>
      composition.planTicketsAsWorkPackage({ projectId: 'prj-ec2', name: 'Scope', ticketIds: TICKETS }),
    recorder: 'recordPlanDisposition',
    command: { projectId: 'prj-ec2', name: 'Scope', ticketIds: TICKETS, kind: 'plan' },
    action: 'disposition.plan',
  },
  {
    binding: 'explainTickets',
    call: () => composition.explainTickets({ projectId: 'prj-ec2', note: 'Why.', ticketIds: TICKETS }),
    recorder: 'recordExplainDisposition',
    command: { projectId: 'prj-ec2', note: 'Why.', ticketIds: TICKETS, kind: 'explain' },
    action: 'disposition.explain',
  },
  {
    binding: 'markChangeRequestCandidates',
    call: () => composition.markChangeRequestCandidates({ projectId: 'prj-ec2', ticketIds: TICKETS }),
    recorder: 'recordChangeRequestCandidates',
    command: { projectId: 'prj-ec2', ticketIds: TICKETS, kind: 'cr_candidate' },
    action: 'disposition.cr_candidate',
  },
  {
    binding: 'mapTicket',
    call: () => composition.mapTicket({ projectId: 'prj-ec2', ticketId: 'bk-issue-1', wpId: '' }),
    recorder: 'recordManualMapping',
    command: { projectId: 'prj-ec2', ticketId: 'bk-issue-1', wpId: '' },
    action: 'mapping.unmap',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  spies.membershipsOf.mockResolvedValue([{ tenantId: SESSION_TENANT, role: 'pm', projectIds: ['prj-ec2'] }]);
  spies.getDb.mockReturnValue(spies.handle);
  spies.session.activeTenantId = SESSION_TENANT;
  spies.identity.sessionFrom.mockImplementation(async () => spies.session);
});

describe.each(CASES)('the $binding binding', ({ call, recorder, command, action }) => {
  it(`reaches ${recorder} and nothing else, for the session's Tenant as its user, audited as ${action}`, async () => {
    expect(await call()).toEqual({ ok: true, value: undefined });

    expect(spies.getDb).toHaveBeenCalledWith(APP_URL);
    expect(spies.inTenantTransaction).toHaveBeenCalledTimes(1);
    expect(spies.inTenantTransaction).toHaveBeenCalledWith(
      spies.handle,
      SESSION_TENANT,
      expect.any(Function),
    );
    expect(spies.identity.sessionFrom).toHaveBeenCalledWith(spies.requestHeaders);
    const stamp = { actor: SESSION_ACTOR, at: spies.anchor };
    expect(spies.repository[recorder]).toHaveBeenCalledTimes(1);
    expect(spies.repository[recorder]).toHaveBeenCalledWith(stamp, command);
    for (const other of RECORDERS.filter((name) => name !== recorder)) {
      expect(spies.repository[other], `${other} must not be called`).not.toHaveBeenCalled();
    }
    for (const writer of ORG_WRITERS) {
      expect(spies.org[writer], `a project write must not reach org.${writer}`).not.toHaveBeenCalled();
    }
    expect(spies.append).toHaveBeenCalledTimes(1);
    expect(spies.append).toHaveBeenCalledWith(expect.objectContaining({ ...stamp, action }));
  });
});

const ORG_WRITERS = [
  'insertDepartment',
  'renameDepartment',
  'insertProgram',
  'renameProgram',
  'insertProject',
  'renameProject',
  'setProjectProgram',
  'setProjectDepartment',
] as const;

type OrgWriter = (typeof ORG_WRITERS)[number];

const ORG_CASES: readonly {
  readonly binding: string;
  readonly call: () => Promise<unknown>;
  readonly writer: OrgWriter;
  readonly change: Record<string, unknown>;
  readonly action: string;
  readonly target: string;
}[] = [
  {
    binding: 'createDepartment',
    call: () => composition.createDepartment({ name: 'Design' }),
    writer: 'insertDepartment',
    change: { id: spies.newId, name: 'Design' },
    action: 'department.create',
    target: spies.newId,
  },
  {
    binding: 'renameDepartment',
    call: () => composition.renameDepartment({ departmentId: 'dep-delivery', name: 'Delivery JP' }),
    writer: 'renameDepartment',
    change: { id: 'dep-delivery', name: 'Delivery JP' },
    action: 'department.rename',
    target: 'dep-delivery',
  },
  {
    binding: 'createProgram',
    call: () => composition.createProgram({ departmentId: 'dep-delivery', name: 'Retail' }),
    writer: 'insertProgram',
    change: { id: spies.newId, departmentId: 'dep-delivery', name: 'Retail' },
    action: 'program.create',
    target: spies.newId,
  },
  {
    binding: 'renameProgram',
    call: () => composition.renameProgram({ programId: 'prg-ec-platform', name: 'EC' }),
    writer: 'renameProgram',
    change: { id: 'prg-ec-platform', name: 'EC' },
    action: 'program.rename',
    target: 'prg-ec-platform',
  },
  {
    binding: 'createProject',
    call: () =>
      composition.createProject({
        name: 'EC phase 3',
        departmentId: 'dep-delivery',
        programId: 'prg-ec-platform',
        clientName: 'Osaka Retail',
        contractType: '請負',
      }),
    writer: 'insertProject',
    change: {
      id: spies.newId,
      name: 'EC phase 3',
      departmentId: 'dep-delivery',
      programId: 'prg-ec-platform',
      clientName: 'Osaka Retail',
      contractType: '請負',
      demoAnchor: spies.now,
    },
    action: 'project.create',
    target: spies.newId,
  },
  {
    binding: 'renameProject',
    call: () => composition.renameProject({ projectId: 'prj-ec2', name: 'EC phase 2b' }),
    writer: 'renameProject',
    change: { id: 'prj-ec2', name: 'EC phase 2b' },
    action: 'project.rename',
    target: 'prj-ec2',
  },
  {
    binding: 'reassignProjectProgram',
    call: () => composition.reassignProjectProgram({ projectId: 'prj-ec2', programId: null }),
    writer: 'setProjectProgram',
    change: { id: 'prj-ec2', programId: null },
    action: 'project.reassign_program',
    target: 'prj-ec2',
  },
  {
    binding: 'reassignProjectDepartment',
    call: () =>
      composition.reassignProjectDepartment({
        projectId: 'prj-ec2',
        departmentId: 'dep-delivery',
        programId: 'prg-ec-platform',
      }),
    writer: 'setProjectDepartment',
    change: { id: 'prj-ec2', departmentId: 'dep-delivery', programId: 'prg-ec-platform' },
    action: 'project.reassign_department',
    target: 'prj-ec2',
  },
];

describe.each(ORG_CASES)('the $binding organisation binding', ({ call, writer, change, action, target }) => {
  it(`reaches org.${writer} and nothing else, for the session's Tenant as its user, stamped by the Clock, audited as ${action}`, async () => {
    // A create answers the id the id port minted — the one its record names; the rest nothing.
    const created = writer.startsWith('insert');
    expect(await call()).toEqual({ ok: true, value: created ? { id: spies.newId } : undefined });

    expect(spies.getDb).toHaveBeenCalledWith(APP_URL);
    expect(spies.inTenantTransaction).toHaveBeenCalledTimes(1);
    expect(spies.inTenantTransaction).toHaveBeenCalledWith(spies.handle, SESSION_TENANT, expect.any(Function));
    expect(spies.org[writer]).toHaveBeenCalledTimes(1);
    expect(spies.org[writer]).toHaveBeenCalledWith(expect.objectContaining(change));
    for (const other of ORG_WRITERS.filter((name) => name !== writer)) {
      expect(spies.org[other], `org.${other} must not be called`).not.toHaveBeenCalled();
    }
    for (const recorder of RECORDERS) {
      expect(spies.repository[recorder], `an org write must not reach ${recorder}`).not.toHaveBeenCalled();
    }
    expect(spies.append).toHaveBeenCalledTimes(1);
    expect(spies.append).toHaveBeenCalledWith(
      expect.objectContaining({ actor: SESSION_ACTOR, at: spies.now, action, target }),
    );
  });
});

const MEMBERSHIP_WRITERS = ['deleteMembership', 'setRole', 'setProjectIds'] as const;

type MembershipWriter = (typeof MEMBERSHIP_WRITERS)[number];

/**
 * The membership bindings (story 1.4 slice 2). `ChangeMemberRoleInput`, `AssignMemberProjectInput`
 * and `UnassignMemberProjectInput` overlap enough that a binding pointed at the wrong use case could
 * typecheck, so each is called once and must reach its own writer, record its own action on the
 * member, and run as the session's Tenant Admin.
 */
const MEMBERSHIP_CASES: readonly {
  readonly binding: string;
  readonly call: () => Promise<unknown>;
  readonly writer: MembershipWriter;
  readonly change: unknown;
  readonly action: string;
}[] = [
  {
    binding: 'revokeMembership',
    call: () => composition.revokeMembership({ userId: 'usr-member' }),
    writer: 'deleteMembership',
    change: 'usr-member',
    action: 'membership.revoke',
  },
  {
    binding: 'changeMemberRole',
    call: () => composition.changeMemberRole({ userId: 'usr-member', role: 'tenant_admin' }),
    writer: 'setRole',
    change: { userId: 'usr-member', role: 'tenant_admin' },
    action: 'membership.change_role',
  },
  {
    binding: 'assignMemberProject',
    call: () => composition.assignMemberProject({ userId: 'usr-member', projectId: 'prj-ec2' }),
    writer: 'setProjectIds',
    change: { userId: 'usr-member', projectIds: ['prj-gone', 'prj-ec2'] },
    action: 'membership.assign_project',
  },
  {
    binding: 'unassignMemberProject',
    call: () => composition.unassignMemberProject({ userId: 'usr-member', projectId: 'prj-gone' }),
    writer: 'setProjectIds',
    change: { userId: 'usr-member', projectIds: [] },
    action: 'membership.unassign_project',
  },
];

describe.each(MEMBERSHIP_CASES)('the $binding membership binding', ({ call, writer, change, action }) => {
  it(`reaches membership.${writer} once, for the session's Tenant as its admin user, stamped by the Clock, audited as ${action}`, async () => {
    spies.membershipsOf.mockResolvedValue([{ tenantId: SESSION_TENANT, role: 'tenant_admin', projectIds: [] }]);
    expect(await call()).toEqual({ ok: true, value: undefined });

    expect(spies.getDb).toHaveBeenCalledWith(APP_URL);
    expect(spies.inTenantTransaction).toHaveBeenCalledTimes(1);
    expect(spies.inTenantTransaction).toHaveBeenCalledWith(spies.handle, SESSION_TENANT, expect.any(Function));
    expect(spies.membership.lockMembers).toHaveBeenCalledTimes(1);
    expect(spies.membership.lockMembers).toHaveBeenCalledWith({
      callerId: spies.session.userId,
      targetId: 'usr-member',
    });
    expect(spies.membership[writer]).toHaveBeenCalledTimes(1);
    expect(spies.membership[writer]).toHaveBeenCalledWith(change);
    for (const other of MEMBERSHIP_WRITERS.filter((name) => name !== writer)) {
      expect(spies.membership[other], `membership.${other} must not be called`).not.toHaveBeenCalled();
    }
    for (const orgWriter of ORG_WRITERS) {
      expect(spies.org[orgWriter], `a membership write must not reach org.${orgWriter}`).not.toHaveBeenCalled();
    }
    for (const recorder of RECORDERS) {
      expect(spies.repository[recorder], `a membership write must not reach ${recorder}`).not.toHaveBeenCalled();
    }
    expect(spies.append).toHaveBeenCalledTimes(1);
    expect(spies.append).toHaveBeenCalledWith(
      expect.objectContaining({ actor: SESSION_ACTOR, at: spies.now, action, target: 'usr-member' }),
    );
  });

  it('answers not_found to a session whose role is PM, opening no transaction', async () => {
    // The default membership the fake reader answers is a PM's.
    expect(await call()).toMatchObject({ ok: false, error: { code: 'not_found' } });
    expect(spies.inTenantTransaction).not.toHaveBeenCalled();
  });
});

/**
 * The read bindings, the same way: each must reach the read port as the demo Tenant, on the
 * restricted handle, and run ITS use case. The two projection reads (the web → domain/present
 * edge moved the Client View's projection and the Mapping join off the pages) both load the
 * Review, so a binding pointed at the other one would still typecheck — the value's shape is
 * what tells them apart. The Review is the demo fixture computed through the domain, no
 * database; the bundle carries the fields the projections read.
 */
function demoReview(): ProjectReview {
  const state = buildDemoState();
  const pinnedSnapshot = state.snapshots[state.snapshots.length - 1]!;
  const input = {
    project: state.project,
    calendar: state.calendar,
    wps: state.wps,
    baselineVersions: state.baselineVersions,
    activeBaselineSeq: state.activeBaselineSeq,
    ledger: state.ledger,
    mappingEvents: state.mappingEvents,
    pinnedSnapshot,
    resources: state.resources,
    period: currentPeriod(state),
    asOf: asOfDate(state),
    dispositions: [],
  };
  const bundle = {
    project: state.project,
    meta: { clientName: 'Demo Client' },
    input,
    wps: state.wps,
    rules: state.fixture.mappingRules.map((rule) => ({ ...rule, currentlyMapped: 0 })),
  };
  return { bundle, review: computeReview(input) } as unknown as ProjectReview;
}

const REVIEW = demoReview();

const READ_CASES: readonly {
  readonly binding: string;
  readonly call: () => Promise<{ ok: boolean; value?: unknown }>;
  readonly port: 'loadReview' | 'loadProjectBundle';
  readonly check: (value: unknown) => void;
}[] = [
  {
    binding: 'getProjectHeader',
    call: () => composition.getProjectHeader({ projectId: 'prj-ec2' }),
    port: 'loadProjectBundle',
    check: (value) => expect(value).toBe(REVIEW.bundle),
  },
  {
    binding: 'getProjectReview',
    call: () => composition.getProjectReview({ projectId: 'prj-ec2' }),
    port: 'loadReview',
    check: (value) => expect(value).toBe(REVIEW),
  },
  {
    binding: 'getClientView',
    call: () => composition.getClientView({ projectId: 'prj-ec2' }),
    port: 'loadReview',
    check: (value) =>
      expect(value).toMatchObject({
        clientName: 'Demo Client',
        projection: { projectName: REVIEW.bundle.project.name, evm: null },
      }),
  },
  {
    binding: 'getProjectMapping',
    call: () => composition.getProjectMapping({ projectId: 'prj-ec2' }),
    port: 'loadReview',
    check: (value) => {
      const mapping = value as { tickets: unknown[]; totalMh: bigint };
      expect(mapping.tickets).toHaveLength(MAPPING_TICKET_LIMIT);
      expect(mapping.totalMh).toBe(REVIEW.review.attribution.cumulative.totalMh);
    },
  },
];

describe.each(READ_CASES)('the $binding read binding', ({ call, port, check }) => {
  it(`reaches ${port} for the session's Tenant and returns its own use case's value`, async () => {
    spies.loadReview.mockResolvedValue(REVIEW);
    spies.loadProjectBundle.mockResolvedValue(REVIEW.bundle);

    const result = await call();
    expect(result.ok).toBe(true);
    check(result.value);

    expect(spies.getDb).toHaveBeenCalledWith(APP_URL);
    expect(spies[port]).toHaveBeenCalledTimes(1);
    expect(spies[port]).toHaveBeenCalledWith(spies.handle, SESSION_TENANT, 'prj-ec2');
    const other = port === 'loadReview' ? 'loadProjectBundle' : 'loadReview';
    expect(spies[other], `${other} must not be called`).not.toHaveBeenCalled();
    expect(spies.inTenantTransaction, 'a read must not open a write transaction').not.toHaveBeenCalled();
    for (const recorder of RECORDERS) {
      expect(spies.repository[recorder], `a read must not reach ${recorder}`).not.toHaveBeenCalled();
    }
    for (const writer of ORG_WRITERS) {
      expect(spies.org[writer], `a read must not reach org.${writer}`).not.toHaveBeenCalled();
    }
  });
});

/**
 * The request context itself (story 1.4 slice 1): where it comes from, and what happens when the
 * request does not resolve to one. A redirect from `next/navigation` throws an error whose digest
 * names the target; nothing past it runs, so no port is reached.
 */
describe('the request context the bindings run with', () => {
  const redirectTarget = async (call: () => Promise<unknown>): Promise<string> => {
    try {
      await call();
    } catch (error) {
      const digest = (error as { digest?: unknown }).digest;
      if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) return digest.split(';')[2]!;
      throw error;
    }
    throw new Error('expected a redirect, and the binding returned');
  };

  const reachedNothing = () => {
    expect(spies.loadReview).not.toHaveBeenCalled();
    expect(spies.loadProjectBundle).not.toHaveBeenCalled();
    expect(spies.inTenantTransaction).not.toHaveBeenCalled();
  };

  it('redirects a signed-out request to /sign-in before any port is reached', async () => {
    spies.identity.sessionFrom.mockResolvedValue(null);
    expect(await redirectTarget(() => composition.getProjectReview({ projectId: 'prj-ec2' }))).toBe('/sign-in');
    expect(await redirectTarget(() => composition.mapTicket({ projectId: 'prj-ec2', ticketId: 't', wpId: '' }))).toBe(
      '/sign-in',
    );
    reachedNothing();
  });

  it('signs out a session whose active Tenant has no membership — deleting it — and redirects', async () => {
    spies.session.activeTenantId = 'ten-tampered';
    expect(await redirectTarget(() => composition.getProjectHeader({ projectId: 'prj-ec2' }))).toBe('/sign-in');
    expect(spies.identity.endSession).toHaveBeenCalledWith('tok-session');
    reachedNothing();
  });

  it('redirects a signed-in user with no membership to /no-access', async () => {
    spies.membershipsOf.mockResolvedValueOnce([]);
    spies.session.activeTenantId = null;
    expect(await redirectTarget(() => composition.getClientView({ projectId: 'prj-ec2' }))).toBe('/no-access');
    reachedNothing();
  });

  it('runs with the context a server action hands in, resolving nothing itself', async () => {
    spies.loadReview.mockResolvedValue(REVIEW);
    const handed = {
      tenantId: 'ten-handed',
      userId: 'user-handed',
      roles: ['pm'] as const,
      projectIds: [],
      locale: 'en' as const,
    };
    expect((await composition.getProjectReview({ projectId: 'prj-ec2' }, handed)).ok).toBe(true);
    expect(spies.loadReview).toHaveBeenCalledWith(spies.handle, 'ten-handed', 'prj-ec2');
    expect(spies.identity.sessionFrom).not.toHaveBeenCalled();
  });

  it('builds the page auth instance lazily, from the configuration, and reuses it', async () => {
    await composition.signInState();
    await composition.signInState();
    // One build for the whole process (every test above resolved a context through it), and it
    // was built from the configuration, with the id port as its id generator.
    expect(authBuildsAtImport, 'importing the composition root built the auth instance').toBe(0);
    expect(spies.authBuilds).toHaveLength(1);
    expect(spies.authBuilds[0]).toMatchObject({
      db: spies.handle,
      secret: 'web-composition-test-secret-0123456789',
      baseURL: 'http://localhost:3101',
      idleHours: 8,
      // AUTH_GOOGLE is not set: Google is off, and the instance is told so.
      google: null,
    });
    expect(spies.authBuilds[0]!.generateId()).toBe(spies.newId);
  });

  it('answers whether Google is offered from the page instance\'s registration (story 1.4 slice 3)', async () => {
    spies.googleRegistered.mockResolvedValueOnce(false);
    expect(await composition.googleEnabled()).toBe(false);
    expect(await composition.googleEnabled()).toBe(true);
    for (const [auth] of spies.googleRegistered.mock.calls) expect(auth).toBe(spies.authInstance);
  });

  it('starts a Google sign-in on the page instance with the request\'s headers, answering the URL only', async () => {
    expect(await composition.googleSignIn()).toBe('http://127.0.0.1:4455/authorize?state=s');
    expect(spies.googleSignIn).toHaveBeenCalledWith(spies.authInstance, expect.any(Headers));
    expect(spies.googleSignIn.mock.calls[0]![1].get('cookie')).toBe('momo.session_token=signed');
    spies.googleSignIn.mockResolvedValueOnce(null);
    expect(await composition.googleSignIn()).toBeNull();
  });

  it('refreshes the middleware\'s session on an instance of its own, built without Google', async () => {
    const buildsBefore = spies.authBuilds.length;
    const headers = new Headers({ cookie: 'momo.session_token=signed' });
    expect(await composition.refreshSession(headers)).toEqual({ signedIn: true, setCookies: [] });
    await composition.refreshSession(headers);
    const [auth, passed] = spies.sessionForMiddleware.mock.calls[0]!;
    expect(auth).not.toBe(spies.authInstance);
    expect(auth).toEqual({ marker: 'session-auth-instance' });
    expect(passed).toBe(headers);
    // Built once, lazily, from the same configuration — and with no `google` option at all.
    expect(spies.authBuilds.length - buildsBefore).toBe(1);
    const build = spies.authBuilds.at(-1)!;
    expect(build).not.toHaveProperty('google');
    expect(build).toMatchObject({ db: spies.handle, secret: 'web-composition-test-secret-0123456789', idleHours: 8 });
  });

  it('answers the non-redirecting sign-in state for the root layout and /no-access', async () => {
    expect(await composition.signInState()).toBe('signed_in');
    spies.identity.sessionFrom.mockResolvedValueOnce(null);
    expect(await composition.signInState()).toBe('signed_out');
  });
});

/**
 * "No constant tenant id or actor literal remains in apps/web" (story 1.4 slice 1). Scanned as
 * text, over every source file of the app: the demo Tenant's id, the demo users' ids, an audit
 * actor literal, `DEMO_TENANT_ID`, or an object literal stating a `tenantId` would each be a way
 * for a page or the composition root to act as somebody the session did not resolve to.
 */
describe('apps/web states no Tenant and no actor of its own', () => {
  it('carries no tenant id, demo user id, actor literal or tenantId literal in any source file', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const { DEMO_USERS } = await import('../packages/db/src/demo-identities');
    const { DEMO_TENANT_ID } = await import('../packages/db/src/repo');

    const root = fileURLToPath(new URL('../apps/web/src/', import.meta.url));
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
      });

    const banned: readonly (readonly [string, RegExp])[] = [
      ['the demo Tenant id', new RegExp(DEMO_TENANT_ID)],
      ['DEMO_TENANT_ID', /\bDEMO_TENANT_ID\b/],
      ...Object.values(DEMO_USERS).map((user) => [`a demo user id (${user.email})`, new RegExp(user.id)] as const),
      ['an audit actor literal', /['"`]user:/],
      ['a tenantId stated as a literal', /\btenantId\s*:/],
      ['a constant actor', /\bactor\s*:/],
    ];

    const offences = walk(root).flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return banned.filter(([, pattern]) => pattern.test(text)).map(([what]) => `${file}: ${what}`);
    });
    expect(offences).toEqual([]);
  });
});
