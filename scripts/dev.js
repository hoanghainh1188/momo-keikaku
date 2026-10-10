/**
 * `pnpm dev` (and its alias `pnpm demo`) — one command, clean clone to a running system
 * (story 1.1 slice B3).
 *
 *   1. resolve the keys: the shell first, then the root `.env.local`, which the first run
 *      generates (decision Q1-A, `scripts/dev/env.ts`)
 *   2. start Postgres 18 in docker compose and wait for it to be healthy
 *   3. apply the schema (drizzle-kit migrate — the AD-30 migration)
 *   4. create the roles and the pg-boss schema, then row-level security, grants and triggers
 *   5. seed the demo Tenant — only when the database holds no Tenant yet (decision Q2-A)
 *   6. run `web` and `worker` together under one supervisor (`scripts/dev/supervise.ts`)
 *
 * The keys reach the children only through their environment: `packages/app/src/config.ts`
 * stays the only reader of configuration inside the process, and still validates every key.
 *
 * No network access is needed beyond the Postgres image and the package install.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_WEB_PORT, DEMO_EMAILS, LOCAL_ENV_FILE, missingKeys, resolveDevEnv, } from './dev/env.js';
import { childSpecs, preparationSteps } from './dev/plan.js';
import { portInUse } from './dev/port.js';
import { supervise } from './dev/supervise.js';
import { databaseHoldsATenant } from './dev/tenant.js';
const BOLD = '\u001b[1m';
const RED = '\u001b[31m';
const YELLOW = '\u001b[33m';
const RESET = '\u001b[0m';
// `fileURLToPath`, not `.pathname`: the latter stays percent-encoded (`%20`) under a path with spaces.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WEB_PORT = Number(process.env.PORT ?? DEFAULT_WEB_PORT);
const ENV_FILE = join(ROOT, LOCAL_ENV_FILE);
function fail(message) {
    process.stderr.write(`\n${RED}${message}${RESET}\n`);
    process.exit(1);
}
if (await portInUse(WEB_PORT)) {
    fail(`Port ${WEB_PORT} is already in use. Run \`PORT=<free port> pnpm dev\`.`);
}
// ── 1. The keys (Q1-A) ────────────────────────────────────────────────────────────────────────
const existingFile = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : null;
const { env, fileToWrite } = resolveDevEnv(process.env, existingFile, randomBytes, WEB_PORT);
if (fileToWrite !== null) {
    // `wx`: never overwrite, even if the file appeared between the check and the write.
    writeFileSync(ENV_FILE, fileToWrite, { flag: 'wx', mode: 0o600 });
    process.stdout.write(`\n${BOLD}▸ Wrote ${LOCAL_ENV_FILE}${RESET} (gitignored) with generated local keys.\n`);
}
else {
    process.stdout.write(`\n${BOLD}▸ Reading ${LOCAL_ENV_FILE}${RESET} (keys exported in the shell win).\n`);
}
// Every key the run needs, checked before anything is started. Checking only the database URLs
// meant a run without the sign-in keys got through compose, migrate, pgboss:migrate and
// db:policies before failing, and the web app 500'd on its first request (fifth review pass,
// 2026-09-22). With the generated file this only fires when someone has edited a key out of it.
const MISSING = missingKeys(env);
if (MISSING.length > 0) {
    fail(`Missing ${MISSING.join(', ')}. Add ${MISSING.length === 1 ? 'it' : 'them'} to ${LOCAL_ENV_FILE}, ` +
        `export ${MISSING.length === 1 ? 'it' : 'them'}, or delete ${LOCAL_ENV_FILE} to generate a fresh one.`);
}
if (env.BETTER_AUTH_URL !== `http://localhost:${WEB_PORT}`) {
    process.stdout.write(`${YELLOW}  BETTER_AUTH_URL is ${env.BETTER_AUTH_URL}, but the web app will listen on port ${WEB_PORT}.` +
        ` Sign-in checks the origin against it — export BETTER_AUTH_URL to match.${RESET}\n`);
}
function run(step) {
    process.stdout.write(`\n${BOLD}▸ ${step.label}${RESET}\n`);
    const res = spawnSync(step.command, [...step.args], {
        cwd: step.cwd,
        env: step.env,
        stdio: 'inherit',
        shell: false,
    });
    if (res.status !== 0)
        fail(`✗ ${step.label} failed`);
}
async function probeForTenant() {
    const label = 'Checking whether the database already holds a Tenant';
    process.stdout.write(`\n${BOLD}▸ ${label}${RESET}\n`);
    try {
        return await databaseHoldsATenant(env.DATABASE_URL);
    }
    catch (error) {
        return fail(`✗ ${label} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}
// ── 2–5. Preparation ──────────────────────────────────────────────────────────────────────────
// Everything but the seed first: the Tenant probe needs the migrated schema.
for (const step of preparationSteps({ holdsTenant: true, env, root: ROOT }))
    run(step);
// Q2-A: seed only an empty database (`scripts/dev/plan.ts`).
const holdsTenant = await probeForTenant();
const seedSteps = preparationSteps({ holdsTenant, env, root: ROOT }).filter((s) => s.id === 'seed');
if (seedSteps.length === 0) {
    process.stdout.write(`  The database already holds a Tenant — seed skipped. Run \`pnpm seed\` to reset it to the demo data.\n`);
    if (fileToWrite !== null) {
        // The volume outlived the old `.env.local`: the users were seeded with a password this run
        // has never seen, so the one printed below will not sign in until the seed runs again.
        process.stdout.write(`${YELLOW}  ${LOCAL_ENV_FILE} was just generated, but the demo users still have the password they were` +
            ` seeded with. Run \`pnpm seed\` to apply the new SEED_DEMO_PASSWORD (this resets the demo data).${RESET}\n`);
    }
}
for (const step of seedSteps)
    run(step);
// ── 6. web + worker ───────────────────────────────────────────────────────────────────────────
process.stdout.write(`\n${BOLD}▸ Starting web and worker${RESET} (Ctrl-C stops both; a second Ctrl-C kills them)\n` +
    `\n  Reconciliation Review  http://localhost:${WEB_PORT}/p/prj-ec2/review` +
    `\n  Sign in as            ${DEMO_EMAILS.join(' or ')}` +
    `\n  Password              ${env.SEED_DEMO_PASSWORD}\n\n`);
supervise(childSpecs({ env, root: ROOT, port: WEB_PORT }), {
    onExit: (result) => {
        if (result.failed) {
            process.stderr.write(`\n${RED}✗ ${result.failed.name} exited — pnpm dev stopped.${RESET}\n`);
        }
        process.exit(result.code);
    },
});
