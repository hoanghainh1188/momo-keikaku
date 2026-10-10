import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { acquireTreeProbeLock } from './support/tree-probe-lock';
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
/** Exit code 2 means violations were found, which several cases here expect. */
function depcruise() {
    try {
        const out = execFileSync(join(ROOT, 'node_modules/.bin/depcruise'), ['apps', 'packages', '--config', '.dependency-cruiser.cjs', '--output-type', 'json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
        return JSON.parse(out);
    }
    catch (error) {
        const failure = error;
        if (failure.status === 2 && failure.stdout)
            return JSON.parse(failure.stdout);
        throw error;
    }
}
// The clean cruise is taken under the tree-probe lock too: since story 5.14,
// `apps/web/src/app/approximate-guards.test.ts` also writes a probe into the tree, and its
// deliberate violation must not be counted as this tree's.
const clean = await (async () => {
    const release = await acquireTreeProbeLock();
    try {
        return depcruise();
    }
    finally {
        release();
    }
})();
/** Every module that imports better-auth, by the source path the cruiser resolved it at. */
const betterAuthImporters = clean.modules
    .filter((module) => (module.dependencies ?? []).some((d) => BETTER_AUTH.test(d.resolved)))
    .map((module) => module.source);
describe('the AD-1 Better Auth carve-out is still visible to the cruiser', () => {
    it('resolves better-auth edges at all — an exclude that swallows node_modules dist has none', () => {
        expect(clean.modules.length, 'the cruiser found almost no modules').toBeGreaterThan(100);
        expect(betterAuthImporters.length, 'the cruiser sees no better-auth edge, so better-auth-only-in-db-auth cannot fire').toBeGreaterThan(0);
    });
    it('has every one of them starting inside packages/db/auth', () => {
        expect(betterAuthImporters.filter((source) => !source.startsWith('packages/db/auth/'))).toEqual([]);
    });
    it('is clean as it stands, so the probes below are the only violations', () => {
        expect(clean.summary.violations).toEqual([]);
    });
});
/**
 * Seven files written where a rule should and should not fire, cruised once together. They are
 * removed in `afterAll` even if an assertion throws; a stray `__probe` file would fail
 * `pnpm typecheck` loudly, which is the right failure mode should one ever leak.
 *
 * They are written into the REAL tree, so the tree-probe lock is held from the first write to the
 * last removal: any other suite walking or cruising `apps/` and `packages/` waits for it rather
 * than listing a probe this file then deletes (`tests/support/tree-probe-lock.ts`).
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
    /**
     * Story 5.14 widened `web-to-domain-present-only`'s `pathNot` from `present/index.ts` to
     * `present/(index|approximate).ts`. These two hold the widening to exactly that: the codec,
     * which `present/index.ts` deliberately leaves out, and the domain `approximate.ts` itself
     * (only its type-only `present/approximate.ts` door is open to web) both still fire.
     */
    webCodec: ['apps/web/src/__probe-present-codec.ts', "export { encode } from '../../../packages/domain/src/present/codec';\n"],
    webApproximate: [
        'apps/web/src/__probe-domain-approximate.ts',
        "export { approximate } from '../../../packages/domain/src/approximate';\n",
    ],
};
const COMPOSITION = 'apps/web/src/server/composition.ts';
/**
 * Swapped in by rename, never rewritten in place: suites that import or read the composition root
 * without the lock (`web-composition.test.ts`, `key-usage.test.ts`) then see the whole file before
 * or the whole file after, never a half-written one. The temporary sits under `node_modules/`,
 * which no suite walks, on the same filesystem as the tree so the rename stays atomic.
 */
function replaceComposition(source) {
    const dir = join(ROOT, 'node_modules/.cache');
    mkdirSync(dir, { recursive: true });
    const temporary = join(dir, `composition-probe-${process.pid}.ts`);
    writeFileSync(temporary, source);
    renameSync(temporary, join(ROOT, COMPOSITION));
}
const COMPOSITION_BASELINE_PROBE = "\n// __probe-baseline-depcruise__\nexport { baselineRepositoryOn as __probeBaselineRepo } from '../../../../packages/db/src/repositories/baseline/index.js';\n";
describe('the import fences fire where they should, and only there', () => {
    let fired = [];
    let compositionOriginal = '';
    let releaseTree = () => { };
    beforeAll(async () => {
        releaseTree = await acquireTreeProbeLock();
        for (const [path, source] of Object.values(PROBES))
            writeFileSync(join(ROOT, path), source);
        compositionOriginal = readFileSync(join(ROOT, COMPOSITION), 'utf8');
        replaceComposition(compositionOriginal + COMPOSITION_BASELINE_PROBE);
        fired = depcruise().summary.violations;
    }, 300_000);
    afterAll(() => {
        try {
            for (const [path] of Object.values(PROBES))
                rmSync(join(ROOT, path), { force: true });
            if (compositionOriginal !== '')
                replaceComposition(compositionOriginal);
        }
        finally {
            releaseTree();
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
        expect(fired.filter((v) => v.from === PROBES.workerAdapters[0]).map((v) => v.rule.name)).toEqual(['apps-adapters-only-from-composition-root']);
    });
    it('fires baseline-repositories-only-from-app-baseline outside app/baseline', () => {
        expect(fired.filter((v) => v.from === PROBES.baselineRepo[0]).map((v) => v.rule.name)).toEqual(['baseline-repositories-only-from-app-baseline']);
    });
    it('fires web-to-domain-present-only on a web file importing present/codec.ts', () => {
        expect(fired.filter((v) => v.from === PROBES.webCodec[0]).map((v) => v.rule.name)).toEqual([
            'web-to-domain-present-only',
        ]);
    });
    it('fires web-to-domain-present-only on a web file importing domain approximate.ts directly', () => {
        expect(fired.filter((v) => v.from === PROBES.webApproximate[0]).map((v) => v.rule.name)).toEqual([
            'web-to-domain-present-only',
        ]);
    });
    it('fires both baseline rules when the composition root imports the baseline repository', () => {
        expect(fired
            .filter((v) => v.from === COMPOSITION && /repositories\/baseline/.test(v.to))
            .map((v) => v.rule.name)
            .sort()).toEqual([
            'baseline-repositories-only-from-app-baseline',
            'composition-root-not-to-baseline-repositories',
        ]);
    });
});
