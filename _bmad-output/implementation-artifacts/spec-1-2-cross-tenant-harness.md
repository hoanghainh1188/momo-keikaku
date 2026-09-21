---
title: 'Story 1.2 slice 2 — the cross-tenant harness that enumerates every read use case'
type: 'feature'
created: '2026-09-21'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '42b071eb211361c828e6a740a93c9741d8a06f6a'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-2-rls-and-withtenant.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** NFR-S1 asks that tenant isolation be *tested automatically*. Slice 1 shipped a
targeted sabotage set instead: table-level probes, hand-written, against three of sixteen tables.
Nothing tests what a user actually invokes — a read use case — and nothing fails when a new read
is added without isolation cover. AC-5 says this harness *is* the automated test, so NFR-S1 is
undischarged until it lands.

**Approach:** Seed two probe Tenants, each a complete relabelled copy of the demo dataset, and
drive **every** read use case against both as the restricted role. The covered set is read from
the read surface's module exports, not a hand-written list, so an unregistered read fails CI
naming it. Isolation is asserted by a generic token scan over the whole result graph, so a new use
case's new fields are covered the day they are written.

## Boundaries & Constraints

**Always:**
- **The enumeration is mechanical** — derived from the read surface module's exported functions. A
  new export with no registry entry fails CI **naming it**, with no database required.
- **Every registry entry is executed**, against both probe Tenants, as the **restricted** role. An
  entry that is never invoked is a list, not a harness.
- **Isolation is asserted generically**: walk the whole result graph — including `Map` keys and
  values, which `JSON.stringify` cannot see and which is exactly where `attribution` keeps row ids
  — and assert no string carries the other Tenant's token or the demo Tenant's markers. No
  per-field allow-lists.
- **Non-vacuous**: each own-Tenant result is asserted *complete*, not merely non-empty. The probe
  Tenants come from one builder, so their results must be identical after token substitution —
  compared as **multisets**, because four of the reads carry no `ORDER BY`.
- **The relabelling is proved faithful** by reproducing the pinned golden figures (2936.0 /
  1661.5 / 0.91) from a probe Tenant. Otherwise every isolation assertion could agree about the
  wrong data.
- **Say what the harness does not reach.** Tenant-owned tables no read use case touches are named
  with a reason, measured rather than claimed, and the set is asserted so a change is a decision.
- **Prove it by sabotage** — every new assertion watched to fail, then restored.
- Probe Tenants are created and removed inside the run; cleanup is scoped to their own ids.
  `pnpm seed` refuses to run beside a second Tenant, so a leaked probe Tenant is a broken
  workspace.

**Never:**
- **No rewiring of the eight `apps/web` files, no `dependency-cruiser`** — still the next slice.
  Write the harness so moving the read surface to `packages/app` is a change of one pointer.
- **No arithmetic or codec rewrite**, **no watermark advisory locks** — their own slices.
- No change to `schema.ts`, `table-classes.ts` or the generated SQL, and no change to a shipped
  signature for the harness's benefit. A schema change the harness wants is a finding, not a patch.
- No new production dependency. No Playwright, no browser: `apps/web` gains no test here.

## Decisions taken at approval, 2026-09-21

- **Sequencing: the harness lands before the `apps/web` rewiring**, against `repo.ts` as the read
  surface. `deferred-work.md` argued the reverse — that AC-4's "enumerate mechanically" wants use
  cases to exist in `packages/app` first. Measured against that: today all eight `apps/web` files
  and `scripts/peek-db.ts` reach data through exactly two functions in `repo.ts`, so the read
  surface is already enumerable, and the enumeration is written as one pointer to move. The
  deciding argument is the other direction: a harness that exists *before* the rewiring is what
  guards the rewiring, so a move that breaks isolation turns CI red while it is being made.
- **The `tenant` global table keeps its structure until story 1.4.** The application role may
  still `SELECT` every Tenant's name — that is the `global` class working as the epic intends,
  and the fix is the membership join in `resolveRequestContext`, not a policy on the table
  `tenant_id` points at. What lands here is the use-case-level half the deferred entry asked for:
  the harness asserts that **no read use case returns a foreign Tenant's name**, so the day a read
  drops its `WHERE` the build goes red. The entry stays open, re-pointed at story 1.4.
- **The table-reach measurement stays in this slice** rather than being split out, and the spec is
  kept at roughly 3,600 tokens against a 1,600 guideline. Nothing else here is independently
  shippable, and the measurement is the part that turns "the harness covers every read use case"
  from a claim into a number — which is the distinction that caught all three false-green gates of
  the previous session.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | On failure |
|---|---|---|---|
| Own-Tenant read | `invoke(appDb, {tenant A, project A})` | A's complete data, carrying A's token | — |
| Symmetry | the same use case under A and under B | token-bearing strings identical after substitution | name the use case and the differing strings |
| Leak via an unfiltered read | `baseline_wp`, `rate_entry`, `tracker_snapshot`, `ticket_observation`, `actuals_ledger_entry` are read with **no `WHERE`** — RLS is the only filter | A's result holds no B token and no demo marker | name the use case and the foreign strings |
| Leak via an id from a URL | `invoke(appDb, {tenant B, project A's id})` | nothing of A — throws or empty | fail if any A token appears |
| A new read use case | an exported function with no registry entry | the pure coverage gate fails naming it | runs with no database |
| Reach changes | the measured table set ≠ the declared one | fail naming the table and the direction | — |

</frozen-after-approval>

## Code Map

- `packages/db/src/repo.ts` — **the read surface**: exactly two exported functions,
  `loadProjectBundle(db, tenantId, projectId)` and `loadReview(...)`, both opening `withTenant`
  internally. Five reads carry **no `WHERE`** (`baseline_wp`, `rate_entry`, `tracker_snapshot`
  — `ORDER BY observed_at DESC LIMIT 1` —, `ticket_observation`, `actuals_ledger_entry`), so a
  policy leak surfaces in the bundle directly, and each probe Tenant must hold exactly one Project.
  Four reads carry no `ORDER BY`. It touches 15 of the 17 tables; never `app_user` or `audit_log`.
  `projectId` still defaults to `prj-ec2` — note it, do not change it here.
- `packages/db/src/fixtures.ts` — `buildDemoState()`, deterministic: 48 WPs, 41 baseline WPs,
  6 snapshots (218 observations written), 144 ledger entries, 184 mapping events, 6 resources,
  2 rules, 0 dispositions. Reuse; do not change.
- `packages/db/src/seed.ts` — `seedInTenant` writes the 16 inserts, and also TRUNCATEs, refuses a
  second Tenant and keeps the owning role. **Extract the row-writing half** so the probe fixture
  and the seed share one definition; leave the TRUNCATE, the guard and the hatch in the seed.
  **Two traps it hides:** `baseline_version.seq` is `generatedAlwaysAsIdentity`, so a second
  Tenant's baseline is `seq = 2` while its ledger rows carry the fixture's literal `1` — which
  silently reclassifies every mapped hour as Unplanned and moves the figures; and `blwp-${i}`,
  `led-${seq}`, `map-${seq}` are generated **inside** the writer from values the relabelling never
  sees, so they collide across Tenants on global primary keys.
- `packages/db/src/rls.test.ts` — the table-level gates, and the probe-Tenant lifecycle to copy
  (maintenance hatch for deletes from append-only tables). Use different Tenant ids and a
  different `seq` band: `9_000_001` is taken, and vitest runs files in parallel.
- `packages/db/src/client.ts` — `getPool(connectionString)` is exported, so the harness builds its
  own Drizzle handle **with a logger** over the same pool without touching `getDb`. That logger is
  how the reached-table set is measured rather than asserted.
- `packages/domain` — **no hardcoded id literals**: catch-all, milestones and baselines are keyed
  by flags and numeric `seq`. So a *consistent bijective* string rewrite is computation-preserving,
  provided value-coupled pairs move together (`resource.trackerAccountIds` ↔
  `ledger.assignee_account_id`; `mapping_event.wp_id`/`baseline_wp.wp_id` ↔ `work_package.id`) and
  dates, ISO timestamps and the enum vocabulary are left alone.
- `packages/db/src/db-round-trip.test.ts` — the pinned figures, and the `REQUIRE_DB=1`
  non-skippable pattern.
- `eslint.config.js` + `packages/db/src/source-discipline.test.ts` — fences the new files must
  satisfy: no variable named `db` may call `select/insert/update/delete/execute/query` (an AST rule
  **and** a text scan over every tracked file, comments included); the banned `SET` form must not
  appear even in prose; `Date.now()`, bare `new Date()` and `Date()` are errors in source *and*
  test files (`new Date(iso)` is fine); `process.env` is allowed in `*.test.ts` only.
- `packages/db/src/index.ts` — the barrel excludes `fixtures.ts` and `seed.ts` because nothing in
  an application should write the database by importing it. The probe fixture is that category.
- `.github/workflows/ci.yml` — its header lists this harness as *absent* and NFR-S1 as
  undischarged. Both statements change here.

## Tasks & Acceptance

**Execution:**
- [x] `packages/db/src/seed.ts` — extract the per-Tenant row writer from `seedInTenant`, taking an
      id-prefixer and an explicit active-baseline `seq`, so the two traps above are the writer's
      responsibility rather than the caller's.
- [x] `packages/db/src/probe-tenants.ts` — build and remove a probe Tenant: relabel a
      `buildDemoState()` by a consistent bijective rewrite (every string gains the Tenant's token
      except a named vocabulary of enum values, dates and ISO timestamps), write it through the
      extracted writer, and delete it again through the maintenance hatch scoped to its own id.
      Keep it out of the barrel, in the style of `seed.ts`'s note.
- [x] `packages/db/src/read-use-cases.ts` — the registry: one entry per exported function of the
      read surface, each with a kind (`read`, or a non-read with a stated reason), a `why`, and an
      `invoke(db, target)`. Export the surface's exported-function names discovered from the module
      namespace, and the declared set of tenant-owned tables no read use case reaches.
- [x] `packages/db/src/cross-tenant.test.ts` — the harness: the pure coverage gate, the
      faithfulness check against the golden figures, and the probe matrix per use case, with a
      Drizzle logger measuring which tables each use case actually read.
- [x] `.github/workflows/ci.yml` — move the harness from "absent" into the gate list, record NFR-S1
      as discharged, and add this slice's sabotage table to the watched-to-fail list.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` — close the harness entry; record
      what the harness does not reach, and anything found and not fixed.

**Acceptance Criteria:**
- Given a function added to the read surface with no registry entry, when the suite runs **without
  a database**, then it fails naming that export.
- Given a registry entry, when the harness runs, then it is invoked against both probe Tenants as
  the restricted role, and a use case that silently returned nothing fails the *completeness*
  assertion rather than merely an emptiness one.
- Given any tenant-owned table with an over-permissive policy, when the harness runs, then at least
  one use case's result carries a foreign token and the failure names the use case and the strings.
- Given a probe Tenant, when a read use case computes a Review over its relabelled copy, then the
  figures equal the pinned golden values.
- Given tenant B asking for tenant A's `projectId`, when the use case runs, then nothing of A comes
  back.
- Given the whole suite, when lint, the three typechecks and the tests run, then all pass, and the
  probe Tenants are gone afterwards — proved by `pnpm seed` still succeeding.

## Implementation Notes

**Four files, and the read surface is one import.** `packages/db/src/read-use-cases.ts` holds
the registry; its only tie to the read surface is `import * as readSurface from './repo'` plus
the `READ_SURFACE_MODULE` string used in failure messages. When the next slice moves the use
cases into `packages/app`, those two lines are the change and the whole probe matrix follows.
The registry is deliberately kept out of `packages/db/src/index.ts`, alongside `seed.ts` and
`probe-tenants.ts`: nothing an application does involves enumerating its own read surface, and
nothing an application does involves writing whole Tenants.

**The enumeration reads functions off the module namespace.** `readSurfaceFunctionNames()`
filters `Object.entries(readSurface)` by `typeof value === 'function'`, which today yields
`loadProjectBundle` and `loadReview`; the two exported constants and every type are correctly
not in it. Sabotage 1 is the proof that this is a gate rather than a description: an exported
`loadSabotageProbe` with no entry failed *with no database at all*, naming it.

**The relabelling is opaque, not a prefix, and that was a correction.** The first design
mapped each string to `token + original`, which preserves ordering and reads well in a failure
message. It also makes the demo-marker scan useless: `xtprobe-a-ten-momo` contains `ten-momo`,
so every probe string would report itself as a demo leak. The shipped scheme maps each distinct
relabellable string to `${token}-${n}`, where `n` is its index in the sorted list of those
strings — bijective by construction, opaque (no part of the original survives), and
order-preserving with respect to the sorted originals, which matters for the one text ordering
in the read surface (`ORDER BY wbs_code`). Bijectivity is asserted rather than argued, and the
token is asserted absent from the fixture, because a token the demo data already carried would
make the central assertion report leaks that are not leaks.

**23 vocabulary entries, and only three of them are load-bearing today.** `PRESERVED_VOCABULARY`
names every string the domain or an adapter interprets — contract types, ledger kinds, mapping
sources, rule match fields, disposition kinds, the measurement basis, adapter names, holiday
kinds — and dates and ISO instants are preserved by shape rather than by membership. Measured by
removing entries one at a time: `'opening_balance'` and `'rule'` move numbers the harness
compares, `'hours'` fails the label census, and `'delta'`, `'category'` and `'manual'` fail
nothing, because the current read surface never re-derives a Ledger entry or re-evaluates a
Mapping Rule — `buildDemoState()` does that before the relabelling, so the stored events already
carry their outcome. Recorded in deferred-work rather than patched: the entries are correct and
will become load-bearing the day a write use case is enumerated.

**Three completeness assertions, because two of them are relative.** The spec asked that each
own-Tenant result be asserted *complete*. Comparing the two probes to each other catches an
asymmetry, and comparing a probe to the demo Tenant's label census catches a read that lost data
for one Tenant — but a read that lost the same field for *every* Tenant is symmetric and passes
both. Sabotage 4 proved it: a `select` issued on the bare handle outside the tenant scope, which
returns nothing as the restricted role, left all sixteen assertions green. The fix is the third
one: each registry entry declares `mustSurface(state)`, a function of the fixture rather than a
list of strings, and the harness requires every one of those 630 values to come back. With it,
sabotage 4 fails naming `Delivery`.

**And a fourth assertion, on numbers, which is what makes the vocabulary question loud.** The
relabelling rewrites strings and nothing else, so a probe Tenant's result must be *numerically*
identical to the demo Tenant's — every delta, every rate, every per-Work-Package measure, not
only the three pinned headline figures. That assertion is what caught `openingBalanceMh` going
to zero when `'opening_balance'` was rewritten, and `rules[].currentlyMapped` going to zero when
`'rule'` was: BAC, AC and SPI did not move for either. It is also half of what caught sabotage 7.

**The pinned figures were widened for the same reason.** BAC 2936.0, AC 1661.5 and SPI 0.91 are
order-free sums that survive a surprising amount of damage. A writer that stamped the wrong
active Baseline sequence on a second Tenant's ledger — which reclassifies every mapped hour as
Unplanned Work — left all three unmoved. The Unplanned split (166.0 / 0.0 / 50.8, cumulative
216.8) is what sees it, so the faithfulness check pins that too.

**The two traps the row writer now owns.** `writeTenantRows` takes an `idPrefix` and a
`seqOffset` and returns the `activeBaselineSeq` it actually got. `baseline_version.seq` is
`generatedAlwaysAsIdentity`, so a second Tenant's Baseline is 2 while the fixture's ledger rows
carry the literal 1; the writer reads the allocated value back out of the INSERT and rewrites
every ledger row's `active_baseline_version_seq` to it. Note the deviation from the task list
recorded in the Change Log: the writer cannot be *given* the sequence, because the column
refuses one. The generated ids (`blwp-${i}`, `led-${seq}`, `map-${seq}`, the Connector, the two
seeded users) take the prefix; `actuals_ledger_entry.seq` and `mapping_event.seq` take the
offset. Both traps were watched: sharing an id prefix fails on `app_user_pkey`, sharing a seq
band on `actuals_ledger_entry_pkey`, and in both cases the pure gate still ran.

**The reach measurement is a query logger, not a reading of the code.** The harness builds its
own Drizzle handle over `getPool(APP_DATABASE_URL)` with a `logQuery` that matches each
registered table name *quoted on both sides* — so `"tenant"` does not match inside
`"tenant_id"`. 14 of the 16 tenant-owned tables are reached. `app_user` and `audit_log` are
declared unreached with reasons, and both directions fail: a table that stops being read
without being declared, and a table declared unreached that a use case has started reading.

**The `tenant` table's disclosure, at use-case level.** The deferred entry asked for the
use-case-level half of the `global`-class question, and this is it: the demo Tenant's name is
one of the markers the scan looks for, and every probe's `bundle.meta.tenantName` is
relabelled. So the day a read drops its `WHERE` on `tenant`, the harness reports it — which it
did under sabotage 2, naming the path. The table keeps its structure until story 1.4; the entry
stays open, re-pointed there.

**The pure gate is structurally separated from the database one.** Everything needing a
database lives inside one `describe.skipIf(!reachable)` with its own `beforeAll`/`afterAll`, so
a probe Tenant that cannot be written does not also silence the coverage gate. Measured: with
no `DATABASE_URL` the file runs 4 assertions and skips 19; with a database it runs 23; and with
a `beforeAll` that dies on a primary-key collision the 4 still run and report.

**Cleanup is verified, not assumed, and it is written for the run that already went wrong.**
`afterAll` removes each probe Tenant through the maintenance hatch — scoped to its own id, in
reverse registry order — inside ITS OWN `try`, so a failure removing the first is not the reason
the second is still there, and neither is the reason the verification never ran. It then reads
back both `tenant` (the `global` table) and `actuals_ledger_entry` (a tenant-owned one) and
throws naming every removal error and everything left behind. Checking `tenant` alone would not
do: it carries no policy, so its DELETE succeeds for the owner whatever happens to the
policy-bearing tables, and a cleanup filtered by row-level security would leave every row in
place with `tenant` reading clean. `pnpm seed` refuses to run beside a second Tenant, so a
leaked probe is a broken workspace; across every sabotage run — several of which failed inside
`beforeAll` — nothing was left behind, and `pnpm seed` succeeded afterwards every time.

**Out of scope, as the spec required and confirmed here:** no rewiring of the eight `apps/web`
files, no dependency-cruiser, no arithmetic or codec rewrite, no watermark advisory locks. No
change to `schema.ts`, `table-classes.ts` or the generated SQL, and no shipped signature changed
for the harness's benefit. No new production dependency, no Playwright, no browser. `repo.ts`'s
`projectId` still defaults to `prj-ec2`, noted and not changed.

## Spec Change Log

- 2026-09-21 — the row writer takes an id-prefixer and a `seqOffset`, and *returns* the active
  Baseline sequence rather than being given one. The Tasks list said "taking an id-prefixer and
  an explicit active-baseline `seq`"; `baseline_version.seq` is `generatedAlwaysAsIdentity`, so
  no caller can choose it. The requirement behind the wording — that the trap is the writer's
  responsibility rather than the caller's — is met more strongly: the writer reads the allocated
  value back and rewrites every ledger row's `active_baseline_version_seq` to it, so a caller
  cannot get it wrong at all.
- 2026-09-21 — the relabelling is an OPAQUE bijection (`${token}-${n}`) rather than a
  token-prefixed rewrite. A prefix leaves the original inside the new string, which would make
  the demo-marker scan report every probe string as a leak. Both schemes are consistent and
  bijective, which is the property the Design Notes argue for; only the opaque one lets the two
  scans coexist.
- 2026-09-21 — the registry gained a fourth field, `mustSurface(state)`. The spec's Tasks list
  named a kind, a `why` and an `invoke`. The two completeness assertions the spec describes are
  both relative, and sabotage 4 (a use case reading on the bare handle outside the tenant scope)
  passed all sixteen assertions because it lost the same field symmetrically for every Tenant.
  `mustSurface` is the absolute floor, and it is a function of the fixture rather than a list, so
  it grows with the fixture instead of going stale beside it.
- 2026-09-21 — the harness compares the full NUMERIC census of each probe's result against the
  demo Tenant's, in addition to the pinned golden figures the spec names. The three pinned
  figures did not move under two of the vocabulary sabotages or under the wrong-Baseline-sequence
  one, so "reproduce the golden figures" as written was not sufficient to prove the relabelling
  faithful. The pinned set was also widened to the Unplanned split.
- 2026-09-21 (Tasks & Acceptance check) — a **fifth** gate was added: table-level isolation over
  the set the query logger MEASURED. The spec's acceptance criterion says an over-permissive
  policy on *any* tenant-owned table must make at least one use case's result carry a foreign
  token. Re-tested against each of the four unfiltered reads rather than one, that held for
  `actuals_ledger_entry` and `tracker_snapshot` and failed for `baseline_wp` and `rate_entry`,
  whose foreign rows `repo.ts` discards in memory afterwards. The rows had still crossed the
  boundary. The new gate asserts the same claim one level down and is driven by the measured
  reach set, so it covers whatever the use cases actually read rather than a list somebody
  maintains.
- 2026-09-21 (Tasks & Acceptance check) — the I/O matrix's parenthetical list of unfiltered reads
  names five tables; there are **four**. `ticket_observation` is filtered by
  `eq(snapshotId, latestSnap.id)` (`repo.ts:149-150`). The matrix is inside the frozen block and
  was not edited; the two places in the code that repeated the claim — `read-use-cases.ts`'s `why`
  for `loadProjectBundle` and the isolation test's comment — were corrected. The matrix row's
  expected behaviour is unaffected.
- 2026-09-21 (Tasks & Acceptance check) — the `app_user` unreached entry gained a warning. The row
  writer prefixes the two seeded users' *names* (`own('Nguyen Thi Linh')`), which are also demo
  markers, so a probe Tenant's `app_user` rows literally contain them. Harmless while no use case
  reads that table, and a false leak report the day one does — so the note sits on the entry
  whoever removes it has to read.
- 2026-09-21 — the symmetry comparison normalises three keys (`seq`, `activeBaselineSeq`,
  `activeBaselineVersionSeq`) to a sentinel. Not an allow-list in the sense the spec bans — the
  isolation scan has no allow-list of any kind — but a necessary one here: the database allocates
  those values and two Tenants cannot agree on them. Normalising by value was rejected because
  the probes' Baseline sequences are 2 and 3 and `mapping_rule.priority` is also 1 and 2;
  normalising by path was rejected as per-use-case knowledge. Recorded in deferred-work.

## Review Triage Log

**Round 1, 2026-09-21 — three layers, 24 findings.** Verdicts are from my own checks at each
cited location, not from the reviewers' grading.

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | `read-use-cases.ts:14-16` states all eight `apps/web` files reach data through exactly two functions in `repo.ts`. `actions.ts` issues its own reads | **medium** | **Confirmed at the lines.** `apps/web/src/app/actions.ts:115` (`tx.select().from(s.project)`) and `:151` (`tx.select().from(s.workPackage)`), reached through the barrel's `schema`/`withTenant` exports. Both are helpers *inside write actions*, so the READ-USE-CASE surface really is the two functions and the AC holds — but the claim as written is wrong, and a read added to `actions.ts` ships with no isolation cover and no red build. The same sentence is the sequencing argument recorded at approval | patch (correct the claim in all non-frozen places) + defer (the structural gate) |
| 2 | The cross-Tenant probe never executes its assertion: `cross.error` is always set, so it returns before scanning | **medium** | Confirmed: both entries route through `loadBundleInTenant`, whose first statement throws `project … not found` (`repo.ts:77`) when the row is invisible. A green tick that observes nothing, and it cannot tell "RLS blocked it" from "the read crashed" | patch |
| 3 | `afterAll` cleanup is three unguarded sequential awaits — if A's removal throws, B is never removed and the verification never runs | **medium** | Confirmed by reading it. Produces exactly the leaked-probe / `pnpm seed` refuses state the block exists to prevent, unnamed | patch |
| 4 | The demo Tenant's own result is never scanned for probe tokens | **medium** | Confirmed: `foreignStringsIn` is called on `a`, `b` and `cross`, never on `demo`. A leak *into* the demo Tenant surfaces only as a confusing census mismatch, and the demo direction is the one a deployment resembles | patch |
| 5 | The pure gate never asserts any entry is a read; `kind: 'not-a-read'` on both entries empties the whole probe matrix and keeps the four database-free assertions green | **medium** | Confirmed: `READS = READ_USE_CASES.filter(kind === 'read')`, and `describe.each([])` produces nothing. A one-word escape hatch on the harness | patch |
| 6 | `readSurfaceFunctionNames()` sees only `typeof === 'function'`; a surface exported as an object of methods, a class or a default export passes silently | **medium** | Confirmed. Directly relevant: the stated plan moves the surface to `packages/app` next slice, where a use-case module is the shape most likely to be an object | patch |
| 7 | `seed.ts` collapses every non-null `activeBaselineVersionSeq` onto the one allocated sequence | **medium** | Confirmed, and it runs on the DEMO path too. Correct only while the fixture has exactly one Baseline version; the day a re-baselining fixture lands, every ledger row pointing at an older version is silently re-pointed at the active one — the same silent reclassification the surrounding comment warns about, one level up | patch (make it loud) + defer (the real seq map) |
| 8 | `collectStrings`/`mapStrings` flatten a `Date`, `Map` or `Set` to `{}`, and the `as DemoState` cast hides it | **medium** | Verified safe today — I checked `buildDemoState()`: `HolidayCalendar` is `{id, Record<IsoDate, HolidayKind[]>}` and every instant is a string. Latent, and the failure would be invisible: both probes lose the field identically, so symmetry passes and the demo comparison blames the relabelling | patch (throw) |
| 9 | Neither probe token is validated against the other, and the `seq` bands are not validated disjoint | **medium** | Confirmed: `buildProbeTenant` checks only that the token is absent from the fixture. Sabotages 8 and 9 show the current failure mode is a raw `duplicate key … "app_user_pkey"` inside `beforeAll` — the unnamed failure this harness exists to replace | patch |
| 10 | `deleteTenantRows` uses `entry.tenantColumn ?? 'id'`; a future `global`/`operational` table with no `id` column raises 42703 and aborts cleanup | **low** | Confirmed by reading it. Unreachable today — `tenant` is the only non-tenant-owned entry and it has `id` | patch (skip rather than guess) |
| 11 | The cleanup verification reads only the `tenant` table, which is `global` and has no policy | **medium** | Confirmed, and it is the sharper half of the reviewer's point: if the owner were ever not a superuser, the policy-bearing DELETEs would match zero rows while the `tenant` DELETE succeeded — so the verification would pass with every tenant-owned row still there | patch (verify a tenant-owned table too) |
| 12 | `demoMarkers()` with an empty result makes `new RegExp('')` match every string | **low** | Confirmed by construction. Unreachable today (every id is ≥ 4 characters), and the consequence is a flood of false leaks rather than a silent pass | patch (one guard) |
| 13 | `demoMarkers()` takes Ticket markers from the latest snapshot only, while `snapshotId` is taken from all six | **low** | Confirmed. Narrow today — `ticket_observation` is read filtered by `snapshotId`, and the demo's `leftScope` is 0, so the ledger's Ticket ids are all in the latest snapshot — but the marker set is the one place the scan has no token to fall back on | patch (union all snapshots) |
| 14 | Markers shorter than four characters are dropped, so a leaked `'QA'` is never reported | **low** | Confirmed. Reachable only through `mapping_rule`, which is read filtered by `projectId`. The fix is a branch rather than a correction, and the scan would gain false positives without the cut | rejected — `low`, and the fix adds complexity for a path the change does not open |
| 15 | `sink` is module-level mutable state with no re-entrancy guard | **low** | Confirmed: correctness rests on the `beforeAll` loop staying sequential. A future `Promise.all` over the registry misattributes every table and silently narrows the fifth gate | patch (throw when already set) |
| 16 | The assertion-count prose says 20 / "2 × 5 per use case" and contradicts its own table | **low** | Confirmed — mine, introduced when I added the fifth gate. 21 tests: 4 pure, 2 faithfulness, 6 × 2 per use case, 1 table-level, 2 reach | patch |
| 17 | The sabotage count says fifteen where the tables carry more rows, and `actuals_ledger_entry` is counted twice (#2 and #10) | **low** | Confirmed. #2 and #10 are the same experiment run by two people | patch |
| 18 | `ci.yml` says "Four gates come with it:" above five bullets | **low** | Confirmed — mine, same cause as #16 | patch |
| 19 | `cross-tenant.test.ts`'s header announces FOUR CLAIMS and "Two independent completeness assertions" | **low** | Confirmed: there are five claims and three completeness assertions. The one gate that caught a real hole is the one the header does not mention | patch |
| 20 | `own()` is the prefixing scheme `probe-tenants.ts` rejected, and nothing enforces that its output avoids the demo markers | **low** | Confirmed — `app_user.name` is the only `own()` value that is also a demo marker, and `app_user` is unreached, so it cannot reach a result today. The control is the warning already sitting on the `UNREACHED_TENANT_OWNED_TABLES` entry whoever reads that table must remove | rejected — `low`, and the enforcing assertion cannot fire until the table is read |
| 21 | `PRESERVED_VOCABULARY` has no staleness gate; 20 of 23 entries fail nothing when removed | **medium** | Confirmed, and recorded by the implementation itself. A typo'd entry, or one for a value the fixture no longer holds, is undetectable. The fix needs a forward-looking flag for the 12 entries the demo fixture legitimately never contains — design, not a correction | defer |
| 22 | An entry's `name` can name one export while its `invoke` calls another; both name gates pass | **medium** | Confirmed by construction. The fix is to have the registry carry the function reference instead of a hand-written closure — a change to the registry's public shape | defer |
| 23 | `canonicalise` has no cycle guard, unlike `walkLeaves` | **low** | Confirmed. A cyclic result graph from a database read is implausible, and the fix threads a parameter through a recursive function | rejected — `low`, fix adds complexity for a path nothing opens |
| 24 | The frozen I/O matrix names five unfiltered reads; there are four | **low** | Confirmed and already recorded in the Spec Change Log. The reviewer's fix is to edit the frozen block | rejected — a finding whose fix edits this build's spec |

**Nothing routed to `intent_gap` or `bad_spec`, so no loopback.** Finding 1 touches a sentence
inside the frozen block, and it was weighed as an intent gap. It is not one: the decision it
supports — build the harness now, against a read surface that is one pointer from moving — stands
unchanged under the correction, because `actions.ts`'s two reads are helpers inside *write*
actions and the read-use-case surface really is the two functions. The claim was still wrong as
written, so it is corrected everywhere outside the frozen block, the two unregistered reads are
named in `deferred-work.md`, and the correction was put to the human explicitly rather than filed.


### Independent re-verification after the review patches, 2026-09-21

Run by the reviewing session on the patched tree, not by the implementation, and not taken from
its report. Every one restored to green afterwards.

| Sabotage | Result |
| --- | --- |
| Both registry entries downgraded to `kind: 'not-a-read'` | The pure gate fails **with no database**: *"no entry is a read, so the probe matrix would drive nothing at all"* |
| Probe B's token changed to `xtprobe-a-x` | Throws at module load: *"probe tokens xtprobe-a and xtprobe-a-x overlap as substrings. The isolation scan tests for containment…"* |
| Probe B given probe A's `seq` band | Throws at module load naming both bands and the width |
| `USING (true)` on `tracker_snapshot`, `baseline_wp`, `rate_entry` | All three named by the table-level gate, with the Tenant and the row count |
| A second unregistered exported read added to `repo.ts` | The pure gate fails with no database, naming `loadSabotageProbe2` |

Final state: `pnpm lint`, all three typechecks exit 0; `pnpm test` **146 passed across 12 files**;
the database-free run is 4 passed / 19 skipped; `SELECT id FROM tenant` returns `ten-momo` alone
and `pnpm seed` reproduces the same counts.

## Design Notes

**Why a consistent bijective relabel rather than a hand-built minimal Tenant.** Mapping each
distinct string to one distinct new string preserves every join and every equality the domain
performs, so the computation over the relabelled copy is identical — and the golden figures prove
it. Forgetting a vocabulary entry is therefore a *loud* failure (the figures move); forgetting an
id in a hand-written relabel list is a *silent* one (a table quietly stops being observable while
every assertion still passes).

**Why a token scan rather than per-field assertions.** AC-4 asks that a new use case be covered the
day it is written. A per-field assertion covers the fields someone thought of; walking the result
graph for a foreign token covers every field a use case will ever return.

## Verification

**Commands** — all run on 2026-09-21 against `postgres:18.6-alpine` on host port 55433, with
`DATABASE_URL`, `APP_DATABASE_URL` and `REQUIRE_DB=1` exported.

| Command | Result |
| --- | --- |
| `pnpm lint` | exit 0 |
| `pnpm typecheck` | exit 0 |
| `pnpm --filter @momo/web typecheck` | exit 0 |
| `pnpm --filter @momo/worker typecheck` | exit 0 |
| `pnpm test` | **146 passed across 12 files** (123 across 11 before this slice) |
| `pnpm test packages/db/src/cross-tenant.test.ts` | 23 passed |
| `pnpm test packages/db/src/cross-tenant.test.ts` with **no** `DATABASE_URL`/`APP_DATABASE_URL` | **4 passed, 19 skipped** — the pure coverage gate runs and passes with no database |
| `SELECT id FROM tenant` after the run | `ten-momo` alone |
| `pnpm seed` afterwards | succeeds — 48 WPs, 41 baseline WPs, 6 snapshots, 144 ledger entries, 184 mapping events, identical to before |

The 23 new assertions are **4 pure** — the mechanical coverage gate, the stale-entry gate, the
entry-shape gate (which also refuses a registry with no read left in it) and the unreached-set
shape gate — and **19 against the database**: 2 faithfulness, 7 per read use case × 2 use cases,
1 table-level isolation gate over the measured reach set, and 2 reach measurements. The seven
per use case are the token and demo-marker scan under each probe, the same scan run under the
DEMO Tenant for the reverse direction, the A/B multiset symmetry, the numeric census against the
demo Tenant, the `mustSurface` fixture-value floor, the demo-label census, and the
Tenant-B-asks-for-A's-Project-id probe. The pre-existing 123 still pass unchanged.

**AC-3, stated precisely.** *"Given any tenant-owned table with an over-permissive policy, then
at least one use case's result carries a foreign token"* is satisfied for **every one of the 14
tenant-owned tables a use case reaches** — by the fifth gate, which reads each reached table
directly inside `withTenant` rather than relying on what survives the read surface's own
filtering. Round 2 below is why that wording matters: through the RESULT alone it held for five
tables, not fourteen. The remaining two tenant-owned tables, `app_user` and `audit_log`, have no
use-case-level gate at all, because no use case reads them; they stay covered at TABLE level by
`rls.test.ts` (FORCE, the policy predicate, the grants and the append-only triggers), and both
are declared in `UNREACHED_TENANT_OWNED_TABLES`, so the day story 1.4 or story 1.7 gives one of
them a reader, the reach assertion fails until the entry is removed.

**Sabotage — every new gate watched to fail, then restored to green.**

| # | Sabotage | Gate that caught it, and how |
| --- | --- | --- |
| 1 | Added `export async function loadSabotageProbe(...)` to `repo.ts` with no registry entry | The pure coverage gate, run with **no database**: *"these functions are exported from packages/db/src/repo.ts and have no entry in packages/db/src/read-use-cases.ts: loadSabotageProbe"* |
| 2 | `actuals_ledger_entry`'s policy set to `USING (true) WITH CHECK (true)` | **6 failures**, each for its own reason: AC over the relabelled copy came back `4984.5` instead of `1661.5` (three Tenants' money summed); both use cases' token scans named the path and the string — `$.input.ledger[0].ticketId = "bk-issue-1001" (demo marker "bk-issue-1001")`, and 143 more; both multiset symmetry checks failed |
| 3 | Deleted the `set_config` call from `withTenant` | **10 failures.** Every own-Tenant invocation reported *"loadProjectBundle failed against probe Tenant A … project xtprobe-a-000573 not found"*, the demo Tenant's too, and the reach measurement collapsed from 14 tables to 1 |
| 4 | A use case reading `department` on the **bare handle**, outside the tenant scope (variable renamed so the ESLint rule and `source-discipline.test.ts` — both naming conventions — do not catch it first) | **Initially nothing.** All 16 assertions passed, because the read returns nothing as the restricted role and therefore loses the same field symmetrically for every Tenant. The `mustSurface` floor was added in response: *"loadProjectBundle under xtprobe-a-000589 did not return 1 of the 630 fixture values … expected [ 'Delivery' ] to deeply equal []"* |
| 5a | `'opening_balance'` removed from `PRESERVED_VOCABULARY` | The numeric census on `loadReview`: the same count of numbers on both sides, different contents — `openingBalanceMh` had gone to zero, because `attribution.ts` no longer recognised the kind. BAC, AC and SPI did **not** move, which is why that assertion exists |
| 5b | `'rule'` removed from `PRESERVED_VOCABULARY` | The numeric census, on **both** use cases — `rules[].currentlyMapped` counts `source === 'rule'` |
| 5c | `'hours'` removed from `PRESERVED_VOCABULARY` | The label census: *"loadReview under xtprobe-a-000590 … 1 label(s) missing … expected { missing: [ 'hours' ], extra: [] }"* |
| 5d | `'delta'`, `'category'` or `'manual'` removed | **Nothing failed.** Honest result, recorded in deferred-work: the current read surface never re-derives a Ledger entry or re-evaluates a Mapping Rule, so those three entries are defensive until a write use case is enumerated |
| 6 | `audit_log` deleted from `UNREACHED_TENANT_OWNED_TABLES` | **2 failures**: the reach measurement (*"now unreached and undeclared: audit_log"*) and the count (*"expected 14 to be 15"*) |
| 7 | The row writer stamping tenant A's active-Baseline `seq` (`1`) on every Tenant's ledger | **2 failures**: the Unplanned split (every mapped hour reclassified as Unplanned) and the numeric census — 1175 numbers over the demo Tenant against 1173 over the probe. BAC, AC and SPI were all unmoved, which is why the pinned set was widened |
| 8 | Probe B given probe A's `seqOffset` | `duplicate key value violates unique constraint "actuals_ledger_entry_pkey"` in `beforeAll`; the 4 pure assertions still ran |
| 9 | Probe B given probe A's `idPrefix` | `duplicate key value violates unique constraint "app_user_pkey"` in `beforeAll`; the 4 pure assertions still ran |

### Sabotage round 2 — run independently at the Tasks & Acceptance check, and it found a hole

The nine above were run by the implementation. The acceptance criterion *"given any tenant-owned
table with an over-permissive policy, then at least one use case's result carries a foreign
token"* was then re-tested against **each** of the four reads that carry no `WHERE`, rather than
against one of them. The result split in two, and the split was not anticipated:

| # | Sabotage | Outcome before the fix |
| --- | --- | --- |
| 2 (re-run) | `USING (true)` on `actuals_ledger_entry` | caught — 6 failures, as in round 1 |
| 10 | `USING (true)` on `tracker_snapshot` | caught — 9 failures |
| 11 | `USING (true)` on `baseline_wp` | **every assertion passed** |
| 12 | `USING (true)` on `rate_entry` | **every assertion passed** |

`repo.ts` selects `baseline_wp` and `rate_entry` with no `WHERE` and then re-filters them in
memory — by `baselineVersionSeq` and by `resourceId`, both of which differ per Tenant — so every
Tenant's rows crossed the boundary into the process and the caller's result still looked clean.
`rls.test.ts`'s predicate assertion did catch both (confirmed: `pnpm test` failed there, 142/143),
but the acceptance criterion is about *this* harness, so it was not satisfied.

**Fixed by a fifth gate, driven by the MEASURED reach set** rather than by a list: for every
tenant-owned table the query logger saw a use case read, the restricted role inside `withTenant`
must see no row belonging to anybody else. Re-run against all four plus `work_package` and
`mapping_event` — six for six, each naming the table, the Tenant and the count, e.g.
*"baseline_wp: xtprobe-a-000589 can see 82 row(s) belonging to ten-momo"*.

| # | Sabotage | Gate that caught it, and how |
| --- | --- | --- |
| 13 | The `WHERE` dropped from `repo.ts`'s read of the `global` `tenant` table | **6 failures**, naming the path: *"$.meta.tenantName = \"Momo Digital KK\" (demo marker \"Momo Digital KK\")"*. This is the use-case-level half of the `tenant`-disclosure question the approval decision assigned to this slice, verified rather than asserted |
| 10–12, 2, plus `work_package` and `mapping_event` (re-runs) | `USING (true)` on each of the six, after the fifth gate landed | 6 for 6 |

### Sabotage round 3 — the review round's own three

| # | Sabotage | Gate that caught it, and how |
| --- | --- | --- |
| 14 | Both registry entries set to `kind: 'not-a-read'` with a plausible reason | The pure entry-shape gate, with **no database**: *"no entry is a read, so the probe matrix would drive nothing at all."* Without it the whole probe matrix becomes zero iterations and all four database-free assertions stay green |
| 15 | Probe B given a token containing probe A's (`xtprobe-a-x`) | At module load, by name: *"probe tokens xtprobe-a and xtprobe-a-x overlap as substrings. The isolation scan tests for containment, so neither Tenant could be told apart from the other."* |
| 16 | Probe B's `seq` band moved to 500 above probe A's | At module load, by name: *"probe Tenants xtprobe-a and xtprobe-b allocate seq from overlapping bands (700000000 and 700000500, width 1000000)"* — where the previous failure mode was a raw `duplicate key` inside `beforeAll` |

Nineteen distinct experiments across the three rounds (rounds 1 and 2 carry 16 between them,
counting `5a`–`5d` separately and the `actuals_ledger_entry` re-run once), plus seven re-runs
after the fifth gate landed. After every one of them the probe Tenants were gone and `pnpm seed`
succeeded.

**Not verified, and deliberately so:** nothing here covers a WRITE use case. `rls.test.ts`
asserts that a cross-Tenant INSERT is refused by the policy's `WITH CHECK` (42501), but that is
one hand-written probe, not an enumeration — the registry carries a `kind` field so a write
entry can join it, and the write surface to enumerate arrives with the `packages/app` rewiring.
Recorded in deferred-work. `apps/web` still has no automated test; this slice adds none, as its
Never list required.


### Environment, for a re-run

**The local database.** Postgres `18.6-alpine` already runs on host port **55433** via
`infra/docker-compose.yml` (`pnpm db:up` starts it). Every command below needs both keys exported
— there is no fallback:

```
export DATABASE_URL='postgres://momo:momo@localhost:55433/momo_keikaku'
export APP_DATABASE_URL='postgres://momo_app:momo_app@localhost:55433/momo_keikaku'
export REQUIRE_DB=1
```

`REQUIRE_DB=1` turns an unreachable database into a failure rather than a skip, which is what CI
sets. The database is already prepared and seeded; if it is not, the order is `pnpm exec
drizzle-kit push --force` → `pnpm pgboss:migrate` → `pnpm db:policies` → `pnpm seed`.

**Commands:**
- `pnpm lint` — exit 0.
- `pnpm typecheck`, `pnpm --filter @momo/web typecheck`, `pnpm --filter @momo/worker typecheck` —
  exit 0.
- `pnpm test` with `DATABASE_URL`, `APP_DATABASE_URL`, `REQUIRE_DB=1` — the existing 123 assertions
  still pass, plus the new ones.
- `pnpm test packages/db/src/cross-tenant.test.ts` with no `DATABASE_URL` — the pure coverage gate
  runs and passes; only the database describes skip.
- `SELECT id FROM tenant` after the run — the demo Tenant alone; then `pnpm seed` succeeds.

**Sabotage (each watched to fail, then restored):** add an exported read to `repo.ts` with no
registry entry; set one tenant-owned table's policy to `USING (true)`; delete the `set_config` call
from `withTenant`; have a use case read a table on the bare handle outside the tenant scope; break
one vocabulary entry in the relabeller so the golden figures move; drop a table from the declared
unreached set; make the writer reuse tenant A's active-baseline `seq` for tenant B.
