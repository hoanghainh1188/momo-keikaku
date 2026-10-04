# Epic 5 Context: The work actually done arrives from Backlog and lands on the plan

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

A PM connects a Project to a Backlog space read-only, records client-side approval, and an always-on snapshot service builds an append-only Actuals Ledger from snapshot deltas — with pre-existing hours booked as Opening Balances so mid-flight projects show no false spike. Tracker Accounts link to Resources (retroactively), Tickets map to leaf WPs by hand or by priority-ordered rules, Catch-all WPs and per-Connector coverage are visible, every in-scope Ticket is mapped or reported unmapped, and a space with no hours runs honestly in Ticket-Count Mode. This is UJ-2: actual work lands on the plan without moving any schedule date.

## Stories

- Story 5.1: One port to every tracker, and a fixture that replays like one
- Story 5.2: Connect a Backlog space, read-only
- Story 5.3: A paginated read is complete, or it is not a read
- Story 5.4: Snapshots run on a schedule the PM can see
- Story 5.5: One writer builds the Actuals Ledger
- Story 5.6: The ledger stays correct as Tickets appear, move and vanish
- Story 5.7: A Connector with no hours says so, and stays saying it
- Story 5.8: Tracker Accounts become people, retroactively
- Story 5.9: Map a Ticket to a Work Package, and never move the plan
- Story 5.10: Rules keep new Tickets mapped, and still never move the plan
- Story 5.11: Coverage, per Connector, in Tickets and in hours
- Story 5.12: Catch-all Work Packages, counted once
- Story 5.13: Nothing in scope is silently excluded
- Story 5.14: Approximate figures say they are approximate
- Story 5.15: The Ticket half of the load fixture

## Requirements & Constraints

- **Read-only Connectors.** GET only; client approval required before first snapshot; credentials encrypted (AES-256-GCM + `key_id`; KMS in prod), write-only after entry, never logged; rotation keeps Mappings; failures notify in-app and by email within one interval with figures frozen at the last good snapshot.
- **Whitelist only.** Persist id, key, title, status, estimate, actual hours, assignee, mapping attributes — never descriptions/comments. Fixtures synthetic or anonymised; CI rejects out-of-whitelist fields.
- **Completeness or nothing.** Complete only when page-union size equals before/after Count Issues with no duplicate ids. Incomplete → retry once, write nothing, surface failure. R0 full-scope every snapshot; incremental reads may never mark `left_scope`.
- **Ledger honesty.** Opening Balances count in cumulative AC, excluded from Period metrics, reported per Connector. `left_scope` needs two consecutive complete absences; history kept, hours not reversed. Overlaps → `connector_overlap`, not double entries; ownership moves only via PM-confirmed event. Per Ticket: Σ deltas = last observed actual hours.
- **Ticket-Count Mode.** Basis latched per Connector with 3-snapshot hysteresis; never from plan name. Metrics return `value` or `unavailable` — never render as 0. Hours and counts never summed; mixed Projects label AC coverage to hours Connectors only.
- **Attribution without plan motion.** Map/remap/rules change attribution, Unplanned Work and EVM only — never write actual dates or recalculate. Leaf WPs only. Four mutually exclusive Period buckets (mapped baselined, mapped non-baselined, Catch-all, Unmapped) sum to in-scope hours excluding Opening Balances. Catch-all with Baseline hours is LOE up to the cap; overflow is Unplanned once. Person/day views carry a non-dismissible approximate notice; no person-level actuals in Client Views; no ranking people by Unplanned Work.
- **Perf / retention.** 2,000-Ticket snapshot ≤ 5 min; Review ≤ 2 s p75 / 4 s p95. Compaction deletes only `ticket_observation` (never snapshot headers or the ledger).

## Technical Decisions

- **`TrackerPort` (AD-6).** `readScope` → `{ complete, observedAt, tickets, accounts, hoursFieldPresent, rateLimit, adapterKind }`. Closed per-Tracker `attributes` kinds; adapters report `statusId` only — Resolved is Connector config at compute time. Adapters: `backlog-http`, `fixture-replay` (via `FixtureCursorPort`), `jira-cloud` later. Adapter kind recorded per snapshot; kind changes refused. Fixture Tickets use `tracker_kind = 'fixture'`. Backlog: `sort=created&order=asc` + id tiebreak; Search-bucket >25% of interval → refuse or slow schedule.
- **Single ingest writer (AD-7).** Only `ingestSnapshot` inserts snapshot/observation/ledger rows. Read outside the transaction; one locked transaction upserts identity, appends deltas, marks `left_scope`, re-evaluates rules — idempotent on `(connector_id, observedAt)`. Entry kinds `opening_balance | delta`; null hours never move the ledger. Resource resolved at query time from link events. `active_baseline_version_id` = latest Baseline by `seq` before the lock, never by timestamp. Queue: `stately` + `singletonKey = connectorId`.
- **Basis & attribution (AD-8, AD-9).** `measurement_basis_event` pinned as `basis_seq_max`. `mapping_event` is the only Mapping store; `mapping_head` is a derived index; manual/disposition win under the per-Project lock. Rules: pure `evaluateRules` over attributes, unique priorities, append on change only. Catch-all overflow: cumulative LIFO/prorate against each entry's Baseline hours. `domain/schedule` must not import `domain/attribution` — Story 2.9's reachability test holds this as modules grow.
- **Tables this epic creates.** `ticket`, `tracker_account`, `project_setting_event`, `wp_flag_event`, `tracker_account_link_event`, `connector_scope_event`, `connector_setting_event`, `measurement_basis_event`, `connector_ownership_event`, plus derived `mapping_head` and `connector_overlap`.

## UX & Interaction Patterns

- **Surfaces.** Connectors and Mapping (Tickets / Rules / Coverage) under the Actuals sidebar group; Review empty states and the top-bar snapshot pin deep-link here.
- **Snapshot pin.** Age always visible, live each minute; popover has time, Connectors, next run, *Refresh now*. Newer than a Review pin → "Newer snapshot available — Re-pin", never a silent figure change.
- **Mapping.** Drag Tickets onto leaf WPs is the only R0 drag-and-drop, with keyboard Map equivalent. Rule edit shows a live move preview (Save disabled until loaded); reorder by drag handle or `Alt+↑/↓`.
- **Coverage & honesty.** Scope Ledger Bar segments filter the list; hours/Ticket share toggle; every chart has a table. Ticket-Count Mode and approximate notices are persistent captions, not zeros. Opening Balances, left-scope, overlap, and connector errors use the named experience-spine phrases.

## Cross-Story Dependencies

- **Port → ingest → ledger → attribution.** 5.1 and 5.3 unblock 5.2/5.4 and 5.5–5.6; 5.7–5.8 feed query-time attribution for 5.9–5.13.
- **Plan-motion invariant.** 5.9–5.13 must preserve Story 2.9's fence: no path from Tracker evidence to schedule writes.
- **Downstream.** Epic 6 pins per-Connector snapshots and consumes the four buckets, Opening Balances, left-scope, Ticket-Count Mode, and approximate labelling; 5.15 sizes the NFR-P1 fixture. Epic 3 is not a blocker; Epic 4 Baselines supply `active_baseline_version_id` and Catch-all Baseline hours when present.
