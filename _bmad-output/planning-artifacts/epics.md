---
stepsCompleted: [1, 2]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-momo-keikaku-2026-09-19/prd.md
  - _bmad-output/planning-artifacts/prds/prd-momo-keikaku-2026-09-19/addendum.md
  - _bmad-output/planning-artifacts/prds/prd-momo-keikaku-2026-09-19/review-readiness.md
  - _bmad-output/planning-artifacts/architecture/architecture-momo-keikaku-2026-09-20/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/sprint-change-proposal-2026-09-20.md
  - _bmad-output/planning-artifacts/ux-designs/ux-momo-keikaku-2026-09-20/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-momo-keikaku-2026-09-20/EXPERIENCE.md
  - _bmad-output/decisions-pending-2026-09-20.md
  - _bmad-output/planning-artifacts/briefs/brief-momo-keikaku-2026-09-19/brief.md
  - _bmad-output/planning-artifacts/briefs/brief-momo-keikaku-2026-09-19/addendum.md
  - docs/references/pmi-techniques-v1.md
  - docs/references/pmi-techniques-v2.md
  - docs/references/20260914-smart-pm-suite-srs-v1.md
---

# momo-keikaku - Epic Breakdown

> **PRD §7.3 position — this artifact sits in the left-hand column: it *decomposes* the frozen §8.1 list (36 FR entries) and writes acceptance criteria that restate consequences those FRs already state. It adds no FR, no NFR, no screen, no field and no behaviour.**
>
> Two things this artifact deliberately does **not** do, because they belong to other owners:
> - It does not estimate. OQ-12 is `bmad-sprint-planning`'s, after this step. Stories carry a Core/Comfort tier and a blocking order so that they *can* be estimated; they carry no numbers.
> - It does not take §8.3's first cut, and it does not resolve the contradiction that cut carries (see *Carried to `bmad-sprint-planning`* below).
>
> Where a candidate acceptance criterion would have asserted behaviour no FR states, it is recorded in *Candidate scope additions* instead of being written into a story. That list is the visible omission §7.3 asks for: it is empty of things smuggled in, and non-empty of things that need `bmad-correct-course` if anyone wants them.

## Overview

This document provides the complete epic and story breakdown for momo-keikaku R0, decomposing PRD §8.1's frozen 36-entry FR list, the Architecture Spine's AD-1 … AD-30, and the UX spines' Plan-surface design into implementable stories.

**Release boundary.** Every story below is R0 unless tagged otherwise. R1 (FR-2 Client Viewer, FR-3 magic link / Microsoft, FR-4 Japanese, FR-7 Gantt, FR-34–FR-37, FR-38 snapshot export, FR-40) and Post-Q1 (FR-18, FR-33, FR-41, the other EAC methods) are out of scope here and are named only where an R0 story must reserve room for them.

### State at the time of writing (2026-09-20)

- No epic and no story existed before this document. This is the first decomposition.
- The architecture spine merged as PR #2, commit `87d9915`, and closes the three conditions `review-readiness.md` Part 4 set for it: the recalculation trigger set (AD-27), OQ-13's tie-break rule (AD-28), and the migration plan (AD-30).
- The UX spines merged as PR #3, commit `70e02e6`, and close **OQ-11's design half**. `EXPERIENCE.md` specifies the Plan tree grid in full and tiers every element Core or Comfort. **OQ-11's cost half stays open and is `bmad-sprint-planning`'s.**
- `review-readiness.md` Part 4 listed FR-6b, FR-21, FR-22, FR-28, FR-30 and FR-43 as BLOCKED for this step behind finding R-1. R-1 and R-2 are resolved in the current PRD (FR-6b's "Nothing derived from Tracker evidence is ever a scheduling input"; FR-28's cause list closed at **seven**), so nothing is blocked on that account.
- 46 TypeScript files exist on `main`, all from the 2026-09-20 demo spike. They are reconciled against these stories in *E-3 reconciliation*.

### Documentation inconsistencies found, not fixed here

Fixing the PRD is `bmad-prd`'s job, not this step's. Three places still say the UX spines are silent on dependencies, which stopped being true when PR #3 merged:

| Location | Stale text | Current fact |
|---|---|---|
| PRD OQ-11 | "`DESIGN.md` and `EXPERIENCE.md` mention dependencies nowhere" | `EXPERIENCE.md` specifies the predecessor cell, constraint cell, Float column, critical-path column, schedule strip, exceptions rail and three explainers; 45 matches for dependency / predecessor / tree grid / Float / critical path |
| PRD addendum B | "`DESIGN.md` and `EXPERIENCE.md` mention dependencies nowhere, and the PRD declines to invent the design" | Same. The second half still holds; the first does not |
| `sprint-change-proposal-2026-09-20.md` §2, D-1 … D-4 | "UX — materially affected, and currently silent" | Step 4 of §5's handoff table is done |

Also minor: PRD §8.1 says "the critical path to the Project finish", where FR-6b anchors on the **computed** finish when no Project finish is set (`review-readiness.md` finding R-4, LOW, still open).

## Requirements Inventory

### Functional Requirements

The frozen §8.1 list, verbatim in scope and counted: **36 entries**, counting FR-6a and FR-6b separately.

| # | FR | Title | R0 scope qualifier |
|---|---|---|---|
| 1 | FR-1 | Tenant and hierarchy | full |
| 2 | FR-2 | Roles and permissions | **partial** — Tenant Admin and PM only. Client Viewer is R1; Internal Viewer is Post-Q1 |
| 3 | FR-3 | Sign-in | **partial** — email + password, and Google. Magic link and Microsoft are R1 |
| 4 | FR-4 | Language and locale | **partial** — English UI, but every string externalised and JA catalog present |
| 5 | FR-5 | Create and edit Work Packages | full. Planned dates are **not** typed |
| 6 | FR-6a | Dependency, duration and constraint capture | full. FS only, leaf-to-leaf only |
| 7 | FR-6b | Schedule recalculation | full. Forward + backward pass, Float, critical path, three constraint types |
| 8 | FR-7 | Plan tree grid | **tree grid only** — the Gantt is R1 |
| 9 | FR-8 | Custom Fields | full, to the tested bound of 100 per Project |
| 10 | FR-9 | Upload and column mapping | full, including the progress columns |
| 11 | FR-10 | Mandatory Import Preview | full |
| 12 | FR-11 | Re-import with diff | full |
| 13 | FR-12 | Resources and Rates | full |
| 14 | FR-13 | Tracker Account linking | full |
| 15 | FR-14 | Holiday Calendars | full, including the dated append-only version history over the national tables |
| 16 | FR-15 | Set Baseline | full, including the automated re-derivation test |
| 17 | FR-16 | Re-baseline with history | full, including the graph diff |
| 18 | FR-17 | Backlog Connector | full |
| 19 | FR-19 | Tracker Snapshot schedule | full |
| 20 | FR-20 | Scope completeness | full |
| 21 | FR-21 | Manual Mapping and attribution | full |
| 22 | FR-22 | Mapping Rules | full |
| 23 | FR-23 | Mapping coverage | full |
| 24 | FR-24 | Catch-all WPs | full |
| 25 | FR-25 | Ledger entries from snapshot deltas | full |
| 26 | FR-26 | Attribution honesty | full |
| 27 | FR-27 | Ticket-Count Mode | full |
| 28 | FR-28 | Reconciliation Review | full. Cause list closed at **seven** |
| 29 | FR-29 | Dispositions | full |
| 30 | FR-30 | EVM computation | **Typical EAC only.** The other three methods are Post-Q1 |
| 31 | FR-31 | Health Indicators | full, including both milestone rules, negative Float and the constraint-violation rule |
| 32 | FR-32 | Forecast | full — EAC plus both finish dates |
| 33 | FR-38 | xlsx report export | **fixed layout of the current PM view.** Published Snapshot export and Risks are R1; templates are Post-Q1 |
| 34 | FR-39 | Raw data export | full, including every scheduling input |
| 35 | FR-42 | Ticket lifecycle in the ledger | full |
| 36 | FR-43 | Project schedule settings | full |

**Explicitly not in R0** (named so the boundary is a decision, not an omission): FR-18 Jira Connector (Post-Q1); FR-33 Department and Program roll-up (Post-Q1); FR-34 Visibility Policy, FR-35 Publish, FR-36 Client View, FR-37 Risks and Issues (R1); FR-40 PM Seat accounting (R1); FR-41 AI-assisted interpretation (Post-Q1); FR-7's Gantt (R1).

**Never cut** (PRD §8.3): FR-19–FR-32 (FR-30 with Typical EAC only), FR-34–FR-36, FR-42, and FR-6b's forward pass.

### NonFunctional Requirements

| # | NFR | Requirement | R0 |
|---|---|---|---|
| NFR-S1 | Tenant isolation | Enforced in the data layer and tested automatically | yes |
| NFR-S2 | Credentials | Tracker credentials encrypted at rest, never shown after entry, never logged | yes |
| NFR-S3 | Encryption | TLS 1.2+ in transit, encryption at rest for all customer data | yes |
| NFR-S4 | Data residency | Customer data and backups in a Japan region **from R0** | yes |
| NFR-S5 | Security check sheet | Pre-filled Japanese セキュリティチェックシート answer document | R1 |
| NFR-S6 | Personal data | APPI / Decree 13 handling of Tracker Account names and offshore hours; only FR-19's fields stored; deleted with the Tenant | yes |
| NFR-S7 | Operator access | Time-limited, logged, Tenant-Admin-granted support access | R1 |
| NFR-S8 | Untrusted content | Tracker and Excel content escaped; export formula prefixes neutralised; upload size and unpacked-size limits | yes |
| NFR-D1 | Data lifecycle | Deletion within 30 days on request. **The deletion path ships in R0** as a documented, audited operator procedure with no UI | yes |
| NFR-A1 | Audit trail | Every action that changes reported numbers or visibility is logged with actor and time; 17 named action groups | yes |
| NFR-C1 | Computation determinism | Same pinned inputs always yield the same output, on any machine, at any later date. Integer arithmetic. Explicit written tie-break. Baselines pin inputs, not only outputs | yes |
| NFR-R1 | Snapshot reliability | 99% of scheduled snapshots succeed or are retried successfully within one interval; failures visible to the PM | yes |
| NFR-R2 | Backups | Daily, kept 30 days; RPO 24 h, RTO 1 business day. **Restore rehearsal before R1** | backups yes, rehearsal R1 |
| NFR-P1 | Performance | At 5 Projects x 500 WPs x 2,000 Tickets: Review / tree grid / Client View < 2 s p75, < 4 s p95; plan edits < 500 ms p75, < 1 s p95 **including the FR-6b recalculation**; full 500-WP recalculation < 300 ms p95; full 2,000-Ticket snapshot to ledger within 5 min | yes |
| NFR-I1 | Internationalisation | All text externalised EN + JA; full-width and half-width JA display correctly; sort by code point after NFKC width normalisation | yes |
| NFR-U1 | Accessibility | WCAG 2.1 AA contrast and keyboard access; Health Indicators never rely on colour alone | yes |
| NFR-O1 | Observability | Connector health, snapshot lag and import failures visible to the operator without reading customer data | yes |

### Additional Requirements

From `ARCHITECTURE-SPINE.md`. These are not new requirements; they are the decisions an R0 FR already implies, and they are what makes several stories infrastructure rather than feature work.

**Starter template.** There is **no greenfield starter template**. The spine fixes the paradigm — a **modular monolith, hexagonal (ports and adapters) around a pure functional core**, one TypeScript codebase, one PostgreSQL database, two roles (`web` Next.js and `worker` pg-boss). A partial skeleton already exists on `main` as a demo spike (46 files) whose schema AD-30 rewrites. **Epic 1 Story 1 is therefore not "run a starter" but "stand up the workspace, the table-class registry, RLS and the one-command local run", and Epic 2 Story 1 is AD-30's single migration.**

| # | Requirement | Source |
|---|---|---|
| AR-1 | Import graph enforced by `dependency-cruiser` in CI. `packages/domain` has no runtime dependency but `zod`. Two scheduling edges forbidden outright: `domain/schedule` may not import `domain/attribution`; `db/repositories/schedule` may not be imported outside `packages/app/schedule` | AD-1 |
| AR-2 | `Date.now()`, bare `new Date()` and `process.env` banned outside `adapters/clock` and `app/config`, by ESLint `no-restricted-syntax` / `no-restricted-properties` | AD-1 |
| AR-3 | One runtime topology: `web` + `worker` + Postgres. Jobs, schedules and retries on **pg-boss** on the application Postgres. Sessions in Postgres. Only other stateful dependency is a `BlobStore` port. Both roles ship in one image | AD-2 |
| AR-4 | Tenant isolation is **RLS in the data layer and nowhere else trusted**: `tenant_id NOT NULL` on every tenant-owned table, composite foreign keys including `tenant_id`, `ENABLE` + `FORCE ROW LEVEL SECURITY`, policy on `NULLIF(current_setting('app.tenant_id', true), '')::uuid`. FORCE lives in hand-written `rls.sql` because Drizzle 0.45 cannot emit it. All access through `withTenant(tenantId, tx => ...)` with a **bound** uuid | AD-3 |
| AR-5 | Cross-tenant test harness seeds two Tenants and asserts, for **every read use case**, that nothing from the other Tenant returns | AD-3, FR-1 |
| AR-6 | Numbers are exact integers until presentation: effort as `bigint` **milli-hours**, money as integer JPY, ratios as `{num, den}` unreduced, threshold comparison by cross-multiplication at a single `compareRatio` site, fractional spreads by **largest remainder** with declared tie-breaks, rounding only in `domain/present` | AD-4 |
| AR-7 | Scheduling obeys the same discipline: durations, lags, Float and "days late" are whole working days as integers; remaining duration is `ceil(duration_days x (1 - recorded_pct))` clamped to >= 1, over the `Ratio` form | AD-4, AD-27 |
| AR-8 | One `jsonb` codec in `domain/present/codec`: `bigint` to decimal string, `Ratio` to string pair. Every "identical" means identical in the codec's canonical decoded form, **never column text** — `jsonb` reorders keys and renormalises numbers, so a text diff flakes | AD-4, AD-26 |
| AR-9 | 25 named tables are insert-only, enforced by revoked grants **and** a `BEFORE UPDATE OR DELETE` trigger. Two sanctioned exceptions through the `maintenance` role alone: FR-19 compaction and `purgeTenant` | AD-5 |
| AR-10 | Compaction deletes only `ticket_observation` rows, never a `tracker_snapshot` header, and retains any observation set referenced by a Published Snapshot, a ledger entry, an open Review, an unexpired export, a Period's first snapshot, or a Connector's latest | AD-5, FR-19 |
| AR-11 | `schedule_run` retention is **by reference, not by count**: `inputs` may be deleted only when older than the oldest run its Project still references and not the latest; `outputs` may be dropped earlier because it is a pure function of `inputs`; `inputs` and `causes` are never dropped while the run is retained | AD-5, AD-26 |
| AR-12 | Trackers reached only through `TrackerPort`. `TicketObservation` holds the FR-19 whitelist plus `createdAt`; `attributes: {kind, id, label?}[]` replaces Backlog-shaped fields so Jira never migrates the ledger. **The adapter does not decide "Resolved"** — it reports `statusId` only | AD-6 |
| AR-13 | Backlog paginated completeness: read `sort=created&order=asc` with internal id as tiebreak; Count Issues before and after; `complete` only if the page union has distinct ids and its size equals both counts. Search-bucket budget checked at setup, Connector refused or slowed above 25% per interval | AD-6 |
| AR-14 | Adapter kind recorded on every snapshot; ingest refuses a mismatch. Fixture Tickets carry `tracker_kind = 'fixture'`. Five required fixture scenarios: hours, no-hours, page-shift, leave-and-return, scope-change | AD-6, AD-24 |
| AR-15 | **One writer of the Actuals Ledger:** the `ingestSnapshot` transaction. `left_scope` requires **two consecutive complete reads** with the Ticket absent. Null hours never move the ledger. Entries store no `resource_id` — the Resource resolves at query time so a late FR-13 link fixes past hours. `active_baseline_version_id` is the latest by `seq` committed before the lock, never a timestamp comparison | AD-7 |
| AR-16 | `ingest-snapshot` queue created with `policy: 'stately'` and `singletonKey = connectorId`; `retryLimit: 3` with backoff inside one interval; each failed attempt is a visible row | AD-7, NFR-R1 |
| AR-17 | Measurement basis is latched per Connector in `measurement_basis_event` with **hysteresis N = 3** in both directions, never derived from the plan name. Founder decision A3: automatic both ways, no confirmation screen. Every metric returns `{kind: 'value', ...}` or `{kind: 'unavailable', reasonCode}` — never 0 | AD-8, `decisions-pending` A3 |
| AR-18 | Attribution computed at query time from the ledger and `mapping_event`, never stored. `mapping_event` carries `project_id` with composite foreign keys, so a Ticket maps only inside its owning Connector's Project. **Manual wins under concurrency**: every append re-reads the head inside the lock. `release` (back to the rules) and `manual, wp_id = null` (pinned Unmapped) are split; **founder decision A4: R0 exposes `release` only** | AD-9, `decisions-pending` A4 |
| AR-19 | Every reported figure is `compute(inputs, formulaVersion)`. **The closure rule:** any value read by `domain/evm`, `health`, `forecast`, `attribution` or `schedule` must come from an append-only source `ComputationInputs` pins; for `domain/schedule` that source is `schedule_run.inputs` **and nothing else**. A CI test enumerates the exported signatures and fails if any input type is unreachable | AD-10 |
| AR-20 | **The Review's pin is split.** Tracker-side inputs stay frozen for the Review's life; PM-authored watermarks **and `schedule_run_seq`** are re-captured after each successful PM write, because three of them are AD-27 recalculation triggers and freezing the run would show new EVM against a superseded schedule | AD-10 |
| AR-21 | Ledger entries are filtered by the pinned `snapshot_id` **per Connector**. `ledger_seq_max` is an assertion that the recompute saw the same rows, **never the filter** | AD-10 |
| AR-22 | Baselines pin a **run by reference**, not a second copy of the inputs. `baseline_version.schedule_run_seq` is a real foreign key; `baseline_wp` keeps only the cost projection PV, BAC and Divergence read. Divergence compares `baseline_wp` with the pinned `schedule_run`, never with `wp_schedule` or a `work_package` column | AD-11, AD-26 |
| AR-23 | Role-scoped use-case surfaces. `outputs_client` comes from `clientProjection()` returning a **separate TypeScript type** with no money, Rate, person, account or Ticket-content field, so the omission is a compile-time check. Anything outside the allowed set returns `not_found` | AD-12 (R1, but the type boundary is built with the projection) |
| AR-24 | Imports are two-phase. Limits checked **before ExcelJS sees the file**: 10 MB file, 50 MB unpacked read from the **zip central directory**, 1,000,000 non-empty cells. Formulas and macros never evaluated — cached results only. `confirmImport` is the only path that writes `work_package` from a file, and calls `recalculate` **once** after the whole diff commits | AD-13, AD-27 |
| AR-25 | **ExcelJS fit is a spike, not an assumption.** The first import story parses three real Japanese WBS workbooks through `WorkbookPort` and asserts merge ranges and cached formula results. The non-streaming API is the supported path | AD-13 |
| AR-26 | Audit written in the **same transaction** as the change, `action` from a closed enum; a test enumerates the NFR-A1 use cases and asserts each produces its row | AD-14 |
| AR-27 | Wall time only from the `Clock` port. **Fixture time coherence**: `CLOCK_MODE=fixture` returns `max(latest fixture observedAt, FIXTURE_TIME_ANCHOR)` in both roles and the seed uses the same clock. `periodOf` and working-day math live only in `domain/calendar` and take the non-working-day set as an argument | AD-15 |
| AR-28 | The snapshot schedule is an **hourly pg-boss tick** (`tz: Asia/Tokyo`, `missed: 'skip'`) and the handler asks `domain/calendar` whether this hour is inside 09:00-19:00 JST on a JP or VN working day; inside it every due Connector hourly, outside it every 6 h | AD-15, FR-19 |
| AR-29 | Credentials AES-256-GCM with **`key_id` stored per ciphertext** so a key can be rotated by a maintenance job; KMS envelope encryption in production. `pino` redaction of `*.apiKey`, `*.token`, `*.password`, `authorization`. `dangerouslySetInnerHTML` banned by lint. One `safeCell()` for every xlsx and CSV writer | AD-16 |
| AR-30 | One-command local run: `pnpm dev` brings up Postgres, migrates, applies RLS and grants SQL, seeds, then runs both roles. **Four version traps are decided, not discovered:** `postgres:18.6` must mount `pgdata:/var/lib/postgresql` (not `/data`, which PG18 silently ignores, losing the DB on `compose down`); pnpm 12 needs `allowBuilds` because `strictDepBuilds` is inherited true; TypeScript 6 defaults `types: []`; next-intl on Next 16 uses `proxy.ts`, and Better Auth needs `nextCookies()` with the session cookie cache **disabled** | AD-17 |
| AR-31 | pg-boss's own schema is installed and migrated by the `migrator` (owner) role during `migrate`; the application role starts pg-boss with auto-migration **disabled** and holds only DML grants | AD-17, AD-3 |
| AR-32 | `pnpm fixtures:reset` resets the cursor **and** truncates that Connector's snapshot, observation, ledger and ticket rows, or the replayed `observedAt` values are skipped by idempotency and the reset is a no-op | AD-17 |
| AR-33 | Production is AWS `ap-northeast-1`: ECS Fargate `web` behind an ALB (TLS 1.2+) and `worker` (count 1), RDS PostgreSQL 18 encrypted with 30-day in-region backups, S3 Tokyo SSE, SES Tokyo. **Mail is R0, not R1** — FR-17 credential errors and FR-3 password reset need it; SES production access is an R0 launch task. Only the client-facing sender domain with DKIM/DMARC is R1 | AD-18 |
| AR-34 | Migrations run as a one-off ECS task as the `migrator` role **before** services roll, re-applying `rls.sql`, `grants.sql` and trigger SQL in the same task. **Expand/contract binds from the migration after AD-30's.** Backfills go through the `maintenance` path | AD-19 |
| AR-35 | **CI must block merge on 19 gates**, of which six are the scheduler's: the input-writer fence test, the trigger call-site test, the `recalculateProject` reachability test, the **golden scheduler corpus** (the only gate that tests correctness rather than self-consistency), the shuffled-input determinism test, and the re-derivation test under each run's own `engine_version` | AD-19, AD-27 |
| AR-36 | Operator alerting: snapshot failure rate, the post-commit ledger invariant, adapter-kind mismatch, worker heartbeat loss, RDS storage and CPU, **a recalculation halted on calendar range (only the operator can clear it), a `wp_schedule.stale` older than one business day, and a recalculation p95 over NFR-P1's budget**. Destination in-region | AD-19, AD-29 |
| AR-37 | **Watermarks are commit-ordered by a per-Project write lock.** Postgres assigns identity `seq` at INSERT, not COMMIT, so every append takes `pg_advisory_xact_lock(namespace, key)` — the **two-argument** form, namespace 1 Project / 2 Tenant — before allocating a `seq`, and `ComputationInputs` is captured under the shared form. Long work happens **before** the lock | AD-20 |
| AR-38 | `packages/db/table-classes.ts` is a single registry giving every table exactly one of five classes, and **RLS, grants and trigger SQL are generated from it**. CI fails if a migration adds an unregistered table. A `work_package` column may be mutable only if no domain compute function reads it | AD-21 |
| AR-39 | `recordDisposition` is the **only** Disposition writer; it calls `plan.createWp` rather than inserting, and stores the **explicit Ticket list at record time** with `ledger_seq_at` and `cum_mh_at`, never the group criteria | AD-22, FR-29 |
| AR-40 | Exactly one non-RLS identity bridge, `tenant_membership`, read by `resolveRequestContext` and nothing else. Session carries an explicit `activeTenantId` validated on **every** request. There is no non-tenant `connector_schedule` table; every handler re-verifies its Connector under `withTenant` from the payload | AD-23 |
| AR-41 | Committed fixtures are synthetic or `--anonymise`d to the FR-19 whitelist with deterministic pseudonyms, and a CI check rejects any out-of-whitelist field. **The FR-9 acceptance corpus of real client WBS files is not in the repo** — it lives in a Japan-region access-controlled location and its tests run under a local-only tag CI skips | AD-24 |
| AR-42 | **`work_package` has no `start` or `finish` column.** Every scheduling input has exactly one home (table in AD-25). **Actual dates live in `wp_status_event`, not a column** — `completed_at` and `milestone_done_at` are dropped, because two homes give the scheduler and EVM two actual finishes that can disagree | AD-25 |
| AR-43 | **One fence for every input write:** `app/schedule.applyPlanChange(ctx, mutation)` performs the write **and** the recalculation in one transaction under the per-Project lock. No other use case writes any input row; `db/repositories/plan-input` is exported only to `app/schedule` and `dependency-cruiser` fails on any other importer. **This, not a list of callers, closes the trigger set's input side** | AD-25, AD-27 |
| AR-44 | `is_leaf` is `GENERATED ALWAYS AS (child_count = 0) STORED` — `STORED` written explicitly, because PG18 defaults to `VIRTUAL` and a virtual column cannot be a UNIQUE member or FK target. `child_count` is app-maintained; a CI test rebuilds it from `parent_id` over the golden corpus. **The claim that a DB constraint ties `is_leaf` to parentage is withdrawn — nothing in PostgreSQL can do it** | AD-25 |
| AR-45 | Leaf-only inputs are a table `CHECK`; leaf-only dependency endpoints are declarative via `pred_is_leaf` / `succ_is_leaf` composite foreign keys **`DEFERRABLE INITIALLY DEFERRED`**, so an import or re-parent may restructure in one transaction and be judged at commit. Cross-project links are blocked by composite foreign keys with `MATCH FULL`, not by remembering | AD-25 |
| AR-46 | FR-6a's four graph rules live in one pure `domain/schedule/validate(plan, edges)`, called by the fence on every mutation **and** by `recalculate` before the passes, so they are invariants rather than entry checks | AD-25, FR-6a |
| AR-47 | **Two names, two layers:** `domain/schedule.recalculate(inputs, prevInputs) -> outputs` is pure and reads nothing but its arguments; `app/schedule.recalculateProject(ctx, projectId, cause)` resolves inputs, calls it and appends the run. Nothing else is called `recalculate` | AD-26 |
| AR-48 | `schedule_run.inputs` is **fully resolved — every value, no pointers**, including the whole WP tree (leaf and summary) and **the resolved non-working-day set itself**, because a pure function cannot dereference a reference. Watermarks are carried as assertions, never as a second filter | AD-26 |
| AR-49 | `outputs` carries per WP `early_start` / `early_finish` (**the pair the UI calls the derived start and finish**), `late_start`, `late_finish`, `float_days`, `is_critical`, `state`, `not_schedulable_reason`, the per-WP FR-28 `cause`, and the summary roll-ups; per Project the violation rows with days late and chain, the out-of-sequence rows, the critical path as an ordered list, the anchor and the computed finish | AD-26 |
| AR-50 | **Size, measured rather than assumed.** A 500-WP / 500-edge payload is 385 kB raw and **about 141 kB stored** after `pglz`, with roughly 152 kB WAL per append. An earlier draft guessed 25 KB and sized retention off the guess. `inputs.wps` is an array and every other reference is its **integer index**, ordered by `compareWp`, so a `wp_id` is written once per WP | AD-26 |
| AR-51 | `engine_version` is a registry key like `formulaVersion`: every registered version stays executable and the CI gate re-derives each golden run under **its own** recorded version, so a scheduler bug fix does not turn every historical run red | AD-26 |
| AR-52 | The closed trigger set is FR-6b's, enforced by **three tests in three directions**: writers (every input write inside the fence), callers (exactly the FR-6b list), and **reachability** (`recalculateProject` unreachable from `ingestSnapshot`, `evaluateRules`, every `mapping` use case and every Tracker-driven job handler). Addendum A.5 proposed only the third; alone it cannot close the set, because the snapshot path never calls the function — it changes an input the function reads | AD-27 |
| AR-53 | Recalculation is **synchronous inside the fence's transaction** under the per-Project exclusive lock — **the one sanctioned long hold of that lock** — bounded by NFR-P1's 300 ms p95. The ingest path sets a `lock_timeout` and records a retryable failed attempt rather than blocking on a stalled edit. If the budget is exceeded the lever is lock granularity, **never a background path** | AD-27, AD-20 |
| AR-54 | **Exactly two callers are not a PM edit**, both named: the operator's calendar-version publication and `confirmImport` | AD-27 |
| AR-55 | `compareWp` in `domain/schedule/order` is the **only** ordering site and is total: NFKC-normalised `wbs_code` split on `.`, numeric segments as arbitrary-precision integers, others by code point, fewer segments first, then lowercase `wp_id` — so it never returns 0 for two distinct WPs. **A WBS code orders; it never identifies** — every cross-run match is on `wp_id` | AD-28 |
| AR-56 | Where several predecessors tie on the value that set an early start, `outputs` records **all** of them in `compareWp` order and the UI names the first — naming one and hiding the rest is how a PM chases the wrong link. A rejected cycle is rotated to begin at its `compareWp`-minimum WP so one defect never reads as two | AD-28 |
| AR-57 | A Holiday Calendar version stores the **fully resolved** non-working-day set as `date[]` over `[range_start, range_end]`, never a calendar name. `app/calendar.publishCalendarVersion` is an **operator use case, not a job**: one Project's lock at a time and never two at once, `operator_audit` once plus each Project's `audit_log`, per-Project success / halt / failure | AD-29 |
| AR-58 | Outside the loaded range the scheduler **stops rather than guesses**: the run is appended with a `halted_reason` and no `outputs`, `wp_schedule` keeps the last good run with `stale = true`, and the PM is shown the WPs and the range needed. Only the operator can clear it | AD-29, AD-27, FR-6b |
| AR-59 | **AD-30 is ONE migration, before any client data exists, and the exemption is spent once.** It adds four tables and the input columns, **drops** `work_package.start`, `.finish`, `.completed_at`, `.milestone_done_at`, and **rewrites** `baseline_version` and `baseline_wp`. Three things Drizzle 0.45.2 cannot emit are hand-written SQL with CI assertions against the catalogue: `DEFERRABLE INITIALLY DEFERRED`, `MATCH FULL`, and `GENERATED ... STORED`. A Baseline seeded before it is **deleted, not migrated** | AD-30 |
| AR-60 | **The rest of the schema gap is named, not hidden.** Beyond the scheduling slice the repository still lacks AD-21's event tables and the AD-3 RLS, grants and triggers. AD-30 closes the scheduling slice only; the remainder is an outstanding build item | AD-30 |
| AR-61 | Stack is pinned exactly: Node 24.21.0, TypeScript **6.0.3 exact** (capped by typescript-eslint 8.70.x), pnpm 12.4.2, Next 16.3.5, React 19.3.0, PostgreSQL 18.6, drizzle-orm 0.45.2 / drizzle-kit 0.31.10 **exact, no caret** (1.0 is at RC and may GA mid-build), pg 8.23.0, pg-boss 12.33.2, better-auth 1.7.5, next-intl 4.14.5, exceljs 4.4.0, zod 4.6.5, pino 10.3.1, vitest 5.0.1 exact, Playwright 1.63.0, dependency-cruiser 18.3.1 | Stack table |
| AR-62 | **Deferred, and named so nobody pre-builds it:** IaC tool, CI provider and deploy pipeline (pick at the first staging deploy); incremental `updatedSince` reads; caching or materialising computed metrics; the Drizzle 1.x upgrade; Jira adapter internals; the AI import provider. Two shapes reserve room and no more — `wp_dependency.type` already carries `SS \| FF \| SF` as values the R0 writer rejects, and `holiday_calendar_version` already stores a resolved set | Deferred |

### UX Design Requirements

From `EXPERIENCE.md` and `DESIGN.md`, which **resolve OQ-11's design half** (PR #3, commit `70e02e6`). Tiers are `EXPERIENCE.md` › *Build Tiers*: **Core** means an R0 FR fails without it; **Comfort** means the FR still passes and what is lost is speed or discoverability. Cutting Comfort needs no correct-course pass; adding does.

| # | Requirement | Tier |
|---|---|---|
| UX-DR1 | **Collapsible left sidebar** listing the project's surfaces in weekly-cycle order (Review alone at top; Plan group; Actuals group; Report group; Project settings pinned bottom). One level only — Mapping's three sub-views are tabs, Import's steps a wizard. `aria-current="page"`, `[` toggles, per-user persisted state, 48px icon rail when collapsed, overlay drawer below 1024px. **Never carries counts or badges** | Core |
| UX-DR2 | **Plan surface structure**, top to bottom: schedule strip, toolbar, tree grid; exceptions rail to the right; What-moved band between toolbar and grid after every recalculation | Core |
| UX-DR3 | **Three frozen leading columns** — WBS code, Name (carrying the expand control, `aria-level`, `aria-expanded`) and the state glyph — frozen **visually only**, staying in the same row and reading order so a screen reader hears one row | Core |
| UX-DR4 | **Four column presets**: Schedule (default), Progress, Baseline compare, All. The three sized presets fit the grid's own width (Schedule measures **1,229px** in the mockup against 1,232px available at 1280px with the sidebar collapsed); only *All* scrolls horizontally. Adding a column to a sized preset must take width from another — that is the contract | Core (first three) / Comfort (*All*, saved per-preset variations) |
| UX-DR5 | **Schedule strip**: Project start, Project finish (or *not set*), Data Date, computed finish, minimum Float, and **the Float anchor as a sentence, not a label**. All three settings inline-editable here as well as in Project settings; never scrolls away. Setting or clearing a Project finish is confirmed with what it actually does | Core |
| UX-DR6 | **Predecessor cell**, MS-Project-shaped (`2.3FS+2d, 2.4`), autocomplete over WBS code and name, **leaf WPs only**, lag in working days and may be negative. On commit the edge set is diffed; FR-6a rejections appear under the cell naming the offence and the WPs in it, and **the cell keeps the typed text** so the PM corrects rather than retypes | Core |
| UX-DR7 | **Constraint cell**: one column holding both halves, rendered as "Must finish on 18 Mar 2027", edited as type then date. A milestone's target **is** its *must finish on* constraint, edited here, not in a field of its own | Core |
| UX-DR8 | **Schedule-exceptions rail**: three collapsible groups, always in this order, each with its count — Constraint violations (ranked by working days late, worst first), Out-of-sequence links, Not schedulable yet. A pinned column at >= 1680px, a drawer below it whose **toggle always carries the total count** so a shut drawer never hides an exception. Empty it says "No schedule exceptions" rather than vanishing | Core |
| UX-DR9 | **Three exception explainers.** *Constraint violation:* date asked for, date derived, working days late **and on which Holiday Calendar version**, the predecessor chain as a walkable list, closing with "This violation stays on this work package. It has not changed any other work package's Float." *Out-of-sequence:* stated as information, **no fix offered, because there is nothing wrong**. *Not schedulable yet:* the consequence plus a duration field in the popover | Core (chain **walk** is Comfort — the chain may be plain text) |
| UX-DR10 | **What-moved band**: one line ("142 work packages moved · computed finish 12 Mar -> 26 Mar 2027 · minimum Float +4 -> -3"), then *See what moved* grouping the moved WPs under FR-28's **seven** causes with old and new dates, and *Undo this edit*. Persists until the next recalculation or dismissal. **When an edit moves nothing it says "No dates moved"** — silence and nothing-moved are different answers. 300 ms highlight on changed cells, respecting reduced motion. This is OQ-11's own question answered | Core (*Undo this edit* is Comfort) |
| UX-DR11 | **Links panel** (`l`): the selected WP's predecessors **and successors** as rows with the other end's dates and Float, sharing the rail's slot. Same FR-6a checks | Comfort |
| UX-DR12 | **Cell rules on the grid**: derived dates are not editable and typing into one answers "Planned dates are derived. To pin a date, set a constraint." and moves focus to the constraint cell; the **Data Date is rendered on every row** by ink weight, not on a timeline; summary WPs render an em dash whose accessible name says why, **never blank**; negative Float shows its minus sign, never 0 or blank; the critical path is **the word "Critical" plus a rule, not a colour**, with the anchor in the column header; the Schedule preset's Percent Complete is the **Recorded** figure; every exception is glyph + word + number | Core |
| UX-DR13 | **Mark complete** (`Shift+Enter`): asks for the actual finish and proposes today; where the WP has Mapped Tickets the **first observed activity** appears beside the actual start as evidence with a one-click fill and **is never written by the system**; an actual finish before the actual start is refused; an actual date later than the Data Date asks to advance it in the same action | Core |
| UX-DR14 | **Data Date panel** (Review, Project settings, schedule strip): names what will happen before it is pressed — "Advancing to 26 Sep re-dates 78 remaining work packages." Setting it earlier than the latest actual finish is refused with the blocking WPs. **Never advanced except by the PM pressing it** | Core |
| UX-DR15 | **Review page order, fixed**: Header, Status, Unplanned Work (placed directly after Status because it is the reason the report exists), Ahead/Behind, **Progress & Dates**, Effort & Cost, Forecast, Disposition rail. Each section opens with a section title and its 1px ink rule — **required markup, not styling**, because with a single type family that rule is what separates the report pages | Core |
| UX-DR16 | **Review › Progress & Dates**, three blocks in order: (a) Observed vs Recorded Percent Complete side by side, one row per disagreeing leaf WP over a PM-set threshold (default 10 points), worst gap first, saying it in words — "Evidence says 60%. The plan says 30%." — with *Accept* writing a Recorded override behind a mandatory reason and stating the consequence first; (b) Dates that moved, grouped under FR-28's seven causes; (c) the Data Date panel | Core (the gap **threshold setting** is Comfort) |
| UX-DR17 | **Disposition rail and controls**: queue sorted by hours descending; four actions Map / Plan / Change Request candidate / Explain with `m` `p` `c` `e`; Map applies immediately with a one-line change note ("-8h Unplanned"); *Plan* states "counts as Unplanned until the next Re-baseline"; *Explain* shows "Clients see this note only if you publish it"; every Disposition undoable from the group's history until the next publish or export | Core |
| UX-DR18 | **Scope Ledger Bar**: each segment a button filtering the list below, arrow-key navigable, with an hours-share / Ticket-share toggle | Core |
| UX-DR19 | **Metric cell and formula popover**: formula, inputs with their values, one-line interpretation, change within the Period, and drill-down to Tickets or WPs. Non-modal, `Esc` closes, focus returns | Core |
| UX-DR20 | **Snapshot pin** in the top bar: pinned snapshot and its age, live-updating each minute; popover with snapshot time, Connectors, next scheduled snapshot and *Refresh now*. A newer snapshot reads "Newer snapshot available — Re-pin" rather than silently changing figures | Core |
| UX-DR21 | **Import wizard**: column mapper with header text, sample values, suggested field and its reason ("suggested from header 開始日"), unmapped columns defaulting to "Create Custom Field"; Import Preview tree grid with counts bar and unknown-assignees panel; re-import diff with four filters and old -> new per field | Core |
| UX-DR22 | **Rule list**: ordered, reorderable by drag or `Alt+arrow`, with a live preview ("+14 Tickets / +32h would move to WP 2.3; 2 Tickets leave WP 2.1") and **Save disabled until the preview has loaded** | Core |
| UX-DR23 | **35 named state treatments**, each a distinct designed state rather than an error: empty project, no Project start, recalculating (affected cells show "…", never their previous values), plan-not-scheduled (last good schedule with every derived date marked stale — never a guess, never blanks), calendar range exceeded, constraint violated, out-of-sequence (**neutral ink, never amber, never red**), not schedulable yet, negative Float, no Recorded Percent Complete (a **stated state, not a warning**), dates moved by another PM (attributed, **no Undo**), no Baseline, no Connector, first snapshot running, Opening Balance present, Ticket-Count Mode, snapshot stale, Connector error, scope overlap, low/no evidence, PM-adjusted, BAC exhausted, new hours since disposition, rule flipped to Unmapped, left scope, import flagged rows, multiple candidate sheets, upload rejected, loading (figures render "…" not "0"), save failed (cell keeps the edited value, no data loss) | Core |
| UX-DR24 | **Keyboard model**: `g r/p/m/b/c` surface jumps that work regardless of sidebar state; `[` sidebar; `/` filter; `j`/`k`/`x` lists and rails; `m`/`p`/`c`/`e` Dispositions; `u` undo; `?` sheet. On Plan additionally `1`-`4` presets **keeping the focused row**, `Enter`/`Esc`/`Tab` cell editing, `l` Links panel, `e` explainer, `Shift+Enter` mark complete, `g d` Data Date, `x` exceptions drawer, and one modal level only — never stacked | Core |
| UX-DR25 | **Drag-and-drop exists in exactly one place in R0**: Tickets onto WPs in Mapping, with a keyboard equivalent. **Nothing in the plan is edited by dragging** — planned dates are not typed or dragged at all | Core |
| UX-DR26 | **Accessibility floor**: never colour alone (glyph + word everywhere); every chart has a table, and in R0 **the tree grid *is* the schedule** so there is no chart of it to caption; real tables with the ARIA treegrid pattern (`aria-level`, `aria-expanded`, `aria-posinset`, `aria-setsize`); **Float never announced without its anchor**; recalculation announced politely and FR-6a rejections **assertively, because they mean the edit did not happen**; visible focus ring and focus return; `<nav>` landmark with a "Skip to content" link; live regions for Disposition results; reduced motion respected; 200% text resize in the Client View | Core |
| UX-DR27 | **Responsive postures** on the content area, not the viewport: >= 1680px is the only posture where the exceptions rail is a pinned column; 1280-1439px collapses the sidebar by default, which is what keeps the Review's Disposition rail alive and gives the grid its 1,232px; < 1024px is **not supported for editing** (founder decision) with Plan read-only. A manual toggle wins until the viewport crosses a breakpoint | Core |
| UX-DR28 | **Design tokens** from `DESIGN.md`: neutral paper/sheet/sunk surfaces told apart by rules rather than warmth; 藍 indigo primary for actions and the Current Plan; **藤 violet for Unplanned Work — information, never alarm**; muted report-style RAG always paired with glyph + word; distinct Baseline vs Current Plan by outline vs fill and by position; one neutral sans (no second family — founder decision, the report's discipline reads through structure) | Core |
| UX-DR29 | **Voice and tone table, 18 paired rows** — numbers first then meaning; never name people in an Unplanned Work context; "unavailable" never rendered as "0h"; overrides never hidden. R1 Japanese in polite です・ます register, 計画外作業 pending client validation | Core |
| UX-DR30 | **Print stylesheet** (A4 landscape) for the Review, reproducing the report pages, because upward reporting is still document-based. Sidebar, top bar and Disposition rail do not print | Comfort |

### FR Coverage Map

All 36 frozen §8.1 entries, each mapped to exactly one epic. No entry appears twice and none is unmapped.

| FR | Epic | What the epic covers of it |
|---|---|---|
| FR-1 | Epic 1 | Tenant, Department, Program, Project hierarchy; PM assignment; the per-read isolation proof |
| FR-2 | Epic 1 | Tenant Admin and PM roles, permissions, Rate visibility, edit and publish authority (Client Viewer is R1) |
| FR-3 | Epic 1 | Email + password and Google sign-in, configurable idle expiry, revocation on next request (magic link and Microsoft are R1) |
| FR-4 | Epic 1 | English UI with every string externalised, a JA catalog present, JPY fixed once a Rate exists |
| FR-5 | Epic 2 | Create, edit, move and delete WPs; leaf-only scheduling inputs; roll-up; PM-owned actual dates; **no typed planned dates** |
| FR-6a | Epic 2 | FS dependencies with lag between leaf WPs, duration and constraint capture, the four graph rules as invariants |
| FR-6b | Epic 2 | The closed trigger set, forward and backward pass, progress-aware scheduling, Float, critical path, soft constraints, out-of-sequence, determinism |
| FR-7 | Epic 2 | The tree grid as the single R0 scheduling surface, with every column the engine produces (the Gantt is R1). **The one FR that spans epics:** the Schedule preset is wholly Epic 2's; Progress is completed by Epics 5 and 6, Baseline compare by Epic 4, and *All* by Epic 1 — see Epic 2's notes |
| FR-8 | Epic 2 | Custom Fields of four types as columns and grouping axes, to the tested bound of 100 per Project |
| FR-9 | Epic 3 | Upload, sheet and header choice, column mapping with EN/JA suggestions, duration derivation, progress columns, the narrow milestone-constraint exception |
| FR-10 | Epic 3 | The mandatory preview: no commit without confirmation, Project start and Data Date, the schedule and progress previews, counts, untrusted content |
| FR-11 | Epic 3 | Re-import with a diff that separates input changes from the date movement they caused; links and progress survive an ambiguous re-import |
| FR-12 | Epic 1 | Resources with a home Department; Tenant-Admin-only dated Rate history and Project default Rates; retroactive corrections by recomputation |
| FR-13 | Epic 5 | Tracker Account to Resource linking with suggestions; Unattributed hours at the Project default Rate |
| FR-14 | Epic 2 | JP and VN calendars, Project-specific non-working days, and the dated append-only version history **over the national tables** |
| FR-15 | Epic 4 | Set Baseline pinning inputs not only outputs, the automated re-derivation test, no partial pinning |
| FR-16 | Epic 4 | Re-baseline with a mandatory reason, full version history, and comparison **as plans** including the graph diff |
| FR-17 | Epic 5 | Backlog Connector, read-only, client-side approval recorded, hours detected from data, credential rotation, error notification |
| FR-19 | Epic 5 | Scheduled and on-demand snapshots, the interval, freshness, lossless failure, the stored-field whitelist, retention |
| FR-20 | Epic 5 | Scope completeness: the four mutually exclusive figures summing to total ledger hours, per Period and Connector |
| FR-21 | Epic 5 | Manual mapping, remapping and unmapping; attribution follows the current Mapping; **mapping never moves the plan** |
| FR-22 | Epic 5 | Mapping Rules in strict priority order, live on every snapshot, manual always winning, preview before save, logged flips |
| FR-23 | Epic 5 | Mapping coverage per Connector, with Ticket share and hours share reported separately |
| FR-24 | Epic 5 | Catch-all WPs measured as Level of Effort when baselined, overflow as Unplanned Work counted once |
| FR-25 | Epic 5 | Ledger entries from snapshot deltas, Period assignment, negative deltas kept and costed, corrections as new entries |
| FR-26 | Epic 5 | Every person-level and day-level breakdown labelled approximate with its reason; no ranking of people |
| FR-27 | Epic 5 | Ticket-Count Mode: what is still computed, what reads "unavailable" rather than zero, mixed-Connector coverage |
| FR-28 | Epic 6 | The Reconciliation Review, pinned to one snapshot, with the **seven-cause** date-movement list and the Data Date offer |
| FR-29 | Epic 6 | The four Dispositions, the *Plan* WP proposal from work already done, "new hours since disposition", group semantics |
| FR-30 | Epic 6 | EVM in hours with Typical EAC, Observed vs Recorded Percent Complete, Unplanned Work with no earned value, both CPIs |
| FR-31 | Epic 6 | Three Health Indicators and the overall status, both milestone rules, negative Float, the constraint-violation rule, thresholds with overrides |
| FR-32 | Epic 6 | The effort forecast and **both** finish dates — computed and trend — labelled, with the gap named when they disagree |
| FR-38 | Epic 7 | Fixed-layout xlsx report of the current PM view, with formula prefixes neutralised |
| FR-39 | Epic 7 | Raw export complete enough to recompute every metric **and re-derive the schedule** outside the tool |
| FR-42 | Epic 5 | Opening Balances in exactly two cases, later first sightings as deltas, left scope, moves within scope, one owner, the sum invariant |
| FR-43 | Epic 2 | Project start, optional Project finish and Data Date as Project settings; the Data Date as the only thing that advances the plan |

**Count check:** 36 rows. Epic 1 covers 5 (FR-1, 2, 3, 4, 12); Epic 2 covers 7 (FR-5, 6a, 6b, 7, 8, 14, 43); Epic 3 covers 3 (FR-9, 10, 11); Epic 4 covers 2 (FR-15, 16); Epic 5 covers 12 (FR-13, 17, 19, 20, 21, 22, 23, 24, 25, 26, 27, 42); Epic 6 covers 5 (FR-28, 29, 30, 31, 32); Epic 7 covers 2 (FR-38, 39); **Epic 8 covers none, by design**. 5 + 7 + 3 + 2 + 12 + 5 + 2 + 0 = **36**.

**Most NFRs are not separately epic'd**, because they are not deliverable on their own: each is an acceptance criterion on the stories of the epic whose behaviour it constrains. NFR-S1, S2, S8, A1, C1's integer and codec discipline and I1's externalisation land in Epic 1's substrate stories; NFR-R1 in Epic 5; NFR-U1 on every surface story. **NFR-P1 is measured in three places against one fixture** — 5 Projects x 500 WPs x 2,000 Tickets, built in Epic 1 and consumed by Epic 2 (the 300 ms recalculation), Epic 5 (the 5-minute snapshot) and Epic 6 (the 2 s Review load); it is named as Epic 1's deliverable because an unowned fixture is how an NFR quietly stops being measured. NFR-S5, NFR-S7 and NFR-R2's restore rehearsal are R1 and appear nowhere here.

**Four NFRs do need their own epic**, because the work behind them is real and no FR story would carry it: **NFR-S3, NFR-S4, NFR-D1 and NFR-O1, plus NFR-R2's backups, are Epic 8.** They are what §8.1's fourteenth scope bullet — *"Hosting in a Japan region"* — actually asks for. The 36-FR map above is complete; it is simply not the whole of R0, and Epic 8 is the difference.

## Epic List

**Eight epics. All 36 FR entries land in Epics 1–7, no FR in two epics and none in none; Epic 8 carries no FR and exists because the FR list is not the whole of R0.** Ordered so that each one is standalone: it delivers complete functionality for its domain, it may build on the epics before it, and no epic requires a later epic to function.

**Two honest qualifications on that last claim**, both found by an Assumption Audit of an earlier seven-epic draft and kept here rather than smoothed over:

- **Standalone means "runs and delivers", not always "fully acceptance-testable alone".** Epic 5 is the case: it runs before Epic 4 exists, but FR-20's baselined bucket and FR-24's Level-of-Effort branch have nothing to fire on until a Baseline does. The order below puts 4 before 5 for exactly that reason.
- **FR-7 is the one FR that genuinely spans epics**, because its four column presets read data four different epics produce. It is mapped to Epic 2 because that is where the surface and its default preset are built, and the spread is stated in Epic 2's notes rather than hidden by the mapping.

Context assessment behind the count: the architecture spine (AD-1 … AD-30) and both UX spines are final and merged, and the CI gate list is fixed, so the outcome is largely certain and the guidance is to prefer fewer, larger epics. Epics were merged where they would have churned the same files — the Connector and the Mapping layer both live in `domain/attribution` and `app/mapping`, EVM and the Review share one compute pipeline and one surface, and FR-5, FR-7, FR-8, FR-43, FR-6a and FR-6b are all **one surface** in `EXPERIENCE.md`, so splitting the engine from the grid it feeds would have torn a single surface across two epics.

### Epic 1: A Tenant, its people, and nothing leaking between them

A Tenant Admin can stand up the organisation — Departments, Programs, Projects, PM assignments, Resources and their dated Rate history — invite PMs, and sign in with email and password or Google. Every read is covered by an automated proof that no other Tenant's data comes back, and every action that changes reported numbers or who can see them is already in the audit log. The English UI ships with every string externalised and a Japanese catalog in place, so R1 is a translation rather than a refactor.

**FRs covered:** FR-1, FR-2 (Tenant Admin and PM only), FR-3 (email + password and Google), FR-4 (English UI, all strings externalised), FR-12

**Implementation notes.** This is where the substrate lands, because FR-1's own testable consequence *is* the isolation proof: the workspace and its import fences (AR-1, AR-2), the `table-classes.ts` registry that generates RLS, grants and triggers (AR-38), `FORCE ROW LEVEL SECURITY` and `withTenant` (AR-4), the cross-tenant harness (AR-5), the integer and codec discipline (AR-6, AR-8), append-only enforcement (AR-9), the audit-in-the-same-transaction rule (AR-26), the identity bridge (AR-40), the `Clock` port (AR-27), SES mail — which is **R0, not R1**, because FR-3's password reset needs it (AR-33) — and the one-command local run with its four decided version traps (AR-30, AR-31).

**It wraps the demo spike's schema; it does not rebuild it from scratch.** This matters because AD-30 is written as a *delta* — it drops `work_package.start`, `.finish`, `.completed_at` and `.milestone_done_at` and rewrites `baseline_version` and `baseline_wp`, which only means anything if those columns are still there when Epic 2 runs. AD-30 says so itself: *"This migration closes the scheduling slice only; the remainder stays an outstanding build item."* So Epic 1 registers the existing tables in `table-classes.ts`, generates RLS, grants and triggers over them, and adds the AR-38 event tables it needs — and leaves the four doomed columns alone for AD-30 to drop. A reader who builds Epic 1 as a greenfield schema makes Epic 2's story 1 incoherent. The 46-file reconciliation is settled in Epic 2's disposal story.

**Epic 1 also owns the NFR-P1 load fixture** — 5 Projects x 500 WPs x 2,000 Tickets — because the seed and the fixture machinery live here (AR-27, AR-32, AR-41). No FR story would otherwise carry it, and three later epics measure against it: Epic 2 for the 300 ms recalculation, Epic 5 for the 5-minute snapshot, Epic 6 for the 2 s Review load. An unowned fixture is how an NFR quietly stops being measured.

### Epic 2: A plan that re-dates itself when the work slips

A PM can build a Plan by hand and have it schedule itself. Leaf WPs carry a duration, finish-to-start dependencies with lag, and one of three constraint types; the Project carries a start, an optional finish and a Data Date; the calendar carries JP and VN working days with a dated version history. **A slipped task moves the tasks that depend on it**, Float and the critical path are always current, negative Float shows as a negative number against a Project finish the PM set, and every constraint violation, out-of-sequence link and un-schedulable WP is listed with the chain behind it. The tree grid is the single scheduling surface and carries every column the engine produces.

**FRs covered:** FR-5, FR-6a, FR-6b, FR-7 (tree grid only — the Gantt is R1), FR-8, FR-14, FR-43

**Implementation notes.** The riskiest epic: this capability has no line of code today, and it is the reason the plan can leave Excel. Four things fix its internal order, and two things bound what it can finish.

1. **AD-30's single migration is story 1 and blocks every other story in this epic.** It is one pre-production migration that adds four tables and the input columns, drops `work_package.start`, `.finish`, `.completed_at` and `.milestone_done_at`, and rewrites `baseline_version` and `baseline_wp`. Three clauses Drizzle 0.45.2 cannot emit are hand-written SQL with CI assertions (AR-59). The expand/contract exemption is **spent here, once**. It is a delta against the schema Epic 1 wrapped, not a greenfield create — see Epic 1's notes.
2. **The demo-spike disposal is story 2**, immediately after the migration that breaks the spike, and carries the complete 46-file E-3 reconciliation table.
3. **The engine is pure, so it is built and proved before any database work.** `domain/schedule.recalculate(inputs, prevInputs) → outputs` reads nothing but its arguments (AR-47), so the passes, Float, the critical path, violations and out-of-sequence handling are testable with no DB at all. `compareWp` (AR-55) comes first because the engine's ordered outputs need it.
4. **The golden scheduler corpus is its own story, not an acceptance criterion elsewhere.** Of AD-19's six scheduler gates, five test internal consistency; only the corpus of hand-computed expected outputs tests whether the engine is **right** (AR-35). Folding it into another story's AC would hide the one gate that could catch a wrong answer.

**Risk gate inside this epic.** The story that first persists a `schedule_run` measures the real payload against AD-26's measured 385 kB raw / ~141 kB stored / ~152 kB WAL, and exercises AD-5's retention-by-reference rule. If the recalculation misses NFR-P1's 300 ms p95, AD-27 fixes the lever — **lock granularity, never a background path** — and that is a fence-shape change, so it must surface here rather than in Epic 6.

**What this epic cannot finish, and why that is not a defect.** FR-7's tree grid is built here, but only one of its four column presets is wholly Epic 2's. The other three read figures later epics produce, so their stories carry a dependency the FR mapping alone does not show:

| Preset | Tier | Columns after the frozen three | Completed by |
|---|---|---|---|
| **Schedule** (default) | Core | Derived start, derived finish, duration, predecessors, constraint, Float, Critical, Exception | **Epic 2 alone** |
| **Progress** | Core | Actual start, actual finish, Recorded %, *Observed %*, *Gap*, remaining duration, *Evidence* | Epic 2 + **5** (Mapped Tickets) + **6** (FR-30's Observed figure) |
| **Baseline compare** | Core | Baseline vs derived dates, durations and effort with their deltas | Epic 2 + **4** |
| **All** | Comfort | Everything above, plus planned effort, Resources, Custom Fields | + **Epic 1** (Resources) |

The same seam runs through the inputs. **FR-6b reads the Recorded Percent Complete, and R0 has exactly two writers for it** — the Excel import (FR-9, Epic 3) and the PM's audited override (FR-30, Epic 6). Neither is in this epic. That is not a hole in FR-6b: a WP with no Recorded value is scheduled as 0% done, which FR-6b states outright. But it does mean the *in progress* branch — where remaining duration shrinks below the full duration — is exercised inside Epic 2 only through the seed and the golden corpus, and reaches a real PM path in Epic 3. The Plan grid's own Recorded % cell is an ordinary input edit through the AD-25 fence and belongs here; **FR-30's audited override, with its mandatory reason and its Observed-vs-Recorded comparison, is Epic 6's**.

### Epic 3: The client's Excel WBS becomes a live plan in one session

A PM can upload a real client .xlsx, choose the sheet and header row, map columns with header-based suggestions in English and Japanese, and see every row in a mandatory preview before anything is written — with its level, the duration derived from an imported start/finish pair, the dependencies and constraints read, the progress read, which of the three scheduling states each row will arrive in, and the dates the scheduler will produce. A mid-flight project therefore arrives mid-flight. A later version of the same file re-imports as a diff that separates input changes from the date movement they caused.

**FRs covered:** FR-9, FR-10, FR-11

**Implementation notes.** Genuine risk boundary of its own: AD-13 records that **ExcelJS fit is a spike, not an assumption**, so the first import story parses three real Japanese WBS workbooks through `WorkbookPort` and asserts merge ranges and cached formula results, with SheetJS CE as the named fallback. Limits are checked from the zip central directory **before ExcelJS sees the file** (AR-24). The importer writes scheduling inputs and actual dates and **never a derived date**; `confirmImport` calls the recalculation **once**, after the whole diff commits (AR-24, AR-54). The acceptance corpus of 10 real client files is **not in the repo** and its tests run under a local-only tag (AR-41).

### Epic 4: A Baseline that can explain itself years later

A PM can set a Baseline from the Current Plan and Re-baseline with a mandatory reason, linking Change Request candidates. Every version is kept with its author, time and reason, and any two versions compare **as plans, not only as rows** — dependencies added and removed, lags, constraints, durations, actual dates, progress, milestone flags, the calendar version and the three Project settings — so no WP can move between versions without a recorded input change that accounts for it. An automated test re-derives a Baseline's dates, Float, constraint violations and critical path from its pinned inputs alone, on any machine, at any later date.

**FRs covered:** FR-15, FR-16

**Implementation notes.** The Baseline **points at a `schedule_run`; it does not re-copy the inputs** (AR-22), and `baseline_wp` keeps only the cost projection that PV, BAC and Divergence read. Retention-by-reference makes the pointer permanent (AR-11). The re-derivation test runs under each run's **own** recorded `engine_version`, so a later scheduler fix does not turn history red (AR-51), and compares through the codec's canonical form rather than column text (AR-8). A Baseline is refused while any leaf WP has no duration or the Project has no Project start.

### Epic 5: The work actually done arrives from Backlog and lands on the plan

A PM can connect a Project to a Backlog space read-only, record who on the client side approved it, and watch an always-on snapshot service build an append-only Actuals Ledger from snapshot deltas — with hours a Ticket already had recorded as an Opening Balance so a project connected mid-flight shows no false spike. They can link Tracker Accounts to Resources, map Tickets to leaf WPs by hand or by priority-ordered rule, flag Catch-all WPs, and see coverage per Connector. Every in-scope Ticket is either mapped or reported as unmapped, nothing is silently excluded, and a space that exposes no hours runs honestly in Ticket-Count Mode rather than showing zeros.

**FRs covered:** FR-13, FR-17, FR-19, FR-20, FR-21, FR-22, FR-23, FR-24, FR-25, FR-26, FR-27, FR-42

**Implementation notes.** The largest epic by FR count, and one journey (UJ-2) across one set of modules — `adapters/backlog-http`, `app/ingest`, `app/mapping`, `domain/attribution` — which is why it is not split. The invariant this epic must not break is the one the whole product rests on: **mapping, remapping and hourly background rule evaluation change attribution and never a date** (AR-52's reachability test). Paginated completeness is read `sort=created&order=asc` with Count Issues before and after, because Backlog's default `updated desc` silently skips Tickets while still looking finished (AR-13); `left_scope` needs **two** consecutive complete reads (AR-15); the measurement basis latches with hysteresis N = 3 in both directions, with no confirmation screen (AR-17, founder decision A3); and unmapping is `release` only in R0 (AR-18, founder decision A4). **OQ-2 is still open** — whether the five target Backlog spaces expose actual hours — and this epic handles both answers, but the fixture scenarios should be re-recorded once the founder checks.

### Epic 6: Thursday's teirei report in twenty minutes

A PM can open the Reconciliation Review for any Reporting Period, pinned to one Tracker Snapshot, and read the four report pages they used to rebuild by hand every week. Honest EVM in effort hours with Unplanned Work carrying actual effort and no earned value; both CPIs side by side; three Health Indicators and an overall status, each showing the rule behind its colour; the forecast with the two finish dates and the gap between them named; every WP whose dates moved carrying one of seven causes; and the evidence and the plan made to face each other, so a WP the Tickets say is 60% done and the plan treats as untouched is visible rather than assumed. They then disposition every Unmapped Ticket — Map, Plan, Change Request candidate or Explain — and advance the Data Date deliberately.

**FRs covered:** FR-28, FR-29, FR-30 (Typical EAC only), FR-31, FR-32

**Implementation notes.** Every figure is `compute(inputs, formulaVersion)` and the closure test enforces that each one comes from an append-only source `ComputationInputs` pins (AR-19). **The Review's pin is split** — Tracker-side inputs stay frozen so numbers do not move under the PM, while PM-authored watermarks **and `schedule_run_seq`** are re-captured after each write, because three of them are recalculation triggers and freezing the run would show new EVM against a superseded schedule (AR-20). Formulas come from `docs/references/` and were checked against them: CV, SV, CPI, SPI, TCPI and Typical EAC = BAC / CPI. `recordDisposition` is the only Disposition writer and stores the **explicit Ticket list at record time** (AR-39). FR-28's cause list is closed at **seven**, and there is deliberately no cause for a mapping change, because a mapping change cannot move a date.

### Epic 7: The numbers and the plan both leave the tool

A PM can export a fixed-layout xlsx report of the current PM view — EVM, Health Indicators, Unplanned Work, the forecast, milestones and the WP table — and a raw export of everything behind it. The raw export is complete enough to recompute every EVM metric outside the tool **and to re-derive the schedule**: the dependency graph with lags, durations, constraints, actual dates, progress, the calendar version and its history, the Data Date and its history, and each Baseline with the inputs it pinned. A PM leaving momo-keikaku takes a working plan, not a picture of one.

**FRs covered:** FR-38 (R0: fixed layout of the current PM view), FR-39

**Implementation notes.** Small epic, but it is the claim an Excel refugee will actually test, and the stronger half of the no-lock-in promise. Every xlsx and CSV writer goes through one `safeCell()` that neutralises the four formula prefixes (AR-29). The raw export ships only the snapshots whose observations survived compaction, and says so on the export (AR-10). Exports are an audited action (NFR-A1).

### Epic 8: It runs in Tokyo, it is backed up, and the operator can see it

The founder can run R0 as a real service in a Japan region rather than on a laptop: both roles deployed, the database encrypted with in-region backups, uploads and mail in Tokyo, schema migrations applied by a privileged one-off task before the services roll, an operator view of Connector health and snapshot lag that contains no customer data, alarms that reach a human when a snapshot run fails or a recalculation halts on calendar range, and a documented, audited procedure for deleting a Tenant's data within 30 days.

**FRs covered:** none. **This epic exists because the FR list is not the whole of R0.**

**Implementation notes.** §8.1's scope bullets have fourteen entries; thirteen map onto Epics 1–7 and the fourteenth — **"Hosting in a Japan region"** — carries no FR number at all. Its requirements are NFR-S3, NFR-S4, NFR-D1 and NFR-O1, with NFR-R2's backups, and its design is AD-18 and AD-19. A coverage map that is complete against the 36 FRs and silent on this bullet is complete against the wrong list, which is why the epic is here rather than dissolved into the others.

The work is named in the spine and is not small: ECS Fargate `web` behind an ALB at TLS 1.2+ and `worker` at desired count 1; RDS PostgreSQL 18 with encrypted storage and 30-day in-region automated backups, its minor tracked to local; S3 Tokyo with SSE, versioning off and a lifecycle expiry; **SES production access, which is an R0 launch task because a new account starts in the sandbox at 200 mails a day** (AR-33); the migration task that runs `drizzle-kit migrate` as the `migrator` role and re-applies `rls.sql`, `grants.sql` and the trigger SQL before the services roll (AR-34); `pino` to CloudWatch with AR-36's alarm set, including the two scheduler alarms only an operator can clear; and NFR-D1's `purgeTenant` procedure through the `maintenance` role, with no UI (CA-5).

It is ordered last because nothing else depends on it, and it needs only Epic 1. It is **not** the same thing as the deferred items: AD-18 and AD-19 fix the topology, the migration discipline, the alerting and the CI gates, while the **IaC tool, CI provider and deploy pipeline stay deferred to the first staging deploy** (AR-62). This epic builds the thing those tools would automate; choosing the tools is still open.

### Epic order and what each one needs

| Epic | Needs | Delivers standalone | Does **not** need |
|---|---|---|---|
| 1 | — | A Tenant, its org, its people, sign-in, isolation proof, audit, and the NFR-P1 load fixture | 2–8 |
| 2 | 1 (a Project to plan) | A hand-built Plan that schedules itself, on one surface, with the Schedule preset complete | 3–8 to run. WPs are created by hand, which is `EXPERIENCE.md`'s own empty state. The Progress and Baseline compare presets are *completed* by Epics 4–6, per the table above |
| 3 | 2 (something to import into) | A real client .xlsx becoming that Plan, and the first real writer of Recorded Percent Complete | 4–8 |
| 4 | 2 (a `schedule_run` to pin) | A re-derivable Baseline history | 5–8 |
| 5 | 1 (Resources), 2 (leaf WPs to map to) to **run**; 4 to be **fully accepted** | Actual hours arriving and attributed | 6–8 to run. Before the first Baseline everything is non-baselined — the designed "No Baseline yet" state — but FR-20's baselined bucket and FR-24's Level-of-Effort branch cannot be accepted until Epic 4 exists, which is why 4 is ordered first |
| 6 | 1, 2, 4, 5 | The weekly review, Dispositions, and FR-30's audited override | 7, 8 |
| 7 | 2, 4, 5, 6 | Both exports | 8 |
| 8 | 1 | R0 running in Tokyo, backed up, and visible to its operator | — |

---

## Carried to `bmad-sprint-planning` (not decided here)

**1. §8.3's first cut removes milestone target dates, and the cut order does not say so.**

PRD §8.3 item 1 is "the two extra constraint types (*must start on*, *must finish on*) -> *as soon as possible* only". But PRD §3 defines a **milestone's target date as a *must finish on* constraint** — "not a date field of its own: it is captured, scheduled, violated, exported and baselined exactly like any other constraint". Taken literally, item 1 therefore also deletes every milestone target date, and:

- FR-31's two milestone rules (*milestone slip, actual* and *milestone slip, forecast*) lose their input entirely;
- FR-9's milestone import has nothing to write;
- FR-7's milestone column and UX-DR7's "a milestone's target **is** its constraint" have nothing to render;
- the Review's Milestones table (UX-DR15 section 4) loses its Baseline-date comparison.

§8.3 itself names a replacement in passing — "the cheapest is a milestone-only deadline flag that reports slip without participating in the passes" — and `ARCHITECTURE-SPINE.md` › *Deferred* records the same finding independently: *"taking the cut as written removes milestone target dates along with it, and FR-31's milestone rule loses its input. That is a product consequence for `bmad-sprint-planning` to weigh, not an architecture decision."*

**This artifact does not decide it.** Note the asymmetry it creates: the cut itself needs no correct-course pass (§7.3 permits cutting), but the milestone-only deadline flag that rescues FR-31 **is a capability no FR states**, so building it would need one. Sprint planning should weigh the cut knowing that its cheapest mitigation is not free of governance.

**2. OQ-11's cost half.** The design is done (PR #3). PRD OQ-11 requires the plan surface to be sized as **its own line item, separately from the FR-6b engine**, because "the engine being cheap is the reason the surface keeps being costed as though it were". `EXPERIENCE.md` › *Build Tiers* exists to make that sizing produce **two** numbers, and its Comfort rows carry a suggested cut order that sits **above** §8.3 item 1, because cutting Comfort removes no FR behaviour and cutting the constraint types does.

**3. OQ-12 itself.** No estimate appears anywhere in this document. Every story below is scoped to be independently estimable and carries its blocking order, its FR references and its Core/Comfort tier.

**4. The demo spike's fate.** Epic 2's disposal story (see *E-3 reconciliation*) assumes `packages/domain` and its golden tests survive and `apps/web` plus `packages/db` are rewritten, following the `decisions-pending` D1 note. Sprint planning may reduce that further.

## Candidate scope additions — would need `bmad-correct-course`

Recorded rather than written into any acceptance criterion, per PRD §7.3. **This list exists so that skipping the brake would be a visible omission in a file.** None of these is in any story below.

| # | Candidate | Why no FR covers it |
|---|---|---|
| CA-1 | A milestone-only deadline flag that reports slip without participating in the passes | §8.3 names it as the cheapest mitigation for cut item 1, but no FR states it. A milestone target is a constraint (§3, FR-9, FR-6b) and nothing else |
| CA-2 | A PM confirmation screen before a Connector returns to Ticket-Count Mode | The architecture spine's adversarial review recommended it; **founder decision A3 refused it** (auto-latch both ways, no new screen). Reviving it is a new screen |
| CA-3 | Exposing "pinned Unmapped" (`manual, wp_id = null`) as a distinct PM action | **Founder decision A4: `release` only in R0.** AD-9 reserves the shape; FR-21 and FR-22 do not state the action |
| CA-4 | A preview-and-apply or draft mode for the scheduler | FR-6b recalculates the moment an input changes. `EXPERIENCE.md` rejects it explicitly: a draft plan waiting for approval would be a second plan |
| CA-5 | Any UI for `purgeTenant` | NFR-D1 ships the deletion path in R0 as a **documented, audited operator procedure with no UI** (founder decision) |
| CA-6 | Recovery behaviour on a violated constraint — crash, fast-track, re-plan | PRD §8.3 excludes it from R0. R0 reports the violation, its size and the chain |
| CA-7 | A Gantt, in any form, in R0 | FR-7 puts it in R1. §7.3's table names wanting a Gantt in R0 as the example of an addition |
| CA-8 | Deriving an actual date from tracker evidence, in any surface | First observed activity is display-only evidence with a one-click fill (§3, FR-5, FR-21, FR-22). Writing it is the failure the whole invariant exists to prevent |
| CA-9 | Dropping FR-32's trend finish | `review-readiness.md` Part 5 recommends it as a cut ahead of §8.3 item 1, but it is **not in the cut order**. Adding a cut to the order is a PRD edit |

## Invariants every story below must respect

Restated from the PRD and the spine, as a checklist for story review. A story that contradicts one of these is wrong, not a variant.

1. **Nothing derived from Tracker evidence is ever a scheduling input** (FR-6b, AD-27). Snapshots, ledger entries, Mappings, Mapping Rules and the Observed Percent Complete drive attribution, Unplanned Work and EVM — and never a date. Enforced structurally: `schedule_run.inputs` carries `recorded_pct` alone, and `domain/schedule` may not import `domain/attribution`.
2. **One path writes dates.** `app/schedule.applyPlanChange` performs the input write **and** the recalculation in one transaction under the per-Project lock (AD-25, AD-27). Not the importer, not a re-import, not a Disposition, not the Mapping layer, not a snapshot, not the PM.
3. **The critical path is the set of WPs whose Float equals the *minimum* Float measured against the anchor — never the zero-Float set** (FR-6b, §3, AD-26). Zero on a plan with slack, negative on a plan that cannot meet a PM-set Project finish. A late plan has no zero-Float WPs, and defining it that way drops the chain that decides the finish exactly when the plan is in trouble.
4. **`actual_start` and `actual_finish` have exactly one home: `wp_status_event`** (AD-25, AD-21). No `work_package` column, no `completed_at`, no `milestone_done_at`. "Done" means the WP has an actual finish.
5. **A Baseline points at a `schedule_run`; it does not re-copy the inputs** (AD-26, AD-11). `baseline_wp` keeps only the cost projection PV, BAC and Divergence read. Retention makes the reference permanent.
6. **A constraint violation stays on the WP that owns it.** It is never negative Float on that WP or upstream, it changes no other WP's Float, and it never displaces the critical path (FR-6b, AD-26).
7. **The Data Date is the only thing that advances the plan through time**, and it is never advanced automatically (FR-43, §3).
8. **An actual date always wins.** The "a successor never starts before its predecessor finishes" invariant binds **remaining work only** (FR-6b).
9. **Outside the calendar's loaded range the scheduler halts rather than guesses** (FR-6b, AD-29).
10. **Determinism through one ordering site.** `compareWp` orders everything the scheduler reports (AD-28), and "identical" always means identical in the AD-4 codec's canonical form, never column text.
