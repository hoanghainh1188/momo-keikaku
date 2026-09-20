---
title: 'Rubric Review — scheduling slice (AD-25 … AD-30) and post-amendment coherence'
created: 2026-09-20
reviewer: 'rubric walker (good-spine checklist), adversarial pass'
scope: >-
  ARCHITECTURE-SPINE.md (744 lines, AD-1 … AD-30) against prd.md + addendum.md
  (prd-momo-keikaku-2026-09-19), sprint-change-proposal-2026-09-20.md, and the
  repository at packages/db/src/schema.ts and packages/domain/src/. Focus: the
  scheduling slice added this run (AD-25 … AD-30) and whether the in-place
  amendments to AD-1, AD-4, AD-5, AD-9, AD-10, AD-11, AD-13, AD-15, AD-19,
  AD-20, AD-21 left the rest of the spine coherent.
verdict: 'pass-with-fixes — blocking: 3 Critical, 6 High. Do not cut epics for the scheduler until C1–C3 and H1–H4 are resolved.'
---

# Rubric Review: the scheduling slice

## Verdict

The scheduling slice is the strongest part of this spine. AD-25's "there is no column to write" and AD-26's "the run *is* the pin, and re-derivation and reproduction are the same function" are genuine mechanisms, not promises, and AD-28 closes OQ-13 with something a test can assert. The slice as designed does fix the doctrine breach the sprint change proposal exists to close.

What it does not do is survive contact with the ADs it amended. Three contradictions are load-bearing: a Review that shows new progress against old dates (C1), a Divergence computation that reads two tables the spine's own closure rule forbids (C2), and a calendar-correction path with no legal way to execute (C3). Two dimensions the altitude owns are silent: the summary-WP roll-up (H2) and the entire operational envelope of the new scheduler (H4) — AD-19 is titled "The operational envelope is decided, not implied" and contains not one scheduler metric, alarm or log key.

## Scorecard

| Criterion | Result | Notes |
| --- | --- | --- |
| Fixes the real divergence points for epics/stories, misses none | **Partial** | The hard ones are fixed: single writer (AD-25), pinning by reference (AD-26), the closed trigger set with both directions tested (AD-27), the tie-break (AD-28), calendar versioning (AD-29), one migration (AD-30). Missed: summary roll-up (H2), `baseline_wp`'s actual column set (H3), planned effort's home and pinning (M8), `is_leaf` maintenance (H6). |
| Every Rule enforceable, and actually prevents its Prevents | **Mostly** | AD-25's structural single-writer, AD-26's identical-function test, AD-27's two-direction tests and AD-28's shuffled-input test are real. Wishes: `is_leaf` (H6), `engine_version` (H5), AD-27's call-site allowlist (M4), `wp_dependency.type`'s "R0 rejects" (L4). |
| Nothing under Deferred lets two units diverge | **Fail** | Line 721 invites a cut the spine cannot survive (M6). `schedule_run` retention cadence hides inside the FR-19 compaction deferral (M9). |
| Every dimension decided, deferred, or an open question | **Fail** | Summary roll-up: silent (H2). Operational/observability envelope of the scheduler: silent (H4). Scheduler algorithm versioning: a column with no discipline (H5). |
| Ratifies rather than contradicts the codebase | **Pass** | `wbs_code`, `is_leaf`, `is_milestone`, `wp_id` stability all exist in `packages/db/src/schema.ts`. AD-30 names the gap between the repo's 17 tables and the model rather than pretending it away (line 515) — the right move. `domain/calendar` already has `workingDaysBetween`/`addWorkingDays` for AD-25's whole-working-day discipline. |
| Internally consistent after the amendments | **Fail** | C1, C2, C3, H1, H3, M2, M3 are all seams between a new AD and one it amended. |
| Terse and convergent | **Mostly** | The six new ADs are the wordiest in the document and several bullets argue with the reader or with the PRD rather than decide (L5). |

---

## Findings

### CRITICAL

#### C1. The Review re-captures every PM watermark except the one that moves the dates (AD-10, line 221; ADded `schedule_run_seq` at line 218)

AD-10's split pin re-captures, after each successful PM write inside a Review: `mapping_seq_max`, `disposition_seq_max`, `pct_override_seq_max`, `setting_seq_max`, `wp_status_seq_max`, `wp_flag_seq_max`. **`schedule_run_seq` is not in that list**, and it was added to `ComputationInputs` one bullet earlier (line 218).

Three of the re-captured watermarks are recalculation triggers under AD-27:

- `pct_override_seq_max` — a Recorded Percent Complete override (FR-30, FR-6b trigger, FR-28 cause *progress changed*);
- `wp_status_seq_max` — marking a WP complete, which sets its actual finish (FR-5, FR-6b trigger, FR-28 cause *actual dates recorded*);
- `setting_seq_max` — Project settings.

So inside a Review the PM sets a Recorded Percent Complete to 60%. `pct_override_seq_max` moves, so the Observed-vs-Recorded comparison and every EVM figure update immediately, exactly as UJ-3 requires. AD-27 runs `recalculate` synchronously in that same transaction and appends a new `schedule_run`. The Review's `schedule_run_seq` does not move. **The Review now displays dates derived from 0% alongside progress of 60%, and the FR-28 date-movement section attributes nothing, because the run the diff ends at is the old one.**

This is the precise condition FR-6b (prd.md line 359) and NFR-C1 (line 986) name and forbid: *"a displayed schedule is never stale against the inputs it was derived from."* AD-27 line 475 claims "a partially stale plan is unreachable rather than merely unlikely" — it is reachable through AD-10's own pin.

**Fix:** add `schedule_run_seq` to the re-captured PM set in AD-10, and say explicitly that it is re-captured *because* a re-captured trigger watermark implies a new run. Alternatively, derive it: `schedule_run_seq = the Project's latest run at the moment the other PM watermarks are captured`, under the same AD-20 shared lock. Either way the coupling must be written down, because "re-capture these six" and "these three cause a seventh to move" is exactly the kind of implicit dependency two story authors resolve differently.

#### C2. AD-11 makes Divergence read two tables the spine forbids compute to read (line 235)

> "PV and BAC read only `baseline_wp`. Divergence compares `baseline_wp` with the current `wp_schedule` (AD-25) for dates and with `work_package` for effort, and FR-28 attributes each movement from the `cause` of the runs in between (AD-26)."

One sentence, two violations of the spine's own closure rule:

1. **`wp_schedule`.** AD-25 line 443 defines it as class `derived`, "a projection of the latest `schedule_run` … **never the referent of anything pinned**." AD-10 line 210: "any value read by `domain/evm`, `domain/health`, `domain/forecast`, `domain/attribution` or `domain/schedule` must come from an append-only source that `ComputationInputs` pins. **For `domain/schedule` that source is `schedule_run.inputs` and nothing else**." Divergence against "the current `wp_schedule`" is therefore unpinnable by construction — and FR-35 (prd.md line 874) requires a Published Snapshot to reproduce *the schedule it displayed*, and FR-34/client-view.ts line 83 already builds the client schedule out of `review.divergence`. A Published Snapshot's Divergence recomputed next March reads today's `wp_schedule` and gives a different answer. The correct referent is `schedule_run.outputs` at the pinned `schedule_run_seq`, which AD-26 already provides.
2. **`work_package` for effort.** AD-21 line 405 states the rule flatly: "A `work_package` column may be mutable only if **no domain compute function reads it**. The AD-10 closure test is what enforces that." AD-21's `mutable_audited` class (line 386) is defined as "never read by `domain` compute". `work_package` is classified `mutable_audited` (line 391). AD-21 then explains why derived dates had to leave the table — *"FR-28's Divergence reads them, so as mutable columns they broke this rule"* — and AD-11 leaves planned effort behind in the table doing exactly the same thing. Nothing in `ComputationInputs` (lines 211–219) pins planned effort, and `schedule_run.inputs` (line 459) does not carry it either. See M8.

The amendment moved the dates out of the violation and left the effort in it. Either the closure test is written to enumerate only date inputs — in which case AD-10's "a test enumerates the exported domain function signatures and fails if any input type is not reachable from `ComputationInputs`" is false as written — or the closure test fails on day one and someone weakens it.

**Fix:** rewrite AD-11 line 235 as: Divergence compares `baseline_wp` against the `schedule_run.outputs` of the run at the computation's `schedule_run_seq` for dates, and against a pinned effort source for effort. Then decide the effort source (M8).

#### C3. AD-29's national-calendar correction has no execution path AD-27 permits (line 502 vs lines 473, 475)

AD-29 line 502 makes the third creator of a calendar version "**any correction or extension of the JP or VN national tables themselves** … an operator action that appends one new version per affected Project", and calls this "what makes the versioning real rather than decorative."

A new Holiday Calendar version is a recalculation trigger (AD-27 line 472; FR-6b; FR-14 prd.md line 512). AD-27 then closes both exits:

- Line 475: "**Execution is synchronous and inside the edit's own transaction**, under the AD-20 per-Project exclusive lock." One transaction spanning every affected Project in every Tenant is not available: AD-3 line 95 requires all tenant data access through `withTenant(tenantId, …)`, one Tenant per transaction, and AD-20 takes a per-Project exclusive lock.
- Line 473: the reachability test "walks the static call graph from `ingestSnapshot`, `evaluateRules`, every `mapping` use case and **every pg-boss handler**, and fails if `recalculate` is reachable from any of them." So the fan-out cannot be a job either. CI rejects it.

There is therefore no way to ship the mechanism AD-29 says makes its own versioning real. Nor does the spine say who performs the action: there is no operator use case, no role in AD-12's role-scoped surfaces, no entry in AD-14's audit action enum, no ordering rule across Projects, and no bound on fan-out. AD-19's `maintenance` role writes only to `operator_audit` and is confined to compaction and `purgeTenant` (AD-5 line 123).

There is also a doctrine question underneath, which is why this is Critical rather than High: an operator-initiated national-table correction re-dating every Project in the system **is** "a background job re-dating a plan while nobody is looking" — the exact failure AD-27's Prevents line names (line 470). FR-6b permits it because a calendar version is a listed trigger, but the spine should decide deliberately whether such a version is applied immediately or is offered to each PM, rather than leaving a mechanism that cannot be built.

**Fix:** decide one of — (a) a `maintenance`-role batch that is an explicit, named exemption from AD-27's synchronous rule, with the reachability test's allowlist naming it, per-Project transactions, and an operator-audited result; or (b) the correction appends the version and marks affected Projects' schedules stale, with the recalculation happening on the PM's next interaction (which also needs an AD-27 exemption, since it is not an edit); or (c) national-table corrections are out of R0 and the third creator is withdrawn from AD-29. (c) is honest and cheapest, but it costs AD-29 its stated justification.

---

### HIGH

#### H1. AD-25 grants the application role UPDATE on an append-only table (line 444 vs AD-5 lines 121–122)

AD-25: "Only `packages/app/schedule.recalculate(projectId)` writes `wp_schedule` and `schedule_run` … **the application role holds INSERT/UPDATE on those two tables** through that path only."

AD-5 line 121 lists `schedule_run` among the insert-only tables. Line 122: "The application role has **no `UPDATE`/`DELETE` grant** on these tables, and a `BEFORE UPDATE OR DELETE` trigger raises an error." AD-21 line 382 says the grants and trigger SQL are *generated from* `table-classes.ts`, and line 390 classifies `schedule_run` as `append_only`.

The generator will produce AD-5's grants and AD-25's sentence will be quietly wrong — or a builder will read AD-25 and special-case it. Say "INSERT on `schedule_run`, INSERT/UPDATE (or delete-and-insert) on `wp_schedule`", and state which of UPDATE or delete-insert `wp_schedule` uses, since a `derived` projection rebuilt every run is a different write profile (and a different lock and bloat profile) from 500 UPDATEs.

#### H2. The summary-WP roll-up is a whole dimension left silent (AD-25, AD-26, AD-11, ER diagram line 620)

The word "summary" appears in the scheduling ADs only to say what summaries may *not* carry (AD-25 lines 446, 448, 451). Nothing decides where a summary WP's dates and effort come from. The PRD requires them and displays them:

- FR-5 (prd.md line 334): "a summary WP's dates are the earliest start and the latest finish among its descendants, and its effort is their sum. **Summary dates are an output of the recalculation** and are never read back into it."
- FR-7 (line 391): the tree grid shows derived start and finish per WP; FR-7 line 393: Baseline comparison as columns.
- FR-16 (line 538): any two Baseline versions compared WP-by-WP.

The spine leaves four questions open, and they are not independent:

1. `schedule_run.inputs` is **leaf-only** (line 459: "Per leaf WP: …"), carrying `parent_id` but no summary rows and no names. A leaf's `parent_id` does not give you the parent's `parent_id`, so the tree is not reconstructible from `inputs` above one level. Either `outputs` carries the roll-up (and then `inputs` must carry the hierarchy, or the roll-up is not re-derivable and **FR-15's re-derivation test silently does not cover summary rows**), or the roll-up is computed at read time by the tree grid — in which case a summary date is a derived date produced outside `domain/schedule`, which is precisely what AD-25 exists to make impossible.
2. `outputs` (line 459) says "the per-WP result" without saying which WPs.
3. `wp_schedule` is keyed `(tenant_id, project_id, wp_id, …)` with `float_days`, `is_critical` and `state` — none of which is meaningful for a summary.
4. The ER diagram line 620 asserts `WORK_PACKAGE ||--|| WP_SCHEDULE`, a **mandatory** one-to-one, which is false for a Project with no Project start (FR-43: "FR-6b does not run") and for a leaf in FR-6b's "not schedulable yet" block. A story author will turn that into a NOT NULL join.
5. `baseline_wp` is leaf-only (AD-11 line 231, AD-26 line 462), so FR-7's Baseline-comparison columns have no Baseline row on a summary line.

Decide: the roll-up runs in `domain/schedule` as part of the passes, `schedule_run.inputs` carries the full WP hierarchy (not only leaves), `outputs` carries a row per WP with the summary fields null where they do not apply, `wp_schedule` is optional per WP, and `baseline_wp` follows the same shape. That is one paragraph and it closes five divergence points.

#### H3. `baseline_wp`'s column set contradicts itself across AD-11 and AD-26, and AD-30 ships the shorter one (lines 231, 462, 513; consequence in AD-4 line 111)

- AD-11 line 231: `setBaseline` copies "per leaf WP **the derived dates, the effort, the assigned Resources, the milestone flag, the Catch-all flag and the Rate-derived cost**."
- AD-26 line 462: "`baseline_wp` keeps **only** the cost projection PV, BAC and Divergence read — `start`, `finish`, `baseline_mh`, `is_milestone`, `is_catch_all`."
- AD-30 line 513 implements AD-26: the migration "**rewrites** … `baseline_wp` down to AD-26's cost projection."

The two lists are not the same list. AD-26's drops the assigned Resources and the Rate-derived cost. That breaks two other rules:

- AD-4 line 111 requires "a BAC split across Resources" allocated by largest remainder. With no Resources on `baseline_wp` and nothing pinning `work_package.assigned_resource_ids` (a mutable column, class `mutable_audited`), the split has no pinned input — the same C2 defect in a different place.
- Money. `baseline_mh` is milli-hours. AD-10's bitemporal Rate lookup can recompute cost, but AD-11 says the Rate-derived cost is *copied* at Baseline time, and the existing `baseline_wp` in `packages/db/src/schema.ts` carries `baselineMh` and no cost. Whether BAC in JPY is a stored copy or a recompute against `rate_seq_max` is now stated two ways.

Pick one list, put it in AD-26 (the newer AD), and delete the other from AD-11. Note the existing table also has no `is_catch_all`, so AD-30's migration *adds* that column while claiming only to trim.

#### H4. The scheduler has no operational or observability envelope at all (AD-19 lines 359–360, 364; conventions line 537)

The rubric asks specifically: does a failed or slow recalculation have an alert, a log key, a metric? No, no and no.

- **Operator metrics** (line 359) are "snapshot success rate, snapshot age, queue depth, invariant violations". Nothing about recalculation.
- **Alarms** (line 360) are five: snapshot failure rate, the AD-7 post-commit invariant, the AD-6 adapter-kind mismatch, worker heartbeat loss, RDS storage and CPU. Nothing about recalculation.
- **Log keys** (line 537) are `tenantId`, `connectorId`, `jobId`, `useCase`. There is **no `projectId` and no `schedule_run.seq`** — so a slow or failing recalculation cannot even be correlated to a Project in CloudWatch. (`projectId` is an opaque id, not customer data, so NFR-O1 and NFR-S6 do not block it; it simply was not decided.)

Concretely missing:

1. **NFR-P1's 300 ms p95 for a 500-WP recalculation is unobservable in production.** AD-27 line 475 asserts "At 500 WPs and 300 ms p95 that is acceptable; **should a measured run exceed it**, the first lever is the granularity of the ingest lock" — measured by what? There is no timing metric, no histogram, no alarm. A performance lever with no trigger is a wish. This is also the one number in the slice with a real chance of being wrong, because the recalculation now runs *inside the edit's transaction* holding a per-Project exclusive lock.
2. **A halted recalculation is invisible to the operator.** AD-27 line 477 and AD-29 line 505: outside the calendar range the run halts, writes nothing, and `wp_schedule.stale = true`. The PM is shown it; the operator is not. Every Project in a Tenant can be sitting stale for a month with no signal, and extending the range is explicitly *an operator action* — the one person who cannot see that it is needed. This wants a metric (count of Projects with `stale = true`, and max staleness age) and an alarm.
3. **`schedule_run` growth is unmonitored** despite AD-26 line 465 flagging the size as an `[ASSUMPTION]` to be measured, and despite the retention cadence being deferred (M9). The spine sizes the row and then provides no way to see the table.
4. **Lock contention has no envelope.** AD-27 line 475 states the consequence — "a snapshot ingest for the same Project waits behind a PM edit" — and then decides nothing about it: no `lock_timeout`, no `statement_timeout`, no metric on lock wait, and no behaviour for a server action that blocks. AD-7's ingest `retryLimit: 3` with "backoff sized so every attempt finishes inside one snapshot interval" now has a second way to burn its attempts.

AD-19's title is "The operational envelope is decided, not implied." For the scheduler it is neither decided, deferred, nor an open question — it is absent. Add a `schedule` block to AD-19: metrics (recalculation duration p50/p95 by Project size bucket, runs per hour, halted runs, stale Projects and max staleness age, `schedule_run` bytes per Project), one alarm (halted recalculation, and p95 over budget), and `projectId` + `scheduleRunSeq` in the log key list at line 537. Add the NFR-P1 recalculation budget to AD-19's CI gate list as a benchmark gate, since it is the one NFR the slice can actually violate.

#### H5. `engine_version` has none of `formulaVersion`'s discipline (AD-26 line 458 vs AD-10 line 224)

`engine_version` appears exactly once in the document: as a column in `schedule_run`. Compare AD-10 line 224 for its sibling: "`formulaVersion` is a registry key. Changing any formula adds a new version, the old one stays executable, and a CI test recomputes golden Published Snapshots for every registered version." AD-19's CI gate list (line 364) runs "the golden Published Snapshot recompute **for every registered `formulaVersion`**" and, separately, "the re-derivation test that runs `recalculate(run.inputs)` against `run.outputs` for every golden Baseline and Published Snapshot" — with no mention of engine versions.

So the first correction to the forward pass, the float calculation or the out-of-sequence rule changes `recalculate`, and every stored run's `outputs` stops reproducing. FR-15's re-derivation test and FR-35's reproduction test both go red against real Baselines, and the pressure will be to edit the goldens. This is the same defect the spine anticipated and solved for formulas, left unsolved one AD later.

Give `engine_version` the identical rule in AD-26: registry key, old versions stay executable, `recalculate(run.inputs, run.engine_version)`, and a CI gate over every registered engine version. It costs three lines now and a migration of history later.

#### H6. `is_leaf` carries the whole declarative leaf-only story and nothing maintains it (AD-25 lines 446, 448)

AD-25's best argument is that leaf-only enforcement is structural rather than remembered:

- line 446: `CHECK (is_leaf OR (duration_days IS NULL AND constraint_type = 'asap' AND …))` — "Giving a leaf WP a child therefore fails at the database unless the same edit resolves where its inputs go."
- line 448: `work_package` carries `UNIQUE (tenant_id, project_id, id, is_leaf)`; `wp_dependency` carries `pred_is_leaf`/`succ_is_leaf` with composite FKs into it — "**no trigger, and no invariant that only runs when someone remembers to call it**."

Both rest on `is_leaf` being true. `is_leaf` is a denormalisation of `parent_id` across rows (`packages/db/src/schema.ts` already has it as a plain `boolean NOT NULL`), and **nothing in the spine says who sets it, when, or what keeps it in agreement with parentage**. If `app/plan` is trusted to flip it in the same statement that adds a child, then the mechanism is a code convention wearing a constraint's clothes — the exact substitution AD-25 line 443 rejects when it demotes the A-3 grep test to "a cheap second net, not the mechanism."

Decide the maintenance rule: a trigger on `work_package` parentage that recomputes the parent's `is_leaf` (and then the composite FK genuinely fires), or a deferred constraint, or a generated column. Name it in AD-25 and register the trigger in AD-21's generated SQL, or the two prettiest constraints in the slice enforce nothing.

---

### MEDIUM

#### M1. AD-27 reinterprets FR-6a unilaterally and does not log it as an Open Question (line 477)

> "There is exactly one path to FR-6a's 'last good schedule marked stale': a new Holiday Calendar version whose range no longer covers the plan … **Reading those two PRD sentences any other way produces a plan the PM cannot repair, so this is the reading the build follows.**"

FR-6a (prd.md line 350) attaches stale to graph-rule violation: "A Plan that violates one is never scheduled: the recalculation stops, names the offending edges, and shows the last good schedule marked stale." AD-27 line 476 instead rolls the offending edit back, so the state FR-6a describes never exists. The engineering argument is good and is probably right. But the spine's own header (line 28) says "**it adds no FR, no NFR and no target beyond PRD §5**", and the resolution discipline established in `resolution.md` is that where a fix would change PRD scope, the spine leaves the PRD's reading and adds a `NEEDS FOUNDER DECISION`. This one changes what FR-6a says and does not. Add it to Open Questions alongside the four decisions already parked there.

#### M2. `wp_schedule.stale` is not derivable from the run AD-25 says it projects (lines 443, 477)

AD-25: `wp_schedule` is "a projection of the latest `schedule_run`, **rebuildable from it**", class `derived`, and AD-21 defines `derived` as a "rebuildable index of append-only truth". AD-27 line 477 then writes `stale = true` when a recalculation **halts and writes no run**. Staleness is a fact about the *absence* of a run; rebuilding `wp_schedule` from the latest `schedule_run` loses it, and a rebuild would silently present a stale schedule as current. Either `stale` moves onto `project` (a `mutable_audited` flag with its own writer), or the halt itself is recorded as an append-only row — a `schedule_run` with `outputs = null` and a halt reason, which is more consistent with AD-26 and gives FR-28 and the operator a referent.

#### M3. Two pinned representations of the non-working-day set survived the amendment (AD-10 lines 215, 219; AD-21 line 397; AD-29 lines 501, 503)

AD-29 line 503 is emphatic: "The **version** is what `schedule_run.inputs` and `ComputationInputs` pin", and line 506 withdraws AD-11's duplicate copy with the reasoning "two copies of one pinned set is how two builders diverge." But `ComputationInputs` still lists `calendar_seq_max` (line 215) *and* "the calendar id and version" (line 219), and AD-21 line 397 still lists `calendar_day_event` among "the event tables that make AD-10's closure rule true … Each is `append_only` with a `seq` pinned in `ComputationInputs`."

So for the *non-schedule* compute that also needs working days — `periodOf`, the PV spread across a Baseline window (AD-4 line 111, and `plannedValue` in `packages/domain/src/evm.ts` today), FR-30's EVM — it is undecided whether the non-working-day set comes from `calendar_day_event` at `calendar_seq_max` or from the resolved `holiday_calendar_version`. Two builders will pick differently, and the two sets differ: the version merges the national tables, `calendar_day_event` holds only the PM's own days. Given AD-15 line 277 says `domain/calendar` "takes the non-working-day set as an argument", the argument's provenance is the whole decision and it is now stated twice, differently. Withdraw `calendar_seq_max` from `ComputationInputs` and demote `calendar_day_event` in AD-21 to "audit and version-build input, not a pinned compute input", matching AD-29.

#### M4. AD-27's call-site test needs an allowlist the spine does not provide (line 472–473)

"A *call-site* test enumerates the callers of `recalculate` and fails on any caller outside **that list**." The list in AD-27 is stated in terms of *input kinds* ("a duration; a dependency added, removed or re-lagged; …"), not use-case names. A test needs names. The translation from ten input kinds to N use-case identifiers is left to a builder, in the AD whose title is "the trigger set is closed, and **both ends of it are tested**." Two builders will produce two allowlists, and the test will be adjusted to whatever the code does — which is the failure mode this AD exists to prevent. Name the use cases: `plan.setDuration`, `plan.addDependency`, `plan.createWp`, `plan.moveWp`, `plan.deleteWp`, `plan.setActualDates`, `plan.setRecordedPct`, `schedule.setProjectDates`, `calendar.createVersion`, `import.confirmImport` — or say the allowlist lives in one exported constant that both the test and `app/schedule` read.

#### M5. `compareWp` is underspecified in the two places a WBS code actually ties (AD-28 line 485)

"It compares `wbs_code` segment by segment — each dot-separated segment as an integer where it parses as one, otherwise through `domain/text.compareNfkc` — and falls back to `wp_id` where the codes are equal or absent."

Two undefined cases, both common in real Japanese WBS files:

- **A numeric segment against a non-numeric one** — `1.2` vs `1.A`. Which sorts first? The rule says integer-where-it-parses, which is a property of each operand, not of the comparison.
- **Unequal depth** — `1.2` vs `1.2.1`. Is the shorter a prefix that sorts first, or does an absent segment compare as something?

AD-28 is the AD whose entire job is to close OQ-13 so that "a critical path that compares equal on one machine and not on another, years after anyone remembers why" cannot happen. Two lines fix it: a non-numeric segment always sorts after a numeric one; a prefix sorts before its extensions. The shuffled-input determinism test (line 494) will not catch either gap, because shuffling the *input order* does not change the comparator's behaviour on a fixed pair — it only catches reliance on iteration order. Add a comparator unit test with the mixed and unequal-depth pairs as explicit cases.

#### M6. Deferred line 721 invites a cut the rest of the spine cannot survive

> "**Taking §8.3's first cut costs no migration.** If `bmad-sprint-planning` drops the two extra constraint types, `constraint_type` narrows to the one accepted value `asap`, the violation path in `outputs` goes unused and the columns stay. The cut is a scope decision, not a schema decision."

It is not available. AD-25 line 450: "**A milestone has no date column.** It is a leaf with `duration_days = 0` and `is_milestone`, and its target is a `must_finish_on` constraint." PRD §3 line 191 and FR-9's milestone-import exception (prd.md line 435) say the same. Drop `must_finish_on` and every milestone in the product loses its target date, FR-31's two milestone Health rules (prd.md lines 812, 814) have nothing to fire on, and FR-9's one deliberate auto-constraint has nowhere to write. This is exactly the rubric question — "could anything under Deferred let two units diverge?" — and here the Deferred section contradicts an AD. Narrow the sentence to `must_start_on` only, or delete it.

#### M7. The per-edit write cost the addendum asked the architecture to size is not sized (AD-26 line 465, AD-27 line 475)

Addendum A.5 (last bullet) hands this to the architect by name: "**The write amplification of restamping up to 500 date rows per edit is an architecture concern to size**, not a requirement to renegotiate." AD-26 sizes *storage* ("about 25 KB per run … a few hundred KB per Project" for an editing day) and AD-27 asserts the *latency* without sizing it. Neither sizes the write: a single duration edit now performs, inside one transaction under a per-Project exclusive lock, a ~25 KB jsonb insert plus up to 500 `wp_schedule` writes, inside NFR-P1's 500 ms p75 / 1 s p95 plan-edit budget of which the recalculation itself claims 300 ms p95.

Also note the storage estimate assumes a quiet editing day. A PM typing durations down a 500-WP imported plan generates one run per edit; at 25 KB that is ~12 MB for the pass, per Project, before retention runs. AD-26's own lever ("dropping `outputs` for unreferenced runs") conflicts with AD-5 line 125 ("A retained run is never partially deleted"). Worth one sentence resolving which wins.

#### M8. Planned effort has no decided home and no pin (AD-25 line 445, AD-30 line 513, AD-11 line 235)

`planned_mh` appears **zero times** in the 744-line spine, though it exists in `packages/db/src/schema.ts` and AD-5 line 128 lists "effort" among the Current Plan's mutable inputs. AD-25's enumeration of `work_package`'s scheduling input columns does not include it; AD-30's migration neither adds nor drops it; `schedule_run.inputs` does not carry it; `ComputationInputs` does not pin it; and AD-11 line 235 reads it from the mutable table for Divergence (C2). Decide: effort is not a scheduling input (correct — R0 excludes effort-driven scheduling), so it does not belong in `schedule_run.inputs`; but FR-16's WP-by-WP Baseline comparison and FR-28's Divergence read it, so it needs either an event table under AD-21's rule or an explicit statement that effort Divergence is computed against `baseline_wp.baseline_mh` and the *live* plan only, is never part of a Published Snapshot, and is excluded from the closure test by name.

#### M9. `schedule_run` retention cadence hides inside a deferral that does not mention it (Deferred line 729, AD-5 line 125)

"**Compaction schedule only** (FR-19, 90 days to daily). What compaction may and may not delete is now AD-5, not a deferral." AD-5 line 125 then folds `schedule_run` deletion into that same compaction job. So the cadence at which runs are reclaimed is deferred, by a line that names only FR-19 (ticket observations) and only "90 days to daily". At 90 days, with M7's numbers, runs accumulate well past AD-26's estimate. Say explicitly that the deferral covers `schedule_run` retention cadence too, and give it a floor.

---

### LOW

#### L1. AD-13 line 259 compresses FR-9 and loses its guard

"An import writes scheduling inputs and actual dates, never a derived date (FR-9, FR-11, AD-25). An imported start/finish pair becomes a duration, or reference Custom Fields where a duration column was mapped; an imported milestone target becomes a `must_finish_on` constraint."

It keeps the milestone exception and drops the rule the exception is an exception *to*: FR-9 (prd.md line 428) — "**Imported dates are never turned into constraints automatically.** A plan of three hundred *must start on* constraints is a typed schedule wearing a different hat." That is an architectural invariant, not a UI detail: it is the last route by which typed dates could re-enter a scheduler-owned plan, which is the whole point of AD-25. One clause restores it.

#### L2. The ER diagram overstates `wp_schedule` (line 620)

`WORK_PACKAGE ||--|| WP_SCHEDULE : derived_dates` is a mandatory 1:1. A Project with no Project start never runs FR-6b (FR-43), and a leaf in the "not schedulable yet" block has no dates. Should be `||--o|`. Folded into H2, but worth fixing on its own because diagrams become DDL.

#### L3. The Capability map omits the new ADs from the FR-28/FR-29 row (line 705)

"FR-28, FR-29 Reconciliation Review, Dispositions | `app/review`, `disposition_event` | AD-10, AD-22, AD-14". FR-28's date-movement-with-cause is AD-26's diff-of-two-runs (line 464), and its referent is AD-25's `wp_schedule`/`schedule_run`. Add AD-25 and AD-26.

#### L4. `wp_dependency.type` says "the only value R0 accepts" without saying what enforces it (AD-25 line 447, Deferred line 720)

"`type` is a closed enum whose only value R0 accepts is `FS`; `SS | FF | SF` are reserved so the column never has to change" / "values the R0 writer rejects". Every neighbouring rule in AD-25 is declarative (`CHECK`, composite FK, `UNIQUE`) and argues explicitly that declarative beats convention. This one is a code check by implication. Either add a `CHECK (type = 'FS')` that a later migration widens, or say plainly that this one is a code-level guard and why.

#### L5. The new ADs argue where the old ones decided

The slice has drifted from decisions toward justification, and it is noticeable precisely because AD-1 … AD-24 do not. Examples: AD-26's Prevents ("the doctrine breach this whole change exists to close"); AD-27's "the failure the founder named"; AD-28's "Naming one of several drivers and hiding the rest is how a PM spends a morning chasing the wrong link"; AD-30's "The exemption is written down here so that it is spent once"; AD-27's "Reading those two PRD sentences any other way …". Each is one sentence and each is defensible — collectively they are the reason the six new ADs are the longest in the document. The rationale belongs in `reviews/resolution.md`, which already exists for exactly this.

---

## What is right, and should not be traded away in the fixes

Stated because the fixes above touch these ADs and it would be easy to weaken them:

- **AD-25's structural single writer.** "A module that does not own the schedule has no column to write" is strictly stronger than the sprint change proposal's A-3 grep test, and AD-25 correctly demotes the grep to a second net. This is the best decision in the slice.
- **AD-26's identity of the two tests.** `recalculate(run.inputs) === run.outputs` serving FR-15 and FR-35 as one function means the re-derivation test cannot pass for the wrong reason by reading the Current Plan. Pinning by reference to an append-only row rather than by a second copy is the right call and AD-29 line 506 correctly propagates it by withdrawing AD-11's duplicate.
- **AD-27's two-direction testing.** The observation that Addendum A.5's reachability test alone cannot close the set — "the snapshot path never calls the function; it changes an input the function reads" — is the sharpest reasoning in the document, and the structural answer (`recorded_pct` alone in `inputs`, plus a forbidden import edge) is a mechanism rather than a rule.
- **AD-28 as the answer to OQ-13**, including "a WBS code orders; it never identifies" and recording *all* tied driving predecessors rather than one.
- **AD-30's honesty about the repository gap** (line 515): naming the missing event tables and RLS as an outstanding build item, rather than letting the 17-table demo schema read as the target.
- **AD-21 line 405** — "This is why derived dates left `work_package`" — is the sentence that makes the table-class registry do real work. C2 is a failure to apply it consistently, not a flaw in it.
