import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { systemClock, uuidV7IdsOn } from '../packages/adapters/src';
import {
  createAuth,
  requestPasswordReset,
  resetPassword,
  serveAllowlisted,
  signInWithPassword,
  type Auth,
} from '../packages/db/auth/src';
import { hashPassword } from '../packages/db/auth/src/password';
import { closeAllPools, getDb } from '../packages/db/src/client';
import { DEMO_USERS } from '../packages/db/src/demo-identities';
import { buildProbeTenant, createProbeTenant, removeProbeTenant, type ProbeTenant } from '../packages/db/src/probe-tenants';
import { identityEventWriterOn } from '../packages/db/src/repo-identity-event';
import { account, authUser, identityEvent, session, verification } from '../packages/db/src/schema';
import { connectWriteHarness, owner } from './write-harness';

/**
 * STORY 1.4 SLICE 4's I/O MATRIX, against Postgres: a real Better Auth instance on the restricted
 * role, `MAILER=console`'s shape stood in for by a capturing fake (mail never actually leaves the
 * process in any environment this runs in), and the real `identity_event` writer over the same
 * handle.
 *
 * Its own probe Tenant (`xtprobe-pwr`) plus two extra users no seed writes: a dedicated
 * "resetter" for the consume matrix (a credential account, `email_verified: false` to start), and
 * a Google-only user with an `account` row but no `credential` provider at all. Nothing here
 * touches the seeded `linh`/`hoang`. Tokens are read out of the fake mailer's captured message,
 * exactly as a developer would read one out of the real console mailer's stdout line locally:
 * this is the ONLY channel a token travels over outside the `verification` row itself, so a test
 * that wants a working token gets it the same way the product does.
 */

const reachable = await connectWriteHarness({
  ownerUrl: process.env.DATABASE_URL,
  appUrl: process.env.APP_DATABASE_URL,
  requireDb: process.env.REQUIRE_DB === '1',
});

const BASE_URL = 'http://localhost:3101';
const PASSWORD = 'password-reset-test-password';
const NOW = new Date('2026-09-22T09:00:00Z');

const PROBE: ProbeTenant = buildProbeTenant('xtprobe-pwr', 810_000_000);
const OWN = (value: string) => `${PROBE.writeOptions.idPrefix}${value}`;
/** The probe's Tenant Admin: seeded with a credential account, already `email_verified`. */
const ADMIN = { id: OWN(DEMO_USERS.hoang.id), email: OWN(DEMO_USERS.hoang.email) };
/** A dedicated user for the consume matrix: a credential account, but NOT yet `email_verified` — so the "a completed reset sets it" assertion means something. */
const RESETTER = { id: OWN('resetter-0001'), email: OWN('resetter@momo-digital.example') };
/** A Google-only user: an `account` row, but no `credential` provider at all. */
const GOOGLE_ONLY = { id: OWN('google-only-0001'), email: OWN('google-only@momo-digital.example') };

function appDb() {
  return getDb(process.env.APP_DATABASE_URL!);
}

/** A capturing fake for `MailerPort`: no message ever leaves the process. */
function fakeMailer() {
  const sent: { to: string; subject: string; text: string }[] = [];
  let failNext = false;
  return {
    send: async (message: { to: string; subject: string; text: string }): Promise<void> => {
      if (failNext) {
        failNext = false;
        throw new Error('mailer transport is down');
      }
      sent.push(message);
    },
    hits: (): number => sent.length,
    messages: () => sent as readonly { to: string; subject: string; text: string }[],
    last: () => sent.at(-1),
    failNext: (): void => {
      failNext = true;
    },
    reset: (): void => {
      sent.length = 0;
      failNext = false;
    },
  };
}

type FakeMailer = ReturnType<typeof fakeMailer>;

/** The token out of a captured mail's own link — never anywhere else. */
function tokenFromMail(mail: { readonly text: string } | undefined): string {
  if (!mail) throw new Error('no mail was captured');
  const match = /\/reset-password\?token=([^\s]+)/.exec(mail.text);
  if (!match) throw new Error(`captured mail carried no reset link: ${mail.text}`);
  return decodeURIComponent(match[1]!);
}

let mailer: FakeMailer;
let auth: Auth;

function buildAuth(): Auth {
  mailer = fakeMailer();
  return createAuth({
    db: appDb(),
    secret: 'password-reset-test-secret-0123456789abcdef',
    baseURL: BASE_URL,
    idleHours: 8,
    generateId: uuidV7IdsOn(systemClock).next,
    mailer,
    now: () => NOW,
    identityEvents: identityEventWriterOn(appDb()),
  });
}

const headers = () => new Headers({ origin: BASE_URL });

/** Signs in through `auth.api` and answers the headers a follow-up request would carry. */
async function signIn(email: string, password: string): Promise<Headers> {
  const { headers: returned } = await auth.api.signInEmail({
    body: { email, password, rememberMe: true },
    headers: headers(),
    returnHeaders: true,
  });
  return new Headers({
    cookie: returned
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0]!)
      .join('; '),
    origin: BASE_URL,
  });
}

async function sessionsOf(userId: string) {
  return owner().transaction((tx) =>
    tx.select({ token: session.token }).from(session).where(eq(session.userId, userId)),
  );
}

async function verificationRow(identifier: string) {
  return owner().transaction((tx) =>
    tx
      .select({ id: verification.id, expiresAt: verification.expiresAt })
      .from(verification)
      .where(eq(verification.identifier, identifier)),
  );
}

/** Expires a token by moving the `expires_at` COLUMN in SQL — never the wall clock (AD-15). */
async function expireToken(token: string): Promise<void> {
  await owner().transaction((tx) =>
    tx.execute(
      sql`UPDATE verification SET expires_at = now() - interval '1 minute' WHERE identifier = ${`reset-password:${token}`}`,
    ),
  );
}

async function credentialPassword(userId: string): Promise<string | null> {
  const rows = await owner().transaction((tx) =>
    tx
      .select({ password: account.password })
      .from(account)
      .where(eq(account.userId, userId)),
  );
  return rows.find((row) => row.password !== null)?.password ?? null;
}

async function emailVerifiedOf(userId: string): Promise<boolean> {
  const rows = await owner().transaction((tx) =>
    tx.select({ emailVerified: authUser.emailVerified }).from(authUser).where(eq(authUser.id, userId)),
  );
  return rows[0]?.emailVerified ?? false;
}

async function identityEventsOf(userId: string) {
  return owner().transaction((tx) =>
    tx
      .select({ id: identityEvent.id, action: identityEvent.action, at: identityEvent.at, payload: identityEvent.payload })
      .from(identityEvent)
      .where(eq(identityEvent.userId, userId)),
  );
}

async function removeExtras(): Promise<void> {
  const ids = [RESETTER.id, GOOGLE_ONLY.id];
  await owner().transaction(async (tx) => {
    await tx.delete(identityEvent).where(eq(identityEvent.userId, RESETTER.id));
    for (const id of ids) {
      await tx.delete(session).where(eq(session.userId, id));
      await tx.delete(account).where(eq(account.userId, id));
      await tx.delete(authUser).where(eq(authUser.id, id));
    }
  });
}

describe.skipIf(!reachable)('password reset through MailerPort (story 1.4 slice 4)', () => {
  beforeAll(async () => {
    auth = buildAuth();
    await removeExtras();
    await createProbeTenant(owner(), {
      ...PROBE,
      writeOptions: { ...PROBE.writeOptions, passwordHash: await hashPassword(PASSWORD) },
    });
    const at = new Date('2026-09-01T00:00:00Z');
    await owner().transaction(async (tx) => {
      await tx.insert(authUser).values([
        { id: RESETTER.id, name: RESETTER.id, email: RESETTER.email, emailVerified: false, createdAt: at, updatedAt: at },
        { id: GOOGLE_ONLY.id, name: GOOGLE_ONLY.id, email: GOOGLE_ONLY.email, emailVerified: true, createdAt: at, updatedAt: at },
      ]);
      await tx.insert(account).values([
        {
          id: `${RESETTER.id}-cred`,
          accountId: RESETTER.id,
          providerId: 'credential',
          userId: RESETTER.id,
          password: await hashPassword(PASSWORD),
          createdAt: at,
          updatedAt: at,
        },
        {
          id: `${GOOGLE_ONLY.id}-google`,
          accountId: 'google-sub-only',
          providerId: 'google',
          userId: GOOGLE_ONLY.id,
          password: null,
          createdAt: at,
          updatedAt: at,
        },
      ]);
    });
  });

  afterAll(async () => {
    await removeExtras();
    await removeProbeTenant(owner(), PROBE);
  });

  afterEach(() => {
    mailer.reset();
  });

  it('sends one mail through MailerPort for a known email, with a reset-password:<token> row', async () => {
    expect(await requestPasswordReset(auth, headers(), ADMIN.email)).toBe(true);
    expect(mailer.hits()).toBe(1);
    const mail = mailer.last()!;
    expect(mail.to).toBe(ADMIN.email);
    expect(mail.subject).toBe('Reset your momo-keikaku password');

    const token = tokenFromMail(mail);
    expect(await verificationRow(`reset-password:${token}`)).toHaveLength(1);
  });

  it('answers exactly the same for an unknown email — no mail, no row', async () => {
    const email = OWN('nobody@momo-digital.example');
    expect(await requestPasswordReset(auth, headers(), email)).toBe(true);
    expect(mailer.hits()).toBe(0);
  });

  it('answers, rather than throws, when Better Auth itself refuses a malformed address — and sends no mail', async () => {
    // The web action's zod has no `.email()` and the form carries `noValidate`, so a mistyped
    // address reaches this binding and Better Auth refuses it with VALIDATION_ERROR before any
    // database access. The binding's own try/catch must turn that into `false`, not a throw.
    expect(await requestPasswordReset(auth, headers(), 'not-an-email-address')).toBe(false);
    expect(mailer.hits()).toBe(0);
  });

  it('lowercases at the boundary it controls: Better Auth still finds the seeded user by mixed case', async () => {
    expect(await requestPasswordReset(auth, headers(), ADMIN.email.toUpperCase())).toBe(true);
    expect(mailer.hits()).toBe(1);
    expect(mailer.last()!.to).toBe(ADMIN.email);
  });

  it('sends no mail to a Google-only user, and creates no credential account for them', async () => {
    expect(await requestPasswordReset(auth, headers(), GOOGLE_ONLY.email)).toBe(true);
    expect(mailer.hits()).toBe(0);
    const rows = await owner().transaction((tx) => tx.select({ providerId: account.providerId }).from(account).where(eq(account.userId, GOOGLE_ONLY.id)));
    expect(rows.map((row) => row.providerId)).toEqual(['google']);
  });

  it('answers exactly as on success when the mailer throws, and never logs the address', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mailer.failNext();
      expect(await requestPasswordReset(auth, headers(), ADMIN.email)).toBe(true);
      expect(mailer.hits()).toBe(0);
      const logged = warn.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(logged).toMatch(/password-reset mail failed to send/);
      expect(logged).not.toContain(ADMIN.email);
    } finally {
      warn.mockRestore();
    }
  });

  describe('the consume matrix, on its own dedicated user', () => {
    it('replaces the password, verifies the email, records one identity_event, and ends every session', async () => {
      expect(await emailVerifiedOf(RESETTER.id)).toBe(false);
      const beforeHash = await credentialPassword(RESETTER.id);

      // A live session, ended by the reset.
      await signIn(RESETTER.email, PASSWORD);
      expect((await sessionsOf(RESETTER.id)).length).toBeGreaterThan(0);

      mailer.reset();
      expect(await requestPasswordReset(auth, headers(), RESETTER.email)).toBe(true);
      const token = tokenFromMail(mailer.last());

      expect(await resetPassword(auth, headers(), { token, password: 'a-brand-new-password-1' })).toBe(true);

      expect(await credentialPassword(RESETTER.id)).not.toBe(beforeHash);
      expect(await emailVerifiedOf(RESETTER.id)).toBe(true);

      const events = await identityEventsOf(RESETTER.id);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ action: 'password.reset', at: NOW, payload: null });

      expect(await sessionsOf(RESETTER.id)).toEqual([]);

      // The user signs in with the new password, and not with the old one.
      expect(await signInWithPassword(auth, headers(), { email: RESETTER.email, password: PASSWORD })).toBe(false);
      expect(
        await signInWithPassword(auth, headers(), { email: RESETTER.email, password: 'a-brand-new-password-1' }),
      ).toBe(true);
    });

    it('refuses a reused token, without writing a second identity_event', async () => {
      mailer.reset();
      expect(await requestPasswordReset(auth, headers(), RESETTER.email)).toBe(true);
      const token = tokenFromMail(mailer.last());

      expect(await resetPassword(auth, headers(), { token, password: 'second-new-password-1' })).toBe(true);
      const eventsAfterFirst = await identityEventsOf(RESETTER.id);

      expect(await resetPassword(auth, headers(), { token, password: 'third-new-password-1' })).toBe(false);
      expect(await identityEventsOf(RESETTER.id)).toEqual(eventsAfterFirst);
      expect(
        await signInWithPassword(auth, headers(), { email: RESETTER.email, password: 'second-new-password-1' }),
      ).toBe(true);
    });

    it('refuses an expired token, gated on the expires_at column', async () => {
      mailer.reset();
      expect(await requestPasswordReset(auth, headers(), RESETTER.email)).toBe(true);
      const token = tokenFromMail(mailer.last());
      await expireToken(token);

      expect(await resetPassword(auth, headers(), { token, password: 'fourth-new-password-1' })).toBe(false);
      expect(
        await signInWithPassword(auth, headers(), { email: RESETTER.email, password: 'fourth-new-password-1' }),
      ).toBe(false);
    });

    it('refuses a short password before any write, and the same token still works afterwards', async () => {
      mailer.reset();
      expect(await requestPasswordReset(auth, headers(), RESETTER.email)).toBe(true);
      const token = tokenFromMail(mailer.last());
      const eventsBefore = await identityEventsOf(RESETTER.id);

      expect(await resetPassword(auth, headers(), { token, password: 'short7x' })).toBe(false);
      expect(await identityEventsOf(RESETTER.id)).toEqual(eventsBefore);

      // Nothing was consumed: the very same token still works with an acceptable password.
      expect(await resetPassword(auth, headers(), { token, password: 'fifth-new-password-1' })).toBe(true);
      expect(
        await signInWithPassword(auth, headers(), { email: RESETTER.email, password: 'fifth-new-password-1' }),
      ).toBe(true);
    });

    it('invalidates a first outstanding link once a second one for the same user is used', async () => {
      mailer.reset();
      expect(await requestPasswordReset(auth, headers(), RESETTER.email)).toBe(true);
      const firstToken = tokenFromMail(mailer.last());

      mailer.reset();
      expect(await requestPasswordReset(auth, headers(), RESETTER.email)).toBe(true);
      const secondToken = tokenFromMail(mailer.last());
      expect(secondToken).not.toBe(firstToken);

      expect(
        await resetPassword(auth, headers(), { token: secondToken, password: 'sixth-new-password-1' }),
      ).toBe(true);

      // The first link, requested earlier and never followed, no longer works.
      expect(
        await resetPassword(auth, headers(), { token: firstToken, password: 'seventh-new-password-1' }),
      ).toBe(false);
      expect(
        await signInWithPassword(auth, headers(), { email: RESETTER.email, password: 'sixth-new-password-1' }),
      ).toBe(true);
    });
  });

  it('never writes an identity_event on the request side, only on a completed consume', async () => {
    mailer.reset();
    const before = await identityEventsOf(ADMIN.id);
    expect(await requestPasswordReset(auth, headers(), ADMIN.email)).toBe(true);
    expect(await identityEventsOf(ADMIN.id)).toEqual(before);
  });

  it('serves neither reset endpoint over HTTP — both flows are server actions only, never routed', async () => {
    const serve = serveAllowlisted(auth);
    const status = async (method: string, path: string) =>
      (await serve(new Request(`${BASE_URL}/api/auth${path}`, { method, headers: { origin: BASE_URL } }))).status;
    expect(await status('POST', '/request-password-reset')).toBe(404);
    expect(await status('POST', '/reset-password')).toBe(404);
    expect(await status('GET', '/reset-password/some-token')).toBe(404);
    expect(await status('POST', '/reset-password/some-token')).toBe(404);
  });
});

afterAll(async () => {
  await closeAllPools();
});
