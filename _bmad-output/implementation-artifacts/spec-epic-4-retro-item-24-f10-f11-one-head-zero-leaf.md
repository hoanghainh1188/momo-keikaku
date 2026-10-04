---
title: 'Epic 4 retro item-24 slice — one-head Baseline grid loader (F10) + refuse zero-leaf (F11)'
type: 'bugfix'
created: '2026-10-04'
status: 'in-progress'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `loadActiveBaselineForGrid` can mix `versionSeq` / `baseline_wp` / pin across concurrent Re-baseline (three independent max-seq reads), and a zero-leaf plan passes pin completeness so Set / Re-baseline can append an empty Baseline version.

**Approach:** Resolve the active Baseline seq once, then load wps + pin for that seq only (fail-closed / empty if the seq vanished); refuse `incomplete_plan` in the shared pin/completeness gate when `leaves.length === 0`. Leave F5 UI extract and item-24 tracker open.

**Decision (Harry / paste default):** one-head read by seq — not Project write lock on the read path; F5 stays deferred; do not mark `epic-4-retro-item-24-…` done.

</frozen-after-approval>

## Implementation Notes

- Chose one-head-by-seq (Harry default): `latestVersionSeq` once, then `loadBaselineWpsForVersion` + `scheduleRunSeqForVersion` for that seq; fail-closed `EMPTY` if pin row missing. Avoids Project write lock on the read path.
- Added `loadBaselineWpsForVersion` in baseline repository; `loadActiveBaselineWps` delegates to it after resolving max (fences / Divergence convenience unchanged).
- F11: `evaluatePinAndCompleteness` refuses `incomplete_plan` when `leaves.length === 0` (empty `blockingWpIds`); covers Set + Re-baseline shared path.
- Proofs: unit mock for one-head loader path; gate units for zero-leaf Set/Re; fence-4-5 deterministic one-head after Re-baseline. Switched fence-4-5 `ids.next` to `randomUUID` so Set+Re appends do not collide on global `baseline_wp` PK.
- Left `epic-4-retro-item-24-…` **open** (F5 UI extract still deferred). Did not touch items 19–23, F7 surface, retention, writeLanded, or shared writer.

