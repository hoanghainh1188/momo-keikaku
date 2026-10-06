---
title: 'Story 5.9 — Map a Ticket to a Work Package, and never move the plan'
type: 'feature'
created: '2026-10-06'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '17462bdbadc509a125ad0355d5ba46b59c9923c1'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Manual map/remap/unmap still writes `manual`(+null) unmaps, has no derived `mapping_head`, no Ticket composite FK, no leaf→summary refusal, no `deleteWp` reassign/disableRules, and Mapping UI is select+Save only — so hours cannot land on leaf WPs with keyboard-equivalent DnD while the schedule stays put (FR-21, AR-18, UX-DR25).

**Approach:** Close AR-18 on `mapping_event` (`release` source + composite Ticket FK + same-txn derived `mapping_head`); harden map/remap/unmap(`release`)/`mapping.reassign`/`disableRulesTargeting` under the project lock with query-time attribution and zero schedule writes; add Mapping-page DnD Tickets→leaf WPs with keyboard Map as exact equivalent; sync sprint-status 5.1–5.8.

**Decisions (Harry handoff 2026-10-06 + epic ACs / AR-18 / founder A4 / UX-DR25):**
- **Store:** `mapping_event` remains the only Mapping SoT; current Mapping = latest event at/below high-water mark; `source` ∈ `manual | rule | disposition | release`.
- **Unmap:** ordinary unmap and WP-deletion reassign write `source = release`, `wp_id = null` (back to rules). R0 does **not** expose `manual` + `wp_id = null` (pinned Unmapped) as a PM action (A4). Existing historical `manual`+null heads stay until remapped — append-only, no rewrite.
- **ticket_id identity:** keep `ticket_id` as tracker issue id (ledger/attribution key). Add `UNIQUE (tenant_id, project_id, tracker_issue_id)` on `ticket` and composite FK from `mapping_event (tenant_id, project_id, ticket_id)` → that key so a Ticket maps only inside its owning Connector's Project (AR-18). Do not switch public Map APIs to internal `ticket.id`.
- **mapping_head:** create table class `derived`; dual-write in the same transaction as every append; rebuildable from events; never SoT for attribution (still `mappingHead()` over events ≤ pin).
- **Leaf-only:** map/remap refuse non-leaf / milestone targets (`invalid_input` or `not_found` consistent with existing WP checks). `applyPlanChange` paths that would turn a mapped leaf into a summary refuse until mappings are reassigned. `confirmImport` is Epic 3 — export a shared guard used by plan now; wire import when 3.x lands (note deferred-work).
- **deleteWp:** in one project-locked transaction: `mapping.reassign` (release all tickets mapped to that WP) + `mapping.disableRulesTargeting(wp)` (delete `mapping_rule` rows targeting that WP — minimal; no Rules edit UX / evaluateRules changes — those are 5.10+) + existing soft-delete.
- **No schedule motion:** mapping writers never write actual dates or call `recalculate`. First-observed activity stays query-time evidence beside actual start (`readFirstObservedActivity` / plan thin-edit Accept) — schedule unchanged until PM acts (AR-52).
- **UI:** Mapping page only R0 DnD — drag Ticket rows onto leaf WP drop targets; keyboard Map action invokes the same server write as drop (NFR-U1). Prefer HTML5 DnD (no new library) unless a11y forces a minimal kit. Keep select+Save as fallback that also writes `release` on empty. Do not group Actuals sidebar (nav layout out of scope). Do not rework Rules table edit (5.10).
- **Out of 5.9:** 5.8 linking hardening; Rules/`evaluateRules`/preview/ingest re-eval (5.10+); coverage/catch-all/silently-excluded/approximate/fixture-ticket (5.11–5.15); Resolved PM UI (RESOLVED_WRITE_SURFACE=B); compaction; Review Re-pin; Story 3.1; REQUIRE_DB / batch identity / notifyRecipients unless required for ACs.

## Boundaries & Constraints

**Always:**
- Attribution = ledger + Mapping history at query time; ledger rows never rewritten on map/remap/unmap.
- Remap attributes **all** of that Ticket's ledger hours to the WP mapped **now**; Unplanned Work updates on next read.
- Every Mapping append records `actor` + `at` under the per-Project watermark lock; re-read head inside the lock before append (manual wins pattern for later rules).
- Only leaf, non-milestone WPs are mappable; Ticket maps to at most one WP (head).
- Mapping change writes no WP actual date and triggers no recalculation.
- Ordinary unmap = `release`; `deleteWp` releases mappings + disables rules targeting that WP in one txn.
- `mapping_head` derived, same-txn, rebuildable; reads for compute may use events or head consistently with pin semantics.
- DnD Map and keyboard Map are capability-equivalent; no mouse-only path.

**Never:**
- Expose pinned Unmapped (`manual` + null) as a PM control in R0.
- Rework 5.8 Tracker Account link events / Unattributed / NFR-S6 beyond thin reads needed for ACs.
- Implement Mapping Rules authoring, priority edit, preview, or ingest-time `evaluateRules` changes (5.10+).
- Implement 5.11–5.15 coverage/catch-all/exclusion/approximate/fixture-ticket surfaces.
- Implement Resolved status PM form, compaction/retention, durable Review Re-pin, or Story 3.1.
- Import `domain/attribution` into `domain/schedule` (Story 2.9 fence).
- Add a second DnD surface outside Mapping.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Map to leaf | Ticket + leaf WP same Project | Append `manual` mapping; head→WP; attribution/Unplanned update on read; no date/recalc | Foreign/non-leaf/milestone WP → refuse, no write |
| Remap | Ticket head on WP-A → WP-B | Append new `manual`; all ledger hours attribute to B now; ledger unchanged | Same as map |
| Unmap (release) | PM clears mapping | Append `release`, `wp_id=null`; head unmapped for rules later; not pinned manual-null | N/A |
| Cross-project Ticket | Ticket's `project_id` ≠ command Project | Refuse; FK/guard prevents row | `not_found` / `invalid_input` |
| Mapped leaf → summary | plan add-child / reparent that would make mapped leaf a summary | Refuse until mappings reassigned | Named refuse; no partial tree write |
| deleteWp with mappings/rules | WP has mapped tickets + rules targeting it | One txn: release mappings + delete targeting rules + soft-delete WP | Rollback all on any failure |
| mapping_head dual-write | Any append (manual/disposition/release/reassign) | Head row upserted same txn; rebuild from events matches | Txn abort → no head drift |
| Schedule fence | Map/remap/unmap commits | Actual start/finish unchanged; first-observed may change as evidence only | N/A |
| DnD / keyboard Map | Drop Ticket on leaf WP or keyboard Map to same WP | Same write path as form Map | Drop on non-leaf ignored/refused |
| Author audit | Any Mapping change | `actor` + `at` on event; audit action recorded | N/A |

</frozen-after-approval>

## Code Map

- `packages/db/drizzle/` — next `0011_mapping_head_and_ticket_fk.sql`: `mapping_head` derived; `ticket` UNIQUE `(tenant_id, project_id, tracker_issue_id)`; `mapping_event` FK to that + allow `release` in comment/check if any; idx `(tenant_id, project_id, ticket_id, seq)`.
- `packages/db/src/schema.ts` + `table-classes.ts` + `pnpm db:sql` — registry 44→45 (`mapping_head` derived); regenerate RLS/grants/triggers.
- `packages/db/src/repo-writes.ts` — extend `recordManualMapping` / `appendMappings`: accept source (`manual`|`disposition`|`release`); dual-write `mapping_head`; leaf check; Ticket-in-Project check via `ticket` row; add `reassignMappingsFromWp` + `disableRulesTargeting` (delete rules by `wp_id`).
- `packages/db/src/repo.ts` / ingest mapping appends — any other `mapping_event` insert path must dual-write head (seed, disposition, rule appends that already exist).
- `packages/db/src/seed.ts` — keep demo mappings consistent with head rebuild.
- `packages/domain/src/types.ts` — `MappingSource` += `'release'`.
- `packages/domain/src/mapping.ts` — keep pure `mappingHead`; treat `release` like non-manual for future `applyRules` (head source `release` is re-evaluable); no Rules UX.
- `packages/domain/src/attribution.ts` + tests — remap/release I/O: hours follow new head; ledger untouched; Unplanned updates.
- `packages/app/src/use-cases/project-writes.ts` + `project-write-input.ts` + ports — unmap → `release`; leaf-only; Ticket ownership check; audit `mapping.map` / `mapping.unmap` (unmap = release).
- `packages/app/src/schedule/plan-edit.ts` + `apply-plan-change.ts` — before mutations that add children under / reparent onto a mapped leaf, refuse; `deleteWorkPackage` calls reassign+disableRules in same fence txn.
- `packages/app/src/schedule/first-observed.ts` — include `release` in source cast; still display-only.
- Shared guard module (e.g. `packages/app/src/schedule/mapped-leaf-guard.ts`) — used by plan now; deferred wire for `confirmImport`.
- `apps/web/.../mapping/page.tsx` + new client component(s) — leaf WP drop targets + draggable Ticket rows; keyboard Map; keep `MapTicketForm` writing release on empty.
- `apps/web/.../mapping/actions` / `map-ticket-form.tsx` / i18n — release copy (`release_option` not pinned unmapped); DnD/keyboard labels en/ja.
- `packages/i18n` en/ja — mapping form + DnD/keyboard strings.
- `deferred-work.md` — append: confirmImport mapped-leaf guard wire (Epic 3); re-note compaction / Review Re-pin / RESOLVED_WRITE_SURFACE=B / 5.10+ rules; REQUIRE_DB etc. if still open.
- `sprint-status.yaml` — `5-1`…`5-8` → `done` if lagging (`5-8` currently `review`); `5-9` → `in-progress` then `review`.
- Reuse: project watermark lock, `mapTicket`/`getProjectMapping`, `mappingHead`, `readFirstObservedActivity`, connector_overlap derived registry pattern, 5.8 append+dual-write style.
- Do not change: 5.8 link writers beyond thin reads; Rules authoring UI; coverage/catch-all stories; 3.1 workbook; schedule engine imports of attribution.

## Tasks & Acceptance

**Execution:**
- [x] `packages/db` migration 0011 + registry/SQL — `mapping_head` + Ticket composite FK + `release` source note.
- [x] `packages/db` writers/seed/ingest — append dual-write head; reassign; disableRulesTargeting; leaf + Ticket-in-Project guards.
- [x] `packages/domain` types/mapping/attribution(+tests) — `release` source; head/attribution I/O matrix.
- [x] `packages/app` project-writes + plan fence + deleteWp + mapped-leaf guard — map/remap/unmap(release); no schedule writes; refuse mapped-leaf→summary.
- [x] `apps/web` + `packages/i18n` — Mapping DnD + keyboard Map ≡ same write; form unmap = release.
- [x] `sprint-status.yaml` + `deferred-work.md` — sync 5.1–5.8 done; note Epic 3 confirmImport wire; lint/typecheck/depcruise/test.

**Acceptance Criteria:**
- Given `mapping_event`, when Mapping is read, then it is the only store, `source` includes `release`, and current Mapping is latest event ≤ high-water mark (AR-18).
- Given a Ticket, when mapped, then at most one leaf WP; plan refuses mapped-leaf→summary until reassigned (FR-21, AR-18).
- Given schema, when written, then `project_id` + composite FKs keep Ticket mapping inside owning Connector's Project (AR-18).
- Given remap, when committed, then all that Ticket's ledger hours attribute to the WP mapped now; ledger not rewritten; Unplanned updates (FR-21, AR-18).
- Given any Mapping change, when committed, then no WP date moves / no recalc; first-observed evidence may update beside actual start (FR-21, AR-52).
- Given ordinary unmap or WP deletion reassign, when recorded, then `release` (not pinned manual-null) (AR-18, A4).
- Given `deleteWp`, when it runs, then reassign + disableRulesTargeting in one transaction (AR-18, FR-5).
- Given `mapping_head`, when maintained, then derived, same-txn, rebuildable, never SoT (AR-18, AR-38).
- Given Tickets and leaf WPs on Mapping, when PM maps by pointing, then DnD works here only in R0, with keyboard Map equivalent (UX-DR25, NFR-U1).
- Given every Mapping change, when committed, then author and time are recorded (FR-21, NFR-A1).

## Implementation Notes

- 2026-10-06: Implemented migration `0011_mapping_head_and_ticket_fk` (`mapping_head` derived, ticket `UNIQUE (tenant_id, project_id, tracker_issue_id)`, `mapping_event` composite ticket FK + `release` source check); dual-write head on all append paths; `reassignMappingsFromWp` + `disableRulesTargeting` on `delete_wp`; map/unmap(`release`) + leaf/Ticket guards; `assertMappedLeafMayBecomeSummary` on create/reparent; Mapping HTML5 DnD + keyboard Map with `MapTicketForm` release fallback; sprint 5-8 → done; deferred confirmImport wire + 5.10+ rules notes.
- 2026-10-06 (parent verify): Added unit tests for mapped-leaf refuse, disableRulesTargeting/reassign no-op, schedule-fence source check, and DnD/form FormData parity so matrix rows are covered without REQUIRE_DB.
- 2026-10-06 (review patches): DnD setData + pending guards + keyboard focus/key; reassign locks before head read; `mappingHeads` in write harness/expectations; fence-2-10 clears mapped heads before leaf→summary + mapped_leaf refuse case.

## Spec Change Log

## Review Triage Log

- `high` — DnD missing `dataTransfer.setData` (Firefox drops fail): verified in board; patched with `setData('text/plain', ticketId)`.
- `medium` — keyboard chooser focus via `queueMicrotask` before mount: verified; patched with `useEffect` on `keyboardTicketId`.
- `medium` — keyboard Map switch ticket keeps prior select value: verified; patched with `key={keyboardTicketId}`.
- `medium` — concurrent Map while `pending`: verified; patched with pending guards + disabled controls.
- `high` — `reassignMappingsFromWp` selected heads before project lock: verified; patched `lockWatermark` before select.
- `high` — `mapping_head` dual-write absent from `landedRows`/`EXPECTED` (REQUIRE_DB illicit-side-effect / no head assert): verified; patched harness + expectations + cross-tenant withoutSeq.
- `high` — fence leaf→summary under mapped leaf would refuse / break 2.10 cases: verified risk via `prepareSchedulableLeaf` + new guard; patched clearMappingsOnWp + added mapped_leaf refuse test.
- `high` (verification-gap, pre-verified) — plan fence never asserted mapped-leaf refuse: routed to patch; covered by new fence-2-10 mapped_leaf case.
- `high` (verification-gap, pre-verified) — delete_wp never asserted reassign+disableRules wiring at fence: partial unit coverage remains; full DB assert still deferred with REQUIRE_DB — disposition `defer` for richer delete fence assert beyond clear+refuse coverage.
- `medium` (verification-gap, pre-verified) — leaf-only `workPackageInProject` has no same-Project summary/milestone refuse test: real gap; `defer` (REQUIRE_DB / project-scoped-ids extension).
- `medium` (verification-gap, pre-verified) — schedule-fence/DnD parity tests are source-text: residual after UI runtime still lacking RTL; `defer` component runtime test.
- `low` — sprint `last_updated` moved earlier same day: cosmetic tracking stamp; rejected (unlikely everyday harm).
- `false` — sprint 5-9 still `in-progress` while spec `in-review`: expected until step-05 sync to `review`.
- `false` — empty Spec Change Log / Review Triage Log at start of review: normal before this triage pass.
- `low` — whole `<tr>` draggable including form controls: tolerable without dedicated handle; rejected (fix more complex than everyday harm).
- `medium` — keyboard Map lacks Escape / focus restore: real a11y gap; `defer`.
- `low` — raw `ticket.source` enum shown: cosmetic; `defer` for localized source labels.
- `low` — `ja` `mapping.unmapped` still English: real i18n gap; `defer`.
- `low` — `merge-story-19-i18n.mjs` still emits `unmapped_option`: tooling drift; `defer`.
- `maybe-false` — migration 0011 aborts on orphan/mismatched historical ticket_ids: would be high if dirty DBs exist; settle with preflight SELECT on apply — `defer` unverified-high.
- `false` — `assertMappedLeafMayBecomeSummary` using `mapping_head` contradicts “never SoT”: Design Notes say attribution pins use events; live fence using derived head matches dual-write invariant — not a defect.
- `low` — watermark-concurrency tests insert events without head dual-write: test-only; `defer`.
- `low` — delete-wp unit test shallow until lock mock: after lock patch, mock updated; covered.

## Design Notes

- **release vs manual-null:** `release` clears head for future rules; `manual`+null would pin Unmapped and block rules — R0 hides the pin (A4). UI empty option = Release.
- **Head dual-write:** mirror `resource.tracker_account_ids` / Rates live-cache pattern, but class is `derived` (may DELETE/rebuild), not a column on another row. Attribution pins still prefer event replay ≤ `mappingSeqMax` when pins exist.
- **disableRulesTargeting:** delete rows in `mapping_rule` for that `wp_id` under the same lock — Rules CRUD/preview stay 5.10; this only prevents a deleted WP from remaining a live target.
- **DnD:** HTML5 drag on Ticket row → drop on leaf WP list/chip; keyboard Map focuses WP chooser / invokes map action with same payload as drop.
- **confirmImport:** shared `assertMappedLeafMayBecomeSummary` (or inverse refuse) lives in app/schedule; Epic 3 calls it — do not stub a fake importer.

## Verification

**Commands:**
- `pnpm lint` — exit 0
- `pnpm typecheck` — exit 0
- `pnpm depcruise` — exit 0
- `pnpm test` — exit 0
