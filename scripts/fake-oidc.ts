/**
 * `pnpm fake-oidc` — the in-repo fake OIDC provider (`tests/support/fake-oidc.ts`) on a FIXED port,
 * for local development of Google sign-in (story 1.4 slice 3). No real Google client is needed,
 * or allowed, in the repository: the web app is pointed at this instead.
 *
 * `GET /authorize` shows a one-field "sign in as" page; the email typed there comes back as a
 * verified Google identity. Only an email that already belongs to a user signs in (the seeded
 * `linh@momo-digital.example` and `hoang@momo-digital.example`); anything else is refused, as it
 * would be with Google.
 *
 * Then run the web app with (apps/web/.env.local, or the shell):
 *
 *   AUTH_GOOGLE=on
 *   GOOGLE_CLIENT_ID=momo-local-client
 *   GOOGLE_CLIENT_SECRET=momo-local-secret
 *   GOOGLE_ISSUER_URL=http://127.0.0.1:4455
 *
 * Tooling, outside the lint fence: it reads its port and the web app's origin from the
 * environment (`FAKE_OIDC_PORT`, default 4455; `BETTER_AUTH_URL`, default http://localhost:3101).
 */
import { systemClock } from '../packages/adapters/src/clock.js';
import { startFakeOidc } from '../tests/support/fake-oidc.js';

/**
 * A BAD KEY FAILS HERE, NAMING THE KEY — the same rule `packages/app/src/config.ts` holds itself
 * to, and `scripts/seed.ts`'s header states outright. `Number('')`, `Number('12a')` and
 * `Number(' ')` are `NaN` or a surprise, and Node answers `NaN` by listening on a RANDOM port:
 * discovery then advertises an issuer the web app was never pointed at, and every sign-in ends at
 * the `400 redirect_uri not registered` this file's own README section warns about — with nothing
 * anywhere naming the typo that caused it (fifth review pass, 2026-09-22).
 */
function digitsOnly(key: string, fallback: string): number {
  const raw = process.env[key] ?? fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${key} must be digits only, got ${JSON.stringify(raw)}`);
  return Number(raw);
}

function httpOrigin(key: string, fallback: string): string {
  const raw = process.env[key] ?? fallback;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${key} must be an http(s) origin, got ${JSON.stringify(raw)}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${key} must be an http(s) origin, got ${JSON.stringify(raw)}`);
  }
  return parsed.origin;
}

const port = digitsOnly('FAKE_OIDC_PORT', '4455');
const webOrigin = httpOrigin('BETTER_AUTH_URL', 'http://localhost:3101');
const clientId = 'momo-local-client';
const clientSecret = 'momo-local-secret';

const fake = await startFakeOidc({
  port,
  clock: systemClock,
  clientId,
  clientSecret,
  redirectUri: `${webOrigin}/api/auth/callback/google`,
  interactive: true,
});

console.log(`fake OIDC provider listening on ${fake.issuer}`);
console.log('point the web app at it with:');
console.log('  AUTH_GOOGLE=on');
console.log(`  GOOGLE_CLIENT_ID=${clientId}`);
console.log(`  GOOGLE_CLIENT_SECRET=${clientSecret}`);
console.log(`  GOOGLE_ISSUER_URL=${fake.issuer}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void fake.close().finally(() => process.exit(0));
  });
}
