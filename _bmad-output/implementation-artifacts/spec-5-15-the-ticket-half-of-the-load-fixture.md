---
title: 'Story 5.15 — The Ticket half of the load fixture'
type: 'feature'
created: '2026-10-10'
status: 'done'
route: 'dispatch'
baseline_commit: '0958468ea33200b47df15e67f4f5c4d7923e6167'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-8-a-load-fixture-worth-measuring-against.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** NFR-P1 names its budgets at 5 Projects × 500 WPs × 2,000 Tickets, but Story 1.8's
load fixture stops at WPs: `loadProjectAsDemoState` returns empty snapshots, ledger and
Mappings. The only 2,000-Ticket timing (`ingest-nfr.test.ts`) writes into an empty Project, and
nothing times the Review at load shape.

**Approach:** Extend `generateLoadFixture` with synthetic Tickets over a 4-week snapshot history,
replayed through the demo's domain path (`ingestSnapshot` + `applyRules`) so observations,
Mappings and ledger come out deterministically from `LOAD_FIXTURE_SEED`; seed writes them via
`writeTenantRows`. Gate both budgets in `pnpm test:nfr` against a load-shaped probe Tenant, and
run the generated Tickets through the AR-41 whitelist gate.

**Decisions (founder, 2026-10-10).** Context: `main` has branch protection; the required `verify`
job runs `pnpm test:nfr` (`ci.yml:450`), so a red NFR gate — flaky or not — blocks every PR.
- **1A — gate both budgets in CI.** One `beforeAll` writes a probe Tenant with the full shape
  (5 × 500 WPs × 2,000 Tickets), shared by the snapshot and Review tests, removed with
  `removeTenant` (no TRUNCATE). Seed duration is logged; if it exceeds 2 min locally, stop and
  report before continuing. Review: warmup + 20 samples (`fence-nfr-p1` pattern), assert
  p75 < 2000 ms and p95 < 4000 ms.
- **2A — Review = server-side `getProjectReview`** (DB load + compute) for one load Project.
  NFR-P1 says "the Reconciliation Review" (PRD:992), an Epic 6 view: this number is the current
  Review, server side, excluding RSC render and network. It must not be reported as NFR-P1 met
  for page load. One deferred-work entry gathers the real page-load harness (Plan grid —
  already deferred at :1132 —, Reconciliation Review, Client View), tied to Epic 6's first story.
- **3A, bounded.** If the snapshot budget fails, the one permitted change is batching the
  ticket / tracker_account upserts in `writeIngestSnapshot` (deferred-work :1340) — a
  performance change, no semantic change; existing writer tests stay green untouched. Any other
  overrun, or a Review overrun: STOP and report. Never loosen a budget, never `skip`/`todo` a gate.
- **4 — fix the Review's snapshot pin in this story (founder, 2026-10-10, after review).** The
  load fixture exposed a pre-existing bug: `loadBundleInTenant` (`packages/db/src/repo.ts`) pins
  the Tenant-wide latest `tracker_snapshot`, so in a multi-Project Tenant one Project's Review
  reads another Project's Tickets. The pin is restricted to the Project's own Connectors, latest
  by `observedAt` with `seq` as tiebreak. This is a correctness fix, not a budget change: it moves
  Review figures only for multi-Project Tenants; the single-Project demo golden figures stay
  untouched. A two-Project regression test pins it, and the Review is re-measured after it.

## Boundaries & Constraints

**Always:**
- Same seed → identical Tickets, observations, Mappings, ledger (fingerprint extended).
- History per Project: 4 weekly snapshots of 1,700 / 1,800 / 1,900 / 2,000 Tickets (+100 new per
  week, none leave scope); latest is exactly 2,000; generator throws on drift.
- Fields inside the FR-19 whitelist; synthetic keys/titles/accounts (`LOAD-<p>-<n>`,
  `Load ticket n`, `bk-load-*`); no descriptions/comments.
- Mix: ~70% manual Mappings, 2 rules (~15%), ~5% to the Catch-all, rest Unmapped; Opening
  Balances on week 1, deltas after; hours basis; Connector `adapter: 'fixture'`.
- Every `bk-load-*` account is linked to its `res-load-*` Resource, so the Review values hours at
  real Rates.
- `SEED_PROFILE=demo` output unchanged; no committed load JSON.
- Measured numbers go in Implementation Notes and `HANDOFF.md`, never in this block.

**Never:**
- No change to ingest writer semantics, ledger rules or Review figures (exceptions: 3A, and decision 4's snapshot pin).
- No new UI, no Epic 6 work; never seed the load profile into the shared `pnpm test` database.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Generate twice | `LOAD_FIXTURE_SEED` | Identical fingerprint incl. Tickets/ledger/Mappings | — |
| History counts | any load Project | 1,700 → 1,800 → 1,900 → 2,000 Tickets, all `complete` | throws on drift |
| Week 1 / later weeks | per Project | `opening_balance` only / `delta`; Σ per Ticket = last actual hours | — |
| Account links | load Tenant | every `bk-load-*` linked to its `res-load-*` | — |
| Timed full snapshot | probe Tenant at load shape | week-5 read: same 2,000 Tickets, hours advanced, deltas vs week 4, written by `writeIngestSnapshot` onto a load-shaped Project (not an empty one) ≤ 5 min | 3A |
| Timed Review | same probe Tenant | `getProjectReview` over the Project's own snapshot (Unmapped = fixture count, yen > 0): p75 < 2 s, p95 < 4 s | stop and report |
| Multi-Project pin | two Projects, other Project's snapshot newer | each Review pins its own Project's latest snapshot | — |
| Whitelist gate | generated Tickets | `pnpm fixtures:check-whitelist` passes and covers them | names offending field |

</frozen-after-approval>

## Code Map

- `packages/db/src/load-generator.ts` -- `generateLoadFixture`, `loadFixtureFingerprint`,
  `loadProjectAsDemoState` (empty arrays ~:279–298). Add Tickets, snapshots, seed Mappings,
  rules, a week-5 `ScopeRead` builder for the timed snapshot.
- `packages/db/src/fixtures.ts:198` `buildDemoState` -- extract the replay loop
  (`ingestSnapshot`, `mappingHead`, `applyRules`) into a shared `replayConnector`; demo output
  must not change (`demo-golden.test.ts`); keep the "no `connectorId` on ledger" rule.
- `packages/db/src/seed.ts:210` `writeTenantRows` -- writes connector → mapping_head in
  `chunked(…, 500)`. Account links (:587) are gated to the demo Tenant — open the gate for load.
  `TenantRowWriteOptions` (`idPrefix`, `seqOffset`, `projectOnly`, `projectIndex`) is how a
  probe Tenant is written; `seedLoadInTenant` (:894) shows the 5-project loop.
- `packages/db/src/probe-tenants.ts` -- `removeTenant`; probe seq bases ≥ 870_000_000 (1.8).
- `packages/db/src/repositories/ingest/index.ts:418` `writeIngestSnapshot` -- the single writer;
  `ingest-nfr.test.ts` is the REQUIRE_DB / `acquireSeedSuiteLock('shared')` / timeout pattern.
- `packages/app/src/use-cases/get-project-review.ts` → `projectRead.loadReview` -- Review read.
- `tests/schedule/fence-nfr-p1.test.ts` -- warmup + 20 samples + `percentile95` pattern.
- `scripts/check-fixture-whitelist.ts` -- key sets; walks only `fixtures/backlog/*.json`.
- `vitest.nfr.config.ts` (`*-nfr*`, serial) -- where the new test lives.

## Tasks & Acceptance

**Execution:**
- [x] `packages/db/src/fixtures.ts` -- extract `replayConnector`; demo unchanged
- [x] `packages/db/src/load-generator.ts` (+ test) -- Tickets/history/Mappings/rules per Boundaries; replay; fingerprint; week-5 read; tests for every matrix row up to whitelist keys
- [x] `packages/db/src/seed.ts` -- account links for load; Ticket counts logged; a load-probe writer (idPrefix/seqOffset) reusable by the NFR test
- [x] `scripts/check-fixture-whitelist.ts` (+ test) -- exported pure page check; also checks generated load pages in-process
- [x] `packages/db/src/load-fixture-nfr.test.ts` -- probe Tenant `beforeAll` (seed time logged), timed week-5 snapshot, Review p75/p95
- [x] `HANDOFF.md`, `deferred-work.md` -- measured numbers; the single page-load harness entry (Epic 6 first story)

**Acceptance Criteria:**
- Given Story 1.8's generator, when extended, then 2,000 Tickets per Project × 5 Projects with observations, Mappings and ledger entries come out deterministically from `LOAD_FIXTURE_SEED`.
- Given the load-shaped probe Tenant, when `pnpm test:nfr` runs, then the timed full snapshot (matrix row) is ≤ 5 min and server-side Review is < 2 s p75 / < 4 s p95.
- Given the fixture, when committed, then `pnpm fixtures:check-whitelist` passes and covers the generated Tickets.

## Implementation Notes

- **Replay.** `replayConnector` (`fixtures.ts`) is the demo's old loop, unchanged: `ingestSnapshot`
  with the fixed approval instant, then `applyRules` against `mappingHead`. `buildDemoState` and
  `loadProjectAsDemoState` both call it. The demo golden figures are unchanged, and the ledger
  still carries no `connectorId`.
- **Generator.** Tickets get their own PRNG per Project, so the WP half's numbers did not move.
  Issue ids are `load-issue-<p>-<n>`. Keys, titles and accounts follow the Boundaries. The
  Mapping mix is fixed by `n mod 20`: 70% manual, 15% by two rules (category 10%, milestone 5%),
  5% manual to the Catch-all, 10% Unmapped. Every snapshot is complete and carries all 24
  `bk-load-*` accounts. `assertLoadHistory` throws on any count drift. `loadWeek5Read` builds the
  timed read. An optional `namespace` (default `load`) renames every global id, so a probe Tenant
  can carry the full shape. The numbers are identical in every namespace.
- **Seq bands.** `seq` is a global key, and five Projects replayed from 1 would collide. Ledger and
  Mapping seqs therefore come from `projectIndex × 100,000 + 1`, and load snapshots from
  `10,000 + 100 × projectIndex`. The demo still writes 1..n.
- **Identity site.** New `TenantRowWriteOptions.identityOnConnectorSite`. The load profile writes
  Ticket and Tracker Account identity under the Connector `site`, which is what
  `writeIngestSnapshot` keys on. Without it, the timed week-5 snapshot fails on
  `ticket_project_tracker_issue_key`. The demo and its probes leave the option unset, so their rows
  are unchanged. Account links were already written with the Tenant shell (the first Project, not
  `projectOnly`). With accounts now in the load snapshots, all 24 are linked.
- **Writer.** `writeLoadTenantRows` (`seed.ts`) is shared by `SEED_PROFILE=load` and the NFR
  probe. It logs Ticket, snapshot, ledger and Mapping counts.
- **Whitelist.** `checkFixturePage` is now pure and exported. `runWhitelistGate` checks the
  committed files plus all 20 generated load pages (37,000 Ticket observations) in-process.
- **Test location (deviation).** The NFR test is `tests/load-fixture-nfr.test.ts`, not
  `packages/db/src/…`. It calls the `packages/app` use case `getProjectReview` (decision 2A), and
  `packages/db` may not import `@momo/app` (AD-1). `tests/` already holds `fence-nfr-p1.test.ts`
  for the same reason. It still matches `*-nfr*` and runs under `pnpm test:nfr`.
- **Snapshot pin (decision 4).** `loadBundleInTenant` now pins the latest snapshot of the
  Project's own Connectors (`observedAt` desc, `seq` desc). Before, it took the Tenant-wide
  latest. Nothing else in the Review changed. `packages/db/src/review-snapshot-pin.test.ts` is the
  regression test: a probe Tenant whose second Project has a newer snapshot, where each Review
  must pin its own. It fails against the old query. The NFR warmup now asserts the fixture's exact
  Unmapped count and AC in yen > 0.
- **Measured (local compose, macOS + Docker Postgres, two runs after the pin fix).** Probe seed of
  the full shape: 3.2–3.3 s. `SEED_PROFILE=load pnpm seed`: 3.8 s. Week-5 snapshot (2,000
  Tickets, 1,386 deltas): 0.70–0.71 s against a 5-minute budget. Server-side Review: p75
  140–141 ms and p95 146–149 ms, against 2 s and 4 s. 3A was not triggered. The Review figure is
  server-side only, not NFR-P1 page load. **The earlier p75 136–138 ms / p95 145 ms is invalid**:
  it was measured over another Project's snapshot.

## Spec Change Log

- 2026-10-10 (review loop 1): Triggering finding — tightened Review assertions showed the Review
  of load Project 2 pinning Project 1's week-5 snapshot (`repo.ts:288`, Tenant-wide latest
  snapshot). Founder chose to fix it here: frozen block gains decision 4, the Never rule names it
  as an exception, and the matrix gains the "Multi-Project pin" row. Known-bad state avoided: an
  NFR Review timing measured over another Project's snapshot (the earlier p75 ≈ 137 ms is
  invalid). KEEP: all existing code (generator, replay, seed writer, whitelist gate, NFR test and
  the three review patches) — the code is kept, not reverted, by founder decision.

## Review Triage Log

| finding | verdict | evidence | route |
|---------|---------|----------|-------|
| BH: sprint-status `in-progress` vs spec `in-review` | false | Workflow-owned states: spec status moves per step; sprint-status is synced to `review`/`done` at present/merge. Not a defect in the change. | — |
| BH: Tasks line names `packages/db/src/load-fixture-nfr.test.ts` | false | Fix would edit this build's spec; the deviation is recorded in Implementation Notes. | — |
| BH/EH: 2-min seed line only warns | false | Decision 1A's "stop and report" governs the implementation run (seed measured 3.9 s), not a CI assertion; the warn keeps the line visible in logs. | — |
| BH/EH: `invokedDirectly` path compare can silently skip the gate | low | Works today (local macOS worktree + CI print the summary), but a symlinked checkout would make the CI step exit 0 having checked nothing; `realpathSync` on both sides is a direct correction. | patch |
| VG: no test proves `runWhitelistGate` walks generated pages | medium | Dropping `...generated` from the loop leaves every test green; asserting `gate.summary` counts pins it. | patch |
| VG + BH: Review gate never checks the persisted Mappings / valued hours it claims to time | medium | Warmup asserts only `unmappedTickets > 0` and `totalMh > 0`; a Project with no Mappings or no Rate links would pass and be timed as the full shape. | patch |
| BH: generated page metadata keys not the generator's own | low | Page metadata (`snapshotId`, `rateLimit`, `adapterKind`) is not persisted Ticket data; FR-19 covers Ticket/account fields, which are passed through as generated. Unlikely to matter; fix adds surface. | — |
| BH: link test keyed by `accountId` string | false | All load Projects share Connector site `ec-phase2` (`seed.ts:422`), so `tracker_account` has one row per `accountId` (upsert on tenant/kind/site/account); keying by string is exact. | — |
| BH: orchestration test hardcodes `24` | low | Cosmetic; matches the fixed 24 Resources. | — |
| BH: duplicated percentile helper | low | Two local helpers; sharing needs a new module. Unlikely everyday harm. | — |
| BH: no runtime guard on seq band overflow | low | Bands sized 100,000 vs ~14k seqs per Project; unit test pins bands. Guard adds complexity. | — |
| BH: fixture regenerated many times in tests | false | The three affected unit files run in ~1.1 s total. | — |
| BH: demo identity / snapshot seq not DB-tested as unchanged | false | `snapshotSeqBase` and `identityOnConnectorSite` only apply when `projectIndex` / the flag are set; demo and probe writers pass neither (`DEMO_ROW_WRITE_OPTIONS`, `probe-tenants.ts`). | — |
| BH: `LOAD_TICKETS_PER_PROJECT` duplicates history tail | low | `assertLoadHistory` already checks both agree. | — |
| BH: weeks 2–4 delta counts asserted loosely | low | Fingerprint determinism and `checkLedgerInvariant` already pin the ledger. | — |
| EH: `leaves[LEAVES_PER_PHASE]` undefined when 2 ≤ leaves < 50 | false | Leaves are a fixed 489 per Project by construction; unreachable. | — |
| EH: `replayConnector` with empty baselines → `-Infinity` | low | Both callers always pass one Baseline. | — |
| EH: namespace not validated | low | Only callers pass `load` / `xtload`. | — |
| R2 BH: Tasks line path / seed-line warn / triage "3.9 s" | false | carried — same claims as round-1 rows (spec edit; 1A governs the run; 3.9 s was the round-1 measured seed). | — |
| R2 BH/EH: deferred-work quotes 0.72–0.74 s vs 0.70–0.71 s elsewhere | low | Both are real runs (pre/post pin fix); records disagree. Direct correction. | patch |
| R2 BH: Verification section lacks `REQUIRE_DB=1` for `pnpm test` | false | Fix edits this build's spec; CI sets REQUIRE_DB=1. | — |
| R2 VG/BH: no-Connector branch of the pin untested | medium | Reverting that branch to a Tenant-wide query passes every test; a new Project would show another Project's Tickets. | patch |
| R2 VG/BH: `seq` tiebreak untested | maybe-false | Needs two Connectors on one Project at the same `observedAt` to the ms; ingest dedupes within one Connector. Would settle with a two-Connector tie test. | defer |
| R2 EH: multi-Connector / mixed-basis Project pins one Connector's snapshot only | medium | Pre-existing: the old query also pinned a single snapshot; per-Connector pinning is Epic 6's (epic-5-context Downstream). Not caused by this change. | defer |
| R2 BH: NFR warmup never asserts the pinned snapshot id | low | Direct assertion addition; today relies on the Unmapped count differing. | patch |
| R2 EH: removed assertion on per-Project Baseline seq (1 / 5) | medium | Deleted test line; a regression in Baseline seq banding would now pass. Restore the assertion. | patch |
| R2 BH: pin test lacks pre-clean / swallows teardown error | low | Follows `baseline-read.test.ts` probe pattern; only matters after a crashed run. | — |
| R2 BH: probe seq bands not checked disjoint across suites | low | Bands 975M/985M are unique today; enforcing needs a registry. | — |
| R2 BH: whitelist gate skips week-5 Tickets | low | Week 5 spreads week-4 objects (same keys, checked); only `statusId`/`actualMh` change. | — |
| R2 BH: manual Mappings dated before their Tickets exist | low | Same convention as the demo (`at: baseline.recordedAt`, `fixtures.ts`); no current read orders Mappings against Ticket creation. | — |
| R2 BH: orchestration test checks only Tickets/links | low | Counts are pinned by unit tests and the NFR `beforeAll`. | — |
| R2 BH: fingerprint omits accounts/complete/hoursFieldPresent | low | Accounts and completeness asserted directly in load-generator tests. | — |
| R2 EH: seq-band overflow, namespace, empty baselines | low | carried — same claims as round-1 rows. | — |
| R2 EH: null `estimateMh` → `Closed` in week 5 | false | Generator always sets `estimateMh` (`planTickets`). | — |

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm depcruise` -- exit 0
- `pnpm test` -- green incl. demo golden and load-generator tests
- `pnpm fixtures:check-whitelist` -- exit 0
- `REQUIRE_DB=1 pnpm test:nfr` (local compose) -- budgets pass; seed time logged
- `SEED_PROFILE=load pnpm seed` -- logs 5 × 500 WPs, 5 × 2,000 Tickets
