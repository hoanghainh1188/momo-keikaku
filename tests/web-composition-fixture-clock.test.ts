/**
 * Story 1.8 matrix: under CLOCK_MODE=fixture, Better Auth / identity ids stay on
 * `systemClock` while product writes use the fixture Clock.
 *
 * Separate from `web-composition.test.ts` so env + mocks are set BEFORE the composition
 * root is imported (its product Clock is memoised on first use).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('DEPLOYMENT', 'local');
vi.stubEnv('CLOCK_MODE', 'fixture');
vi.stubEnv('FIXTURE_TIME_ANCHOR', '2026-09-16T09:00:00.000Z');
vi.stubEnv('APP_DATABASE_URL', 'postgres://momo_app:momo_app@localhost:55433/momo_keikaku');
vi.stubEnv('BETTER_AUTH_SECRET', 'web-composition-test-secret-0123456789');
vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3101');
vi.stubEnv('MAILER', 'console');

const spies = vi.hoisted(() => {
  const WALL = new Date('2026-09-21T08:00:00.000Z');
  const FIXTURE = new Date('2026-09-16T09:00:00.000Z');
  const sessionUserId = 'usr-session';
  const authBuilds: {
    now?: () => Date;
    generateId?: () => string;
    google?: unknown;
    mailer?: unknown;
    identityEvents?: unknown;
  }[] = [];
  const append = vi.fn(async () => {});
  const getDb = vi.fn();
  const org = {
    findDepartment: vi.fn(async () => ({ id: 'dep-delivery', name: 'Delivery' })),
    insertDepartment: vi.fn(async () => {}),
    findProgram: vi.fn(),
    insertProgram: vi.fn(),
    renameProgram: vi.fn(),
    findProject: vi.fn(),
    insertProject: vi.fn(),
    renameProject: vi.fn(),
    setProjectProgram: vi.fn(),
    setProjectDepartment: vi.fn(),
  };
  const repository = {
    findProject: vi.fn(async () => ({ id: 'prj-ec2', demoAnchor: WALL })),
    recordMapDisposition: vi.fn(),
    recordPlanDisposition: vi.fn(),
    recordExplainDisposition: vi.fn(),
    recordChangeRequestCandidates: vi.fn(),
    recordManualMapping: vi.fn(),
  };
  const resources = {
    findResource: vi.fn(),
    insertResource: vi.fn(),
    appendResourceRate: vi.fn(),
    appendProjectDefaultRate: vi.fn(),
    findProject: vi.fn(),
  };
  const membership = {
    lockMember: vi.fn(),
    updateRole: vi.fn(),
    assignProject: vi.fn(),
    unassignProject: vi.fn(),
    revoke: vi.fn(),
    insert: vi.fn(),
  };
  const handle = { marker: 'restricted-handle' };
  const inTenantTransaction = vi.fn(
    async (_h: unknown, _t: string, work: (scope: unknown) => Promise<unknown>) =>
      work({
        projectWrite: repository,
        org,
        resources,
        membership,
        audit: { append },
      }),
  );
  const identityEventRecord = vi.fn(async () => {});
  const authInstance = { marker: 'auth-instance' };
  return {
    WALL,
    FIXTURE,
    newId: '01890a5d-ac96-774b-bcce-b302099a8057',
    handle,
    append,
    getDb,
    org,
    repository,
    resources,
    membership,
    inTenantTransaction,
    authBuilds,
    authInstance,
    createAuth: vi.fn((options: (typeof authBuilds)[number]) => {
      authBuilds.push(options);
      return authInstance;
    }),
    identity: {
      sessionFrom: vi.fn(async () => ({
        token: 'tok',
        userId: sessionUserId,
        activeTenantId: 'ten-from-session',
        locale: 'en',
      })),
      setActiveTenant: vi.fn(),
      endSession: vi.fn(),
      lookupUser: vi.fn(async (userId: string) => ({
        userId,
        email: 'admin@example.test',
        locale: 'en',
        name: 'Admin',
      })),
    },
    membershipsOf: vi.fn(async () => [
      { tenantId: 'ten-from-session', role: 'tenant_admin', projectIds: [] as string[] },
    ]),
    identityEventRecord,
    uuidV7ClockArg: null as { now: () => Date; nowMs: () => number } | null,
    fixtureClockOn: vi.fn(() => ({
      now: () => FIXTURE,
      nowMs: () => FIXTURE.getTime(),
    })),
  };
});

vi.mock('@momo/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@momo/db')>()),
  getDb: spies.getDb,
  inTenantTransaction: spies.inTenantTransaction,
  membershipsOf: spies.membershipsOf,
  identityEventWriterOn: (handle: unknown) => {
    expect(handle).toBe(spies.handle);
    return { record: spies.identityEventRecord };
  },
}));

vi.mock('@momo/db-auth', () => ({
  createAuth: spies.createAuth,
  identityOn: (auth: unknown) => {
    expect(auth).toBe(spies.authInstance);
    return spies.identity;
  },
  lookupUserOn: (handle: unknown, userId: string) => {
    expect(handle).toBe(spies.handle);
    return spies.identity.lookupUser(userId);
  },
  googleRegistered: vi.fn(async () => false),
  googleSignIn: vi.fn(),
  serveAllowlisted: vi.fn(),
  sessionForMiddleware: vi.fn(),
  signInWithPassword: vi.fn(),
  signOutOf: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
}));

vi.mock('@momo/adapters', () => {
  const systemClock = {
    now: () => spies.WALL,
    nowMs: () => spies.WALL.getTime(),
  };
  return {
    systemClock,
    fixtureClockOn: spies.fixtureClockOn,
    uuidV7IdsOn: (clock: { now: () => Date; nowMs: () => number }) => {
      spies.uuidV7ClockArg = clock;
      return { next: () => spies.newId };
    },
    mailerConsoleOn: () => ({ send: async () => {} }),
  };
});

const nextHeadersPath = await vi.hoisted(async () => {
  const { createRequire } = await import('node:module');
  return createRequire(new URL('../apps/web/package.json', import.meta.url)).resolve('next/headers');
});
vi.mock(nextHeadersPath, () => ({
  headers: async () => new Headers({ cookie: 'momo.session_token=signed' }),
}));

const composition = await import('../apps/web/src/server/composition');

describe('identity stays on systemClock under CLOCK_MODE=fixture (story 1.8 matrix)', () => {
  beforeEach(() => {
    spies.getDb.mockReturnValue(spies.handle);
    spies.append.mockClear();
    spies.org.insertDepartment.mockClear();
    spies.inTenantTransaction.mockClear();
    spies.fixtureClockOn.mockClear();
    spies.membershipsOf.mockResolvedValue([
      { tenantId: 'ten-from-session', role: 'tenant_admin', projectIds: [] },
    ]);
  });

  it('wires uuidV7 and Better Auth now to systemClock (wall), not the fixture Clock', async () => {
    await composition.signInState();
    expect(spies.uuidV7ClockArg?.now()).toBe(spies.WALL);
    expect(spies.authBuilds.length).toBeGreaterThan(0);
    const now = spies.authBuilds[0]!.now!;
    expect(now()).toBe(spies.WALL);
    expect(now().getTime()).not.toBe(spies.FIXTURE.getTime());
  });

  it('stamps audited org writes from the fixture product Clock', async () => {
    const result = await composition.createDepartment({ name: 'Fixture Clock Dept' });
    expect(result).toEqual({ ok: true, value: { id: spies.newId } });
    const anchorMs = Date.parse('2026-09-16T09:00:00.000Z');
    // Pins composition's DEMO_LATEST_OBSERVED_OFFSET_MS = −2h (same pair seed's latestFixtureObservedAt yields for the demo).
    expect(spies.fixtureClockOn).toHaveBeenCalledWith({
      latestObservedAt: anchorMs - 2 * 3_600_000,
      anchor: anchorMs,
    });
    expect(spies.inTenantTransaction).toHaveBeenCalledWith(
      spies.handle,
      'ten-from-session',
      expect.any(Function),
    );
    expect(spies.org.insertDepartment).toHaveBeenCalled();
    expect(spies.append).toHaveBeenCalledWith(
      expect.objectContaining({ at: spies.FIXTURE, action: 'department.create' }),
    );
    // `at: spies.FIXTURE` above already proves the product Clock, not wall time.
  });
});
