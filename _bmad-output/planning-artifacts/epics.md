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

### Map versus territory — the measured baseline

The architecture spine describes the system as it will be. This section records the repository as it **is**, measured on `main` at `87d9915`, because an earlier draft of this document said Epic 1 "wraps the existing schema" and that turned out to be true of the 17 tables and false of everything else. Every figure below was read out of the repo, not out of the spine.

| What the spine requires | What exists on `main` | Gap |
|---|---|---|
| 8 workspace units: `apps/{web,worker}`, `packages/{domain,app,db,db/auth,adapters,i18n}` | 3: `apps/web`, `packages/db`, `packages/domain` | **5 missing**, including `packages/app` — the whole application layer |
| 25 insert-only tables (AD-5) | 9: `baseline_version`, `baseline_wp`, `tracker_snapshot`, `ticket_observation`, `actuals_ledger_entry`, `mapping_event`, `rate_entry`, `disposition_event`, `audit_log` | **16 missing**; AD-30 creates 2 of them, 12 of the rest are R0 |
| `apps/web` calls only `packages/app` use cases (AD-1) | 8 files import `@momo/db` directly — `getDb`, `schema`, `loadReview`, `loadProjectBundle` | **AD-1's central rule is violated today** |
| Better Auth `user`/`session`/`account`/`verification` plus `tenant_membership` (AD-23) | `app_user`, a flat table with a `role` text column | **No auth at all** |
| `program`, `tracker_account`, `ticket`, `import_draft`, `operator_audit` | none of them | 5 tables FRs or ADs require |
| `wp_status_event` as the single home of actual dates (AD-25) | absent; `work_package.completed_at` and `.milestone_done_at` are the only home | see Epic 1 and Epic 2's story 1 |

**What the spike does have, and is worth keeping:** `packages/domain` with `attribution`, `calendar`, `evm`, `forecast`, `health`, `ledger`, `mapping`, `present`, `review`, `units` and their golden tests; the 17 data shapes; `fixtures/backlog` and `fixtures/demo`; a working `docker-compose.yml`. That is why the disposal story keeps `packages/domain` rather than starting over.

**The consequence for sizing (OQ-12): Epic 1 is the largest epic in this plan, not the smallest.** It reads like set-up and it is actually the application layer, the auth stack, the worker role, the adapters, the i18n catalogs, twelve event tables and a rewiring of every page in `apps/web`. Anyone sizing it from the phrase "stand up the workspace" will under-size R0 at its first epic.

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

**It wraps the spike's 17 tables; it builds everything else.** The measured baseline above is the honest scope. Three parts of it decide this epic's stories.

**(a) Five of the eight workspace units do not exist.** `packages/app` — use cases, ports, `RequestContext`, authz, audit, config — is the largest, and every AR that names an `app/*` module currently has no home: `applyPlanChange` (AR-43), `recalculateProject` (AR-47), `ingestSnapshot` (AR-15), `recordDisposition` (AR-39), `publishCalendarVersion` (AR-57). `packages/adapters`, `packages/db/auth`, `packages/i18n` and `apps/worker` are also absent. This epic creates the skeleton; later epics fill their own modules into it.

**(b) AD-1's central rule is violated today, in eight files.** `apps/web` imports `@momo/db` directly. So the dependency-cruiser gate is not a switch to flip — **eight pages and server actions have to be rewired through a layer that does not exist yet, and the gate is turned on after that rewiring, not before.** Turning it on first means CI is red on day one for a reason nobody can fix that day.

**(c) The schema work splits in two, and the split is what keeps AD-30 coherent.** AD-30 is a *delta*: it drops `work_package.start`, `.finish`, `.completed_at` and `.milestone_done_at` and rewrites `baseline_version` and `baseline_wp`, which only means anything if those columns are still there when Epic 2 runs — and they are. AD-30 says as much itself: *"This migration closes the scheduling slice only; the remainder stays an outstanding build item."* So this epic **registers the 17 existing tables** in `table-classes.ts`, generates RLS, grants and triggers over them, and **creates the R0 event tables AD-21 requires**, while leaving the four doomed columns alone for AD-30 to drop.

**`wp_status_event` is the prerequisite AD-30 assumes and nobody wrote down.** AD-30 says it *"adds the actual-date fields on `wp_status_event`"*, and AD-25 drops `completed_at` and `milestone_done_at` because that table *"already carries"* the WP-marked-complete fact. **That "already" is true of the design and false of the repository:** `wp_status_event` does not exist, and those two columns are currently the only home.

**So AD-30 creates the table whole** — status fields and actual-date fields together — in Epic 2's story 2.1. It is one pre-production migration with nothing deployed behind it, so creating a table outright is within what it already does, and AD-30's "adds the fields on" reads as the minimal coherent instruction once the table's absence is known. An earlier draft of this document split it, having Epic 1 create the table and AD-30 extend it; writing Epic 1's stories showed that to be wrong, because **no Epic 1 story needs the table**, and inventing one would have broken the create-only-what-the-story-needs rule for no gain.

**The twelve R0 event tables, each with an owner.** The owner is **the epic whose first story actually needs the table**, which is why four of them moved out of Epic 1 once Epic 1's stories were written — a table nobody reads yet has no business being created early:

| Table | Created in | Why there |
|---|---|---|
| `wp_status_event` | **Epic 2** | created whole by AD-30 in story 2.1; FR-5's actual dates are its first reader |
| `project_setting_event` | Epic 5 | tz and teirei weekday, first needed to place a ledger entry in a Reporting Period |
| `tenant_setting_event` | Epic 6 | the Tenant's default Health thresholds (FR-31) |
| `project_default_rate_entry` | Epic 1 | FR-12's Project default Rate, bitemporal like `rate_entry` |
| `wp_flag_event` | Epic 5 | the Catch-all flag is FR-24, and attribution is its only reader |
| `pct_override_event` | Epic 2 | Recorded Percent Complete, written through the AD-25 fence |
| `calendar_day_event` | Epic 2 | FR-14's Project non-working days, the input a version is built from |
| `tracker_account_link_event` | Epic 5 | FR-13 |
| `connector_scope_event` | Epic 5 | FR-20, FR-42 |
| `connector_setting_event` | Epic 5 | the Resolved status set |
| `measurement_basis_event` | Epic 5 | AD-8's latched basis |
| `connector_ownership_event` | Epic 5 | FR-42's ownership transfer |

`visibility_policy_event` and `published_snapshot` are the remaining two and are R1, so they appear nowhere here. `schedule_run`, `holiday_calendar_version` and `wp_status_event` are AD-30's, in story 2.1. **Epic 1 therefore creates exactly one of the twelve** (`project_default_rate_entry`, in story 1.6); Epic 2 creates three, Epic 5 seven and Epic 6 one.

**Five non-event tables are missing too**, and each belongs to the epic that needs it: **`program` → Epic 1** (FR-1's hierarchy has no Program table today), `import_draft` → Epic 3, `tracker_account` and `ticket` → Epic 5, `operator_audit` → Epic 8. `mapping_head` and `connector_overlap` are `derived` and land with Epic 5's module that owns their source.

**FR-2 and FR-3 are greenfield here, not an extension.** There is no auth in the repository: `app_user` is a flat table with a `role` text column, and none of Better Auth's `user`, `session`, `account` or `verification` tables exists, nor `tenant_membership` — which AD-23 calls *"exactly one non-RLS bridge"*. So this epic builds the identity stack, the bridge, `resolveRequestContext`, the disabled session-cookie cache and the idle expiry from nothing.

The 46-file reconciliation is settled in Epic 2's disposal story.

**Epic 1 also owns the NFR-P1 load fixture** — 5 Projects x 500 WPs x 2,000 Tickets — because the seed and the fixture machinery live here (AR-27, AR-32, AR-41). No FR story would otherwise carry it, and three later epics measure against it: Epic 2 for the 300 ms recalculation, Epic 5 for the 5-minute snapshot, Epic 6 for the 2 s Review load. An unowned fixture is how an NFR quietly stops being measured.

### Epic 2: A plan that re-dates itself when the work slips

A PM can build a Plan by hand and have it schedule itself. Leaf WPs carry a duration, finish-to-start dependencies with lag, and one of three constraint types; the Project carries a start, an optional finish and a Data Date; the calendar carries JP and VN working days with a dated version history. **A slipped task moves the tasks that depend on it**, Float and the critical path are always current, negative Float shows as a negative number against a Project finish the PM set, and every constraint violation, out-of-sequence link and un-schedulable WP is listed with the chain behind it. The tree grid is the single scheduling surface and carries every column the engine produces.

**FRs covered:** FR-5, FR-6a, FR-6b, FR-7 (tree grid only — the Gantt is R1), FR-8, FR-14, FR-43

**Implementation notes.** The riskiest epic: this capability has no line of code today, and it is the reason the plan can leave Excel. Four things fix its internal order, and two things bound what it can finish.

1. **AD-30's single migration is story 1 and blocks every other story in this epic.** It is one pre-production migration that adds four tables and the input columns, drops `work_package.start`, `.finish`, `.completed_at` and `.milestone_done_at`, and rewrites `baseline_version` and `baseline_wp`. Three clauses Drizzle 0.45.2 cannot emit are hand-written SQL with CI assertions (AR-59). The expand/contract exemption is **spent here, once**. It is a delta against the schema Epic 1 wrapped, not a greenfield create, and it carries a prerequisite AD-30's own wording assumes: **`wp_status_event` must already exist**, because that is where the dropped `completed_at` and `milestone_done_at` go. Epic 1 creates it; this story adds its actual-date fields. See Epic 1's notes.
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

**Implementation notes.** Genuine risk boundary of its own: AD-13 records that **ExcelJS fit is a spike, not an assumption**, so the first import story parses three real Japanese WBS workbooks through `WorkbookPort` and asserts merge ranges and cached formula results, with SheetJS CE as the named fallback. Limits are checked from the zip central directory **before ExcelJS sees the file** (AR-24). The importer writes scheduling inputs and actual dates and **never a derived date**; `confirmImport` calls the recalculation **once**, after the whole diff commits (AR-24, AR-54). The acceptance corpus of 10 real client files is **not in the repo** and its tests run under a local-only tag (AR-41). This epic also creates `import_draft` (`mutable_audited`), which does not exist today.

### Epic 4: A Baseline that can explain itself years later

A PM can set a Baseline from the Current Plan and Re-baseline with a mandatory reason, linking Change Request candidates. Every version is kept with its author, time and reason, and any two versions compare **as plans, not only as rows** — dependencies added and removed, lags, constraints, durations, actual dates, progress, milestone flags, the calendar version and the three Project settings — so no WP can move between versions without a recorded input change that accounts for it. An automated test re-derives a Baseline's dates, Float, constraint violations and critical path from its pinned inputs alone, on any machine, at any later date.

**FRs covered:** FR-15, FR-16

**Implementation notes.** The Baseline **points at a `schedule_run`; it does not re-copy the inputs** (AR-22), and `baseline_wp` keeps only the cost projection that PV, BAC and Divergence read. Retention-by-reference makes the pointer permanent (AR-11). The re-derivation test runs under each run's **own** recorded `engine_version`, so a later scheduler fix does not turn history red (AR-51), and compares through the codec's canonical form rather than column text (AR-8). A Baseline is refused while any leaf WP has no duration or the Project has no Project start.

### Epic 5: The work actually done arrives from Backlog and lands on the plan

A PM can connect a Project to a Backlog space read-only, record who on the client side approved it, and watch an always-on snapshot service build an append-only Actuals Ledger from snapshot deltas — with hours a Ticket already had recorded as an Opening Balance so a project connected mid-flight shows no false spike. They can link Tracker Accounts to Resources, map Tickets to leaf WPs by hand or by priority-ordered rule, flag Catch-all WPs, and see coverage per Connector. Every in-scope Ticket is either mapped or reported as unmapped, nothing is silently excluded, and a space that exposes no hours runs honestly in Ticket-Count Mode rather than showing zeros.

**FRs covered:** FR-13, FR-17, FR-19, FR-20, FR-21, FR-22, FR-23, FR-24, FR-25, FR-26, FR-27, FR-42

**Implementation notes.** The largest epic by FR count, and one journey (UJ-2) across one set of modules — `adapters/backlog-http`, `app/ingest`, `app/mapping`, `domain/attribution` — which is why it is not split. The invariant this epic must not break is the one the whole product rests on: **mapping, remapping and hourly background rule evaluation change attribution and never a date** (AR-52's reachability test). Paginated completeness is read `sort=created&order=asc` with Count Issues before and after, because Backlog's default `updated desc` silently skips Tickets while still looking finished (AR-13); `left_scope` needs **two** consecutive complete reads (AR-15); the measurement basis latches with hysteresis N = 3 in both directions, with no confirmation screen (AR-17, founder decision A3); and unmapping is `release` only in R0 (AR-18, founder decision A4). **OQ-2 is still open** — whether the five target Backlog spaces expose actual hours — and this epic handles both answers, but the fixture scenarios should be re-recorded once the founder checks.

**It also creates the tables its own invariants rest on**, none of which exist today: **`ticket`**, whose `UNIQUE (tenant_id, tracker_kind, tracker_site, tracker_issue_id)` with exactly one `owner_connector_id` is how AD-7 makes double-counting impossible rather than merely discouraged; **`tracker_account`**, which FR-13 links to Resources; the four Connector event tables (`connector_scope_event`, `connector_setting_event`, `measurement_basis_event`, `connector_ownership_event`) and `tracker_account_link_event`; and the `derived` projections `mapping_head` and `connector_overlap`. The spike has `mapping_event` and `actuals_ledger_entry` but no Ticket identity table, so today nothing structurally prevents the overlap AD-7 turns into a `connector_overlap` record.

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

The work is named in the spine and is not small: ECS Fargate `web` behind an ALB at TLS 1.2+ and `worker` at desired count 1; RDS PostgreSQL 18 with encrypted storage and 30-day in-region automated backups, its minor tracked to local; S3 Tokyo with SSE, versioning off and a lifecycle expiry; **SES production access, which is an R0 launch task because a new account starts in the sandbox at 200 mails a day** (AR-33); the migration task that runs `drizzle-kit migrate` as the `migrator` role and re-applies `rls.sql`, `grants.sql` and the trigger SQL before the services roll (AR-34); `pino` to CloudWatch with AR-36's alarm set, including the two scheduler alarms only an operator can clear; and NFR-D1's `purgeTenant` procedure through the `maintenance` role, with no UI (CA-5). It creates `operator_audit` (class `operational`, outside every Tenant), which both sanctioned append-only exceptions write to and which does not exist today.

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

## Epic 1: A Tenant, its people, and nothing leaking between them

A Tenant Admin can stand up the organisation — Departments, Programs, Projects, PM assignments, Resources and their dated Rate history — invite PMs, and sign in. Every read is covered by an automated proof that no other Tenant's data comes back, and every action that changes reported numbers or who can see them is on the audit log. The English UI ships with every string externalised and a Japanese catalog in place.

*Eight stories, in order. Each is completable on its own and on the ones before it; none waits on a later one. FRs: FR-1, FR-2 (Tenant Admin and PM), FR-3 (email + password and Google), FR-4 (English), FR-12. Substrate: AR-1 … AR-10, AR-26, AR-27, AR-30, AR-31, AR-33, AR-37, AR-38, AR-40. NFRs: S1, S2, S3, S8, A1, C1's integer and codec discipline, I1, P1's fixture.*

### Story 1.1: One command brings the whole system up

As the founder,
I want `pnpm dev` to bring the database, both roles and a seeded demo Tenant up on my laptop,
So that I can build and demo R0 without cloud accounts, credentials or hand steps.

**Acceptance Criteria:**

**Given** a clean clone and no running containers
**When** I run `pnpm dev`
**Then** it starts Postgres, applies migrations, applies the RLS, grants and trigger SQL, seeds a demo Tenant, and runs `web` and `worker` together
**And** no step needs network access beyond pulling the Postgres image and installing packages (AR-30)

**Given** the compose file
**When** Postgres 18.6 starts
**Then** the volume is mounted at `/var/lib/postgresql`, not `/var/lib/postgresql/data`
**And** a `docker compose down` followed by `pnpm dev` finds the database still there, because PostgreSQL 18 declares the volume one level up and silently ignores the habitual mount (AR-30)

**Given** the workspace
**When** the packages are laid out
**Then** `packages/app`, `packages/adapters`, `packages/db/auth`, `packages/i18n` and `apps/worker` exist alongside the three that already do
**And** `packages/domain` still has no runtime dependency but `zod` (AR-1)

**Given** `packages/app/config`
**When** a required environment key is missing at boot
**Then** the zod schema fails the boot with the key named, rather than the process starting and failing later (AR-30)

**Given** the two roles
**When** either needs the wall clock
**Then** it reads the `Clock` port, and `Date.now()`, bare `new Date()` and `process.env` are ESLint errors everywhere but `adapters/clock` and `app/config` (AR-2)

**Given** the application database role
**When** pg-boss starts
**Then** its schema was already installed and migrated by the `migrator` role during `migrate`, and the application role starts pg-boss with auto-migration disabled and holds only DML grants on that schema (AR-31)

**Given** pnpm 12 with `strictDepBuilds` inherited true, and TypeScript 6 defaulting `types: []`
**When** a fresh `pnpm install` and typecheck run
**Then** both succeed, because `allowBuilds` declares the packages that legitimately run build scripts and `apps/worker`, `packages/db` and `packages/adapters` declare `"types": ["node"]` (AR-30)

### Story 1.2: Nothing crosses a Tenant, and the data layer is what proves it

As a Tenant Admin,
I want isolation enforced in the database rather than remembered in application code,
So that one missed `WHERE` clause can never show me another organisation's project.

**Acceptance Criteria:**

**Given** `packages/db/table-classes.ts`
**When** the schema is built
**Then** every table carries exactly one of the five AD-21 classes, and the RLS, grants and trigger SQL are **generated from that registry**
**And** CI fails if a migration adds a table the registry does not name (AR-38)

**Given** every tenant-owned table
**When** the migration runs
**Then** each has `tenant_id uuid NOT NULL`, every foreign key between tenant-owned tables is composite and includes `tenant_id`, and each has `ENABLE` and `FORCE ROW LEVEL SECURITY` with the policy `tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid`
**And** a CI assertion reads `pg_class.relforcerowsecurity` and fails if any table carrying `tenant_id` lacks FORCE or a policy, because Drizzle 0.45 cannot emit FORCE and it lives in hand-written `rls.sql` (AR-4)

**Given** the application database role
**When** it connects
**Then** it is a non-owner without `BYPASSRLS`, and all tenant data access goes through `withTenant(tenantId, tx => …)`, which opens a transaction and runs `set_config('app.tenant_id', $1, true)` with a **bound** uuid
**And** `SET LOCAL app.tenant_id = $1` is absent from the codebase, because it is not parameterizable and interpolating into `SET` is an injection foot-gun (AR-4)

**Given** a test harness seeded with two Tenants
**When** it exercises **every** read use case
**Then** none returns a row belonging to the other Tenant, and the harness enumerates the use cases rather than listing them by hand, so a new one is covered the day it is written (AR-5, FR-1)

**Given** the eight files under `apps/web` that import `@momo/db` today
**When** this story completes
**Then** each reaches its data through a `packages/app` use case instead, and `dependency-cruiser` is switched on to fail CI on any `apps/*` import of a repository or of Drizzle
**And** the gate is turned on **after** the rewiring in the same story, never before it, because switching it on first turns CI red on day one for a reason nobody can clear that day (AR-1, measured baseline)

**Given** any append to a watermarked table
**When** it runs
**Then** it takes `pg_advisory_xact_lock(namespace, key)` — the two-argument form, namespace 1 for a Project key and 2 for a Tenant key — **before allocating any `seq`**, and `ComputationInputs` is captured under the shared form
**And** a lint rule and a test ban the bare `db` handle on any tenant-owned table (AR-37, AR-4)

**Given** the nine insert-only tables that already exist
**When** the application role attempts an `UPDATE` or `DELETE` on one
**Then** the statement is refused by both the missing grant and a `BEFORE UPDATE OR DELETE` trigger, and the only exception is the `maintenance` role with `app.maintenance = 'on'` (AR-9)

**Given** effort, money and ratios anywhere in `packages/domain`
**When** they are held or summed
**Then** effort is `bigint` milli-hours, money is integer JPY, ratios are `{num, den}` carried unreduced, threshold comparisons cross-multiply at the single `compareRatio` site, and rounding happens only in `domain/present` (AR-6)
**And** every `jsonb` read and write of a stored value goes through the one codec, which renders `bigint` as a decimal string, so `JSON.stringify` never meets a `bigint` (AR-8)

### Story 1.3: The organisation, and the record of who changed it

As a Tenant Admin,
I want to create Departments, Programs and Projects and assign PMs to them,
So that the hierarchy every later number rolls up through exists, and every change to it is on the record.

**Acceptance Criteria:**

**Given** a Tenant
**When** I create Departments, Programs and Projects
**Then** the hierarchy is Tenant > Department > Program > Project, `program` is created by this story as a `mutable_audited` table because it does not exist today, and each Project has one owning Department and an optional Program (FR-1, measured baseline)

**Given** a Project in a Department
**When** I assign it a Program
**Then** the assignment is refused unless that Program belongs to the Project's owning Department (FR-1)

**Given** a Project with Baselines, ledger entries, Mappings, Published Snapshots and audit history
**When** I move it between Programs
**Then** all of those are unchanged, and only the Program roll-up it contributes to changes (FR-1)

**Given** any use case on the NFR-A1 list
**When** it commits
**Then** it called `audit.record(ctx, action, target, payload)` **inside its own `withTenant` transaction**, with `action` from a closed enum in `packages/app/audit`
**And** a test enumerates the NFR-A1 use cases and fails if one produces no audit row, so an audited action cannot commit without its record and a rolled-back one leaves none (AR-26)

**Given** a Tenant Admin creating, renaming or reassigning any of the above
**When** the change commits
**Then** the audit row carries the actor, the time and the previous value (NFR-A1)

### Story 1.4: Sign in, and be revoked

As a PM,
I want to sign in with email and password or with Google, and to lose access the moment a Tenant Admin revokes it,
So that the tool is usable day to day and closing an account actually closes it.

**Acceptance Criteria:**

**Given** no identity tables exist in the repository today
**When** this story completes
**Then** Better Auth's `user`, `session`, `account` and `verification` tables exist as class `global`, exempt from the FORCE-RLS set because the session is resolved before a Tenant is known, and reached only through `IdentityPort` implemented by `packages/db/auth` — the single sanctioned Better Auth ↔ Drizzle binding (AR-40, AR-1, measured baseline)

**Given** a user who belongs to one or more Tenants
**When** any request arrives
**Then** `resolveRequestContext` reads `tenant_membership` — the one non-RLS bridge — and validates the session's explicit `activeTenantId` against it **on every request**, and nothing else reads that table (AR-40)

**Given** a signed-in user
**When** they are idle past the configurable timeout, default 8 hours
**Then** the session expires
**And** the Better Auth session cookie cache is **disabled**, so both revocation and idle expiry take effect on the user's very next request rather than when a cached cookie happens to lapse (FR-3, AR-40)

**Given** a Tenant Admin revoking a user
**When** that user makes their next request
**Then** it is refused, and the revocation is an `app` use case that is audited — never a write through the Better Auth adapter (AR-40, NFR-A1)

**Given** a user who has forgotten their password
**When** they request a reset
**Then** mail is sent through `MailerPort`, with `mailer-console` in development and `mailer-ses` as the production implementation
**And** mail is therefore **R0 work, not R1** (AR-33); the AWS account, sender domain and SES production access are Epic 8's

**Given** Next 16
**When** a server action sets the session cookie
**Then** the `nextCookies()` plugin is configured, without which the cookie is silently never set (AR-30)

### Story 1.5: Roles decide what each person can reach

As a Tenant Admin,
I want each use case to declare who may call it and to check project membership,
So that authorisation is one rule in one place rather than a condition repeated in every page.

**Acceptance Criteria:**

**Given** any use case
**When** it runs
**Then** it declares its allowed roles and checks project membership against `RequestContext`, and **the UI never authorises** (AR-23 boundary, FR-2)

**Given** a caller who is not permitted
**When** they invoke a use case or open a URL outside their set
**Then** the answer is `not_found`, never `forbidden`, so the response does not disclose that the resource exists (FR-2)

**Given** the R0 role set
**When** roles are assigned
**Then** Tenant Admin and PM exist and are assignable; Client Viewer and Internal Viewer are defined in the enum but not assignable, because they are R1 and Post-Q1 (FR-2, §8.1)

**Given** a Project
**When** someone edits its Plan or Mappings
**Then** only that Project's PMs or a Tenant Admin can, and the attempt by anyone else returns `not_found` (FR-2)

**Given** a role change
**When** it commits
**Then** it went through an `app` use case and produced its audit row (AR-40, NFR-A1)

### Story 1.6: Resources and the dated Rates behind every money figure

As a Tenant Admin,
I want Resources with a home Department and a dated Rate history that only I can set,
So that every hour can be valued at the Rate that was in force when it was recorded, and a later correction never rewrites a published figure.

**Acceptance Criteria:**

**Given** a Tenant
**When** a Tenant Admin **or a PM** creates a Resource
**Then** it is created with a home Department (FR-12)

**Given** a Rate or a Project default Rate
**When** anyone but a Tenant Admin tries to create or change it
**Then** the attempt is refused; Rates are visible only to Tenant Admins and to the PMs of the Projects that use them (FR-12, FR-2)

**Given** `rate_entry` exists and `project_default_rate_entry` does not
**When** this story completes
**Then** `project_default_rate_entry(project_id, effective_from, yen_per_hour, seq)` exists as `append_only`, bitemporal in the same shape as `rate_entry` (AR-19, measured baseline)

**Given** an hour recorded on a date
**When** it is valued
**Then** the Rate used is the one in effect on that date, looked up as the latest `seq ≤ rate_seq_max` for the effective date (FR-12, AR-19)

**Given** a Rate corrected retroactively
**When** the correction commits
**Then** the Actuals Ledger is untouched, money is recomputed against the pinned Rate history, and no past entry is rewritten
**And** an earlier Published Snapshot still reproduces exactly, because it pinned its own `rate_seq_max` (FR-12, founder decision A2)

### Story 1.7: The Tenant Admin can read the audit log

As a Tenant Admin,
I want to read and filter the log of every action that changed reported numbers or who can see them,
So that I can answer "who changed this, and when" without asking anyone.

**Acceptance Criteria:**

**Given** audit rows written by Story 1.3's mechanism
**When** a Tenant Admin opens the audit log
**Then** they can filter it, and each row shows the actor, the time and the action from the closed enum (NFR-A1)

**Given** a user who is not a Tenant Admin
**When** they request the audit log
**Then** the answer is `not_found` (FR-2)

**Given** the log
**When** it is rendered
**Then** it contains no Tracker credential, and `pino` redaction already covers `*.apiKey`, `*.token`, `*.password` and `authorization` wherever they might otherwise be logged (NFR-S2, AR-29)

**Given** any text that came from a Tracker or a workbook
**When** it is displayed anywhere in the application
**Then** it is escaped through React, and `dangerouslySetInnerHTML` is a lint error (NFR-S8, AR-29)

### Story 1.8: A load fixture worth measuring against

As the founder,
I want a generator that builds 5 Projects of 500 Work Packages with their Resources,
So that every NFR-P1 claim in R0 is measured against a realistic shape rather than asserted.

**Acceptance Criteria:**

**Given** the generator
**When** it runs
**Then** it produces 5 Projects, each with 500 Work Packages in a realistic tree, and the Resources they are assigned to, deterministically from a seed so two runs give the same fixture (AR-27, NFR-P1)

**Given** the fixture
**When** a later epic measures against it
**Then** the same fixture serves Epic 2's 300 ms recalculation, Epic 5's 5-minute snapshot and Epic 6's 2 s Review load, so the three budgets are measured on one shape rather than three (NFR-P1)

**Given** that `ticket` does not exist until Epic 5
**When** this story completes
**Then** it delivers the harness and the Project, WP and Resource half, and **Epic 5 extends the same generator with the 2,000 Tickets per Project**; this story does not wait on that and is complete without it (measured baseline)

**Given** `CLOCK_MODE=fixture`
**When** either role reads the clock
**Then** it returns `max(latest fixture observedAt, FIXTURE_TIME_ANCHOR)`, and `db/seed` creates its data through that same clock, so the demo is not permanently stale (AR-27)
## Epic 2: A plan that re-dates itself when the work slips

A PM can build a Plan by hand and have it schedule itself: durations, finish-to-start dependencies with lag, three constraint types, a Project start, an optional Project finish and a Data Date, over a JP and VN working-day calendar with a dated version history. **A slipped task moves the tasks that depend on it.** Float and the critical path are always current, negative Float shows as a negative number against a Project finish the PM set, and every constraint violation, out-of-sequence link and un-schedulable WP is listed with the chain behind it. The tree grid is the single scheduling surface.

*Sixteen stories — the largest count in the plan, and that is the point: this capability has no line of code today, and OQ-11 asks for the engine and its surface to be sized separately. Stories 2.1 … 2.12 are the engine and its plumbing; **2.13 … 2.16 are the plan surface OQ-11 names**, so sprint planning can total them on their own. FRs: FR-5, FR-6a, FR-6b, FR-7 (tree grid only), FR-8, FR-14, FR-43.*

**Two story boundaries are deliberately the §8.3 cut lines**, so that a cut is a story removed rather than a story rewritten:

| §8.3 cut | Story | What removing it costs |
|---|---|---|
| Item 1 — the two extra constraint types | **2.7** | Milestone target dates go with it (§3 defines a milestone target *as* a `must_finish_on`), and FR-31's two milestone rules lose their input. Carried to `bmad-sprint-planning` |
| Item 2 — Float and critical-path display | **2.6** | Taken only after item 1, never before. The forward pass in 2.5 is **never cut** |

### Story 2.1: The scheduling schema lands in one migration

As the founder,
I want the whole scheduling slice of the schema to arrive in a single pre-production migration,
So that no story can quietly write a column that was supposed to be gone, and the expand/contract exemption is spent once and recorded.

**Acceptance Criteria:**

**Given** the schema Epic 1 wrapped
**When** this migration runs
**Then** it **adds** `wp_dependency`, `schedule_run`, `wp_schedule` and `holiday_calendar_version`; the `work_package` columns `duration_days`, `constraint_type` and `constraint_date` with their leaf-only CHECK and the `UNIQUE (tenant_id, project_id, id, is_leaf)` key; and `project.project_start`, `.project_finish`, `.data_date`, all nullable (AR-59)

**Given** that `wp_status_event` does not exist in the repository
**When** this migration runs
**Then** it **creates `wp_status_event` whole** — the WP-marked-complete fact and the actual start and actual finish together — as class `append_only`
**And** it then **drops** `work_package.start`, `.finish`, `.completed_at` and `.milestone_done_at`, so the two actual dates have exactly one home and the scheduler and EVM cannot disagree about a WP's actual finish (AR-42, AR-59)

**Given** `baseline_version` and `baseline_wp` as they stand
**When** this migration runs
**Then** `baseline_version` carries a `schedule_run_seq` foreign key and `baseline_wp` is reduced to AD-26's cost projection — `start`, `finish`, `baseline_mh`, `is_milestone`, `is_catch_all`, leaf-only (AR-22, AR-59)

**Given** three clauses drizzle-kit 0.31.10 cannot emit
**When** the migration is written
**Then** `DEFERRABLE INITIALLY DEFERRED` on `wp_dependency`'s leaf foreign keys, `MATCH FULL` on the composite tenant foreign keys, and `GENERATED ALWAYS AS (child_count = 0) STORED` are hand-written SQL
**And** CI asserts `pg_constraint.condeferrable`, `pg_constraint.confmatchtype` and `pg_attribute.attgenerated = 's'`, so a later schema regeneration cannot silently drop them (AR-59)

**Given** PostgreSQL 18 defaults a generated column to `VIRTUAL`
**When** `is_leaf` is declared
**Then** `STORED` is written explicitly, because a virtual column cannot be a UNIQUE member or an FK target (AR-44)

**Given** every table this migration adds
**When** it is added
**Then** it is registered in `packages/db/table-classes.ts` in the same change — `schedule_run` and `holiday_calendar_version` as `append_only`, `wp_schedule` as `derived`, `wp_dependency` as `mutable_audited` — and the RLS, grants and triggers are generated from the registry (AR-38, AR-59)

**Given** a Baseline seeded before this migration
**When** the migration runs
**Then** it is **deleted, not migrated**, because it pinned outputs with no inputs behind them and migrating it would fabricate inputs it never had (AR-59)

**Given** this migration
**When** the next migration is written, whenever that is
**Then** AD-19's expand/contract discipline binds it: add nullable, backfill through the `maintenance` path, switch reads, drop later. **The exemption is spent here and is not available again** (AR-34, AR-59)

### Story 2.2: The demo spike is disposed of, file by file

As the founder,
I want every one of the 46 TypeScript files on `main` either assigned to a story or removed,
So that nothing survives from the overnight spike by accident, and §4.E-3 of the sprint change proposal is actually discharged.

**Acceptance Criteria:**

**Given** the migration in 2.1 has dropped `work_package.start`, `.finish`, `.completed_at` and `.milestone_done_at`
**When** this story runs
**Then** every file that read or wrote those columns compiles against the new schema or is removed, and the typecheck passes — the migration and this story are adjacent on purpose, because 2.1 is what breaks the spike

**Given** the reconciliation
**When** it is complete
**Then** all 46 files appear in the table below with a disposition, and **`gantt.tsx` is removed** — the spike shipped a Gantt, and FR-7 puts the Gantt in R1, so it is R1 scope built early rather than R0 work to keep (FR-7, §8.2)

| File(s) | Disposition |
|---|---|
| `packages/domain/src/{attribution,evm,health,forecast,ledger,mapping,review,calendar,present,types,units,index}.ts` | **Kept.** The pure core is the part worth keeping (`decisions-pending` D1). Each is claimed by the epic that owns its FRs: `calendar` → 2.12 and Epic 5's `periodOf`; `present`/`types`/`units`/`index` → 1.2's integer and codec discipline; `attribution`/`ledger`/`mapping` → Epic 5; `evm`/`health`/`forecast`/`review` → Epic 6 |
| `packages/domain/src/{attribution,evm}.test.ts` | **Kept and extended.** The golden EVM cases seeded from UJ-3's numbers stay; Epic 6 extends them |
| `packages/domain/src/client-view.ts` | **Removed.** No R0 story covers it, and AD-12 puts the client payload in `domain/present/clientProjection` against a Visibility Policy that does not exist yet. R1 rebuilds it in the right shape rather than editing this one |
| `packages/db/src/schema.ts` | **Rewritten across two stories:** 1.2 registers and RLS-wraps the 17 tables, 2.1 applies the scheduling delta |
| `packages/db/src/{client,index,repo}.ts` | **Rewritten in 1.2.** `repo.ts`'s `loadReview` and `loadProjectBundle` become `packages/app` use cases; `packages/db` keeps `withTenant` and repositories, with `repositories/schedule` exported only to `app/schedule` (AR-1, AR-43) |
| `packages/db/src/{seed,fixtures}.ts` | **Kept, rewritten in 1.8** as the deterministic load fixture, and **regenerated in this story** against the new schema (AR-59) |
| `packages/db/src/demo-golden.test.ts` | **Regenerated in this story.** AD-30 requires the seed, the fixtures and both golden corpora to be regenerated in the same commit |
| `apps/web/src/app/actions.ts` | **Split and rewired in 1.2.** It is the file that imports `getDb` and `schema` directly and so is AD-1's clearest violation; each server action in it becomes a thin caller of a `packages/app` use case, and the actions themselves move to the epic that owns their surface |
| `apps/web/src/app/{page,layout}.tsx`, `src/components/{shell,ui}.tsx` | **Kept, rewired in 1.2** and restyled against `DESIGN.md`'s tokens and `EXPERIENCE.md`'s sidebar (UX-DR1, UX-DR28) |
| `apps/web/src/app/p/[projectId]/{layout,plan}/page.tsx` | **Rewired in 1.2, rebuilt in 2.13 … 2.16** as the real Plan surface |
| `apps/web/src/app/p/[projectId]/baselines/page.tsx` | Rewired in 1.2, rebuilt in **Epic 4** |
| `apps/web/src/app/p/[projectId]/{mapping,connectors}/page.tsx`, `src/components/map-ticket-form.tsx` | Rewired in 1.2, rebuilt in **Epic 5** |
| `apps/web/src/app/p/[projectId]/review/page.tsx`, `src/components/{disposition-rail,scope-ledger-bar}.tsx` | Rewired in 1.2, rebuilt in **Epic 6** |
| `apps/web/src/app/c/[projectId]/page.tsx` | **Removed.** The Client View is FR-36, which is R1. No R0 story covers it |
| `apps/web/src/components/gantt.tsx` | **Removed.** FR-7 puts the Gantt in R1 |
| `apps/web/next.config.ts`, `apps/web/next-env.d.ts`, `drizzle.config.ts`, `vitest.config.ts` | **Kept, adjusted in 1.1** for the pinned stack and the workspace layout |
| `scripts/{demo,gen-fixtures}.ts` | **Kept, folded into 1.8's generator** and regenerated here |
| `scripts/{peek,peek-db}.ts` | **Kept as developer utilities, with no story.** Named here so the exception is a decision: they read the database for debugging and ship nothing. Sprint planning may delete them |

**Given** that §4.E-3 of the sprint change proposal counts 43 TypeScript files
**When** the reconciliation is checked
**Then** it covers **46**, all added on 2026-09-20, and records that the difference is the three `*.test.ts` files the proposal's count appears to have excluded (measured baseline)

**Given** the disposal
**When** it is complete
**Then** `packages/domain` still has no runtime dependency but `zod`, and `dependency-cruiser` passes (AR-1)

### Story 2.3: One canonical order for everything the scheduler reports

As the founder,
I want a single total ordering function that everything the scheduler reports goes through,
So that a critical path compared years later does not come back in a different order on a different machine.

**Acceptance Criteria:**

**Given** `compareWp(a, b)` in `domain/schedule/order`
**When** it compares two WPs
**Then** it NFKC-normalises both `wbs_code` values so full-width digits fold to half-width, splits each on `.`, compares two all-digit segments as arbitrary-precision integers and any other pair through `domain/text.compareNfkc` code-point order, sorts the shorter code first on a tie, and falls through to the lowercase `wp_id` (AR-55, NFR-I1)

**Given** two distinct WPs
**When** `compareWp` is called on them in either order
**Then** it never returns 0, because the `wp_id` fallback is reached whenever the codes are equal or both absent (AR-55)

**Given** a WBS code
**When** anything compares two runs or two Baselines
**Then** it matches on `wp_id` and uses `wbs_code` only to sort, because a re-parent may renumber: **a code orders, it never identifies** (AR-55)

**Given** one Project's inputs
**When** the same recalculation runs N times over shuffled input orderings
**Then** the `outputs` are identical **in the AD-4 codec's canonical decoded form**, and the test compares that form rather than the stored `jsonb` text, which reorders keys and renormalises numbers and would therefore flake (AR-55, AR-8)

**Given** OQ-13, which NFR-C1 asserted and no document answered
**When** this story completes
**Then** the rule is `compareWp` and it is applied at exactly one site, so FR-15's re-derivation test and FR-35's reproduction test compare an ordered set a document defines (AR-55)

### Story 2.4: The four graph rules are invariants, not entry checks

As a PM,
I want an illegal dependency refused with the offence named, whether I drew it or a re-parent created it,
So that the plan can never reach a state the scheduler has to guess its way out of.

**Acceptance Criteria:**

**Given** `domain/schedule/validate(plan, edges)` as a pure function
**When** it runs
**Then** it returns the offending cycles, ancestor/descendant pairs, summary endpoints and cross-project links — all four, separately, not the first one found (AR-46, FR-6a)

**Given** a dependency whose endpoints are in an ancestor/descendant relationship
**When** validation runs
**Then** it is rejected as its own offence, **separately from the cycle check**, because the cycle check runs over the dependency graph and an ancestor/descendant link is a cycle only once roll-up edges are taken into account (FR-6a)

**Given** a rejected cycle
**When** it is reported
**Then** it is rotated to begin at its `compareWp`-minimum WP, so the same defect never reads as two different cycles (AR-56)

**Given** a structural edit — a move, a re-parent, a delete or an import — that turns a legal link into an illegal one without touching any link
**When** it is attempted
**Then** validation catches it, because the fence calls `validate` on every mutation **and** `recalculate` calls it before the passes: these are invariants of the Plan, not checks that run only when a link is drawn (AR-46, FR-6a)

**Given** `wp_dependency`
**When** a cross-project link is attempted
**Then** it fails on the composite foreign keys with `MATCH FULL` rather than on an application check, so FR-6a's cross-project rejection is enforced rather than remembered (AR-45)

**Given** `wp_dependency.type`
**When** a value other than `FS` is written in R0
**Then** the `CHECK (type = 'FS')` refuses it, while `SS`, `FF` and `SF` remain expressible values so that widening the boundary later is one line of migration (AR-62)

### Story 2.5: The forward pass — a slip moves the tasks that depend on it

As a PM,
I want the plan's dates derived from duration, dependencies and the work already done,
So that when one task slips I see what it moved instead of re-dating the rest by hand.

**Acceptance Criteria:**

**Given** a leaf WP
**When** the forward pass runs
**Then** it is one of three states: **complete** if it has an actual finish, in which case its dates *are* its actual dates and the pass never moves them and passes its actual finish to its successors; **in progress** if it has an actual start and no actual finish, in which case its start is its actual start and it is scheduled forward over its remaining duration from no earlier than the Data Date; or **remaining**, in which case the pass places it and it never starts earlier than the Data Date (FR-6b)

**Given** an in-progress WP
**When** its remaining duration is derived
**Then** it is `ceil(duration_days × (1 − recorded_pct))` clamped to at least 1, evaluated as integer arithmetic over the `Ratio` form, **never stored**, and never derived from elapsed calendar time (AR-7, FR-6b)

**Given** a WP with no Recorded Percent Complete
**When** it is scheduled
**Then** it is treated as 0% done, however far along its Tickets say it is (FR-6b)

**Given** a remaining WP
**When** its earliest start is computed
**Then** it is the latest of the Data Date, the Project start and every predecessor's finish plus lag, counted **in working days** on the pinned calendar version (FR-6b, AR-7)

**Given** an actual start that precedes its predecessor's finish
**When** the pass runs
**Then** **the actual date wins**: the WP keeps it, its successors are driven from it, and the pair is flagged as out-of-sequence. The "a successor never starts before its predecessor finishes" invariant binds **remaining work only**, and the scheduler never rewrites history to preserve an invariant about the future (FR-6b)

**Given** a leaf WP with no duration
**When** the pass runs
**Then** it is excluded from both passes and from the critical path, its successors are driven from its predecessors as though it were absent, and it is listed in a "not schedulable yet" block with its reason — **never silently treated as duration 1 or 0** (FR-6b)

**Given** a summary WP
**When** the pass runs
**Then** nothing schedules it; its dates are the earliest early start and latest early finish among its descendants and its effort their sum, computed once into `outputs` and **never read back into a pass** (FR-5, AR-49)

**Given** a pass that would place a date beyond the calendar version's `range_end`
**When** it runs
**Then** it **halts rather than guessing**, reporting the WPs and the range it needs, because a schedule computed against assumed working days is not re-derivable (FR-6b, AR-58)

**Given** §8.3's cut order
**When** anyone considers cutting
**Then** this story is **never cut**: automatic recalculation is the reason the plan can live here rather than in Excel (§8.3)

### Story 2.6: The backward pass, Float, and the critical path

As a PM,
I want to see how much slack each task has and which chain decides the finish,
So that I know where a slip actually costs me the end date.

**Acceptance Criteria:**

**Given** the backward pass
**When** it runs
**Then** it derives each WP's latest start and finish backwards through the same graph from **one anchor and one only** — the Project finish where the PM set one, otherwise the computed finish, the latest derived finish in the Plan. **A constraint is never an anchor** (FR-6b)

**Given** Float
**When** it is computed
**Then** it is latest start minus earliest start, in whole working days as an integer, and it is **negative only** because the plan cannot meet a Project finish the PM set (FR-6b, AR-7)

**Given** the critical path
**When** it is identified
**Then** it is the set of WPs whose Float equals the **minimum Float in the Plan measured against that anchor** — zero on a plan with slack, negative on a plan that cannot meet a PM-set Project finish. **It is never the zero-Float set**, because a late plan has no zero-Float WPs and defining it that way would drop the chain that decides the finish exactly when the plan is in trouble (FR-6b, §3, AR-49)

**Given** the critical path and the driving chains
**When** they are written to `outputs`
**Then** the path is an ordered list by early start ascending then `compareWp`; and where several predecessors tie on the value that set an early start, **all** of them are recorded in `compareWp` order and the chain the UI names is the first — naming one and hiding the rest is how a PM chases the wrong link (AR-56)

**Given** any Float shown anywhere
**When** it is displayed
**Then** the anchor it was measured against is shown with it, because the two anchors produce different Float and the difference reaches the client on a published schedule (FR-6b)

**Given** §8.3's cut order
**When** a cut is considered
**Then** this story is **item 2**, and it is taken **only after item 1** (story 2.7), never before — dropping Float while the two extra constraint types are still in scope leaves violations reported with no Float behind them (§8.3)

### Story 2.7: Constraints are soft, reported, and stay on their own Work Package

As a PM,
I want a date I pinned to be applied where it can be and explained where it cannot,
So that the tool never draws me a plan nobody can execute.

**Acceptance Criteria:**

**Given** a leaf WP with a *must start on* or *must finish on* constraint
**When** the pass runs
**Then** the date is applied as a lower or upper bound wherever the dependency graph allows it, and **where it does not, the graph wins**: the scheduler never draws a successor starting before its predecessor finishes (FR-6b)

**Given** a constraint the graph defeats
**When** the violation is reported
**Then** it names the date asked for, the date derived, **how many working days late** it is, and the predecessor chain that forced it (FR-6b)

**Given** an unmet *must finish on*
**When** Float is computed
**Then** the violation **changes no WP's Float** — not its own, not upstream, not anywhere — and **never displaces the critical path**. Violations are their own ranked list, worst first, beside the path rather than inside it. This is a deliberate choice against the more common CPM behaviour: one constraint missed by six weeks would otherwise give its own chain Float −30 and leave the chain that actually decides the finish off the critical path (FR-6b, AR-49)

**Given** a milestone
**When** it is scheduled
**Then** it is a zero-duration leaf that participates in the passes normally, and its target date **is** its *must finish on* constraint, so a missed target is a constraint violation on that milestone with its days late and chain (§3, FR-6b)

**Given** the violation list, the out-of-sequence list and the not-schedulable block
**When** they are ordered
**Then** violations sort by days late descending then `compareWp`, and the other two by `compareWp` (AR-56)

**Given** §8.3's cut order
**When** a cut is considered
**Then** this story is **item 1, the first cut**, and cutting it narrows `constraint_type` to `asap` and touches no column. **It also removes every milestone target date**, because §3 defines a milestone's target as a `must_finish_on`, and FR-31's two milestone rules then lose their input — see *Carried to `bmad-sprint-planning`* (§8.3, AD-26 *Deferred*)

### Story 2.8: The golden scheduler corpus

As the founder,
I want a corpus of hand-computed expected outputs the engine must reproduce,
So that there is one gate that catches the engine computing the wrong dates, rather than five that only catch it disagreeing with itself.

**Acceptance Criteria:**

**Given** AD-19's six scheduler CI gates
**When** they are counted
**Then** five test internal consistency — the input-writer fence test, the trigger call-site test, the reachability test, the shuffled-input determinism test and the re-derivation test — and **this corpus is the only one that tests correctness**. It is therefore its own story and never an acceptance criterion inside another, because folding it in would hide the one gate that could catch a wrong answer (AR-35)

**Given** the corpus
**When** it is written
**Then** the expected outputs are **computed by hand and recorded**, not captured from the implementation, since a captured expectation only proves the engine has not changed

**Given** the minimum coverage AD-27 names
**When** the corpus is complete
**Then** it contains at least: a slip moving its dependents across **a JP and a VN weekend**; a mid-flight plan with complete, in-progress and remaining WPs against a Data Date; a plan with **negative Float** against a PM-set Project finish; an **out-of-sequence** actual start; a `must_finish_on` **missed by six weeks that must not displace the critical path**; a **zero-duration milestone**; and a **leaf with no duration** (AR-35)

**Given** the corpus
**When** it runs in CI
**Then** it blocks merge, and each case's expected `outputs` are compared through the AD-4 codec's canonical form (AR-35, AR-8)

**Given** a later change to the passes, the roll-up, the ordering or the cause derivation
**When** it lands
**Then** it registers a new `engine_version`, every registered version stays executable, and each golden case is re-derived under **its own** recorded version — so a scheduler bug fix does not turn every historical case red (AR-51)

### Story 2.9: One path writes dates, and the run is the record

As the founder,
I want the input write and the recalculation to happen in one transaction behind one function,
So that no module can change a scheduling input without a recalculation, and no background job can ever re-date a plan.

**Acceptance Criteria:**

**Given** `app/schedule.applyPlanChange(ctx, mutation)`
**When** any scheduling input is written
**Then** it performs the write **and** the recalculation in one transaction under the AD-20 per-Project exclusive lock, and no other use case writes any row in AD-25's input table
**And** `db/repositories/plan-input` is exported only to `app/schedule`, with `dependency-cruiser` failing on any other importer — **this, not a list of callers, is what closes the trigger set's input side** (AR-43)

**Given** the two layers
**When** they are named
**Then** `domain/schedule.recalculate(inputs, prevInputs) → outputs` is pure and reads nothing but its arguments, `app/schedule.recalculateProject(ctx, projectId, cause)` resolves the inputs, calls it and appends the run, and **nothing else is called `recalculate`** (AR-47)

**Given** `schedule_run.inputs`
**When** it is written
**Then** it is **fully resolved — every value, no pointers**: the whole WP tree leaf and summary, the per-leaf duration, constraint, actual dates and `recorded_pct`, the edges with lag and type, the three Project settings, and **the resolved non-working-day set itself** with its range and version seq, because a pure function cannot dereference a reference
**And** the resolution watermarks are carried as assertions that a recompute saw the same values, never as a second filter (AR-48)

**Given** a 500-WP, 500-edge Project from Epic 1's fixture
**When** a run is appended
**Then** the payload is **measured** — raw bytes, stored bytes after `pglz`, and WAL per append — and compared against AD-26's measured 385 kB raw / ~141 kB stored / ~152 kB WAL, failing if it diverges beyond a stated tolerance
**And** the measurement is real, because AD-5's retention rule is sized off that figure and an earlier draft of AD-26 guessed 25 KB (AR-50)

**Given** the payload
**When** it is encoded
**Then** `inputs.wps` is an array and every other reference in `inputs` and `outputs` — `parent_id`, both ends of each edge, the critical path, the driving chains, the violation rows — is that array's **integer index**, ordered by `compareWp`, so a `wp_id` is written once per WP rather than five or more times (AR-50, AR-55)

**Given** AD-5's retention rule
**When** it is exercised
**Then** a run's `inputs` may be deleted only when it is older than the oldest run its Project still references and is not the latest; `outputs` may be dropped earlier because it is a pure function of `inputs`; and `inputs` and the `causes` array are never dropped while the run is retained
**And** a test proves that **the runs between two Reviews survive**, which is the set FR-28 attributes date movement from and the set a last-N-runs rule would have deleted (AR-11)

**Given** the recalculation
**When** it runs
**Then** it is **synchronous inside the fence's transaction** under the per-Project exclusive lock — the one sanctioned long hold of that lock — measured against NFR-P1's 300 ms p95 for 500 WPs on Epic 1's fixture
**And** if the budget is missed the lever is **lock granularity, never a background path**, because FR-6b forbids one (AR-53)

**Given** a snapshot ingest for the same Project arriving during a recalculation
**When** it tries to write
**Then** it waits behind the fence with a `lock_timeout` set and records a retryable failed attempt rather than blocking indefinitely, because an advisory-lock wait is otherwise unbounded (AR-53)

**Given** `wp_schedule`
**When** a run completes
**Then** it is rebuilt from the latest run as a `derived` projection with `stale = false`, `app/schedule` holds INSERT, UPDATE and DELETE on it and **INSERT only on `schedule_run`**, and nothing pinned ever references `wp_schedule` (AR-49, AR-11)

**Given** an edit that cannot be scheduled
**When** validation or the passes reject it
**Then** the whole mutation rolls back with its reason and **nothing is persisted** (AR-46)

**Given** the three closure tests
**When** CI runs
**Then** *writers*: every statement writing an AD-25 input row is inside the fence; *callers*: the callers of `recalculateProject` are exactly FR-6b's trigger list; *reachability*: `recalculateProject` is unreachable from `ingestSnapshot`, `evaluateRules`, every `mapping` use case and every Tracker-driven job handler
**And** all three are required, because addendum A.5 proposed only the third and alone it cannot close the set: the snapshot path never calls the function, it changes an input the function reads (AR-52)

**Given** `domain/schedule`
**When** its imports are checked
**Then** it may not import `domain/attribution`, so no evidence-derived figure can become a scheduling input without an import edge CI rejects (AR-1, AR-52)

*Sizing note for `bmad-sprint-planning`: this is the heaviest story in the plan — the fence, `schedule_run`, the size measurement, the retention rule and the three closure tests. It is written as one story because the fence and the run are one transaction and splitting them would leave a half-closed trigger set, but it is the first candidate if a story has to fit a smaller session.*

### Story 2.10: Work Packages, actual dates and Custom Fields, edited through the fence

As a PM,
I want to create and edit Work Packages and record when work really started and finished,
So that the plan reflects the project, and a mid-flight project is scheduled on the work that is left.

**Acceptance Criteria:**

**Given** a leaf WP
**When** a PM edits it
**Then** they set name, duration in working days, planned effort in hours, an optional constraint, an optional actual start and actual finish, assigned Resources, Custom Field values and the milestone flag — **and no planned date, because planned dates are not typed** (FR-5)

**Given** a PM who types into a derived date cell
**When** the edit is attempted
**Then** it is refused with "Planned dates are derived. To pin a date, set a constraint." and focus moves to that row's constraint cell — a refusal that teaches the model, rather than a disabled grey cell that does not (UX-DR12, FR-5)

**Given** a leaf WP carrying a duration, constraint or dependency
**When** it is given a child
**Then** the PM must resolve it in the same action — the tool asks which child takes them, or confirms they are dropped — and the leaf-only `CHECK` clears those columns **in the same statement** as the row that flips `child_count`, because a CHECK cannot be deferred (FR-5, AR-45)

**Given** a leaf WP with dependencies
**When** it is deleted
**Then** its incoming and outgoing edges are deleted with it and listed in the confirmation with the WPs at the other end, and they are **never re-linked predecessor-to-successor** — an edge the PM never drew is an edge nobody can explain later (FR-5, AR-45)

**Given** a WP the PM marks complete
**When** the action runs
**Then** it asks for the actual finish and proposes today, which the PM can change to the date the work really finished; where the WP has Mapped Tickets the **first observed activity** is shown beside the actual start as evidence with a one-click fill, and **is never written by the system** (FR-5, UX-DR13)

**Given** an actual finish earlier than its actual start
**When** it is submitted
**Then** it is refused with the reason (FR-5)

**Given** an actual date later than the Data Date
**When** it is submitted
**Then** it is neither accepted silently nor rejected: the PM is asked to advance the Data Date to cover it **in the same action**, because the two are one statement about how far the plan has got (FR-5, FR-43)

**Given** a Recorded Percent Complete typed on the Plan grid
**When** it commits
**Then** it is written to `pct_override_event` through the fence as an ordinary input edit and triggers a recalculation. **FR-30's audited override — the mandatory reason and the Observed-versus-Recorded comparison — is Epic 6's**, and this story does not build it (AR-42, FR-6b)

**Given** Custom Fields
**When** a PM defines them
**Then** they are text, number, date or single-select, usable as columns and grouping axes, and a Project with **100** of them meets NFR-P1 — the tested bound is the bound, the 101st is not blocked but is warned as untested (FR-8)

**Given** any of these edits
**When** it commits
**Then** it produced its audit row in the same transaction, with the previous value and, for an actual date, its source — typed, imported, or accepted from a first-observed-activity proposal (NFR-A1, AR-26)

### Story 2.11: The three Project schedule settings

As a PM,
I want a Project start, an optional Project finish and a Data Date,
So that the forward pass has an origin, the backward pass has a target, and I decide when the plan moves through time.

**Acceptance Criteria:**

**Given** a Project with no Project start
**When** it is opened
**Then** it shows a "no project start yet" state in place of dates, `FR-6b` does not run, and the schedule strip carries the one action, *Set Project start* (FR-43, UX-DR23)

**Given** a PM setting a Project finish for the first time, or clearing one
**When** they confirm
**Then** the confirmation states what it actually does — "This moves no work package. It changes what Float is measured against, and lets Float go negative" — and **no WP moves**; only the backward pass's origin changes (FR-43, UX-DR5)

**Given** a Project created with no Data Date
**When** it is set
**Then** it is set in the same action as the Project start, it **defaults to today** and never to a date read out of the plan's contents, and thereafter only the PM advances it (FR-43)

**Given** an attempt to set the Data Date earlier than the latest actual finish in the Plan
**When** it is submitted
**Then** it is rejected with the WPs that block it, because the scheduler would otherwise have to place completed work in the future (FR-43)

**Given** the Data Date panel
**When** the PM is offered an advance
**Then** it names what will happen before it is pressed — "Advancing to 26 Sep re-dates 78 remaining work packages" — and it is **never advanced automatically** (FR-43, UX-DR14)

**Given** a change to any of the three
**When** it commits
**Then** it triggers a full recalculation through the fence and is audited with its author, its time and its previous value (FR-43, AR-26)

**Given** a Tracker Snapshot, a ledger entry, a Mapping change or a Mapping Rule firing
**When** any of them happens
**Then** **every WP date is exactly where it was**, and the reachability test in 2.9 is what holds that true as the system grows (FR-43, AR-52)

### Story 2.12: The Holiday Calendar and its dated versions

As a PM,
I want the working-day calendar versioned, national tables included,
So that adding a client holiday in November cannot change what an October Baseline re-derives to.

**Acceptance Criteria:**

**Given** a Project's Holiday Calendar
**When** it is configured
**Then** it uses Japanese national holidays, Vietnamese national holidays including Tết, or both, and the PM can add Project-specific non-working days, written to `calendar_day_event` (FR-14)

**Given** a calendar version
**When** it is created
**Then** `holiday_calendar_version` stores the **fully resolved** non-working-day set as `date[]` over `[range_start, range_end]` — national tables and Project days already merged — never a calendar name, and it is never edited (AR-57, FR-14)

**Given** the three things that create a version
**When** any of them happens
**Then** a new version is appended with its author or source, its time and an optional reason: a Project-specific non-working day added or removed; a change to which national calendars are in use; and **any correction or extension of the JP or VN national tables themselves** — the third is what makes the versioning real, since Japan legislates holidays year by year and they are 95% of the calendar (FR-14)

**Given** `app/calendar.publishCalendarVersion`
**When** an operator publishes a national-table correction affecting several Projects
**Then** it opens a transaction **per Project**, takes that Project's lock, appends the version and calls `recalculateProject(cause = 'calendar changed')` — **one Project's lock at a time and never two at once**, so the fan-out cannot deadlock against an ingest
**And** it writes `operator_audit` once and each Project's `audit_log` per Project, and reports per-Project success, halt or failure, with a halted Project not stopping the rest (AR-57)

**Given** a plan that runs past the loaded range
**When** the recalculation runs
**Then** the run is appended with a `halted_reason` and no `outputs`, `wp_schedule` keeps the last good run with `stale = true`, and the PM sees the WPs and the range needed — with the banner saying extending it is an **operator** action (AR-58, UX-DR23)

**Given** the national dataset for 2026–2028
**When** it ships
**Then** it is a versioned static dataset in the repo, its id recorded on each version as provenance, and working-day arithmetic stays in `domain/calendar` taking the resolved set as an argument (AR-27, AR-57)

**Given** the Current Plan
**When** a new version is created
**Then** it uses the latest version and the resulting date movement carries the cause *calendar changed* (FR-14, FR-28)

### Story 2.13: The Plan tree grid and its Schedule preset

As a PM,
I want the whole plan as one keyboard-driven grid carrying every column the engine produces,
So that R0 has a complete scheduling surface without a Gantt.

*Stories 2.13 to 2.16 are **the plan surface OQ-11 asks to be sized as its own line item**, separately from the engine in 2.3 … 2.9. `EXPERIENCE.md`'s Core/Comfort tier is given per acceptance criterion so the Comfort rows can be cut without rewriting a story.*

**Acceptance Criteria:**

**Given** the Plan surface
**When** it renders
**Then** three leading columns are frozen — WBS code, Name carrying the expand control, and the state glyph — and they are frozen **visually only**, staying in the same row and reading order so a screen reader hears one row (UX-DR3, **Core**)

**Given** the grid
**When** a screen reader or keyboard user works it
**Then** it follows the ARIA treegrid pattern with `aria-level`, `aria-expanded`, `aria-posinset` and `aria-setsize`; inline edit opens on double-click or `Enter`, `Esc` cancels, commit is on blur, `Enter` or `Tab`; and a commit FR-6a rejects changes nothing and triggers no recalculation (UX-DR24, NFR-U1, **Core**)

**Given** the Schedule preset, which is the default
**When** it renders
**Then** it carries derived start, derived finish, duration, predecessors, constraint, Float, Critical and Exception after the frozen three, and **fits the grid's own width** — measured at 1,229px against the 1,232px available at a 1280px viewport with the sidebar collapsed (UX-DR4, **Core**)

**Given** the Data Date
**When** rows render
**Then** dates on or before it are set in the muted ink and dates after it in full ink, which with the state glyph is FR-7's "boundary between the two halves of the plan" made visible in a grid (UX-DR12, FR-7, **Core**)

**Given** a summary WP
**When** its scheduling cells render
**Then** duration, predecessor, constraint, Float, Critical and Exception show an em dash whose accessible name is "not applicable — summary work package, rolled up from its children" — **never blank**, because blank reads as missing data (UX-DR12, **Core**)

**Given** negative Float
**When** it renders
**Then** it is the number with its minus sign, never 0 and never blank (UX-DR12, FR-7, **Core**)

**Given** the critical path
**When** it renders
**Then** the Critical column reads the **word** "Critical" with a bar glyph and the row takes an ink left rule, and the column header names the anchor in short form, because the same WP can be critical against one anchor and not the other (UX-DR12, FR-6b, **Core**)

**Given** the Percent Complete shown in the Schedule preset
**When** it renders
**Then** it is the **Recorded** figure, because that is the one FR-6b reads (UX-DR12, **Core**)

**Given** the four presets
**When** they are built
**Then** Schedule is complete here; the **Progress** preset's Epic 2 columns (actual dates, Recorded %, remaining duration) ship here and its Observed %, Gap and Evidence columns are completed in Epics 5 and 6; **Baseline compare** is completed in Epic 4; and **All** is Comfort (UX-DR4, measured seam)

**Given** `1`–`4`
**When** pressed inside the grid
**Then** the preset changes **without losing the focused row**, so a preset change is a change of view and never of place; the choice is persisted per user per project (UX-DR24, **Core**)

**Given** a plan of 500 WPs from Epic 1's fixture
**When** the grid loads
**Then** it meets NFR-P1's under 2 s p75 and under 4 s p95 (NFR-P1)

### Story 2.14: Dependencies and constraints are created and explained on the grid

As a PM,
I want to type predecessors and constraints straight into the grid and be told exactly why one is refused,
So that FR-6a has an editing surface a keyboard user owns.

**Acceptance Criteria:**

**Given** the predecessor cell
**When** the PM types
**Then** it takes MS-Project-shaped text — `2.3FS+2d, 2.4` — with `FS` omittable as the only R0 type and lag in working days that may be negative, and autocomplete over WBS code and WP name offering **leaf WPs only** (UX-DR6, **Core**)

**Given** a commit the graph rules reject
**When** the error renders
**Then** it appears under the cell naming the offence and the WPs in it — "2.1 → 2.3 → 2.1 would be a cycle", "4.2 is an ancestor of 4.2.1", "3.0 is a summary work package", "that work package is in another project"
**And** **the cell keeps the typed text**, so the PM corrects rather than retypes (UX-DR6, FR-6a, **Core**)

**Given** a rejection
**When** it is announced
**Then** it is announced **assertively**, because it means the edit did not happen — while a successful recalculation is announced politely (UX-DR26, NFR-U1, **Core**)

**Given** the constraint cell
**When** it renders and is edited
**Then** it holds both halves in one column, reading "Must finish on 18 Mar 2027" and editing as type then date; a non-default type requires the date, and clearing the date returns the type to *as soon as possible* (UX-DR7, **Core**)

**Given** a milestone
**When** its target date is edited
**Then** it is edited **in the constraint cell like any other constraint**, not in a field of its own (UX-DR7, §3, **Core**)

**Given** a constraint the graph already makes impossible
**When** it is committed
**Then** the violation appears in the same row's Exception cell **in the same interaction** — the cell never promises the date will be met (UX-DR7, **Core**)

**Given** the Links panel opened with `l`
**When** it renders
**Then** it lists the selected WP's predecessors **and successors** as rows with the other end's dates and Float, runs the same FR-6a checks, and shares the rail's slot
**And** it is **Comfort**: the predecessor cell alone satisfies FR-6a and FR-7, and cutting it costs discoverability, not access (UX-DR11, **Comfort**)

### Story 2.15: The schedule strip and the What-moved band

As a PM,
I want the plan's scheduling context on one line and a plain answer when one edit moves a hundred dates,
So that I never read a Float number without knowing what it was measured against, and never watch a grid quietly redraw itself.

**Acceptance Criteria:**

**Given** the schedule strip above the grid
**When** it renders
**Then** it carries the Project start, the Project finish or *not set*, the Data Date, the computed finish, the minimum Float, and **the Float anchor as a sentence, not a label** — "Float measured against the Project finish, 31 Mar 2027", or "Float measured against the computed finish, 12 Mar 2027 — relative, because no Project finish is set" (UX-DR5, **Core**)

**Given** the strip
**When** the grid scrolls
**Then** it never scrolls away, because it is the only place a Float number means anything (UX-DR5, **Core**)

**Given** all three Project settings
**When** the PM edits one on the strip
**Then** it is an inline edit that goes through the fence and recalculates, exactly as editing it in Project settings would (UX-DR5, FR-43, **Core**)

**Given** any recalculation
**When** it settles
**Then** the What-moved band appears under the toolbar with one line — "142 work packages moved · computed finish 12 Mar → 26 Mar 2027 · minimum Float +4 → −3" — and *See what moved* groups the moved WPs under **FR-28's seven causes** with old and new dates, any entry focusing that WP in the grid (UX-DR10, FR-28, **Core**)

**Given** an edit that moves nothing
**When** the band appears
**Then** it says **"No dates moved"**, because silence and nothing-moved are different answers (UX-DR10, **Core**)

**Given** the band
**When** the PM looks away and comes back
**Then** it persists until the next recalculation or until dismissed (UX-DR10, **Core**)

**Given** a recalculation
**When** it completes
**Then** it is announced politely — "142 work packages moved. Computed finish 26 March 2027. Minimum Float minus 3." — and changed cells take a 300 ms highlight that reduced-motion users get without the transition (UX-DR26, UX-DR10, NFR-U1, **Core**)

**Given** a second PM who recalculated while this grid was open
**When** the band appears
**Then** it is attributed — "142 work packages moved · edited by Hoang, 3 min ago" — and carries **no Undo**, because undoing someone else's edit is not this band's job (UX-DR23, **Core**)

**Given** *Undo this edit*
**When** it is considered for a cut
**Then** it is **Comfort**: the PM re-edits by hand, and the plan is never wrong, only slower to fix (UX-DR10, **Comfort**)

**Given** a recalculation in flight
**When** the grid renders
**Then** it stays interactive and affected date cells show "…", **never their previous values** (UX-DR23, **Core**)

### Story 2.16: The schedule-exceptions rail and its three explainers

As a PM,
I want every exception the engine found in one ranked queue with an explanation I can walk,
So that a missed date comes with the chain that caused it instead of a badge nobody reads.

**Acceptance Criteria:**

**Given** the rail
**When** it renders
**Then** it has three collapsible groups, always in this order, each with its count: **Constraint violations** ranked by working days late worst first, **Out-of-sequence links**, and **Not schedulable yet** (UX-DR8, FR-6b, **Core**)

**Given** a viewport below 1680px
**When** the rail becomes a drawer
**Then** the toolbar toggle **always carries the total count**, so a shut drawer never hides an exception (UX-DR8, UX-DR27, **Core**)

**Given** no exceptions
**When** the rail renders
**Then** it says "No schedule exceptions" rather than vanishing, because absence and emptiness are different facts (UX-DR8, **Core**)

**Given** the constraint-violation explainer
**When** it opens
**Then** it names the date asked for, the date derived, **how many working days late and on which Holiday Calendar version**, and the predecessor chain that forced it
**And** it closes with the line that keeps the model honest: "This violation stays on this work package. It has not changed any other work package's Float." (UX-DR9, FR-6b, **Core**)

**Given** the out-of-sequence explainer
**When** it opens
**Then** it states the fact — "WP 2.4 started 12 Sep, before WP 2.3 finishes 19 Sep. Actual dates are kept. The successors of 2.4 are driven from its actual start." — and **offers no fix, because there is nothing wrong**; it is neutral ink, never amber, never red (UX-DR9, UX-DR23, **Core**)

**Given** the not-schedulable explainer
**When** it opens
**Then** it states the consequence — excluded from both passes and the critical path, successors driven as though it were absent, blocks the next Baseline — **with a duration field in the popover**, so the fix is one action from the explanation (UX-DR9, FR-6b, FR-15, **Core**)

**Given** `j`, `k` and `Enter`
**When** used in the rail
**Then** `j`/`k` walk the whole rail across groups and `Enter` scrolls the grid to that WP, focuses its row and opens the explainer; `e` opens the explainer on the focused row; `x` toggles the drawer (UX-DR24, **Core**)

**Given** every exception
**When** it is marked
**Then** it is **glyph plus word plus number** in the Exception cell and again as a rail item — "▲ Late 6d", "⇄ Out of sequence", "⊘ No duration" — and no row is ever marked by colour alone (UX-DR12, UX-DR26, NFR-U1, **Core**)

**Given** the violation explainer's walkable chain
**When** it is considered for a cut
**Then** it is **Comfort**: the chain can be listed as plain text without per-WP focus jumps (UX-DR9, **Comfort**)

**Given** a structural edit that left an illegal edge
**When** the Plan renders
**Then** a band at the top reads "This plan cannot be scheduled. 2 dependencies are invalid." with the offending edges named and each one's fix, and the grid shows **the last good schedule with every derived date marked stale** — never a guess, never blanks (UX-DR23, FR-6a, **Core**)
## Epic 3: The client's Excel WBS becomes a live plan in one session

A PM can upload a real client .xlsx, choose the sheet and header row, map columns with header-based suggestions in English and Japanese, and see every row in a mandatory preview before anything is written — with its level, the duration derived from an imported start/finish pair, the dependencies and constraints read, the progress read, which of the three scheduling states each row will arrive in, and the dates the scheduler will produce. A mid-flight project therefore arrives mid-flight. A later version of the same file re-imports as a diff that separates input changes from the date movement they caused.

*Eight stories. FRs: FR-9, FR-10, FR-11. This epic has a genuine risk boundary of its own — AD-13 records that **ExcelJS fit is a spike, not an assumption** — which is why story 3.1 exists before any import feature is written.*

### Story 3.1: Prove the workbook reader against real client files

As the founder,
I want three real Japanese WBS workbooks parsed through the port before any import feature is built,
So that a library that cannot read my clients' files is discovered in the first story rather than the tenth.

**Acceptance Criteria:**

**Given** three real Japanese WBS workbooks with merged headers, shared formulas, Japanese text and date cells
**When** they are parsed through `WorkbookPort` over ExcelJS
**Then** the test asserts the **merge ranges** and the **cached formula results** it read, and the non-streaming API is used — the streaming `WorkbookReader` has historically weak merge support and is not used (AR-25)

**Given** the parse
**When** it reads a formula cell
**Then** it reads the **cached result** and never evaluates the formula, and macros are never executed (AR-24, NFR-S8)

**Given** an uploaded file
**When** limits are checked
**Then** they are checked **before ExcelJS sees it**: 10 MB file size, and a 50 MB unpacked total read from the **zip central directory** rather than by decompressing, because ExcelJS has no zip-bomb guard and reads the whole workbook into memory (AR-24)

**Given** a workbook that passes those two limits
**When** its cells are counted at parse time
**Then** a workbook above 1,000,000 non-empty cells is rejected, against a nominal grid ceiling of 20,000 rows × 200 columns (AR-24)

**Given** a rejected upload
**When** the PM sees it
**Then** the message states the limit that was exceeded, inline (UX-DR23)

**Given** the spike's result
**When** ExcelJS proves unable to read the corpus
**Then** the recorded fallback is **SheetJS CE from `cdn.sheetjs.com`** — explicitly *not* npm `xlsx@0.18.5`, which is frozen and carries prototype-pollution and ReDoS advisories — and `WorkbookPort` is what makes the swap local (spine *Open Questions*)

### Story 3.2: Upload a workbook and map its columns

As a PM,
I want to upload an .xlsx, pick the sheet and header row, and map each column to a field with suggestions,
So that a client's own spreadsheet becomes structured data without me retyping it.

**Acceptance Criteria:**

**Given** an .xlsx upload
**When** it is stored
**Then** it goes through `BlobStore` and its parse lands in an `import_draft` row, which this story creates as class `mutable_audited` because nothing in `domain` compute reads it (AR-24, AR-38, measured baseline)

**Given** a workbook with several candidate sheets
**When** the PM reaches step 1
**Then** a sheet chooser shows row counts and the first rows of each sheet, and **nothing is committed** (FR-9, UX-DR23)

**Given** the chosen sheet
**When** the PM confirms the header row
**Then** the row preview shows what each candidate header row contains (UX-DR21)

**Given** the columns
**When** the mapper renders
**Then** each row shows the header text, sample values and a suggested field **with its reason** — "suggested from header 開始日" — and unmapped columns default to "Create Custom Field" (UX-DR21, FR-9)

**Given** the mappable field set
**When** the PM maps
**Then** it is: WBS code or indentation level, name, start, finish, **duration, predecessors, lag, constraint type, constraint date**, **actual start, actual finish, percent complete**, effort, assignee, milestone, or a Custom Field (FR-9)

**Given** English and Japanese headers
**When** suggestions are computed
**Then** both are matched (FR-9)

**Given** any cell content
**When** it reaches the preview or any other screen
**Then** it is treated as untrusted and escaped wherever displayed (FR-10, NFR-S8)

### Story 3.3: What the importer derives, and the one date it is allowed to keep

As a PM,
I want an imported start/finish pair turned into a duration rather than into typed dates,
So that the plan the file becomes is a working plan and not a picture of one.

**Acceptance Criteria:**

**Given** an imported start/finish pair and a mapped duration column
**When** the import is interpreted
**Then** **the duration column wins**, and the imported dates are kept as reference Custom Fields named after their source columns (FR-9)

**Given** an imported start/finish pair and **no** duration column
**When** it is interpreted
**Then** the duration is the working-day count from the imported start to the imported finish inclusive, on the Project's calendar, and the imported dates are kept as reference Custom Fields (FR-9)

**Given** a row carrying only one of the pair, or a finish before its start
**When** it is interpreted
**Then** it is flagged in the preview and imported **with no duration**, which makes it a "not schedulable yet" row rather than a guess (FR-9, FR-6b)

**Given** any imported date
**When** the import is interpreted
**Then** **it never becomes a constraint automatically** — a plan of three hundred *must start on* constraints is a typed schedule wearing a different hat (FR-9)

**Given** a row mapped as a **milestone**
**When** it is interpreted
**Then** it takes **duration 0**, the working-day derivation does not run on it so a single date cannot become a duration of 1, and its imported date becomes a ***must finish on* constraint** — the one narrow, deliberate exception, stated rather than inferred, because without it every imported milestone would lose the date the client cares about most (FR-9, §3)

**Given** a mapped predecessor column
**When** it is read
**Then** it is a list of WBS codes or WP names each with an optional lag in working days, applied as FR-6a dependencies; codes matching no WP, and links FR-6a rejects, are listed in the preview with their rows and reasons and are **never dropped silently** (FR-9, FR-6a)

**Given** a mapped constraint-type column
**When** it is read
**Then** an unrecognised value is flagged, **never guessed** (FR-9)

**Given** hierarchy, dates and merged cells
**When** they are read
**Then** hierarchy comes from WBS codes (1, 1.1, 1.1.1) or from indentation; the Western and Japanese date forms in the founder's files are parsed, for example `2026/10/01` and `10月1日`; and merged cells are unmerged with each cell taking the merged value (FR-9)

### Story 3.4: The import carries the project's progress

As a PM,
I want actual start, actual finish and percent complete imported like any other column,
So that a four-month-old project arrives mid-flight instead of arriving as though nothing had happened.

**Acceptance Criteria:**

**Given** mapped actual start and actual finish columns
**When** they are imported
**Then** they are written as the WP's **actual dates** — the one kind of date the importer writes — and FR-6b reads them as the record of what already happened and never moves them (FR-9, AR-42)

**Given** a row with an actual finish and no actual start
**When** it is interpreted
**Then** it is flagged; a row whose actual finish precedes its actual start is flagged and **neither date is imported** (FR-9)

**Given** a mapped percent complete column
**When** it is imported
**Then** it is written as a Percent Complete override with the reason recorded as imported from the file and the row, so it is audited and marked PM-adjusted like any other override, and it stands until the PM clears it (FR-9, FR-30)

**Given** a percent complete value outside 0–100, or one on a WP with an actual finish that is not 100
**When** it is interpreted
**Then** it is flagged and **never guessed** (FR-9)

**Given** each imported row
**When** its state is derived
**Then** a row with an actual finish arrives **complete**, one with an actual start only arrives **in progress**, and one with neither arrives **remaining** (FR-9, FR-6b)

**Given** an imported percent complete on an in-progress WP
**When** the schedule is computed
**Then** FR-6b uses it to derive remaining duration, so the WP arrives with the right amount of work left rather than all of it (FR-9, FR-6b)

### Story 3.5: Nothing is written until the PM confirms

As a PM,
I want to see every row exactly as it will be imported, with the dates the scheduler will produce,
So that a misread WBS is caught before it corrupts every number downstream.

**Acceptance Criteria:**

**Given** any import
**When** it reaches the preview
**Then** the PM sees every row with its level, its values and any flagged problems, and can correct values, levels and column mappings in place, with levels changeable by `Tab` and `Shift+Tab` (FR-10, UX-DR21)

**Given** a Project with no Project start or no Data Date
**When** the preview opens
**Then** it asks for both before it will commit, proposing the **earliest imported start** as the Project start and **today** as the Data Date
**And** the Data Date is **never proposed from the file's contents**, because the latest imported date is the plan's intended end, often a year out, and accepting it would schedule every remaining WP after the plan's own finish. Where the file carried actual dates the preview also offers the latest imported actual date as an alternative, and says which of the two it is proposing (FR-10, FR-43)

**Given** the confirmed Project start and Data Date
**When** the schedule preview renders
**Then** it shows the duration derived for every row, the dependencies and constraints read, the progress read, and **the dates the scheduler will produce**
**And** the PM corrects durations, links, constraints, progress and levels — **never a planned date**, because no planned date is imported (FR-10)

**Given** the progress preview
**When** it renders
**Then** it shows per row the actual start, actual finish and percent complete it read, which of the three states the row will arrive in, and the remaining duration that follows; and **totals for the file**: how many rows arrive complete, in progress and remaining
**And** a plan whose rows are all *remaining* on a project the PM knows is mid-flight is visible **before** it is committed, not after the first Baseline has pinned it (FR-10)

**Given** every *must finish on* constraint created from a milestone row
**When** the preview renders
**Then** each is listed with its row and its date and **can be cleared individually** before committing (FR-10, FR-9)

**Given** assignees that match no Resource
**When** the preview renders
**Then** they are listed and the PM creates or links a Resource for each (FR-10, UX-DR21)

**Given** the counts bar
**When** it renders
**Then** it reports rows read, rows imported and rows skipped, **with a reason for each skipped row** (FR-10)

**Given** flagged rows
**When** the PM reviews them
**Then** a "Show only flagged" filter exists, Confirm stays enabled because flags are warnings, and only blocking errors — no name, unparseable hierarchy — disable Confirm, with a count (UX-DR23)

### Story 3.6: Confirming commits once, through the fence

As a PM,
I want the confirmed import written in one transaction with exactly one recalculation,
So that importing 208 rows does not run the scheduler 208 times or leave the plan half-written.

**Acceptance Criteria:**

**Given** `confirmImport(draftId, draftVersion)`
**When** it runs
**Then** it is **the only code path that writes `work_package` rows from a file**, it writes its audit entry in the same transaction, and no code path commits an import without an explicit PM confirmation (AR-24, FR-10)

**Given** the committed diff
**When** the recalculation runs
**Then** `confirmImport` calls it **once, after the whole diff commits** — never per row — and it is one of the **exactly two callers of `recalculateProject` that are not a PM edit**, the other being the operator's calendar-version publication (AR-24, AR-54)

**Given** the import
**When** it writes
**Then** it writes scheduling inputs and actual dates and **never a derived date**, going through `app/schedule.applyPlanChange` like every other input writer (AR-42, AR-43)

**Given** a diff that would turn a mapped leaf WP into a summary
**When** confirm is attempted
**Then** it is refused and the conflict is surfaced for the PM to resolve, because only leaf WPs are mappable (AR-18)

**Given** the commit
**When** it completes
**Then** the audit trail records the import with its actor, its time and the file it came from (NFR-A1)

### Story 3.7: Re-import shows a diff, and says what it did not touch

As a PM,
I want a new version of the same file to arrive as a reviewable diff,
So that the client's updated spreadsheet does not silently erase the scheduling work I did in the tool.

**Acceptance Criteria:**

**Given** a re-import
**When** WPs are matched
**Then** they are matched by WBS code, or by name within the same parent where there is no code, and pairs that cannot be matched are shown for the PM to resolve as "pick a match" or "treat as new/removed" (FR-11, UX-DR21)

**Given** a field that is imported
**When** it differs
**Then** the re-imported value wins, and the diff lists **every value that overwrites an edit made in the tool** (FR-11)

**Given** the diff
**When** it renders
**Then** it has four filters — Added, Changed, Removed, Unmatched — and changed rows show old → new per field (UX-DR21)

**Given** planned dates
**When** the diff renders
**Then** **no planned date is written by the re-import**; the diff shows the resulting date movement in a **separate section** from the input changes that caused it, so the PM sees cause and effect rather than a wall of moved dates (FR-11)

**Given** an actual date or a Percent Complete override
**When** the corresponding column is mapped and the cell is empty
**Then** it is cleared, and **every such clearing is listed in the diff as its own line**; where the column is **not** mapped, the WP's recorded progress is left untouched (FR-11)

**Given** no predecessor column mapped
**When** the re-import runs
**Then** **the dependency graph is left untouched and the diff says so explicitly**, rather than silently erasing scheduling work the PM did in the tool. A dependency is removed only when a predecessor column is mapped and no longer names it (FR-11)

**Given** a re-import
**When** it commits
**Then** it **never changes a Baseline**, and removed WPs' Mappings are handled as in FR-5 (FR-11)

### Story 3.8: The acceptance corpus of ten real client files

As the founder,
I want the importer measured against ten of my own real WBS files,
So that "it imports Excel" is a number rather than a claim.

**Acceptance Criteria:**

**Given** at least 10 real WBS files from the founder's projects
**When** each is imported
**Then** **100% of rows land at the correct level with 5 or fewer manual corrections** in the preview (FR-9, SM-4)

**Given** the corpus
**When** it is stored
**Then** it is **not in the repository**: it lives in a Japan-region, access-controlled bucket or a local-only path, and its tests run under a local-only tag that CI skips (AR-41, NFR-S4)

**Given** the corpus
**When** it is assembled
**Then** it includes **mid-flight files carrying actual dates and a percent-complete column**, because progress import is what makes the Data Date work on day one (addendum A.3)

**Given** a corpus run
**When** it reports
**Then** the correction count per file is recorded, because SM-4 tracks it as a secondary success metric (SM-4)

## Epic 4: A Baseline that can explain itself years later

A PM can set a Baseline from the Current Plan and Re-baseline with a mandatory reason, linking Change Request candidates. Every version is kept with its author, time and reason, and any two versions compare **as plans, not only as rows**. An automated test re-derives a Baseline's dates, Float, constraint violations and critical path from its pinned inputs alone, on any machine and at any later date.

*Five stories. FRs: FR-15, FR-16. This epic is where NFR-C1 stops being a sentence and becomes a test.*

### Story 4.1: Set a Baseline that points at the run behind it

As a PM,
I want a Baseline to pin the inputs a schedule was derived from, not only the dates it produced,
So that a plan I baselined last October can still explain itself next year.

**Acceptance Criteria:**

**Given** the Current Plan and its latest `schedule_run`
**When** the PM sets a Baseline
**Then** `baseline_version.schedule_run_seq` is a real foreign key to that run, and the inputs are pinned **by reference, not by a second copy** — the run already carries the durations, constraints, actual dates, Recorded Percent Complete, dependency graph, three Project settings and calendar version that produced those dates (AR-22, FR-15)

**Given** `baseline_wp`
**When** it is written
**Then** it keeps only the cost projection that PV, BAC and Divergence read — per leaf WP the derived dates, the planned effort, the assigned Resources, the milestone flag, the Catch-all flag and the Rate-derived cost — so the pinned input set has exactly one representation (AR-22, FR-15)

**Given** AD-5's retention rule
**When** a Baseline references a run
**Then** that run's `inputs` can never be deleted while the Baseline exists, which is what makes the reference permanent rather than a dangling pointer (AR-11)

**Given** a Plan with any leaf WP missing a duration, or a Project with no Project start
**When** a Baseline is attempted
**Then** it is **refused with the blocking WPs shown**, because the result would not be re-derivable
**And** *Set Baseline* is disabled while any "not schedulable yet" row exists, with the count and a link into the exceptions rail (FR-15, UX-DR23)

**Given** a recorded Baseline
**When** anything tries to change it
**Then** it cannot be edited: `baseline_version` and `baseline_wp` are `append_only`, enforced by the missing grant and the trigger (FR-15, AR-9)

**Given** a Project before its first Baseline
**When** the Review is opened
**Then** it shows "No Baseline yet. EVM starts once you set one." with *Set Baseline*, and the Unplanned Work section still shows Unmapped Work (FR-15, UX-DR23)

### Story 4.2: The re-derivation test

As the founder,
I want an automated test that reproduces a Baseline's schedule from its pinned inputs alone,
So that NFR-C1 is a gate rather than a sentence in a document.

**Acceptance Criteria:**

**Given** a Baseline version's pinned run
**When** the test runs
**Then** it evaluates `recalculate(run.inputs, prevRun.inputs)` and compares the result to `run.outputs`, reproducing that version's **dates, Float, constraint violations and critical path exactly** (FR-15, AR-51)

**Given** the test
**When** it reads its inputs
**Then** it reads the run and **never the Current Plan** (AR-22, FR-15)

**Given** the comparison
**When** it is made
**Then** it compares through the **AD-4 codec's canonical decoded form, not stored bytes** — `jsonb` reorders keys and renormalises numbers, so a test that diffs column text will flake (AR-8, AR-26)

**Given** the critical path
**When** it is compared
**Then** it is compared as an **ordered** set, which is exactly what OQ-13's tie-break rule exists to make reproducible (AR-55, FR-15)

**Given** a golden Baseline recorded under an earlier `engine_version`
**When** the gate runs after a scheduler change
**Then** it re-derives that Baseline under **its own** recorded version, so a bug fix does not turn every historical run red (AR-51)

**Given** the gate
**When** CI runs
**Then** it blocks merge (AR-35)

### Story 4.3: Re-baseline, with a reason and a history

As a PM,
I want to Re-baseline with a mandatory reason and keep every version,
So that the Baseline moves only when I decide it should, and the record says why.

**Acceptance Criteria:**

**Given** a Re-baseline
**When** it is recorded
**Then** a reason is **mandatory**, and the PM can link Change Request candidates to it (FR-16)

**Given** every Baseline version
**When** the history is read
**Then** each is kept with its author, its time and its reason (FR-16)

**Given** a Re-baseline
**When** it commits
**Then** it takes the AD-20 per-Project lock before allocating its `seq`, so a snapshot ingest spanning it cannot attribute an entry to the wrong active Baseline (AR-37, AR-15)

**Given** hours recorded before a Re-baseline on a newly baselined WP
**When** they are judged
**Then** they **stay Unplanned Work**, because baselined status is judged against the Baseline version active when the entry was recorded — a Re-baseline never erases Unplanned history (FR-30, FR-16)

**Given** a Re-baseline
**When** it commits
**Then** it produces its audit row (NFR-A1)

### Story 4.4: Compare two versions as plans, not only as rows

As a PM,
I want a comparison that shows a removed dependency, not just the hundred WPs it moved,
So that a plan that shifted three weeks always has a recorded reason.

**Acceptance Criteria:**

**Given** any two Baseline versions
**When** they are compared
**Then** the comparison is WP by WP **and** per Project lists: dependencies added and removed, lags changed, constraints added, changed and removed, durations changed, actual dates recorded or corrected, Percent Complete changed, milestone flags changed, the Holiday Calendar version, and any change to the Project start, Project finish or Data Date (FR-16)

**Given** a dependency removed between two versions
**When** the comparison renders
**Then** it appears — because **a dependency is an edge, not a WP attribute**, and a WP-by-WP diff can otherwise show WP 2.4 and everything after it moving three weeks while showing no reason anywhere (FR-16)

**Given** any WP whose dates differ between two versions
**When** the comparison renders
**Then** it names **at least one input change from that list that accounts for it**; a plan that moved for no recorded reason is the failure this requirement exists to prevent (FR-16)

**Given** the two versions
**When** WPs are matched across them
**Then** they are matched on `wp_id`, with `wbs_code` used only to sort, because a re-parent may renumber (AR-55)

**Given** a Published Snapshot
**When** it is recorded
**Then** it records the Baseline version it used (FR-16)

### Story 4.5: Baseline comparison as columns on the Plan grid

As a PM,
I want the active Baseline's dates beside the Current Plan's with the difference,
So that I can see what moved without a chart R0 does not have.

**Acceptance Criteria:**

**Given** the Plan grid's **Baseline compare** preset
**When** it renders
**Then** it shows Baseline start, derived start and Δ; Baseline finish, derived finish and Δ; Baseline duration, duration and Δ; and Baseline effort, effort and Δ — **as columns, because R0 has no bars to draw them on** (FR-7, UX-DR4, **Core**)

**Given** a Project with no Baseline
**When** the preset is selected
**Then** it is disabled with "No Baseline yet", and the other presets work normally — the Current Plan schedules without one (UX-DR23)

**Given** Divergence
**When** it is computed
**Then** it compares `baseline_wp` with the **pinned `schedule_run`** — its `outputs` for dates and its `inputs` for effort — and never with `wp_schedule` or a `work_package` column, both of which AD-10's closure rule puts out of reach of a compute function (AR-22)

**Given** the preset
**When** it is sized
**Then** it fits the grid's own width like the other two sized presets, and adding a column to it takes width from another (UX-DR4, **Core**)
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
