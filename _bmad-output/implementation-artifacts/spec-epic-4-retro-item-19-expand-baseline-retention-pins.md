---
title: 'Epic 4 retro item-19 — retain pin prev_run inputs (F8)'
type: 'bugfix'
created: '2026-10-04'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `scheduleRunRetention` drops inputs for a Baseline pin's `prev_run_seq` when that prev is older than the oldest pin (`pin−1`), but Story 4.2 `reDerivePinnedBaseline` loads those prev inputs for `recalculateAt`. Latent today (GC unwired) but the decision already disagrees with 4.2.

**Approach:** Expand Baseline retention pins so each pin's immediate `prev_run_seq` is included in the pin set fed to `scheduleRunRetention` (smallest correct fix for F8 / item-19). Do not invent full-chain GC policy. Prove with a domain unit (pin + older prev) and a fence assert beside fence-4-1 retention proof. Close only sprint item-19.

**Decision (Harry / retro default):** retain only the immediate `prev_run_seq` required by `reDerivePinnedBaseline`, not a full prev chain for cause/history walks.

</frozen-after-approval>

## Implementation Notes

- Chose expand-pin-set over changing `scheduleRunRetention` oldest-pin rule: Baseline `pinnedScheduleRunSeqs` now joins `schedule_run` and includes each pin's immediate `prev_run_seq` (null-safe). Keeps Review intervening-pin semantics untouched.
- Domain unit documents pin-only drop vs expanded keep for prev older than oldest pin; still drops seq &lt; expanded oldest.
- Fence: new `fence-4-1` case schedules twice then Set; asserts collector pin set contains pin+prev and both `retainInputs`.
- Closed sprint-status `epic-4-retro-item-19-…` → `done` only.
- Verified: `vitest tests/schedule/retention.test.ts` (3 pass); `REQUIRE_DB=1 vitest tests/schedule/fence-4-1-set-baseline.test.ts` (8 pass).
- Review patch: document that expanded prev pins also retain outputs (conservative); drop unused `orderBy` on collector after Set+numeric sort.

## Review Triage Log

- Spec status still `in-progress` while item-19 marked done — low/process; fixed by Finalize (`status: done`).
- Expanded pins retain prev outputs as side effect — low; real; documented in `scheduleRunRetention` JSDoc (conservative; re-derive needs inputs only).
- `pinnedSeqs` JSDoc outdated vs synthetic prev pins — medium; patched JSDoc.
- No non-fence coverage of `pinnedScheduleRunSeqs` collector — low; reject — AC asked domain retention decision; fence covers collector join/null-prev via existing happy path + new with-prev case.
- Soft `if (!set.ok) return` after expect — false; vitest throws on failed expect before return; same pattern as fence-4-2.
- Sprint action text still says "chain" vs immediate-prev policy — low; reject — historical action wording; frozen Intent records immediate-prev decision.
- Redundant `orderBy` after Set+sort — low; patched (removed).
- Missing null-prev join coverage in new F8 fence — false; happy-path fence still calls `pinnedScheduleRunSeqs` with first-run (null prev) pin.
- Retro F8 prose left as *fix now* — false for this change; out of scope (close item-19 only; do not rewrite retro).

