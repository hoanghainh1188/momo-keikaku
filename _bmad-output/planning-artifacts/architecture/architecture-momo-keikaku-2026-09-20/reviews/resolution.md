---
type: review-resolution
target: ../ARCHITECTURE-SPINE.md
reviews:
  - review-rubric.md
  - review-adversarial.md
  - review-reconcile-inputs.md
  - review-tech-currency.md
date: '2026-09-20'
status: applied
---

# Resolution: reviewer findings applied to the Architecture Spine

Four reviews were run headless against the spine and never applied. They are now applied. The spine grew from 404 to 595 lines; AD-1 through AD-18 were amended in place and AD-19 through AD-24 were added at the end. AD numbering, document structure and the PRD §3 Glossary vocabulary are unchanged. No PRD decision was overridden; where a reviewer's fix would have changed PRD scope, the spine is left as the PRD has it and a `NEEDS FOUNDER DECISION` line was added to Open Questions instead.

## Counts

| Severity | Raised (deduped across the four reviews) | Applied | Partial | Skipped |
| --- | --- | --- | --- | --- |
| Critical / Blocker | 5 | 5 | 0 | 0 |
| High | 11 | 11 | 0 | 0 |
| Medium | 19 | 18 | 1 | 0 |
| Low | 9 | 9 | 0 | 0 |
| **Total** | **44** | **43** | **1** | **0** |

The four reviews overlap heavily: 62 raw findings dedupe to 44. The one partial is rubric M1 / reconcile G-9 (Health threshold scope): the spine now matches the PRD's per-Tenant wording, and the reviewer's additional recommendation of per-Project overrides is a founder decision rather than an architecture call.

## What changed, by theme

**Reproducibility (the invariant the spine is built around).** The defect that broke it was that Postgres assigns an identity `seq` at INSERT, not at COMMIT, so a long transaction can commit rows below a watermark captured after it started. AD-20 now requires a per-Project advisory lock before any `seq` is allocated, and captures `ComputationInputs` under the shared form of the same lock. Separately, several EVM and Health inputs lived on mutable tables and were unpinnable; AD-21 turns each of them into an append-only event, AD-10 pins each `*_seq_max`, and a CI closure test fails if any domain function input is not reachable from `ComputationInputs`.

**Ledger correctness.** Offset pagination over Backlog's default `updated` sort could skip Tickets while still reporting a complete read, which would falsely mark them `left_scope` and then double-count them on re-entry. AD-6 fixes the sort and defines completeness against Count Issues taken before and after; AD-7 requires two consecutive complete reads before `left_scope`, and defines re-entry as a delta from the last observed value. Null hours no longer move the ledger, so a plan downgrade cannot zero out AC. Opening Balance classification now has a real store (`connector_scope_event`) and a real discriminator (`createdAt` on the observation).

**Mapping.** "Manual wins" was only true in the non-concurrent case; it now holds under the AD-20 lock with a head re-read inside it. Unmapping gained a `release` source so deleting a WP no longer pins its Tickets to Unmapped forever. `mapping_event` carries `project_id` with composite FKs, so a Ticket cannot be mapped into another Project's plan.

**Compaction and deletion.** Compaction now deletes only `ticket_observation` rows and never a snapshot header, with a retention set that covers everything a Published Snapshot, ledger entry, open Review or export pins. `purgeTenant` is a sanctioned second exception through the same `maintenance` role, so the trigger design does not need migrating when NFR-D1 lands.

**Operations.** AD-19 decides production migrations (migrator role, expand/contract), log and alert destinations inside Japan, the restore procedure and its pre-R1 rehearsal, blob lifecycle, key rotation, and the CI gate list. Mail moved from R1 into R0, because FR-17 and FR-3 both require it.

**Tech currency.** Six behaviour claims that had been written as facts were corrected against live docs: pg-boss queue policy (`singletonKey` alone does not serialise), Backlog pagination ordering, `SET LOCAL` not accepting a bind parameter, the Postgres 18 image's changed data path, pnpm 12's `strictDepBuilds` default, and the ExcelJS/SheetJS fallback path.

**Demo coherence and data protection.** `CLOCK_MODE=fixture` makes both roles agree with fixture time, which is what stops the demo showing 100% unclearable Unplanned Work. AD-24 keeps real Ticket titles, names and emails out of the repo and the FR-9 acceptance corpus out of git.

## NEEDS FOUNDER DECISION

Recorded in the spine's Open Questions, not applied:

1. **Health threshold scope** — FR-31 says per Tenant; the reviewers recommend adding per-Project overrides, which is new scope.
2. **FR-12 retroactive Rate corrections** — FR-12 says adjusting entries are appended; the spine achieves the same guarantee by bitemporal recompute against a pinned `rate_seq_max`. Confirm the interpretation.
3. **Measurement basis flip** — the spine latches automatically after 3 agreeing snapshots; requiring PM confirmation to return to Ticket-Count Mode is a new PM screen.
4. **"Pinned Unmapped"** — whether R0 exposes keeping a Ticket out of the rules as a distinct action, versus every unmap being a `release`.
5. **Tenant deletion timing** — `purgeTenant` is R1 in the spine while NFR-D1/NFR-S6 imply an obligation from first client data.

## Not carried over

Nothing was dropped. Two reviewer observations were merged rather than applied separately: rubric L2 (ExcelJS zip guard) folded into tech-currency F6 under AD-13, and rubric M6's scope-change half folded into adversarial H8 / reconcile G-3 under AD-6 and AD-7.
