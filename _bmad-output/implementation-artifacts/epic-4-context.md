# Epic 4 Context: A Baseline that can explain itself years later

<!-- Compiled from planning artifacts. Edit freely. Regenerate if planning docs change. -->

## Goal

A PM can set a Baseline from the Current Plan and Re-baseline with a mandatory reason. Every version is kept with author, time and reason. Any two versions compare **as plans, not only as rows**. An automated test re-derives a Baseline's dates, Float, constraint violations and critical path from its pinned inputs alone (FR-15, FR-16, NFR-C1).

## Stories

- Story 4.1: Set a Baseline that points at the run behind it (**next**)
- Story 4.2: The re-derivation test
- Story 4.3: Re-baseline, with a reason and a history
- Story 4.4: Compare two versions as plans, not only as rows
- Story 4.5: Baseline comparison as columns on the Plan grid

## Hard constraints (all stories)

1. **Pin by reference (AR-22 / AD-11 / AD-26)** — `baseline_version.schedule_run_seq` is a real FK; do **not** copy inputs onto the Baseline. `baseline_wp` is the cost projection only.
2. **Refuse incomplete plan (FR-15)** — missing leaf duration or missing Project start → no Baseline; *Set Baseline* disabled with count + exceptions-rail link.
3. **Append-only (AR-9 / AD-5)** — never UPDATE/DELETE `baseline_version` / `baseline_wp`; Re-baseline appends.
4. **Retention-by-reference (AR-11)** — a pinned run's `inputs` cannot be dropped while the Baseline exists.
5. **Re-derivation (4.2)** — codec-canonical compare; read the run, not Current Plan; run under that run's `engine_version`.
6. **Match WPs by `wp_id`** — `wbs_code` sorts only.

## Already on `main`

- Schema: `baseline_version` + `baseline_wp` + FK to `schedule_run` (migration `0000`); both `append-only`.
- `schedule_run` fence + fully resolved inputs (Epic 2 / 2.9).
- Domain retention helper (`packages/domain/src/schedule/retention.ts`).
- `/baselines` shell + Review "No Baseline yet" copy; **no** `setBaseline` writer.
- Seed demo writes **no** Baseline (decision 2-A).

## Does not need

Epic 3 (WBS import), Epic 5–8. Epic 3 paused does **not** block Epic 4.

## Founder defaults for 4.1 entry (2026-10-03)

Recorded on story 4.1 frozen decisions — M-2 stick to current schema columns; CR link deferred to Epic 6 / story 4.3; keep no Baseline seed; catch-all = value-at-set-time; 4.1 and 4.2 stay separate (4.1 ships refuse + retention assertions).
