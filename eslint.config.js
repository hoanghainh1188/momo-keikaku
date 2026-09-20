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
//   * No import-direction rules (AD-1). Those need dependency-cruiser and must wait until
//     story 1.2 has rewired the eight `apps/web` files that reach `@momo/db` directly.
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
 */
const applicationSources = ['apps', 'packages'].flatMap((tree) =>
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
  'no-restricted-syntax': ['error', ...(clock ? clockSyntax : []), ...(env ? envSyntax : [])],
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
