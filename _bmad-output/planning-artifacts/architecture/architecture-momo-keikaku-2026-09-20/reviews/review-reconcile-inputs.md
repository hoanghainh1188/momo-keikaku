---
type: review
lens: reconcile-inputs
target: ../ARCHITECTURE-SPINE.md
sources:
  - _bmad-output/planning-artifacts/prds/prd-momo-keikaku-2026-09-19/prd.md (1067 lines, read in full)
  - _bmad-output/planning-artifacts/prds/prd-momo-keikaku-2026-09-19/addendum.md
  - caller constraints: one-command local run with no external services; Backlog connector swappable for fixture replay; hours and Ticket-Count Mode; Japan-region hosting; EN/JA i18n; boring single-language TS stack for a solo dev
created: '2026-09-20'
---

# Reconcile review: Architecture Spine vs PRD + Addendum

## Verdict

**Needs amendment. Sound spine, not yet build-ready.** The paradigm, tenancy (AD-3), append-only ledgers (AD-5), single ledger writer (AD-7), query-time attribution (AD-9) and the `ComputationInputs` model (AD-10) land the PRD's core well. All six caller constraints are addressed at the topology level.

Three HIGH gaps would let independent builders produce Published Snapshots that cannot be reproduced (FR-35) or ledgers that disagree (FR-42). They should be fixed in the spine before stories are cut: G-1, G-2 and G-3. The MEDIUM gaps can be closed with one-line rules.

Severity: **HIGH** means builders will diverge, or a testable PRD consequence fails. **MEDIUM** means likely divergence or rework. **LOW** means ambiguity worth a sentence.

---

## HIGH

### G-1. Snapshot compaction breaks reproducibility and ledger foreign keys
- **Sources:** FR-19 (retention: compact snapshots older than 90 days to one per day), FR-35 (the reproduction test), FR-39 (export "each retained Tracker Snapshot"), FR-30 (EVM "as of any date").
- **Spine:** AD-5 lists `tracker_snapshot` as append-only, with the FR-19 compaction job as the only exception. `ticket_observation` is **not** on the append-only list. AD-7 has ledger entries reference `prev_snapshot_id`/`snapshot_id`. AD-10 pins `tracker_snapshot_id` per Connector in `ComputationInputs`. Deferred says only that compaction "must never touch `actuals_ledger_entry`".
- **Divergence:** a Published Snapshot pinned to an hourly snapshot from four months ago is compacted away. Percent Complete (estimates and resolved status come from the pinned snapshot's observations) can then no longer be recomputed, so the FR-35 reproduction test fails. Ledger FKs to deleted snapshots either block compaction or cascade. One builder deletes observations, and another keeps them.
- **Fix:** add `ticket_observation` to AD-5. Compaction deletes only snapshots that no `published_snapshot.inputs`, `actuals_ledger_entry.(prev_)snapshot_id` or open Review references. Put a "pinned" marker or reference check in the job. Add a test that compaction followed by recompute of every golden Published Snapshot is byte-identical.

### G-2. Mutable inputs to EVM and Health are not pinned in `ComputationInputs`
- **Sources:** FR-35 ("recomputing … reproduces every displayed figure exactly"), FR-24 (Catch-all flag), FR-30 (99% cap "until the PM marks the WP complete"), FR-31 (Milestone "past its Baseline date and not done"), FR-5 (actual finish on marking complete), Glossary "Resolved" (configurable per Connector), FR-21 (only leaf WPs are mappable).
- **Spine:** AD-5 declares `work_package` and `connector` mutable, mirrored to `audit_log` only. AD-10's `ComputationInputs` pins ledger, mapping, baseline, rate, override, setting and disposition seqs, but not: the Catch-all flag, the WP-complete mark, the milestone done date, WP leaf/summary structure or soft deletion, or the Connector's Resolved-status set. AD-6 has the adapter emit a pre-computed `resolved` boolean.
- **Divergence:** toggling Catch-all or un-marking a WP complete silently changes past Published Snapshots on recompute. It also changes past Periods' Unplanned Work in live views. Some builders will put these flags on `work_package`, some on `baseline_wp`, and some in events.
- **Fix:** move every compute-affecting WP attribute (`is_catch_all`, `completed_at`, `milestone_done_at`) into an append-only `wp_status_event` with `seq`, and add `wp_status_seq_max` to `ComputationInputs`. Persist `statusId` only in the observation, and resolve "Resolved" at compute time from a versioned `connector_setting_event` that is pinned by seq. State which attributes are captured in `baseline_wp` and which are live.

### G-3. Connector scope history is not modelled, so Opening Balance classification is ambiguous
- **Sources:** FR-42 (Opening Balance only on the first snapshot or on "enters scope because the PM changed the Connector's scope"), FR-20 ("If a Connector's scope changes, the Review shows the change, the Tickets that left scope, and their hours"), NFR-A1 (Connector scope changes), addendum A.2.
- **Spine:** AD-7 writes `opening_balance` for "a Ticket that entered scope through a recorded Connector scope change", but no scope-change record exists. `connector` is a mutable config table (AD-5), and scope does not appear in `ComputationInputs`.
- **Divergence:** on the first snapshot after a scope widening, a Ticket that was **created** since the last snapshot and matches the new scope could be an Opening Balance or a delta. Builders will pick differently, and period AC changes with the pick. The Review cannot show "the change" for a past Period.
- **Fix:** add an append-only `connector_scope_event(seq, connector_id, scope, at)`. Snapshots record the `scope_seq` they read under. Rule: a Ticket's first sighting is an `opening_balance` iff the snapshot is the Connector's first, **or** the Ticket's tracker `created` timestamp is before the scope event's time. That makes the tracker `created` field part of the FR-19 whitelist. The Review diffs scope by `scope_seq`.

---

## MEDIUM

### G-4. Tracker Account to Resource link history, and when Resource and Rate are resolved
- **Sources:** FR-13 (linking is a PM action that can happen later; Unattributed until linked), FR-25 ("the assignee at the later snapshot, and the linked Resource"), FR-12 ("valued at the Rate in effect when the hour was recorded"), FR-33 / UJ-5 (Department totals, *Unattributed* line).
- **Spine:** AD-7 freezes `resource_id` on the ledger entry at write time. AD-9 says attribution is computed at query time. There is no link-history table, and no rule for which date selects the Rate (`window_end`? in which time zone?).
- **Divergence:** when an account is linked after two weeks, one builder re-costs past hours at the Resource's Rate and home Department, and another leaves them Unattributed forever. The two give different money and Department totals.
- **Fix:** add an append-only `tracker_account_link_event` with seq pinned in `ComputationInputs`. Decide explicitly whether a late link is retroactive (recommended: yes for live views, pinned for Published Snapshots, as with Rates), and drop the frozen `resource_id` or rename it to `resource_id_at_write`. State that the Rate effective date is `window_end` converted to a date in `project.tz`. Also reconcile with FR-12's wording "adjusting entries are appended". The spine chooses bitemporal recompute instead, so record that as an explicit interpretation.

### G-5. The local demo clock disagrees with fixture time
- **Sources:** caller constraint (one-command local run with fixture replay), FR-19 (freshness always visible), FR-35 / UJ-3 (stale warning when the snapshot is more than 24h old), FR-28 (Review for the *current* Reporting Period).
- **Spine:** AD-15 uses the recorded `observedAt` from fixtures, while "now" comes from the real `Clock`. AD-7 makes ingest idempotent on `(connector_id, observedAt)`, and `pnpm fixtures:reset` resets only the cursor.
- **Divergence:** in the demo, every snapshot is weeks old. The freshness badge is permanently stale, the 24h warning always fires, the "current" Reporting Period is empty, and the business-hours schedule is keyed to real time. After `fixtures:reset`, replay is a no-op because the snapshots already exist. The fixture adapter keeping its cursor "in the DB" also puts DB access inside an outbound adapter, against the AD-1 direction.
- **Fix:** pick one of two rules. (a) The fixture adapter rebases the recorded times so the last page lands at seed time, with a `FIXTURE_TIME_ANCHOR`. (b) A `Clock` override (`CLOCK_FIXED_AT` or an offset) that the seed aligns to the fixture timeline, outside production only. Make `fixtures:reset` also reset the demo Tenant's snapshots and ledger (or document `pnpm db:reset`). Keep the cursor in a port-owned table accessed through `packages/db`.

### G-6. Measurement basis can flip between snapshots, and null and 0 are not distinguished
- **Sources:** FR-17 (hours "absent, or empty on every Ticket" means Ticket-Count Mode), FR-27, OQ-2 (re-detect after 2027-01-01, when plans change), addendum A.2.
- **Spine:** AD-8 sets the basis per snapshot: `hours` iff any observation has a non-null `actualMh`. It says nothing about hysteresis or what happens to the ledger on a flip.
- **Divergence:** one engineer logging 0.5h on one Ticket flips the whole Connector to `hours`. The next snapshot where that Ticket has left scope flips it back. Health colours oscillate, and Published Snapshots of adjacent weeks switch units. Builders will also differ on whether `null → 2.0h` is a delta of +2h and whether `2.0h → null` is −2h.
- **Fix:** treat `null` as 0 for ledger deltas (write a rule), and never emit a negative delta for `value → null` (record it as a "hours cleared" observation flag instead). Set the Connector's effective basis by a stable rule, for example switching to `hours` only after N consecutive snapshots, or on a PM confirmation, and record it as a `connector_setting_event` pinned in `ComputationInputs`.

### G-7. The i18n catalog is unreachable from the worker, and R0 needs email
- **Sources:** FR-17 (a bad credential triggers email "within one snapshot interval", which is **R0**), FR-4 / FR-36 / FR-35 (client emails in EN and JA, sent from worker-side events in R1), NFR-I1 (all text externalised).
- **Spine:** the i18n convention puts all text in `apps/web/messages/{en,ja}.json`, but AD-1 forbids importing `apps/*`, and the worker sends these emails. AD-18 provisions SES "for R1 mail" only, while R0 production has no real mailer. The user's preferred locale is in `RequestContext`, but no persisted `user.locale` is named for emails sent outside a request.
- **Fix:** move message catalogs to `packages/i18n` (or `packages/app/messages`), imported by web and worker. Wire `mailer-ses` in R0 production for Connector-error mail. Persist `user.locale` and resolve email language from it.

### G-8. Real client data is headed into the repo
- **Sources:** NFR-S6 (Tracker Account names and offshore hours are personal data under APPI and Decree 13/2023, and only FR-19 fields may be stored), NFR-S4 (Japan-region residency), FR-9 (acceptance corpus of 10 real client WBS files), spine Open Questions ("fixture scenarios should be re-recorded from the real spaces").
- **Spine:** `fixtures/backlog/<scenario>/NNNN.json` is committed in the Structural Seed, with no anonymisation rule, and the location of the FR-9 corpus is not specified.
- **Divergence:** recorded Get Issue List pages contain titles, assignee names and possibly descriptions (the raw API response is wider than the FR-19 whitelist). They end up in git and in CI outside Japan.
- **Fix:** add a rule that committed fixtures are synthetic or pass through a `fixtures:record --anonymise` step that keeps only FR-19 fields and pseudonymises names and titles. Keep the real WBS acceptance corpus outside the repo, in a Japan-region, access-controlled bucket or a local-only path, and run it with a local test tag.

---

## Further gaps (LOW–MEDIUM)

| # | PRD / constraint | Spine state | Suggested fix |
|---|---|---|---|
| G-9 | FR-31: thresholds are "configurable **per Tenant**" | AD-5 puts thresholds in `project_setting_event` (per Project) | Add a Tenant-level default event plus an optional Project override, both pinned in `setting_seq_max`, or record per-Project as a deliberate deviation |
| G-10 | FR-24: Catch-all AC counts "only up to its Baseline hours", and the excess is Unplanned | AD-9 says "split at LOE Baseline hours" with no ordering | Define the overflow as cumulative in ledger `seq` order against the Baseline hours of each entry's `active_baseline_version_id`. Assign negative deltas LIFO from the overflow. Add golden tests |
| G-11 | FR-29: "new hours since disposition" flag; a group Disposition covers members *at record time*; SM-7 | `disposition_event` has no stated payload | The event stores the explicit `ticket_ids[]` and `ledger_seq_at`. "Not yet dispositioned" = entries with `seq > ledger_seq_at` |
| G-12 | FR-22 "manual wins" and live rules, under concurrency | Ingest tx (worker) and rule/manual-mapping use cases (web) both append `mapping_event` | Take a per-Project advisory lock (`pg_advisory_xact_lock(project)`) in every `mapping` write path, including ingest |
| G-13 | NFR-D1 / NFR-S6: delete Tenant data within 30 days | AD-5 triggers block DELETE, with an exception only for compaction | Add a second exception: a `tenant_purge` maintenance role and job (R1 per Deferred, but the trigger design must allow it now) |
| G-14 | FR-2 / FR-3: a Client Viewer may be invited by more than one Tenant; revocation takes effect on the next request | Better Auth sessions are in Postgres, and the user/tenant model is unspecified | A global `user` plus a `tenant_membership(tenant_id, user_id, role)` under RLS. `RequestContext` picks the active Tenant. Disable the session cookie cache so revocation and idle expiry (8h, configurable) are checked on every request |
| G-15 | FR-18 / FR-22: Jira rule attributes (label, component, fix version, epic) | `TicketObservation` is Backlog-shaped (`milestoneIds`, `categoryIds`) | Generalise it to `attributes: Record<AttrKind, string[]>` so Post-Q1 Jira does not force a ledger or rule schema change (AD-6's stated purpose) |
| G-16 | FR-17: client-side approval recorded "before the first Tracker Snapshot" | Not gated | `ingestSnapshot` refuses a Connector with no `approval_recorded_at` when the space is client-owned |
| G-17 | AD-4 integer rule vs FR-30 linear PV spread, BAC equal split across Resources, and per-entry Rate | Only `present` rounds, but PV per day and splits are fractional | State an internal rule: use rational arithmetic, or milli-hours with a documented remainder allocation (largest remainder) inside `domain`, so golden tests are unambiguous |
| G-18 | NFR-R1: 99% succeed "or are retried successfully within one interval" | No retry policy | pg-boss `retryLimit`/`retryDelay` sized to finish inside the interval (for example 3 retries with backoff under 45 min), and a failed-attempt row visible to the PM |
| G-19 | FR-42: a left-scope Ticket re-enters scope, or ownership passes to the overlapping Connector | Silent | Define re-entry (resume deltas from the last observed value, no Opening Balance) and ownership transfer (only after the owner's complete read marks the Ticket `left_scope`) |
| G-20 | FR-14 / FR-30: PV depends on the Holiday Calendar, which the PM can edit | `ComputationInputs` pins the calendar id and version, but versioning is not modelled | Make Project non-working days an append-only event (seq pinned). Say whether PV uses the calendar at Baseline time (recommended: copy it into `baseline_version`) |

## Constraints check (caller)

| Constraint | Landed? | Note |
|---|---|---|
| One-command local run, no external services | Mostly (AD-17) | Needs Docker for Postgres. Demo time coherence is G-5 |
| Backlog swappable for fixture replay | Yes (AD-6) | Observation shape is Backlog-biased (G-15). Cursor placement violates AD-1 (G-5) |
| Hours and Ticket-Count Mode | Yes (AD-8) | Basis flip and null semantics are open (G-6) |
| Japan-region hosting | Yes (AD-18) | Repo fixtures and corpus leak path (G-8). Third-party logging and error SaaS not explicitly banned; add to AD-18 |
| EN/JA i18n | Partly | Catalog location blocks worker email (G-7) |
| Boring single-language TS stack | Yes | Stack versions were not verified in this review |
