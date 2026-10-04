---
title: 'Story 5.1 — One port to every tracker, and a fixture that replays like one'
type: 'feature'
created: '2026-10-04'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'ef2b2b657b6b10eb4851d5d66af245cf124bf95e'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Trackers are not behind a port. Domain `TicketObservation` is still Backlog-shaped (`resolved`, `milestoneIds`/`categoryIds`), there is no `fixture-replay` adapter, and CI/demo cannot prove credential-free reads or whitelist-safe fixtures — so Epic 5 ingest cannot start without leaking tracker shapes into the ledger.

**Approach:** Land `TrackerPort` + `fixture-replay` (with `FixtureCursorPort`), a GET-only `backlog-http` scaffold, AD-6 `TicketObservation`/`attributes`, identity tables `ticket` + `tracker_account`, fixture-cursor storage, five synthetic scenarios, a CI whitelist gate, and `adapterKind` recording/refuse on snapshot ingest — without shipping Connector UI, full paginated completeness, or the worker ledger writer (5.2–5.5).

**Decisions (agent defaults from AD-6 / epics ACs; Harry's "build Story 5.1" authorizes):**
- **Hours scenario path stays `fixtures/backlog/ec-phase2/`** — already wired by seed; do not rename. Sibling dirs: `no-hours`, `page-shift`, `leave-and-return`, `scope-change`.
- **`resolved` leaves the observation.** Compute paths take `resolvedStatusIds: ReadonlySet<string>`; demo/seed uses `Closed` until `connector_setting_event` (later story).
- **Mapping rules read `attributes`** (`kind: milestone|category` for Backlog). Keep `issueType` / `keyPrefix` match fields.
- **Upsert repos land now; full worker `ingestSnapshot` writer stays 5.5.** Seed/tests call upsert helpers. Domain pure `ingestSnapshot` gains `adapterKind` refuse when prev differs.
- **`tracker_kind = 'fixture'`** on fixture-origin tickets; live backlog scaffold uses `'backlog'`.
- **`TRACKER_ADAPTER_OVERRIDE=fixture`** already refused outside `DEPLOYMENT=local` in config — wire selection in composition only.

## Boundaries & Constraints

**Always:**
- `TrackerPort.readScope` returns `{ complete, observedAt, tickets, accounts, hoursFieldPresent, rateLimit, adapterKind }`.
- `TicketObservation` = FR-19 whitelist + `createdAt` + `attributes[]`; adapter reports `statusId` only (never `resolved`).
- `ticket`: `UNIQUE (tenant_id, tracker_kind, tracker_site, tracker_issue_id)`, exactly one `owner_connector_id`; `tracker_account` upserted only from `TrackerAccountObservation`.
- Fixture pages at `fixtures/backlog/<scenario>/NNNN.json`; cursor in db-owned table behind `FixtureCursorPort` (adapter never imports `@momo/db`).
- CI rejects fixture JSON fields outside the whitelist; fixtures are synthetic.
- HTTP adapter has **no non-GET** code path.
- `adapter_kind` on `tracker_snapshot`; domain refuse + operator-alert shape when it differs from previous.

**Never:**
- No Connector set-up UI / approval / credentials encryption (5.2).
- No Count Issues completeness loop / Search-budget gate beyond scaffold types (5.3).
- No worker snapshot scheduler or full Actuals Ledger writer transaction (5.4–5.5).
- No Jira adapter. No Story 3.1 / Epic 4 retro edits.
- No outbound adapter DB imports. No raw payloads / descriptions / comments in fixtures or observations.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fixture hours read | `ec-phase2` pages + cursor 0 | `complete=true`, tickets with `attributes`, accounts upsertable, `adapterKind='fixture'` | N/A |
| No-hours scenario | `no-hours` fixtures | `hoursFieldPresent=false`, `actualMh=null` | N/A |
| Page-shift scenario | overlapping pages | Adapter exposes shift for later completeness tests; `complete` may be false | Incomplete → no persistence in callers |
| Leave-and-return | ticket absent then back | Distinct observations; identity stable on UNIQUE key | N/A |
| Scope-change | scope filter change pages | Scenario files present; cursor advances per connector | N/A |
| Cursor round-trip | FixtureCursorPort get/set | Cursor persists per connector; adapter only sees port | N/A |
| adapterKind mismatch | prev snap `fixture`, next `backlog` | Domain `ingestSnapshot` refuses | Operator-alert error |
| Whitelist CI | fixture with `description` | CI check fails | Non-zero exit |
| HTTP non-GET | backlog-http source | Static/test proves no POST/PUT/PATCH/DELETE | Fail test |
| Ticket UNIQUE | same tracker triple twice | Second insert violates UNIQUE | SQL unique violation |
| Override outside local | `TRACKER_ADAPTER_OVERRIDE=fixture` + non-local | Config refuse (existing) | Boot/read error |

</frozen-after-approval>

## Code Map

- `packages/domain/src/types.ts` — reshape `TicketObservation` / extend `SnapshotRead` (`complete?`, `accounts?`, `rateLimit?`, `adapterKind`); add `TrackerAccountObservation`, attribute kinds.
- `packages/domain/src/ledger.ts` — `adapterKind` refuse when `prev` present and differs; keep delta math.
- `packages/domain/src/{mapping,evm,review}.ts` + tests — `attributes` matching; `resolvedStatusIds` at compute (drop `obs.resolved`).
- `packages/app/src/ports/tracker.ts` (**new**) — `TrackerPort`, connector config/credentials types, `FixtureCursorPort`.
- `packages/adapters/src/fixture-replay.ts` (**new**) — read scenario pages; advance cursor via port; emit `tracker_kind` semantics / `adapterKind='fixture'`.
- `packages/adapters/src/backlog-http.ts` (**new**) — GET-only scaffold (types + refuse non-GET); full read loop is 5.3.
- `packages/adapters/src/index.ts` + composition (`apps/web/src/server/composition.ts`, `apps/worker/src/index.ts`) — wire fixture adapter when override/local fixture connector.
- `packages/db/src/schema.ts` + migration `0004_*` — add `ticket`, `tracker_account`, `fixture_cursor`; add `tracker_snapshot.adapter_kind`; reshape `ticket_observation` columns to whitelist/`attributes` (jsonb or equivalent).
- `packages/db/src/table-classes.ts` — register classes: `ticket` derived, `tracker_account` mutable-audited, `fixture_cursor` operational (or existing closest class).
- `packages/db/src/repositories/` — upsert `ticket` / `tracker_account`; fixture-cursor repo implementing port from app/db boundary.
- `packages/db/src/fixtures.ts` + `fixtures/backlog/**` — new observation shape; keep `ec-phase2`; add four scenario dirs; seed still rebases times.
- `scripts/` or `tests/` — CI whitelist checker; root `package.json` / `.github/workflows/ci.yml` invoke it.
- `packages/app/src/config.ts` — reuse `TRACKER_ADAPTER_OVERRIDE` (no second env reader).
- Continuity: Epic 4 done; no previous Epic 5 done story. Do not touch Story 3.1.

## Tasks & Acceptance

**Execution:**
- [x] Domain types + ledger/mapping/evm/review + tests — AD-6 observation shape; adapterKind refuse; resolved at compute.
- [x] `TrackerPort` / `FixtureCursorPort` + `fixture-replay` + GET-only `backlog-http` scaffold; composition wiring for local/fixture.
- [x] Migration `0004` — `ticket`, `tracker_account`, `fixture_cursor`, `adapter_kind`, observation reshape; table-classes + policies/grants.
- [x] Upsert + cursor repos; tests for UNIQUE, upsert-only-from-observation, cursor isolation.
- [x] Five fixture scenarios (hours=`ec-phase2` + four new) in new shape; synthetic accounts.
- [x] CI whitelist gate rejects non-whitelist fields.
- [x] `sprint-status.yaml` — `epic-5` → `in-progress`; `5-1-…` → `in-progress` then `review`.
- [x] Verify `pnpm lint`, `typecheck`, `depcruise`, `test` (+ whitelist script) exit 0.

**Acceptance Criteria:**
- Given `TrackerPort.readScope`, when it returns, then shape matches epics Story 5.1 / AD-6 (including `accounts`, `adapterKind`).
- Given attributes, when carried, then `{ kind, id, label? }[]` with closed Backlog kinds — no Backlog-shaped arrays on the observation.
- Given status, when reported, then `statusId` only; no adapter `resolved`.
- Given storage, when tickets/accounts persist, then `ticket` UNIQUE holds and `tracker_account` upserts only from observations.
- Given `fixture-replay`, when it runs, then it reads `fixtures/backlog/<scenario>/NNNN.json` via `FixtureCursorPort` without DB imports in adapters.
- Given required scenarios, when recorded, then hours / no-hours / page-shift / leave-and-return / scope-change exist.
- Given CI, when fixtures are checked, then out-of-whitelist fields fail the gate.
- Given fixture tickets, when stored, then `tracker_kind = 'fixture'`.
- Given adapter kind, when a snapshot is recorded after a previous one, then mismatch refuses with an operator-alert error.
- Given HTTP adapter sources, when inspected, then no non-GET path exists.

## Implementation Notes

- Whitelist CI script: `pnpm fixtures:check-whitelist` → `scripts/check-fixture-whitelist.ts` (also wired in `.github/workflows/ci.yml`).
- Migration `0004_tracker_port_and_fixture.sql` hand-written (column reshape prompted drizzle-kit interactively); snapshot from `generateDrizzleJson`.
- Demo/seed Resolved set remains `Closed` via `DEFAULT_RESOLVED_STATUS_IDS` until `connector_setting_event`.
- Composition: `trackerPortOn({ cursor, timeAnchorIso })` in web + worker; selection uses `TRACKER_ADAPTER_OVERRIDE ?? connector.adapter`.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence / route |
|---------|---------|------------------|
| Multi-page fixtures `complete:true` on non-final pages | false | Time-series scenarios (ec-phase2, leave-and-return, scope-change) are successive full snapshots; only page-shift uses pagination incompleteness. |
| `loadFixtureSnapshots` defaults `complete ?? true` | false | Seed path treats each file as a full snapshot; intentional vs fixture-replay pagination. |
| Duplicated `trackerPortOn` in web/worker | low | Rejected — extract shared helper is more than a direct fix; both roots match today. |
| `trackerPortOn` has no call sites yet | false | Composition wiring is the 5.1 deliverable; caller jobs arrive in 5.4. |
| `adapterKind` undefined vs set throws | high | **patch** — refuse only when both sides are non-null (`ledger.ts`). |
| `loadBundleInTenant` omits accounts | false | Accounts live on `tracker_account` upserts, not SnapshotRead reconstruction. |
| Seed `onConflictDoNothing` skips refreshes | medium | **patch** — seed uses `onConflictDoUpdate` for ticket/account identity. |
| Whitelist ignores closed attribute kinds | medium | **patch** — checker requires `milestone\|category`. |
| `gen-fixtures` empty UNLINKED_ACCOUNT branch | low | Rejected — cosmetic dead branch; fixtures already synthetic. |
| backlog-http Bearer vs apiKey query | defer | Scaffold only; auth shape is 5.3. |
| `adapter_kind DEFAULT 'fixture'` silent | medium | **patch** — expand with default then `DROP DEFAULT`; schema has no default. |
| Past-end empty read reports no-hours | low | Rejected — callers stop on `complete`; not everyday path. |
| Cursor advances before successful parse | high | **patch** — parse/map tickets before `cursor.set`. |
| Page-shift page 2 under-tested | medium | **patch** — adapter test reads page 2 overlapping ids. |
| sprint `last_updated` moved backward | false | Corrected to 19:12 (JST) before review. |
| Path `..` in scenario name | medium | **patch** — refuse `..` / empty segments. |
| Invalid `timeAnchorIso` | medium | **patch** — `Date.parse` guard. |
| Non-array `tickets` | medium | **patch** — validate before mapping. |
| Negative fixture cursor | medium | **patch** — `RangeError` in `setFixtureCursor`. |
| Concurrent cursor races | defer | Needs compare-and-set under lock; worker writer is 5.5. |
| Missing accounts synthesis test | medium | **patch** — assert synthesized accounts. |
| Missing `observedAt` rebase assert | medium | **patch** — assert rebased instant. |
| Migration fold untested | defer | Needs live DB pre-0004 row; folder SQL reviewed; no REQUIRE_DB here. |
| New tables missing from UNREACHED list | high | **patch** — declared `ticket`, `tracker_account`, `fixture_cursor`. |
| backlog-http hang without timeout | defer | GET scaffold; timeout belongs with 5.3 live reads. |
| resolved=true non-Closed migration loss | maybe-false | Pre-prod demo data uses Closed; would need live DB probe to settle. |

## Design Notes

- **Cursor:** `fixture_cursor` keyed by `(tenant_id, connector_id)` holding next page index (or last filename); `FixtureCursorPort.get/set` only.
- **Observation storage:** prefer `attributes jsonb not null default '[]'` on `ticket_observation`; drop `resolved`/`category_ids`/`milestone_ids`; add `parent_issue_id`, `tracker_project_id`.
- **Demo continuity:** `buildDemoState` keeps rebasing `ec-phase2`; mapping rules continue matching Phase2 milestones via `attributes`.

## Verification

**Commands:**
- `pnpm lint` — exit 0
- `pnpm typecheck` — exit 0
- `pnpm depcruise` — exit 0
- `pnpm test` — exit 0
- Whitelist CI script (name chosen in Implementation Notes) — exit 0 on committed fixtures; fails on injected extra field
