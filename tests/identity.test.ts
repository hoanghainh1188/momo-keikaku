import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import { uuidV7IdsOn, systemClock } from '../packages/adapters/src';
import { auditActorOf } from '../packages/app/src/authz/request-context';
import {
  resolveRequestContext,
  type NoAccessEvent,
  type RequestContextResolution,
} from '../packages/app/src/authz/resolve-request-context';
import { mapTicket } from '../packages/app/src/use-cases';
import {
  SESSION_UPDATE_AGE_SECONDS,
  createAuth,
  identityOn,
  serveAllowlisted,
  sessionForMiddleware,
  signInWithPassword,
  signOutOf,
  type Auth,
} from '../packages/db/auth/src';
import { hashPassword, verifyPassword } from '../packages/db/auth/src/password';
import { closeAllPools, getDb } from '../packages/db/src/client';
import { DEMO_USERS } from '../packages/db/src/demo-identities';
import {
  buildProbeTenant,
  createProbeTenant,
  removeProbeTenant,
  type ProbeTenant,
} from '../packages/db/src/probe-tenants';
import { membershipsOf } from '../packages/db/src/repo-membership';
import { account, auditLog, authUser, session } from '../packages/db/src/schema';
import { tenantMembership } from '../packages/db/src/schema-membership';
import { withTenant } from '../packages/db/src/with-tenant';
import { startFakeOidc } from './support/fake-oidc';
import { connectWriteHarness, idPort, owner, restrictedWriteDeps } from './write-harness';

/**
 * STORY 1.4 SLICE 1's I/O MATRIX, against Postgres: a real Better Auth instance on the restricted
 * role, the real identity tables, the real membership bridge, `resolveRequestContext` over them.
 *
 * Everything happens inside a probe Tenant of its own (`xtprobe-idn`), whose members carry a
 * credential account with a known password — so nothing here signs in as, or writes to, the demo
 * Tenant the golden figures are pinned against. Two extra users are made for the matrix rows a
 * probe's members cannot play: one with no membership, one with two.
 *
 * Session times are moved with SQL (`now() ± interval`): the test never reads the wall clock, and
 * the only authority on expiry is Better Auth's own check.
 */

const reachable = await connectWriteHarness({
  ownerUrl: process.env.DATABASE_URL,
  appUrl: process.env.APP_DATABASE_URL,
  requireDb: process.env.REQUIRE_DB === '1',
});

const BASE_URL = 'http://localhost:3101';
const IDLE_HOURS = 8;
const PASSWORD = 'identity-test-password';
/**
 * The key an operator exports and `pnpm seed` hashes into the demo users' credential rows. Read
 * from the environment rather than pinned, because the point of the assertion that uses it is to
 * tie the STORED hash to the key the operator actually set. The demo rows only exist because the
 * seed ran, and the seed refuses to run without this key, so a reachable database and no key here
 * means something has diverged and the message should say so rather than skip.
 */
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? '';

const PROBE: ProbeTenant = buildProbeTenant('xtprobe-idn', 760_000_000);
const OWN = (value: string) => `${PROBE.writeOptions.idPrefix}${value}`;
const PM = { id: OWN(DEMO_USERS.linh.id), email: OWN(DEMO_USERS.linh.email) };
/** A user with a password and no membership at all. */
const LONER = { id: OWN('loner-0001'), email: OWN('loner@momo-digital.example') };
/** A user with two memberships and no active Tenant. */
const SEVERAL = { id: OWN('several-0001'), email: OWN('several@momo-digital.example') };
const SECOND_TENANT = OWN('second-tenant');

let auth: Auth;

function appDb() {
  return getDb(process.env.APP_DATABASE_URL!);
}

/** Story 1.4 slice 4 fields this file does not exercise: a no-op mailer and event writer. */
const NOOP_RESET_DEPS = { mailer: { send: async () => {} }, now: systemClock.now, identityEvents: { record: async () => {} } };

/** The `Cookie` header a browser would send back, from the `Set-Cookie`s a response carried. */
function cookieFrom(setCookies: readonly string[]): string {
  return setCookies.map((cookie) => cookie.split(';')[0]!).join('; ');
}

/** Signs in through `auth.api` and answers the headers a follow-up request would carry. */
async function signIn(email: string, password = PASSWORD): Promise<Headers> {
  const { headers } = await auth.api.signInEmail({
    body: { email, password, rememberMe: true },
    headers: new Headers({ origin: BASE_URL }),
    returnHeaders: true,
  });
  return new Headers({ cookie: cookieFrom(headers.getSetCookie()), origin: BASE_URL });
}

const logged: NoAccessEvent[] = [];

function resolve(headers: Headers): Promise<RequestContextResolution> {
  return resolveRequestContext(
    {
      identity: identityOn(auth, appDb()),
      handle: appDb(),
      memberships: { membershipsOf },
      onNoAccess: (event) => logged.push(event),
    },
    headers,
  );
}

/** The session rows of one user, read as the owner. */
async function sessionsOf(userId: string) {
  return owner().transaction((tx) =>
    tx
      .select({ token: session.token, activeTenantId: session.activeTenantId, expiresAt: session.expiresAt })
      .from(session)
      .where(eq(session.userId, userId)),
  );
}

/** Removes the extra users this file makes, and every membership and session they hold. */
async function removeExtras(): Promise<void> {
  const ids = [LONER.id, SEVERAL.id];
  await owner().transaction(async (tx) => {
    await tx.delete(session).where(inArray(session.userId, ids));
    await tx.delete(account).where(inArray(account.userId, ids));
    await tx.delete(tenantMembership).where(inArray(tenantMembership.userId, ids));
    await tx.delete(authUser).where(inArray(authUser.id, ids));
  });
}

describe.skipIf(!reachable)('sign-in and the request context, against Postgres (story 1.4 slice 1)', () => {
  beforeAll(async () => {
    auth = createAuth({
      db: appDb(),
      secret: 'identity-test-secret-0123456789abcdef',
      baseURL: BASE_URL,
      idleHours: IDLE_HOURS,
      generateId: uuidV7IdsOn(systemClock).next,
      ...NOOP_RESET_DEPS,
    });
    const passwordHash = await hashPassword(PASSWORD);
    await removeExtras();
    await createProbeTenant(owner(), {
      ...PROBE,
      writeOptions: { ...PROBE.writeOptions, passwordHash },
    });
    const at = new Date('2026-09-01T00:00:00Z');
    await owner().transaction(async (tx) => {
      for (const user of [LONER, SEVERAL]) {
        await tx.insert(authUser).values({ id: user.id, name: user.id, email: user.email, createdAt: at, updatedAt: at });
        await tx.insert(account).values({
          id: `acct-${user.id}`,
          accountId: user.id,
          providerId: 'credential',
          userId: user.id,
          password: passwordHash,
          createdAt: at,
          updatedAt: at,
        });
      }
      await tx.insert(tenantMembership).values([
        { userId: SEVERAL.id, tenantId: PROBE.tenantId, role: 'pm', projectIds: [] },
        { userId: SEVERAL.id, tenantId: SECOND_TENANT, role: 'pm', projectIds: [] },
      ]);
    });
  }, 120_000);

  afterAll(async () => {
    await removeExtras();
    await removeProbeTenant(owner(), PROBE);
  }, 120_000);

  it('keeps the session cookie cache off — every request reaches the session table', () => {
    expect(auth.options.session?.cookieCache?.enabled).toBe(false);
    expect(auth.options.emailAndPassword?.disableSignUp).toBe(true);
  });

  it('signs the seeded PM in, persists the single membership as the active Tenant, and resolves it', async () => {
    const headers = await signIn(PM.email);
    const [before] = await sessionsOf(PM.id);
    expect(before?.activeTenantId).toBeNull();

    const resolved = await resolve(headers);
    expect(resolved).toEqual({
      status: 'signed_in',
      context: {
        tenantId: PROBE.tenantId,
        userId: PM.id,
        roles: ['pm'],
        projectIds: [PROBE.projectId],
        locale: 'en',
      },
    });
    const rows = await sessionsOf(PM.id);
    expect(rows.map((row) => row.activeTenantId)).toContain(PROBE.tenantId);
    // …and a second request validates the persisted choice rather than choosing again.
    expect(await resolve(headers)).toEqual(resolved);
  });

  /**
   * THE `locale` ROUND TRIP, which every other assertion in this file takes on faith. They all
   * expect `'en'` — which is also the column default AND the `?? 'en'` fallback in `identityOn`,
   * so the whole path from `auth_user.locale` to `RequestContext` could stop working and each one
   * would still pass: the `expect(x ?? DEFAULT).toBe(DEFAULT)` shape. `session.activeTenantId` is
   * pinned properly (the case below writes a value nothing would guess and requires the resolver
   * to observe it); this does the same for the field story 1.9's Japanese catalog will read.
   */
  it('carries a non-default locale from auth_user through to the resolved context', async () => {
    await owner().transaction((tx) =>
      tx.update(authUser).set({ locale: 'ja' }).where(eq(authUser.id, PM.id)),
    );
    try {
      const headers = await signIn(PM.email);
      const resolved = await resolve(headers);
      if (resolved.status !== 'signed_in') throw new Error(`expected signed_in, got ${resolved.status}`);
      expect(resolved.context.locale).toBe('ja');
    } finally {
      await owner().transaction((tx) =>
        tx.update(authUser).set({ locale: 'en' }).where(eq(authUser.id, PM.id)),
      );
    }
  });

  it('refuses a wrong password and an unknown email identically, creating no session', async () => {
    const before = (await sessionsOf(PM.id)).length;
    const wrong = await signInWithPassword(auth, new Headers({ origin: BASE_URL }), {
      email: PM.email,
      password: 'not-the-password',
    });
    const unknown = await signInWithPassword(auth, new Headers({ origin: BASE_URL }), {
      email: OWN('nobody@momo-digital.example'),
      password: PASSWORD,
    });
    expect({ wrong, unknown }).toEqual({ wrong: false, unknown: false });
    expect((await sessionsOf(PM.id)).length).toBe(before);

    // THE ASSERTION ABOVE CANNOT FAIL ON A DIFFERENCE. `signInWithPassword` answers `boolean`, so
    // the two refusals are already identical by the type whatever Better Auth carried underneath —
    // it establishes "neither signed in", not "indistinguishable". NFR-S5 is about what an
    // attacker can observe, so ask the layer that still has the difference to lose: the raw
    // `APIError`, before the binding narrows it (fifth review pass).
    const refusal = async (email: string, password: string) => {
      try {
        await auth.api.signInEmail({ body: { email, password }, headers: new Headers({ origin: BASE_URL }) });
        return 'signed in, which neither of these must';
      } catch (error) {
        const api = error as { status?: unknown; body?: { code?: unknown; message?: unknown } };
        return { status: api.status, code: api.body?.code, message: api.body?.message };
      }
    };
    const wrongRefusal = await refusal(PM.email, 'not-the-password');
    const unknownRefusal = await refusal(OWN('nobody@momo-digital.example'), PASSWORD);
    expect(wrongRefusal).not.toBe('signed in, which neither of these must');
    expect(unknownRefusal).toEqual(wrongRefusal);
  });

  it('signs out a session whose active Tenant has no matching membership, and deletes it', async () => {
    const headers = await signIn(PM.email);
    expect((await resolve(headers)).status).toBe('signed_in');
    const token = (await auth.api.getSession({ headers }))!.session.token;
    await owner().transaction((tx) =>
      tx.update(session).set({ activeTenantId: 'ten-not-a-member' }).where(eq(session.token, token)),
    );

    expect(await resolve(headers)).toEqual({ status: 'signed_out' });
    expect((await sessionsOf(PM.id)).map((row) => row.token)).not.toContain(token);
  });

  it('refuses a session idle past the timeout on its next request', async () => {
    const headers = await signIn(PM.email);
    const token = (await auth.api.getSession({ headers }))!.session.token;
    await owner().transaction((tx) =>
      tx.update(session).set({ expiresAt: sql`now() - interval '1 minute'` }).where(eq(session.token, token)),
    );

    expect(await resolve(headers)).toEqual({ status: 'signed_out' });
    expect((await sessionForMiddleware(auth, headers)).signedIn).toBe(false);
  });

  it('slides an active session: the middleware check pushes its expiry forward and sends the cookie back', async () => {
    const headers = await signIn(PM.email);
    const token = (await auth.api.getSession({ headers }))!.session.token;
    // Due for refresh by exactly one second: expiresAt − expiresIn + updateAge = now − 1s.
    const dueBy = `${IDLE_HOURS * 3600 - SESSION_UPDATE_AGE_SECONDS - 1} seconds`;
    await owner().transaction((tx) =>
      tx
        .update(session)
        .set({ expiresAt: sql`now() + ${dueBy}::interval` })
        .where(eq(session.token, token)),
    );
    const [before] = (await sessionsOf(PM.id)).filter((row) => row.token === token);

    const checked = await sessionForMiddleware(auth, headers);
    expect(checked.signedIn).toBe(true);
    expect(checked.setCookies.some((cookie) => cookie.includes('session_token'))).toBe(true);
    const [after] = (await sessionsOf(PM.id)).filter((row) => row.token === token);
    expect(after!.expiresAt.getTime()).toBeGreaterThan(before!.expiresAt.getTime());
  });

  it('does not slide the session on a render: the resolver reads without refreshing', async () => {
    const headers = await signIn(PM.email);
    const token = (await auth.api.getSession({ headers }))!.session.token;
    const dueBy = `${IDLE_HOURS * 3600 - SESSION_UPDATE_AGE_SECONDS - 1} seconds`;
    await owner().transaction((tx) =>
      tx.update(session).set({ expiresAt: sql`now() + ${dueBy}::interval` }).where(eq(session.token, token)),
    );
    const [before] = (await sessionsOf(PM.id)).filter((row) => row.token === token);
    expect((await resolve(headers)).status).toBe('signed_in');
    const [after] = (await sessionsOf(PM.id)).filter((row) => row.token === token);
    expect(after!.expiresAt.getTime()).toBe(before!.expiresAt.getTime());
  });

  it('is signed out after signing out, even replaying the old cookie (the back button)', async () => {
    const headers = await signIn(PM.email);
    expect((await resolve(headers)).status).toBe('signed_in');
    await signOutOf(auth, headers);
    expect(await resolve(headers)).toEqual({ status: 'signed_out' });
  });

  it('signs in a user with no membership, who gets no access and no Tenant', async () => {
    const headers = await signIn(LONER.email);
    expect(await resolve(headers)).toEqual({ status: 'no_access', userId: LONER.id, reason: 'no_membership' });
    expect((await sessionsOf(LONER.id)).map((row) => row.activeTenantId)).toEqual([null]);
  });

  it('gives a user with two memberships no access, logs why, and chooses no Tenant', async () => {
    const headers = await signIn(SEVERAL.email);
    logged.length = 0;
    expect(await resolve(headers)).toEqual({
      status: 'no_access',
      userId: SEVERAL.id,
      reason: 'several_memberships',
    });
    expect(logged).toEqual([{ userId: SEVERAL.id, reason: 'several_memberships', memberships: 2 }]);
    expect((await sessionsOf(SEVERAL.id)).map((row) => row.activeTenantId)).toEqual([null]);
  });

  it('stamps a PM\'s write with their user id and lands it in the active Tenant', async () => {
    const headers = await signIn(PM.email);
    const resolved = await resolve(headers);
    if (resolved.status !== 'signed_in') throw new Error(`resolved ${resolved.status}`);
    const ticketId = PROBE.state.mappingEvents[0]!.ticketId;

    const result = await mapTicket(restrictedWriteDeps(idPort('xtidn-id')), resolved.context, {
      projectId: PROBE.projectId,
      ticketId,
      wpId: '',
    });
    expect(result).toEqual({ ok: true, value: undefined });

    const [record] = await withTenant(owner(), PROBE.tenantId, (tx) =>
      tx.select().from(auditLog).orderBy(desc(auditLog.seq)).limit(1),
    );
    expect(record).toMatchObject({
      tenantId: PROBE.tenantId,
      actor: auditActorOf({ userId: PM.id }),
      action: 'mapping.unmap',
      target: ticketId,
    });
  });

  it('signs in through signInWithPassword (rememberMe), and the middleware slides that session', async () => {
    const before = new Set((await sessionsOf(PM.id)).map((row) => row.token));
    const signedIn = await signInWithPassword(auth, new Headers({ origin: BASE_URL }), {
      email: PM.email,
      password: PASSWORD,
    });
    expect(signedIn).toBe(true);
    const created = (await sessionsOf(PM.id)).filter((row) => !before.has(row.token));
    expect(created).toHaveLength(1);
    const token = created[0]!.token;

    // Due for refresh by one second; the cookie a browser would carry is the signed token.
    const dueBy = `${IDLE_HOURS * 3600 - SESSION_UPDATE_AGE_SECONDS - 1} seconds`;
    await owner().transaction((tx) =>
      tx.update(session).set({ expiresAt: sql`now() + ${dueBy}::interval` }).where(eq(session.token, token)),
    );
    const [due] = (await sessionsOf(PM.id)).filter((row) => row.token === token);
    // The cookie a browser would carry: the token read from the session row, signed the way
    // Better Auth signs it (HMAC-SHA256 with the secret, base64) — the binding returns no headers.
    const context = await auth.$context;
    const { createHmac } = await import('node:crypto');
    const signature = createHmac('sha256', context.secret).update(token).digest('base64');
    const headers = new Headers({
      cookie: `${context.authCookies.sessionToken.name}=${encodeURIComponent(`${token}.${signature}`)}`,
    });

    const checked = await sessionForMiddleware(auth, headers);
    expect(checked.signedIn).toBe(true);
    const [after] = (await sessionsOf(PM.id)).filter((row) => row.token === token);
    expect(after!.expiresAt.getTime()).toBeGreaterThan(due!.expiresAt.getTime());
  });

  it('finds the demo seed\'s members: a user, a credential account and a membership each', async () => {
    const { DEMO_TENANT_ID } = await import('../packages/db/src/repo');
    const { buildDemoState } = await import('../packages/db/src/fixtures');
    const demoProject = buildDemoState().fixture.project.id;
    for (const user of Object.values(DEMO_USERS)) {
      const rows = await owner().transaction(async (tx) => ({
        users: await tx.select({ email: authUser.email }).from(authUser).where(eq(authUser.id, user.id)),
        accounts: await tx
          .select({ providerId: account.providerId, hasPassword: sql<boolean>`${account.password} IS NOT NULL` })
          .from(account)
          .where(eq(account.userId, user.id)),
        members: await tx
          .select({ tenantId: tenantMembership.tenantId, role: tenantMembership.role, projectIds: tenantMembership.projectIds })
          .from(tenantMembership)
          .where(eq(tenantMembership.userId, user.id)),
      }));
      expect(rows, user.email).toEqual({
        users: [{ email: user.email }],
        accounts: [{ providerId: 'credential', hasPassword: true }],
        members: [
          { tenantId: DEMO_TENANT_ID, role: user.role, projectIds: user.onDemoProject ? [demoProject] : [] },
        ],
      });

      // WHICH password, not merely SOME password. `hasPassword` above is `IS NOT NULL`, which the
      // hash of any string satisfies — so `scripts/seed.ts` hashing the wrong thing (a trimmed or
      // lower-cased copy of the key, a double hash, a constant) kept lint, three typechecks,
      // depcruise, `next build` and every suite green while both demo users were locked out of the
      // login README-DEMO documents. This is the only assertion that ties the stored hash to the
      // key an operator actually exports (fifth review pass, 2026-09-22).
      const [stored] = await owner().transaction((tx) =>
        tx.select({ password: account.password }).from(account).where(eq(account.userId, user.id)),
      );
      expect(DEMO_PASSWORD, 'SEED_DEMO_PASSWORD is unset, but the seeded rows it hashes are here').not.toBe('');
      expect(await verifyPassword(stored!.password!, DEMO_PASSWORD), user.email).toBe(true);
    }
  });

  it('answers 404 to every endpoint off the allowlist, parametrised ones included', async () => {
    const serve = serveAllowlisted(auth);
    const status = async (method: string, path: string) =>
      (await serve(new Request(`${BASE_URL}/api/auth${path}`, { method, headers: { origin: BASE_URL } }))).status;
    expect(await status('POST', '/reset-password/x')).toBe(404);
    expect(await status('GET', '/reset-password/x')).toBe(404);
    expect(await status('POST', '/update-session')).toBe(404);
    expect(await status('POST', '/sign-up/email')).toBe(404);
    expect(await status('GET', '/callback/google')).toBe(404);
    expect(await status('POST', '/sign-in/social')).toBe(404);
    expect(await status('POST', '/get-session')).toBe(404);
    expect(await status('GET', '/sign-in/email')).toBe(404);
    // …and the allowlist itself is served.
    expect(await status('GET', '/get-session')).toBe(200);
  });

  it('serves GET /callback/google only while Google is registered, and never /sign-in/social (slice 3)', async () => {
    const fake = await startFakeOidc({
      clock: systemClock,
      clientId: 'identity-google-client',
      clientSecret: 'identity-google-secret',
      redirectUri: `${BASE_URL}/api/auth/callback/google`,
    });
    try {
      const withGoogle = createAuth({
        db: appDb(),
        secret: 'identity-test-secret-0123456789abcdef',
        baseURL: BASE_URL,
        idleHours: IDLE_HOURS,
        generateId: uuidV7IdsOn(systemClock).next,
        ...NOOP_RESET_DEPS,
        google: { clientId: 'identity-google-client', clientSecret: 'identity-google-secret', issuer: fake.issuer },
      });
      const serve = serveAllowlisted(withGoogle);
      const status = async (method: string, path: string) =>
        (await serve(new Request(`${BASE_URL}/api/auth${path}`, { method, headers: { origin: BASE_URL } }))).status;
      // Served: with no state it answers the refusal redirect, not 404.
      expect(await status('GET', '/callback/google')).toBe(302);
      expect(await status('POST', '/callback/google')).toBe(404);
      expect(await status('GET', '/callback/github')).toBe(404);
      expect(await status('POST', '/sign-in/social')).toBe(404);
      expect(await status('POST', '/link-social')).toBe(404);
    } finally {
      await fake.close();
    }
  });

  it('round-trips each of the four Better Auth tables through the adapter, with UUIDv7 ids', async () => {
    const context = await auth.$context;
    const uuidV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    const user = await context.internalAdapter.findUserByEmail(PM.email, { includeAccounts: true });
    expect(user?.user.id).toBe(PM.id);
    expect(user?.accounts.map((a) => a.providerId)).toEqual(['credential']);

    const headers = await signIn(PM.email);
    const token = (await auth.api.getSession({ headers }))!.session.token;
    const found = await context.internalAdapter.findSession(token);
    expect(found?.session.userId).toBe(PM.id);
    expect(found?.session.id).toMatch(uuidV7);

    const identifier = OWN('verification-probe');
    const created = await context.internalAdapter.createVerificationValue({
      identifier,
      value: 'probe-value',
      expiresAt: new Date('2099-01-01T00:00:00Z'),
    });
    expect(created.id).toMatch(uuidV7);
    expect((await context.internalAdapter.findVerificationValue(identifier))?.value).toBe('probe-value');
    await context.internalAdapter.deleteVerificationByIdentifier(identifier);
    expect(await context.internalAdapter.findVerificationValue(identifier)).toBeNull();
  });

  it('leaves no probe identity rows behind once the probe Tenant is removed', async () => {
    const token = 'xtprobe-idz';
    const probe = buildProbeTenant(token, 770_000_000);
    await createProbeTenant(owner(), probe);
    const prefix = `${token}-%`;
    const count = async () =>
      owner().transaction(async (tx) => {
        const users = await tx.select({ id: authUser.id }).from(authUser).where(sql`${authUser.id} LIKE ${prefix}`);
        const members = await tx
          .select({ userId: tenantMembership.userId })
          .from(tenantMembership)
          .where(eq(tenantMembership.tenantId, probe.tenantId));
        return { users: users.length, members: members.length };
      });
    expect(await count()).toEqual({ users: Object.keys(DEMO_USERS).length, members: Object.keys(DEMO_USERS).length });

    await removeProbeTenant(owner(), probe);
    expect(await count()).toEqual({ users: 0, members: 0 });
  }, 120_000);
});

afterAll(async () => {
  await closeAllPools();
});
