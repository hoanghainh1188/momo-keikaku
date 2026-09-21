# Handoff — 2026-09-21

State at `main` = `9d43f19`, working tree clean, no open PRs.

This covers the session of 2026-09-20, which took the project from "planning
finished, no CI, 46 tests" to "three build slices merged, six CI gates, 123
tests, tenant isolation enforced in the database".

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

**CI has nine steps**, all watched to fail before being trusted: lint (the
clock/env fence), three typechecks, a Postgres 18.6-alpine service, a prepare
step (schema → pgboss roles → RLS/grants/triggers → seed), and the suite.
**123 tests across 11 files**, up from 46 across 3.

**Tenant isolation is real**, verified directly in SQL: as the application role
with no tenant set a read returns 0 rows, with the right tenant 1, with a wrong
tenant 0. `FORCE ROW LEVEL SECURITY` is on for the 16 tenant-owned tables.

---

## The pattern that mattered most, and should continue

Three times in one session a gate looked green and proved nothing. **Reading
the diff never found it. Deliberate sabotage always did.**

| Slice | What passed that should not have |
|---|---|
| B1 | The ESLint fence had four holes: `Date()` without `new`, `process` aliasing, `.js`/`.mjs` files entirely, and warnings that could never fail CI |
| B2 | Changing the worker to connect as the **superuser** passed typecheck and all 56 tests — the composition root was never executed |
| 1.2 | Setting the ledger's policy to `USING (true)`, leaking every tenant's money, left **all 96 tests passing** |

**So: after adding any gate, break the thing it guards and watch it fail.** The
CI header and each spec's Verification section record the probes that have been
run; keep adding to them rather than trusting a green check.

---

## Next, in order

### 1. Story 1.2's remaining slices

`deferred-work.md` has **60 entries**. These four are the story:

1. **The cross-tenant harness** that enumerates every read use case.
   **NFR-S1 is not discharged until this lands** — AC-5 says that harness *is*
   the automated test NFR-S1 demands. What shipped is a targeted sabotage set.
2. **Rewire the eight `apps/web` files** onto `packages/app` use cases, then
   switch `dependency-cruiser` on — in that order, never before. This is also
   what makes `apps/web` testable: it currently has **no automated test at
   all**, and `vitest.config.ts` collects nothing under it.
3. **Arithmetic and codec** — `bigint` milli-hours, integer JPY, unreduced
   `{num, den}`, one `compareRatio` site, one jsonb codec. 13 domain modules,
   20 `number` uses, 32 pinned assertions. Independent of tenancy; doing it
   early means later stories are written against the right representation.
4. **Watermark advisory locks** — needs `seq` allocation that Epic 2 and Epic 5
   write.

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
