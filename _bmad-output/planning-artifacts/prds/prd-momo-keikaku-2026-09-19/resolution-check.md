---
title: Resolution check — revised PRD vs review and reconcile findings
created: 2026-09-19
inputs: review-adversarial.md, review-rubric.md, reconcile-brief.md, reconcile-research.md, reconcile-pmi-references.md
targets: prd.md, addendum.md (revised 2026-09-19 23:42)
founder decisions applied: autofix all; Client Views show effort hours only (no money); R0 (founder-only, 2026-12-15) / R1 (client, Q1 2027) / Post-Q1 split; OQ-2 deferred as a pre-architecture check
---

# Resolution Check

Classes: **RESOLVED** (the revised PRD fixes it; location cited) · **PARTIAL** (the main issue is fixed, but something named remains) · **UNRESOLVED** (not addressed) · **SUPERSEDED** (made moot or deliberately settled by a founder decision).

## Summary

| Source | Findings | RESOLVED | PARTIAL | UNRESOLVED | SUPERSEDED |
|---|---|---|---|---|---|
| review-adversarial | 48 | 19 | 26 | 1 | 2 |
| review-rubric | 35 | 22 | 7 | 5 | 1 |
| reconcile-research | 10 | 5 | 5 | 0 | 0 |
| reconcile-brief | 16 | 9 | 4 | 2 | 1 |
| reconcile-pmi-references | 11 | 4 | 4 | 3 | 0 |
| **Total** | **120** | **59** | **46** | **11** | **4** |

The reviews overlap. For example, adversarial H6, rubric DN3 and PMI G-1 are the same Ticket-Count Mode issue. Each finding is still classified separately, and the table cross-references the overlaps.

New problems introduced by the revision: **16** (§ New problems below).

---

## 1. review-adversarial.md

| ID | Finding | Class | Evidence | What remains / fix |
|---|---|---|---|---|
| C1 | *Map* does not move already-recorded hours | RESOLVED | FR-21 "Attribution follows the current Mapping"; FR-29 *Map*; published figures frozen (FR-21, FR-35) | — (the UJ-4 number now contradicts this; see N1) |
| C2 | AC includes Unmapped but PV/EV exclude it; roll-up, TCPI and EAC effects | PARTIAL | FR-30 "Unplanned Work in EVM" (Unplanned line PV=EV=0, two CPIs); TCPI "Baseline budget exhausted" | Not stated which CPI the Typical EAC (BAC/CPI) uses. Add "Typical EAC uses all-in CPI". No client-facing sentence says unplanned work carries effort but no earned value; add it to FR-34. |
| C3 | EV depends on Ticket count | PARTIAL | FR-30 max(Baseline, mapped estimate) denominator, 99% cap, "low evidence" flag, reopen flag | Undefined: a leaf WP with 0 Mapped Tickets (count basis gives 0/0); mixed estimated and unestimated Tickets; live vs Baseline-time estimates. Add: 0 Tickets → 0% with "no evidence" flag; any unestimated Ticket → count basis, or give it the WP's average estimate; estimates read live, and EV changes are flagged. |
| C4 | No Ticket lifecycle rules; FR-25 invariant cannot hold | RESOLVED | FR-42 (Opening Balance, left scope, internal ID, one owner, restated invariant); FR-13 unattributed | — (the Opening Balance trigger is too broad; see N3) |
| C5 | Money layer leaks cost rates to the client | SUPERSEDED | Decision: effort only in Client Views (FR-34 "Never shown: money, Rates", §7.2, §13, addendum D) | — |
| C6 | Scope does not fit one founder by Q1 2027 | PARTIAL | §8.1–§8.3 R0/R1/Post-Q1, R0 gate, FR tags | No per-item time estimate. R1 has no gate date (only "Q1 2027"). R0 is still larger than proposed (WP editing, Gantt, Custom Fields, re-import diff, two sign-in methods). Add a week estimate per R0 item and an R1 start date (for example 2027-01-18). |
| H1 | *Plan* and Catch-all launder Unmapped into green | RESOLVED | Glossary *Unplanned Work*; FR-24; FR-29 "Indicator colour"; FR-28 three components | — |
| H2 | PM percent-complete override is an unbounded EV dial | PARTIAL | FR-30 override needs a reason, is audited and marked "PM-adjusted"; NFR-A1; SM-C4 | Not stated that the "PM-adjusted" marker reaches Client Viewers when EVM detail is hidden (FR-34 default). Add: "the marker is always shown to Client Viewers and no Visibility Policy setting can hide it". |
| H3 | Published Snapshot not reproducible | PARTIAL | FR-35 stores values, Tracker Snapshot, Baseline version, attribution, policy, overrides | Missing from the manifest: Health thresholds, EAC method, Reporting Period boundaries and time zone, formula version. Threshold and EAC-method changes are not in NFR-A1. Add these, plus a test: "recomputing from the manifest reproduces every figure". |
| H4 | Period attribution of deltas undefined | PARTIAL | FR-25 "Period: the timestamp of its later snapshot" | No time zone (JST or ICT). Add to the Glossary *Reporting Period*: "in the Project's time zone, default JST". |
| H5 | Mapping Rule semantics undefined | PARTIAL | FR-22 live rules, manual wins, preview; FR-5 disables rules on WP delete | Rule-driven Mapping flips are not logged as Mapping changes, and a flip into Unmapped is not surfaced in the Review. No behaviour for rule delete or priority ties. Add these to FR-22 and NFR-A1. |
| H6 | Ticket-Count Mode undefined at Project level | PARTIAL | FR-27 (PV/EV/SV/SPI kept; AC metrics unavailable; mixed Projects) | FR-31 Unplanned threshold is still "share of total hours". Count-mode Effort/Cost state and overall status are undefined. Add to FR-27: count share uses the same thresholds; Effort/Cost shows "unavailable"; overall = worst of the available indicators. |
| H7 | Tracker credentials are full-access | RESOLVED | FR-17 bot user, client approval, rotation; FR-18 OAuth read-only; NFR-S5 Connector permissions | — |
| H8 | AI import sends client WBS to a third party; no bar | RESOLVED | FR-9 deterministic R0 plus a 10-file corpus; FR-41 Post-Q1 with Tenant opt-in; §7.2 no AI in R0/R1 | — (FR-41 cites the wrong NFR; see N7) |
| H9 | Program/Department roll-up maths unspecified | PARTIAL | FR-30 ratios recomputed; FR-33 Department = capacity, no CPI; FR-13 Unassigned line | The FR-33 description promises "planned and actual effort" by Department, but the consequences give actual only, and multi-assignee Baseline allocation is undefined. No mixed-EAC-method marker, and no exclusion rule for count-mode Projects in Program EVM. Post-Q1, so it can wait, but the text should be fixed. |
| H10 | "Why Now" contradicts the delivery date | RESOLVED | §1.1 "absence claim is short-lived… due for re-check 2026-12-01" | — |
| H11 | OQ-2 is a gate | SUPERSEDED | Decision: deferred as a pre-architecture check (OQ-2 "Resolve by: before bmad-architecture") | Optional: add hours *fill rate* (≥70%) to the OQ-2 wording. |
| H12 | Catch-all in EVM undefined | PARTIAL | FR-24 Level of Effort (EV = PV) with budget, overflow → Unplanned | SM-5 does not exclude Catch-all hours from "mapped". Add "excluding Catch-all WPs" to SM-5. (Bucket overlap: see N4.) |
| H13 | Review not pinned to a snapshot | RESOLVED | FR-28 pinned; Glossary *Reconciliation Review*; FR-35 stores the Tracker Snapshot | — |
| H14 | Publish lifecycle too thin | PARTIAL | FR-35 supersede with reason; retraction with reason; history kept | Retraction does not notify Client Viewers who already opened the snapshot. It is also unclear whether the superseded version stays visible to clients with a marker. Add both. |
| H15 | Negative deltas and Rate recompute break money | PARTIAL | FR-12 retroactive Rate → appended adjusting entries; FR-25 negative entries | A negative delta is costed at the Rate "when the hour was recorded" (the correction time), so money does not net out. Add: "negative deltas are costed at the Resource and Rate of the Ticket's most recent positive entries (LIFO)". |
| M1 | Cumulative vs per-period undefined | PARTIAL | FR-30 "All metrics are cumulative… change within the Period" | The basis of the Unplanned Work share in FR-31 (period or cumulative) is not stated. Declare it in FR-31. |
| M2 | PV spread underspecified | RESOLVED | FR-30 PV linear over baseline working days; FR-14 combined calendar | — |
| M3 | BAC and Baseline cost undefined | PARTIAL | Glossary *BAC* | Baseline cost for WPs with several Resources or none is undefined. Add: "assigned share × hours × Rate at Baseline date; unassigned → Project default Rate". |
| M4 | Re-import WP identity and conflicts | RESOLVED | FR-11 matching, conflicts, unmatched pairs | — |
| M5 | Source of actual dates | RESOLVED | FR-5 "Actual dates" | — |
| M6 | Dispositions persist forever | PARTIAL | FR-29 "new hours since disposition"; SM-7 | Group Dispositions do not snapshot their membership, so new Tickets that join an attribute group inherit an old note. Add: "a group Disposition applies to the Tickets in the group when it was recorded". |
| M7 | "Resolved" undefined | RESOLVED | Glossary *Resolved* | — |
| M8 | Rates visible and editable across the Tenant | PARTIAL | FR-2 Rates visible only to Tenant Admin and the PMs of Projects that use them | FR-12 still lets any PM create or edit Resources and Rates that feed other PMs' Projects. Restrict Rate editing to Tenant Admin in FR-12. |
| M9 | Client invitations are an exfiltration path | PARTIAL | FR-2 domain allowlist, Admin notified; NFR-A1 invitations | Not stated: notification emails carry no figures; magic links are single-use, short-lived and bound to the email address. Add these to FR-36 and FR-3. |
| M10 | Audit trail misses number-moving actions | PARTIAL | NFR-A1 list expanded | Missing: Health-threshold changes, EAC-method changes, imports and re-imports, Explain note edits. Add them. |
| M11 | Untrusted Tracker and Excel content | PARTIAL | FR-10 untrusted cells; FR-38 formula injection | Ticket titles and Tracker attributes are not required to be escaped on display. No upload size or entry limits (zip bomb). Add NFR-S8 "output encoding for all Tracker content; upload size and entry limits". |
| M12 | SPI meaningless late in a Project | PARTIAL | FR-31 "Late in a project" shows SV and forecast finish | Display only. Nothing can turn Schedule amber or red on its own. Add: "Schedule is at least amber when any Milestone is past its Baseline date and not done". |
| M13 | Forecast method undefined | RESOLVED | FR-32 formula and EAC link | — (the formula has an edge-case defect; see N5) |
| M14 | Raw export cannot rebuild the numbers | PARTIAL | FR-39 list plus a recompute consequence | The list lacks what the consequence needs: Ticket status and estimate history per snapshot, overrides, Rate tables, thresholds, Published Snapshot manifests. Add them to FR-39. |
| M15 | No data lifecycle or operator access | PARTIAL | NFR-D1, NFR-S7, NFR-S6 | No retention or compaction rule for Tracker Snapshots. Add "compact to daily after 90 days; the ledger is kept". |
| M16 | Program under Department; PM assignment | PARTIAL | FR-1 Admin assigns PMs | Program is still "under a Department" (Glossary), and nothing requires a Project's Program to belong to its owning Department. Make Program a Tenant-level grouping, or add that constraint. |
| M17 | No data minimisation | RESOLVED | FR-19 "Stored fields"; NFR-S6 | — |
| M18 | Untestable ACs | PARTIAL | FR-9 corpus; FR-7 → NFR-P1 | Post-Q1 items are still untestable: the FR-41 confidence marker has no threshold, and FR-38 template binding has no test corpus. |
| L1 | FR-26 → FR-37 wrong reference | RESOLVED | FR-26 → FR-34 | — |
| L2 | Threshold boundaries overlap | RESOLVED | FR-31 table | — |
| L3 | NFR-P1 narrow (p75 only) | UNRESOLVED | NFR-P1 unchanged apart from the Gantt | Add p95 targets and "a full snapshot of 2,000 Tickets processed in ≤ 5 min". |
| L4 | Coverage mixes Tickets and hours | RESOLVED | UJ-2 "87% of hours"; FR-23 | — |
| L5 | SM-1 sample of one | PARTIAL | SM-1 caveat accepted | No non-founder measurement. Optionally, log one non-founder PM after R1. |
| L6 | Currency change after data | RESOLVED | FR-4 "Currency" | — |
| L7 | Client viewing tracked without disclosure | RESOLVED | FR-36 disclosure | — |
| L8 | Rules targeting a deleted WP | RESOLVED | FR-5 | — |
| L9 | Working title and loose glossary | PARTIAL | Glossary *Unmapped Work* plus FR-25 | Line 9 still says "*Working title — confirm.*". Confirm the title or move it to the Decision Log. |

## 2. review-rubric.md

| ID | Finding | Class | Evidence | What remains / fix |
|---|---|---|---|---|
| D1 | Scope-vs-window trade-off unstated | RESOLVED | §0, §1.1, §8.1 gate | (per-item estimates: see C6) |
| D2 | OQ-2 answerable now | SUPERSEDED | Deferred by decision (OQ-2) | — |
| D3 | No fallback if the contract-type test fails | PARTIAL | §6 "Contract politics" risk; effort-only Client View | No decision rule for a bad OQ-3 result. Add to §6: "if the first 請負 client objects, keep inclusion in health but default the Unplanned hours figure to off for 請負 Projects". |
| S1 | UJ-5 is a sketch | UNRESOLVED | UJ-5 has no entry state or edge case | Add an entry state and an edge case (a Resource's home Department changed mid-month). |
| SC1 | Metrics stop at user zero | RESOLVED | SM-8 demand signal | — |
| SC2 | Forecast absent from the client view | RESOLVED | FR-34 optional "forecast" | — (see N13 for the Vision wording) |
| DN1 | Do *Map*/*Plan* move recorded hours? | RESOLVED | FR-21, FR-29 | — |
| DN2 | First-snapshot opening balance, deletions, sub-tasks | RESOLVED | FR-42; FR-18 own time spent | — (see N3) |
| DN3 | Ticket-Count SPI has no data source; indicator states | PARTIAL | FR-27 | Indicator and overall-status rules for count and mixed Projects are missing (same as H6). |
| DN4 | AI import has no acceptance bar | RESOLVED | FR-9 corpus; AI deferred (FR-41) | — |
| DN5 | Milestones undefined | RESOLVED | Glossary *Milestone*; FR-5 flag | — |
| DN6 | Forecast method unspecified | RESOLVED | FR-32 | — (see N5) |
| DN7 | Health rule gaps | PARTIAL | FR-31 worst-of, half-open table | Window for the Unplanned share (period or project-to-date) is not stated (same as M1). |
| DN8 | Rule re-evaluation semantics | PARTIAL | FR-22 | Rule delete, and logging of rule-driven flips, are missing (same as H5). |
| DN9 | Sticky Dispositions hide new hours | RESOLVED | FR-29; SM-7 | — |
| DN10 | Department roll-up cannot reconcile unlinked hours | RESOLVED | FR-13 Unassigned line; FR-33 totals | — |
| DN11 | "Resolved" undefined | RESOLVED | Glossary | — |
| DN12 | Re-import identity rule | RESOLVED | FR-11 | — |
| DN13 | FR-7 → NFR-P1 did not cover the Gantt | RESOLVED | NFR-P1 includes tree/Gantt | — |
| DN14 | Remaining adjectives (FR-1, FR-8, NFR-I1) | UNRESOLVED | FR-1 "keeps its history", FR-8 "no fixed limit", NFR-I1 "sort correctly" unchanged | Name what is preserved. Set a tested ceiling (for example 100 Custom Fields). Define the sort order. |
| DN15 | Notification channel unspecified (FR-17) | UNRESOLVED | FR-17 "the PM is notified" | State in-app and email. |
| SH1 | Confirmed assumptions still read as open | RESOLVED | §13 Decision Log; no `[ASSUMPTION]` tags left | — |
| SH2 | Data lifecycle and personal data silent | RESOLVED | NFR-D1, NFR-S6 | — |
| SH3 | OQs not ranked by what they block | RESOLVED | §12 "Resolve by" per OQ | (see N15 for missing owners) |
| DU1 | Broken cross-references | RESOLVED | FR-26, FR-7 | — |
| DU2 | Glossary gaps | PARTIAL | Milestone and BAC added | Still missing: Percent Complete, Risk/Issue, Project default Rate, Change Request candidate, Client View. |
| DU3 | UJ-2 and UJ-5 lack the standard frame | UNRESOLVED | UJ-2 has no Persona + context; UJ-5 has no Entry or Edge | Complete both frames. |
| DU4 | Mapping Rule attribute list drift | RESOLVED | Glossary no longer lists attributes | — |
| SF1 | No journey for bringing a client in | UNRESOLVED | UJ-4 starts after the invitation | Add UJ-6 (or a UJ-3 edge case): invite → allowed domain → first sign-in → first Visibility Policy review. |
| MN1 | Assumptions index roundtrip | RESOLVED | §13 replaces the index | — |
| MN2 | Working title / status draft | PARTIAL | Line 9 unchanged | Same as L9. |
| MN3 | Glossary drift | PARTIAL | "Unmapped Hours" fixed | "client view" (UJ-3 step 4) vs "Client View"; "health" used loosely (UJ-3 climax, FR-34). Normalise both. |
| MN4 | ID continuity | RESOLVED | FR-41 and FR-42 appended; IDs unique | — |
| MN5 | R7 → "risk register owner" | RESOLVED | §11 R7 → OQ-7 | — |
| MN6 | Catch-all Baseline hours | RESOLVED | FR-24 | — |

## 3. reconcile-research.md

| ID | Finding | Class | Evidence | What remains / fix |
|---|---|---|---|---|
| G1 | Backlog gating tied to the "Standard" plan | PARTIAL | FR-17 hours detected from data; addendum A.2 | OQ-2 does not ask which post-2027-01-01 plan each target space will be on. An answer given before architecture can flip on 2027-01-01. Add that to OQ-2, and re-run the detection after 2027-01-01. |
| G2 | Tempo and Jellyfish overturn checks dropped | PARTIAL | OQ-7 fourth bullet | OQ-7 has no "Resolve by", and §11 R1 does not note "medium confidence pending OQ-7". Add "before public positioning (R1)" and the confidence note. |
| G3 | Staleness date presented as a wedge window | RESOLVED | §1.1 last bullet | — |
| G4 | Inferred-demand caveat missing | RESOLVED | §6 first risk; SM-8 | — |
| G5 | Backlash overstated; switcher OQ | PARTIAL | OQ-9 added | §1.1 still attributes "users already build spreadsheet and script workarounds" to R2. That comes from the brief, and the research shows only backlash. Change the citation to the brief. |
| G6 | Framing attributed to R1 | RESOLVED | §7.1 cites cross-insight 5 | — |
| G7 | Unsupported claims (Jooto, Flagxs, 2.3×) | PARTIAL | Jooto "(from the brief)"; 2.3× reworded | Flagxs in §2.2 is still uncited. Add "(brief)". |
| G8 | R6 battlecard facts stale | PARTIAL | OQ-7 re-verify Jira Plans; §11 R6 note | BigPicture Enterprise having baselines is not recorded. Add it to OQ-7. |
| G9 | VN offshore tracker question dropped | RESOLVED | OQ-9 | — |
| G10 | R7 has no owner or cadence | RESOLVED | OQ-7 owner and dates; §6 "Thin moat" | — |

## 4. reconcile-brief.md

| ID | Finding | Class | Evidence | What remains / fix |
|---|---|---|---|---|
| G1 | "Demand is inferred" risk dropped | RESOLVED | §6; SM-8 | — |
| G2 | Client defaults wider than the brief's decided table | PARTIAL | FR-34: EVM detail now off by default | Unplanned hours and Explain notes are still shown by default, yet §4.11 says "defaults follow the rules decided in the brief". Either make the hours figure and notes opt-in, or record the deviation in §13 with a reason (UJ-4 depends on it). |
| G3 | Risk can never reach the client or the export | RESOLVED | FR-37 client-visible items; FR-34; FR-38 includes Risks | — (see N2 for the release tag) |
| G4 | Forecast missing from the client view and export | PARTIAL | FR-34 optional forecast; FR-32 includes Unplanned | FR-38 export contents still omit the forecast. Add "forecast". |
| G5 | "Works from day one" dropped | RESOLVED | §1; FR-42 Opening Balance; UJ-2 step 2 | — |
| G6 | No differentiation section | RESOLVED | §1.2; §6 "Thin moat" | — |
| G7 | Lychee Redmine missing | RESOLVED | OQ-1; §6 | — |
| G8 | Client company holidays weakened | RESOLVED | FR-14 Project-specific non-working days | — |
| G9 | No risk register; scope additions not weighed | PARTIAL | §6 Risks; §8 split moves several additions to Post-Q1 | R0 additions beyond the brief are not marked or put into the cut order: full Custom Fields, raw export (FR-39), the re-import diff, two sign-in methods. Add raw export and Google sign-in to the cut list. |
| G10 | Overtime and fixed-date fact dropped | RESOLVED | Addendum B "Practice facts" | — |
| G11 | Next-wave detail thinned | UNRESOLVED | Addendum C unchanged on these points | Restore: forecast "from baseline slip history" with driver contents; heatmap "including unmapped hours"; Custom Fields "mappable to tracker fields"; the lead magnet. |
| G12 | Business-model nuance dropped | PARTIAL | §1 "learns from the past… estimates finally right" | Rework attribution, and "willingness to pay grows as data accumulates", are missing. Add them to §1 or §4.13. |
| G13 | Project Online market facts dropped | UNRESOLVED | Addendum D names vendors only | Add: desktop/.mpp is unaffected; SRI Project+ ¥100k–200k/mo to 2031; the Flagxs campaign to 2026-10-31. |
| G14 | Jira narrowed to Cloud | SUPERSEDED | §13 "Jira is Cloud only and Post-Q1" | — |
| G15 | "User training" stall factor | RESOLVED | Addendum B single-session onboarding; §2.1 offshore team | — |
| G16 | Spreadsheets/scripts and TeamSpirit dropped | RESOLVED | §1.1; §1.2 | — (the citation is wrong; see research G5) |

## 5. reconcile-pmi-references.md

| ID | Finding | Class | Evidence | What remains / fix |
|---|---|---|---|---|
| G-1 | FR-27 count-based SPI | PARTIAL | FR-27 baseline-hours PV/EV/SPI | The count-share threshold for the Unplanned indicator is missing (same as H6). |
| G-2 | FR-32 bypasses the EAC method | RESOLVED | FR-32 "EAC from the selected method"; heuristic label; FR-31 SPI→1 note | — (see N5) |
| G-3 | Roll-up rules; Department mixes axes | RESOLVED | FR-30 roll-up; FR-33 Department capacity only | — |
| G-4 | TCPI > 1.1 rationale; exhausted budget | PARTIAL | FR-31 rationale corrected; exhausted = red | The TCPI 1.1 threshold is not in the "configurable per Tenant" table. Add a TCPI row. |
| G-5 | BAC and base quantities undefined | PARTIAL | Glossary BAC; FR-30 PV spread; Unplanned has no PV/EV | Percent Complete and EAC Method are not in the Glossary. |
| G-6 | v2 heuristic only partly applied | RESOLVED | FR-31 overall = worst of three | — |
| G-7 | Percent-complete edge cases | PARTIAL | FR-30 reopen flag, cap, EV = Baseline × % | No-Ticket WP and mixed estimates are undefined (same as C3). |
| G-8 | Money CPI vs hours CPI | RESOLVED | FR-30 "Units"; FR-13 default Rate | — |
| G-9 | Provenance overreach (VAC, ETC) | UNRESOLVED | FR-30 lists ETC and VAC under "Formulas (pmi-techniques v1 and v2, SRS §5)" | Label ETC and VAC as "standard PMBOK, not in docs/references". |
| G-10 | Flawed ETC PM-only | UNRESOLVED | FR-30 table "PM enters ETC" | Record it as an intentional divergence from the SRS (no ask of the offshore team). Post-Q1, low. |
| G-11 | Sign and interpretation text | UNRESOLVED | FR-30 "formula and inputs" only | Add an interpretation line per metric (CV/SV > 0 good; CPI/SPI < 1 over/behind; TCPI > 1 must beat plan). |

---

## New problems introduced by the revision

| # | Location | Problem | Concrete fix |
|---|---|---|---|
| N1 | UJ-3 step 2–3 vs UJ-4 step 3 | UJ-3 has 46h of Unplanned Work *before* Dispositions, and *Map* removes three Tickets' hours "immediately". UJ-4 still shows the client 46h (12%), which contradicts FR-21/FR-29. This is the C1 bug, reintroduced in the narrative. | Give UJ-4 the post-*Map* figure (for example 計画外作業 10% (38h)), or say in UJ-3 that the three mapped Tickets carried 8h. |
| N2 | FR-38 (tagged R0) | The R0 export covers "a Published Snapshot" and "Risks". Published Snapshots (FR-35) and Risks (FR-37) are R1. | Split the tag: "R0: fixed layout of the current PM view (no Risks); R1: Published Snapshot export and Risks; Post-Q1: template". |
| N3 | FR-42 "First sighting" | An Opening Balance is recorded at the first snapshot that sees *any* Ticket, and is excluded from period metrics. A Ticket created after connection that has hours logged before the next snapshot, or a Ticket entering scope later, has its real new hours dropped from the period. That silently hides Unplanned Work, which the product promises never to do. | Limit Opening Balance to Tickets in the Connector's *initial* snapshot (or created before the Connector start date). Any later first sighting records its hours as a normal delta in that period. Scope widening is reported per FR-20. |
| N4 | FR-20 buckets vs FR-24 / FR-30 | "hours mapped to baselined WPs" and "Catch-all hours" overlap for a budgeted Catch-all WP. Overflow hours could be counted both in the Catch-all WP's AC and in FR-30's Unplanned line. It is also unclear how FR-20's per-period identity treats Opening Balances, which period metrics exclude. | Make the four buckets mutually exclusive (baselined non-Catch-all / non-baselined / Catch-all / Unmapped). State that a Catch-all WP's AC is capped at its budget, with overflow only in the Unplanned line. State that FR-20's per-period identity excludes Opening Balances. |
| N5 | FR-32 forecast finish | "as-of + remaining baseline working days ÷ SPI" collapses to the as-of date once as-of ≥ Baseline finish, so a late project forecasts "finishes today". It also differs from the planned-duration ÷ SPI heuristic. It is undefined when SPI = 0 or SPI is unavailable. | Use "Baseline start + (Baseline working-day duration ÷ SPI), never earlier than as-of + 1 working day while EV < BAC". Show "no forecast" when SPI is 0 or unavailable. |
| N6 | Addendum A.2 "spread across the snapshot window" vs FR-25 "Period" | For a window that straddles a period boundary, spreading would split the hours across periods, while FR-25 assigns them all by the later timestamp. | In A.2, say that spreading is used only for approximate person/day displays (FR-26), and that period assignment follows FR-25. |
| N7 | FR-41 → NFR-S6 | NFR-S6 is now "Personal data" (APPI / Decree 13). The no-training and subprocessor terms FR-41 relies on no longer live there. | Point FR-41 to NFR-S5 (subprocessors) and to a new NFR-S8 on AI subprocessor terms, or drop the reference and keep the inline requirement. |
| N8 | Addendum B lines 49 and 51 | These lines use "Unmapped Work" for the client-facing 計画外作業 label. The PRD now uses 計画外作業 for **Unplanned** Work (UJ-4, FR-31). | Replace "Unmapped Work" with "Unplanned Work" in both lines. |
| N9 | Addendum B lines 44 and 50 | The "Tool switches stall on data migration, training, custom fields" fact appears twice. | Merge them into one bullet. |
| N10 | Glossary | Terms used but not defined: *Level of Effort* (Catch-all, FR-24), *teirei* (§2.1, UJ-3, Reporting Period), *unattributed* vs *Unassigned* line (FR-13, FR-33: two words for one bucket). | Add *Level of Effort* and *teirei* (定例). Pick one word for the unattributed bucket and use it in FR-13 and FR-33. |
| N11 | Glossary / FR-24 / FR-30 / FR-31 | Several names for Baseline quantities: "Baseline budget" (Catch-all WP), "Baseline budget exhausted" (Project, i.e. BAC), "Baseline hours", "Baseline planned hours". | Define "Baseline hours" (per WP) and BAC (Project). Rename the TCPI state "BAC exhausted" and the Catch-all's "Baseline hours". |
| N12 | FR-42 "Out of Scope" | "Redmine and Asana Connectors" and "Writing back to Trackers" now sit under FR-42 (Ticket lifecycle) instead of the Connectors feature. | Move them to the end of §4.6 as feature-level Out of Scope, or under FR-17. |
| N13 | §1 Vision paragraph 4 | Says Unplanned Work appears in the client's "health, schedule, EVM and forecast", but FR-34 has EVM detail and forecast off by default. | "…health and schedule by default, and EVM and forecast when the PM turns them on." |
| N14 | FR-29 *Plan* + FR-21 + FR-16 | Because attribution follows the current Mapping and baselined status, a Re-baseline that includes a *Plan* WP moves all of that WP's earlier Unplanned hours into planned-scope AC in every unpublished cumulative view. Cumulative Unplanned Work history disappears (conflicts with SM-C2 and the honesty thesis). | State that "baselined or not" is judged against the Baseline version active when each entry was recorded, so pre-Re-baseline hours stay Unplanned in cumulative views. |
| N15 | §12 OQ-5, OQ-8, OQ-7 | OQ-5 and OQ-8 have no Owner; every other OQ has one. OQ-7 has no "Resolve by". | Add "Owner: founder" to OQ-5 and OQ-8, and a Resolve-by for each OQ-7 sub-item (Tempo/Jellyfish: before public positioning). |
| N16 | Glossary *Tracker Account*; addendum B | The Glossary says a Tracker Account is "linked to a Resource", but FR-13 has unlinked accounts. Addendum B says "every metric should drill down to its Tickets", which could be read as applying to Client Viewers, although FR-34 never exposes Tickets. | Change to "optionally linked". Scope the drill-down in addendum B to PM views. |

Release-tag check: every FR carries a tag. The §8.1 and §8.2 FR lists match the FR tags, except FR-38 (N2). The Post-Q1 list in §8.3 matches FR-6, FR-18, FR-33, FR-41 and the FR-2, FR-4 and FR-30 partial tags.

Cross-reference check: §0 → §11, §8 and §13; §2.2 → §8.3; §4.9 → §7.1; §6 → §8.1, §1.2 and SM-8; FR-7 → NFR-P1; FR-26 → FR-34; FR-11 → FR-5; NFR-S6 → FR-19; §11 R5 → §9. All resolve. The only stale reference is FR-41 → NFR-S6 (N7).

---

## Pass 2 applied (2026-09-19)

The founder approved autofixing everything. The coordinator set these overrides: C6 (no invented estimates; add OQ-10), L5 (left as accepted), L9/MN2 (working title left as is), Brief G2 (the indicator stays in default health; notes are opt-in by nature; logged in §13), and M16 (Program sits inside the owning Department).

| Item | Change |
|---|---|
| Adv C2 | FR-30: every EAC formula uses all-in CPI. FR-34: the Client View states that Unplanned Work carries effort but no earned value. |
| Adv C3 / PMI G-7 | FR-30: the estimate basis applies only when every Mapped Ticket has an estimate, otherwise the count basis. No Mapped Tickets → 0%, flagged "no evidence". Estimates are read live, and EV changes are flagged. |
| Adv C6 | §8.1: "R1 starts only after this gate passes". §8.2 heading "(Q1 2027, after the §8.1 gate)". New OQ-10 Build capacity (owner founder; resolve before `bmad-sprint-planning`). |
| Adv H2 | FR-30: the "PM-adjusted" marker is always shown to Client Viewers, and no Visibility Policy setting can hide it. |
| Adv H3 | FR-35 stores thresholds, EAC Method, period boundaries and time zone, and formula version, plus a reproduction test. NFR-A1 logs threshold and EAC Method changes. |
| Adv H4 | Glossary *Reporting Period*: Project time zone, default JST. |
| Adv H5 / Rubric DN8 | FR-22: strict priority order, preview on delete, delete re-evaluates, rule flips logged, and flips into Unmapped highlighted. NFR-A1 updated. |
| Adv H6 / Rubric DN3 / PMI G-1 | FR-27: the Ticket-count share uses the FR-31 thresholds. Effort/Cost shows "unavailable". Overall status = worst of the available indicators. |
| Adv H9 | FR-33: the description is split by axis. Program EAC sum is marked "mixed methods". Count-mode Projects are excluded and listed. |
| Adv H12 | SM-5 excludes Catch-all WPs. |
| Adv H14 | FR-35: the superseded version stays visible to clients, marked with the reason. A retraction emails the viewers who had opened it. |
| Adv H15 | FR-25: negative deltas are costed at the Resource and Rate of the most recent positive entries. |
| Adv M1 / Rubric DN7 | FR-31: the Unplanned indicator uses the Reporting Period share (excluding Opening Balances), with the cumulative share shown next to it. |
| Adv M3 | Glossary *BAC*: money form, with equal split across assigned Resources and the Project default Rate for unassigned WPs. |
| Adv M6 | FR-29: a group Disposition covers the group's members at the time it was recorded. |
| Adv M8 | FR-2 and FR-12: only a Tenant Admin creates or changes Rates and Project default Rates. |
| Adv M9 | FR-3: magic links are single-use, email-bound, 15-minute default. FR-36: the email holds a link and no figures. |
| Adv M10 | NFR-A1 adds rule-made Mapping changes, Explain edits, Project default Rate, thresholds, EAC Method, and imports/re-imports. |
| Adv M11 | New NFR-S8 Untrusted content (escaping, formula prefixes, upload limits). |
| Adv M12 | FR-31: Milestone slip → Schedule at least amber. The Schedule indicator is now "from SPI and Milestones". |
| Adv M14 | FR-39 adds per-snapshot Ticket status, estimate and hours; overrides; Rate history; threshold and EAC history; Published Snapshot inputs. |
| Adv M15 | FR-19: Tracker Snapshots are compacted to daily after 90 days; the ledger is never compacted. |
| Adv M16 | Glossary *Program* and FR-1: a Program belongs to the Project's owning Department. §13 line added. |
| Adv M18 | FR-41: confidence threshold (Tenant setting) and acceptance corpus. FR-38: template acceptance on 3 real templates. |
| Adv L3 | NFR-P1: p95 targets, and a 2,000-Ticket snapshot within 5 min. |
| Adv L5, L9 / Rubric MN2 | Not changed (coordinator override). |
| Rubric D3 | §6 Contract politics: decision rule added. |
| Rubric S1 | UJ-5: entry state and edge case (Unattributed line). |
| Rubric DN14 | FR-1 names what a Program move preserves. FR-8 has no product limit and is tested at 100. NFR-I1 sorts by code point after NFKC. |
| Rubric DN15 | FR-17: notified in the app and by email. |
| Rubric DU2 | Glossary adds Percent Complete, Risk / Issue, Project default Rate, Change Request candidate and Client View. |
| Rubric DU3 | UJ-2: Persona + context added (UJ-5 fixed under S1). |
| Rubric SF1 | New UJ-6 "Linh brings the client in for the first time" (R1). §4.11 now realizes UJ-6. |
| Rubric MN3 | UJ-3 "Client View"; "health" → "Health Indicators" in UJ-3, §4.11, FR-34 and §7.2. |
| Research G1 | OQ-2 adds hours fill rate, the post-2027 plan, and re-detection after 2027-01-01. |
| Research G2 | OQ-7: per-item Resolve-by. §11 R1: "medium confidence until OQ-7 checks". |
| Research G5 | §1.1: backlash cited to R2; the spreadsheet workarounds cited to the brief. |
| Research G7 | §2.2: Flagxs cited "(brief)". |
| Research G8 | OQ-7: BigPicture Enterprise baselines noted. |
| Brief G2 | FR-34: the indicator (share and hours) is shown by default; Explain notes appear only where attached. §4.11 points to §13. §13 interpretation line added. |
| Brief G4 | FR-38 contents include the forecast. |
| Brief G9 | §8.1 "Beyond the brief" line. §8.3 cut order adds step 4 (Google sign-in) and step 5 (raw export). |
| Brief G11 | Addendum C: forecast from slip history plus driver contents; heatmap includes Unplanned Work; Custom Fields mappable to tracker fields; lead magnet. |
| Brief G12 | §1: rework attribution, estimate accuracy, forecasting from history, willingness to pay grows with data. |
| Brief G13 | Addendum D: Project Online facts (desktop/.mpp unaffected, SRI Project+ pricing to 2031, Flagxs campaign). |
| PMI G-4 | FR-31: TCPI row added to the configurable threshold table. |
| PMI G-5 | Glossary adds Percent Complete and EAC Method (BAC was already there). |
| PMI G-9 | §4.10 and FR-30: ETC and VAC labelled as standard PMBOK, not in `docs/references/`. |
| PMI G-10 | FR-30 Flawed row: PM-only ETC recorded as a deliberate divergence from the SRS. |
| PMI G-11 | FR-30: a one-line interpretation per metric. |
| N1 | UJ-3: *Map* moves 8h, so Unplanned becomes 38h; climax uses 38h. UJ-4: 計画外作業 10% (38h). |
| N2 | FR-38 tag split (R0 PM view / R1 Published Snapshot and Risks / Post-Q1 template). §8.1 and §8.2 FR lists and R1 scope updated. |
| N3 | FR-42: Opening Balance only for the first snapshot or a PM scope change; any other first sighting is a normal delta. Glossary and addendum A.2 aligned. |
| N4 | FR-20: mutually exclusive buckets, Opening Balances reported separately. FR-24: Catch-all AC capped at its Baseline hours, overflow only on the Unplanned line. |
| N5 | FR-32: forecast finish = Baseline start + (Baseline duration ÷ SPI), floored at the next working day while EV < BAC; none when SPI is 0 or unavailable. |
| N6 | Addendum A.2: the whole delta goes to the later snapshot's Period; spreading is for approximate displays only. |
| N7 | FR-41 now cites NFR-S4 and NFR-S5 (subprocessors) instead of NFR-S6. |
| N8 | Addendum B: "Unmapped Work" → "Unplanned Work" for the 計画外作業 label and the framing line. |
| N9 | Addendum B: the duplicate "tool switches stall" bullet merged into the Practice facts. |
| N10 | Glossary adds Level of Effort, Teirei and Unattributed hours. "Unassigned" line → *Unattributed* everywhere (FR-13, FR-33, UJ-5). |
| N11 | Glossary adds *Baseline hours* (per WP) and "non-baselined". "Baseline budget" and "Baseline planned hours" removed. TCPI state renamed "BAC exhausted". |
| N12 | Connector Out of Scope moved from FR-42 to the §4.6 description. |
| N13 | Vision: Health Indicators and schedule by default; EVM and forecast when the PM turns them on. |
| N14 | FR-30 "Baselined status is historical"; FR-29 *Plan* and Glossary *Unplanned Work* aligned. |
| N15 | OQ-5 and OQ-8 get owners; OQ-7 gets per-item Resolve-by. |
| N16 | Glossary *Tracker Account* "optionally linked". Addendum B client drill-down stops at WPs. FR-34 "Never shown" adds Ticket content. |

Re-verification after Pass 2: every FR, NFR, UJ, OQ and SM reference in prd.md and addendum.md resolves to a defined ID. FR IDs are unchanged, and no FR-43+ was needed. FR header tags match the §8.1 (R0), §8.2 (R1) and §8.3 (Post-Q1) lists, including the split FR-38 tag. The Decision Log, the wedge list and all locked decisions are unchanged apart from the two §13 lines the coordinator requested.
