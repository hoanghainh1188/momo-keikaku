# Handoff — 2026-09-21 (updated after the 2026-09-21 session)

State at `main` = `da58d79` (PR #16 merged), plus the docs PR for AC-2/AC-5 and the AD-1
amendment described below.

Two sessions are covered. **2026-09-20** took the project from "planning
finished, no CI, 46 tests" to "three build slices merged, six CI gates, 123
tests, tenant isolation enforced in the database". **2026-09-21** added the
cross-tenant harness — **NFR-S1 is discharged** — and then built story 1.2
slice 3: the seven read call sites now reach their data through `packages/app`
use cases (PR #16), taking the suite to **165 tests across 14 files**.

---

## Where the plan stands

**Planning is closed.** OQ-10, OQ-11 and OQ-12 are all resolved in the PRD.

- R0 is sized at **1,180 h across 70 stories**, range 826–1,652.
- The date for §8.1 is **2027-04-14**, range 2027-02-12 … 2027-07-06, at a
  founder capacity of **40 h/week**.
- The frozen 36-FR list was **re-affirmed in full** — the founder raised
  capacity rather than cut, because the entire §8.3 cut order is worth 9 % of
  R0 and doubling capacity is worth 50 %.
- **R1's Q1 2027 date is withdrawn** and carries no replacement. The §8.1 gate
  needs four consecutive weekly Reviews *after* R0 is in use, so the earliest
  gate pass is 2027-05-12 — already Q2 — and R1 has never been sized.

### The date-slip rule, which someone must actually run

PRD §6 replaced the old cut trigger. The measured quantity is **`E` = estimated
hours closed per week**. The plan needs `E` = 40; the 2027-07-06 upper bound
needs `E` ≥ **28.6**.

- **First checkpoint: Epic 1 closing, or 2026-11-15, whichever comes first.**
  At plan velocity Epic 1 (156 h) closes 2026-10-17. If `E` < 28.6, re-derive
  the R0 date and bring it back to §8.1 **before story 2.1's migration is
  written** — 2.1 spends the expand/contract exemption once.
- **Monthly from 2026-11-01**: append one line to PRD §13 with the stories
  closed and hours worked. Any two consecutive months both below 28.6 fire the
  §8.3 cut order at item 0.

**Caveat on the first reading.** Story 1.1 slice A took about two hours against
a 24 h estimate for the whole story, but do not read that as velocity: most of
the work was investigation and review rather than typing, and all three
breakages were things the plan had not anticipated. Slice B1 and B2 were closer
to their share. Track upgrade-style work separately from feature work.

---

## What is built

| PR | What |
|---|---|
| #5 | Sprint planning: OQ-12 closed, `sprint-status.yaml` generated |
| #6 | CI created from nothing |
| #7 | Story 1.1 slice A — toolchain to the decided stack |
| #8 | Persistence round-trip test |
| #9 | Story 1.1 slice B1 — workspace skeleton, config port, clock fence |
| #10 | Story 1.1 slice B2 — pg-boss on separated database roles |
| #11 | `.nvmrc`, plus two decisions recorded where they bind |
| #12 | Story 1.2 slice 1 — table-class registry, RLS, `withTenant` |
| #13 | Handoff for the next session |
| #14 | Story 1.2 slice 2 — the cross-tenant harness; **NFR-S1 discharged** |

**CI has nine steps**, all watched to fail before being trusted: lint (the
clock/env fence), three typechecks, a Postgres 18.6-alpine service, a prepare
step (schema → pgboss roles → RLS/grants/triggers → seed), and the suite.
**146 tests across 12 files**, up from 46 across 3.

**Tenant isolation is real**, verified directly in SQL: as the application role
with no tenant set a read returns 0 rows, with the right tenant 1, with a wrong
tenant 0. `FORCE ROW LEVEL SECURITY` is on for the 16 tenant-owned tables.

**And it is now proved at the use-case level, not only the table level.**
`packages/db/src/cross-tenant.test.ts` seeds two probe Tenants — each a
bijectively relabelled copy of the demo dataset — and
drives every read use case against both as the restricted role. The covered set
is read off the read surface's module namespace, so an exported read with no
registry entry fails **with no database at all**, naming it. Reach is measured
with a query logger: 14 of the 16 tenant-owned tables; `app_user` and
`audit_log` are declared unreached with reasons, and either direction of change
fails the build.

---

## The pattern that mattered most, and should continue

Four times across two sessions a gate looked green and proved nothing. **Reading
the diff never found one of them. Deliberate sabotage found every one.**

| Slice | What passed that should not have |
|---|---|
| B1 | The ESLint fence had four holes: `Date()` without `new`, `process` aliasing, `.js`/`.mjs` files entirely, and warnings that could never fail CI |
| B2 | Changing the worker to connect as the **superuser** passed typecheck and all 56 tests — the composition root was never executed |
| 1.2 | Setting the ledger's policy to `USING (true)`, leaking every tenant's money, left **all 96 tests passing** |
| 1.2 s2 | `USING (true)` on `baseline_wp` leaked every Tenant's rows into the process and **all twenty** harness assertions stayed green |

**So: after adding any gate, break the thing it guards and watch it fail.** The
CI header and each spec's Verification section record the probes that have been
run; keep adding to them rather than trusting a green check.

**And one sharper rule, learned on 2026-09-21 at the cost of a real finding:
when a gate covers a CLASS of things, sabotage every member, not a
representative.** Four reads in `repo.ts` carry no `WHERE` at all. Sabotaging
one of them (`actuals_ledger_entry`) failed six assertions and looked like
proof for all four. It was not: `baseline_wp` and `rate_entry` are re-filtered
in memory by a key that differs per Tenant, so a wide-open policy on either
left every assertion green. That is why the harness now also asserts isolation
at the table level, over the set the query logger **measures** the use cases
reading.

---

## Next, in order

### 1. Story 1.2's remaining slices — three

Slice 3 (the reads) merged on 2026-09-21 as PR #16. `deferred-work.md` now has
**83 entries**. What slice 3 left for the next one, all recorded there:
`actions.ts` still imports `@momo/db` and `drizzle-orm`; an invisible Project
is recognised by `repo.ts`'s error MESSAGE; the coverage gate can be sidestepped
by a use case exported from the `@momo/app` barrel directly, or by a registry
entry whose `invoke` calls a different use case than it names; and nothing
automated stops a page importing `@momo/db` again until the gate lands.

1. ~~The seven read call sites onto `packages/app` use cases.~~ **Done**,
   `spec-1-2-web-read-use-cases.md`, `status: done`.
2. **The five write actions, then `dependency-cruiser`** — in that order, never
   before. `actions.ts` is the file that still imports Drizzle, which is why
   the gate cannot go on until the writes move. Measured 2026-09-21: 12
   violating imports across 11 files today. This is also what makes `apps/web`
   testable: it still has **no automated test at all**.
3. **Arithmetic and codec** — `bigint` milli-hours, integer JPY, unreduced
   `{num, den}`, one `compareRatio` site, one jsonb codec. 13 domain modules,
   20 `number` uses, 32 pinned assertions. Independent of tenancy; doing it
   early means later stories are written against the right representation.
4. **Watermark advisory locks** — needs `seq` allocation that Epic 2 and Epic 5
   write. **Blocked**, and the only one of the four that is.

### 2. Then story 1.1 slice B3

`pnpm dev` in one command. Blocked on 1.2's RLS SQL (now exists) **and story
2.1's migration** (does not). Sequence it after 1.2.

### 3. Then the rest of Epic 1

Stories 1.3 through 1.9. Epic 1 is 156 h and is the calibration point for the
whole estimate.

---

## Standing decisions

- **Node**: `.nvmrc` = 24.21.0, CI reads it via `node-version-file`. No
  `engines` — an exact pin would refuse to install on the founder's 24.13.0.
- **Branch protection**: off. GitHub refuses it on a private repo on a free
  plan, so the nine gates **report and do not block**. Revisit when a second
  person can merge. Recorded in the CI header.
- **The hardcoded DSN fallback**: removed in story 1.2, as decided.
- **Connector order after R0**: Jira first, Redmine after. Revisit 2027-01-01.
- **A second AD-1 carve-out**, decided 2026-09-21 and written into
  ARCHITECTURE-SPINE's AD-1 the same day (after an adversarial review that
  narrowed a first draft): `apps/web/src/server/composition.ts` is the only
  file under `apps/web` permitted to import `packages/db`, it exports use-case
  bindings only, `apps/worker` has no such file, and `tests/` sits outside the
  AD-1 graph. The dependency-cruiser rule names that exact path. Amending the
  spine makes the cached `epic-1-context.md` stale, so the next `/bmad-build`
  recompiles it.
- **The dependency-cruiser gate takes AC-6's wording, not full AD-1.** It bans
  `apps/*` importing a repository or Drizzle. Full AD-1 would also flag
  `apps/worker`'s `pg-boss` and `pg` and drag the queue-adapter move into
  `packages/adapters` with it — the day-one-red the epic warns about. The
  uncovered half is recorded in `deferred-work.md`.
- **`sprint-status.yaml` records a story `in-progress` until every slice of it
  is done**, corrected 2026-09-21. Build's own step-05 marks a story `review`
  when a slice finishes, which for a multi-slice story is wrong and made the
  status view recommend a code review of unfinished work. Stories 1.1 and 1.2
  were both showing `review` with slices outstanding.
- **All three constraint types stay in R0**; the critical path is the
  minimum-Float chain.

---

## Open, and genuinely waiting

- **OQ-2** — do the five target Backlog spaces expose actual hours? The note
  said "check the 5 spaces this week", written 2026-09-20. Epic 5's fixtures
  should be re-recorded once known. Does not block.
- **OQ-3** — which client specifically. Contract type decided (準委任/labo).
- **OQ-4** pricing, **OQ-5** AI provider, **OQ-7** competitive watch (re-check
  2026-12-01), **OQ-8** client sign-in, **D2** the 30 UX assumptions.

---

## Environment notes

- Postgres `18.6-alpine` runs in `infra/docker-compose.yml` on host port
  **55433**; volume `infra_momo-pgdata` persists.
- Local commands need both variables — there is no fallback any more:
  ```
  export DATABASE_URL='postgres://momo:momo@localhost:55433/momo_keikaku'
  export APP_DATABASE_URL='postgres://momo_app:momo_app@localhost:55433/momo_keikaku'
  ```
  `REQUIRE_DB=1` additionally turns an unreachable database into a failure
  rather than a skip, which is what CI sets.
- `.claude/launch.json` starts the web app on 3101 for the agent harness.
- **The local clone goes stale**: work lands via PRs merged from other
  sessions. `git fetch` before measuring anything, or a stale ref reads exactly
  like a missing artifact.
