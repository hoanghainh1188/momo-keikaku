// The import-direction gate (ARCHITECTURE-SPINE.md AD-1), run by `pnpm depcruise` in CI.
//
// Story 1.2 slice 4 switched it on, AFTER every `apps/web` file reaching `packages/db` had moved
// onto `packages/app` use cases — the order the epic insists on, because a gate turned on first
// is red on day one for a reason nobody can clear that day.
//
// SCOPE, decided at story 1.2's slice-3 approval and recorded in deferred-work.md: AC-6's
// wording — `apps/*` may not import a repository or Drizzle — not the whole of AD-1. Full AD-1
// would also flag `apps/worker`'s `pg-boss` and `pg`, and drag the queue-adapter move into
// `packages/adapters` with it. The clock/env ban is ESLint's (`eslint.config.js`): this tool
// sees imports, not calls.
//
// THE CARVE-OUTS ARE NAMED PATHS, NOT PATTERNS (AD-1): `apps/web/src/server/composition.ts`,
// `apps/web`'s composition root, and `packages/db/auth`, the Better Auth binding. A third needs
// the spine amended first.
//
// Every rule here has been watched to fail (see the CI header in .github/workflows/ci.yml and
// spec-1-2-web-write-use-cases.md) — including the three forward-looking scheduling rules,
// which match no file today and were proved live with a temporary file at each path.

/** The schedule and plan-input repositories (AD-25, AD-27). Neither exists yet. */
const SCHEDULING_REPOSITORIES = '^packages/db/src/repositories/(schedule|plan-input)([.][a-z.]+$|/)';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment:
        'An import dependency-cruiser cannot resolve matches no other rule, so a broken ' +
        'resolution setup (a wrong tsConfig path, a lost alias) would let `@momo/db` through ' +
        '`apps-not-to-db` silently and the gate would exit 0. Every import in apps/ and ' +
        'packages/ resolves today; fix the resolution rather than narrowing this rule.',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'apps-not-to-drizzle',
      severity: 'error',
      comment:
        'AD-1: no inbound adapter (apps/*) imports Drizzle — the composition root included: its ' +
        'carve-out is for packages/db, and it wires, it never queries. Call a use case.',
      from: { path: '^apps/' },
      to: { path: '(^|/)drizzle-orm(/|$)' },
    },
    {
      name: 'apps-not-to-db',
      severity: 'error',
      comment:
        'AD-1: apps/web calls packages/app use cases, never a repository. The one apps/web file ' +
        'allowed to import packages/db is its composition root, apps/web/src/server/composition.ts; ' +
        'packages/db/auth is the Better Auth binding exported to apps/web alone. Call the use ' +
        'case through the composition root instead.',
      from: {
        path: '^apps/web/',
        pathNot: '^apps/web/src/server/composition[.]ts$',
      },
      to: {
        path: '^packages/db/',
        pathNot: '^packages/db/auth/',
      },
    },
    {
      name: 'web-to-domain-present-only',
      severity: 'error',
      comment:
        'AD-1 (decided 2026-09-21): apps/web may import packages/domain for PRESENTATION only — ' +
        '`@momo/domain/present`, the formatters and the presentation types it re-exports — and ' +
        'nothing that computes. Not the `@momo/domain` barrel, not another module by subpath, ' +
        'and not present/codec.ts, which present/index.ts deliberately does not re-export: ' +
        'writing and reading stored values is not a page\'s to do. A figure a page needs comes ' +
        'from a packages/app use case or the Review result.',
      from: { path: '^apps/web/' },
      to: {
        path: '^packages/domain/',
        pathNot: '^packages/domain/src/present/index[.]ts$',
      },
    },
    {
      name: 'other-apps-not-to-db',
      severity: 'error',
      comment:
        'AD-1: an app other than apps/web has no composition root and no packages/db/auth ' +
        'carve-out (the spine names one per app before it may have one), so it imports ' +
        'nothing from packages/db at all.',
      from: { path: '^apps/', pathNot: '^apps/web/' },
      to: { path: '^packages/db/' },
    },
    {
      name: 'schedule-domain-not-to-attribution',
      severity: 'error',
      comment:
        'AD-1 / AD-27: domain/schedule may not import domain/attribution, so nothing derived ' +
        'from Tracker evidence can become a scheduling input by accident.',
      from: { path: '^packages/domain/src/schedule([.][a-z.]+$|/)' },
      to: { path: '^packages/domain/src/attribution([.][a-z.]+$|/)' },
    },
    {
      name: 'scheduling-repositories-only-from-app-schedule',
      severity: 'error',
      comment:
        'AD-1 / AD-25 / AD-27: db/repositories/schedule and db/repositories/plan-input are ' +
        "app/schedule's alone, so the scheduler stays the only writer of derived dates and " +
        'every input write goes through its fence. (The two repositories may import each other.)',
      from: {
        pathNot: [
          '^packages/app/src/schedule([.][a-z.]+$|/)',
          SCHEDULING_REPOSITORIES,
        ],
      },
      to: { path: SCHEDULING_REPOSITORIES },
    },
    {
      name: 'composition-root-not-to-scheduling-repositories',
      severity: 'error',
      comment:
        'AD-1: the composition root never imports db/repositories/schedule or ' +
        'db/repositories/plan-input. Implied by the rule above; stated on its own so that ' +
        'the carve-out it narrows is visible where the carve-out is granted.',
      from: { path: '^apps/web/src/server/composition[.]ts$' },
      to: { path: SCHEDULING_REPOSITORIES },
    },
  ],
  options: {
    // Build output is not the application's import graph. `node_modules` is NOT excluded, only
    // not followed: excluding it would drop the edge to `drizzle-orm` along with it, and
    // `apps-not-to-db` would then have nothing to match.
    exclude: { path: '(^|/)([.]next|dist)/' },
    doNotFollow: { path: '(^|/)node_modules/' },
    // Type-only imports count: `import type { Db } from '@momo/db'` in a page is the same
    // coupling as a value import, and it is erased before any bundler could object.
    tsPreCompilationDeps: true,
    // A resolver-only tsconfig at the root (see its header for why not apps/web's). Absolute,
    // because a relative `fileName` has its `extends` resolved against the wrong directory
    // (measured: it looked for apps/web/tsconfig.base.json). With it, `@/…` lands on
    // apps/web/src and `@momo/db` on packages/db/src/index.ts, which `^packages/db/` matches.
    tsConfig: { fileName: require('node:path').join(__dirname, 'tsconfig.depcruise.json') },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
      extensions: ['.ts', '.tsx', '.d.ts', '.js', '.jsx', '.mjs', '.cjs', '.json'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
