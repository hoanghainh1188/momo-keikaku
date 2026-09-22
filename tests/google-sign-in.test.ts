import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { systemClock, uuidV7IdsOn } from '../packages/adapters/src';
import {
  resolveRequestContext,
  type RequestContextResolution,
} from '../packages/app/src/authz/resolve-request-context';
import {
  createAuth,
  googleRegistered,
  googleSignIn,
  identityOn,
  serveAllowlisted,
  signInWithPassword,
  signOutOf,
  type Auth,
} from '../packages/db/auth/src';
import { hashPassword } from '../packages/db/auth/src/password';
import { closeAllPools, getDb } from '../packages/db/src/client';
import { DEMO_USERS } from '../packages/db/src/demo-identities';
import { buildProbeTenant, createProbeTenant, removeProbeTenant } from '../packages/db/src/probe-tenants';
import { membershipsOf } from '../packages/db/src/repo-membership';
import { account, authUser, session, verification } from '../packages/db/src/schema';
import { tenantMembership } from '../packages/db/src/schema-membership';
import { startFakeOidc, type FakeIdentity, type FakeOidc, type FakeScript } from './support/fake-oidc';
import { connectWriteHarness, owner } from './write-harness';

/**
 * STORY 1.4 SLICE 3's I/O MATRIX — Google sign-in, against Postgres and the in-repo fake OIDC
 * provider (`tests/support/fake-oidc.ts`), started in-process on a random port.
 *
 * Each sign-in runs the real flow: `googleSignIn` (server-side `signInSocial`) creates the state —
 * a `verification` row and the signed `momo.state` cookie — and answers the fake's authorize URL;
 * the fake redirects back with a code; the callback goes through `serveAllowlisted`, with the
 * state cookie forwarded the way a browser would. Every refusal must land on
 * `/sign-in?google=refused`; a success lands on `/` with a session `resolveRequestContext` decides.
 *
 * Its own people, in a probe Tenant (`xtprobe-ggl`) plus four extra users — never the seeded
 * `linh`/`hoang`, whose accounts `identity.test.ts` pins to `[credential]`. Everything is removed
 * afterwards. The fake runs on `systemClock`: Better Auth checks `exp` and the state's expiry
 * against real time, so a fixed clock would make every token expired.
 */

const reachable = await connectWriteHarness({
  ownerUrl: process.env.DATABASE_URL,
  appUrl: process.env.APP_DATABASE_URL,
  requireDb: process.env.REQUIRE_DB === '1',
});

const BASE_URL = 'http://localhost:3101';
const CLIENT = { clientId: 'google-test-client', clientSecret: 'google-test-secret' };
const REDIRECT_URI = `${BASE_URL}/api/auth/callback/google`;
const PASSWORD = 'google-test-password';

const PROBE = buildProbeTenant('xtprobe-ggl', 800_000_000);
const OWN = (value: string) => `${PROBE.writeOptions.idPrefix}${value}`;
/** The probe's Tenant Admin (a `hoang`) and PM (a `linh`): verified emails, credential accounts. */
const ADMIN = { id: OWN(DEMO_USERS.hoang.id), email: OWN(DEMO_USERS.hoang.email) };
const PM = { id: OWN(DEMO_USERS.linh.id), email: OWN(DEMO_USERS.linh.email) };
/** Verified email, no membership. */
const LONER = { id: OWN('g-loner-0001'), email: OWN('g-loner@momo-digital.example') };
/** An UNVERIFIED local email. */
const UNVERIFIED = { id: OWN('g-unverified-0001'), email: OWN('g-unverified@momo-digital.example') };
/** A PM of the probe Tenant whose membership this file revokes. */
const REVOKEE = { id: OWN('g-revokee-0001'), email: OWN('g-revokee@momo-digital.example') };
const EXTRAS = [LONER, UNVERIFIED, REVOKEE];

/** What a Google row keeps beside its (null) tokens: no expiries, no scope. */
const NO_TOKENS = { accessTokenExpiresAt: null, refreshTokenExpiresAt: null, scope: null };

const identityOf = (user: { email: string }, sub: string, extra: Partial<FakeIdentity> = {}): FakeIdentity => ({
  sub,
  email: user.email,
  emailVerified: true,
  ...extra,
});

let fake: FakeOidc;
let auth: Auth;

function appDb() {
  return getDb(process.env.APP_DATABASE_URL!);
}

/** Story 1.4 slice 4 fields this file does not exercise: a no-op mailer and event writer. */
const NOOP_RESET_DEPS = { mailer: { send: async () => {} }, now: systemClock.now, identityEvents: { record: async () => {} } };

function buildAuth(google: { issuer: string } | null): Auth {
  return createAuth({
    db: appDb(),
    secret: 'google-test-secret-0123456789abcdefgh',
    baseURL: BASE_URL,
    idleHours: 8,
    generateId: uuidV7IdsOn(systemClock).next,
    google: google === null ? null : { ...CLIENT, issuer: google.issuer },
    ...NOOP_RESET_DEPS,
  });
}

/** The `Cookie` header a browser would send back, from the `Set-Cookie`s a response carried. */
function cookieFrom(setCookies: readonly string[]): string {
  return setCookies
    .map((cookie) => cookie.split(';')[0]!)
    .filter((pair) => !pair.endsWith('='))
    .join('; ');
}

interface Started {
  readonly url: URL;
  readonly state: string;
  readonly cookie: string;
}

/** `googleSignIn`, as the server action calls it. */
async function start(on: Auth = auth): Promise<Started> {
  const started = await googleSignIn(on, new Headers({ origin: BASE_URL }));
  if (started === null) throw new Error('googleSignIn answered null');
  const url = new URL(started.url);
  return { url, state: url.searchParams.get('state')!, cookie: cookieFrom(started.setCookies) };
}

/** The browser at the fake's authorize URL: answers where the fake sends it back. */
async function authorize(started: Started): Promise<URL> {
  const response = await fetch(started.url, { redirect: 'manual' });
  expect(response.status, await response.clone().text()).toBe(302);
  return new URL(response.headers.get('location')!);
}

interface Landing {
  readonly status: number;
  readonly location: string;
  /** The cookies a follow-up request carries (the session), as a `Headers`. */
  readonly headers: Headers;
}

/** The browser back at `/api/auth/callback/google`, through the allowlisted route handler. */
async function callback(location: URL, cookie: string | null, on: Auth = auth): Promise<Landing> {
  const response = await serveAllowlisted(on)(
    new Request(location, { headers: cookie === null ? {} : { cookie } }),
  );
  return {
    status: response.status,
    location: response.headers.get('location') ?? '',
    headers: new Headers({ cookie: cookieFrom(response.headers.getSetCookie()), origin: BASE_URL }),
  };
}

/** One whole Google sign-in with the fake answering `script`. */
async function signInWithGoogle(script: FakeScript): Promise<Landing> {
  fake.script(script);
  const started = await start();
  return callback(await authorize(started), started.cookie);
}

/** The one refusal: `/sign-in?google=refused` (Better Auth appends its `error`, which the page never shows). */
function expectRefused(landing: Landing): void {
  expect(landing.status).toBe(302);
  expect(landing.location).toMatch(/^\/sign-in\?google=refused(&|$)/);
  expect(landing.headers.get('cookie') ?? '').not.toMatch(/session_token=/);
}

function expectLandedHome(landing: Landing): void {
  expect(landing.status, landing.location).toBe(302);
  expect(landing.location).toBe('/');
  expect(landing.headers.get('cookie') ?? '').toMatch(/session_token=/);
}

function resolve(headers: Headers): Promise<RequestContextResolution> {
  return resolveRequestContext(
    { identity: identityOn(auth), handle: appDb(), memberships: { membershipsOf }, onNoAccess: () => {} },
    headers,
  );
}

/** A user's `account` rows, as the owner reads them. */
async function accountsOf(userId: string) {
  return owner().transaction((tx) =>
    tx
      .select({
        providerId: account.providerId,
        accountId: account.accountId,
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        idToken: account.idToken,
        accessTokenExpiresAt: account.accessTokenExpiresAt,
        refreshTokenExpiresAt: account.refreshTokenExpiresAt,
        scope: account.scope,
      })
      .from(account)
      .where(eq(account.userId, userId))
      .orderBy(account.providerId),
  );
}

async function sessionCount(userId: string): Promise<number> {
  const rows = await owner().transaction((tx) => tx.select({ token: session.token }).from(session).where(eq(session.userId, userId)));
  return rows.length;
}

async function verificationRows(identifier: string): Promise<number> {
  const rows = await owner().transaction((tx) =>
    tx.select({ id: verification.id }).from(verification).where(eq(verification.identifier, identifier)),
  );
  return rows.length;
}

/**
 * Removes the extra users — and any user this file's emails could have produced, found by the
 * probe's email prefix: a sabotaged run (sign-up re-enabled) creates the "unknown" user, and a
 * leftover would make the next honest run sign it in.
 */
async function removeExtras(): Promise<void> {
  await owner().transaction(async (tx) => {
    const created = await tx
      .select({ id: authUser.id })
      .from(authUser)
      .where(sql`${authUser.email} LIKE ${`${PROBE.writeOptions.idPrefix}g-%`}`);
    const ids = [...new Set([...EXTRAS.map((user) => user.id), ...created.map((row) => row.id)])];
    await tx.delete(session).where(inArray(session.userId, ids));
    await tx.delete(account).where(inArray(account.userId, ids));
    await tx.delete(tenantMembership).where(inArray(tenantMembership.userId, ids));
    await tx.delete(authUser).where(inArray(authUser.id, ids));
  });
}

describe.skipIf(!reachable)('Google sign-in against the fake OIDC provider (story 1.4 slice 3)', () => {
  beforeAll(async () => {
    fake = await startFakeOidc({ clock: systemClock, ...CLIENT, redirectUri: REDIRECT_URI });
    auth = buildAuth(fake);
    await removeExtras();
    await createProbeTenant(owner(), {
      ...PROBE,
      writeOptions: { ...PROBE.writeOptions, passwordHash: await hashPassword(PASSWORD) },
    });
    const at = new Date('2026-09-01T00:00:00Z');
    await owner().transaction(async (tx) => {
      for (const user of EXTRAS) {
        await tx.insert(authUser).values({
          id: user.id,
          name: user.id,
          email: user.email,
          emailVerified: user !== UNVERIFIED,
          createdAt: at,
          updatedAt: at,
        });
      }
      await tx.insert(tenantMembership).values({ userId: REVOKEE.id, tenantId: PROBE.tenantId, role: 'pm', projectIds: [] });
    });
  });

  afterAll(async () => {
    await removeExtras();
    await removeProbeTenant(owner(), PROBE);
    await fake?.close();
  });

  it('registers Google from discovery, whose issuer is the configured one, and serves its callback', async () => {
    expect(await googleRegistered(auth)).toBe(true);
    const discovered = await (await fetch(`${fake.issuer}/.well-known/openid-configuration`)).json();
    expect(discovered.issuer).toBe(fake.issuer);
    const provider = (await auth.$context).socialProviders.find((candidate) => candidate.id === 'google');
    expect((provider as { issuer?: string } | undefined)?.issuer).toBe(fake.issuer);
    // Served (it answers the refusal redirect, not 404) — and `/sign-in/social` still is not.
    const serve = serveAllowlisted(auth);
    expect((await serve(new Request(`${BASE_URL}/api/auth/callback/google`))).status).toBe(302);
    const social = await serve(
      new Request(`${BASE_URL}/api/auth/sign-in/social`, {
        method: 'POST',
        headers: { origin: BASE_URL, 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'google', callbackURL: '/' }),
      }),
    );
    expect(social.status).toBe(404);
  });

  it('starts with a verification row and a state cookie, and consumes the row on the callback', async () => {
    fake.script({ identity: identityOf(ADMIN, 'sub-admin') });
    const started = await start();
    expect(started.url.origin).toBe(fake.issuer);
    expect(started.url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(started.url.searchParams.get('scope')?.split(' ').sort()).toEqual(['email', 'openid', 'profile']);
    expect(started.url.searchParams.get('nonce')).toBeTruthy();
    expect(started.cookie).toMatch(/momo\.state=/);
    expect(await verificationRows(started.state)).toBe(1);

    const landing = await callback(await authorize(started), started.cookie);
    expectLandedHome(landing);
    expect(await verificationRows(started.state)).toBe(0);
  });

  it('links a verified member by email (any letter case) with no tokens kept, and resolves their context', async () => {
    // The previous test linked `sub-admin` already; this one proves the email path on the PM.
    const landing = await signInWithGoogle({ identity: identityOf({ email: PM.email.toUpperCase() }, 'sub-pm') });
    expectLandedHome(landing);
    expect(await accountsOf(PM.id)).toEqual([
      { providerId: 'credential', accountId: PM.id, accessToken: null, refreshToken: null, idToken: null, ...NO_TOKENS },
      { providerId: 'google', accountId: 'sub-pm', accessToken: null, refreshToken: null, idToken: null, ...NO_TOKENS },
    ]);
    expect(await resolve(landing.headers)).toEqual({
      status: 'signed_in',
      context: { tenantId: PROBE.tenantId, userId: PM.id, roles: ['pm'], projectIds: [PROBE.projectId], locale: 'en' },
    });
    // …and signs out like any session.
    await signOutOf(auth, landing.headers);
    expect(await resolve(landing.headers)).toEqual({ status: 'signed_out' });
  });

  it('signs a returning member in again on the same sub, with no second account row and still no tokens', async () => {
    const landing = await signInWithGoogle({ identity: identityOf(ADMIN, 'sub-admin') });
    expectLandedHome(landing);
    expect((await accountsOf(ADMIN.id)).filter((row) => row.providerId === 'google')).toEqual([
      { providerId: 'google', accountId: 'sub-admin', accessToken: null, refreshToken: null, idToken: null, ...NO_TOKENS },
    ]);
    expect((await resolve(landing.headers)).status).toBe('signed_in');
  });

  it('lets the sub decide: a linked sub carrying another user\'s email signs in as its own user', async () => {
    const landing = await signInWithGoogle({ identity: identityOf(ADMIN, 'sub-pm') });
    expectLandedHome(landing);
    const resolved = await resolve(landing.headers);
    expect(resolved.status === 'signed_in' && resolved.context.userId).toBe(PM.id);
    expect((await accountsOf(ADMIN.id)).filter((row) => row.providerId === 'google')).toHaveLength(1);
  });

  it('refuses an unknown email and creates no user and no session', async () => {
    const email = OWN('g-stranger@momo-digital.example');
    expectRefused(await signInWithGoogle({ identity: identityOf({ email }, 'sub-stranger') }));
    const users = await owner().transaction((tx) =>
      tx.select({ id: authUser.id }).from(authUser).where(eq(authUser.email, email)),
    );
    expect(users).toEqual([]);
    const google = await owner().transaction((tx) =>
      tx.select({ id: account.id }).from(account).where(and(eq(account.providerId, 'google'), eq(account.accountId, 'sub-stranger'))),
    );
    expect(google).toEqual([]);
  });

  it('refuses an unverified Google email, on a first sign-in and on a return one, false or "false"', async () => {
    const before = await sessionCount(LONER.id);
    for (const emailVerified of [false, 'false'] as const) {
      expectRefused(await signInWithGoogle({ identity: identityOf(LONER, 'sub-loner', { emailVerified }) }));
    }
    expect(await accountsOf(LONER.id)).toEqual([]);
    expect(await sessionCount(LONER.id)).toBe(before);

    const adminSessions = await sessionCount(ADMIN.id);
    for (const emailVerified of [false, 'false'] as const) {
      expectRefused(await signInWithGoogle({ identity: identityOf(ADMIN, 'sub-admin', { emailVerified }) }));
    }
    expect(await sessionCount(ADMIN.id)).toBe(adminSessions);
  });

  it('refuses to link a user whose own email is not verified', async () => {
    expectRefused(await signInWithGoogle({ identity: identityOf(UNVERIFIED, 'sub-unverified') }));
    expect(await accountsOf(UNVERIFIED.id)).toEqual([]);
    expect(await sessionCount(UNVERIFIED.id)).toBe(0);
  });

  it('refuses a token response without an id token, a foreign key, a wrong aud, no nonce, an expired token', async () => {
    const userinfoBefore = fake.hits().userinfo;
    const sessions = await sessionCount(ADMIN.id);
    const identity = identityOf(ADMIN, 'sub-admin');
    for (const misbehaviour of [
      { omitIdToken: true },
      { foreignKey: true },
      { audience: 'somebody-else' },
      { dropNonce: true },
      { expiresInSeconds: -120 },
    ]) {
      expectRefused(await signInWithGoogle({ identity, ...misbehaviour }));
    }
    expect(await sessionCount(ADMIN.id)).toBe(sessions);
    expect(fake.hits().userinfo, 'nobody may ask the userinfo endpoint instead').toBe(userinfoBefore);
  });

  it('refuses a forged, a missing and an unbound state — the cookie dropped — and an expired one', async () => {
    const sessions = await sessionCount(ADMIN.id);
    fake.script({ identity: identityOf(ADMIN, 'sub-admin') });

    const forged = await start();
    const forgedBack = await authorize(forged);
    forgedBack.searchParams.set('state', 'forged-state-0123456789abcdef');
    expectRefused(await callback(forgedBack, forged.cookie));

    const missing = await start();
    const missingBack = await authorize(missing);
    missingBack.searchParams.delete('state');
    expectRefused(await callback(missingBack, missing.cookie));

    const unbound = await start();
    expectRefused(await callback(await authorize(unbound), null));

    // Expired: Better Auth reads the expiry the state row's VALUE carries, so both it and the
    // row's column are moved a minute into the past, as the owner.
    const expired = await start();
    await owner().transaction((tx) =>
      tx.execute(sql`
        UPDATE verification
           SET expires_at = now() - interval '1 minute',
               value = jsonb_set(value::jsonb, '{expiresAt}',
                                 to_jsonb(floor(extract(epoch from now()) * 1000)::bigint - 60000))::text
         WHERE identifier = ${expired.state}`),
    );
    expectRefused(await callback(await authorize(expired), expired.cookie));

    expect(await sessionCount(ADMIN.id)).toBe(sessions);
  });

  it('refuses when the provider rejects the code exchange, and when it answers access_denied', async () => {
    const sessions = await sessionCount(ADMIN.id);
    expectRefused(await signInWithGoogle({ identity: identityOf(ADMIN, 'sub-admin'), rejectToken: true }));
    expectRefused(await signInWithGoogle({ identity: identityOf(ADMIN, 'sub-admin'), idpError: 'access_denied' }));
    expect(await sessionCount(ADMIN.id)).toBe(sessions);
  });

  it('signs in a linked user with no membership, who gets no access', async () => {
    // LONER was refused above with an unverified token; a verified one links and signs in.
    const landing = await signInWithGoogle({ identity: identityOf(LONER, 'sub-loner') });
    expectLandedHome(landing);
    expect(await resolve(landing.headers)).toEqual({ status: 'no_access', userId: LONER.id, reason: 'no_membership' });
  });

  it('signs out a Google session on its next request once the membership is revoked, deleting it', async () => {
    const landing = await signInWithGoogle({ identity: identityOf(REVOKEE, 'sub-revokee') });
    expectLandedHome(landing);
    expect((await resolve(landing.headers)).status).toBe('signed_in');
    await owner().transaction((tx) => tx.delete(tenantMembership).where(eq(tenantMembership.userId, REVOKEE.id)));
    expect(await resolve(landing.headers)).toEqual({ status: 'signed_out' });
    expect(await sessionCount(REVOKEE.id)).toBe(0);
  });

  it('never called the userinfo endpoint, over the whole file', () => {
    expect(fake.hits().userinfo).toBe(0);
  });

  describe('when discovery fails, or Google is off', () => {
    /** A second fake in `mode` (or closed), and an instance built against it. */
    async function instanceWithDiscovery(mode: 'down' | 'error' | 'no_jwks_uri') {
      const other = await startFakeOidc({
        clock: systemClock,
        ...CLIENT,
        redirectUri: REDIRECT_URI,
        discovery: mode === 'down' ? 'ok' : mode,
      });
      if (mode === 'down') await other.close();
      return { other, instance: buildAuth(other) };
    }

    for (const mode of ['down', 'error', 'no_jwks_uri'] as const) {
      it(`skips the provider when discovery is ${mode}: no sign-in, callback 404, password sign-in still works`, async () => {
        const { other, instance } = await instanceWithDiscovery(mode);
        try {
          expect(await googleRegistered(instance)).toBe(false);
          expect(await googleSignIn(instance, new Headers({ origin: BASE_URL }))).toBeNull();
          const serve = serveAllowlisted(instance);
          expect((await serve(new Request(`${BASE_URL}/api/auth/callback/google`))).status).toBe(404);
          expect(
            await signInWithPassword(instance, new Headers({ origin: BASE_URL }), { email: PM.email, password: PASSWORD }),
          ).toBe(true);
          if (mode !== 'down') expect(other.hits().discovery).toBe(1);
        } finally {
          if (mode !== 'down') await other.close();
        }
      });
    }

    it('registers nothing and serves no callback when Google is off', async () => {
      const off = buildAuth(null);
      expect(await googleRegistered(off)).toBe(false);
      expect(await googleSignIn(off, new Headers({ origin: BASE_URL }))).toBeNull();
      expect((await serveAllowlisted(off)(new Request(`${BASE_URL}/api/auth/callback/google`))).status).toBe(404);
    });
  });
});

afterAll(async () => {
  await closeAllPools();
});
