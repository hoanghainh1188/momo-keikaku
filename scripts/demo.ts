/**
 * `pnpm demo` — one command, clean state to a running demo.
 *
 *   1. start Postgres 18 in docker compose and wait for it to be healthy
 *   2. apply the schema (drizzle-kit migrate — the AD-30 migration)
 *   3. seed the demo Tenant/Department/Project and replay the fixture Connector
 *   4. start the web app
 *
 * No network access is needed beyond the Postgres image and the package install.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';

const WEB_PORT = Number(process.env.PORT ?? 3101);

// EVERY key the run needs, checked before anything is started. The hardcoded localhost fallback
// that used to live in packages/db/src/client.ts and drizzle.config.ts is gone, so `pnpm demo`
// needs the two database URLs in the environment. The three sign-in keys joined them with story
// 1.4: `pnpm seed` hashes SEED_DEMO_PASSWORD into the demo users' credential rows and `next dev`
// refuses to serve any page without the Better Auth pair. Checking only the database URLs meant a
// run without them got through compose, push, pgboss:migrate and db:policies before failing, and
// the web app 500'd on its first request (fifth review pass, 2026-09-22).
const MISSING = [
  'DATABASE_URL',
  'APP_DATABASE_URL',
  'SEED_DEMO_PASSWORD',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
].filter((key) => !process.env[key]);
if (MISSING.length > 0) {
  const plural = MISSING.length === 1 ? '' : 's';
  process.stderr.write(
    `\n\u001b[31mMissing ${MISSING.join(', ')}.\u001b[0m Export the key${plural} first, e.g.\n\n` +
      `  export DATABASE_URL=postgres://momo:momo@localhost:55433/momo_keikaku\n` +
      `  export APP_DATABASE_URL=postgres://momo_app:momo_app@localhost:55433/momo_keikaku\n` +
      `  export SEED_DEMO_PASSWORD=choose-a-demo-password   # 8+ characters\n` +
      `  export BETTER_AUTH_SECRET=a-local-secret-of-at-least-32-characters\n` +
      `  export BETTER_AUTH_URL=http://localhost:${WEB_PORT}\n\n`,
  );
  process.exit(1);
}
const ROOT = new URL('..', import.meta.url).pathname;

function run(label: string, cmd: string, args: string[]): void {
  process.stdout.write(`\n[1m▸ ${label}[0m\n`);
  const res = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: false });
  if (res.status !== 0) {
    process.stderr.write(`\n[31m✗ ${label} failed[0m\n`);
    process.exit(res.status ?? 1);
  }
}

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    socket.setTimeout(400);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => resolve(false));
  });
}

const busy = await portInUse(WEB_PORT);
if (busy) {
  process.stderr.write(
    `\n[31mPort ${WEB_PORT} is already in use.[0m Run \`PORT=<free port> pnpm demo\`.\n`,
  );
  process.exit(1);
}

run('Starting Postgres (docker compose)', 'docker', [
  'compose',
  '-f',
  'infra/docker-compose.yml',
  'up',
  '-d',
  '--wait',
]);
run('Applying the schema migrations', 'pnpm', ['db:migrate']);
// The roles first: `pgboss:migrate` creates `momo_app` (which `db:policies` grants to and
// which the web app now connects as), and `db:policies` applies the row-level security,
// the grants and the append-only triggers generated from the table-class registry. Without
// both, the web app connects as a role that exists but holds nothing, and every page is
// empty.
run('Creating the database roles and the pg-boss schema', 'pnpm', ['pgboss:migrate']);
run('Applying row-level security, grants and the append-only triggers', 'pnpm', ['db:policies']);
run('Seeding the demo project and replaying the fixture Connector', 'pnpm', ['seed']);

process.stdout.write(
  `\n[1m▸ Starting the web app[0m\n` +
    `\n  Reconciliation Review  http://localhost:${WEB_PORT}/p/prj-ec2/review\n\n`,
);

const web = spawn('pnpm', ['--filter', '@momo/web', 'exec', 'next', 'dev', '-p', String(WEB_PORT)], {
  cwd: ROOT,
  stdio: 'inherit',
});
process.on('SIGINT', () => web.kill('SIGINT'));
web.on('exit', (code) => process.exit(code ?? 0));
