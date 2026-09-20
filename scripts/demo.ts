/**
 * `pnpm demo` — one command, clean state to a running demo.
 *
 *   1. start Postgres 18 in docker compose and wait for it to be healthy
 *   2. apply the schema (drizzle-kit push)
 *   3. seed the demo Tenant/Department/Project and replay the fixture Connector
 *   4. start the web app
 *
 * No network access is needed beyond the Postgres image and the package install.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';

const WEB_PORT = Number(process.env.PORT ?? 3101);

// Both keys, checked before anything is started. The hardcoded localhost fallback that
// used to live in packages/db/src/client.ts and drizzle.config.ts is gone, so `pnpm demo`
// now needs them in the environment; failing here names them, rather than failing three
// steps in with a connection error.
const MISSING = ['DATABASE_URL', 'APP_DATABASE_URL'].filter((key) => !process.env[key]);
if (MISSING.length > 0) {
  process.stderr.write(
    `\n\u001b[31mMissing ${MISSING.join(' and ')}.\u001b[0m Export them first, e.g.\n\n` +
      `  export DATABASE_URL=postgres://momo:momo@localhost:55433/momo_keikaku\n` +
      `  export APP_DATABASE_URL=postgres://momo_app:momo_app@localhost:55433/momo_keikaku\n\n`,
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
run('Applying the schema', 'pnpm', ['exec', 'drizzle-kit', 'push', '--force']);
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
    `\n  Reconciliation Review  http://localhost:${WEB_PORT}/p/prj-ec2/review` +
    `\n  Client View preview    http://localhost:${WEB_PORT}/c/prj-ec2\n\n`,
);

const web = spawn('pnpm', ['--filter', '@momo/web', 'exec', 'next', 'dev', '-p', String(WEB_PORT)], {
  cwd: ROOT,
  stdio: 'inherit',
});
process.on('SIGINT', () => web.kill('SIGINT'));
web.on('exit', (code) => process.exit(code ?? 0));
