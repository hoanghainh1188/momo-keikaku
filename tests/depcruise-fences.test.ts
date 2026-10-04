import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The import-direction fences, pinned — the counterpart to `lint-fences.test.ts`, and here for the
 * same reason it is: `pnpm depcruise` reports violations of the rules it can SEE, and says nothing
 * at all about a rule it can no longer see. Two ways that happens, both measured in the fifth
 * review pass (2026-09-22) and both green under `pnpm depcruise` at the time:
 *
 *   1. The `exclude` regex decides which edges exist at all. Broaden it to swallow node_modules'
 *      `dist/` and `better-auth-only-in-db-auth` has nothing left to match: zero better-auth edges
 *      in the graph, "no dependency violations found", exit 0. That has already happened once in
 *      this repository's short life — see the comment above `exclude` in the config.
 *   2. A rule bans the edges it names, not reachability. `no-test-or-tooling-in-source` used to
 *      name `tests/support/` alone, and a one-line hop through `scripts/` — inside the graph,
 *      outside the cruise entry points — put the fake identity provider back within reach of
 *      apps/web with the gate reporting clean.
 *
 * Neither case is a rule that is WRONG; both are a rule that stopped APPLYING, which is invisible
 * to the tool itself. So this drives THE CLI CI RUNS, not the library underneath it: same binary,
 * same `apps packages` entry points, same config file. The library's `cruise()` takes a ruleset
 * the CLI normalises first, and an un-normalised one is accepted and silently enforces nothing
 * (measured) — which is the very failure this file exists to catch.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BETTER_AUTH = /(^|\/)@?better-auth(\/|$)/;

interface Cruise {
  readonly modules: readonly { readonly source: string; readonly dependencies?: readonly { readonly resolved: string }[] }[];
  readonly summary: { readonly violations: readonly { readonly from: string; readonly to: string; readonly rule: { readonly name: string } }[] };
}

/** Exit code 2 means violations were found, which several cases here expect. */
function depcruise(): Cruise {
  try {
    const out = execFileSync(
      join(ROOT, 'node_modules/.bin/depcruise'),
      ['apps', 'packages', '--config', '.dependency-cruiser.cjs', '--output-type', 'json'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
    return JSON.parse(out) as Cruise;
  } catch (error) {
    const failure = error as { status?: number; stdout?: string };
    if (failure.status === 2 && failure.stdout) return JSON.parse(failure.stdout) as Cruise;
    throw error;
  }
}

const clean = depcruise();

/** Every module that imports better-auth, by the source path the cruiser resolved it at. */
const betterAuthImporters = clean.modules
  .filter((module) => (module.dependencies ?? []).some((d) => BETTER_AUTH.test(d.resolved)))
  .map((module) => module.source);

describe('the AD-1 Better Auth carve-out is still visible to the cruiser', () => {
  it('resolves better-auth edges at all — an exclude that swallows node_modules dist has none', () => {
    expect(clean.modules.length, 'the cruiser found almost no modules').toBeGreaterThan(100);
    expect(
      betterAuthImporters.length,
      'the cruiser sees no better-auth edge, so better-auth-only-in-db-auth cannot fire',
    ).toBeGreaterThan(0);
  });

  it('has every one of them starting inside packages/db/auth', () => {
    expect(betterAuthImporters.filter((source) => !source.startsWith('packages/db/auth/'))).toEqual([]);
  });

  it('is clean as it stands, so the probes below are the only violations', () => {
    expect(clean.summary.violations).toEqual([]);
  });
});

/**
 * Four files written where a rule should and should not fire, cruised once together. They are
 * removed in `afterAll` even if an assertion throws; a stray `__probe` file would fail
 * `pnpm typecheck` loudly, which is the right failure mode should one ever leak.
 */
const PROBES = {
  support: ['packages/app/src/__probe-test-support.ts', "export { startFakeOidc } from '../../../tests/support/fake-oidc.js';\n"],
  tooling: ['packages/app/src/__probe-tooling.ts', "export { peekTenant } from '../../../scripts/peek.js';\n"],
  carveOut: ['packages/app/src/__probe-carve-out.test.ts', "export { startFakeOidc } from '../../../tests/support/fake-oidc.js';\n"],
  /**
   * A SECOND path under `apps/worker`, for a different rule. AD-1 carve-out 3 names
   * `apps/worker/src/index.ts` and `apps/worker/src/boss.ts`, and
   * `apps-adapters-only-from-composition-root` is what holds it to those files — a `pathNot`
   * widened to `^apps/worker/` by accident would grant the whole app and nothing would notice.
   * The rule had no probe at all until the Epic 1 retrospective named the carve-out
   * (F4 / `reviews/review-adversarial-ad1-worker-carve-out.md` F3).
   */
  workerAdapters: ['apps/worker/src/__probe-adapters.ts', "export { productClockOn } from '@momo/adapters';\n"],
  /**
   * Story 4.1: `baseline-repositories-only-from-app-baseline` — a non-baseline app module must
   * not reach `db/repositories/baseline`. (Importing from `packages/app/src/baseline/` stays clean.)
   */
  baselineRepo: [
    'packages/app/src/__probe-baseline-repo.ts',
    "export { baselineRepositoryOn } from '../../db/src/repositories/baseline/index.js';\n",
  ],
} as const;

const COMPOSITION = 'apps/web/src/server/composition.ts';
const COMPOSITION_BASELINE_PROBE =
  "\n// __probe-baseline-depcruise__\nexport { baselineRepositoryOn as __probeBaselineRepo } from '../../../../packages/db/src/repositories/baseline/index.js';\n";

describe('the import fences fire where they should, and only there', () => {
  let fired: readonly { from: string; to: string; rule: { name: string } }[] = [];
  let compositionOriginal = '';

  beforeAll(() => {
    for (const [path, source] of Object.values(PROBES)) writeFileSync(join(ROOT, path), source);
    compositionOriginal = readFileSync(join(ROOT, COMPOSITION), 'utf8');
    writeFileSync(join(ROOT, COMPOSITION), compositionOriginal + COMPOSITION_BASELINE_PROBE);
    fired = depcruise().summary.violations;
  }, 120_000);

  afterAll(() => {
    for (const [path] of Object.values(PROBES)) rmSync(join(ROOT, path), { force: true });
    if (compositionOriginal !== '') {
      writeFileSync(join(ROOT, COMPOSITION), compositionOriginal);
    }
  });

  it('fires on application source importing tests/support directly', () => {
    expect(fired.filter((v) => v.from === PROBES.support[0]).map((v) => v.rule.name)).toEqual([
      'no-test-or-tooling-in-source',
    ]);
  });

  it('fires on application source importing scripts/ — the hop that used to be open', () => {
    expect(fired.filter((v) => v.from === PROBES.tooling[0]).map((v) => v.rule.name)).toEqual([
      'no-test-or-tooling-in-source',
    ]);
  });

  it('leaves an in-package test file alone — it is not application source', () => {
    expect(fired.filter((v) => v.from === PROBES.carveOut[0])).toEqual([]);
  });

  it('fires on a SECOND apps/worker file importing packages/adapters', () => {
    // The carve-out is named paths (`index.ts`, `boss.ts`), not the app. Were this to
    // pass, the gate would be granting `apps/worker/**` and AD-1 carve-out 3 would be fiction.
    expect(
      fired.filter((v) => v.from === PROBES.workerAdapters[0]).map((v) => v.rule.name),
    ).toEqual(['apps-adapters-only-from-composition-root']);
  });

  it('fires baseline-repositories-only-from-app-baseline outside app/baseline', () => {
    expect(
      fired.filter((v) => v.from === PROBES.baselineRepo[0]).map((v) => v.rule.name),
    ).toEqual(['baseline-repositories-only-from-app-baseline']);
  });

  it('fires both baseline rules when the composition root imports the baseline repository', () => {
    expect(
      fired
        .filter((v) => v.from === COMPOSITION && /repositories\/baseline/.test(v.to))
        .map((v) => v.rule.name)
        .sort(),
    ).toEqual([
      'baseline-repositories-only-from-app-baseline',
      'composition-root-not-to-baseline-repositories',
    ]);
  });
});
