---
title: 'Story 1.1 slice A — move the toolchain to the decided stack'
type: 'chore'
created: '2026-09-20'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: 'ab852c3f39fc76c8ab2390e0a3a4136901eb4362'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The repository runs an older toolchain than the architecture decided: pnpm 9.15.0, TypeScript 5.7, vitest 2, drizzle-orm 0.38, and an unpinned Postgres image. Story 1.1's final acceptance criterion is written against pnpm 12 and TypeScript 6, so it cannot be satisfied until these move, and every later story would be built on a stack that shifts underneath it.

**Approach:** Move the existing 43-file codebase to the decided versions and pin them, changing no application behaviour. This is slice A of story 1.1; the substrate work is slice B, so breakage from three major-version jumps surfaces on code that already exists rather than on top of five packages that do not exist yet.

## Boundaries & Constraints

**Always:**
- Decided versions, exact and caret-free where the architecture says exact: TypeScript `6.0.3`, vitest `5.0.1`, drizzle-orm `0.45.2`, drizzle-kit `0.31.10`, pg `8.23.0`, tsx `4.23.13`, pnpm `12.4.2`.
- `drizzle-orm` and `pg` are declared in three places — root, `apps/web`, `packages/db` — and all move together.
- TypeScript stays on `6.0.3` and does **not** go to 7.x: typescript-eslint 8.70.x caps `typescript < 6.1.0`.
- All three CI gates green at the end: both typechecks and 46 tests across 3 files.
- Behaviour unchanged. If a test's expected value has to move, stop — that is a regression, not an upgrade detail.

**Never:**
- No new workspace units, no `packages/app`, no `Clock` port, no ESLint rules, no pg-boss, no `pnpm dev` orchestration. That is slice B (`deferred-work.md`).
- **No Next.js major.** `apps/web` stays on the Next 15 line (`^15.1.3`, currently resolving 15.5.25). *Decided 2026-09-20: the stack wants 16.3.5, but Next 15→16 is a framework major whose breakage lands in the eight files story 2.2 rewires anyway. Recorded in `deferred-work.md`.* **React needs no decision — `^19.0.0` already resolves 19.3.0, which is the decided version.** If a bump moves `next` across majors, stop and report.
- No schema change, no migration, no data touched.
- No `--force`. No disabling a TypeScript check to make typecheck pass.

</frozen-after-approval>

## Code Map

- `package.json` — root deps and `packageManager`. Its `typecheck`/`test` scripts are what CI gates; do not change their meaning. `uuid@^11` is not in the decided stack: leave its range alone.
- `apps/web/package.json`, `packages/db/package.json` — each carries its own `drizzle-orm` and `pg`.
- `packages/domain/package.json` — no dependencies, and must stay that way.
- `apps/web/src/app/layout.tsx:2` — `import './globals.css'`, the tree's **only** side-effect import. TypeScript 6 defaults `noUncheckedSideEffectImports: true` and Next's types declare no `*.css` module, so this fails typecheck until an ambient declaration exists. This is the one TS 6 default flip that bites; the `types: []` flip does not, because `tsconfig.base.json` sets `types: ["node"]` and `apps/web/tsconfig.json` extends it.
- `pnpm-workspace.yaml` — workspace globs only today. pnpm 12 defaults `strictDepBuilds: true`, so an incomplete build allow-list makes install **fail**, not warn, and pnpm may rewrite this file with placeholders. The field is `allowBuilds` (`onlyBuiltDependencies` was removed in pnpm 11). Needed for at least esbuild (via tsx) and vitest's chain.
- `pnpm-lock.yaml` — lockfile format is 9.0 and pnpm 12 still writes 9.0, so this is a content refresh, not a format migration. A large diff is the upgrade.
- `vitest.config.ts` — `defineConfig`, `resolve.alias`, `test.include`, `environment`. vitest 5 moved `vite` from a dependency to a **non-optional peer** (`^6.4 || ^7 || ^8`) and `vite` is declared nowhere in this repo, so it must be added explicitly rather than relying on auto-install-peers.
- `packages/db/src/schema.ts`, `src/client.ts`, `drizzle.config.ts` — the drizzle API in use (`pgTable`, `text`, `bigint{mode}`, `timestamp{withTimezone}`, `index`, `uniqueIndex`, `jsonb`, `generatedAlwaysAsIdentity`, `drizzle(pool,{schema})`) is unchanged across 0.38→0.45, and the deprecated object-form table extras still compile. Expect **no source edits**.
- `infra/docker-compose.yml` — line 3 `postgres:18-alpine`; line 17 volume already at `/var/lib/postgresql`, which is the Postgres 18 trap — leave it.
- `.github/workflows/ci.yml` — pins `node-version: '24'` and its own comment assigns tightening it to story 1.1.

## Tasks & Acceptance

**Execution:**
- [x] `package.json` — set the decided exact versions; `packageManager: "pnpm@12.4.2"`; add `vite` (devDependency, `^8.3.0` — newest major vitest 5.0.1 accepts; the architecture's Stack table names no vite, so record this as chosen here); `@types/node` → `^24.13.6`; `@types/pg` → `^8.23.1`; leave `uuid` alone.
- [x] `apps/web/package.json`, `packages/db/package.json` — move `drizzle-orm` and `pg` in lockstep with root.
- [x] `apps/web/src/css.d.ts` — add `declare module '*.css';` so TypeScript 6's `noUncheckedSideEffectImports` accepts the stylesheet import. Prefer this over relaxing the flag.
- [x] `pnpm-workspace.yaml` — add `allowBuilds` listing the packages that legitimately run build scripts; expect to iterate until install stops failing.
- [x] `pnpm-lock.yaml` — regenerate with one local `pnpm install` under pnpm 12, then verify `--frozen-lockfile` from clean.
- [x] `infra/docker-compose.yml` — pin `postgres:18.6-alpine`, **not** `18.6`: the bare tag is Debian-based, and switching base over the existing `momo-pgdata` volume risks a collation-provider mismatch.
- [x] `.github/workflows/ci.yml` — tighten `node-version` to `24.21.0` (exists; newest v24) and drop the comment deferring it.
- [x] `vitest.config.ts` — reconcile with vitest 5 only if it fails; leave untouched otherwise.
- [x] Fix whatever the gates report, editing no test expectation.

**Acceptance Criteria:**
- Given a clean clone and no `node_modules`, when `pnpm install --frozen-lockfile` runs under pnpm 12.4.2, then it succeeds with no build-script approval failure and no `--force`.
- Given the upgraded tree, when `pnpm typecheck` and `pnpm --filter @momo/web typecheck` run, then both exit 0 — the second one proving the CSS ambient declaration works.
- Given the upgraded tree, when `pnpm test` runs, then 46 tests across 3 files pass.
- Given `git diff`, when test files and `packages/db/src/schema.ts` are inspected, then none of them changed.
- Given `git status` after install, when `pnpm-workspace.yaml` is inspected, then pnpm has not left placeholder entries in it.
- Given story 1.1's final criterion, when this slice closes, then its first half (install and typecheck succeed under pnpm 12 and TypeScript 6) is met and its second half (`apps/worker` and `packages/adapters` declaring `types`) is explicitly deferred to slice B.

## Implementation Notes

Executed 2026-09-20 from baseline `ab852c3`. Every version in the decided list landed
exactly as written, and the three source-level predictions in the Code Map all held:

- **Drizzle 0.38 → 0.45 needed no source edits.** `packages/db/src/schema.ts`,
  `src/client.ts` and `drizzle.config.ts` are byte-identical to baseline. The whole API in
  use compiled unchanged, including the deprecated object-form table extras.
- **The CSS ambient declaration is the one TS 6 default that bites, and it is
  load-bearing.** Parking `apps/web/src/css.d.ts` makes `apps/web` typecheck fail with
  `src/app/layout.tsx(2,8): error TS2882: Cannot find module or type declarations for
  side-effect import of './globals.css'`; restoring it returns exit 0. The `types: []`
  flip did not bite, as predicted.
- **pnpm 12 did write the placeholder.** The first install under 12.4.2 failed with
  `ERR_PNPM_IGNORED_BUILDS` and rewrote `pnpm-workspace.yaml` with
  `allowBuilds:\n  esbuild: <unresolved>`. The final file carries a real
  `esbuild: true`. esbuild was the *only* package needing an entry — three majors are
  present transitively (0.18.20, 0.25.12, 0.28.2) and the single key covers all of them.
  Next's `@next/swc-*` and `@img/sharp-libvips-*` are prebuilt and needed nothing.
- **Lockfile stayed at format 9.0**, a content refresh as predicted. `vite@8.3.0` is the
  resolved peer for vitest 5.0.1, whose declared range is `^6.4.0 || ^7.0.0 || ^8.0.0`.
- **No major moved that was not supposed to.** `next` resolves 15.5.25 and `react` /
  `react-dom` resolve 19.3.0 — the decided React version, with no manifest change needed.
  `drizzle-orm@0.45.2` and `pg@8.23.0` resolve to a single instance across all three
  declaring units (root, `apps/web`, `packages/db`).
- **`uuid` left alone** at `^11.0.3` (resolves 11.1.1), and `packages/domain` still
  declares no dependencies.
- **`vitest.config.ts` needed no reconciliation** and is untouched, as the spec allowed.

Beyond the gates, `pnpm exec tsx` was smoke-tested importing both `@momo/db` and
`@momo/domain` against a dead `DATABASE_URL`, proving the esbuild binary the `allowBuilds`
entry unlocks actually works and the module graph loads under drizzle 0.45.

## Spec Change Log

**2026-09-20 — `baseUrl` removed from all three tsconfigs (unplanned, no behaviour
change).** Not anticipated by the Code Map. TypeScript 6 makes `baseUrl` a hard error, not
a warning:

    tsconfig.json(34,5): error TS5101: Option 'baseUrl' is deprecated and will stop
    functioning in TypeScript 7.0. Specify compilerOption '"ignoreDeprecations": "6.0"'
    to silence this error.

Two ways out. `"ignoreDeprecations": "6.0"` silences it and defers the same error to TS 7;
deleting `baseUrl` performs the migration TS 6 is asking for. Deleting it was chosen —
silencing would also read as "disabling a TypeScript check to make typecheck pass", which
the boundaries forbid.

This is safe because nothing in the tree resolved through `baseUrl`. Every non-relative
specifier in `packages/`, `apps/`, `scripts/`, `vitest.config.ts` and `drizzle.config.ts`
was enumerated: each is either a real package (`next`, `react`, `pg`, `drizzle-orm`,
`node:*`, `vitest`) or an alias already covered by `paths` (`@momo/*`, `@/*`). Since
TS 4.1 `paths` resolves relative to the tsconfig's own directory when `baseUrl` is absent,
and every `paths` entry here is already written relative (`./packages/...`, `../../...`,
`./src/*`), so no mapping changed. Both typechecks are green afterwards, and the CSS
probe above confirms the `apps/web` gate is still non-vacuous rather than silently
resolving nothing.

Files: `tsconfig.base.json`, `tsconfig.json`, `apps/web/tsconfig.json`.

**2026-09-20 — two stale CI comments refreshed (comments only).** `.github/workflows/ci.yml`
carried a comment asserting pnpm "is 9.15.0 today" and another assigning the
`node-version` tightening to story 1.1. Both became false in this slice, so both were
corrected alongside the `node-version: '24.21.0'` change the spec asked for. No step,
condition or command changed.

## Review Triage Log

### Iteration 1 — 2026-09-20. Three findings, all accepted and fixed.

**1. `.github/workflows/ci.yml` — corepack comment was factually wrong. ACCEPTED.**
The refreshed comment claimed a pnpm bump is "one edit to package.json and none to this
file". Verified false: `pnpm-lock.yaml` carries a `packageManagerDependencies` importer
entry (`pnpm: specifier: 12.4.2`) plus 42 `@pnpm/exe.*@12.4.2` package entries — pnpm pins
itself in the lockfile, so moving `packageManager` alone makes `--frozen-lockfile` fail
before any gate runs. The comment now says `packageManager` and `pnpm-lock.yaml` must move
together. My own comment had introduced this error while fixing a different stale one.

**2. `apps/web/src/css.d.ts` — shorthand declaration was an implicit-any hole. ACCEPTED.**
`declare module '*.css';` (semicolon shorthand) types the module as `any`. Reproduced with
a probe: `import styles from './app/globals.css'; const n: number = styles;` compiled
completely clean. That defeats the precision the file's own comment argues for — the flag
was kept on, then quietly neutered for this specifier. Fixed by giving the declaration an
empty body, `declare module '*.css' {}`, and rewriting the comment to say why `{}` is not
the same as `;`. Verified both directions: the `layout.tsx` side-effect import still
typechecks at exit 0, and the value-import probe now fails with
`error TS2322: Type 'typeof import("*.css")' is not assignable to type 'number'`.
Also re-confirmed the file is still load-bearing (parking it restores TS2882).

**3. `package.json` — `vite` was the only caret in the slice. ACCEPTED.**
Every other version here is exact and caret-free, and `vite` is the one version with *no*
architecture backing (chosen in this spec, not the Stack table) — so the caret sat exactly
where the risk was highest, and contradicted the reproducibility argument this same change
makes for pinning `node-version: '24.21.0'`. Pinned to `8.3.0`; lockfile specifier moved
`^8.3.0` → `8.3.0` with the resolved version unchanged, and `--frozen-lockfile` from clean
still exits 0.

Gates re-run after the fixes (scoped to the edited files): `apps/web` typecheck PASS, root
typecheck PASS (covers `vitest.config.ts`), `pnpm test` 46/46 across 3 files PASS,
frozen install from clean exit 0, `vite` resolves 8.3.0.

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | gap | drizzle 0.38→0.45 + pg + Postgres pin, and nothing in the verification path executes a query | medium | Pre-verified by the layer, and it also hand-checked both demonstrations and found neither broken: drizzle-kit 0.31.10 still emits all four `CREATE INDEX` from `schema.ts`, and `peek-db.ts` reads figures through `repo.ts`. So the gap is real, the regression is not present. Absence of DB tests is pre-existing; CI's own header says to add `services: postgres` when the first test needs one. Its filed `patch` disposition is not trivial — it is a CI service plus a new integration test | defer |
| 2 | gap | `package.json` declares `db:reset` pointing at `packages/db/src/reset.ts`, which does not exist | low | Confirmed: `ls packages/db/src/reset.ts` → No such file. Pre-existing, untouched by this diff | defer |
| 3 | edge | Lockfile now carries `packageManagerDependencies` (pnpm pins itself), so the CI comment "a later bump is one edit to package.json and none to this file" is false | medium | Confirmed at `pnpm-lock.yaml:8` plus 42 `@pnpm/exe` entries. A follower bumping only `packageManager` gets a frozen-lockfile failure before any gate runs. The comment is mine, added in this diff | patch |
| 4 | edge / blind | Final AC names the deferred half as `apps/worker` and `packages/adapters` only; `epics.md:494` also names `packages/db`, which exists today and has no tsconfig | medium | Confirmed: epics.md:494 lists three packages; `packages/db/tsconfig.json` does not exist. No failure today — the root tsconfig's `include` covers `packages/**/*.ts` with `types: ["node"]` — but nothing records that `packages/db` still owes a per-package declaration, so slice B can close without it | defer |
| 5 | edge | No `engines`, `.nvmrc` or `.node-version`; Node is pinned only inside CI | medium | Confirmed: no such file or field. Local Node is 24.13.0 while CI now pins 24.21.0, so the drift the slice exists to close is still open locally. **Not a patch:** adding `engines.node: "24.21.0"` would break installs on this very machine, so it needs a decision (range vs exact vs `.nvmrc` only), not a one-line fix | defer |
| 6 | edge | `minimumReleaseAge` absent although the architecture "records it as kept" | false | Refuted: the spine mentions `minimumReleaseAge` nowhere. Its only pnpm 12 note (line 304) covers `packageManager` and `allowBuilds`. The premise is invented | rejected |
| 7 | edge / blind | Three exact pins of `drizzle-orm`/`pg` with nothing enforcing lockstep; pnpm 12 `catalogs:` would make it one edit | low | Real but speculative harm: a future partial bump could install two drizzle instances. `catalogs:` is a new mechanism, not a direct correction, so it adds surface | defer |
| 8 | edge | `css.d.ts` does not cover `.scss`, `.svg` or fonts | false | No such import exists in the tree — I grepped: `layout.tsx:2` is the only side-effect import. Declaring modules for imports nobody writes is guarding a state never demonstrated | rejected |
| 9 | edge / blind | `sprint-status.yaml` has one key for both slices, so story 1-1 can flip done while slice B is unstarted | medium | Confirmed: `1-1-one-command-brings-the-whole-system-up` is the only 1-1 key. Real bookkeeping hazard. Handled by not advancing the story past `in-progress` at step 5 and by the `deferred-work.md` entry, rather than by inventing a tracker key this skill does not own | defer |
| 10 | blind | Root `tsconfig.json` duplicates `tsconfig.base.json` instead of extending it | low | Confirmed: both carry the same options; that duplication is why `baseUrl` was deleted in three files. Pre-existing structure, not created here | defer |
| 11 | blind | `apps/web/tsconfig.json` redeclares `paths` and loses the base's `@momo/domain/*` and `@momo/db/*` wildcards | low | Confirmed by diffing the two `paths` maps. But pre-existing — this diff removed only `baseUrl` from that file — and no subpath import exists today | defer |
| 12 | blind | `vite` is the only new pin left on a caret, and the one version with no architecture backing | low | Confirmed and self-inconsistent with the same diff's reproducibility argument for `node-version: '24.21.0'`. Fix is a direct correction: drop the caret | patch |
| 13 | blind | `declare module '*.css';` is the implicit-any shorthand, so value imports type as `any` — defeating the flag the file claims to preserve | medium | Confirmed by probe: a temporary `import styles from './x.css'; const n: number = styles;` typechecked clean. `declare module '*.css' {}` keeps the side-effect import legal and makes value imports an error. Direct correction | patch |
| 14 | blind | vitest 2→5 with no coverage config, so the project's 80% floor is not measurable | medium | Confirmed: `vitest.config.ts` has no `coverage` block. Real against the project's testing rules, but adding a provider and thresholds is new capability, and it would fail immediately at current coverage | defer |
| 15 | blind | `drizzle-kit` pinned but never exercised; no script invokes it and the `out` directory does not exist | low | Partly refuted: the gap layer did run `drizzle-kit generate` by hand and it emitted all four indexes. No script gates it, which is the same hole as row 1 | defer |
| 16 | blind | Nothing runs drizzle 0.45 against the newly pinned Postgres 18.6 | medium | Same root cause as row 1 — grouped there | defer |
| 17 | blind | No Dependabot or Renovate config, so the next version drift is a discovery rather than an alert | low | Confirmed absent. Fair against this slice's own reason for existing, but it is new automation, not a correction, and touches release policy | defer |
| 18 | blind | `react`, `react-dom`, `next` remain caret ranges, so "already on the decided version" is a lockfile property | low | Confirmed. The frozen block's tripwire is deliberately worded at major granularity, and pinning them is exactly the Next work this slice excludes | defer |
| 19 | blind | `@types/pg` sits in `dependencies` rather than `devDependencies` | low | Confirmed, and pre-existing — the diff only bumped the version on that line | defer |
| 20 | blind | `allowBuilds: esbuild: true` is unbounded and its justification is an unchecked snapshot | low | Confirmed as written. `true` is the field's normal form; a version bound is not something pnpm's schema takes here, and `strictDepBuilds` re-raises any new build script as a hard failure, which is the control | rejected |
| 21 | blind | `apps/web` is typechecked but never built, and `@types/node` just crossed a major | medium | Confirmed: CI runs no `next build`; the lockfile shows `next@15.5.25(@types/node@24.13.6)`. Newly load-bearing because of this diff, but adding a production build to CI is new scope | defer |
| 22 | blind | Bookkeeping across spec, sprint-status and deferred-work is mutually inconsistent | false | The spec's `in-progress`/empty-triage-log state is this workflow's own mid-run state, which step 4 is in the middle of filling. The tracker concern is row 9; the `deferred-work.md` schema is fixed by the workflow | rejected |

## Design Notes

Drizzle 0.44 began wrapping driver errors in `DrizzleQueryError`. Nothing in this repo catches around `seed.ts`, `reset.ts` or `repo.ts` today, so no code changes — but it is the one behavioural difference in 0.38→0.45 and worth knowing if an error path is added later.

## Verification

**Commands:**
- `pnpm install --frozen-lockfile` — expected: succeeds
- `pnpm exec tsc --version` — expected: `Version 6.0.3`
- `pnpm typecheck` — expected: exit 0
- `pnpm --filter @momo/web typecheck` — expected: exit 0
- `pnpm test` — expected: `Test Files 3 passed (3)`, `Tests 46 passed (46)`
- `git diff --stat -- '*.test.ts' 'packages/db/src/schema.ts'` — expected: empty
- `docker compose -f infra/docker-compose.yml config | grep image` — expected: `postgres:18.6-alpine`
- `node -e "console.log(require('vite/package.json').version)"` — expected: an 8.x version
