---
reviews: ARCHITECTURE-SPINE.md (momo-keikaku, 2026-09-20)
against: prd.md (prd-momo-keikaku-2026-09-19, final)
lens: good-spine rubric (divergence points, enforceable rules, safe deferrals, verified tech, spec coverage, operational envelope, internal consistency)
date: 2026-09-20
verdict: pass-with-fixes
---

# Rubric Review: Architecture Spine for momo-keikaku

## Verdict

This is a strong spine. The paradigm is right, and most ADs have a real Binds/Prevents/Rule with a mechanical enforcement hook. Two gaps break the invariant the spine is built around: Published Snapshots must be reproducible and the Review must stay pinned (FR-35, AD-10). The first gap is that `seq` high-water marks do not follow commit order. The second is that several EVM inputs live in mutable tables and are not in `ComputationInputs`. Two further gaps cause Actuals Ledger corruption: snapshot compaction and paginated full reads. The operational envelope beyond topology is thin: production migrations, alerting, R0 mail and restore are not decided. Fix the Critical and High items before epics are cut.

## Scorecard

| Criterion | Result | Notes |
| --- | --- | --- |
| Fixes the real divergence points, misses none | Partial | The core points are covered: tenancy, units, append-only data, ledger ownership, attribution, reproducibility, roles and imports. Missed: commit-ordered watermarks (C1), mutable EVM inputs (C2), classification of every table (M4), Tenant-vs-Project settings scope (M1), and a number representation for stored outputs (M2). |
| Every Rule is enforceable and prevents its divergence | Mostly | AD-3, AD-5, AD-6, AD-12 and AD-14 have mechanical checks. AD-10's Rule does not achieve its Prevents under concurrency (C1). AD-7's `complete` cannot be guaranteed by offset paging (H2). AD-1's clock ban needs ESLint, because dependency-cruiser cannot see calls (L3). |
| Nothing under Deferred can let units diverge | Fail | Deferring compaction details can break FK integrity, reproduction and FR-39 (H1). Deferring the deploy pipeline hides the production migration rule (H3). Deferring incremental reads needs one guard rule now (L6). |
| Named tech is verified current | Pass | Checked against the npm registry, nodejs.org and Docker Hub on 2026-09-20. See the Stack Verification section. |
| Covers the driving spec's capabilities | Mostly | Gaps: FR-31 threshold scope (M1), R0 email obligations in FR-3 and FR-17 (H3), how the FR-19 compaction interacts with FR-35 and FR-39 (H1), NFR-D1 deletion against AD-5 (H1), and NFR-U1, which is claimed in `binds` but not governed (L5). |
| Operational envelope decided, deferred or open | Partial | Topology, region, backup retention, environments and the local run are decided. Not decided or listed: migrations in production, alerting destination and paging, the restore procedure, the R0 mailer, blob lifecycle, key rotation and log destination (H3). |
| Internal consistency | Issues | Compaction against append-only data and its FKs (H1). Tenant purge against "only exception" (H1). Review pinning against the immediate effect of Dispositions (H4). Better Auth's Drizzle adapter against AD-1 (M4). Per-Tenant thresholds (PRD) against `project_setting_event` (M1). |
| Seed minimal; decisions, not rationale | Pass | The seed is lean. AD-17's fixture specifics are justified by the demo requirement. |

## Findings

### Critical

#### C1. `seq` high-water marks do not follow commit order, so pinned inputs are not reproducible (AD-5, AD-10)

- **Problem:** AD-5 gives each append-only table an identity `seq` "used as a high-water mark". AD-10 pins `ledger_seq_max`, `mapping_seq_max` and the other `*_seq_max` values. Postgres assigns identity values when a row is inserted, not when its transaction commits.
- **Scenario:**
  1. The ingest transaction for Connector A is long: about 2,000 observations, ledger rows and rule-driven `mapping_event` rows (AD-7).
  2. It takes `seq` 1000–1400 and is still open.
  3. The Review opens, or a publish happens, and captures `ledger_seq_max = 1450` from rows that other transactions have already committed.
  4. Connector A's transaction then commits rows with `seq` < 1450.
- **Consequences:**
  - Recomputing from the stored inputs now includes rows that were invisible when the figures were computed, so the FR-35 reproduction test fails.
  - A Review "pinned" at open (AD-10) shifts while the PM reads it.
  - The same race exists between web-side mapping edits and worker rule re-evaluation, and between two Connectors ingesting in parallel. AD-7 only makes snapshots singleton per Connector, not per Tenant.
- **Fix:** Add a rule to AD-5 and AD-10:
  - Select ledger rows by the pinned `snapshot_id` per Connector, not by `ledger_seq_max`, and drop `ledger_seq_max` from the inputs. This also removes its redundancy with the pinned snapshots.
  - For the other event tables, choose one of these:
    - (a) serialise appends per Project with `pg_advisory_xact_lock(hashtext(project_id))`, taken in every use case that appends, so that `seq` order equals commit order within a Project; or
    - (b) compute a safe watermark as the largest `seq` below the lowest `seq` still in flight, for example by tracking `pg_current_xact_id()` or `xmin` per row and comparing against `pg_snapshot_xmin(pg_current_snapshot())`.
  - Add a concurrency test: run two ingests and a mapping edit concurrently, publish, then recompute and compare.

#### C2. EVM inputs live in mutable tables that `ComputationInputs` does not capture (AD-5, AD-10, AD-11)

- **Problem:** AD-10 promises that every figure is `compute(inputs, formulaVersion)`. Several inputs are current-state columns on mutable tables (AD-5 lists `work_package` and configuration tables as mutable) and are not in `ComputationInputs`:
  - **WP "marked complete":** lifts the 99% cap and sets the actual finish (FR-30, FR-5).
  - **Milestone done date:** drives the Schedule amber rule in FR-31.
  - **Catch-all flag:** drives LOE and overflow in AD-9. AD-11 does not copy it into `baseline_wp` either.
  - **Tracker Account → Resource links:** FR-13 costing and Unattributed hours. AD-7 freezes `resource_id` at write time, so a later link either never fixes old entries (which contradicts UJ-5's intent) or, if it is resolved live, breaks reproduction. The spine picks neither option explicitly.
  - **Project default Rate:** `rate_entry` is keyed by `resource_id` only. The default Rate has no bitemporal home, yet FR-12 and FR-39 require its history.
  - **Visibility Policy:** FR-35 says to store the policy used. The inputs list omits it.
  - **Project-specific non-working days:** the inputs carry "calendar id and version", but no rule makes the calendar versioned or append-only.
- **Consequences:** A PM unticks "complete", or flips Catch-all, after publishing. Recomputation then differs from the stored figures, and the Review shifts under the PM.
- **Fix:**
  - Add an append-only event table with `seq` for each of the following, and add each `*_seq_max` to `ComputationInputs`:
    - `wp_status_event` (complete, milestone done);
    - `wp_flag_event` (Catch-all), or include the Catch-all flag in `baseline_wp`;
    - `tracker_account_link_event`;
    - `project_default_rate_entry`, or generalise `rate_entry` to cover it;
    - `calendar_day_event`.
  - Store the Visibility Policy value in `published_snapshot.inputs`.
  - State in AD-10: "any column read by `domain/evm`, `domain/health` or `domain/attribution` must come from an append-only source that `ComputationInputs` pins." A lint or test can check this against the domain function signatures.
  - Decide how links attribute Resources: at query time, via the link-event history pinned by seq (recommended, because it matches UJ-5).

### High

#### H1. Snapshot compaction and Tenant deletion contradict AD-5, and compaction breaks FKs, reproduction and FR-39

- **Problem:** AD-5 lists `tracker_snapshot` as insert-only with one exception, "the FR-19 compaction job". But:
  - `actuals_ledger_entry.prev_snapshot_id` and `snapshot_id` reference `tracker_snapshot`. Almost every hourly snapshot has ledger entries, so reducing snapshots to one per day either violates FKs or cannot happen.
  - `published_snapshot.inputs` pins a `tracker_snapshot_id`, and Percent Complete reads estimates and resolved state from that snapshot's `ticket_observation` rows (FR-30). If compaction deletes them, reproduction fails.
  - The Deferred note only protects `actuals_ledger_entry`.
  - NFR-D1 and NFR-S6 require Tenant deletion within 30 days. AD-5 names compaction as the only exception, so there is no sanctioned purge path for append-only tables. FORCE RLS and the triggers block it.
- **Fix:** Amend AD-5 with these rules:
  - Compaction deletes only `ticket_observation` rows. It never deletes `tracker_snapshot` header rows.
  - Compaction keeps every observation set that is referenced by a `published_snapshot`, by the first snapshot of a Reporting Period, or by the latest snapshot.
  - FR-39 exports only the snapshots that are retained.
  - A `maintenance` role (with the trigger bypass set by a session GUC checked in the trigger) is the only principal allowed to run (a) compaction and (b) `purgeTenant`. Both are audited in a non-tenant `operator_audit` table.
  - Move "compaction policy details" out of Deferred, or keep only the day-granularity schedule there.

#### H2. A paginated full read cannot guarantee `complete`, and re-entry after `left_scope` double-counts (AD-7)

- **Problem:** R0 reads the full scope as about 20 Get Issue List pages using `offset`. Tickets updated during the read move between pages under the default `updated` sort. Some are skipped and some are duplicated, yet the read still reports `complete: true`.
- **Consequences:**
  - A skipped Ticket is marked `left_scope`.
  - On the next read it reappears. AD-7 does not say how re-entry is costed, so an implementation could treat it as a "first sighting delta from 0" and count all its hours again. That violates the FR-42 invariant.
- **Fix:**
  - Make `backlog-http` sort by a stable key (`sort=created&order=asc`, with the id as tiebreak).
  - Call Count Issues before and after the read. Mark the read `complete` only if the distinct ids read equal both counts, with no duplicates.
  - Require a Ticket to be absent from two consecutive complete reads before it is marked `left_scope`.
  - State that re-entry of a known Ticket is a `delta` from its last observed `actualMh`, never from 0, and never an `opening_balance` unless a recorded scope change caused the re-entry.
  - Add fixture scenarios for "page shift" and "leave and return".

#### H3. The operational envelope beyond topology is not decided (AD-17, AD-18, Deferred)

- **Migrations in production:** not decided, and not listed as deferred or open. Decide:
  - who runs them: a one-off ECS task before the services roll, using a `migrator` role that owns the tables and re-applies `rls.sql` and `grants.sql`;
  - an expand/contract rule, because during a rolling deploy the old and new `web`/`worker` versions run against one schema;
  - how pg-boss's own schema upgrades are sequenced;
  - how migrations interact with the append-only triggers, since backfills run through the `maintenance` path.
- **Monitoring and alerting:** AD-7 "raises an operator alert" and NFR-O1/NFR-R1 need snapshot success rates, but the spine names no destination for logs or alerts. Decide:
  - logs go to CloudWatch Logs in `ap-northeast-1`;
  - alarms on snapshot failure rate, the invariant violation, worker heartbeat and RDS storage and CPU go through SNS to email;
  - an external uptime check on the ALB.
  Log and metric data must stay in Japan (NFR-S4), so no US SaaS APM unless that is disclosed.
- **Mail in R0:** AD-18 scopes SES to "R1 mail". But R0 needs mail:
  - FR-17 requires emailing the PM about bad credentials within one snapshot interval;
  - email/password sign-in (FR-3) needs password-reset mail.
  Move `MailerPort` → SES (Tokyo) into R0 and keep only the client-facing sender domain in R1.
- **Backups and restore:** RDS retention is decided. The restore procedure (PITR into a new instance, then cut over) and the restore test before R1 (NFR-R2) are not listed. S3 blob lifecycle is not decided either: uploaded workbooks are customer data that must follow NFR-D1 deletion and in-region retention. Add S3 versioning off, a lifecycle rule deleting blobs after N days, and no cross-region replication.
- **Secrets:** `CREDENTIALS_KEY` has no rotation rule. Store a `key_id` with each ciphertext and allow re-encryption; prefer KMS envelope encryption.
- **Placement:** add these as AD-19 "Operations", with Rules, or at minimum list each one explicitly under Deferred or Open Questions.

#### H4. Pinning the Review at open conflicts with Dispositions taking effect immediately (AD-10, FR-29, UJ-3)

- **Problem:** AD-10 computes the Review from `ComputationInputs` captured once when the view opens. UJ-3 and FR-29 require a *Map* Disposition made inside the Review to move hours out of Unplanned Work immediately ("Unplanned Work drops to 38h"). A frozen `mapping_seq_max` hides the PM's own change.
- **Consequences:** One team implements "frozen" and another implements "live", and they diverge.
- **Fix:** Split the pin:
  - Tracker-side inputs stay pinned for the life of the Review: snapshot ids per Connector and the ledger.
  - PM-authored event watermarks (mapping, disposition, override, settings) advance on each successful write by this PM in this Review, by re-capturing after the write.
  - Publish always captures fresh inputs and shows a diff if anything moved.
  - State this in AD-10.

### Medium

#### M1. Health thresholds are per-Tenant in the PRD but per-Project in the spine

FR-31 says the thresholds are "configurable per Tenant". AD-5 and AD-10 put them in `project_setting_event`. Pick one scope. The recommendation is Tenant defaults plus optional Project overrides, both event-sourced and both pinned.

#### M2. No representation is fixed for non-integer outputs or for bigint in JSON

AD-4 makes milli-hours and yen `bigint` and rounds ratios "only in present". It does not say:
- how an unrounded ratio is represented (float, rational or decimal string);
- whether Health thresholds compare the exact value or the rounded one (0.9496 against 0.95);
- how `bigint` goes into `jsonb` (`JSON.stringify` throws on `bigint`).

Two modules will pick differently, and exact comparison in the reproduction test fails. Fix:
- Ratios are `{num: bigint, den: bigint}` in domain.
- Threshold comparisons use exact cross-multiplication.
- Stored outputs serialise `bigint` as decimal strings, through one codec in `packages/domain/present`.

#### M3. `TicketObservation` is Backlog-shaped, which works against AD-6's Prevents

- `milestoneIds[]` and `categoryIds[]` have no place for Jira labels, components or fix versions (FR-22).
- The observation also drops the assignee's display name and email, which FR-13 link suggestion needs. No Tracker Account table is specified to hold them.

Fix: replace the two arrays with `attributes: { kind: string; id: string; label?: string }[]` using a closed `kind` enum per Tracker. Add an `accounts` side channel to `readScope` that upserts `tracker_account(account_id, display_name, email?)`.

#### M4. Not every table is classified, and Better Auth violates AD-1

AD-5 classifies some tables as append-only or mutable, but these are unclassified:
- `ticket` (upserted), `ticket_observation`, `connector_overlap`, `import_draft`;
- the fixture cursor and the pg-boss tables;
- auth `user`, `session` and `membership`;
- `tracker_account`, `resource`, `risk`;
- the Client View open log and notification opt-outs.

Auth tables must be global (non-RLS), because the session is resolved before a Tenant is known, but AD-3 does not say so. Better Auth's Drizzle adapter writes from `apps/web` directly, which contradicts AD-1 ("never repositories or Drizzle directly").

Fix:
- Add a table-class registry (`append_only | mutable_audited | global | operational`) as a single source that the RLS, grants and trigger SQL are generated from.
- Carve out `packages/db/auth` as the one sanctioned Better Auth binding.
- Route role and revocation changes through `app` use cases so AD-14 still holds.

#### M5. Measurement basis can flip between snapshots (AD-8)

"`hours` iff at least one non-null `actualMh`" is evaluated per snapshot. Early in a Project, or in a sparsely logged space, the basis can flip between weeks, and Project metrics then switch modes. Fix: latch the basis per Connector as a recorded `connector_basis_event`. Use `hoursFieldPresent` together with any non-null value to switch to `hours`, and switch back to `count` only by explicit PM action or after N consecutive complete snapshots with no hours field.

#### M6. Ordering and scope-change sources are left implicit (AD-7, AD-9)

- Catch-all overflow "split at LOE Baseline hours" depends on the order of entries once negative deltas and remaps are involved. Fix the order as (`window_end`, `seq`).
- AD-7's "recorded Connector scope change" has no store. `connector` is mutable, so ingest cannot tell whether a new Ticket arrived through a scope change. Add an append-only `connector_scope_event`, and pin it for FR-20 reporting.

#### M7. The fixture demo clock can disagree with fixture time (AD-15, AD-17)

Fixture `observedAt` is recorded time, but the web `Clock` is wall time. The "current Reporting Period" and the 24-hour stale warning will then disagree with the data in the demo. Fix: in fixture mode, have `Clock` return `max(latest fixture observedAt, pinned demo instant)` (`CLOCK_MODE=fixture`), and use it in both roles.

### Low

- **L1. Node 24 status.** Node 24.21.0 "Krypton" is correct and LTS today. Node 26 (currently 26.9.0) becomes Active LTS in October 2026, and 24 moves to maintenance, with EOL in April 2028. That is fine for v1. Note the upgrade window.
- **L2. ExcelJS.** 4.4.0 is still the latest stable, from 2023-10-19, with a 4.4.1 prerelease in December 2024. It is correctly flagged as an Open Question. Also require the unpacked-size check to read zip central-directory sizes before ExcelJS loads the file, because ExcelJS reads the whole workbook into memory.
- **L3. AD-1 enforcement.** dependency-cruiser cannot catch `new Date()`, `Date.now()` or `process.env`. Name an ESLint `no-restricted-syntax` / `no-restricted-properties` rule as the enforcement.
- **L4. RDS minor version.** The local image pins 18.6. RDS minor availability in `ap-northeast-1` may lag, so pin the major (18) for production and track the minor.
- **L5. NFR-U1 and FR-6 in `binds`.** NFR-U1 is in `binds` with no governing AD or convention. Point it to the UX DESIGN.md or remove it. FR-6 and NFR-S5 are missing from `binds` and from the Capability Map. They are Post-Q1 or document-only, so a one-line mention is enough.
- **L6. Guard for the incremental-read deferral.** Add to AD-7 now: "an incremental read never marks `left_scope`; a complete full read runs at least daily". Without it, a future `updatedSince` adapter can silently break FR-42.
- **L7. Multi-instance Next.js.** If `web` runs more than one task, pin `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` and the build id across tasks through config (AD-17's zod schema).
- **L8. Client writes.** FR-36 view tracking and opt-out are Client Viewer writes. AD-12 says Client Viewer use cases "may read only". Allow the two writes explicitly.

## Stack Verification (checked 2026-09-20)

| Item | Spine | Registry today | Status |
| --- | --- | --- | --- |
| next / react | 16.3.5 / 19.3.0 | 16.3.5 / 19.3.0 | current |
| drizzle-orm / drizzle-kit | 0.45.2 / 0.31.10 | 0.45.2 / 0.31.10 | current (1.0 betas exist; staying on stable is right) |
| pg / pg-boss | 8.23.0 / 12.33.2 | same | current |
| better-auth / next-intl | 1.7.5 / 4.14.5 | same | current |
| zod / pino / vitest | 4.6.5 / 10.3.1 / 5.0.1 | same | current |
| @playwright/test / dependency-cruiser / tsx | 1.63.0 / 18.3.1 / 4.23.13 | same | current |
| pnpm | 12.4.2 | 12.4.2 | current |
| TypeScript | 6.0.3 | latest 7.0.2; latest 6.x 6.0.3 | deliberate pin, justified in the memlog |
| Node.js | 24.21.0 LTS Krypton | 24.21.0 (2026-09-07), LTS | current (see L1) |
| PostgreSQL image | 18.6 | `postgres:18.6` tag exists | current |
| exceljs | 4.4.0 | 4.4.0 (2023-10-19) | current but stale (Open Question) |

## Operational Envelope Checklist

| Dimension | State in spine | Needed |
| --- | --- | --- |
| Environments | Decided (local, optional staging, production) | – |
| Infra/provider strategy | Decided (AWS Tokyo, ECS Fargate, RDS, S3); IaC deferred | OK |
| CI/CD pipeline | Deferred | OK as a deferral, but AD-1 and AD-10 depend on CI gates. Name "CI must run dep-cruiser, the golden recompute test and the cross-tenant harness" as a Rule. |
| Migrations in production | **Missing** | H3 |
| Monitoring and log destination | Implicit (pino, metrics table) | H3 |
| Alerting | **Missing** (AD-7 says "operator alert" with no destination) | H3 |
| Backups | Decided (RDS 30 days, in-region) | – |
| Restore procedure and test | **Missing** (NFR-R2 requires a test before R1) | H3 |
| Blob retention and deletion | **Missing** | H3 |
| Secrets and key rotation | Partial | H3 |
| Mail | Scoped to R1 only, but R0 needs mail | H3 |
| Data deletion (NFR-D1) | Deferred to R1, and blocked by AD-5 | H1 |

## What Is Good and Should Stay

- The functional core with the no-clock/no-I/O rule, enforced by the import graph.
- RLS with FORCE, a non-owner role, `SET LOCAL` in `withTenant`, composite tenant FKs, and a cross-tenant harness.
- Integer milli-hours and yen with a single rounding site.
- Append-only enforced by grants and triggers, not by convention.
- A single-writer ingest transaction with idempotency and a post-commit invariant check.
- `TrackerPort` with fixture replay, which makes the demo credential-free.
- Metric results as a union of value and unavailable, so the UI can never show 0 for "unavailable".
- The compile-time-typed client projection.
- Bitemporal Rates.
- Stack versions that are genuinely current.
