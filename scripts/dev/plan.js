/**
 * The preparation steps, in order. The seed is last and appears only when `holdsTenant` is false.
 * `scripts/dev.ts` runs the steps before the seed first, because the probe that answers
 * `holdsTenant` needs the migrated schema.
 */
export function preparationSteps({ holdsTenant, env, root, }) {
    const step = (id, label, command, args) => ({
        id,
        label,
        command,
        args,
        cwd: root,
        env,
    });
    const steps = [
        step('compose', 'Starting Postgres (docker compose)', 'docker', [
            'compose',
            '-f',
            'infra/docker-compose.yml',
            'up',
            '-d',
            '--wait',
        ]),
        step('migrate', 'Applying the schema migrations', 'pnpm', ['db:migrate']),
        // The roles first: `pgboss:migrate` creates `momo_app` (which `db:policies` grants to and
        // which the web app and the worker connect as), and `db:policies` applies the row-level
        // security, the grants and the append-only triggers generated from the table-class registry.
        // Without both, the apps connect as a role that exists but holds nothing.
        step('pgboss', 'Creating the database roles and the pg-boss schema', 'pnpm', ['pgboss:migrate']),
        step('policies', 'Applying row-level security, grants and the append-only triggers', 'pnpm', [
            'db:policies',
        ]),
    ];
    // Q2-A: `pnpm seed` TRUNCATEs, so seeding a database that already holds a Tenant would wipe
    // whatever was created through the UI since the last seed.
    return holdsTenant
        ? steps
        : [
            ...steps,
            step('seed', 'Seeding the demo project and replaying the fixture Connector', 'pnpm', [
                'seed',
            ]),
        ];
}
/** The two long-lived children: the web app on `port`, and the worker. */
export function childSpecs({ env, root, port }) {
    return [
        {
            name: 'web',
            command: 'pnpm',
            args: ['--filter', '@momo/web', 'exec', 'next', 'dev', '-p', String(port)],
            cwd: root,
            env,
        },
        {
            name: 'worker',
            command: 'pnpm',
            args: ['--filter', '@momo/worker', 'start:dev'],
            cwd: root,
            env,
        },
    ];
}
