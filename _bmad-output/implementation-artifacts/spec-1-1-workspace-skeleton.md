---
title: 'Story 1.1 slice B1 — the workspace skeleton, the config port and the clock fence'
type: 'feature'
created: '2026-09-20'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '3f4fa9d1cba4633530c67d26b6d2365f832e8268'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Five of the eight workspace units the architecture requires do not exist, so every later story has nowhere to put its module: `packages/app` is the whole application layer, and nothing today can read configuration or the wall clock through a port. Wall time and `process.env` are reachable from anywhere, which is the fence the architecture relies on to keep the scheduler deterministic.

**Approach:** Create the five missing units as skeletons, give `packages/app/config` a zod schema that fails boot naming any missing key, give `packages/adapters/clock` the `Clock` port, and make `Date.now()`, bare `new Date()` and `process.env` ESLint errors everywhere except those two homes. Later stories fill the skeletons; this one makes them exist and makes the fence real.

## Boundaries & Constraints

**Always:**
- Versions from the decided stack, exact: `zod` 4.6.5, `typescript-eslint` 8.70.0. ESLint itself is not in the Stack table — pin whatever major typescript-eslint 8.70.0 accepts (`^8.57 || ^9 || ^10`) exactly, and record the choice.
- The clock/env ban is enforced by **ESLint**, not dependency-cruiser, because dependency-cruiser cannot see calls.
- A new gate must be non-vacuous: prove the lint rule fires on a deliberate violation and that a missing config key fails boot, the same way slice A proved its typecheck gate.
- All existing gates stay green: both typechecks and 53 tests across 4 files.

**Never:**
- **No `dependency-cruiser` and no AD-1 import gate.** The eight `apps/web` files that reach `@momo/db` directly must be rewired first, and that is story 1.2's; turning the gate on before the rewiring makes CI red for a reason nobody can clear that day.
- **No ESLint `recommended` ruleset.** Only the clock/env restrictions. A repo-wide lint baseline is scope no requirement states, and §7.3 makes adding what no requirement states a correct-course matter.
- **No pg-boss, no database roles, no `pnpm dev` orchestration.** Those are slices B2 and B3 in `deferred-work.md`; B3 is additionally blocked on story 1.2's RLS/grants SQL and story 2.1's migration, neither of which exists.
- No auth, no i18n catalogs, no adapters beyond the clock. The skeletons stay skeletons.
- No schema change, no migration, no data touched.

</frozen-after-approval>

## Code Map

- `packages/domain/package.json`, `packages/db/package.json` — the convention to copy: `{ name, version: "0.0.0", private: true, type: "module", main: "src/index.ts" }` and nothing else. `packages/domain` must keep **no** runtime dependency but `zod` when it eventually takes one.
- **No per-package `tsconfig.json` exists anywhere today.** Everything is covered by the root `tsconfig.json`'s `include: ["packages/**/*.ts", "scripts/**/*.ts", ...]`, which is why new packages under `packages/` are typechecked automatically but `apps/worker` will not be — the root config excludes `apps`.
- `tsconfig.json` vs `tsconfig.base.json` — the root duplicates the base verbatim instead of extending it. That duplication is why slice A had to delete `baseUrl` in three files, and TypeScript 7 has further deprecations queued. Make the root extend the base.
- `packages/db` — named in story 1.1's final criterion as owing `"types": ["node"]`, and it has no tsconfig at all. Give it one.
- `packages/db/src/client.ts:5` — `process.env.DATABASE_URL ?? '...'` reads the environment directly and will become an ESLint error. It is the concrete case the fence exists for: either it moves behind `app/config`, or it carries a narrow, justified disable. Decide and say which in Implementation Notes.
- `scripts/*.ts`, `vitest.config.ts`, `drizzle.config.ts` — all read `process.env` or construct dates; they are tooling rather than application code, so the ESLint config must scope the ban to the source trees it means, not the whole repo.
- `.github/workflows/ci.yml` — three gates today plus a database prepare step. A lint gate belongs next to them; an ungated rule enforces nothing.
- `apps/web/tsconfig.json` — extends the base and redeclares `paths`, losing the base's `@momo/*` wildcards. Pre-existing and recorded in `deferred-work.md`; leave it.

## Tasks & Acceptance

**Execution:**
- [x] `package.json` — add `zod`, `typescript-eslint`, `eslint` at exact pinned versions; add a `lint` script.
- [x] `packages/app/`, `packages/adapters/`, `packages/i18n/`, `packages/db/auth/`, `apps/worker/` — create each with a `package.json` matching the existing convention and an `src/index.ts`.
- [x] `packages/app/src/config.ts` — one zod schema parsed once; a missing required key fails at boot **naming the key**. This is the only place `process.env` is read in application code.
- [x] `packages/adapters/src/clock.ts` — the `Clock` port and its system implementation; the only place `Date.now()` / bare `new Date()` are allowed.
- [x] `eslint.config.js` — flat config with `no-restricted-properties` / `no-restricted-syntax` for `Date.now()`, bare `new Date()` and `process.env`, scoped to the application source trees, with `packages/adapters/clock` and `packages/app/config` exempt.
- [x] `tsconfig.json` — extend `tsconfig.base.json` instead of duplicating it.
- [x] `packages/db/tsconfig.json`, `apps/worker/tsconfig.json` — declare `"types": ["node"]`; `apps/worker` needs its own because the root config excludes `apps`.
- [x] `.github/workflows/ci.yml` — add a lint gate beside the existing ones, with `always()` so it does not mask the others.
- [x] Resolve `packages/db/src/client.ts`'s direct `process.env` read.

**Acceptance Criteria:**
- Given a clean install, when `pnpm lint` runs, then it exits 0.
- Given a deliberate `Date.now()` added to `packages/db/src/repo.ts`, when `pnpm lint` runs, then it fails naming that rule — and passes again when removed.
- Given a deliberate `process.env.FOO` added outside the two exempt homes, when `pnpm lint` runs, then it fails.
- Given a required configuration key removed from the environment, when the config module is loaded, then it throws naming that key rather than failing later.
- Given the eight workspace units, when `pnpm typecheck` and `pnpm --filter @momo/web typecheck` run, then both exit 0 and every unit the root config covers is typechecked.
- Given `pnpm test`, when it runs against a seeded database, then 53 tests across 4 files still pass and no existing test changed.
- Given story 1.1's final criterion, when this slice closes, then `packages/db`, `packages/adapters` and `apps/worker` all declare `"types"`, satisfying the half slice A deferred.

## Implementation Notes

**ESLint version, recorded as the spec asked.** `eslint` is pinned exactly at **10.11.0**
— the newest release inside `typescript-eslint` 8.70.0's peer range
(`^8.57.0 || ^9.0.0 || ^10.0.0`), verified with `npm view typescript-eslint@8.70.0
peerDependencies`. Its own `engines` (`^20.19 || ^22.13 || >=24`) is satisfied by the Node
24.21.0 CI pins and the 24.13.0 on this box. `typescript-eslint` 8.70.0 also declares
`typescript: >=4.8.4 <6.1.0`, so the repo's TypeScript 6.0.3 is inside the range — worth
recording because 6.1 would fall outside it.

**`zod` placement.** 4.6.5 exactly, in the root `dependencies` (not dev: `packages/app`
imports it at runtime) **and** declared at the same exact version in
`packages/app/package.json`, which now carries a `dependencies` block on top of the Code
Map's five fields. The first attempt followed the convention literally and let the import
resolve by walking up to the workspace root — a phantom dependency, caught in review.
`packages/db/package.json` already declares its own runtime deps the same way, so the
convention was never as absolute as "and nothing else" read. `packages/app/node_modules/zod`
is now a real symlink and the lockfile records the importer. The exact pin is duplicated in
two manifests with nothing enforcing lockstep — the same drift `deferred-work.md` already
records for drizzle-orm and pg, and the same fix (pnpm `catalogs:`) would cover all of them.

**`packages/db/auth` is a real workspace member.** `pnpm-workspace.yaml`'s `packages/*`
glob does not reach one level deeper, so `packages/db/auth` was added explicitly. Without
that line its `package.json` would be decorative and nothing could ever depend on
`@momo/db-auth`. `pnpm install` now reports "all 9 workspace projects" (root + the eight
units) and the lockfile carries all eight importers.

**The eight units and their names.** `@momo/web`, `@momo/db`, `@momo/domain` (existing);
`@momo/app`, `@momo/adapters`, `@momo/i18n`, `@momo/db-auth`, `@momo/worker` (new).
`@momo/db-auth` rather than `@momo/db/auth` because a scoped npm name takes only one
slash.

**`packages/db/src/client.ts` — decided: a narrow disable, not a move behind
`app/config`.** The spec asked for the decision to be stated. Moving it is not possible
inside this slice without inverting the architecture's import direction: `packages/db`
implements ports that `packages/app` declares, so `import { config } from '@momo/app'`
here is exactly the edge dependency-cruiser will forbid when story 1.2 turns AD-1 on. The
correct end state is `getDb(connectionString)` taking the value from the parsed config,
which changes every caller — the eight `apps/web` files that reach `@momo/db` directly,
the seed, the scripts and the tests — and those eight files are what story 1.2 rewires
onto use cases. So: one `eslint-disable-next-line no-restricted-properties`, a comment
naming who removes it, and an entry in `deferred-work.md`.

**A second violation the spec did not name: `apps/web/src/app/actions.ts:86`.**
`return p ? p.demoAnchor : new Date();` is a bare `new Date()` and the fence caught it the
first time `pnpm lint` ran. The spec's task list named only the `client.ts` case, so this
is the one thing found by running the gate rather than by reading. Same treatment and same
reason — `apps/web` has no composition root to inject a `Clock` from, and this file is one
of the eight story 1.2 rewires. One-line disable, recorded in `deferred-work.md`. It is
also the useful evidence that the fence is not decorative: it found a violation nobody had
written down.

**Test files are exempt from the environment ban only — the clock ban stays in force.**
`packages/db/src/db-round-trip.test.ts:29` reads `process.env.REQUIRE_DB`, and this slice's
acceptance criteria require `git diff --stat -- '*.test.ts'` to be empty, so the environment
exemption really is forced. The first attempt handed the whole test tree to `ignores`, which
switched the clock ban off too and was justified here as "forced" — wrong, as review found:
no test file contains `Date.now()` or `new Date()`, so the clock ban costs tests nothing and
prevents exactly the nondeterminism it exists for. The exemption is now one ban wide, and the
claim is corrected here, in `eslint.config.js`, in `packages/app/src/config.ts` and in
`deferred-work.md`.

**The two sanctioned homes are exempt from one ban each, not from the fence.** Same class of
error, same review: passing a file to `ignores` switches off every rule in the block, which
left `packages/adapters/src/clock.ts` free to read `process.env` and
`packages/app/src/config.ts` free to call `Date.now()`. The config now keeps the two bans as
separate lists and recombines them per file group, so each home is still fenced in the
direction it has no business going. Because a later flat-config block *replaces* a rule's
options rather than merging them, each override re-declares the surviving entries in full —
that is what the `fence({ clock, env })` helper is for.

**Three more holes review found in the fence, all closed.** `Date()` called without `new`
reads the clock and ignores its arguments, so it is banned outright rather than by arity
(`CallExpression[callee.name='Date']`). `const p = process; p.env.FOO` walked past
`no-restricted-properties`, which matches only the literal member shape, so a second
selector catches the read by its property instead of its object
(`MemberExpression[property.name='env'][object.name!='process']`, excluding
`import.meta.env`; there is no unrelated `.env` in the repo, verified by grep). And the
`files` globs covered only `.ts`/`.tsx`, so one `.mjs` under `packages/` stepped through
untouched — the fenced extension list is now `ts, tsx, mts, cts, js, jsx, mjs, cjs`, shared
with the parser block.

**`pnpm lint` is `eslint . --max-warnings 0`.** Without it, the unused-disable mechanism
that both this spec and `deferred-work.md` rely on to retire the two sanctioned disables
reports a warning and exits 0 — a retirement notice nobody ever sees. Warnings now fail the
gate, which is also why deleting the dead `no-console` directive mattered rather than being
cosmetic.

**One line removed from `packages/db/src/seed.ts`.** A pre-existing
`// eslint-disable-next-line no-console` sat above the seed's summary `console.log`,
written before this repo had ESLint at all. With ESLint present and `no-console` deliberately
*not* configured (no `recommended` ruleset, per the Boundaries), that directive reports as an
unused-disable warning on every run. Rather than switching
`reportUnusedDisableDirectives` off — which would also hide a stale disable on the two
fence rules, the thing most worth knowing about — the dead directive was deleted. `pnpm
lint` is now clean at zero warnings as well as zero errors, so the gate's output means
something.

**Four per-package tsconfigs, not the two the task list named.** The task list named
`packages/db` and `apps/worker`; the closing acceptance criterion named three
(`packages/db`, `packages/adapters`, `apps/worker`); the right answer is four. Review
pointed out that picking them by the names in an epics.md line rather than by need had
missed the one package that most needs `"types": ["node"]` — `packages/app`, the only
package in the repo that references the `process` global at all. `packages/app/tsconfig.json`
now matches the others.

**Scope held.** No dependency-cruiser and no AD-1 import gate. No `recommended` ruleset
from either ESLint or typescript-eslint, and no type-aware linting (no
`projectService`/`project`), so the lint gate does not pay for the typecheck a second
time. No pg-boss, no database roles, no `pnpm dev` orchestration (the existing
`pnpm dev` still just runs `@momo/web`). Two deliberate departures from the five-field
manifest convention, both forced by review: `packages/app` declares `zod`, and `apps/worker`
declares a `typecheck` script so CI can gate it. No auth, no i18n catalogs, no adapter
beyond the clock. No schema change, no migration, no data touched. `apps/web/tsconfig.json`
left alone as the Code Map instructed.

## Spec Change Log

- 2026-09-20 — Added `packages/adapters/tsconfig.json` to the executed work. The task list
  named two tsconfigs, the closing acceptance criterion named three packages; the criterion
  was taken as authoritative. No change to intent.
- 2026-09-20 — Added `packages/db/auth` to `pnpm-workspace.yaml`. Not in the task list, but
  the `packages/*` glob does not match a nested directory, and the acceptance criteria talk
  about "the eight workspace units" — without the line, one of the eight is not a unit.
- 2026-09-20 — One extra fence violation resolved beyond the task list:
  `apps/web/src/app/actions.ts:86`'s bare `new Date()`, found by running the gate. Same
  treatment as the `client.ts` case the spec did name. Required by AC 1 (`pnpm lint` exits
  0).
- 2026-09-20 — Deleted the stale `// eslint-disable-next-line no-console` in
  `packages/db/src/seed.ts`, so the new gate reports zero warnings rather than one on every
  run. One comment line; no behaviour change.
- 2026-09-20 (review) — Added `packages/app/tsconfig.json`, so four packages declare
  `"types": ["node"]` rather than the two the task list named or the three the closing
  criterion named. `packages/app` is the only package referencing the `process` global.
- 2026-09-20 (review) — `packages/app/package.json` declares `zod` and
  `apps/worker/package.json` declares a `typecheck` script, both departing from the Code
  Map's five-field convention. A phantom dependency and an ungated tsconfig are each worse
  than the inconsistency.
- 2026-09-20 (review) — Added a third CI typecheck step for `apps/worker`. The Code Map
  predicted the gap and the task list did not ask for it; review showed a type error there
  passed both existing gates, so it is a hole rather than a known cost.

## Review Triage Log

Nine findings, 2026-09-20, all accepted and fixed — no pushback on any of them. Six were
holes in the fence itself, which is the part of this slice that had to be right.

| # | Finding | Fix |
|---|---|---|
| 1 | `Date()` without `new` lints clean — the selector only matched `NewExpression` | Added `CallExpression[callee.name='Date']`, unrestricted by arity, because `Date(...)` ignores its arguments and always reads the clock |
| 2 | `const p = process; p.env.FOO` lints clean — `no-restricted-properties` matches only the literal shape | Added `MemberExpression[property.name='env'][object.name!='process']:not([object.type='MetaProperty'])`. The `object.name!='process'` half keeps the two rules from double-reporting; the `MetaProperty` half keeps `import.meta.env` out |
| 3 | The fence's `files` globs covered only `.ts`/`.tsx`, so a `.mjs` under `packages/` escaped entirely | Fenced extensions are now `ts, tsx, mts, cts, js, jsx, mjs, cjs`, shared with the parser block via one `moduleExtensions` list |
| 4 | `pnpm lint` had no `--max-warnings 0`, so a stale disable could never fail CI | `eslint . --max-warnings 0` |
| 5 | The two sanctioned homes were passed to `ignores`, switching off *both* bans for each | The bans are separate lists recombined per file group by `fence({ clock, env })`; `clock.ts` is exempt from the clock ban only, `config.ts` from the environment ban only |
| 6 | The `**/*.test.ts` exemption also switched off both bans, and the "forced" justification was wrong | Narrowed to the environment ban. No test contains `Date.now()` or `new Date()`, so the clock ban stays in force there. The wrong claim corrected in four places |
| 7 | `packages/app/tsconfig.json` missing — the one package that references the `process` global | Added, matching the other three. The four were chosen by need this time, not by the names in an epics.md line |
| 8 | `packages/app` imported `zod` without declaring it — a phantom dependency | Declared at `4.6.5`, the root's exact pin. `packages/app/node_modules/zod` is now a real symlink and the lockfile records the importer |
| 9 | A type error in `apps/worker` passed both CI typecheck gates | `apps/worker` gained a `typecheck` script and CI a third typecheck step with `if: always()` |

Findings 5 and 6 share one root cause worth naming: `ignores` is file-shaped and the fence
is rule-shaped, so reaching for `ignores` to exempt a file silently exempts it from
everything in the block. Findings 1, 2 and 3 share another: each was a bypass one syntactic
step away from a form the probes *did* cover, which is why the probe set is now nine wide
rather than four.

All verdicts below were verified by my own probe against the working tree, not taken from the reviewers.

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | `Date()` called without `new` reads the wall clock and escapes the fence | high | Confirmed: `export const __h1 = Date();` in `repo.ts` lints exit 0. The selector only matches `NewExpression`. `Date()` returns the current time as a string — the determinism leak the fence exists to stop | patch |
| 2 | Aliasing `process` escapes the env ban | high | Confirmed: `const __p = process; __p.env.FOO` lints exit 0. `no-restricted-properties` matches the member expression shape only | patch |
| 3 | The fence covers `.ts`/`.tsx` only, so `.js`/`.mjs`/`.cjs` under `apps/`/`packages/` escape entirely | high | Confirmed: a `packages/domain/src/probe.mjs` with both `Date.now()` and `process.env.FOO` lints exit 0. ESLint visits the file; no rule in the fence block matches it | patch |
| 4 | `pnpm lint` lacks `--max-warnings 0`, so the unused-disable mechanism both documents rely on can never fail CI | high | Confirmed: a stale `eslint-disable-next-line` produces a warning and **exit 0**. Two documents claim `reportUnusedDisableDirectives` retires the sanctioned disables automatically; it reports into a green log | patch |
| 5 | Sanctioned homes are exempted from **both** rules rather than each from its own | medium | Confirmed: `process.env.FOO` appended to `clock.ts` lints exit 0. `clock.ts` may read env and `config.ts` may read the clock — neither is that file's job | patch |
| 6 | `packages/app` has no tsconfig although it is the only package referencing the `process` global | medium | Confirmed absent. The three that got one were chosen by the names in an epics.md line, not by need. The stated rationale — the declaration travels with the package — applies most to this one | patch |
| 7 | `packages/app` imports `zod` without declaring it — a phantom dependency | medium | Confirmed: `zod` is only in the root manifest and `packages/app` has no `node_modules`. Resolution works by walking up, which breaks under an isolated linker or a standalone trace | patch |
| 8 | A type error in `apps/worker` passes both CI typecheck gates | medium | Confirmed: an injected `const __bad: number = 'nope'` gives exit 0 from both `pnpm typecheck` and the web typecheck, while `tsc -p apps/worker/tsconfig.json` reports it. Costs nothing today; starts costing the day B2 puts pg-boss there | patch |
| 9 | The `**/*.test.ts` exemption turns off both rules, and the claim that it was forced is wrong | medium | Confirmed: no existing test contains `Date.now()` or `new Date()` — only `db-round-trip.test.ts` reads `process.env.REQUIRE_DB`. Narrowing the exemption to the env rule alone closes the wall-clock hole in tests now | patch |
| 10 | `client.ts` keeps `?? 'postgres://momo:momo@localhost:55433/...'`, so a missing `DATABASE_URL` silently connects to a dev database instead of failing | medium | Confirmed at `client.ts:18`. It contradicts `config.ts`'s own header promise. **Pre-existing** — the `??` default predates this slice — and removing it breaks `pnpm demo`, which relies on the default. That makes it a decision, not a trivial correction | defer |
| 11 | `config` is parsed eagerly and re-exported from the barrel, so importing `@momo/app` for any reason requires `DATABASE_URL` | medium | Confirmed by probe: the import throws without the key. Correct fail-boot behaviour today and nothing imports the barrel, but it makes every future pure use-case test require the env. The fix is a design choice (lazy `getConfig()` vs keeping `config` out of the barrel), not a correction | defer |
| 12 | `DATABASE_URL` is validated only as a non-empty string while the message promises a connection string | low | Confirmed: `" "` and `"localhost"` parse. Real, but adding format validation is an enhancement beyond what any requirement states | defer |
| 13 | `parseConfig` throws a bare `Error`, discarding the `ZodError` | low | Confirmed. `{ cause }` would lose nothing, but nothing consumes it yet | defer |
| 14 | `Clock` exposes two methods that must agree, and `now()` returns a mutable `Date` | low | Real design observation. Speculative harm — no consumer exists, and story 1.8's fixture clock is where the shape gets tested | defer |
| 15 | `parseConfig` has no unit test, and the fail-boot AC is proven only by a hand-run probe | medium | Confirmed. AC 6 forbids *changing* test files, not adding one, so nothing blocks it — but adding a test is new work rather than a correction, and it needs `DATABASE_URL` present because of finding 11 | defer |
| 16 | `deferred-work.md` gained a `resolved:` key its own header does not define, on entries whose `summary` still describes the work as open | low | Confirmed. Purely additive, so the workflow's do-not-modify rule holds, but a reader scanning summaries reads closed items as open | defer |
| 17 | `apps/web/next.config.ts` is inside the fence although sibling tooling configs are outside it | low | Confirmed — it appears in the lint file list. Lints clean today; the first env-driven Next setting will need a disable for a reason the other config files never needed one | defer |
| 18 | The deleted `no-console` directive in `seed.ts` removed the record that the log is deliberate | low | Confirmed removed. No `no-console` rule is configured, so the directive was genuinely dead; the intent is recoverable from the line itself | rejected |

## Verification

**Commands:**
- `pnpm install --frozen-lockfile` — expected: succeeds
- `pnpm lint` — expected: exit 0
- `pnpm typecheck` / `pnpm --filter @momo/web typecheck` — expected: exit 0
- `pnpm test` — expected: `Test Files 4 passed (4)`, `Tests 53 passed (53)`
- `git diff --stat -- '*.test.ts'` — expected: empty
- Lint fence probe — add `Date.now()` to a source file, expect `pnpm lint` to fail, remove it, expect exit 0
- Config probe — unset a required key, expect the boot parse to throw naming it

**Results — all run on 2026-09-20, Node 24.13.0, pnpm 12.4.2:**

| Command | Expected | Actual |
|---|---|---|
| `pnpm install --frozen-lockfile` | succeeds | ✅ "Scope: all 9 workspace projects", "Lockfile is up to date" |
| `pnpm lint` (`eslint . --max-warnings 0`) | exit 0 | ✅ exit 0, zero errors and zero warnings |
| `pnpm typecheck` | exit 0 | ✅ exit 0 |
| `pnpm --filter @momo/web typecheck` | exit 0 | ✅ exit 0 |
| `pnpm --filter @momo/worker typecheck` | exit 0 | ✅ exit 0 — now a CI gate, not a hand-run |
| `pnpm test` (REQUIRE_DB=1, seeded Postgres) | 4 files / 53 tests | ✅ `Test Files 4 passed (4)`, `Tests 53 passed (53)` |
| `git diff --stat -- '*.test.ts'` | empty | ✅ empty — no test file touched |
| `tsc -p packages/db/tsconfig.json` | exit 0 | ✅ exit 0 |
| `tsc -p packages/adapters/tsconfig.json` | exit 0 | ✅ exit 0 |
| `tsc -p packages/app/tsconfig.json` | exit 0 | ✅ exit 0 |
| `tsc -p apps/worker/tsconfig.json` | exit 0 | ✅ exit 0 (this is what the CI step above runs) |

**Lint fence probes — the gate was watched to fail nine ways.** Four were written first;
five more were added after review found the fence could be walked past. Each injects one
line, runs `pnpm lint`, then restores the file and confirms exit 0 and a clean `git diff`:

| Injected, and where | Result |
|---|---|
| `Date.now()` in `packages/db/src/repo.ts` | ✅ exit 1 — `'Date.now' is restricted from being used` (`no-restricted-properties`) |
| `new Date()` | ✅ exit 1 — `Bare \`new Date()\` reads the wall clock` (`no-restricted-syntax`) |
| `Date()` — no `new` | ✅ exit 1 — `Calling \`Date()\` without \`new\` reads the wall clock` (`no-restricted-syntax`). Was **exit 0** before review |
| `process.env.FOO` | ✅ exit 1 — `'process.env' is restricted from being used` (`no-restricted-properties`) |
| `const { env } = process` | ✅ exit 1 — the ban survives destructuring |
| `const p = process; p.env.FOO` | ✅ exit 1 — the ban survives aliasing (`no-restricted-syntax`). Was **exit 0** before review |
| `Date.now()` + `process.env.FOO` in a new `packages/domain/src/probe.mjs` | ✅ exit 1 — a non-TS module is fenced too. Was **exit 0** before review |
| A stale `// eslint-disable-next-line no-restricted-properties` | ✅ exit 1 — one unused-directive report, and `--max-warnings 0` makes it fail. Was **exit 0** before review |
| `process.env.FOO` in `packages/adapters/src/clock.ts` | ✅ exit 1 — the clock's home is exempt from the clock ban only. Was **exit 0** before review |
| `Date.now()` in `packages/app/src/config.ts` | ✅ exit 1 — the config's home is exempt from the environment ban only. Was **exit 0** before review |
| `Date.now()` in `packages/db/src/db-round-trip.test.ts` | ✅ exit 1 — tests are exempt from the environment ban only. Was **exit 0** before review |

And the exemptions were verified positively, not assumed: that same
`db-round-trip.test.ts`, unmodified and reading `process.env.REQUIRE_DB`, lints clean, and
`pnpm exec eslint packages/adapters/src/clock.ts packages/app/src/config.ts` exits 0 with
both bans otherwise in force. `new Date(iso)` with an argument is not flagged anywhere —
`packages/domain/src/calendar.ts`, `packages/db/src/seed.ts` and `packages/db/src/fixtures.ts`
together hold 14 of them and all lint clean, which is the point: parsing a stored instant
reads no clock.

**The `apps/worker` gate was watched to fail too.** Injecting
`const __bad: number = 'nope';` into `apps/worker/src/index.ts`: `pnpm typecheck` exits 0
and `pnpm --filter @momo/web typecheck` exits 0 — the root config excludes `apps` — while
`pnpm --filter @momo/worker typecheck` reports TS2322 and exits 1. Before review that third
gate did not exist, so the error reached main with everything green.

**Typecheck-coverage probe — "every unit the root config covers is typechecked" was
measured, not assumed.** Injecting `export const __probe: number = "not a number";` into
each new unit's `src/index.ts` and running `pnpm typecheck`:

| Unit | Root `pnpm typecheck` |
|---|---|
| `packages/app` | ✅ fails, TS2322 |
| `packages/adapters` | ✅ fails, TS2322 |
| `packages/i18n` | ✅ fails, TS2322 |
| `packages/db/auth` | ✅ fails, TS2322 |
| `apps/worker` | ⚠️ passes — the root config excludes `apps`, exactly as the Code Map says. `tsc -p apps/worker/tsconfig.json` catches it (TS2322), but no gate runs that config. Recorded in `deferred-work.md`. |

Every probe was reverted and `git status` confirmed clean afterwards.

**Config fail-boot probe — three ways, each naming the key:**

| `DATABASE_URL` | Result |
|---|---|
| absent (`env -u DATABASE_URL`) | ✅ throws `Invalid configuration: DATABASE_URL is required — the PostgreSQL connection string, e.g. postgres://user:pass@host:port/db` |
| empty string | ✅ throws `Invalid configuration: DATABASE_URL must not be empty — it is the PostgreSQL connection string` |
| set | ✅ loads, `config` parses to `{"DATABASE_URL":"…"}` |

Run as `pnpm exec tsx -e "import('./packages/app/src/config.ts').then(…).catch(…)"`, which
loads the module the way boot would. Note the probe is a hand-run one: nothing in
`pnpm test` imports `@momo/app`, so this behaviour is not yet gated (recorded in
`deferred-work.md`).

**The CI path was walked end to end locally, not just the gate list.** `pnpm exec
drizzle-kit push --force` ("No changes detected") and `pnpm seed` ("seeded: 48 WPs, 41
baseline WPs, 6 snapshots, 144 ledger entries, 184 mapping events") both still run with the
root `tsconfig.json` now carrying leading comments — worth checking, because a tool reading
it with a strict JSON parser rather than a JSONC one would have broken on that. `pnpm dev`
was smoke-tested too: `next dev` boots and `GET /` answers 307 to `/p/prj-ec2/review`, which
is what `page.tsx` does.

**Not verified:**
- The `Clock` port has no consumer, so nothing exercises `systemClock` at runtime.
- The CI lint step itself has not run on a GitHub runner — it runs the same `pnpm lint`
  that is green locally, but the workflow edit is unexecuted until the first push.
