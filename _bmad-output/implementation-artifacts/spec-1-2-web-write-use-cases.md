---
title: 'Story 1.2 slice 4 — the five write actions move onto packages/app use cases, then the dependency-cruiser gate'
type: 'feature'
created: '2026-09-21'
status: 'done'
baseline_commit: 'c74263ad474aac98575f894f27c8d68729cc1099'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-2-web-read-use-cases.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `apps/web/src/app/actions.ts` is the last file breaking AD-1: its five FR-29/FR-21 write
actions import `drizzle-orm` and `@momo/db`, issue their own reads and inserts, and hold the
composition root to exporting `webDb()`/`WEB_TENANT_ID`. Because of it, story 1.2's
dependency-cruiser gate cannot go on, and nothing automated stops a page importing `@momo/db` again.

**Approach:** Move the five writes behind a write port `packages/app` declares and `packages/db`
satisfies structurally, as five use cases returning `Result`; make `actions.ts` parse the form and
call composition-root bindings only. Then — in the same slice, after the move — switch on
`dependency-cruiser` with AC-6's rule: no `apps/*` import of `packages/db` or Drizzle except the
named carve-out paths.

## Boundaries & Constraints

**Always:**
- **Behaviour preserved per action**: same rows (event, `audit_log` row, new Work Package for
  *Plan*), same ids, same `actor`, same `at` (the Project's `demoAnchor`), one transaction per action
  (AD-14), same `revalidatePath` calls. The golden figures 2936.0 / 1661.5 / 0.91 unchanged.
- **Direction holds**: `packages/app` never imports `@momo/db`; the write functions live in
  `packages/db` and match the port structurally, checked by `satisfies` at the composition root.
- **An invisible Project answers `not_found`** (it does not exist, or another Tenant owns it) and
  writes nothing. The `new Date()` fallback in `anchorOf` and its eslint-disable are removed.
- **Invalid input answers `invalid_input`** (zod at the use-case boundary; NUL refused as in the
  reads). The action treats both error codes as today's early return: no write, no revalidate.
- **The composition root exports use-case bindings only** — `webDb()` and `WEB_TENANT_ID` stop
  being exported. The audit `actor` (`user:linh`) is stated once there, beside the Tenant.
- **Writes join the cross-tenant harness**: every write use case is accounted for on the enumerated
  surface, and a foreign-Tenant write is proved to answer `not_found` and land nothing.
- **The gate is watched to fail**: each rule broken deliberately, then restored.

**Never:**
- No advisory locks / watermark discipline (`nextSeq` moves unchanged), no audit module (1.3), no
  `RequestContext`, users or roles (1.4/1.5), no Clock port consumer, no arithmetic/codec change.
- No change to the read use cases, the pages, or what any page renders.
- No validation that `ticketIds`/`wpId` belong to the Project (not done today; a later story's).
- Not full AD-1 in the gate: `apps/worker`'s `pg-boss`/`pg` stay out of scope (recorded).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | On failure |
|---|---|---|---|
| Map / Plan / Explain / CR candidate / map-single, own Project | valid form | same rows as before this slice, one transaction, pages revalidated | — |
| Unmap | `mapSingleTicket` with `wpId: ''` | a `manual` mapping event with `wpId` null, audit `mapping.unmap` | — |
| Foreign or missing Project | Tenant B, Project of A | `not_found`; zero new rows in any table, for either Tenant | name the use case |
| Empty/malformed input | no tickets, blank name/note, NUL | `invalid_input`, nothing written | — |
| Over-long note | > 1000 chars | truncated to 1000 by the action, as today | — |
| New write use case, unregistered | exported with no harness entry | pure gate fails naming it, no database | — |
| `apps/*` imports `@momo/db`/`drizzle-orm` outside `composition.ts` | any file | `pnpm depcruise` fails naming file and rule | — |

</frozen-after-approval>

## Code Map

- `apps/web/src/app/actions.ts` — the five actions (`mapTickets` :128, `planTickets` :146,
  `explainTickets` :184, `crCandidate` :198, `mapSingleTicket` :210) plus helpers `run`, `nextSeq`
  (SECURITY DEFINER `momo_next_mapping_event_seq()`), `appendMappings`, `recordDisposition`,
  `anchorOf` (:117, the `new Date()` fallback). All `(FormData) => Promise<void>`; callers
  `components/disposition-rail.tsx` (four forms) and `components/map-ticket-form.tsx` read no return.
- `packages/db/src/repo.ts` — reads only; model for a new `packages/db/src/repo-writes.ts`. Missing
  Project → reject with `project <id> not found`, so `isProjectNotFound`
  (`packages/app/src/ports/project-read.ts:101`) is reused unchanged. `withTenant(db, tenantId, fn)`
  at `with-tenant.ts:50`. `source-discipline.test.ts` bans queries on a variable named `db`: use `tx`.
- Tables: `mapping_event` (append-only, caller-allocated `seq`), `disposition_event`, `audit_log`
  (append-only, identity `seq`), `work_package` (mutable-audited). momo_app has INSERT on all.
- `packages/app/src/{result.ts,ports/,use-cases/}` — slice 3's pattern: port with handle as a type
  parameter and function-typed properties; `runProjectRead`'s zod + `not_found` mapping.
  `use-cases/index.ts` IS the enumerated surface — writes go there and are registered.
- `apps/web/src/server/composition.ts` — add a write-deps builder + five bindings; drop the
  `webDb`/`WEB_TENANT_ID` exports (keep them module-private).
- `tests/read-use-cases.ts` + `tests/cross-tenant.test.ts` — `UseCaseKind` (:62) is reserved for a
  write; the gate at `cross-tenant.test.ts:153-181`. `packages/db/src/probe-tenants.ts` builds and
  removes probe Tenants.
- CI `.github/workflows/ci.yml` — header lists gates and sabotage (60–116); new step after Lint
  (235–237), `if: always()`, no database. dependency-cruiser not installed; the spine pins
  **18.3.1** at `.dependency-cruiser.cjs`. Workspace resolves via `tsconfig.base.json` paths →
  `packages/*/src`; packages symlinked under `apps/web/node_modules/@momo`.
- Today's violations: only `actions.ts:4-5`. `scripts/` imports `packages/db` relatively — outside
  `apps/*`. `packages/db/auth` is `@momo/db-auth`, an empty skeleton. No `schedule`/`plan-input`
  module exists yet (`packages/domain/src/attribution.ts` does).

## Tasks & Acceptance

**Execution:**
- [x] `packages/app/src/ports/project-write.ts` -- `ProjectWritePort<Handle>` (five commands, each
      `(handle, tenantId, actor, command) => Promise<void>`) and `ProjectWriteDeps<Handle>` -- the
      port `packages/db` satisfies structurally.
- [x] `packages/app/src/use-cases/` -- `mapTickets`, `planTicketsAsWorkPackage`, `explainTickets`,
      `markChangeRequestCandidates`, `mapTicket`: zod-validated commands, `Result<void>`, invisible
      Project → `not_found`; exported from `use-cases/index.ts`; the barrel exports the new types.
- [x] `packages/app/src/use-cases/project-writes.test.ts` -- fake-port unit tests: each
      `invalid_input` row, `not_found` mapping, other errors propagate.
- [x] `packages/db/src/repo-writes.ts` (+ `index.ts` export) -- the five write functions, each one
      `withTenant` transaction, bodies moved from `actions.ts`; Project read inside it rejects with
      the existing not-found wording.
- [x] `apps/web/src/server/composition.ts` -- write bindings; `actor` stated once; stop exporting
      `webDb`/`WEB_TENANT_ID`.
- [x] `apps/web/src/app/actions.ts` + `apps/web/src/server/forms.ts` (+ test) -- actions parse
      `FormData` via pure parsers (tested), call the bindings, revalidate on `ok` only. No `@momo/db`,
      no `drizzle-orm`. Drop `drizzle-orm`/`pg` from `apps/web/package.json` if build and typecheck
      still pass.
- [x] `tests/` -- register the five writes (`kind: 'write'`); a foreign-Tenant probe per write
      (`not_found`, row counts of every tenant-owned table unchanged); an own-Tenant test per write on
      a dedicated probe Tenant asserting the exact rows, removed afterwards.
- [x] `.dependency-cruiser.cjs`, `package.json` (`depcruise` script, `dependency-cruiser@18.3.1`),
      `.github/workflows/ci.yml` -- rule `apps-not-to-db`: `^apps/` → `^packages/db/` or `drizzle-orm`
      forbidden except `apps/web/src/server/composition.ts` and `packages/db/auth`; the two AD-1
      scheduling edges and "composition root never imports the schedule/plan-input repositories" as
      forward-looking rules; CI step and header entry.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- close the entries this resolves
      (actions.ts imports, `webDb` export, `anchorOf` fallback, writes not enumerated, nothing stops a
      page importing `@momo/db`); record anything found and not fixed.

**Acceptance Criteria:**
- Given `apps/web`, when `pnpm depcruise` runs, then it passes, and `composition.ts` is the only
  `apps/web` file importing `@momo/db`; no `apps/web` file imports `drizzle-orm`.
- Given a page or action re-pointed at `@momo/db` or `drizzle-orm`, when CI runs, then the
  dependency-cruiser step fails naming the file — watched to fail.
- Given each of the five actions submitted on the running app for `prj-ec2`, when compared with the
  baseline commit, then the same rows land (ids, `at`, actor, audit action and payload).
- Given the whole suite, when lint, the three typechecks, depcruise and tests run, then all pass and
  the harness still discharges NFR-S1.

## Implementation Notes

**What landed.** `packages/app` gains `ports/project-write.ts` (`ProjectWritePort<Handle>` with five
function-typed members `(handle, tenantId, actor, command) => Promise<void>`, `ProjectWriteDeps<Handle>`
= `{ handle, actor, projectWrite }`, and the five command types), `use-cases/project-write-input.ts`
(the zod schemas, `EXPLAIN_NOTE_MAX`, and `runProjectWrite`: validate → call with `ctx.tenantId` →
`ok(undefined)`, map `isProjectNotFound` to `not_found`, rethrow anything else) and
`use-cases/project-writes.ts` (the five use cases). `use-cases/index.ts` exports them, so they are on
the enumerated surface. `packages/db/src/repo-writes.ts` holds the five write functions — bodies
moved from `actions.ts`, each one `withTenant` transaction that first reads the Project (rejecting
with `repo.ts`'s `project <id> not found …` wording) and stamps its `demoAnchor` on every row; the
`new Date()` fallback and its eslint-disable are gone. The composition root wires them with
`satisfies ProjectWriteDeps<Db>`, states `WEB_ACTOR = 'user:linh'` beside the Tenant, and no longer
exports `webDb`/`WEB_TENANT_ID`. `actions.ts` parses through `server/forms.ts`, calls the binding, and
revalidates only when `server/result.ts`'s exhaustive `writeLanded` says the write landed.

**The actor rides on the deps**, not on `ctx` (Design Notes): `ProjectWriteDeps.actor`, chosen by the
composition root. The use-case signature stays `(deps, ctx, input)` like the reads.

**The four Disposition commands carry their `kind` as a literal.** Found by the "port shape broken"
sabotage: a Change Request candidate's command (`projectId`, `ticketIds`) is a structural SUBSET of
Map, Plan and Explain, and a function taking fewer fields is assignable to a slot that passes more —
so `recordExplainDisposition: recordChangeRequestCandidates` at the composition root TYPECHECKED, and
every Explain would have landed as a candidate with every gate green (the harness wires its own
deps, so it would not have seen the web root's miswire either). With `kind: 'explain' | 'map' | …` on
each command the same swap is TS2322. The use case stamps `kind` (zod strips any caller-sent one);
`packages/db` writes `command.kind` as the Disposition kind, which the literal type pins.

**What the form parsers decide: nothing about validity.** They reproduce the action's old shaping
(split/filter the Ticket ids, trim name and note, cut the note at 1000) and pass everything else to
the use case, which refuses empties, blanks and NUL. An absent field now reads as `''` rather than
the four characters `null`. The use case does not trim — it refuses a blank value but stores what it
is given, so web submissions land byte-for-byte what they did. An Explain note over 1000 characters
is refused by the use case (the action has already truncated it); a Plan name has no bound, as before.

**The write harness is a second file**, `tests/cross-tenant-writes.test.ts`, with its own two probe
Tenants (`xtprobe-wa` at seq 720M, `xtprobe-wb` at 730M): vitest runs files in parallel and
`cross-tenant.test.ts` compares its two probes for symmetry, so writing onto them would be a flake.
The registry (`tests/read-use-cases.ts`) gains `kind: 'write'`, `WriteTarget` and `invokeWrite`; the
existing pure gate names an unregistered write, a new pure check requires `invokeWrite` on a write
(and forbids read fields on it), and the writes file adds a pure check that every write entry has an
own-Tenant row expectation. Driven per write: WB replays WA's Project/Ticket/WP ids → `not_found`, no
throw, nothing of WA in the refusal, and the row count of all 16 tenant-owned tables unchanged for
both Tenants; then an own-Tenant write on WA lands exactly the expected rows (ids, `at` = anchor,
actor, audit action and payload, the new WP for Plan, consecutive mapping seqs), plus the unmap arm
and "nothing landed for WB".

**`drizzle-orm` and `pg` dropped from `apps/web/package.json`.** Typecheck, `next build` and `next
start` pass (six routes 200, golden figures, `momo_app` connected). `serverExternalPackages: ['pg']`
is left as is; `pg` resolves through `@momo/db`. A standalone build is unmeasured — deferred-work.

## Spec Change Log

- 2026-09-21 — the Verification grep `grep -rln "@momo/db\|drizzle-orm" apps/` also lists
  `apps/web/package.json`, `tsconfig.json`, `tsconfig.tsbuildinfo` and `next.config.ts`: the workspace
  dependency, the path alias and `transpilePackages`, which the composition root needs in order to
  import `@momo/db` at all. Among SOURCE files the hit is `composition.ts` alone, which is AC-1.
- 2026-09-21 — the command types gained a `kind` literal on the four Dispositions (Implementation
  Notes), which the Tasks list did not name; it is the fix for a miswire the typecheck could not see.
- 2026-09-21 — added files the Tasks list did not name: `tests/cross-tenant-writes.test.ts` (the write
  half of the harness, separate for parallelism), `apps/web/src/server/result.ts`'s `writeLanded` (+
  tests), and `use-cases/project-write-input.ts` (schemas and the shared runner, kept off the
  enumerated surface like `project-input.ts`). `EXPLAIN_NOTE_MAX` crosses the `@momo/app` barrel as the
  one runtime value besides the use cases and `config`, so the action's truncation and the schema
  cannot drift.

- 2026-09-21 (review round 1 fixes) — `not-to-unresolvable` added to `.dependency-cruiser.cjs`; it
  found that every `@/…` import in `apps/web` had never resolved (`apps/web/tsconfig.json` has no
  `baseUrl`, so its paths resolved against the repo root), so the resolver now reads a root
  `tsconfig.depcruise.json`, watched to fail by pointing it back. Scheduling regexes accept dotted
  suffixes. Both not-found throw sites share `packages/db/src/project-not-found.ts` (not exported
  from the barrel). `appendMappings`' dead guard deleted; the Explain comment corrected. Smuggled
  `tenantId`/`actor` keys pinned as ignored. `tests/web-composition.test.ts` asserts each composition
  write binding reaches exactly its `record*` with the demo Tenant and `user:linh` — watched to fail
  with `explainTickets` pointed at the CR-candidate use case. It lives in `tests/` because written
  under `apps/web` it imported `@momo/db` and `pnpm depcruise` refused it: a test beside the file
  would be a third carve-out.

## Review Triage Log

Round 1, 2026-09-21 — blind-hunter (B), edge-case-hunter (E), verification-gap (V).

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| B1 | Gate silently green if `@momo/db` stops resolving — no `not-to-unresolvable` | medium | Unresolved modules match no `to.path`; the config already hit one tsconfig resolution bug | patch |
| B2 | No rule for `packages/db → packages/app`, `packages/app → packages/db`, `packages/domain → *` | medium | Only `apps-not-to-db` and scheduling rules exist; intent scopes the gate to AC-6 | defer |
| B3 | Raw `pg` in `apps/web` would pass the gate | medium | `to.path` names `packages/db` and `drizzle-orm` only; kept out today only by `apps/web/package.json` | defer |
| B4 | Not-found wording hand-copied in `repo.ts` and `repo-writes.ts` | low | Two throw sites; `isProjectNotFound` matches the prefix, so a reword of one path becomes a 500 | patch |
| B5 | Own Project + another Tenant's Ticket/WP ids lands a cross-Tenant reference | medium | No FKs on `wp_id`; the intent's Never excludes ownership validation, but nothing records the cross-Tenant half | defer |
| B6 / E1 / E2 | `wp-new-<anchor>` is a global PK: a second Plan, or a demo-Tenant Plan on a dev database, collides (500, existence leak, harness Plan case fails on local state) | medium | Pre-existing id scheme the intent requires preserved; the harness inherits it | defer |
| B7 / E6 | Refused writes return silently, no log or feedback | low | The frozen intent makes both codes today's early return; logging would add a `console` call the rules forbid | reject |
| B8 | `recordExplainDisposition` comment says the action truncates; it is `forms.ts`, and the use case refuses | low | Read at the function's doc comment | patch |
| B9 | Note cut in UTF-16 units can split a surrogate pair | low | Pre-existing `slice(0, 1000)`; unlikely in use and the fix adds logic | reject |
| B10 | No test that smuggled `tenantId`/`actor` input keys are ignored | low | Holds today via zod stripping; unpinned | patch |
| B11 | `appendMappings`' empty guard is dead and would write a half Disposition | low | `ticketIds` is `min(1)` at every use case; deletion is the fix | patch |
| B12 | The diff cites the spec's sabotage table without including it | false | The spec is deliberately withheld from the blind layer; the table is in this file's Results | reject |
| E3 | Concurrent `nextSeq` can collide | low | Pre-existing; the intent's Never excludes advisory locks | reject |
| E4 | Whitespace-padded Ticket ids land as-is | low | Pre-existing split without trim; the intent preserves rows | reject |
| E5 | Scheduling regex `([.][a-z]+$\|/)` misses `schedule.test.ts` | low | `.test.ts` fails `[.][a-z]+$`; direct regex fix | patch |
| V1 | Composition-root write bindings / actions can be swapped to the wrong use case with every gate green; actor and Tenant unasserted | medium | Pre-verified: no test touches `composition.ts`; `ExplainTicketsInput` is assignable to `ChangeRequestCandidatesInput` | patch |
| V2 | Dropping `pg`/`drizzle-orm` from `apps/web` verified by hand only; CI never runs `next build` | medium | Pre-verified; CI's missing `next build` predates this slice | defer |

## Design Notes

**Why `actor` is a composition-root argument, not a `UseCaseContext` field.** Adding a field to the
context is story 1.4's decision (`context.ts`). The actor is audit data the adapter supplies; passing
it beside the Tenant from the one place that states both keeps `user:linh` out of `packages/db`
and out of the use cases, and 1.4 replaces both lines together.

**Why the scheduling rules land now though nothing matches.** AD-1 asks for them "from the start";
a rule added later is added after the violation. They are proved live by sabotage with a temporary
file at each path.

## Verification

**Setup:** `pnpm db:up`; export `DATABASE_URL`, `APP_DATABASE_URL`, `REQUIRE_DB=1` (see slice 3).

**Commands:**
- `pnpm lint`, `pnpm typecheck`, `pnpm --filter @momo/web typecheck`,
  `pnpm --filter @momo/worker typecheck`, `pnpm depcruise` -- exit 0.
- `pnpm test` -- 165 existing plus new, all pass; `pnpm test tests/cross-tenant.test.ts` with no
  database -- the pure gate runs and passes.
- `grep -rln "@momo/db\|drizzle-orm" apps/` -- `apps/web/src/server/composition.ts` only.
- Run the app: submit each of the five forms on `prj-ec2` and diff the new rows against the same
  submissions on a baseline-commit worktree; golden figures unchanged before submitting.

**Sabotage (each watched to fail, then restored):** `@momo/db` imported from a page; `drizzle-orm`
from `actions.ts`; a temp file at each scheduling-rule path; a write use case exported unregistered;
a write ignoring `ctx.tenantId`; the not-found mapping removed from a write; the port's shape broken
at the composition root.

### Results, 2026-09-21

Against `postgres:18.6-alpine` on 55433 with both keys and `REQUIRE_DB=1` exported.

| Command | Result |
| --- | --- |
| `pnpm lint`, `pnpm typecheck`, `pnpm --filter @momo/web typecheck`, `pnpm --filter @momo/worker typecheck` | all exit 0 |
| `pnpm depcruise` | exit 0 — `no dependency violations found (94 modules, 222 dependencies cruised)` — after review round 1; 103 before it counted the never-resolved `@/…` imports |
| `pnpm install --frozen-lockfile` | passes (lockfile gained `dependency-cruiser@18.3.1`, lost `apps/web → drizzle-orm, pg`) |
| `pnpm test` | **266 passed across 18 files** after review round 1 (256 across 17 before it; 165 across 14 before this slice) |
| `pnpm test tests/` with no `DATABASE_URL`/`APP_DATABASE_URL`/`REQUIRE_DB` | **6 passed, 31 skipped** — both pure gates run |
| `grep -rln "@momo/db\|drizzle-orm" apps/` | source: `apps/web/src/server/composition.ts` only (config hits: see the Change Log) |
| the five forms POSTed to `next dev` on `prj-ec2` (Explain, CR candidate, Plan, Map, map-single, plus an unmap and two refusals), then the same on a worktree of `c74263a`, reseeded in between | the dumped `mapping_event` / `disposition_event` / `audit_log` / `work_package` rows are **identical** (`diff` empty): ids, seqs, `at` = anchor, `user:linh`, audit actions and payloads; the two refusals landed nothing on either side |
| a Map POST for `projectId=prj-nope` | this slice: nothing lands. Baseline: a disposition and an audit row for a Project that does not exist, at the WALL-CLOCK time — the intended change (deferred-work) |
| `next build` then `next start` without `drizzle-orm`/`pg` in `apps/web` | builds; all routes 200; Review renders 2936.0 / 1661.5 / 0.91; `pg_stat_activity` shows `momo_app` |
| `SELECT id FROM tenant` after every run and sabotage | `ten-momo` alone; the demo Tenant reseeded after the app runs |

**Sabotage — each watched to fail, then restored.**

| # | Sabotage | What caught it |
| --- | --- | --- |
| 1 | `import { loadReview } from '@momo/db'` in `baselines/page.tsx` | `pnpm depcruise`: *error apps-not-to-db: apps/web/src/app/p/[projectId]/baselines/page.tsx → packages/db/src/index.ts* |
| 1b | the same as `import type { Db }` | the same error — type-only imports count (`tsPreCompilationDeps`) |
| 2 | `import { sql } from 'drizzle-orm'` in `actions.ts` | *error apps-not-to-db: apps/web/src/app/actions.ts → node_modules/.pnpm/drizzle-orm@0.45.2…/drizzle-orm/index.d.ts* |
| 2b | a component importing `../../../../packages/db/src/schema` | *error apps-not-to-db: … → packages/db/src/schema.ts* |
| 3 | temp `packages/domain/src/schedule.ts` importing `./attribution` | *error schedule-domain-not-to-attribution* |
| 4 | temp `packages/db/src/repositories/schedule.ts` imported from `packages/app/src/sabotage.ts` | *error scheduling-repositories-only-from-app-schedule*; the same import from `packages/app/src/schedule.ts` passes, as it must |
| 5 | temp `packages/db/src/repositories/plan-input.ts` imported by `composition.ts` | two errors: *scheduling-repositories-only-from-app-schedule* and *composition-root-not-to-scheduling-repositories* |
| 6 | `export { mapTickets as mapTicketsAgain }` added to `use-cases/index.ts` | the pure gate with **no database**: *these functions are exported from packages/app/src/use-cases/index.ts and have no entry in tests/read-use-cases.ts: mapTicketsAgain* |
| 7 | `explainTickets` writing to a fixed Tenant instead of `ctx.tenantId` | the own-Tenant row test (not_found for its own Project) |
| 7b | every write writing as WA's Tenant instead of `ctx.tenantId` | 6 failures: all five foreign probes (*changed row counts when probe Tenant WB wrote to WA's Project*) and the Plan own-Tenant test |
| 8 | the `not_found` mapping deleted from `runProjectWrite` | 10 failures: five unit tests and five foreign probes — *mapTickets THREW when probe Tenant WB wrote to WA's Project, instead of answering not_found* |
| 9 | `recordExplainDisposition: recordChangeRequestCandidates` at the composition root | **passed the typecheck before the `kind` literal** (see Implementation Notes); after it, TS2322 at `composition.ts` |
| 9b | `recordMapDisposition: recordPlanDisposition` at the composition root | TS2322 at `composition.ts` |
| 9c | `packages/db`'s Explain command field renamed (`note` → `text`) | TS2322 at `composition.ts` and at the harness's own composition root |
