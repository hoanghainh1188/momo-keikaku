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
// `apps/web`'s composition root; `packages/db/auth`, the Better Auth binding; and
// `apps/worker/src/index.ts`, the worker's adapter-wiring entry point. A FOURTH needs the spine
// amended first — and note that the third did not follow that rule: story 1.8 widened
// `apps-adapters-only-from-composition-root` here before AD-1 named the path, which the Epic 1
// retrospective found (F4) and the founder ratified on 2026-09-23. Do it in the other order.
// Those two paths are also the only `apps/*` files that may import `packages/adapters`
// (story 1.3 slice 2 for the first, story 1.8 for the second,
// `apps-adapters-only-from-composition-root`; `tests/depcruise-fences.test.ts` probes a second
// `apps/worker` path, so the grant stays one file rather than the app) and, since
// story 1.4 slice 1, the one `apps/web` file that may import `packages/db/auth`
// (`web-db-auth-only-from-composition-root`); `packages/db/auth` is the one unit that may import
// `better-auth` (`better-auth-only-in-db-auth`).
//
// Every rule here has been watched to fail (see the CI header in .github/workflows/ci.yml and
// spec-1-2-web-write-use-cases.md) — including the three forward-looking scheduling rules,
// which match no file today and were proved live with a temporary file at each path.

/** The schedule and plan-input repositories (AD-25, AD-27). */
const SCHEDULING_REPOSITORIES = '^packages/db/src/repositories/(schedule|plan-input)([.][a-z.]+$|/)';

/** Baseline writer repository (story 4.1) — only `app/baseline` may import it. */
const BASELINE_REPOSITORIES = '^packages/db/src/repositories/baseline([.][a-z.]+$|/)';

/**
 * The Client View route (FR-36, R1): `apps/web/src/app/c/…`, also behind route groups
 * (`app/(client)/c/…`) and parallel-route slots (`app/@modal/c/…`), which the App Router leaves
 * out of the URL. Spelled out per depth (zero to three such segments) rather than as
 * `(?:SEGMENT/)*`: dependency-cruiser refuses a rule whose regex has a repeated group around a
 * repeat (safe-regex, star height 2), and `?` or `{0,n}` count as repeats too (measured). The
 * cap is held by a tripwire in `apps/web/src/app/approximate-guards.test.ts`, which fails if any
 * `c/` folder sits behind more than three of them.
 */
const URL_LESS_SEGMENT = '(?:[(][^/]+[)]|@[^/]+)/';
const CLIENT_VIEW_ROUTE = [0, 1, 2, 3].map((depth) => `^apps/web/src/app/${URL_LESS_SEGMENT.repeat(depth)}c/`);

/** Story 5.14: the person/day-level approximate contract — the web wrapper and both domain modules. */
const APPROXIMATE_MODULES =
  '^apps/web/src/components/approximate-notice[.]tsx?$|^packages/domain/src/(present/)?approximate[.]ts$';

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
      name: 'better-auth-only-in-db-auth',
      severity: 'error',
      comment:
        'AD-1 carve-out 1 (story 1.4 slice 1): packages/db/auth is the single Better Auth <-> ' +
        'Drizzle binding, and the only unit under apps/ or packages/ that imports better-auth (or ' +
        'any @better-auth/* package). Everything else reaches identity through the IdentityPort ' +
        'packages/app declares, or through the composition root\'s auth bindings.',
      from: { path: '^(apps|packages)/', pathNot: '^packages/db/auth/' },
      to: { path: '(^|/)@?better-auth(/|$)' },
    },
    {
      name: 'web-db-auth-only-from-composition-root',
      severity: 'error',
      comment:
        'AD-1 (story 1.4 slice 1): in apps/web only the composition root imports packages/db/auth. ' +
        'The route handler, the middleware and the sign-in and sign-out actions use the ' +
        'composition root\'s auth bindings, so the one auth instance is built in one place.',
      from: {
        path: '^apps/web/',
        pathNot: '^apps/web/src/server/composition[.]ts$',
      },
      to: { path: '^packages/db/auth/' },
    },
    {
      name: 'apps-adapters-only-from-composition-root',
      severity: 'error',
      comment:
        'AD-1 (amended for story 1.3 slice 2 / 1.8 / 5.4): packages/adapters implements the ' +
        'outbound ports packages/app declares. The apps/* files allowed to import it are the ' +
        'named composition roots — apps/web/src/server/composition.ts, apps/worker/src/index.ts, ' +
        'and apps/worker/src/boss.ts (shared createBoss re-export). A page or job handler reading ' +
        'the clock or minting ids itself is a use case\'s decision taken in an inbound adapter.',
      from: {
        path: '^apps/',
        pathNot:
          '^apps/web/src/server/composition[.]ts$|^apps/worker/src/index[.]ts$|^apps/worker/src/boss[.]ts$',
      },
      to: { path: '^packages/adapters/' },
    },
    {
      name: 'inner-packages-not-to-adapters',
      severity: 'error',
      comment:
        'AD-1: packages/adapters IMPLEMENTS the ports packages/app declares (the Clock, the id ' +
        'generator); the dependency points inward only. packages/app, packages/domain and ' +
        'packages/db never import it — a use case that imported systemClock would read the wall ' +
        'clock no test could fix. Declare a port in packages/app and let a composition root wire ' +
        'the adapter in.',
      from: { path: '^packages/(app|domain|db)/' },
      to: { path: '^packages/adapters/' },
    },
    {
      name: 'i18n-imports-nothing',
      severity: 'error',
      comment:
        'Story 1.9: packages/i18n owns catalogs and renderMail only — no workspace imports, so ' +
        'web and worker can depend on it without pulling the app layer.',
      from: { path: '^packages/i18n/' },
      to: { path: '^packages/', pathNot: '^packages/i18n/' },
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
        'from a packages/app use case or the Review result. Story 5.14 adds ONE more entry, ' +
        'present/approximate.ts — the type-only door to the person/day-level Approximated<T> ' +
        'envelope, kept out of the barrel so that importing present/index.ts never reaches it.',
      from: { path: '^apps/web/' },
      to: {
        path: '^packages/domain/',
        pathNot: '^packages/domain/src/present/(index|approximate)[.]ts$',
      },
    },
    {
      name: 'client-view-not-to-approximate',
      severity: 'error',
      comment:
        'Story 5.14 / FR-26 / FR-34: person-level actuals never appear in a Client View. Nothing ' +
        'reachable from the Client View route (app/**/c/**, route groups `(name)/` and slots ' +
        '`@name/` ignored, since they do not change the URL) may reach the approximate ' +
        '(person/day-level) contract: the ApproximateBreakdown wrapper or either approximate ' +
        'domain module. Neither domain barrel re-exports approximate.ts, so a Client View that ' +
        'reaches @momo/domain through packages/app stays clean. Probed by ' +
        'apps/web/src/app/approximate-guards.test.ts with a temporary app/(__probe-approximate)/c page.',
      from: { path: CLIENT_VIEW_ROUTE },
      to: { path: APPROXIMATE_MODULES, reachable: true },
    },
    {
      name: 'other-apps-not-to-db',
      severity: 'error',
      comment:
        'AD-1: apps other than the named composition roots import nothing from packages/db. ' +
        'Story 5.4 names apps/worker/src/index.ts as the worker composition root (same carve-out ' +
        'pattern as apps/web/src/server/composition.ts) so it can wire connector/fixture ports.',
      from: {
        path: '^apps/',
        pathNot:
          '^apps/web/|^apps/worker/src/index[.]ts$',
      },
      to: { path: '^packages/db/' },
    },
    {
      name: 'worker-db-only-from-composition-root',
      severity: 'error',
      comment:
        'AD-1 (story 5.4): in apps/worker only the composition root imports packages/db. Job ' +
        'handlers call use cases; the root wires getDb / inTenantTransaction / fixture cursors.',
      from: {
        path: '^apps/worker/',
        pathNot: '^apps/worker/src/index[.]ts$',
      },
      to: { path: '^packages/db/' },
    },
    {
      name: 'no-test-or-tooling-in-source',
      severity: 'error',
      comment:
        'Story 1.4 slice 3: tests/ and scripts/ hold test infrastructure and developer tooling — ' +
        'among them the fake OIDC provider Google sign-in talks to in tests and local dev. No ' +
        'application source under apps/ or packages/ may import either: a fake identity provider ' +
        'reachable from the product would be a way to sign in that is not Google. ' +
        'REACHABILITY, NOT THE DIRECT EDGE, is what this bans, which is why `scripts/` is here ' +
        'and not only `tests/support/`. `scripts/` is outside the cruise ENTRY POINTS ' +
        '(`depcruise apps packages`) but not outside the GRAPH, so with `to` set to ' +
        '`^tests/support/` alone a one-line hop through `scripts/` reached the fake with the ' +
        'gate reporting clean — measured in the fifth review pass, 2026-09-22: a probe ' +
        'packages/app -> scripts/ -> tests/support/fake-oidc cruised green and exited 0. ' +
        '`scripts/fake-oidc.ts` is still the one legitimate non-test importer of the fake; it is ' +
        'tooling, so nothing under apps/ or packages/ may import IT either, and that is now the ' +
        'rule rather than a remark. Test files are carved out: an in-package `*.test.ts` is not ' +
        'application source and the fake is exactly what it would want.',
      from: { path: '^(apps|packages)/', pathNot: '[.]test[.]tsx?$' },
      to: { path: '^(tests|scripts)/' },
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
        'AD-1 / AD-25 / AD-27 / AR-54: db/repositories/schedule and db/repositories/plan-input are ' +
        "app/schedule's, app/calendar's (publishCalendarVersion), and app/baseline's (setBaseline " +
        'reads the latest successful run). The scheduler stays the only writer of derived dates ' +
        'and every input write goes through its fence or calendar publish. (The two repositories ' +
        'may import each other.)',
      from: {
        pathNot: [
          '^packages/app/src/schedule([.][a-z.]+$|/)',
          '^packages/app/src/calendar([.][a-z.]+$|/)',
          '^packages/app/src/baseline([.][a-z.]+$|/)',
          SCHEDULING_REPOSITORIES,
        ],
      },
      to: { path: SCHEDULING_REPOSITORIES },
    },
    {
      name: 'baseline-repositories-only-from-app-baseline',
      severity: 'error',
      comment:
        'Story 4.1 / AR-22: db/repositories/baseline is app/baseline\'s alone — the only writer of ' +
        'baseline_version / baseline_wp. Composition and other app modules must call setBaseline.',
      from: {
        pathNot: [
          '^packages/app/src/baseline([.][a-z.]+$|/)',
          BASELINE_REPOSITORIES,
        ],
      },
      to: { path: BASELINE_REPOSITORIES },
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
    {
      name: 'composition-root-not-to-baseline-repositories',
      severity: 'error',
      comment:
        'AD-1: the composition root never imports db/repositories/baseline. Call setBaseline ' +
        'through the app barrel instead.',
      from: { path: '^apps/web/src/server/composition[.]ts$' },
      to: { path: BASELINE_REPOSITORIES },
    },
  ],
  options: {
    // Build output is not the application's import graph. `node_modules` is NOT excluded, only
    // not followed: excluding it would drop the edge to `drizzle-orm` along with it, and
    // `apps-not-to-db` would then have nothing to match.
    //
    // `dist` is excluded only UNDER apps/ and packages/ (our own build output), never under
    // node_modules: better-auth ships its code in `dist/`, and a bare `dist` exclusion dropped every
    // edge into it — so `better-auth-only-in-db-auth` could never fire (found by the adversarial
    // review of the story 1.4 spine amendment, 2026-09-21).
    //
    // The negative lookahead is what keeps that fix true at ANY depth. The previous form,
    // `^(apps|packages)/[^/]+/dist/`, only reached depth 3, so `packages/db/auth/dist/` had to be
    // written out beside it and the next nested package would have had its build output cruised.
    // The obvious generalisation `^(apps|packages)/(.*/)?dist/` is WRONG and was measured to be:
    // pnpm nests node_modules under every workspace package, so it also matches
    // `packages/db/auth/node_modules/better-auth/dist/index.mjs`, which reintroduces exactly the
    // bug the paragraph above records. Rejecting any path with `node_modules/` in it first is what
    // makes the depth generic and safe (fifth review pass, 2026-09-22).
    exclude: { path: '(^|/)[.]next/|^(apps|packages)/(?!.*node_modules/).*?/dist/' },
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
