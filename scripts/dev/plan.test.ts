import { describe, expect, it } from 'vitest';
import { childSpecs, preparationSteps } from './plan';

/**
 * Decision Q2-A and the env hand-off of `pnpm dev`. Inverting the skip would TRUNCATE a user's
 * data on every start; handing a child `process.env` would drop every key that came from
 * `.env.local`. Both would otherwise pass every other gate.
 */

// A resolved environment that is deliberately NOT process.env.
const env = Object.freeze({ DATABASE_URL: 'postgres://resolved/db', FROM_FILE: 'yes' });
const root = '/repo root/with space';

describe('preparationSteps', () => {
  it('seeds an empty database, last, after the schema, roles and policies', () => {
    const steps = preparationSteps({ holdsTenant: false, env, root });
    expect(steps.map((s) => s.id)).toEqual(['compose', 'migrate', 'pgboss', 'policies', 'seed']);
    expect(steps.at(-1)).toMatchObject({ command: 'pnpm', args: ['seed'] });
  });

  it('never seeds a database that already holds a Tenant', () => {
    const steps = preparationSteps({ holdsTenant: true, env, root });
    expect(steps.map((s) => s.id)).toEqual(['compose', 'migrate', 'pgboss', 'policies']);
    expect(steps.some((s) => s.args.includes('seed'))).toBe(false);
  });

  it('hands every step the resolved env object and the repository root', () => {
    for (const holdsTenant of [true, false]) {
      for (const step of preparationSteps({ holdsTenant, env, root })) {
        expect(step.env, step.id).toBe(env);
        expect(step.env, step.id).not.toBe(process.env);
        expect(step.cwd, step.id).toBe(root);
      }
    }
  });
});

describe('childSpecs', () => {
  it('runs web on the given port and the worker through its start:dev script', () => {
    const [web, worker] = childSpecs({ env, root, port: 3111 });
    expect(web).toMatchObject({
      name: 'web',
      command: 'pnpm',
      args: ['--filter', '@momo/web', 'exec', 'next', 'dev', '-p', '3111'],
    });
    expect(worker).toMatchObject({
      name: 'worker',
      command: 'pnpm',
      args: ['--filter', '@momo/worker', 'start:dev'],
    });
  });

  it('hands each child the resolved env object, not process.env', () => {
    const specs = childSpecs({ env, root, port: 3101 });
    expect(specs).toHaveLength(2);
    for (const spec of specs) {
      expect(spec.env, spec.name).toBe(env);
      expect(spec.env, spec.name).not.toBe(process.env);
      expect(spec.cwd, spec.name).toBe(root);
    }
  });
});
