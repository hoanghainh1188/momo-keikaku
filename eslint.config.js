// The clock and environment fence.
//
// ARCHITECTURE-SPINE.md makes wall time and configuration reachable only through ports:
// `Date.now()`, `Date()`, bare `new Date()` and any read of `env` are errors outside the
// clock adapter and the config module, because the scheduler's determinism and a boot that
// fails naming its missing key both depend on it.
//
// Why ESLint and not dependency-cruiser: dependency-cruiser sees imports, not calls. A
// file can reach the wall clock without importing anything, so an import gate cannot see
// this class of violation at all.
//
// The two bans are kept as SEPARATE lists and recombined per file group, because the two
// sanctioned homes need opposite exemptions: the clock adapter must still be forbidden to
// read the environment, and the config module must still be forbidden to read the clock.
// Handing a whole file to `ignores` would switch both off and leave each home unfenced in
// the direction it has no business going.
//
// Deliberately NOT here:
//   * No `recommended` ruleset, from ESLint or typescript-eslint. A repo-wide lint
//     baseline is scope no requirement states; this config enforces the two architectural
//     bans and nothing else. The parser is configured only so the source can be read.
//   * No type-aware linting, so no `projectService`/`project` — nothing here needs types,
//     and turning it on would put the typecheck's cost inside the lint gate.
//   * No import-direction rules (AD-1). Those are dependency-cruiser's
//     (`.dependency-cruiser.cjs`, `pnpm depcruise`), switched on by story 1.2 slice 4 once the
//     `apps/web` files that reached `@momo/db` directly had moved onto use cases.
//
// Pins: `typescript-eslint` 8.70.0 comes from the decided stack. ESLint itself is not in
// the Stack table, so it is pinned exactly at 10.11.0 — the newest release inside
// typescript-eslint 8.70.0's peer range (`^8.57 || ^9 || ^10`), and its Node requirement
// (`^20.19 || ^22.13 || >=24`) is satisfied by the pinned Node 24.21.0.
import tseslint from 'typescript-eslint';

/**
 * Every extension a module can arrive as. `.js`/`.mjs`/`.cjs` are in the list even though
 * no such file exists under `apps/` or `packages/` today: without them one `.mjs` would
 * step straight through the fence, which is exactly the kind of hole a gate is supposed
 * not to have.
 */
const moduleExtensions = ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'];

/**
 * The application source trees the fence applies to. Tooling is deliberately outside it:
 * `scripts/`, `vitest.config.ts` and `drizzle.config.ts` legitimately read the
 * environment and construct dates, and they are not what the determinism rule is about.
 *
 * `tests/` is inside it (story 1.2 slice 3): it holds the cross-tenant harness and its
 * registry, which drive the application's own use cases and have no more business reading
 * the clock or issuing a query on the bare handle than the code they test. Its `*.test.ts`
 * files keep the test group's environment exemption below, like every other test.
 */
const applicationSources = ['apps', 'packages', 'tests'].flatMap((tree) =>
  moduleExtensions.map((ext) => `${tree}/**/*.${ext}`),
);

// --- the wall-clock ban -----------------------------------------------------------------

const clockProperties = [
  {
    object: 'Date',
    property: 'now',
    message:
      'Wall time comes only from the Clock port. Take a `Clock` and call `clock.nowMs()`; the sole exception is packages/adapters/src/clock.ts.',
  },
];

const clockSyntax = [
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message:
      'Bare `new Date()` reads the wall clock. Take a `Clock` and call `clock.now()`. (`new Date(iso)` with an argument parses a stored instant and is fine.)',
  },
  {
    // `Date(...)` without `new` returns the current time as a string and ignores every
    // argument it is given, so unlike `new Date`, no arity check narrows it.
    selector: "CallExpression[callee.name='Date']",
    message:
      'Calling `Date()` without `new` reads the wall clock and ignores its arguments. Take a `Clock` and call `clock.now()`.',
  },
];

// --- the environment ban ----------------------------------------------------------------

const envProperties = [
  {
    object: 'process',
    property: 'env',
    message:
      'Configuration is parsed once by packages/app/src/config.ts, which is the only place allowed to read process.env. Import the parsed config instead.',
  },
];

const envSyntax = [
  {
    // `no-restricted-properties` above matches the literal shapes — `process.env`,
    // `process['env']` and `const { env } = process`. It cannot see through an alias, so
    // `const p = process; p.env.FOO` walks past it. This catches the read by its property
    // instead of its object, whatever the object is called.
    //
    // `object.name!='process'` keeps the two rules from both reporting the same
    // `process.env`, and the `MetaProperty` exclusion keeps a bundler's `import.meta.env`
    // out of it. A genuinely unrelated `someObject.env` would be a false positive; there
    // is none in the repo (verified by grep), and the fence would rather ask about one
    // than miss an aliased environment read.
    selector: "MemberExpression[property.name='env'][object.name!='process']:not([object.type='MetaProperty'])",
    message:
      'Reading `env` off anything but the parsed config is an environment read by another name. Configuration is parsed once by packages/app/src/config.ts.',
  },
];

// --- the tenant-isolation bans (story 1.2) ------------------------------------------------
//
// Unlike the two above, these are NOT switchable per file group: there is no sanctioned home
// for either, so they are appended to every group the `fence` builder produces — which is
// every module ESLint parses here: `apps/**`, `packages/**`, `scripts/**` and the root
// configs.
//
// What that does NOT cover is anything ESLint does not parse: `.sql` files, the CI workflow,
// `infra/`, Markdown. These are syntax selectors, so they see a string literal and a member
// call and nothing else. `packages/db/src/source-discipline.test.ts` is the backstop that
// walks every tracked file regardless of type; between the two, the coverage is the whole
// repository, and neither claims it alone.

const tenantSyntax = [
  {
    // The non-parameterizable `SET LOCAL` form of the tenant setting. Its right-hand side
    // is not an expression, so it cannot take a bind parameter and the tenant id has to be
    // interpolated into the statement text — the exact shape of the bug this story exists
    // to prevent. The sanctioned form is `set_config('app.tenant_id', $1, true)`, which
    // `withTenant` issues with the value bound.
    //
    // The banned phrase is deliberately not spelled out anywhere in this repository, not
    // even in a message or a comment, so that a plain `grep -r` for it returns nothing at
    // all. The regex below matches it without containing it.
    //
    // The two selectors are the two ways the string can be written: `Literal[value=...]`
    // catches the quoted form, `TemplateElement` the backtick one, which is how anyone
    // building SQL by hand would actually write it.
    selector: "Literal[value=/SET\\s+LOCAL\\s+app\\.tenant_id/i]",
    message:
      'The non-parameterizable SET LOCAL form of the tenant setting cannot take a bind parameter, so the tenant id would have to be interpolated into SQL. Use withTenant(), which binds it: set_config(\'app.tenant_id\', $1, true).',
  },
  {
    selector: "TemplateElement[value.raw=/SET\\s+LOCAL\\s+app\\.tenant_id/i]",
    message:
      'The non-parameterizable SET LOCAL form of the tenant setting cannot take a bind parameter, so the tenant id would have to be interpolated into SQL. Use withTenant(), which binds it: set_config(\'app.tenant_id\', $1, true).',
  },
  {
    // The bare handle. `getDb(...)` returns a connection with no tenant set, so a query
    // issued on it reads a tenant-owned table as empty and writes are refused by the
    // policy's WITH CHECK — a failure that looks like missing data rather than a missing
    // transaction. The convention the rule enforces is a naming one, and deliberately so:
    // a variable called `db` may open a transaction and nothing else, and the handle
    // `withTenant` hands its callback is called `tx`. That makes the violation visible in
    // a diff, not only to the linter.
    selector:
      "CallExpression[callee.type='MemberExpression'][callee.object.name='db'][callee.property.name=/^(select|selectDistinct|selectDistinctOn|insert|update|delete|execute|query|\\$with)$/]",
    message:
      'The bare `db` handle may not query tenant-owned tables: nothing has set app.tenant_id on it. Wrap the work in withTenant(db, tenantId, (tx) => …) and issue it on `tx`.',
  },
];

/**
 * Builds the rule pair for a file group. Each ban is switched on or off independently,
 * and the surviving entries are re-declared in full because a later flat-config block
 * replaces a rule's options rather than merging them.
 */
const fence = ({ clock, env }) => ({
  'no-restricted-properties': [
    'error',
    ...(clock ? clockProperties : []),
    ...(env ? envProperties : []),
  ],
  'no-restricted-syntax': [
    'error',
    ...(clock ? clockSyntax : []),
    ...(env ? envSyntax : []),
    ...tenantSyntax,
  ],
});

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/*.d.ts', 'fixtures/**'],
  },
  {
    // Parser only. No rules: this block exists so `eslint .` can read TypeScript and TSX
    // at all. `@typescript-eslint/parser` enables JSX from the `.tsx` extension itself,
    // and reads plain JavaScript without further configuration.
    name: 'momo/typescript-parser',
    files: moduleExtensions.map((ext) => `**/*.${ext}`),
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2023,
      sourceType: 'module',
    },
  },
  {
    name: 'momo/fence-both',
    files: applicationSources,
    rules: fence({ clock: true, env: true }),
  },
  {
    // The clock's home. It may read the clock — that is its entire job — and may not read
    // the environment.
    name: 'momo/fence-clock-adapter',
    files: ['packages/adapters/src/clock.ts'],
    rules: fence({ clock: false, env: true }),
  },
  {
    // The config's home. It may read the environment and may not read the clock.
    name: 'momo/fence-config-module',
    files: ['packages/app/src/config.ts'],
    rules: fence({ clock: true, env: false }),
  },
  {
    // Tooling. `scripts/`, `vitest.config.ts` and `drizzle.config.ts` legitimately read the
    // environment and construct dates, so neither of the original two bans applies — but
    // the tenant bans have no sanctioned home anywhere, and a migration script is exactly
    // where a hand-interpolated `SET LOCAL` would otherwise be written.
    name: 'momo/fence-tooling',
    files: ['scripts/**/*.ts', 'vitest.config.ts', 'drizzle.config.ts', 'eslint.config.js'],
    rules: fence({ clock: false, env: false }),
  },
  {
    // Tests may read the environment: `packages/db/src/db-round-trip.test.ts` reads
    // `process.env.REQUIRE_DB` to turn an unreachable database into a failure instead of a
    // skip, and this slice may not change an existing test. They may NOT read the wall
    // clock — no test does today, and a test that started to would be nondeterministic,
    // which is the whole reason the clock ban exists.
    name: 'momo/fence-tests',
    files: moduleExtensions.map((ext) => `**/*.test.${ext}`),
    rules: fence({ clock: true, env: false }),
  },
);
