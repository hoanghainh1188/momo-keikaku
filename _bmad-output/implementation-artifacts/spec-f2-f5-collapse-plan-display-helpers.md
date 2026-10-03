---
title: 'Epic 2 retro F2/F5 — collapse Plan display helpers into one shared module'
type: 'refactor'
created: '2026-10-03'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'ee3d370d7aecac90d96c5a4d94ac585233af75a4'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-retro-2026-09-27.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-13-the-plan-tree-grid-and-its-schedule-preset.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `formatPlanDate`, `formatMinFloat`, `inkTone`, `formatFloatDisplay`, and `SUMMARY_NA_LABEL` are copied in `packages/app/.../plan-grid.ts`, `apps/web/.../plan-grid-format.ts`, and `apps/web/.../plan-strip-what-moved.ts`, so EN Plan display can drift between app and web (Epic 2 retro F2/F5).

**Approach:** Move those pure display helpers into one shared `@momo/domain/present` module (AD-1 client-safe edge). Reuse from app and web; delete the web copies. Close sprint action item `epic-2-retro-item-10-collapse-plan-display-helpers-into-one-s`.

## Boundaries & Constraints

**Always:**
- Shared home is `@momo/domain/present` (new `plan-display.ts` re-exported from `present/index.ts`) — the only domain surface web may import.
- Move exactly: `SUMMARY_NA_LABEL`, `formatPlanDate`, `formatPlanDateShort`, `formatPlanDateLong`, `formatMinFloat`, `inkTone`, `formatFloatDisplay` (byte-identical EN behaviour; Short/Long travel with the date MONTHS tables).
- `packages/app` imports from `@momo/domain/present` and may re-export the same symbols from `plan-grid.ts` / the app barrel so existing server/test imports keep working.
- Web client components import the shared helpers from `@momo/domain/present` (not `@momo/app`).
- Update `present.test.ts` export allowlist for every new runtime export.
- Keep unit coverage for date / ink / float / SUMMARY_NA (move or retarget existing app + web tests to the shared module).

**Never:**
- Do not move `getPlanGridState`, `buildWhatMovedBand`, `buildExceptionsRail`, rail/strip builders, or UI chrome.
- Do not move `recordedPctDisplay`, `formatRelativeAgo`, `dateInkClassName`, preset/localStorage helpers, or `blankDerivedWhilePending` (type/signature or web-only; out of F2/F5 action item).
- No Epic 3 / story 3.1+ work. No fence-harness / F10 / F21 / F23 behaviour changes.
- Do not invent a new package or import Plan formatters from `@momo/app` in client components.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Date happy | `formatPlanDate('2026-09-19')` | `19 Sep 2026` | N/A |
| Date null | `formatPlanDate(null)` | `—` | N/A |
| Float signed | `formatFloatDisplay(4, false)` / `-3` / `0` | `+4` / `-3` / `0`; negative flag when `< 0` | N/A |
| Float NA | `formatFloatDisplay(-1, true)` or null days | `{ text: '—', negative: false }` | N/A |
| Min float | `formatMinFloat(4)` / `null` | `+4` / `—` | N/A |
| Ink tone | date vs dataDate | `muted` / `full` / `na` unchanged | N/A |
| SUMMARY_NA | constant | same aria string as today | N/A |
| No local web copy | web libs after refactor | no local definitions of the moved symbols | N/A |

</frozen-after-approval>

## Code Map

- `packages/domain/src/present/plan-display.ts` — **new** shared module: MONTHS / MONTHS_LONG + the seven exports above.
- `packages/domain/src/present/index.ts` — re-export plan-display runtime symbols.
- `packages/domain/src/present/present.test.ts` — extend exact export allowlist; add/relocate unit cases for the helpers.
- `packages/app/src/schedule/plan-grid.ts` — delete local bodies; import (and re-export if desired) from `@momo/domain/present`.
- `packages/app/src/schedule/plan-grid.test.ts` — keep behaviour tests or import from present; no duplicate implementation under test.
- `packages/app/src/index.ts` — keep barrel re-exports pointing at plan-grid or present (same public names).
- `apps/web/src/lib/plan-grid-format.ts` — remove duplicated helpers; keep `dateInkClassName`, pct/preset helpers; import shared symbols.
- `apps/web/src/lib/plan-strip-what-moved.ts` — remove `formatPlanDate` / `formatMinFloat` / MONTHS; keep pending/attribution/dismiss helpers.
- `apps/web/src/components/plan-tree-grid.tsx`, `plan-schedule-strip.tsx`, `plan-exceptions-rail.tsx`, `plan-what-moved-band.tsx` — import shared helpers from `@momo/domain/present` (or via thin web re-exports if preferred).
- `apps/web/src/lib/plan-grid-format.test.ts`, `plan-strip-what-moved.test.ts` — drop tests of deleted locals; cover remaining web-only helpers; shared cases live under domain/present.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `epic-2-retro-item-10-…` → `done`; refresh `last_updated`.
- Read-only: `epic-2-retro-2026-09-27.md` F2/F5; deferred-work BH8 row (~1150); `.dependency-cruiser.cjs` `web-to-domain-present-only`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/present/plan-display.ts` — add shared helpers with current EN behaviour.
- [x] `packages/domain/src/present/index.ts` + `present.test.ts` — export + allowlist + unit coverage for I/O matrix.
- [x] `packages/app/src/schedule/plan-grid.ts` (+ test/barrel) — switch to shared module; remove duplicate bodies.
- [x] `apps/web/src/lib/plan-grid-format.ts` + `plan-strip-what-moved.ts` (+ consumers/tests) — delete local copies; import `@momo/domain/present`.
- [x] `sprint-status.yaml` — mark `epic-2-retro-item-10-…` `done`; refresh `last_updated`.

**Acceptance Criteria:**
- Given app and web Plan surfaces, when formatting dates/float/ink/SUMMARY_NA, then both call the same `@momo/domain/present` implementations (no second local body).
- Given `plan-grid-format.ts` and `plan-strip-what-moved.ts`, when opened, then they do not define `formatPlanDate`, `formatMinFloat`, `inkTone`, `formatFloatDisplay`, or `SUMMARY_NA_LABEL`.
- Given the present export allowlist test, when it runs, then every new plan-display export is listed deliberately.
- Given existing EN display expectations (date `19 Sep 2026`, float `+4`/`-3`/`—`, ink muted/full/na), when unit tests run, then they pass against the shared module.
- Given sprint status, when F2/F5 is verified, then action item 10 is `done`.

## Implementation Notes

- Added `@momo/domain/present` `plan-display.ts` with `SUMMARY_NA_LABEL`, `formatPlanDate` / Short / Long, `formatMinFloat`, `inkTone`, `formatFloatDisplay` (byte-identical EN behaviour).
- `packages/app` `plan-grid.ts` imports and re-exports those symbols so the app barrel stays stable; bodies deleted.
- Web libs dropped local definitions; Plan components import shared helpers from `@momo/domain/present`. `dateInkClassName` still uses shared `inkTone`.
- Shared I/O-matrix coverage lives in `present.test.ts`; web tests keep preset/pct/attribution/dismiss only.
- Sprint `epic-2-retro-item-10-…` → `done`.

## Spec Change Log

## Review Triage Log

Review pass 1 (2026-10-03), Blind Hunter (BH), Edge Case Hunter (EC), Verification Gap (VG).

| # | Source | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | BH | Spec status vs tasks/sprint done disagree | false | Spec is `in-review` for this review pass; sprint item-10 may be `done` once verified. Fix would only edit this build's spec | reject |
| 2 | BH | Intent names 5 helpers but Always moves Short/Long too | false | Frozen Always explicitly includes Short/Long with MONTHS tables; not a code defect | reject |
| 3 | BH | I/O matrix omits Short/Long / undefined / malformed ISO | false | Fix would edit this build's spec; present tests already cover Short/Long + null | reject |
| 4 | BH | Missing `formatMinFloat(-3)` / undefined / invalid ISO tests | false | `formatMinFloat` negative path is `${n}` with empty sign — same as pre-move; float `-3` covered via `formatFloatDisplay`; no wrong output demonstrated | reject |
| 5 | BH | Empty Spec Change Log / Review Triage Log | false | Those sections fill on loopback / this review pass — not a product defect | reject |
| 6 | BH | Verification skips dependency-cruiser AD-1 check | false | Web imports only `@momo/domain/present`; rule already allows that entry. No new forbidden edge | reject |
| 7 | BH | Suggested `rg` misses other helper export names | false | Fix would edit this build's spec Verification block; parent `rg` already confirmed sole definitions in `plan-display.ts` | reject |
| 8 | BH | `plan-grid.test.ts` still asserts via re-exports | false | Spec Always allows keep behaviour tests via re-export; dual coverage is intentional | reject |
| 9 | BH | `recordedPctDisplay` defer has no backlog id | false | Frozen Never excludes it; Design Notes already document follow-up | reject |
| 10 | BH | Three date formatters repeat split/guard logic | low | Cosmetic DRY inside shared module; extracting a private helper adds complexity with no user-facing drift risk | reject |
| 11 | EC | `inkTone('')` treats empty string as muted/full not na | medium | Pre-existing byte-identical behaviour; Plan dates are null or ISO from use cases / `dateInkClassName(date: string)` with real cells — not caused by this extract | defer |
| 12 | EC | `formatMinFloat(NaN/Infinity)` can render literal text | medium | Pre-existing; schedule min Float is integer-or-null from outputs — not introduced here | defer |
| 13 | EC | `formatFloatDisplay` non-finite floatDays | medium | Same as #12 for row.floatDays — pre-existing, unreachable from domain schedule outputs | defer |
| 14 | VG | No verification gaps | false | Layer reported none | reject |

## Design Notes

Web cannot import `@momo/app` schedule modules from client components (DB-bound use case graph). AD-1 already allows `@momo/domain/present` for page/component formatters (`hours`, `yen`, …). Plan EN display helpers belong there — not a new package, not an `@momo/app` subpath.

Leave `recordedPctDisplay` alone this PR: app takes `{num,den}: bigint`; web view model uses string pairs. That can be a follow-up if desired.

## Verification

**Commands:**
- `pnpm exec vitest run packages/domain/src/present packages/app/src/schedule/plan-grid.test.ts apps/web/src/lib/plan-grid-format.test.ts apps/web/src/lib/plan-strip-what-moved.test.ts` — expected: all pass
- `pnpm --filter @momo/domain exec tsc --noEmit` and web/app typecheck as used in repo — expected: clean
- `rg -n "export function formatPlanDate|export const SUMMARY_NA_LABEL" apps/web packages/app` — expected: no local definitions left in web libs; app only re-exports if kept
