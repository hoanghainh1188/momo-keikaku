---
title: 'Story 5.6 — The ledger stays correct as Tickets appear, move and vanish'
type: 'feature'
created: '2026-10-04'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '994a3bda160f09edf7484dba33c06e98f18307c0'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The 5.5 writer books first-snapshot Opening Balances and raw absences, but mid-flight OB after a recorded scope change, durable two-read `left_scope`, return-as-delta, overlap/ownership, and PM-visible left-scope/overlap are still missing — so mid-flight Projects can spike and Tickets can lose honesty when they leave or are claimed twice.

**Approach:** Harden domain `ingestSnapshot` + the single ingest writer for OB/`left_scope`/return/overlap rules; add `connector_overlap` (derived) and `connector_ownership_event` (append_only); surface left-scope and overlap to the PM; keep Σ ledger = last observed `actualMh` for every in-scope Ticket.

**Decisions (Harry assignment 2026-10-04 + epic ACs):**
- **OB only in two cases:** (1) Ticket in Connector's first snapshot (`prev === null`); (2) first sighting on the first snapshot after a recorded `connector_scope_event` **and** `createdAt ≤ prev.observedAt`. Any other first sighting (Ticket created since prev) = `delta`, never OB.
- **OB metrics:** count in cumulative AC; exclude from Period; report separately per Connector (attribution already excludes Period — keep + ensure Connectors/Review lines stay honest).
- **`left_scope`:** durable only after **two consecutive complete** absences; keep ledger history; no hour reversal; no further deltas while left; PM list "left scope" with hours.
- **Return after left_scope:** `delta` from last observed `actualMh` (not from 0, not OB) unless the scope-change OB case applies.
- **Identity:** Tracker internal id; key change / in-scope move does not create a new Ticket.
- **Overlap:** non-owner Connector observing an owned Ticket → `connector_overlap` row, conflict UI, **no** second ledger entry / no double-count.
- **Ownership:** transfer **only** via PM-confirmed `connector_ownership_event`; ledger stays on Ticket; no OB; only `owner_connector_id` moves. Delete / lose-scope of owner does **not** auto-transfer. Fix ingest `upsertTicket` so conflict updates do **not** silently overwrite owner.
- **Ownership UI (minimal):** Connectors + Review conflict banner listing overlaps; Resolve actions Keep / Transfer (server actions appending the event). No full Mapping redesign.
- **Scope-change form:** not required — OB uses existing `changeConnectorScope` / `connector_scope_event`; tests drive it.
- **Out of 5.6:** Ticket-Count Mode / `measurement_basis_event` / `connector_setting_event` (5.7); Tracker Account → Resource (5.8); mapping UX/rules (5.9+); compaction/retention (maintenance); durable Review Re-pin writer (Epic 6); REQUIRE_DB matrix / batch identity upsert / `notifyRecipients` wire-up unless needed to land ACs (re-note in deferred-work if still open). Do not touch Story 3.1.
- **Sprint sync:** mark `5-1`…`5-5` `done` (5.5 still `review` on main despite #114 merge).

## Boundaries & Constraints

**Always:**
- Only the ingest writer inserts snapshot/observation/ledger rows; OB/`left_scope`/overlap derived inside that same locked path.
- First-snapshot OB (`prev === null`) preserved; mid-flight OB only via recorded scope change + `createdAt` rule.
- Incomplete reads never advance `left_scope` absence counts and never mark `left_scope`.
- Invariant: for every in-scope Ticket, Σ ledger entries = last observed numeric `actualMh` (null observed = no hours demand).
- `connector_ownership_event` = append_only; `connector_overlap` = derived, owned by the module that owns its source (ingest/overlap writer).
- Identity key remains `(tenant, tracker_kind, tracker_site, tracker_issue_id)`.

**Never:**
- Implement 5.7 basis/settings, 5.8 account linking, 5.9+ mapping UX, compaction, durable Review Re-pin.
- Reverse hours on leave; Opening Balance a returning Ticket (except true scope-change OB case); double-count overlap hours; auto-transfer ownership on delete/lose-scope.
- Second write path for ledger; UPDATE ledger entries; store Resource on entry.
- Touch Story 3.1 workbook reader.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First Connector snapshot | `prev=null`, numeric hours | `opening_balance` entries | N/A |
| New Ticket after prev | `createdAt > prev.observedAt` | First sighting = `delta` | N/A |
| Mid-flight OB | First snap after scope change, `createdAt ≤ prev.observedAt` | `opening_balance` | N/A |
| Scope change, brand-new Ticket | First snap after scope change, `createdAt > prev.observedAt` | `delta` | N/A |
| One complete absence | Ticket missing once | Absence count=1; not yet `left_scope` | Incomplete read: no count bump |
| Two complete absences | Missing twice in a row | Durable `left_scope`; history kept; no reverse; no new deltas | N/A |
| Return after left | Seen again with hours | `delta` from last observed `actualMh` | Unless scope-change OB case |
| Key change / move in scope | Same tracker issue id, new key | Same Ticket identity; key refreshed | N/A |
| Overlap claim | Non-owner Connector sees owned Ticket | `connector_overlap`; no ledger on claimer | Conflict banner |
| Ownership transfer | PM Keep / Transfer | Append `connector_ownership_event`; move `owner_connector_id` only; no OB | Auth/reach refuse |
| Owner deleted / lost scope | Owner gone; no PM confirm | Ownership unchanged; no auto-transfer | N/A |
| Invariant | In-scope Tickets at commit | Σ = last observed `actualMh` | `LedgerInvariantError` + operator alert |

</frozen-after-approval>

## Code Map

- `packages/domain/src/ledger.ts` — extend `ingestSnapshot`: mid-flight OB (`scopeChangedSincePrev` + `createdAt`); two-read absence candidates → writer; return-from-left uses last observed / prior Σ (not zero OB); keep null/`hours_cleared`/invariant.
- `packages/domain/src/types.ts` — TicketObservation already has `createdAt`; extend ingest input for scope-change + left-scope prior state if needed.
- `packages/domain/src/attribution.ts` — already excludes OB from Period + `openingBalanceMh`; verify per-Connector reporting inputs stay correct (no Period false spike).
- `packages/domain/src/attribution.test.ts` + new ledger tests — matrix cases incl. leave-and-return / scope-change.
- `packages/db/src/schema.ts` + `drizzle/0008_*` — `connector_ownership_event` (append_only), `connector_overlap` (derived); durable left-scope fields on `ticket` (e.g. `left_scope`, `absent_complete_streak` / last-absent snapshot id).
- `packages/db/src/table-classes.ts` + `pnpm db:sql` — register classes; regenerate rls/grants/triggers.
- `packages/db/src/repositories/tracker/index.ts` — **stop** overwriting `ownerConnectorId` on conflict; refresh `key` (and project if still valid) only; ownership moves only via ownership event writer.
- `packages/db/src/repositories/ingest/index.ts` — persist left_scope after two complete absences; clear streak/flag on sighting; skip ledger for non-owner overlap Tickets; upsert/clear `connector_overlap`; pass scope-change signal (`scope_seq` > prev); load last observed hours for return-as-delta.
- `packages/db/src/repositories/connector` — append ownership event; list open overlaps for Project UI.
- `packages/app/src/use-cases/connector-ingest.ts` + tests — wire outcomes; incomplete never advances left_scope.
- `packages/app/src/use-cases/connector-writes.ts` (or new ownership use case) — PM `confirmConnectorOwnership` Keep/Transfer under Project lock + roles.
- `apps/web/.../connectors/page.tsx` + Review Unplanned — overlap conflict banner; left-scope collapsed list; Resolve actions.
- `packages/i18n` en/ja — UX-DR23 left-scope + overlap + resolve copy.
- `fixtures/backlog/leave-and-return` + `scope-change` — extend if needed for two-absence durable left_scope.
- `deferred-work.md` — note still-open 5.5 items (REQUIRE_DB matrix, batch upsert, notifyRecipients) if untouched; do not implement compaction / Review Re-pin.
- `sprint-status.yaml` — `5-1`…`5-5` → `done`; `5-6` → `in-progress` then `review`.
- Reuse: single locked writer, `checkLedgerInvariant`, Connectors OB row, credential-error banner pattern, `changeConnectorScope`.
- Do not change: 3.1 workbook, 5.7/5.8/5.9+ tables, compaction SQL, Review Re-pin writer.

## Tasks & Acceptance

**Execution:**
- [x] Domain OB + two-read left_scope + return-as-delta — tests for matrix.
- [x] Migration 0008 + registry/SQL — ownership event, overlap, ticket left-scope state.
- [x] Tracker upsert ownership fix + ingest writer persistence (left_scope, overlap skip, scope-change OB signal).
- [x] PM ownership confirm use case + Connectors/Review conflict + left-scope UI + i18n.
- [x] Sync sprint-status (5.1–5.5 done) + deferred-work notes; verify lint/typecheck/depcruise/test.

**Acceptance Criteria:**
- Given first Connector snapshot or scope-change first sighting with `createdAt ≤ prev.observedAt`, when recorded, then Opening Balance; otherwise first sighting is delta.
- Given Opening Balances, when metrics run, then cumulative yes / Period no / reported per Connector.
- Given two consecutive complete absences, when marked, then durable left_scope, history kept, no reverse, no further deltas; PM sees left-scope list.
- Given return after left_scope, when seen, then delta from last observed actualMh (not 0/OB) unless scope-change OB case.
- Given key change / in-scope move, when observed, then same Tracker-id identity.
- Given overlap, when non-owner observes, then `connector_overlap` + conflict UI, no double ledger.
- Given ownership transfer, when PM confirms, then `connector_ownership_event` only; no OB; owner moves; delete/lose-scope alone does not transfer.
- Given in-scope Tickets, when invariant checked, then Σ entries = last observed actualMh.

## Implementation Notes

- Domain `ingestSnapshot`: mid-flight OB when `scopeChangedSincePrev` + `createdAt ≤ prev.observedAt` and no prior Σ; otherwise first sighting / return uses `nowMh − priorΣ` delta. Incomplete reads never reach the writer.
- Pure helpers `advanceLeftScopeState` + `partitionOwnedTickets` drive writer durability/overlap skip; unit-tested in `attribution.test.ts`.
- Migration `0008_ledger_appear_move_vanish`: `ticket.left_scope` + `absent_complete_streak`; `connector_ownership_event` (append-only); `connector_overlap` (derived). Registry 41 tables; `pnpm db:sql` regenerates RLS/grants/triggers.
- Tracker `upsertTicket` refreshes key/project only — never `owner_connector_id`. Ownership moves via `confirmOwnership` + `connector_ownership_event`.
- Ingest writer: scope-change signal from `scope_seq`; skip ledger for non-owner overlaps; persist two-read left_scope; upsert/clear `connector_overlap`.
- UI: Connectors + Review overlap conflict banner with Keep/Transfer; collapsed left-scope list; en/ja UX-DR23 copy.
- Fixture `leave-and-return` extended to four pages (two absences then return).
- `confirmConnectorOwnership` Keep/Transfer unit-tested (`connector-ownership.test.ts`).
- Deferred: REQUIRE_DB writer matrix, batch identity upsert, `notifyRecipients`, compaction, Review Re-pin (still open / out of 5.6).

## Spec Change Log

## Review Triage Log

## Design Notes

- **Scope-change signal:** writer compares current Connector head `connector_scope_event.seq` to `prev.scope_seq`; if greater, this snapshot is the first after a recorded scope change → pass `scopeChangedSincePrev` into domain.
- **Return-as-delta:** treat left_scope Ticket reappearance like null→numeric after clear — delta = nowMh − prior Σ (retained history), never restart from 0 as OB.
- **Overlap:** owner is `ticket.owner_connector_id` set on first insert only; claimer writes/refreshes `connector_overlap` and skips ledger for that Ticket id on this Connector's ingest.
- **Ownership Resolve:** Keep = append event affirming current owner (clears overlap); Transfer = append event with new owner + update `owner_connector_id` + clear overlap.

## Verification

**Commands:**
- `pnpm lint` — exit 0
- `pnpm typecheck` — exit 0
- `pnpm depcruise` — exit 0
- `pnpm test` — exit 0
