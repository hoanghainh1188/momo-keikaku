---
title: 'Story 1.8 — A load fixture worth measuring against'
type: 'feature'
created: '2026-09-22'
status: 'done'
baseline_commit: '2f747fc760fe71560c43f40456d27c274c8f1de9'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-7-the-tenant-admin-can-read-the-audit-log.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** NFR-P1 budgets (Epic 2 recalculation, Epic 5 snapshot, Epic 6 Review) have no
realistic Tenant shape to measure against — today's demo is one Project (~48 leaf WPs). There is
also no `CLOCK_MODE=fixture` Clock, so the demo's freshness badge and Reporting Period stay
permanently stale relative to wall time (AR-27).

**Approach:** Ship a deterministic load-fixture generator (5 Projects × 500 Work Packages +
Resources; Tickets deferred to Epic 5), plus a fixture-mode Clock
(`max(latest fixture observedAt, FIXTURE_TIME_ANCHOR)`) wired through config and both composition
roots, with `db/seed` creating data through that same Clock.

Decided by the founder on 2026-09-22: **Keep full scope.** `SEED_PROFILE=demo|load` (default
`demo`) keeps the small `prj-ec2` demo as the day-to-day seed and selects the 5×500 load Tenant
when asked. The generator builds rows **in-process** from a fixed seed (no large JSON committed).
Land required `DEPLOYMENT=local|staging|production` and refuse `CLOCK_MODE=fixture` (and the
sibling AD-17 refusals already named for this key) outside `local`. Seed writes
**fixture-relative sequence values** (and a multi-baseline seq map when needed) so TRUNCATE /
reseed no longer depends on `RESTART IDENTITY`.

## Boundaries & Constraints

**Always:**
- Generator output is deterministic from a fixed seed: two runs produce identical Tenant shape
  (ids, tree, Rates, Resource assignments) (AR-27, NFR-P1).
- Shape: **5 Projects**, each with **500 Work Packages** in a realistic tree, plus Resources
  assigned to them. No Tickets this story (Epic 5 extends the same generator).
- `SEED_PROFILE=demo|load`, default `demo`. `demo` keeps today's small `prj-ec2` path;
  `load` writes the NFR-P1 shape through the same seed / `writeTenantRows` pipeline.
- Generator invocation is **in-process** inside seed / a shared builder — fold
  `scripts/gen-fixtures.ts` and `packages/db/src/fixtures.ts`; do **not** commit a large 5×500
  JSON under `fixtures/`.
- `CLOCK_MODE=fixture` → both web and worker Clocks return
  `max(latest fixture observedAt, FIXTURE_TIME_ANCHOR)`. `system` mode keeps `systemClock`.
- Required `DEPLOYMENT=local|staging|production` (AD-17). Outside `local`, refuse
  `CLOCK_MODE=fixture`, `MAILER=console`, and `TRACKER_ADAPTER_OVERRIDE=fixture` at first config
  read, naming the key. `scripts/seed.ts` reads `DEPLOYMENT` and applies the same Clock refusal.
  Suppliers: `apps/web/.env.development`, worker dev start, `vitest.config.ts` `test.env` — never
  a script prefix or CI job env as the sole source for `local`.
- Seed stamps Baseline / Rates / calendar / `demo_anchor` via the injected Clock; writes
  **fixture-relative** sequence values (and a `fixtureSeq → allocatedSeq` map when more than one
  Baseline version exists) so reseed does not require identity restart (closes deferred L257,
  L280, L307).
- `scripts/seed.ts` injects the Clock into seed; `packages/db` never imports `@momo/adapters`.
- Better Auth / `identity_event.at` stay on wall `systemClock` (AD-15) even under fixture mode.
- Files UTF-8 without BOM. Load-fixture probes if any use seq base `≥ 870_000_000`.

**Never:**
- No Epic 2 scheduler work, no Tickets, no Published Snapshot surface, no NFR-P1 measurement
  harness that *asserts* the budgets (this story delivers the shape; later epics measure).
- No Japanese / i18n catalog (story 1.9). No push.
- `packages/db` must not import adapters. Do not move session expiry onto the fixture Clock.
- Do not replace the default demo with the load Tenant; do not commit the load shape as checked-in
  JSON.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `SEED_PROFILE=demo` (default) | `pnpm seed` / demo | Small `prj-ec2` Tenant as today; Clock stamps via injected Clock | — |
| `SEED_PROFILE=load` | Fixed seed, local | 5 Projects × 500 WPs + Resources; second run identical shape | — |
| Generate twice (in-process) | Same seed | Identical Tenant shape | — |
| `CLOCK_MODE=fixture` + `DEPLOYMENT=local` | Config + fixture observedAts | `now()` = max(latest observedAt, FIXTURE_TIME_ANCHOR) in web + worker | — |
| `CLOCK_MODE=fixture` outside `local` | `DEPLOYMENT=staging\|production` | Config refuses at first read, naming `DEPLOYMENT` / the forbidden key | hard fail |
| `MAILER=console` / tracker fixture override outside `local` | Same | Refused at first read (AD-17 siblings) | hard fail |
| `CLOCK_MODE=system` | Default / CI without fixture | `systemClock` unchanged | — |
| Seed under fixture Clock | Either profile | Baseline / Rates / calendar / `demo_anchor` via injected Clock; fixture-relative seqs | — |
| Reseed after probe Tenant left behind | Truncate / reseed load or demo | Sequence values match fixture map; no silent Actuals reclassify | — |
| Identity under fixture | Sign-in / reset | Session + `identity_event.at` still wall time | — |

</frozen-after-approval>

## Code Map

- `scripts/gen-fixtures.ts` — today's deterministic mulberry32 generator for **one** Project;
  fold its PRNG / tree helpers into a shared in-process builder that can emit demo or load
  shapes; root `package.json` may gain a thin script that calls the builder (no JSON write of
  the load Tenant).
- `packages/db/src/fixtures.ts` — `buildDemoState`, snapshot rebase via
  `observedAtOffsetHours`; add `buildLoadState` (or profile switch) sharing replay / write
  helpers with demo.
- `packages/db/src/seed.ts` + `scripts/seed.ts` — `SEED_PROFILE`; inject Clock from scripts;
  `writeTenantRows` gains fixture-relative seq stamping + multi-baseline map; do not import
  adapters from `packages/db`.
- `packages/adapters/src/clock.ts` — add `fixtureClockOn({ latestObservedAt, anchor })` (or
  equivalent); keep `systemClock`.
- `packages/app/src/config.ts` — `CLOCK_MODE` (`system` \| `fixture`), `FIXTURE_TIME_ANCHOR`
  (required when fixture), required `DEPLOYMENT`, refusal rules for fixture / console mailer /
  tracker override outside `local`; pin in `config.test.ts`.
- `apps/web/src/server/composition.ts` — select Clock from config (today hard-wires
  `systemClock` ~:429); ensure `.env.development` supplies `DEPLOYMENT=local`.
- `apps/worker/src/index.ts` — first real adapters import: wire the same Clock (HANDOFF /
  deferred L539–545); still no job handlers; do not regress `syncStdout`.
- Continuity: story 1.7 probe seq bases through `860_000_000` — load-fixture probes if any use
  `≥ 870_000_000`.
- Deferred anchors: L82/108 (Clock first consumer), L229–230 (5×500), L257 / L280 / L307
  (fixture-relative seq + multi-baseline map), L516–517 (`demo_anchor`), L532–533 (audit `at`
  mix), L539–545 (worker + seed inject), L835–836 (`DEPLOYMENT` — land this story).

## Tasks & Acceptance

**Execution:**
- [x] `packages/app/src/config.ts` — `CLOCK_MODE` + `FIXTURE_TIME_ANCHOR` + required `DEPLOYMENT`
  + AD-17 refusals; tests
- [x] `packages/adapters` — fixture Clock; export from barrel
- [x] `apps/web` + `apps/worker` composition — select Clock from config; local env supplies
  `DEPLOYMENT=local`
- [x] `scripts/seed.ts` + `packages/db` seed — inject Clock; `SEED_PROFILE=demo|load`; stamp
  Baseline/Rates/calendar/`demo_anchor` via Clock; fixture-relative seq + multi-baseline map
- [x] In-process generator — 5×500 WPs + Resources, deterministic seed; fold gen-fixtures /
  fixtures.ts; no committed load JSON
- [x] Unit + integration: determinism (two builds), fixture Clock formula, system mode unchanged,
  identity still wall time, DEPLOYMENT refusals, reseed seq stability
- [x] `HANDOFF.md` / `deferred-work.md` / `sprint-status.yaml` — record land; UTF-8 no BOM

**Acceptance Criteria:**
- Given the generator, when `SEED_PROFILE=load` runs, then 5 Projects × 500 WPs + Resources,
  deterministic from a seed (AR-27, NFR-P1); default `demo` stays the small Tenant.
- Given the fixture, when later epics measure, then one shared shape serves Epic 2 / 5 / 6 budgets.
- Given no `ticket` table yet, when this story completes, then Tickets are out of scope (Epic 5).
- Given `CLOCK_MODE=fixture` under `DEPLOYMENT=local`, when either role reads the Clock, then
  `max(latest fixture observedAt, FIXTURE_TIME_ANCHOR)`, and seed uses that Clock (AR-27).
- Given `CLOCK_MODE=fixture` (or console mailer / fixture tracker override) outside `local`, when
  config is first read, then it refuses naming the key (AD-17).
- Given a reseed after truncate / leftover probe, when sequences are written, then they follow the
  fixture-relative map and Actuals are not silently reclassified.

## Implementation Notes

- **Config (AD-17 / AD-15).** Required `DEPLOYMENT`; `CLOCK_MODE` default `system`; `FIXTURE_TIME_ANCHOR` required when fixture; `TRACKER_ADAPTER_OVERRIDE` optional; `SEED_PROFILE` default `demo`. Outside `local`, `MAILER=console`, `CLOCK_MODE=fixture` and `TRACKER_ADAPTER_OVERRIDE=fixture` refuse at first read (parseConfig + parseConfigKey). Suppliers: `apps/web/.env.development`, `apps/worker/.env.development` via `start:dev --env-file`, `vitest.config.ts` `test.env`. `pnpm seed` loads `.env.development` via `--env-file`.
- **Clock.** `fixtureClockOn({ latestObservedAt, anchor })` → `max(...)`. Web + worker composition roots select it; Better Auth / `identity_event` stay on `systemClock`. Seed injects the product Clock from `scripts/seed.ts`.
- **Load generator.** In-process `generateLoadFixture` (seed `20260922`): 5×500 shallow WBS + 24 Resources; no Tickets; no committed JSON. `SEED_PROFILE=load` writes through `writeTenantRows` (`projectOnly` for projects 2–5).
- **Fixture-relative seq.** Identity inserts use `OVERRIDING SYSTEM VALUE` at fixtureSeq+offset; multi-baseline `fixtureSeq → allocatedSeq` map; truncate drops `RESTART IDENTITY`.
- **Gates.** `pnpm lint` / `typecheck` / `depcruise` green; unit tests for config refusals, fixture Clock, load determinism, fixture-relative seq map, identity wall time under fixture mode. Postgres seed smoke: both `SEED_PROFILE=demo` and `load` under `CLOCK_MODE=fixture` (local compose) — 5×500 WPs + 24 Resources; reseed keeps Baseline seqs; `demo_anchor` matches the fixture Clock; profile switch demo↔load allowed when only one Tenant is present.
- **Seed guard.** `assertSingleTenantDatabase` refuses when **more than one** Tenant exists (leftover probes); a single Tenant of a different id is replaced on profile switch.

## Spec Change Log

- 2026-09-22: Seed single-Tenant guard allows replacing one Tenant when switching
  `SEED_PROFILE=demo|load` (still refuses when two or more Tenants are present).

## Review Triage Log

| finding | verdict | evidence | route |
|---------|---------|----------|-------|
| BH/EH/VG: web+worker hard-code −2h while seed uses `latestFixtureObservedAt` | medium | For the shipped demo, both yield `now()=anchor` (`max(anchor−2h,anchor)`). Drift if fixture offsets change without updating the constant. Composition intentionally avoids importing `fixtures.ts` into Next. | patch |
| VG: AD-17 refusals only tested on `parseConfig`, not `parseConfigKey` | medium | Getters call `parseConfigKey`; deleting its LOCAL_ONLY block leaves `parseConfig` tests green. | patch |
| VG: `seed({ profile: 'load' })` orchestration untested | medium | Smoke was manual; suite never calls `seed` with load — generator unit tests alone do not cover `seedLoadInTenant`. | patch |
| VG: `assertSingleTenantDatabase` profile-switch / multi-Tenant branches untested | medium | New allow-one / refuse-two behaviour has no automated pin. | patch |
| BH/VG: worker Clock selected but never asserted in round-trip | medium | Started log already emits `clockMode`/`clockNow`; round-trip only waits for the message string. | patch |
| BH/EH: load `projectDefaultSeq` via `hashString` can collide | medium | Five projects in a 100k band is unlikely but unasserted; index-based seq is the trivial fix. | patch |
| BH: dual `resolved:` on deferred `demo_anchor` entry | low | Docs hygiene; merge into one `resolved` line. | patch |
| BH: `clock.ts` missing final newline | low | Trivial EOF fix. | patch |
| EH: `fixtureClockOn` / `asMs` NaN → Invalid Date | low | Config refines `FIXTURE_TIME_ANCHOR`; composition passes numbers. Everyday path never feeds garbage. Rejected (fix > direct guard complexity relative to reachability). | — |
| EH: `latestFixtureObservedAt` → `Date(0)` if all parses fail | low | Valid fixture files always parse; empty snapshots already return anchor. Rejected. | — |
| EH: `snapshotOfEntry` null + `!` when ledger nonempty / snapshots empty | false | Load path has empty ledger (guard skips insert); demo always has snapshots with ledger. | — |
| BH/EH claim: "calendar" not stamped via Clock | false | Spine/AR-27 "calendar" means period/`demo_anchor` coherence, not rewriting holiday `calendarJp`/`calendarVn` JSON. Those are fixture data. | — |
| BH: fold gen-fixtures incomplete / parallel `load-generator.ts` | low | Still one write path (`writeTenantRows`); PRNG folded. Rejected as everyday harm. | — |
| BH: matrix says refuse names `DEPLOYMENT` | false | Code/tests name the forbidden key (+ deployment suffix); matches AD-17. | — |
| BH: multi-baseline all get same `recordedAt` under Clock | false | Load projects each carry one Baseline version; shared stamp is the fixture Clock coherence. | — |
| BH: in-memory domain `rates.effectiveFrom` stays `2026-01-01` while DB uses Clock | medium (unverified everyday) | Pre-existing shape when Clock injects; domain rates not the seed DB path for money. | defer |
| BH: stale `evidence:` under resolved Clock deferred entry | low | Docs only; not caused as a runtime defect. | defer |
| BH: `pnpm seed` always loads `.env.development` | false | Deliberate AD-17 supplier; override via env after file load is operator choice. | — |

## Design Notes

Fold the load generator into the existing fixture pipeline (`gen-fixtures` helpers + `fixtures.ts` +
`writeTenantRows`) rather than a parallel Tenant writer. Prefer a shallow wide WBS over a deep
chain so leaf count hits 500 without pathological depth. Identity and OAuth stay on wall time
under fixture mode.

## Verification

**Commands:**
- `pnpm lint` / `pnpm typecheck` / `pnpm depcruise` — exit 0
- Unit: fixture Clock formula; config refuse cases; generator determinism (hash or structural
  equality of two in-memory builds); fixture-relative seq map
- Seed / Postgres: under `CLOCK_MODE=fixture` + both profiles, seeded Baseline/`demo_anchor`
  align with Clock; identity_event still wall; reseed seq stable
- Worker starts with fixture Clock selected (smoke / existing round-trip still green)
