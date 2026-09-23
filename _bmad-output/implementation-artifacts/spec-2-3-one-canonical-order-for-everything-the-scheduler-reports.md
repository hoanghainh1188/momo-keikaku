---
title: 'Story 2.3 — one canonical order for everything the scheduler reports'
type: 'feature'
created: '2026-09-23'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'ea10109e655d5a9402397fa81aea0e40033e5342'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The scheduler has no defined order (OQ-13). Its reported lists — critical path, driving chains, violations, a rejected cycle — would come back in whatever order the input arrived in, so a critical path compared years later could differ by machine. The only WBS comparator today, `compareNfkcNumeric`, compares digit segments through `Number` (precision is lost past 2^53) and has no `wp_id` fallback, so two WPs can compare equal.

**Approach:** Add `compareWp(a, b)` in `packages/domain/src/schedule/order.ts` exactly as AD-28 specifies it, as the single total order. Prove that it is total, antisymmetric, transitive and independent of input order.

**Decisions (founder, 2026-09-23):**
- **Q1 → A.** `canonicalWps(wps)` in `domain/schedule/order` returns `{ wps, indexOf }`. `wps` is a new array sorted by `compareWp`; the input is not mutated. `indexOf` is a `ReadonlyMap` from `id` to index. It is AD-26's `inputs.wps` ordering, and the one site AD-28's order is applied at. A duplicate `id` throws, naming the id. A reusable test helper `expectShuffleInvariant(fn, input, n)` asserts that `stringify(encode(fn(shuffle(input))))` is identical over `n` seeded shuffles; it is applied to `canonicalWps` now. AC 4 closes as "the ordering stage is shuffle-invariant". The engine-level proof is carried forward to 2.5 and 2.9 in `deferred-work.md`, which name the helper.
- **Q2 → A.** `review.ts`'s two sorts use `compareWp`, and `compareNfkcNumeric` is deleted. Its tests are ported to `order.test.ts` wherever they still hold under AD-28. `1` / `01` now tie at the segment rather than fall to code point order, so that old expectation is replaced. `compareNfkc` stays.

## Boundaries & Constraints

**Always:**
- The rule is AD-28's, to the letter:
  - NFKC both codes; a missing code becomes `''`;
  - split on `.`;
  - **amended by the founder, 2026-09-23 (decision T-A):** each segment is compared by natural order. Split it into maximal runs of ASCII digits and of non-digits. Compare the runs pairwise: two digit runs as `BigInt`, two non-digit runs through `compareNfkc` code-point order, and a digit run sorts before a non-digit run. If every shared run ties, the segment with fewer runs sorts first, so the empty segment sorts before everything. This replaces AD-28's literal step 2, which was found intransitive during implementation (`2` < `10` < `1a` < `2`). Codes made only of digits order exactly as before;
  - if every shared segment ties, the code with fewer segments sorts first (amended by the founder, 2026-09-23: "prefix" misread `1`/`01` ties);
  - then compare `wp_id.toLowerCase()` by code point, then the raw `wp_id` by code point, so ids differing only in case never compare 0 (amended by the founder, 2026-09-23).
  - Equal integers spelled differently (`1` / `01`) tie at that segment and continue.
- `compareWp` takes a minimal structural type `{ id: string; wbsCode: string | null | undefined }`, so a `WorkPackage` and any future engine row both satisfy it.
- `packages/domain` gains no dependency. `domain/schedule` must not import `domain/attribution`; that dependency-cruiser rule already exists.
- **A code orders; it never identifies.** Nothing added here keys, matches or dedupes on `wbsCode`.

**Never:**
- No recalculation engine, passes, Float, critical path or `schedule_run` writes. Those are stories 2.5–2.9.
- No schema or migration change, and no UI change.

## I/O & Edge-Case Matrix

| Scenario | Input | Expected |
|---|---|---|
| Numeric segments | `1.2` vs `1.10` | `1.2` first |
| Beyond 2^53 | `1.9007199254740993` vs `1.9007199254740992` | `…992` first (a `Number` comparison would tie) |
| Full-width | `１.２` vs `1.10` | Folds to `1.2`, so it sorts first |
| Mixed segment | `1.a` vs `1.2` | `1.2` first, because a digit run sorts before a non-digit run; the same answer in either argument order |
| Natural order | `3`, `3a`, `3b`, `4`, `10` in any order | Sorted as `3`, `3a`, `3b`, `4`, `10` |
| Former cycle | `2`, `10`, `1a` | `1a`, `2`, `10`, whatever the input order (transitive) |
| Prefix | `1.2` vs `1.2.1` | `1.2` first |
| Equal codes | same code, ids `B…`/`a…` | Decided by the lowercased id; never 0 |
| Absent codes | both `null` | Decided by id; never 0. One absent (`''`) sorts before any non-empty code |
| Leading zeros | `1.01` vs `1.1` | The integers tie, so the id decides |
| Same WP | `a` vs `a` | 0 |

</frozen-after-approval>

## Code Map

- `packages/domain/src/text/compareNfkc.ts` -- `compareNfkc` (l.21) is the code-point comparator to reuse. `compareNfkcNumeric` (l.26–53) uses `Number()`, which is not arbitrary-precision.
- `packages/domain/src/text/compareNfkc.test.ts` -- existing property tests (antisymmetry, sort stability, `あ`/`ア`) are the pattern to follow.
- `packages/domain/src/types.ts:69-89` -- `WorkPackage`: `id`, `wbsCode: string`.
- `packages/domain/src/present/codec.ts` -- `encode` (l.39) is the canonicaliser: it sorts keys, does not reorder arrays, and writes bigint as a string. `stringify` is at l.97.
- `packages/domain/src/index.ts` -- the barrel that should export `compareWp`.
- `packages/domain/src/schedule/` -- does not exist yet; create it. `.dependency-cruiser.cjs:184-189` already fences it from `domain/attribution`.
- `packages/domain/src/review.ts:2,386,422` -- the only product callers of `compareNfkcNumeric`. Both move to `compareWp` (Q2-A). Milestone rows carry `wpId`; check that Divergence rows carry `wpId` too (they do, l.405).
- `packages/db/src/repo.ts:88` -- `ORDER BY wbs_code` for fetch order only. Leave it: the domain re-sorts.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/schedule/order.ts` -- `compareWp`, with AD-28 cited in the header
- [x] `packages/domain/src/schedule/order.test.ts` -- every I/O matrix row, plus property tests over generated codes (numeric, full-width, mixed, prefixes, duplicates, absent): never 0 for distinct ids, antisymmetric, transitive over triples, and sorting any shuffle yields one order
- [x] `packages/domain/src/index.ts` -- export from `schedule/order`
- [x] `packages/domain/src/schedule/order.ts` -- `canonicalWps` (Q1-A), in the same file as `compareWp`
- [x] `packages/domain/src/schedule/shuffle-invariant.test-helper.ts` (landed as `tests/support/shuffle-invariant.ts`, see Implementation Notes) -- `expectShuffleInvariant(fn, input, n = 50)` with a seeded PRNG (tests may not read the wall clock, and `Math.random` makes a failure unreproducible). Check how the repo names non-test test-support files and follow that convention
- [x] `packages/domain/src/schedule/order.test.ts` -- `canonicalWps`: the index map agrees with the array, the input is not mutated, a duplicate id throws, and it is shuffle-invariant through the helper
- [x] `packages/domain/src/review.ts` -- both sorts use `compareWp` on the row (`{ id: wpId, wbsCode }`); drop the `compareNfkcNumeric` import
- [x] `packages/domain/src/text/compareNfkc.ts` / `.test.ts` -- delete `compareNfkcNumeric` and its tests; port the ones that still hold to `order.test.ts`
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- one entry: point `expectShuffleInvariant` at `recalculate` in 2.5, and at the stored run in 2.9, to close AC 4 at engine level

**Acceptance Criteria:**
- Given two distinct WPs in either argument order, when `compareWp` runs, then it never returns 0 and the two signs are opposite.
- Given the Review page's milestone and Divergence rows, when `computeReview` runs, then they are in `compareWp` order and the existing review tests still pass.
- Given any shuffle of a WP list, when it is passed through `canonicalWps`, then its codec-canonical form (`stringify(encode(…))`) is identical across N ≥ 50 shuffles.
- Given the repository, when lint, the three typechecks, depcruise and `pnpm test` run, then all pass.

## Implementation Notes

- **Helper location.** The repo's convention for non-test test-support code is `tests/support/<name>.ts` (`fake-oidc.ts`, `reset-mail-renderer.ts`); nothing is named `*.test-helper.ts`. The helper therefore lives at `tests/support/shuffle-invariant.ts`, where 2.5 (domain) and 2.9 (app/db suites) can both import it. `.dependency-cruiser.cjs`'s `no-test-or-tooling-in-source` already carves out `*.test.ts` importers, and forbids product source from reaching it. It also exports `seededShuffle` and `seededUint32` (mulberry32 returned as a uint32, so domain tests need no `Math.floor` under AD-4's rounding fence).
- **Raw-id last step (originally beyond AD-28's letter; AD-28 step 4 now includes it after the planning-doc amendment).** After the lowercased-id comparison, `compareWp` falls back to the raw id by code point. It is reached only by two ids that differ in case alone (never two canonical UUIDs) and changes no answer AD-28 defines; without it `A`/`a` would compare 0 and AC 1 ("never returns 0 for two distinct WPs") would be false.
- **The id is compared by true code point**, not UTF-16 code unit (they differ above U+FFFF). `compareNfkc`'s own `<` is UTF-16 order; it was left untouched.
- **Milestone rows** do not carry `wpId` (the Code Map's claim was wrong); `milestoneRows` sorts with the Baseline row's `wpId` in hand and then drops it, so `MilestoneRow`'s shape is unchanged.
- **RESOLVED by decision T-A (natural order).** AD-28's literal step 2 was intransitive when a segment mixes digits and letters (`2` < `10` < `1a` < `2`). `compareSegment` now splits each NFKC'd segment into maximal ASCII-digit and non-digit runs (digit runs as `BigInt`, non-digit runs via `compareNfkc`, digit before non-digit, fewer runs first, so the empty segment is first). The `it.fails` became a passing test (`1a, 2, 10` in all six input orders), the `3, 3a, 3b, 4, 10` row is tested over 50 shuffles, and the generated codes now include `3a`, `a3`, `1a2`, `01a`, full-width `３ａ`/`１ａ２`/`ａ３`, kana-digit mixes and empty segments. With the old literal rule swapped back in, six tests fail (transitivity over triples, one order across shuffles, `canonicalWps` shuffle invariance and the three new rows), so the widened tests do catch the defect.

**Planning-doc amendment, adversarial review round 1 (2026-09-23).** The reviewer found the new rule total and transitive: a script copying `order.ts` ran 200,000 random triples over 400 generated codes with 0 violations. The ten findings were about precision and consistency, and are resolved as follows:
- **(1)** `compareNfkc` compared UTF-16 code units. It is fixed in code to use true code points (review patch #2), so the documents' "code point" is now accurate.
- **(2)** The ASCII-only `[0-9]` digit class is now stated everywhere.
- **(3, 4)** "Shorter code" and "fewer segments" are restated as tie-breaks that apply only after the shared segments or runs tie.
- **(5)** The empty segment and the absent code are defined in the epics AC and epic-2-context. They reached AR-55 only in round 2.
- **(6)** AD-28 step 4 and AR-55 now carry the raw-id last step.
- **(7)** AD-28 step 1 now says normalise first, then split, with the `１．２`, `⒈`, `1²` and `。` cases.
- **(8)** The no-change claim is narrowed, with the `1.10`/`1.1a` and `a10`/`a9` flips named.
- **(9)** The spine's i18n convention now names WBS codes as `compareWp`'s exception. PRD NFR-I1 is left as written: it states the text-sorting rule, which still holds.
- **(10)** The historical review files are left unedited, as records.

**Planning-doc amendment, adversarial review round 2 (2026-09-23).** The reviewer found no defect in the code or the rule. Its tsx probes against the real `compareWp`: 200,000 random triples with 0 violations; 20,000 pairs made only of digits and dots with the same order under the old and new rules; and both round-1 flip examples verified. Wording fixes:
- **(1)** The no-change claim is corrected to "made only of ASCII digits and dots", with the `2-` vs `10` flip added.
- **(2)** "Codes are equal" becomes "codes compare equal", in AD-28 and the epics AC.
- **(3)** AR-55 now defines the absent code and the empty segment, and says runs are maximal.
- **(4)** The order.ts header and comment and this note are brought up to date.
- **(7)** epic-2-context states the segment rule as a tie-break, not a count.
- **(8)** Unicode default lowercasing and code-point comparison of ids are stated.
- **(5, 6)** These concern the frozen block: it lacked the raw-id step, and "prefix" should read "every shared run/segment ties". The founder approved both amendments on 2026-09-23, and the frozen block is updated.

## Spec Change Log

- **2026-09-23, intent gap found in implementation.** AD-28's literal step 2 is intransitive for segments that mix digits and letters: `2` < `10` by integer, `10` < `1a` by code point, `1a` < `2` by code point. The founder chose natural order (T-A over "numeric-before-text" T-B), and the frozen block is amended. KEEP: `canonicalWps`, the id-exact fallback after the lowercase id, `tests/support/shuffle-invariant.ts`, the review.ts rewiring and the deletion of `compareNfkcNumeric`. Only the segment comparison and its tests change: the `it.fails` cycle test becomes a passing test, and the generated-code property tests widen to include mixed segments. Known-bad state avoided: shipping an order that depends on input order for codes like `3a`. Follow-on: amend AD-28 step 2 in ARCHITECTURE-SPINE.md and story 2.3's first AC in epics.md to match, then run an adversarial review of those amendments.

## Review Triage Log

Review pass 1 (2026-09-23). Blind Hunter (BH), Edge Case Hunter (EC) and Verification Gap (VG) were all run. The planning-doc amendment (AD-28, AR-55, epics AC and epic-2-context) is reviewed separately by an adversarial pass.

| # | Source | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | VG, BH | No test checks that `computeReview` returns its milestone and Divergence rows in `compareWp` order. Deleting a sort or swapping its arguments would keep the suite green | medium | Pre-verified. Every fixture that reaches these lists has at most one row whose position is observed (`review.test.ts:165,198`, `demo-golden.test.ts:178`) | patch |
| 2 | BH, EC | `compareNfkc` claims code-point order but compares UTF-16 code units (`<`), while `order.ts` defines its own true code-point `compareCodePoints` under the same name | low | `text/compareNfkc.ts:11` uses `a < b`, so U+2000B sorts after U+FA0E. The order stays total and deterministic, but the documented rule is wrong for astral characters and two helpers share one name with different meanings. A direct correction | patch |
| 3 | BH | The F24 test ported to `order.test.ts` derives its expected sign from `compareNfkc` on the last segment, which is a weak oracle | low | Correct only because every pair differs in a digit-free last segment. A direct correction to explicit expectations | patch |
| 4 | BH | The behaviour for NFKC-produced separators (`．`, `⒈`) and non-ASCII digits (`١`) is unpinned | low | Defined by the rule (ASCII digits only, with NFKC before the split) but untested. The fix is pinning tests, not guards | patch |
| 5 | BH | `compareWp` re-normalises on every comparison, so a sort does O(n log n) parsing | low | 500 WPs means about 4.5k comparisons, well inside NFR-P1. The fix restructures `canonicalWps` | reject |
| 6 | BH | `BigInt` over an unbounded digit run | low | Parsing a digit run of thousands of digits is cheap. No reachable harm | reject |
| 7 | BH | For equivalent codes (`1.02`/`1.2`), Review row order now depends on the WP id | false | This is decision Q2-A as designed. The test gap is #1 | reject |
| 8 | BH | `MilestoneRow` lacks `wpId`, so the sort needs a wrapper | low | Cosmetic. Adding the field widens a public row type | reject |
| 9 | BH | Nothing enforces "`compareWp` is the only ordering site" | low | No second comparator exists after this diff. A source-discipline gate would be new surface | reject |
| 10 | BH | `canonicalWps` checks duplicates case-sensitively, while the order is case-insensitive first | low | Ids are canonical lowercase UUIDs, and the exact-id fallback keeps the order total | reject |
| 11 | BH | The domain test imports the repo-root `tests/support` helper | low | This follows the repository's existing `tests/support` convention and resolves through the root vitest config | reject |
| 12 | BH | The `canonicalWps` shuffle test is redundant | false | Required by decision Q1-A as the reusable AC 4 harness | reject |
| 13 | EC | Two `baseline.wps` entries with the same `wpId` would compare 0 | false | `baseline_wp_version_wp_key` is UNIQUE on (tenant, version, wp) (`schema.ts:665`). Unreachable | reject |
| 14 | EC | Leading or trailing whitespace in a code is not trimmed | low | The behaviour is defined and deterministic; trimming would change the rule. Unlikely in imported codes | reject |

## Verification

**Commands:**
- `pnpm exec vitest run packages/domain` -- expected: all pass, including `schedule/order.test.ts`
- `pnpm lint && pnpm typecheck && pnpm depcruise` -- expected: exit 0
