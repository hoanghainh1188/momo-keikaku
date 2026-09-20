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
run('Seeding the demo project and replaying the fixture Connector', 'pnpm', [
  'exec',
  'tsx',
  'packages/db/src/seed.ts',
]);

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
