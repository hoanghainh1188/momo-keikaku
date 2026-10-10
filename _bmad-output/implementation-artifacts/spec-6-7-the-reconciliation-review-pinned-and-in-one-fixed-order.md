---
title: '6.7 — The Reconciliation Review, pinned and in one fixed order'
type: 'feature'
created: '2026-10-10'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: 'd3efabb2166abdb1fdb0341143d8329c2798a852'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** EVM, Health, Forecast, Unplanned, Divergence, and Progress pieces already compute and mostly render on `/review`, but Thursday's teirei still lacks a report-shaped assembly: Contract Type beside Unplanned, stale-snapshot header *Refresh now*, drillable Unplanned Ticket money, Comfort print hiding chrome, and a durable split pin so Tracker figures do not drift while the PM works the page (FR-28, UX-DR15 Core, AR-20).

**Approach:** Lock the fixed report order and required section markup on the existing Review page; finish the missing chrome (Contract beside Unplanned, >24h amber header banner + *Refresh now*, Unmapped expand with hours+money, pragmatic Ticket/WP drills, A4-landscape print CSS, narrow Disposition rail drawer); persist Tracker freeze on Review open (**Q1→C**), defer write-side PM/`schedule_run_seq` re-capture to 6.9; do not own seven causes (6.8) or Disposition write semantics (6.9).

## Boundaries & Constraints

**Always:**
- Fixed render order: Header → Status → **Unplanned Work** → Ahead/Behind → Progress & Dates → Effort & Cost → Forecast, with Disposition rail at the right (UX-DR15 **Core**). Unplanned sits directly after Status.
- Each section opens with title + 1px ink rule as **required markup** (`Section` / `h2.section-title` + `hr.section-rule`) — keep, do not restyle away.
- Review is for one Reporting Period, pinned to a Tracker Snapshot whose time is shown; surface EVM Metrics, Health Indicators, Divergence by WP, mapping coverage, and Unplanned Work's three components (FR-28).
- Contract Type is shown **next to Unplanned Work** (not only in the header meta line) (FR-28).
- **Q2→B (pragmatic drills):** keep Story 6.3 formula popover drills; add money + Ticket/WP links on Unmapped expand and Unplanned component rows; link Divergence WP rows; do not retrofit every Status/Forecast numeral (FR-28, UX-DR17).
- Unmapped Work: grouped by Tracker attribute, expandable to Tickets with hours and **money in PM views**.
- Snapshot >24h old → pin amber (existing) **and** Review header banner offers *Refresh now* (UX-DR23, FR-35). Newer-than-pin stays "Re-pin", never silent figure change.
- Comfort print: A4-landscape stylesheet reproduces report pages; sidebar, top bar, and Disposition rail do not print (UX-DR30).
- **Q1→C (hybrid split pin):** persist Tracker-side freeze (snapshot/ledger pin) on first Review open; Re-pin is explicit. Write-side re-capture of PM watermarks and `schedule_run_seq` is **deferred to Story 6.9** (AR-20 partial this story).
- NFR-P1: keep proving Review compute path via existing `tests/load-fixture-nfr.test.ts` (`getProjectReview`); full RSC+network page-load harness stays deferred (founder 5.15 decision 2A / deferred-work) — do not claim page-load met.
- Continuity from 6.1–6.6: keep FormulaMetricCell popovers, dual finishes, Health disclosure, Accept Observed % — do not regress.
- **Token:** Keep full spec (Harry override of 1600-token band).
- Sprint: `6-7-the-reconciliation-review-pinned-and-in-one-fixed-order` → `in-progress` when impl starts; leave `6-8`/`6-9` backlog.

**Never:**
- Seven date-moved causes, Data Date advance consequence copy, or cause grouping (6.8).
- Own `recordDisposition` / disposition_event Ticket-list semantics / Map·Plan·CR·Explain writer path (6.9) — may call existing stub actions but do not rewrite Disposition rules.
- Implement write-side PM/`schedule_run_seq` re-capture in this story (Q1→C defers that to 6.9).
- Rewrite EVM / Health / Forecast math or bump `FORMULA_VERSION` unless an unavoidable pin-shape change forces it (prefer not).
- Silently re-pin Tracker snapshot when a newer one appears.
- Hand-edit generated `sql/*.sql` except via drizzle generate when Q1→C requires a real migration.
- Epic 3 / 7 / 8; edit `epics.md`; invent Publish / Client View.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fixed order | Review loads with Baseline | Sections in Header→Status→Unplanned→Ahead/Behind→Progress & Dates→Effort & Cost→Forecast + rail right | N/A |
| Contract beside Unplanned | `project.contractType` set | Contract Type visible in Unplanned heading/meta (not header-only) | N/A |
| Stale snapshot banner | Pin age >24h | Header banner + *Refresh now*; pin chip already amber | Refresh uses existing snapshot refresh action |
| Fresh snapshot | Age ≤24h | No stale Review header banner | N/A |
| Unmapped expand | Group with Tickets | Expand shows key/title/status/hours/**money** (Internal); Ticket/hours link to Mapping | Zero money → show 0 / em-dash per present helpers |
| Unplanned component drill | Component row with hours | Number links to Tickets/WPs behind that component (Q2→B) | Empty contribution → no fake link |
| Divergence WP link | Divergence row | WP code/name links to Plan WP (Q2→B) | Missing WP id → plain text |
| Print | Print media | Sheet prints A4 landscape; shell sidebar, top bar, Disposition rail hidden | Comfort — missing polish ≠ blocker |
| Narrow viewport | width &lt; ~1280px | Disposition rail becomes drawer (Plan exceptions pattern), not only buried below fold | Counts stay reachable via toggle |
| Split pin freeze (Q1→C) | Open Review + later Tracker ingest | Tracker-side snapshot/ledger stay at Review pin for Review life | Re-pin is explicit |
| Split pin re-capture | Successful PM write in this Review | **Deferred to 6.9** — this story does not re-capture PM watermarks / `schedule_run_seq` | N/A this story |

</frozen-after-approval>

## Code Map

- `apps/web/src/app/p/[projectId]/review/page.tsx` — assemble chrome: Contract beside Unplanned; stale header banner; keep section order (~205 Status → ~356 Unplanned → Ahead/Behind → Progress → Effort → Forecast → rail); wire drill links per Q2.
- `apps/web/src/components/ui.tsx` (`Section`) — **reuse** title + `section-rule`; do not replace with card chrome.
- `apps/web/src/components/unmapped-group-rows.tsx` — add money (Internal) on Ticket rows; link Ticket keys / hours to Mapping or Ticket targets already used elsewhere.
- `apps/web/src/components/disposition-rail.tsx` + `apps/web/src/app/globals.css` (`.layout-review`, `.rail`) — narrow drawer patterned on Plan exceptions rail (`plan-tree-grid` drawer); print `@media print` hide shell/topbar/rail, A4 landscape sheet.
- `apps/web/src/components/snapshot-pin.tsx` + `apps/web/src/app/p/[projectId]/snapshot-actions.ts` — **reuse** Refresh now / Re-pin; Review banner calls same refresh action; do not invent a second refresh path.
- `apps/web/src/components/review-pin-context.tsx` — today client-only snapshot id for Re-pin compare; extend only if Q1 needs server-backed pin id plumbing.
- `packages/db/src/repo.ts` (`loadBundleInTenant`, `loadReview`) — today re-captures head every load under `lockWatermarkShared`; Q1 A/C require freeze/re-pin load path + optional session table; Q1 B leave loader as-is.
- `packages/domain/src/review.ts` / `computation-inputs.ts` — **consume** `ReviewResult` (unplanned.components, coverage, divergence, health, forecast); no formula rewrite.
- `packages/domain/src/present` — money/hours formatting for Unmapped Ticket money column.
- `packages/i18n/src/messages/{en,ja}.json` — Contract-beside-Unplanned, stale banner, print-adjacent, drawer toggle, drill link labels; key-set parity (JA Review labels may stay English per repo convention).
- `tests/load-fixture-nfr.test.ts` — keep green; do not claim full page-load NFR-P1.
- `apps/web/.../review/*presence*.test.ts` — add source/`data-testid` guards for order, Contract placement, stale banner, print CSS markers, Unmapped money.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `6-7-…` → `in-progress` at impl start.
- Out of scope files: cause derivation, `recordDisposition` package, Epic 7 export layouts.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/.../review/page.tsx` — Contract beside Unplanned; stale >24h header banner + Refresh; Q2 drill links; preserve fixed order + Section markup.
- [x] `apps/web/src/components/unmapped-group-rows.tsx` — hours + money on expanded Tickets; link numbers/rows to Tickets/WPs.
- [x] `apps/web/src/components/disposition-rail.tsx` + `globals.css` — narrow drawer; A4-landscape print hide chrome.
- [x] Split pin **Q1→C** — persist Tracker freeze on Review open (db/app + Re-pin explicit); append deferred-work for write-side PM/`schedule_run_seq` re-capture → 6.9.
- [x] `packages/i18n` EN/JA — new keys; parity test green.
- [x] Presence/unit tests for matrix rows that do not need Postgres; keep `load-fixture-nfr` green when DB available.
- [x] `sprint-status.yaml` — `6-7-…` → `in-progress` at impl start.

**Acceptance Criteria:**
- Given the Review opens, when it renders, then it is one Reporting Period pinned to a Tracker Snapshot (time shown) and shows EVM, Health, Divergence by WP, mapping coverage, and Unplanned's three components (FR-28).
- Given page order, when it renders, then order is Header, Status, Unplanned Work, Ahead/Behind, Progress & Dates, Effort & Cost, Forecast with Disposition rail at the right (UX-DR15 Core).
- Given each section, when it renders, then title + 1px ink rule markup is present (UX-DR15 Core).
- Given the Review pin (Q1→C), when Review opens, then Tracker-side snapshot/ledger stay frozen for Review life and Re-pin is explicit; write-side PM watermark + `schedule_run_seq` re-capture is deferred to Story 6.9 (AR-20 partial).
- Given Unmapped Work, when expanded, then Tickets show hours and money (PM) and in-scope numbers link to Tickets/WPs (FR-28, UX-DR17, Q2).
- Given Contract Type, when Unplanned renders, then Contract Type appears next to it (FR-28).
- Given snapshot age >24h, when Review renders, then header banner offers *Refresh now* and pin is amber (UX-DR23).
- Given print, when printed, then A4-landscape sheet prints without sidebar/top bar/Disposition rail (UX-DR30 Comfort).

## Implementation Notes

- Q1→C Tracker freeze: `resolveTrackerPins` / `captureReviewTrackerPin` in `packages/db`; `loadBundleInTenant` accepts optional `trackerPin` (omit 4th arg when null). RSC reads cookie only; `ReviewPinRegistrar` persists via `ensureReviewTrackerPinAction` with the loaded pin (rewrites when freeze was invalid). Re-pin clears + loads live + writes in the action path. No new DB table this story.
- Write-side PM/`schedule_run_seq` re-capture deferred — appended to `deferred-work.md` for Story 6.9.
- Chrome: Contract Type beside Unplanned; stale >24h header banner + `ReviewRefreshNowForm` (same `refreshSnapshotAction`); Unmapped expand money + Mapping links; component hour drills; Divergence WP → Plan; Disposition drawer below 1280px; `@media print` A4 landscape hides topbar/sidebar/rail.
- Verified: `pnpm exec tsc -b`, `pnpm lint`, presence/pin/review/i18n + composition read/fence tests; load-fixture NFR skipped without Postgres.
- Review patch round: RSC cookie write → Server Action; freeze must cover connectors; Refresh/Re-pin honor `ok`; concrete Unmapped `jpy`; composition `tenantId:` fence avoided on wrapped loaders.

## Spec Change Log

- 2026-10-10 review: Tasks & Acceptance pin AC still described full AR-20 write-side re-capture; amended that AC line to match frozen Q1→C (freeze on open; write-side → 6.9). KEEP: all Q1→C cookie/action freeze implementation and Review chrome.

## Review Triage Log

- blind: AC still required write-side re-capture under Q1→C — **medium** → patch (AC rewritten to frozen Q1→C; Spec Change Log)
- blind: cookie `set` during RSC load — **high** → patch (persist via `ensureReviewTrackerPinAction` from `ReviewPinRegistrar`)
- blind: freeze valid without covering current connectors — **medium** → patch (`freezeCoversConnectors`)
- blind: Contract Type is caption under Unplanned not heading — **false** — FR-28 “next to Unplanned Work”; `unplanned-contract-type` sits in Unplanned section
- blind: drills are page-level `/mapping`/`/plan` — **false** — frozen Q2→B pragmatic; not exhaustive deep-links
- blind: no unit tests for cookie codec — **medium** → defer (helper covered in db; cookie jar needs Next request)
- blind: drawer missing a11y/Escape/`rail--drawer-open` CSS — **low** → rejected (toggle + matchMedia enough for everyday; Comfort polish)
- blind: Refresh ignores `ok: false` — **medium** → patch (alert on failure)
- blind: empty Spec Change Log / Triage — **false** — process; filled this pass
- blind: Re-pin refreshes even when action fails — **medium** → patch (refresh only on `ok`)
- blind: print verified only by source strings — **false** — same presence pattern as Story 6.6 finish-dates
- blind: cookie omits `Secure` / unbounded project map — **low** → defer (`Secure` needs HTTPS-aware flag; session-scoped growth acceptable for R0)
- edge: invalid freeze silently tracks live — **medium** → patch (client ensure rewrites loaded pin after open)
- edge: freeze omits connector — **medium** → patch (same cover check)
- edge: freeze maps wrong connector’s snapshot — **medium** → patch (connector ownership check)
- edge: Divergence `?wp=` unused on Plan — **medium** → defer (Plan focus not in 6.7; Q2→B allows Plan link)
- edge: Refresh failure silent — **medium** → patch (same as blind Refresh)
- edge: Re-pin fail still refresh — **medium** → patch (same as blind Re-pin)
- edge: Invalid Date pin age → NaN skips banner — **low** → rejected (anchor/observedAt from DB ISO; not everyday)
- edge: narrow drawer flash before matchMedia — **low** → rejected
- edge: pin chip amber uses live age while banner uses freeze — **medium** → defer (chip is shell live freshness; banner is Review freeze age — dual signal)
- edge: claim freeze drifts after invalid cookie — **medium** → patch (ensure rewrite)
- vgap: freeze never tested beyond pure helper — **medium** → defer (no Postgres; extend when DB harness available; resolve tests strengthened)
- vgap: presence suite is source-text only — **false** — intentional fence style matching 6.6; not broken-verification for this repo
- vgap: Unmapped `jpy` asserted as `any BigInt` — **medium** → patch (concrete `costOf` amount)
- vgap other: composition arity / `tenantId:` fence red — **high** → patch (omit 4th arg when null; no `tenantId:` annotations on wrappers)

## Design Notes

- **Order already matches.** Do not reshuffle sections; assembly work is chrome + pin + print + Contract placement + drills.
- **Split-pin tension.** Epics AC + oq12 put split pin on 6.7; epic-6-context and 6.1/6.2 Never lists park write re-capture on 6.9. Q1 resolves ownership before code.
- **NFR-P1 honesty.** Server `getProjectReview` harness stays; end-to-end page-load remains deferred-work from 5.15 — do not mark NFR-P1 page-load done.
- **Continuity from 6.6:** dual finishes / Status Q1→A stay; this story does not reopen forecast math.

## Verification

**Commands:**
- `pnpm exec tsc -b` — exit 0
- `pnpm test` (targeted review/i18n/nfr as applicable) — matrix + goldens green
- `pnpm lint` — exit 0 when runnable

**Manual checks (if no CLI):**
- Scroll Review: fixed order + ink rules; Contract beside Unplanned
- Age pin >24h (or force): header *Refresh now*
- Expand Unmapped: money + links
- Print preview: no shell/rail; landscape sheet
- Narrow: Disposition drawer reachable
