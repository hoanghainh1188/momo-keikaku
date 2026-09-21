---
title: 'Story 1.2 slice 5 — exact arithmetic (bigint milli-hours, integer JPY, unreduced ratios) and the one jsonb codec'
type: 'refactor'
created: '2026-09-21'
status: 'done'
baseline_commit: '3c527481d11d05dae91b90fe428729fdb760bbb3'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** AD-4 says numbers are exact integers until presentation, and story 1.2's last AC asks
for it, but the domain carries effort and money as JS `number` (`units.ts` records the deviation),
every ratio (SPI, CPI, TCPI, shares, % complete) is a float from division, thresholds compare
floats in several places, and rounding happens in five domain modules and three web pages. Every
later epic (ledger, snapshots, Review) would be written against the wrong representation.

**Approach:** Make `Mh` and `Jpy` `bigint` and every ratio a `Ratio = { num: bigint, den: bigint }`
carried unreduced, compare ratios only through one `compareRatio` in `domain/health`, move every
rounding into `domain/present`, and add the one codec (`domain/present/codec`) that every `jsonb`
read and write goes through — with lint fences so the discipline holds after this slice.

## Boundaries & Constraints

**Always:**
- **What anyone sees does not move.** The six routes render HTML identical to the baseline commit
  (golden 2936.0 / 1661.5 / 0.91 included); the demo data has no half-even tie where the change
  of rounding would show (measured: the Review's money uses 4000 JPY/h, always integral).
- `Mh`, `Jpy` are `bigint` from the database row to `present`; `Ratio` is never reduced except by
  an explicit `reduce()`; `compareRatio(ratio, { num, den })` is the only place a ratio meets a
  threshold, by cross-multiplication. Thresholds become `Ratio` constants.
- Rounding only in `domain/present` (ratios 2 dp, hours 1 dp, yen integer), from the exact value,
  half-even. Two sanctioned integer steps outside it, each one helper: a derived milli-hour
  quotient (PV, EV, EAC) via `divRoundHalfEven`, and whole working days via `ceilDiv` (AD-27).
- `JSON.stringify` never meets a `bigint`: the codec renders `bigint` as a decimal string and
  `Ratio` as `{ num: string, den: string }`, round-trips exactly, and `audit_log.payload` is written
  and read through it.
- The cross-tenant harness keeps discharging NFR-S1: its numeric census and symmetry see `bigint`
  values rather than silently dropping them.

**Never:**
- No column type change and no migration: the `*_mh` columns are already Postgres `bigint` (only
  Drizzle's mode changes); the yen columns stay `integer` and are read into `bigint`.
- No largest-remainder spreads (Epic 6's), no new metric, no change to what is computed — only its
  representation. Counts, dates and minutes stay `number`.
- No change to the `apps/web → packages/domain` edge decision (open): pages keep using `present`.
- No change to tenancy, the write/read use cases' contracts, or the dependency-cruiser rules.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | On failure |
|---|---|---|---|
| Golden Review | demo `prj-ec2` | BAC `2936.0`, AC `1661.5`, SPI `0.91`, every route's HTML identical to baseline | name the route and the first differing text |
| Threshold at the boundary | SPI exactly 95/100 vs green ≥ 0.95 | green (exact comparison), where a float could land either side | — |
| Money half-even | 1 500 mh × 3 JPY/h (= 4.5) and 2 500 mh × 3 (= 7.5) | 4 and 8 | — |
| Ratio with zero denominator | CPI with AC = 0 | `Metric` unavailable, never a division | — |
| Codec round-trip | `{ a: 2n**63n - 1n, r: { num: 3n, den: 9n } }` | encodes to strings, decodes equal, `r` still 3/9 | — |
| Codec refuses the unencodable | a float, `NaN`, `undefined` field | throws naming the path | — |
| Rounding outside `present` | `Math.round`/`toFixed` in `packages/domain` outside `present/`, `JSON.stringify` in non-test source outside the codec | `pnpm lint` fails naming the file | — |

</frozen-after-approval>

## Code Map

- `packages/domain/src/units.ts` — `Mh`/`Jpy = number` (:9-10, deviation note :5), `hoursToMh`
  (`Math.round`), `roundHalfEven` on floats, `costOf` (half-even, correct shape), `Metric.value:
  number` (:38). Becomes the home of `Mh`/`Jpy` bigint, `Ratio`, `reduce`, `divRoundHalfEven`, `ceilDiv`.
- `packages/domain/src/evm.ts` — PV `Math.round` :76, % complete float + clamp 0.99 :96-104, EV
  :135, SPI/CPI/TCPI float :155/:157/:179, EAC `Math.round(bac/cpi)` :167, `cpi > 0` :166.
- `forecast.ts:29,33` — `spi <= 0`, `Math.ceil(durationWd / spi)` → `ceilDiv` over the Ratio.
- `review.ts` — shares :184/:188/:281/:298; money `Math.round(mh*rate/1000)` :228 → `costOf`.
- `health.ts` — `ratioColour` :29 (SPI :46, CPI :65), TCPI :68, unplanned share :100, `ruleText`
  :133-135 repeating them, `toFixed` :101/:131 → all through `compareRatio` and `present`.
- `attribution.ts` (`rateFor` :67, `costOf` :101/:164/:167), `ledger.ts:93-96`, `client-view.ts:37`,
  `types.ts` (rates :107/:117, thresholds :120-133) — types follow.
- `present.ts:8-32` — `ratio`/`hours`/`hoursSigned`/`yen`/`share`/`present` use floats; becomes
  `present/index.ts` + `present/codec.ts`. Web callers: `components/ui.tsx`, `scope-ledger-bar.tsx`,
  `gantt.tsx:79`, pages `review` (:88 `Number(spi.text) < 1`, :162, :322, :362, :369), `plan`,
  `mapping`, `baselines`, `connectors`, `c/[projectId]` (:160).
- `packages/db/src/schema.ts` — `bigint({mode:'number'})` at :98/:124/:158/:159/:178 → `'bigint'`;
  yen `integer` :55/:81 unchanged. `repo.ts` `Number()` at ~12 sites; `repo-writes.ts:104`,
  `seed.ts:233`/`:385` (payload); `fixtures.ts:74/:87` parse integer-mh JSON.
- `packages/app/src/ports/project-read.ts` restates `ProjectBundle`/`ReviewResult` shapes — follows.
- Tests pinning arithmetic: `demo-golden.test.ts` (37 matchers), `db-round-trip.test.ts:141-151`
  (`typeof === 'number'`), `evm.test.ts` (`toBeCloseTo` :73/:80/:87/:170-173), `attribution.test.ts`,
  `tests/cross-tenant.test.ts` (`numberCensus` :339-346, `sortBySerialisation` :356
  `JSON.stringify`, `canonicalise` :372, golden :656-688).
- `eslint.config.js` — no arithmetic fence today; no type-aware linting by design (so the fence is
  syntactic: banned calls by location, not "stringify of a bigint").
- Only client components with numeric props: `shell.tsx` (`snapshotAgeMinutes`),
  `disposition-rail.tsx` (`ticketCount`) — both counts/minutes, unaffected.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/units.ts` -- bigint `Mh`/`Jpy`, `Ratio`, `ratio(num, den)`, `reduce`,
      `divRoundHalfEven`, `ceilDiv`, bigint `costOf`; `Metric` values typed per unit.
- [x] `packages/domain/src/{evm,forecast,review,health,attribution,ledger,client-view,types,mapping}.ts`
      -- representation only: bigint quantities, `Ratio`s, `compareRatio` (in `health.ts`) as the one
      comparison site, thresholds as `Ratio` constants, no rounding.
- [x] `packages/domain/src/present/index.ts` + `present/codec.ts` -- presentation from exact values
      (half-even); the codec (`encode`/`decode`, canonical form, refusals); unit tests for both.
- [x] `packages/db/src/{schema,repo,repo-writes,seed,fixtures}.ts` -- `mode:'bigint'`, bigint reads
      of yen columns, `audit_log.payload` through the codec.
- [x] `packages/app/src/ports/project-read.ts` -- types follow.
- [x] `apps/web/src/**` -- inline rounding and comparisons replaced by `present` helpers.
- [x] Tests -- rewrite float/number assertions to exact bigint/Ratio values keeping every golden
      figure; `tests/cross-tenant.test.ts` census/symmetry/serialisation through the codec; matrix
      rows covered.
- [x] `eslint.config.js` -- ban `Math.round|floor|ceil|trunc` and `.toFixed` in `packages/domain`
      outside `present/`, and `JSON.stringify` in non-test source outside `present/codec.ts`.
- [x] `units.ts` deviation note, `README-DEMO.md`, `deferred-work.md` -- remove the deviation; record
      anything found and not fixed.

**Acceptance Criteria:**
- Given the six routes on `next dev`, when their HTML is compared with the baseline commit's, then
  it is identical.
- Given `packages/domain`, when searched, then no `number`-typed effort, money or ratio remains, and
  `compareRatio` is the only site comparing a ratio to a threshold.
- Given each lint fence, when a banned call is added in a fenced location, then `pnpm lint` fails —
  watched to fail.
- Given the suite, when lint, the three typechecks, depcruise and tests run, then all pass and the
  harness still discharges NFR-S1.

## Implementation Notes

- **Where half-even could have moved a figure, it did not.** PV/EV/EAC switched from `Math.round`
  (half-up on a float) to `divRoundHalfEven` on the exact quotient; hours, shares and whole
  percentages from `toFixed` to exact half-even; the Review's PV/EV money from `Math.round` to
  `costOf`. The six routes diff identical to the baseline and every golden figure holds.
- **`isBehindPlan` (health.ts) compares the exact SPI to 1.** The page used to compare the
  2 dp *text* (`Number(spi.text) < 1`), so an SPI in [0.995, 1) read "on or ahead of plan"; it
  now reads "behind plan". Not visible in the demo (SPI 0.91).
- **Floats survive only as layout geometry**: `present.geometryFraction`/`cssPercent`/
  `earnedProgress` feed the scope-ledger bar width and the Gantt fill, reproducing the old
  float bit for bit (`Number(num) / Number(den)` is the same division the float code did).
  `GanttRow` now takes a presented `earned: { fraction, label }` so `gantt.tsx` gains no
  domain import.
- `hoursToMh` accepts an exact decimal (number or string, ≤ 3 fraction digits) and refuses
  anything needing rounding. `units.ts` has `ZERO`/`ONE`, `sum`, `minBigint`/`maxBigint`,
  `compareBigint` (sort comparators need a `number`), typed metrics (`MhMetric`,
  `RatioMetric`, ...). `present`'s old `ratio` formatter is `ratioText`, freeing `ratio(num, den)`.
- The codec's `decode` is schema-driven (zod; `bigintJson`, `ratioJson`) because a decimal
  string alone cannot say it was a bigint; `packages/domain` now declares `zod`. `stringify`
  replaced the two error-message `JSON.stringify`s in `with-tenant.ts` and `probe-tenants.ts`.
  Fixture JSON is converted to bigint in `fixtures.ts` (`mhFromJson`, which refuses a fraction).
- Lint fences: `momo/fence-domain-arithmetic` (packages/domain minus `present/`, tests exempt)
  and the `JSON.stringify` ban in every application-source group except `momo/fence-codec`;
  `scripts/` and `*.test.*` are outside the stringify fence.
- Sabotage, each watched to fail then restored: float threshold in `ratioColour` (evm.test's
  hair-below-0.95 case), `Math.round` in `evm.ts` and `.toFixed` in `health.ts` (lint),
  `JSON.stringify` in `repo-writes.ts` (lint), the codec returning `Number(bigint)` (codec
  tests), the census skipping `bigint` (cross-tenant golden case, which now asserts the census
  carries BAC and AC).

## Spec Change Log

- **Review round 1 fixes (2026-09-21).** The frozen intent is unchanged; the implementation was corrected. The client projection's `schedule[]` now carries presented `progress` (`earnedProgress`: whole-percent label plus geometry fraction) in place of the exact `pctComplete` Ratio, so no milli-hour magnitude reaches it, and `demo-golden.test.ts` asserts no `bigint`/`Ratio` is in it. `hoursSigned` takes its `+` from the rounded tenths. `isBehindPlan` got tests. The golden test pins the coverage and scope-ledger shares as the baseline commit rendered them. `evmWith` keeps EV ÷ PV equal to the SPI passed. The `with-tenant.ts`/`probe-tenants.ts` diagnostics quote non-strings without the codec. `integerFromJson` (fixtures, both effort and yen) and `hoursToMh` refuse unsafe integers. The rounding fence now also covers `packages/domain` tests outside `present/`. New `tests/lint-fences.test.ts` drives the real ESLint config through `lintText` and pins both AD-4 fences by path. `README-DEMO.md` documents the int4 yen columns read into `bigint`.

## Review Triage Log

Round 1, 2026-09-21 — blind-hunter (B), edge-case-hunter (E), verification-gap (V).

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| B1 | `FORMULA_VERSION` not bumped though PV/EV/EAC ties now round half-even | low | The tag is rendered on the Review (`review/page.tsx:53`), so bumping breaks the approved identical-HTML rule; no Published Snapshot exists yet to be mis-tagged | reject |
| B2 / V-o2 | Visible tie rounding changed (hours, shares, yen half-up → half-even) | low | Intended by AD-4 and the approved intent; no demo figure moves | reject |
| B3 | `hoursSigned(40n)` renders `+0.0`, `hoursSigned(-40n)` `0.0` | low | Sign taken from the exact value; direct fix | patch |
| B4 | Rounding fence does not cover `apps/**` | medium | Pages had inline rounding before this slice; the intent scopes the fence to `packages/domain` | defer |
| B5 | Nothing enforces `compareRatio` as the only comparison site or `geometryFraction` as the only float | medium | No lint selector or test; convention only | defer |
| B6 / V4 | Both lint fences watched to fail by hand only; a glob typo kills them silently | medium | Pre-verified (V4): no test runs ESLint on the arithmetic or stringify rules | patch |
| B7 | Identical-HTML claim has no re-runnable artifact | low | The same manual method as slices 3–4, recorded in Results; no harness for `apps/web` yet | reject |
| B8 / E6 | `withTenant`/`probe-tenants` diagnostics now throw `CodecError` on `undefined` input | low | `stringify` refuses `undefined`; direct fix | patch |
| B9 / E8 | `mhFromJson` and `hoursToMh` accept numbers above 2^53, already rounded | low | `BigInt(n)` after `JSON.parse`; direct check | patch |
| B10 | README row for the int4 yen columns removed without replacement | low | `Jpy` is bigint, columns stay `integer` | patch |
| B11 | `compareRatio` belongs in `units.ts`, not `health.ts` | false | AD-4 names `domain/health` as its home, and the approved intent repeats it | reject |
| B12 | The codec does not belong in `present/` | false | AD-4 names `domain/present/codec` | reject |
| B13 | `evmWith(spi, cpi)` fixes `evMh` regardless of SPI, so fixtures are inconsistent | low | Test helper only; direct fix | patch |
| B14 | SV note says "Ahead of plan" at SV = 0 while SPI note says "on or ahead" | low | Pre-existing wording (`svMh < 0`), unchanged semantics | reject |
| E1 | Client projection's `pctComplete` is now an unreduced `Ratio` carrying milli-hour magnitudes | medium | `client-view.ts:38,93`; the page is server-rendered so no HTML leak today, but the projection is the client-safe object | patch |
| E2 | Census tie between `0` and `0n` could order differently per Tenant | false | `sort` is stable and both probes are traversed in the same structural order | reject |
| E3 | Sparse array holes encode as `null` | low | Unlikely in stored values; fix adds a guard | reject |
| E4 | An own `__proto__` key is dropped by `encode` | low | Unlikely in stored values | reject |
| E5 | A cyclic graph overflows the stack without a path | low | Unlikely; fix adds tracking | reject |
| E7 | `thresholdText` on a literal zero-denominator Ratio throws bare | low | Thresholds are fixed constants | reject |
| E9 | Rounding fence skips `packages/domain` test files, against the matrix row | low | `momo/fence-tests` replaces the rule later in the config | patch |
| V1 | `isBehindPlan` changed meaning and has no test | medium | Pre-verified; no test references it | patch |
| V2 | Coverage shares and scope-ledger shares have no golden assertion | medium | Pre-verified; only `mh` sums and counts are pinned | patch |
| V3 | Page-level derivations (PV/EV yen, component share, % complete, Gantt progress) covered only by the manual HTML diff | medium | Pre-verified; no web test harness | defer |
| V-o1 | "Behind plan" now uses the exact SPI: 0.995–1 shows `1.00` with "behind plan" | low | AD-4: comparisons use the exact value, never the rounded one — intended | reject |

## Design Notes

**Two integer steps outside `present`, and why they are not "rounding for display".** PV, EV and
EAC are stored-shape quantities in milli-hours that later stories sum and snapshot; they must be
integers, and today they are `Math.round`ed where computed. Routing both through one
`divRoundHalfEven` keeps AD-4's "no module divides and rounds independently" true in spirit until
Epic 6 replaces PV/EV with largest-remainder spreads. Remaining duration is whole working days by
AD-27's own rule (`ceil` over the Ratio form).

**Why the lint fence is by location.** The lint config deliberately runs without type information,
so "`JSON.stringify` on a `bigint`" cannot be expressed; banning the call outside the codec in
non-test source is the syntactic equivalent, and TypeScript already refuses `Math.round(bigint)`.

## Verification

**Setup:** `pnpm db:up`; export `DATABASE_URL`, `APP_DATABASE_URL`, `REQUIRE_DB=1`.

**Commands:**
- `pnpm lint`, `pnpm typecheck`, `pnpm --filter @momo/web typecheck`,
  `pnpm --filter @momo/worker typecheck`, `pnpm depcruise` -- exit 0.
- `pnpm test` -- all pass; golden figures unchanged.
- `grep -rn "Math.round\|toFixed\|Math.ceil\|Math.floor" packages/domain/src --include=*.ts | grep -v present/ | grep -v .test.ts` -- no hits.
- Six routes on `next dev` as `momo_app`, HTML diffed against a baseline-commit worktree after
  stripping script/link tags and per-build action ids -- identical.

**Sabotage (each watched to fail, then restored):** a float threshold compared inline in
`health.ts`; `Math.round` added to `evm.ts`; `JSON.stringify` of a payload in `repo-writes.ts`; the
codec dropping a bigint to `number`; the harness census ignoring `bigint`.

## Verification Results

- 2026-09-21, after review round 1: six routes re-captured (fresh `.next`, re-seeded, `next dev` as `momo_app`, scripts/link tags and action ids stripped) and diffed against the baseline-commit capture — review, plan, mapping, baselines, connectors and `c/prj-ec2` all identical; dev server stopped, `tenant` holds `ten-momo` only.
