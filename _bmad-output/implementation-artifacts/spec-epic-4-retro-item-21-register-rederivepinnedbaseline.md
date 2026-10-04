---
title: 'Epic 4 retro item-21 — register reDerivePinnedBaseline on F10 surface (F7)'
type: 'bugfix'
created: '2026-10-04'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Set / Re-baseline / Compare are on `SCHEDULE_CALENDAR_WRITE_SURFACE` and the role/audit hubs, but barrel-exported `reDerivePinnedBaseline` is not — Compare is also a read and *is* enumerated, so the next gate pass can miss re-derive silently (Epic 4 retro F7).

**Approach:** Register `reDerivePinnedBaseline` on the F10 second module list with colocated `RE_DERIVE_PINNED_BASELINE_ROLES` (`PROJECT_REACH`) + unaudited audit ("read-only pin re-derive; no rows written"), merge into the hubs, and extend gate fixtures (`WELL_FORMED_INPUT`, `UNAUDITED_BY_DECISION`, role snapshot) like Compare. Keep `getBaselineSetState` / `getReBaselineState` off the surface with their existing comment. Close only sprint item-21 / F7.

**Decision (Harry / retro default):** register like Compare — not a named carve-out. No behaviour change to re-derive math, retention, or Set / Re-baseline `writeLanded` UX.

</frozen-after-approval>

## Implementation Notes

- Chose register-like-Compare (Harry default): `RE_DERIVE_PINNED_BASELINE_ROLES` = `PROJECT_REACH` + unaudited audit `"read-only pin re-derive; no rows written"`.
- Surface: `tests/schedule-calendar-writes.ts` lists `re-derive-pinned.ts`; hubs merge the new declarations.
- Gate fixtures: `WELL_FORMED_INPUT.reDerivePinnedBaseline`, `UNAUDITED_BY_DECISION.reDerivePinnedBaseline`, role inline snapshot updated.
- Eligibility helpers stay off-surface; one-line note in `set-baseline-state.ts` that re-derive *is* registered (F7 asymmetry closed).
- No change to re-derive math, retention, or Set/Re `writeLanded` UX.
- Verified: `vitest` role-declarations + audited-use-cases (98 pass).
- Closed sprint-status `epic-4-retro-item-21-…` → `done` only.
- Surface module comment now names Baseline reads (Compare + re-derive) and eligibility carve-out.

## Review Triage Log

- Spec `in-progress` vs sprint `done` — low; fixed in Finalize (`status: done`).
- Spec untracked at review time — low; included in commit (same pattern as item-20).
- `set-baseline-state.ts` comment rewritten vs frozen "existing comment" — medium; patched (reverted to original eligibility comment).
- Colocated unaudited omits `(story 4.2)` unlike Compare — false; Harry prescribed exact string `"read-only pin re-derive; no rows written"`.
- `schedule-calendar-writes.ts` docs still said "writers" only — low; patched (names reads + eligibility off-surface).
- Hub headers still say "writers" — low reject; pre-existing since Compare; full hub prose rewrite out of scope for item-21.

