---
review: adversarial
lens: 'Attack the spine as an adversary: construct two units one level down that each obey every AD to the letter yet still build incompatibly.'
target: ../ARCHITECTURE-SPINE.md
prd: ../../../prds/prd-momo-keikaku-2026-09-19/prd.md
date: '2026-09-20'
verdict: 'Sound paradigm, not yet build-safe. 12 holes; 4 are blockers for R0 (H1, H2, H3, H4).'
---

# Adversarial Review: momo-keikaku Architecture Spine

## Verdict

**Needs tightening before stories are cut.** The shape of the spine is right: a pure core, one writer of the ledger, attribution at query time, watermarked inputs and RLS. But several ADs name a mechanism without fixing the semantics that two independent teams would each have to pick. I built 12 pairs of units that each follow every AD word for word and still disagree. Four of them break headline promises: FR-35 reproducibility, FR-13 re-linking, the demo's Unplanned Work figure, and "manual wins" (FR-22).

Severity key:
- **Blocker:** R0 produces wrong numbers or can't reproduce a Published Snapshot.
- **High:** the units diverge silently and data has to be migrated to fix it.
- **Medium:** the divergence is visible and fixable locally.

---

## H1. Watermarks built on identity `seq` are not commit-ordered (Blocker)

**ADs involved:** AD-5 ("global monotonically increasing `seq bigint` (identity) used as a high-water mark"), AD-10 (`mapping_seq_max`, `ledger_seq_max`, and the other `*_seq_max` values in `ComputationInputs`).

- **Unit A, `app/review` (openReview / publish):** captures `mapping_seq_max = SELECT max(seq) FROM mapping_event` when the view opens, as AD-10 says.
- **Unit B, `app/mapping` (bulk remap):** inserts `mapping_event` rows inside a long `withTenant` transaction, as AD-5 says.
- **Collision:** Postgres assigns an identity value at INSERT time, not at COMMIT time. Suppose B gets seq 100 and is still open, the ingest transaction gets seq 101 and commits, and A captures max = 101. B then commits seq 100, which is ≤ 101. Recomputing the Published Snapshot now includes B's remap, even though the original computation never saw it. That breaks the FR-35 reproduction test and makes the Review's numbers shift under the PM. The same race exists between two Connectors of one Project ingesting concurrently (the singleton key is per Connector, not per Project), between `rate_entry` rows, and so on.
- **Fix (tighten AD-5/AD-10):** "Writes to any watermarked table take `pg_advisory_xact_lock(hash(tenant_id, project_id))` before allocating `seq`. `ComputationInputs` is captured under the same lock in shared mode. Alternatively, watermarks are per-project counters allocated inside that lock. A watermark is valid only if no lower `seq` can commit after it."

## H2. `resource_id` fixed at write time vs FR-13 re-linking (Blocker)

**ADs involved:** AD-7 (the ledger entry stores "`resource_id` (the link at write time, or null)"), AD-9 (a negative delta is costed at "the Resource and Rate of the Ticket's most recent positive entry"), AD-10 (no link watermark), AD-5 (the link table is in neither list).

- **Unit A, `domain/attribution`:** costs each entry at `entry.resource_id` and treats null as Unattributed at the Project default Rate. That is literally what AD-7 stored.
- **Unit B, `app/resources` (FR-13 linkTrackerAccount):** a PM links account `bk-123` to Resource R in week 6. Because the spine calls `tracker_account` ↔ `resource` "configuration", Unit B implements it as a mutable column (AD-5 allows this).
- **Collision:** weeks 1–5 stay Unattributed forever, because the entries are immutable and carry `resource_id = null`. A third unit (`app/rollup` or the export) sees that the entries are stale and joins the *current* link instead, so two views of the same period disagree. Neither choice is reproducible: the link has no `seq`, so a Published Snapshot can't record which link state it used. PRD FR-13 reads as though linking fixes attribution ("hours from an unlinked Tracker Account … are Unattributed"), which suggests query-time resolution. Nothing says who creates `tracker_account` rows either (ingest discovering assignees, or the PM).
- **Fix (new AD or tighten AD-7/AD-9):** "`tracker_account_link_event(tracker_account_id, resource_id|null, seq)` is append-only and owned by `app/resources`. Ingest upserts `tracker_account` identity from `assigneeAccountId`, and nothing else does. A ledger entry stores `assignee_account_id` only, and never `resource_id`. The Resource is resolved at query time as the link at `link_seq_max`, which joins `ComputationInputs`. The negative-delta rule resolves through the same function."

## H3. Fixture time vs Clock time: which Baseline is "active at `observedAt`" (Blocker for the demo; High in production)

**ADs involved:** AD-7 (`active_baseline_version_id` = "the version active at `observedAt`"), AD-15 (snapshot time is the adapter's `observedAt`, which in fixture replay "is the recorded time"; wall time comes from `Clock`), AD-17 (the seed creates a Baseline and a fixture Connector).

- **Unit A, `app/ingest`:** chooses the Baseline as `max(created_at) ≤ observedAt`, which is a faithful reading of "active at observedAt".
- **Unit B, `db/seed` + `app/baseline`:** stamps `baseline_version.created_at` from `Clock` (today) and follows AD-15 exactly.
- **Collision:** the fixtures were recorded weeks ago, so every fixture `observedAt` is earlier than the seeded Baseline. Every entry gets `active_baseline_version_id = null`, 100% of the hours become Unplanned Work, and the demo (Playwright "map → review") shows a red Unplanned indicator that no amount of mapping can clear. The same split affects "current Reporting Period": the web role uses `Clock`, so the fixture data sits in past periods. In production, an on-demand snapshot whose paged read spans a concurrent `rebaseline` lands on either side of the Baseline, depending on which of the two readings a unit chose.
- **Fix (tighten AD-7/AD-15):** "The active Baseline of an entry is the latest `baseline_version` committed before the ingest transaction's lock (H1), identified by `seq` and not by timestamp comparison. In fixture mode the `Clock` adapter is a virtual clock that is advanced to each fixture `observedAt`. The seed creates Baselines through the same clock."

## H4. Two writers of `mapping_event` race: rule evaluation silently overrides a manual Mapping (Blocker)

**ADs involved:** AD-9 (rules never touch a Ticket whose latest event is manual; `evaluateRules` runs in the ingest transaction and in the rule-edit use cases; only the `mapping` module appends), AD-7 (the ingest transaction).

- **Unit A, ingest step (e):** reads the latest events (none manual for Ticket T), evaluates the rules, and appends `rule → WP-7`.
- **Unit B, `mapping.mapManual` (web):** concurrently appends `manual → WP-3` for T and commits first.
- **Collision:** under READ COMMITTED, A's check ran before B committed, so A's rule event becomes the latest by `seq` (or not, per H1). "Manual wins" (FR-22) is violated, and the PM's Mapping disappears without an error. `updateRule` re-evaluation racing with ingest produces the same kind of interleaving, with two different rule sets.
- **Fix (tighten AD-9):** "Every `mapping_event` append, whether manual, rule, disposition or plan-deletion, runs under the per-Project lock from H1 and re-reads the Ticket's head inside the lock. Rule evaluation is skipped for any Ticket whose head is manual *at lock time*. A `mapping_head(ticket_id, event_seq, source)` row maintained in the same transaction is allowed as an index."

## H5. "Manual unmap" and WP deletion: is `wp_id = null, source = manual` sticky? (High)

**ADs involved:** AD-9 (latest event with `source = manual` is never touched by rules), AD-11 ("FR-5 deletion reassigns Mappings through `mapping_event`").

- **Unit A, `app/plan.deleteWp`:** follows FR-5 ("confirm that they become unmapped") and appends `wp_id = null, source = 'manual'` for each affected Ticket.
- **Unit B, `app/mapping` rule engine:** follows AD-9 and never re-evaluates those Tickets.
- **Collision:** after a WP is deleted, or after a PM unmaps a Ticket (FR-21), the Ticket is **permanently pinned to Unmapped**. FR-22 says "Deleting a rule: the Tickets it mapped are re-evaluated", which implies "unmapped" should normally mean "back to the rules". A different implementer writes `source = 'rule', wp_id = null` for the same action, so the two Tickets end up with incompatible semantics. Deleting a WP also has to disable the rules that target it (FR-5), but `mapping_rule` is mutable config with no link to that transaction. Which module owns that write?
- **Fix (tighten AD-9):** "`mapping_event.source` gains `release`: unmapping hands the Ticket back to the rules. `manual` with `wp_id = null` means 'pinned Unmapped' and is used only when the PM explicitly chooses it. `deleteWp` is a `plan` use case that calls `mapping.reassign(...)` and `mapping.disableRulesTargeting(wp)` in one transaction."

## H6. Mapping crosses Projects, and the mapped target can stop being a leaf (High)

**ADs involved:** AD-3 (composite FKs include only `tenant_id`), AD-7 (Ticket identity is unique per Tenant with one owning Connector), AD-9 (`mapping_event(ticket_id, wp_id)`), AD-13 (re-import).

- **Unit A, `mapping.mapManual`:** validates that the Ticket and the WP are in the Tenant. The composite FK `(tenant_id, wp_id)` passes.
- **Unit B, `app/import.confirmImport`:** a re-import adds children under a mapped leaf WP, which is valid per FR-11.
- **Collision:** nothing ties the WP's Project to the Project of the Ticket's owning Connector, so a Ticket can be mapped into another Project's plan and its AC leaks across Projects. That breaks FR-20's per-Connector sum and FR-33 totals. Separately, after the re-import the Ticket is mapped to a *summary* WP. `domain/attribution` assumes leaves (FR-21 "at most one leaf WP") and either drops the hours or double counts them through the summary roll-up.
- **Fix (tighten AD-3/AD-9/AD-11):** "`ticket.project_id` is derived from the owning Connector. `mapping_event` carries `project_id` with the composite FKs `(tenant_id, project_id, ticket_id)` and `(tenant_id, project_id, wp_id)`. The `plan` module refuses any change that turns a mapped leaf into a summary until its Mappings are reassigned. The import diff surfaces this as a conflict to resolve."

## H7. Fixture replay vs live adapter on the same Connector (High)

**ADs involved:** AD-6 (`connector.adapter` is `backlog | fixture | jira`; `TRACKER_ADAPTER_OVERRIDE=fixture` forces fixture replay everywhere outside production), AD-7 (Ticket identity is `(tracker_kind, tracker_site, tracker_issue_id)`; first sightings are deltas; idempotent on `(connector_id, observedAt)`).

- **Unit A, `fixture-replay`:** fixtures are recorded Backlog pages, so it emits `tracker_kind = 'backlog'` and the site from the recording.
- **Unit B, staging:** a `backlog` Connector runs with `TRACKER_ADAPTER_OVERRIDE` unset, after the same Connector already ingested under the override (or the override is toggled).
- **Collision:** the live read sees different ids, or the same ids with different hours. Every fixture Ticket goes `left_scope`, and every live Ticket is a "first sighting in a later snapshot", which AD-7 books as a **delta** and not an Opening Balance. The whole live history shows up as one false Period spike. Idempotency on `observedAt` also clashes with `pnpm fixtures:reset`: the replayed `observedAt` values are skipped as duplicates, so a reset has no effect without a DB reset. One implementer resets the DB and another doesn't.
- **Fix (tighten AD-6):** "The adapter kind in effect is recorded on each `tracker_snapshot`. `ingestSnapshot` refuses, with an operator alert, if it differs from the Connector's previous snapshot. Fixture Tickets use `tracker_kind = 'fixture'`. `fixtures:reset` also truncates that Connector's snapshot, ledger and ticket rows (dev-only maintenance role)."

## H8. A scope-change first sighting: Opening Balance or delta? (High)

**ADs involved:** AD-7 ("`opening_balance` … for a Ticket that entered scope through a recorded Connector scope change"), AD-6 (the `TicketObservation` whitelist has no creation time).

- **Unit A, `app/connector.changeScope` (web):** records the scope change and enqueues a snapshot.
- **Unit B, ingest:** the next snapshot contains unseen Tickets of two kinds: Tickets that entered through the scope change, and Tickets created in Backlog since the previous snapshot. The observation has no field that tells them apart.
- **Collision:** one implementer marks every first sighting in that snapshot as `opening_balance`, which hides real new hours from Period metrics (FR-42). Another marks only Tickets matching the "new" scope predicate, but a new Ticket matches that too. A third runs a scope-diff read, which AD-7's single `readScope` shape does not allow.
- **Fix (tighten AD-6/AD-7):** "Add `createdAt` to the `TicketObservation` whitelist. A first sighting in the first snapshot after a recorded scope change is an `opening_balance` iff `createdAt ≤ prev_snapshot.observedAt`, and a `delta` otherwise. The scope change and its snapshot are linked by `scope_change_id` on `tracker_snapshot`."

## H9. Ticket-Count Mode: basis flips and the undefined Period count of Unplanned Work (High)

**ADs involved:** AD-8 (the basis is stored per snapshot and is `hours` iff any observation has non-null `actualMh`), AD-7 (append a delta when `actualMh` changed).

- **Unit A, ingest:** treats `actualMh = null` as 0 when computing "changed". That is a defensible reading of "changed".
- **Unit B, `domain/evm`:** uses "the basis of each Connector's pinned snapshot" (AD-8).
- **Collision:**
  - (a) One Ticket gets hours filled in, so the Connector flips `count → hours`. Or the Backlog plan downgrades after 2027-01-01 (OQ-2) and hours disappear, so it flips `hours → count`. Unit A then writes negative deltas that zero out AC, and the Review switches metric families from week to week.
  - (b) FR-27 wants the Unplanned Work share *for the Reporting Period* as a count of Tickets. Count mode has no ledger entries, so there is nothing to put in a Period. One unit counts Tickets currently Unmapped in the pinned snapshot, and another counts Tickets whose status changed in the Period. They give different indicator colours.
- **Fix (tighten AD-8):** "A null `actualMh` never produces a ledger entry, and neither does a transition from a value to null. The basis is stored per Connector as `measurement_basis_event`, changes only after N consecutive snapshots agree, and is pinned in `ComputationInputs`. In count mode, the Period Unplanned count = Tickets first observed or Resolved inside the Period whose Mapping at `mapping_seq_max` is Unplanned. That is a single function in `domain/attribution`."

## H10. Disposition *Plan* and group Dispositions: ownership and stored shape (High)

**ADs involved:** AD-9 (only `mapping` appends `mapping_event`; a Disposition counts as manual), AD-11 (the `plan` module owns `work_package`), AD-13 (only `confirmImport` writes WPs *from a file*), AD-5 (`disposition_event` is append-only).

- **Unit A, `app/review.recordDisposition(Plan)`:** inserts a `work_package` directly. That is legal, because AD-13 only guards file imports. It then calls `mapping`.
- **Unit B, `app/plan.createWp`:** enforces leaf and parent rules, the audit action `wp.create` and Custom Field defaults. None of that runs for Unit A's WP.
- **Collision:** two WP creation paths with different invariants and audit actions. Also, `disposition_event` has no fixed shape:
  - One unit stores the group *criteria*, so Tickets that join later are covered, which violates FR-29.
  - Another stores the Ticket ids but not each Ticket's cumulative hours at disposition time. That makes "new hours since disposition" (FR-29, SM-7) impossible to compute reproducibly.
- **Fix (new AD):** "`recordDisposition` is the only Disposition writer. In one transaction it calls `plan.createWp` for *Plan* and `mapping.map` for *Map* or *Plan*. It appends one `disposition_event` whose `tickets[]` each carry `{ticket_id, ledger_seq_at, cum_mh_at}`. 'New hours since disposition' = the ledger sum with `seq > ledger_seq_at`, evaluated at the `ComputationInputs` watermark."

## H11. Snapshot compaction deletes the inputs that Published Snapshots pin (Medium, and R1 blocker)

**ADs involved:** AD-5 (`tracker_snapshot` is append-only "except FR-19 compaction"), AD-10 (`ComputationInputs` pins `tracker_snapshot_id` per Connector; estimates and Resolved come from that snapshot for Percent Complete), AD-7 (`prev_snapshot_id` on entries).

- **Unit A, the compaction job (Deferred):** keeps one snapshot per day after 90 days.
- **Unit B, `app/publish` reproduction test:** re-reads `ticket_observation` for the pinned snapshot.
- **Collision:** after 90 days, pinned intra-day snapshots are gone. EV (estimate basis, count basis) can't be recomputed, and FR-35 fails. The spine lists `tracker_snapshot` as append-only but not `ticket_observation`, which is where the EV inputs live.
- **Fix (tighten AD-5/AD-10):** "`ticket_observation` is append-only. Compaction never deletes a snapshot referenced by `published_snapshot.inputs`, `actuals_ledger_entry.prev_snapshot_id` or `snapshot_id`, or by an unexpired export. The Percent Complete input set is 'Tickets with a Mapping at `mapping_seq_max` *and* observed in the pinned snapshot'. Mapped Tickets that left scope are excluded and flagged."

## H12. Tenant resolution: Better Auth tables, the membership bridge and the system path (Medium)

**ADs involved:** AD-3 (every tenant-owned table uses RLS; the system path reads only non-tenant tables), AD-12 (`RequestContext` is resolved from the session).

- **Unit A, `apps/web` auth:** puts `tenant_member(user_id, tenant_id, role, project_ids)` under RLS because it has a `tenant_id`. It then can't read the table before `app.tenant_id` is known, so it resolves the Tenant through a new system-path query. AD-3 says the system path may read only the listed tables, so the implementer extends the list.
- **Unit B, the worker (FR-17 "bad credential" email, and FR-36 viewer mail in R1):** reads Better Auth `user.email` (not tenant-scoped) by `user_id`, taken from a tenant-scoped table inside `withTenant`.
- **Collision:** there are two ad-hoc ways across the RLS boundary and no rule for either. A user who belongs to two Tenants (common for Client Viewers in R1) has no defined "current Tenant". The `connector_schedule` table is "non-tenant", yet it refers to a tenant-owned `connector`, so AD-3's composite FK rule can't hold. Unit A's worker also trusts `tenantId` from the pg-boss job payload.
- **Fix (tighten AD-3/AD-12):** "Exactly one non-RLS bridge, `tenant_membership`, is read only by `resolveRequestContext` (`app/authz`). The session carries an explicit `activeTenantId`, which is validated against the bridge on every request. Better Auth tables are reached only through the `IdentityPort` and return `{userId, email, locale}` for user ids that the caller has already read under `withTenant`. `connector_schedule` and job payloads carry `tenant_id`, and handlers re-verify that the Connector exists under `withTenant(tenant_id)` before acting."

---

## Smaller seams (fix while editing)

- **Mutable inputs to Period and PV.** `project.tz`, `teireiWeekday` and Project-specific non-working days (FR-14) are mutable config, yet `periodOf` and PV depend on them. Changing the teirei day silently re-buckets past live Periods. Route them through `project_setting_event` and pin them via `setting_seq_max`. Say in AD-10 that the "calendar version" includes Project days.
- **Rate lookup date.** FR-12 says "the Rate in effect when the hour was recorded". The spine doesn't say whether `window_end` is converted to a date in UTC or in `project.tz`. Fix the rule: `effectiveDate = localDate(window_end, project.tz)`, computed in `domain/attribution` only.
- **Order of the Catch-all LOE split.** AD-9 says overflow is "split at LOE Baseline hours" but gives no order, and the money on each side depends on which entries fall under the cap. Fix the rule: cumulative by `(window_end, seq)` per Catch-all WP. The split entry is prorated, and each part is costed at its own entry's Rate.
- **Two filters for "which entries".** `ComputationInputs` has both a pinned `tracker_snapshot_id` per Connector and `ledger_seq_max`. State that entries are filtered by `snapshot_id ≤ pinned` per Connector, and that `ledger_seq_max` is only an assertion.
- **Connector ownership transfer.** AD-7 gives each Ticket one `owner_connector_id` but doesn't say what happens when the owner leaves scope or is deleted while a second Connector still sees the Ticket. Define it: ownership transfers only through a PM-confirmed `connector_overlap` resolution. The ledger stays on the Ticket, so no Opening Balance is written. Only `owner_connector_id` moves, as an audited event.

## Pairs I tried that the spine already blocks

- A second ledger writer (AD-7), rounding in two places (AD-4), a Client Viewer reading live computations (AD-12, with the type split), import commits that bypass preview (AD-13), and a rule overriding a manual Mapping in the *non-concurrent* case (AD-9). All of these hold.
