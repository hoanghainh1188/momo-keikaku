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
    workPackageInProject: vi.fn(async (_projectId: string, _wpId: string) => true),
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
  const resources = {
    findDepartment: vi.fn(async (id: string) => ({ id })),
    findResource: vi.fn(async (id: string) => ({
      id,
      departmentId: 'dep-delivery',
      name: 'Linh',
      role: 'PM',
    })),
    findProject: vi.fn(async (id: string) => ({ id })),
    insertResource: vi.fn(async () => {}),
    appendResourceRate: vi.fn(async () => {}),
    appendProjectDefaultRate: vi.fn(async () => {}),
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
  // Typed with their real parameters, so `mock.calls[0]![1]` is the `Headers` the assertions read
  // rather than an empty tuple.
  const signInWithPassword = vi.fn(
    async (_auth: unknown, _headers: Headers, _credentials: { email: string; password: string }) => true,
  );
  const signOutOf = vi.fn(async (_auth: unknown, _headers: Headers) => {});
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
    lookupUser: vi.fn(async (userId: string) => ({
      userId,
      email: 'admin@example.test',
      locale: 'en',
      name: 'Session Admin',
    })),
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
    resources,
    membership,
    append,
    inTenantTransaction: vi.fn(
      async (_handle: unknown, _tenantId: string, work: (scope: unknown) => Promise<unknown>) =>
        work({ projectWrite: repository, org, resources, membership, audit: { append } }),
    ),
    loadProjectBundle: vi.fn(),
    loadReview: vi.fn(),
    listAuditLog: vi.fn(
      async (): Promise<
        readonly {
          seq: number;
          actor: string;
          action: string;
          target: string;
          payload: unknown;
          at: Date;
        }[]
      > => [],
    ),
    listDepartments: vi.fn(async (): Promise<readonly { id: string; name: string }[]> => []),
    listPrograms: vi.fn(
      async (): Promise<
        readonly {
          id: string;
          departmentId: string;
          departmentName: string;
          name: string;
        }[]
      > => [],
    ),
    listProjects: vi.fn(
      async (): Promise<
        readonly {
          id: string;
          name: string;
          departmentId: string;
          departmentName: string;
          programId: string | null;
          programName: string | null;
        }[]
      > => [],
    ),
    session,
    identity,
    membershipsOf: vi.fn(async (_handle: unknown, _userId: string) => [
      { tenantId: 'ten-from-session', role: 'pm', projectIds: ['prj-ec2'] },
    ]),
    authInstance,
    signInWithPassword,
    signOutOf,
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
    /** Story 1.4 slice 4: the identity-event writer and the two reset bindings. */
    identityEventRecord: vi.fn(async (_entry: unknown) => {}),
    requestPasswordReset: vi.fn(async (_auth: unknown, _headers: Headers, _email: string) => true),
    resetPassword: vi.fn(
      async (_auth: unknown, _headers: Headers, _input: { token: string; password: string }) => true,
    ),
  };
});

vi.mock('@momo/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@momo/db')>()),
  getDb: spies.getDb,
  inTenantTransaction: spies.inTenantTransaction,
  loadProjectBundle: spies.loadProjectBundle,
  loadReview: spies.loadReview,
  listAuditLog: spies.listAuditLog,
  listDepartments: spies.listDepartments,
  listPrograms: spies.listPrograms,
  listProjects: spies.listProjects,
  membershipsOf: spies.membershipsOf,
  identityEventWriterOn: (handle: unknown) => {
    expect(handle).toBe(spies.handle);
    return { record: spies.identityEventRecord };
  },
}));

vi.mock('@momo/db-auth', () => ({
  createAuth: spies.createAuth,
  identityOn: (auth: unknown, _db: unknown) => {
    expect(auth).toBe(spies.authInstance);
    return spies.identity;
  },
  lookupUserOn: (handle: unknown, userId: string) => {
    expect(handle).toBe(spies.handle);
    return spies.identity.lookupUser(userId);
  },
  googleRegistered: spies.googleRegistered,
  googleSignIn: spies.googleSignIn,
  requestPasswordReset: spies.requestPasswordReset,
  resetPassword: spies.resetPassword,
  resetPasswordExpiryHours: () => 1,
  serveAllowlisted: vi.fn(),
  sessionForMiddleware: spies.sessionForMiddleware,
  signInWithPassword: spies.signInWithPassword,
  signOutOf: spies.signOutOf,
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
  fixtureClockOn: () => ({ now: () => spies.now, nowMs: () => spies.now.getTime() }),
  productClockOn: () => ({ now: () => spies.now, nowMs: () => spies.now.getTime() }),
  DEMO_LATEST_OBSERVED_OFFSET_MS: -2 * 3_600_000,
  uuidV7IdsOn: () => ({ next: () => spies.newId }),
  mailerConsoleOn: (sink: (line: string) => void) => ({
    send: async (message: { to: string; subject: string; text: string }) => {
      sink(`to: ${message.to}\nsubject: ${message.subject}\n\n${message.text}`);
    },
  }),
  credentialsAesOn: () => ({
    keyId: 'web-composition-test',
    encrypt: () => ({
      ciphertext: Buffer.from('c'),
      nonce: Buffer.from('n-----------'),
      keyId: 'web-composition-test',
    }),
    decrypt: () => ({ apiKey: 'k' }),
  }),
  backlogHttpOn: () => ({
    readScope: async () => {
      throw new Error('backlogHttpOn stub');
    },
  }),
  fixtureReplayOn: () => ({
    readScope: async () => {
      throw new Error('fixtureReplayOn stub');
    },
  }),
}));

const APP_URL = 'postgres://momo_app:momo_app@localhost:55433/momo_keikaku';
vi.stubEnv('APP_DATABASE_URL', APP_URL);
vi.stubEnv('BETTER_AUTH_SECRET', 'web-composition-test-secret-0123456789');
vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3101');
vi.stubEnv('CREDENTIALS_CRYPTO', 'local');
vi.stubEnv('CREDENTIALS_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
vi.stubEnv('CREDENTIALS_KEY_ID', 'web-composition-test');

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
    // `wpId` is issued by the composition root's real UUIDv7 id port, so it is matched by shape
    // rather than by value — what this pins is that the use case hands one DOWN, instead of the
    // repository building `wp-new-<anchor ms>` for itself (retro audit finding A1).
    command: {
      projectId: 'prj-ec2',
      name: 'Scope',
      ticketIds: TICKETS,
      kind: 'plan',
      wpId: expect.any(String),
    },
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
  beforeEach(() => {
    // Story 1.5: organisation writes declare `tenant_admin` only.
    spies.membershipsOf.mockResolvedValue([{ tenantId: SESSION_TENANT, role: 'tenant_admin', projectIds: [] }]);
  });

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
    // Story 1.6: createProject dual-writes the first project_default_rate_entry; other org writes
    // must not touch the Resource/Rate repository.
    if (writer === 'insertProject') {
      expect(spies.resources.appendProjectDefaultRate).toHaveBeenCalledTimes(1);
      expect(spies.resources.appendProjectDefaultRate).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: spies.newId, yenPerHour: 0 }),
      );
    } else {
      expect(spies.resources.appendProjectDefaultRate).not.toHaveBeenCalled();
    }
    expect(spies.resources.insertResource).not.toHaveBeenCalled();
    expect(spies.resources.appendResourceRate).not.toHaveBeenCalled();
    for (const recorder of RECORDERS) {
      expect(spies.repository[recorder], `an org write must not reach ${recorder}`).not.toHaveBeenCalled();
    }
    expect(spies.append).toHaveBeenCalledTimes(1);
    expect(spies.append).toHaveBeenCalledWith(
      expect.objectContaining({ actor: SESSION_ACTOR, at: spies.now, action, target }),
    );
  });
});

const RESOURCE_WRITERS = ['insertResource', 'appendResourceRate', 'appendProjectDefaultRate'] as const;
type ResourceWriter = (typeof RESOURCE_WRITERS)[number];

const RESOURCE_CASES: readonly {
  readonly binding: string;
  readonly call: () => Promise<unknown>;
  readonly writer: ResourceWriter;
  readonly change: Record<string, unknown>;
  readonly action: string;
  readonly target: string;
}[] = [
  {
    binding: 'createResource',
    call: () =>
      composition.createResource({ departmentId: 'dep-delivery', name: 'Minh', role: 'Engineer' }),
    writer: 'insertResource',
    change: { id: spies.newId, departmentId: 'dep-delivery', name: 'Minh', role: 'Engineer' },
    action: 'resource.create',
    target: spies.newId,
  },
  {
    binding: 'appendResourceRate',
    call: () =>
      composition.appendResourceRate({
        resourceId: 'res-linh',
        effectiveFrom: '2026-06-01',
        yenPerHour: 6500,
      }),
    writer: 'appendResourceRate',
    change: { resourceId: 'res-linh', effectiveFrom: '2026-06-01', yenPerHour: 6500 },
    action: 'rate.append',
    target: 'res-linh',
  },
  {
    binding: 'appendProjectDefaultRate',
    call: () =>
      composition.appendProjectDefaultRate({
        projectId: 'prj-ec2',
        effectiveFrom: '2026-06-01',
        yenPerHour: 4200,
      }),
    writer: 'appendProjectDefaultRate',
    change: { projectId: 'prj-ec2', effectiveFrom: '2026-06-01', yenPerHour: 4200 },
    action: 'project_default_rate.append',
    target: 'prj-ec2',
  },
];

describe.each(RESOURCE_CASES)('the $binding resource binding', ({ call, writer, change, action, target }) => {
  beforeEach(() => {
    spies.membershipsOf.mockResolvedValue([{ tenantId: SESSION_TENANT, role: 'tenant_admin', projectIds: [] }]);
  });

  it(`reaches resources.${writer}, for the session's Tenant as its user, stamped by the Clock, audited as ${action}`, async () => {
    const created = writer === 'insertResource';
    expect(await call()).toEqual({ ok: true, value: created ? { id: spies.newId } : undefined });

    expect(spies.inTenantTransaction).toHaveBeenCalledTimes(1);
    expect(spies.resources[writer]).toHaveBeenCalledTimes(1);
    expect(spies.resources[writer]).toHaveBeenCalledWith(expect.objectContaining(change));
    for (const other of RESOURCE_WRITERS.filter((name) => name !== writer)) {
      expect(spies.resources[other], `resources.${other} must not be called`).not.toHaveBeenCalled();
    }
    for (const orgWriter of ORG_WRITERS) {
      expect(spies.org[orgWriter], `a resource write must not reach org.${orgWriter}`).not.toHaveBeenCalled();
    }
    expect(spies.append).toHaveBeenCalledTimes(1);
    expect(spies.append).toHaveBeenCalledWith(
      expect.objectContaining({ actor: SESSION_ACTOR, at: spies.now, action, target }),
    );
  });

  it('answers not_found to a session whose role is PM for Rate writes, opening no transaction', async () => {
    if (writer === 'insertResource') return; // PM may create Resources
    // Override the beforeEach admin membership — Rate writes are tenant_admin only.
    spies.membershipsOf.mockResolvedValue([{ tenantId: SESSION_TENANT, role: 'pm', projectIds: ['prj-ec2'] }]);
    expect(await call()).toMatchObject({ ok: false, error: { code: 'not_found' } });
    expect(spies.inTenantTransaction).not.toHaveBeenCalled();
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
 * restricted handle, and run ITS use case. The Review read and the Mapping projection (the
 * web → domain/present edge moved the Mapping join off the page) both load the Review, so a
 * binding pointed at the other one would still typecheck — the value's shape is what tells
 * them apart. The Review is the demo fixture computed through the domain, no database; the
 * bundle carries the fields the projection reads.
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

describe('the listAuditLog read binding (story 1.7)', () => {
  it('reaches repo listAuditLog for the session Tenant and resolves actor email', async () => {
    spies.membershipsOf.mockResolvedValue([
      { tenantId: SESSION_TENANT, role: 'tenant_admin', projectIds: [] },
    ]);
    spies.listAuditLog.mockResolvedValue([
      {
        seq: 9,
        actor: `user:${spies.session.userId}`,
        action: 'department.create',
        target: 'dep-1',
        payload: { name: 'Delivery' },
        at: new Date('2026-09-10T00:00:00Z'),
      },
    ]);

    const result = await composition.listAuditLog({});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows).toHaveLength(1);
    expect(result.value.rows[0]).toMatchObject({
      action: 'department.create',
      target: 'dep-1',
      actorDisplay: 'admin@example.test',
    });
    expect(spies.listAuditLog).toHaveBeenCalledWith(spies.handle, SESSION_TENANT, {});
    expect(spies.identity.lookupUser).toHaveBeenCalledWith(spies.session.userId);
    expect(spies.loadReview, 'audit read must not load a Project').not.toHaveBeenCalled();
    expect(spies.inTenantTransaction, 'a read must not open a write transaction').not.toHaveBeenCalled();
  });
});

describe('the organisation list read bindings (story 2.17)', () => {
  beforeEach(() => {
    spies.membershipsOf.mockResolvedValue([
      { tenantId: SESSION_TENANT, role: 'tenant_admin', projectIds: [] },
    ]);
  });

  it('listDepartments reaches the repo for the session Tenant', async () => {
    spies.listDepartments.mockResolvedValue([{ id: 'dep-1', name: 'Delivery' }]);
    const result = await composition.listDepartments();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows).toEqual([{ id: 'dep-1', name: 'Delivery' }]);
    expect(spies.listDepartments).toHaveBeenCalledWith(spies.handle, SESSION_TENANT);
    expect(spies.inTenantTransaction).not.toHaveBeenCalled();
  });

  it('listPrograms reaches the repo for the session Tenant', async () => {
    spies.listPrograms.mockResolvedValue([
      {
        id: 'prog-1',
        departmentId: 'dep-1',
        departmentName: 'Delivery',
        name: 'Phase 2',
      },
    ]);
    const result = await composition.listPrograms();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows[0]?.name).toBe('Phase 2');
    expect(spies.listPrograms).toHaveBeenCalledWith(spies.handle, SESSION_TENANT);
  });

  it('listProjects reaches the repo for the session Tenant', async () => {
    spies.listProjects.mockResolvedValue([
      {
        id: 'prj-1',
        name: 'EC',
        departmentId: 'dep-1',
        departmentName: 'Delivery',
        programId: 'prog-1',
        programName: 'Phase 2',
      },
    ]);
    const result = await composition.listProjects();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows[0]?.id).toBe('prj-1');
    expect(spies.listProjects).toHaveBeenCalledWith(spies.handle, SESSION_TENANT);
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
    expect(await redirectTarget(() => composition.getProjectMapping({ projectId: 'prj-ec2' }))).toBe('/no-access');
    reachedNothing();
  });

  it('runs with the context a server action hands in, resolving nothing itself', async () => {
    spies.loadReview.mockResolvedValue(REVIEW);
    const handed = {
      tenantId: 'ten-handed',
      userId: 'user-handed',
      roles: ['pm'] as const,
      projectIds: ['prj-ec2'],
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
    // Story 1.4 slice 4: the mailer, `now` and the identity-event writer, fed into the SAME
    // options value both instances are built from (AD-1's no-drift rule).
    expect(spies.authBuilds[0]!.mailer).toEqual({ send: expect.any(Function) });
    expect((spies.authBuilds[0]!.now as () => Date)()).toBe(spies.now);
    expect(spies.authBuilds[0]!.identityEvents).toEqual({ record: spies.identityEventRecord });
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

  it('requests a password reset on the page instance with the request\'s headers (story 1.4 slice 4)', async () => {
    await composition.requestPasswordReset('hoang@momo-digital.example');
    expect(spies.requestPasswordReset).toHaveBeenCalledWith(
      spies.authInstance,
      expect.any(Headers),
      'hoang@momo-digital.example',
    );
    expect(spies.requestPasswordReset.mock.calls[0]![1].get('cookie')).toBe('momo.session_token=signed');
  });

  it('consumes a reset token on the page instance, answering the binding\'s boolean', async () => {
    spies.resetPassword.mockResolvedValueOnce(true);
    expect(await composition.resetPassword({ token: 'tok-1', password: 'new-password' })).toBe(true);
    expect(spies.resetPassword).toHaveBeenCalledWith(spies.authInstance, expect.any(Headers), {
      token: 'tok-1',
      password: 'new-password',
    });

    spies.resetPassword.mockResolvedValueOnce(false);
    expect(await composition.resetPassword({ token: 'tok-2', password: 'x' })).toBe(false);
  });

  it('fails naming the missing adapter when MAILER=ses, on the first binding that builds auth', async () => {
    // A fresh module instance, so this file's already-built `mailerInstance`/`authInstance`
    // singletons (memoised on THIS import of composition.ts) cannot mask the failure.
    vi.resetModules();
    vi.stubEnv('MAILER', 'ses');
    try {
      const freshComposition = await import('../apps/web/src/server/composition');
      await expect(freshComposition.requestPasswordReset('someone@example.test')).rejects.toThrow(
        /MAILER=ses/,
      );
    } finally {
      vi.stubEnv('MAILER', 'console');
      vi.resetModules();
    }
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

    const files = walk(root);
    // A FLOOR, so the scan cannot pass having read nothing. `expect(offences).toEqual([])` is
    // vacuously true for an empty file list, and this is the only gate on "no constant Tenant id
    // or actor literal remains in apps/web" — a moved or renamed source root would retire it in
    // silence. The number is a floor, not a count: it only has to notice the directory vanishing.
    expect(files.length, 'the apps/web scan found no source file — has src/ moved?').toBeGreaterThan(20);

    const offences = files.flatMap((file) => {
      // Comments stripped first, as `packages/db/src/source-discipline.test.ts` does: a JSDoc
      // example or a prose sentence naming `tenantId:` is not a constant in the code.
      const text = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      return banned.filter(([, pattern]) => pattern.test(text)).map(([what]) => `${file}: ${what}`);
    });
    expect(offences).toEqual([]);
  });
});

/**
 * The one string the web edge and `@momo/db-auth` must agree on, and cannot share. Better Auth
 * reads `GOOGLE_REFUSED_URL` as `onAPIError.errorURL`, so every OAuth refusal lands there; the
 * sign-in action sends its own could-not-even-start refusal to the same place. AD-1 lets only the
 * composition root import that package, and both are route modules, so one imports the other is
 * not available — a second declaration is. This test is what keeps the two honest, so a change to
 * either is a change that fails here rather than a page that quietly never renders its message.
 */
describe('the Google refusal URL', () => {
  it('is the same string in the web edge as in the auth package', async () => {
    const [{ GOOGLE_REFUSED }, { GOOGLE_REFUSED_URL }] = await Promise.all([
      import('../apps/web/src/app/sign-in/google-refusal'),
      import('../packages/db/auth/src/google'),
    ]);
    expect(GOOGLE_REFUSED).toBe(GOOGLE_REFUSED_URL);
  });
});

/**
 * THE HTTP SURFACE'S INSTANCE. `handleAuthRequest` is the only way into Better Auth over HTTP, and
 * it must be built from the PAGE instance: the middleware's is created without Google, so
 * `servedEndpoints` omits `GET /callback/google` and every Google sign-in would 404 on its return
 * leg — in production only, because both functions return `Auth` and nothing here called this
 * export. The route module forwards every method to it, so a dropped export is the same failure.
 */
describe('the auth route handler', () => {
  it('serves the allowlist of the page instance, not the middleware\'s', async () => {
    const { serveAllowlisted } = await import('../packages/db/auth/src/index');
    const served = vi.mocked(serveAllowlisted);
    const answer = new Response('ok');
    served.mockReturnValue(async () => answer);

    const response = await composition.handleAuthRequest(
      new Request('http://localhost:3101/api/auth/get-session'),
    );
    expect(response).toBe(answer);
    expect(served).toHaveBeenCalledWith(spies.authInstance);
  });

  // NOT asserted here: that the route module exports the same handler for every method. Importing
  // `apps/web/src/app/api/auth/[...all]/route` from a root-level test pulls it into the ROOT
  // tsconfig's program, which has no `@/*` alias — that lives in apps/web's — so the import breaks
  // `pnpm typecheck`. A co-located test under apps/web could do it; the instance, which is the
  // half that fails silently in production, is covered above.
});

/**
 * The reset link's lifetime, stated twice for the same reason `GOOGLE_REFUSED` is: AD-1 lets only
 * the composition root import `@momo/db-auth`, and the forgot-password page is a route module. The
 * mail copy derives from the constant; the page cannot, so this is what keeps them equal.
 */
describe('the reset link lifetime', () => {
  it('is the same number of hours on the page as in the auth package', async () => {
    const [{ RESET_LINK_HOURS }, { RESET_PASSWORD_TOKEN_EXPIRES_IN_SECONDS }] = await Promise.all([
      import('../apps/web/src/app/forgot-password/reset-link-hours'),
      import('../packages/db/auth/src/reset'),
    ]);
    expect(RESET_LINK_HOURS * 3600).toBe(RESET_PASSWORD_TOKEN_EXPIRES_IN_SECONDS);
  });
});

/**
 * THE TWO BINDINGS THE PER-BINDING PASS MISSED. `signInWithPassword` and `signOutOf` were stubbed
 * in the module mock and asserted nowhere, while every other identity binding added by this story
 * got a block. Dropping the RETURN from `signInWithEmail` — `await` instead of `return` — makes
 * every sign-in read as a refusal, and nothing failed: the action's own test mocks the binding
 * away, and the DB suites call `signInWithPassword` on an instance they build themselves.
 */
describe('the password sign-in and sign-out bindings', () => {
  it('signs in on the page instance, with the request\'s headers, answering what the binding answered', async () => {
    spies.signInWithPassword.mockResolvedValueOnce(true);
    expect(await composition.signInWithEmail({ email: 'hoang@momo-digital.example', password: 'pw' })).toBe(true);
    expect(spies.signInWithPassword).toHaveBeenCalledWith(spies.authInstance, expect.any(Headers), {
      email: 'hoang@momo-digital.example',
      password: 'pw',
    });
    expect(spies.signInWithPassword.mock.calls[0]![1].get('cookie')).toBe('momo.session_token=signed');

    spies.signInWithPassword.mockResolvedValueOnce(false);
    expect(await composition.signInWithEmail({ email: 'nobody@momo-digital.example', password: 'pw' })).toBe(false);
  });

  it('signs out on the page instance, with the request\'s headers', async () => {
    await composition.signOut();
    expect(spies.signOutOf).toHaveBeenCalledWith(spies.authInstance, expect.any(Headers));
    expect(spies.signOutOf.mock.calls[0]![1].get('cookie')).toBe('momo.session_token=signed');
  });
});
