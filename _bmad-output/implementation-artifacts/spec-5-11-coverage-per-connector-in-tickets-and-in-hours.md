---
title: 'Story 5.11 — Coverage, per Connector, in Tickets and in hours'
type: 'feature'
created: '2026-10-07'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '46114e826779d0caeb1dd99aec38479a7a5922fd'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Coverage today is Project-wide, treats Catch-all as mapped, never returns hour share as unavailable in Ticket-Count Mode, and the Scope Ledger Bar is a static image — so a PM cannot see per-Connector mapped / Catch-all / unmapped shares in Tickets and in hours, nor filter the list from the bar (FR-23, UX-DR18/26, SM-5, AD-8).

**Approach:** Compute coverage in domain per owning Connector with separate Ticket-share and hour-share figures (mapped excluding Catch-all, Catch-all, Unmapped), using `{ kind: 'value' | 'unavailable' }` for hour share on count-basis Connectors; extend the Scope Ledger Bar on Mapping › Coverage with segment filter, hours/Ticket toggle, adjacent text, and "Show as table"; keep Review working via the same component or a read-only variant. Report SM-5's mapped-excluding-Catch-all hour share against the 80% target from Project start, unavailable before day 14.

**Decisions (agent, recorded — not user-visible):**
- Pure domain coverage (extend `review` / sibling pure fn); web presents only. No schedule import of attribution (cruiser fence holds).
- Reuse `ratio` / `share` / `unavailable` / `present` — never render unavailable hour share as `0`.
- Domain returns segment keys + metric results; every new string goes through next-intl (en + ja).
- No migration: read current `wp.isCatchAll` / `is_catch_all` (5.12 owns flag history).
- Mapping uses per-Connector coverage (+ Project total rollup). Review's Unplanned Scope Ledger stays hours FR-20 buckets; Connectors page deferred.

**Decisions (Harry, 2026-10-07):**
- Q1→**A**: Mapping › Coverage only — one interactive bar (+ table) per Connector, plus a Project total; Connectors page Scope Ledger deferred.
- Q2→**A**: Ticket share = three buckets (mapped / Catch-all / Unmapped); hours bar keeps FR-20 five-segment anatomy; toggle switches basis, not segment set.
- Q3→**A** + **unavailable until day 14**: SM-5 window starts at Project start; mapped-excluding-Catch-all hour share vs ≥80% is `unavailable` before day 14 (never shown as 0).
- Q4→**A**: segment filter loads all Tickets in that bucket (paged), not only the top-60-by-hours list.
- Q5→**A**: read current `is_catch_all` only; do not add `wp_flag_event` / seq (5.12).
- Q6→**A**: left-scope Tickets and Opening Balances stay out of the shares; 5.13 owns "nothing silently excluded".
- Spec size ~2,300 tokens accepted (**Keep full spec**).

## Boundaries & Constraints

**Always:** Ticket share and hour share are separate and never blended; hours and counts never summed (AD-8); attribution stays query-time (AD-9); keyboard path for every pointer action on the bar; Opening Balances stay outside the bar as today; left-scope Tickets out of shares.

**Never:** pre-empt 5.12 (`wp_flag_event` / `wp_flag_seq_max`); schedule writes or recalculation; computing coverage in the web layer; showing count-basis or pre-day-14 SM-5 hour share as 0; Connectors-page coverage UI; 5.13 exclusion captions.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Hours Connector | Tickets mapped / Catch-all / unmapped with hours | Ticket share: 3 buckets; hours bar: FR-20 segments; both shares `value` | N/A |
| Ticket-Count Connector | Basis latched `count` | Ticket share computes; hour share `unavailable` with reason; UI never shows `0h` | Present reason via presenters |
| Empty Connector | No in-scope Tickets | Shares `ZERO` / empty bar; no filterable rows | N/A |
| Segment activate | Click or arrows on a segment | Paged Tickets list = all Tickets in that bucket for the Connector | N/A |
| Toggle basis | Hours ↔ Ticket share | Bar widths/captions switch basis; Ticket mode shows 3 buckets, hours mode shows FR-20 | N/A |
| Show as table | Toggle on | Table of same figures; adjacent text still present | N/A |
| SM-5 before day 14 | Project age < 14 days from start | SM-5 hour share `unavailable` | Never render as 0 |
| SM-5 after day 14 | Project age ≥ 14 days | Mapped-excluding-Catch-all hour share vs ≥80% target | N/A |
| Catch-all WP | Ticket head → `isCatchAll` WP | Counts in Catch-all bucket, not mapped | N/A |
| Project total | ≥1 Connector | Rollup bar/table beside per-Connector figures | Count-basis hours stay unavailable in rollup |

</frozen-after-approval>

## Code Map

- `packages/domain/src/review.ts:379–407,205` — Project-wide FR-23 coverage (mapped **includes** Catch-all); `scopeLedger` five FR-20 hour segments. Add per-Connector coverage + Project total: Ticket/hour shares with mapped **excluding** Catch-all; hour share / SM-5 as `RatioMetric` / `unavailable`.
- `packages/domain/src/attribution.ts:20–36,211–241` — reuse `catchAllMh` / overflow / `unmappedMh` / mapped baselined|non-baselined; Catch-all via `wp.isCatchAll`; Opening Balances already outside bar.
- `packages/domain/src/basis.ts` + `units.ts:107–152` + `present/index.ts` (`share`, `present`) — AD-8 latch and never-as-0 presenters.
- `packages/db` Ticket `owner_connector_id` (`schema.ts` ~1048); measurement basis per Connector; Project start for SM-5 window — group at review/mapping load (domain stays pure: pass connector id / start date on inputs).
- `packages/app/src/use-cases/get-project-mapping.ts` — extend DTO for per-Connector coverage + Project total; paged Tickets-by-bucket (segment filter), keep top-60 only as the unfiltered default if still useful.
- `apps/web/src/components/scope-ledger-bar.tsx` — static `role="img"`; extend to interactive segments (buttons, arrows), hours/Ticket toggle, adjacent text, "Show as table"; Review (`review/page.tsx` ~235–244) keeps working (props or read-only mode).
- `apps/web/src/app/p/[projectId]/mapping/page.tsx:33–46` — Coverage section; wire per-Connector + Project total bars and filtered Tickets list.
- `packages/i18n/src/messages/{en,ja}.json` `mapping.ledger` / `coverage_*` — new strings both catalogs; fix ja still-EN ledger copy where touched.
- Do not change: schedule engine; 5.9 DnD; 5.10 rules; 5.12 flag events; Connectors page; Epic 2 reachability (`domain/schedule` ↛ attribution).

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain` — per-Connector + Project-total coverage (3-bucket Ticket share; FR-20 hour segments; Catch-all excluded from mapped; count-basis + pre-day-14 SM-5 hour `unavailable`); unit tests for I/O matrix.
- [x] `packages/app` `get-project-mapping` (+ ports/load as needed) — expose per-Connector coverage + Project total; paged Tickets-by-bucket for segment filter.
- [x] `apps/web` `scope-ledger-bar` + Mapping Coverage — interactive bar, toggles, table, adjacent text; Review compatibility; no Connectors-page work.
- [x] `packages/i18n` en+ja — coverage / ledger / SM-5 / unavailable strings.
- [x] `tests/` + `sprint-status.yaml` — domain + mapping coverage cases; fence still green; story → in-progress/review.

**Acceptance Criteria:**
- Given a Connector, when coverage is shown on Mapping › Coverage, then mapped / Catch-all / unmapped Ticket shares and separate hour figures are reported, with a Project total (FR-23).
- Given a count-basis Connector, when hour share is requested, then it is `unavailable` with reason and never shown as 0 (AD-8).
- Given the Scope Ledger Bar on Mapping › Coverage, when rendered, then each segment filters the paged Tickets list for that bucket, arrows move between segments, and hours/Ticket toggle switches basis (UX-DR18).
- Given the bar, when accessibility is checked, then "Show as table" exists and figures appear in adjacent text (UX-DR26, NFR-U1).
- Given a Project younger than 14 days from start, when SM-5 is read, then it is `unavailable`; on or after day 14, mapped-excluding-Catch-all hour share is reported against ≥80% (SM-5).
- Given any coverage path, when it runs, then no schedule date is written, `domain/schedule` does not import attribution, and 5.12 flag history is untouched.

## Implementation Notes

- 2026-10-07: Harry chose **Keep full spec** at the token gate (~2,300 tokens > 1,600).
- 2026-10-07: Harry accepted recommended answers Q1–Q6 (A / A / A+unavailable / A / A / A). Open Questions cleared.
- 2026-10-07: Matrix audit — extracted `apps/web/src/lib/mapping-coverage-model.ts` (+ tests) so Toggle basis / Show as table / Segment paging rows are covered by unit tests (repo has no React component test runtime).
- 2026-10-07: Review patches applied (`4c7d010`); Catch-all overflow Ticket membership deferred; ScopeLedgerBar Review test renamed to `*.test.ts` so vitest include picks it up.

## Spec Change Log

## Review Triage Log

- `medium` → patch — `ticketBucket` maps missing WP id to Catch-all while `hourBucketForTicket` maps it to Unmapped (`coverage.ts:157–176`); Ticket-share and hour-share disagree for orphan WP ids.
- `medium` → defer — Catch-all overflow Ticket filter is approximate (all Catch-all Tickets when any overflow hours exist); attribution has no per-Ticket overflow split. Intentional until a later story can split membership.
- `medium` → patch — Domain hard-codes English `HOUR_SEGMENT_LABELS` / `TICKET_BUCKET_LABELS` into segment `label` fields; frozen agent decision requires keys + next-intl.
- `medium` → patch — Filtered-list heading interpolates raw `activeSegment` key (`mapping-coverage.tsx`), not a localized bucket label.
- `false` — Interactive bar “drops under-bar legend”: frozen/UX-DR26 require adjacent text + Show as table; Review keeps the legend via `readOnly`.
- `low` → patch — `buckets_footnote` still says “four buckets” while Coverage hours mode shows five FR-20 segments.
- `false` — `ja.json` `mapping.coverage_summary` still English: legacy key unused; UI uses `coverage_summary_v2` / `coverage_summary_count_basis`.
- `false` — Client-side page over shipped `allTickets` satisfies Q4 “paged”; server re-query was not required by frozen intent.
- `low` → rejected — Connector `role="tablist"` without tabpanel: everyday harm low; full tabs pattern is more than a direct fix.
- `medium` → patch — `ownerConnectorId` defaults to first Connector when the ownership map misses a Ticket (`get-project-mapping.ts:145–168`), so a Connector filter can list Tickets `computeCoverage` did not count there.
- `false` — Spec `in-review` vs sprint `review`: process labels during this step, not a product defect.
- `medium` → patch (verification-gap) — DB `loadReview` never asserts `connectorsForCoverage` / `projectStart` / `perConnector`; deleting the wiring still greens existing tests.
- `medium` → patch (verification-gap) — No test exercises hours-basis / `catch-all-overflow` filter with `inCatchAllOverflow: true`.
- `medium` → patch (verification-gap) — No test pins Review `ScopeLedgerBar` default `readOnly` static path after the rewrite.
- `medium` → patch (verification-gap) — `toTicketRows` left-scope exclusion from `allTickets` untested in `projection-reads`.
- `medium` → patch — Show-as-table uses raw `segments` (includes zero-width buckets) while the bar uses `display` (`scope-ledger-bar.tsx`).
- `low` → patch — Show-as-table checkbox remains checkable while hour share is unavailable, but no table renders.
- `false` — `projectAgeDays` unbounded loop on non-ISO `asOf`: production `asOf` is always `projectDate(...)` IsoDate; unreachable without a type lie.
