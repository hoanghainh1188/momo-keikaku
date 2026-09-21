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

const port = Number(process.env.FAKE_OIDC_PORT ?? '4455');
const webOrigin = (process.env.BETTER_AUTH_URL ?? 'http://localhost:3101').replace(/\/+$/, '');
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
