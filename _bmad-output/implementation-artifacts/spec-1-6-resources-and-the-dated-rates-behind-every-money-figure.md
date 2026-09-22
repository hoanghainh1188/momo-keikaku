---
title: 'Story 1.6 — Resources and the dated Rates behind every money figure'
type: 'feature'
created: '2026-09-22'
status: 'done'
baseline_commit: '93c26c59f0313a2d40bf20b40741d0b48e9c76a5'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-5-roles-decide-what-each-person-can-reach.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-5-followup-scoped-ids-and-reach-gate.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Money figures still rest on seed-only Resources and `rate_entry` rows, a Project's
default Rate is a mutable column (`project.default_rate_jpy`) with no history, and there is no use
case that creates a Resource or appends a Rate — so a later correction cannot be bitemporal and a
Published Snapshot will have nothing to pin.

**Approach:** Add audited write use cases for Resources and dated Rates, create and register
`project_default_rate_entry` as `append_only` in the same bitemporal shape as `rate_entry`, and teach
the domain Rate lookup the optional `seq ≤ rate_seq_max` / `project_default_rate_seq_max` pins so a
live view and a future snapshot share one rule. Role declarations follow story 1.5's gate.

Decided by the founder on 2026-09-22: **Keep full spec.** PM Rate visibility this story is
discharged only through existing project-scoped reads (no dedicated Rate/Resource list or
`getResourceRates`). `project.default_rate_jpy` stays as a dual-write cache of the current head of
`project_default_rate_entry`. `createResource` inserts the Resource only — empty Rate history is
valid; Rates are a separate Admin-only append.

## Boundaries & Constraints

**Always:**
- Every new use case: entry in `packages/app/src/use-cases/role-declarations.ts`, runner calls
  `authorize` (role before parse), update the `USE_CASE_ROLES` inline snapshot; every new
  `projectScoped` use case also gets a `WELL_FORMED_INPUT` entry in `tests/role-declarations.test.ts`.
- Rates (`rate_entry` and `project_default_rate_entry`) are written by `tenant_admin` only.
  Resource create is `tenant_admin` | `pm` with no Project (`projectScoped: false`) — the third
  declaration shape the role gate's snapshot already anticipates.
- Resources and Rates are tenant-wide; `project_default_rate_entry` is `append_only`, bitemporal
  like `rate_entry` (`seq`, `tenant_id`, `project_id`, `effective_from`, `yen_per_hour`), registered
  in `table-classes.ts`, then `pnpm db:sql`.
- Rate visibility to PMs: no new Rate/Resource read use case. Existing project-scoped reads
  (`getProjectReview` et al.) already `authorize` + `reachesProject` and load that Project's
  assigned Resources' Rates and its default — a PM never loads another Project's Rates. Never a bare
  `ctx.projectIds` read, never in the UI (AD-12). A dedicated Tenant-wide or per-Resource Rate read
  waits for an admin surface that needs it.
- Dual-write / cache: `createProject` inserts the first `project_default_rate_entry` at yen 0 and
  sets `project.default_rate_jpy` to that head; every Project-default append updates the column to
  the new head. Live unpinned default still reads the column; history and pinned lookups read the
  append-only table.
- `createResource` does not append a Rate. Empty history is valid (valuation falls back to the
  Project default). `appendResourceRate` is Admin-only and separate.
- Domain valuation: latest applicable Rate by `effective_from` among rows with `seq ≤` the caller's
  pin (omit pin = no ceiling). Retroactive appends leave the Actuals Ledger untouched.
- New Postgres probe Tenants use a seq base of `830_000_000` or higher. Files UTF-8 without BOM.

**Never:**
- No Resources & Rates UI this story (same cut as story 1.3's org writes).
- No dedicated Rate/Resource list or `getResourceRates` / `getProjectDefaultRates` this story.
- No Resource rename, Department reassign, or Tracker Account link write (FR-13 / later).
- No Published Snapshot surface, no `rate_seq_max` storage on a snapshot row (Epic 5); only the
  lookup helper accepts the pins.
- No drop of `project.default_rate_jpy` this story; no push.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Create Resource | Admin or PM; own Department; name + role | Resource row + audit `resource.create`; id returned; no Rate row | — |
| Create Resource, foreign Department | Department of another Tenant | `not_found`, nothing lands | — |
| Create Resource, viewer | Viewer context | `not_found` before parse | — |
| Append Resource Rate | Tenant Admin; resource + date + yen/h | New `rate_entry` row + audit; ledger untouched | — |
| Append Resource Rate, PM | PM context | `not_found` before parse | — |
| Append Project default Rate | Tenant Admin; own Project + date + yen/h | New `project_default_rate_entry` + column head updated + audit | — |
| Append Project default Rate, foreign Project | Project of another Tenant | `not_found`, nothing lands | — |
| createProject | Tenant Admin | Project + first default Rate row at 0 + column 0 | — |
| Value an hour on a date | Rates with seqs; optional pin | Latest `effective_from ≤ date` among `seq ≤ pin` (or all if no pin); fallback Project default same rule | — |
| Retroactive Rate append | New row with earlier `effective_from` | Ledger rows unchanged; live money uses new head under no pin | — |
| Blank / NUL name or negative yen | Malformed input | `invalid_input` (role-allowed callers only) | — |
| PM sees Rates | PM on project-scoped read for a reached Project | Rates of that Project's assigned Resources + its default only | never bare `projectIds` |

</frozen-after-approval>

## Code Map

- `packages/db/src/schema.ts` — `resource` (:209–217, mutable), `rateEntry` (:219–225, identity
  `seq`, `resource_id`, `effective_from`, `yen_per_hour`); `project.defaultRateJpy` (:196). No
  `project_default_rate_entry` yet. Add it beside `rateEntry`; include in `schemaTables`.
- `packages/db/src/table-classes.ts` — `resource` `mutable-audited` (:187), `rate_entry`
  `append-only` (:193). Register `project_default_rate_entry` as `append-only` (tenant-owned).
  `registry.test.ts` length 23 → 24; `TRUNCATE_ORDER` / `seed.ts` / `probe-tenants.ts` /
  `UNREACHED_TENANT_OWNED_TABLES` must name it. Then `pnpm db:sql` (regenerate
  `packages/db/sql/{rls,grants,triggers}.sql`).
- Schema apply path is `drizzle-kit push` (no checked-in migrations yet), then `pnpm db:policies`.
- `packages/db/src/repo.ts` (:130–131, :241) — loads `resource`+`rate_entry` into domain
  `Resource[]` (add `seq` on each rate); live default still from `project.defaultRateJpy`; load
  Project default history from `project_default_rate_entry` where pinned lookup needs it.
- `packages/domain/src/{types,attribution}.ts` — `Resource.rates` today
  `{ effectiveFrom, yenPerHour }[]` (no `seq`); private `rateFor` sorts by date only. Add `seq`,
  optional pin args; leave Actuals Ledger (`actuals_ledger_entry`) writers untouched.
- `packages/app/src/use-cases/role-declarations.ts` — third template (`tenant_admin | pm`,
  `projectScoped: false`) for `createResource` only. Rate writes stay `adminOnly`. No new Rate
  read entries. Snapshot update in `tests/role-declarations.test.ts`.
- `packages/app/src/use-cases/{org-writes,audited-write}.ts` + `ports/org-write.ts` — pattern to
  mirror for a new Resource/Rate write family (`runAuditedWrite`, Clock stamp, id port). Prefer a
  dedicated module + port over stuffing into `org-writes.ts`. `createProject` dual-writes the first
  default Rate row + column.
- `packages/app/src/audit/index.ts` — append closed-enum members (e.g. `resource.create`,
  `rate.append`, `project_default_rate.append`); `audit-declarations.ts` +
  `tests/audited-use-cases.test.ts`.
- `packages/app/src/use-cases/index.ts` — re-export every new use case (enumeration surface).
- `apps/web/src/server/composition.ts` — wire new ports; no page authz; no new admin routes.
- Continuity: story 1.5 helper `authorize`/`reachesProject`; follow-up reach gate +
  `WELL_FORMED_INPUT`; probe seq bases through `820_000_000` taken — use `≥ 830_000_000`.
- Deferred anchor: `deferred-work.md` L512–513 (`default_rate_jpy` placeholder → this story).

## Tasks & Acceptance

**Execution:**
- [x] `packages/db/src/{schema,table-classes}.ts` + `pnpm db:sql` — add and register
  `project_default_rate_entry`; bump registry tests / seed / probe / truncate lists — AR-19, AR-38
- [x] `packages/app` Resource/Rate write ports + use cases + audit enum + role declarations —
  `createResource`; `appendResourceRate`; `appendProjectDefaultRate`; gate snapshot —
  FR-12, AD-12, AD-14
- [x] `createProject` / `NEW_PROJECT_DEFAULTS` — first `project_default_rate_entry` at 0 + column
  head 0; every default-Rate append updates the column — resolve deferred L512–513
- [x] `packages/domain` Rate lookup with `seq` + optional pins; `repo` loads rate `seq`; live
  default still from column — FR-12, AR-19
- [x] Unit + Postgres suites (probe base `≥ 830_000_000`): I/O matrix, role gate, ledger
  untouched on Rate append, cross-tenant foreign ids → `not_found` — FR-1, FR-2, FR-12
- [x] `HANDOFF.md` / `deferred-work.md` / `sprint-status.yaml` — record land; UTF-8 no BOM

**Acceptance Criteria:**
- Given a Tenant, when a Tenant Admin or a PM creates a Resource, then it has a home Department and
  no Rate row unless appended separately.
- Given a Rate or Project default Rate, when anyone but a Tenant Admin creates or changes it, then
  `not_found`. A PM sees Rates only via project-scoped reads of Projects they reach.
- Given this story completes, then `project_default_rate_entry` exists as `append_only`, same
  bitemporal shape as `rate_entry`, and is registered so RLS/grants/triggers generate.
- Given an hour on a date, when valued, then the Rate is the latest applicable under the optional
  `seq` pin; a retroactive append leaves the Actuals Ledger untouched.

## Implementation Notes

- **Schema.** `project_default_rate_entry` beside `rate_entry` (identity `seq`, `tenant_id`,
  `project_id`, `effective_from`, `yen_per_hour`); registered `append-only`; `pnpm db:sql`
  regenerated RLS/grants/triggers. Registry 23→24 / tenant-owned 16→17. Seed inserts the Project's
  first default Rate row matching `default_rate_jpy`. Declared unreached for READ harness (live
  valuation still uses the column).
- **Writes.** Dedicated port `resource-write.ts` + `repo-resource.ts` + `resource-writes.ts`:
  `createResource` (Admin|PM, empty Rate history), `appendResourceRate`, `appendProjectDefaultRate`
  (Admin; dual-writes column). Audit actions `resource.create`, `rate.append`,
  `project_default_rate.append`. Role declarations include the third shape (`STAFF_RESOURCE_ROLES`,
  `projectScoped: false`).
- **createProject.** Takes `WriteDeps`; inserts Project then `resources.appendProjectDefaultRate`
  at yen 0 with `effectiveFrom` = Project date of the Clock stamp (JST default).
- **Domain.** `RateEntry.seq`; exported `rateOnDate`; attribution accepts optional `pins` and
  `projectDefaultRates` for pinned Project-default lookups. Live unpinned path unchanged (column).
- **Tests.** Unit suites for resource writes + `rateOnDate` pins; role snapshot updated;
  write harness / expectations / landedRows cover the three writes and createProject's dual-write;
  Postgres `tests/resources-rates.test.ts` (830_000_000 / 840_000_000). Sabotage: strip pre-parse
  `authorize` from `runResourceWrite` — role gate / unit role cases fail naming the exports; restored.
- **Docs.** Deferred L512–513 Rate half marked resolved; HANDOFF Latest updated; sprint stays
  `in-progress` until review.
- **Review patches (2026-09-22).** `rateOnDate` tie-breaks equal `effectiveFrom` by higher `seq`
  (FR-12 / AD-10). Attribution tests cover `projectDefaultRateSeqMax` + `projectDefaultRates`
  (live column vs pinned history) and equal-date higher-`seq` live selection.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence / route |
|---|---|---|
| Blind: `repo.ts` never loads `project_default_rate_entry` so Project-default pins cannot run from DB | false | Intent Never excludes Published Snapshot this story; live unpinned default reads the column by design. Domain helper accepts pins for Epic 5; no production caller passes them yet. |
| Blind: `createProject` inserts first default Rate without `project_default_rate.append` audit | false | `project.create` payload already includes `defaultRateJpy: 0`; the first history row is part of create, not a separate Rate change. Later appends audit via the use case. |
| Blind / Edge / Gap: `rateOnDate` sort has no `seq` tie-break on equal `effective_from` (comparator returns −1 on ties) | medium | Real — AD-10 / FR-12 want latest `seq` for the date; the live `9000n` test depends on V8 quirk. **patch** |
| Blind: live Project-default column = latest append yen regardless of `effectiveFrom` | false | Intent dual-write: column is the current head of the append stream, not a date-resolved lookup. |
| Blind / Edge: pin set + missing history → silent `0n` | low | Reject — no production pin caller this story; empty history under a ceiling valuing at 0 matches a zero default. Epic 5 wires the reader. |
| Gap (pre-verified): `attribute` `projectDefaultRateSeqMax` / `projectDefaultRates` has no observing test | medium | Confirmed — only `rateSeqMax` is tested. **patch** |
| Blind: Postgres suite lacks foreign-Tenant `appendResourceRate` | false | Unit covers missing Resource; `tests/read-use-cases.ts` enumerates the three writes on the cross-tenant write harness. |
| Blind: web-composition never proves PM `createResource` succeeds | low | Reject — `resource-writes.test.ts` and `resources-rates.test.ts` already prove PM create; composition binds the same export. |
| Blind / Edge: `isoDate` accepts non-calendar strings like `2026-13-40` | low | Reject — real calendar validation is more than a trivial refine; unlikely everyday; Postgres `date` rejects the bad row. |
| Edge: `yenPerHour` above Postgres int32 max | low | Reject — unlikely everyday; DB refuses the insert. |
| Blind: `resource-input.ts` comment vs public exports | false | Comment says not re-exported from `use-cases/index.ts`, which is true; `packages/app` index re-export is separate. |
| Blind: sprint `in-progress` vs spec `in-review` | false | Standing rule: sprint stays `in-progress` until step-05 marks `review`. |
| Blind: Code Map still future-tense | false | Reject — fix would edit this build's planning sections; Code Map is not runtime. |
| Blind: `epic-1-context.md` lost detail in recompile | false | Recompiled in step-01 under compile-epic-context scope rules; still states FR-12 Rate write/visibility. Not a 1.6 code defect. |

## Design Notes

`rate_entry` already uses DB identity `seq` (not client-allocated watermark). Match that for
`project_default_rate_entry`. "Bitemporal" here means append-only history keyed by
`effective_from` + monotonic `seq`, not `valid_from`/`valid_to` columns — same as today's
`rate_entry` and AD-10.

Resource create's role set is intentionally wider than Rate writes: a PM can staff a Tenant with
people; only a Tenant Admin prices them.

## Verification

**Commands:**
- `pnpm lint` / `pnpm typecheck` / `pnpm depcruise` — exit 0
- `pnpm exec vitest run packages/app packages/domain tests/role-declarations.test.ts tests/audited-use-cases.test.ts` — new cases green; snapshot updated deliberately
- `pnpm db:sql` then drift/registry/rls tests — `project_default_rate_entry` present
- `REQUIRE_DB=1` Postgres suites for the new probe file(s) — I/O matrix + ledger-untouched + foreign
  `not_found`
- Sabotage: strip pre-parse `authorize` from one new runner — watch the role gate fail naming it;
  restore
