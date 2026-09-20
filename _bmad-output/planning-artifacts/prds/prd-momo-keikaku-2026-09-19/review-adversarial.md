---
title: Adversarial review — PRD momo-keikaku (2026-09-19 draft)
reviewer-stance: skeptical senior PM + architect, building with a solo founder by Q1 2027
inputs: prd.md, addendum.md (same folder); brief.md for timeline context
not re-litigated: reconciliation wedge, Excel WBS + Backlog beachhead, web/cloud, per-PM-seat pricing, effort-based EVM
---

# Adversarial Review: momo-keikaku PRD

## Verdict

**Not ready for architecture.** The wedge is sharp, but the ledger/mapping/EVM core, which is the one thing this product must get exactly right, has several holes. The PRD's own defaults make the headline flow (UJ-3: "map three Tickets during the review") a no-op. It includes Unmapped Work in AC but not in EV/PV, and never explains why. It lets EV depend on when offshore devs happen to create Tickets. It leaves ledger behaviour undefined for deleted, moved and first-seen Tickets. On top of that, 40 FRs across roughly 15 weeks of solo build is not a plan. It is a wish with a cut list that trims only the small items.

| Severity | Count |
|---|---|
| Critical | 6 |
| High | 15 |
| Medium | 18 |
| Low | 9 |
| **Total** | **48** |

---

## Critical

### C1. The *Map* Disposition does not move the hours it is supposed to move
- **Location:** FR-21 (assumption: "historical actuals are not re-attributed on remap unless the PM chooses 'apply to history'"), FR-25 ("the WP mapped at that time"), FR-29, UJ-3 step 3, SM-7, FR-20.
- **Issue:** Ledger entries are stamped with the WP mapped *when the delta was recorded*. When Linh opens Wednesday's review, this week's Unmapped hours are already on the ledger with WP = null. By FR-21's default, mapping those Tickets now affects only *future* deltas. The 46 Unmapped Hours she is reviewing stay unmapped in the period she is about to publish. So the *Map* Disposition does nothing to the period under review. Either the client sees "46h unplanned" after the PM "mapped" them, or the implementation quietly applies to history, which contradicts the stated assumption. SM-7 ("share of Unmapped hours with a Disposition") would then count as "acted upon" hours whose status never changed.
- **Fix:** Say explicitly that *Map* and *Plan* Dispositions re-attribute ledger entries **for the open (unpublished) Reporting Period** by default, through compensating entries (a reversal from null plus a new entry to the WP), so the ledger stays append-only. Periods already published are never re-attributed. A PM who wants to change the past has to Re-publish, and the audit trail shows it. Add a testable consequence: "After a *Map* Disposition in period P, P's Unmapped Work total drops by the mapped Tickets' P-hours, and every Published Snapshot before P is unchanged."

### C2. AC includes Unmapped hours while PV/EV/BAC exclude them. This is unexplained, and it breaks roll-up and TCPI
- **Location:** FR-30 ("AC at Project level = mapped + Catch-all + Unmapped"; "EVM Metrics roll up from leaf WPs to summary WPs, the Project…"), FR-31 (TCPI > 1.1 → red), §6.2, glossary *EVM Metrics*.
- **Issue:** This is probably intentional ("honest EVM"), but the PRD never says so or works out the consequences:
  1. **Roll-up contradiction.** Leaf-level AC holds only mapped hours. Unmapped hours have no WP, so a leaf → summary → Project roll-up *cannot* produce the Project AC that FR-30 requires. The tree sum and the Project figure disagree by exactly the Unmapped Work, and nothing says where in the tree that gap lives.
  2. **It penalises the vendor for work the client asked for.** Hours tagged *Change Request candidate* are client-requested, yet they sit in AC with no EV. CPI then tells the client the vendor is overrunning. That breaks the R1 framing ("plan accuracy, not judgement") and damages the vendor in exactly the 請負 dispute §6.3 warns about.
  3. **EAC semantics.** *Typical* EAC = BAC/CPI extrapolates the current unmapped burn rate over the rest of the Project. *Atypical* treats it as sunk and one-off. That is the most consequential forecasting choice in the product, and nothing surfaces it.
  4. **TCPI blows up.** With unmapped hours in AC, BAC − AC reaches ≤ 0 well before the planned work is done. TCPI is then infinite or negative, and FR-31 turns it red "whatever the CPI". No behaviour is defined for a denominator ≤ 0.
  5. **SPI ignores Unmapped Work entirely.** A team spending 30% of its time on unplanned work shows it in cost, but schedule impact appears only indirectly.
- **Fix:** Add an explicit "Unmapped Work in EVM" subsection. (a) State the intent: Unmapped hours are cost with no earned value until re-baselined, by design. (b) Model a virtual Project-level node, "Unplanned (unmapped + unbaselined)", that holds those AC hours with PV = EV = 0. Roll-up then becomes tree + that node, so it reconciles. (c) Show a decomposition next to every CPI: **CPI (planned scope)** = EV / AC_mapped, and **CPI (all-in)** = EV / AC_total, plus the gap in hours. The headline stays all-in (the wedge), but the decomposition blocks the misreading. (d) Define TCPI as "not achievable — budget exhausted" when BAC − AC ≤ 0, and say what the indicator shows then. (e) The client view states in one sentence that unplanned work carries cost but no earned value.

### C3. EV depends on how many Tickets exist, not on how much work is done
- **Location:** FR-30 (percent complete = "share of mapped estimate that is resolved, or share of Tickets resolved when there are no estimates"), §12 FR-30 assumption, addendum D.
- **Issue:** EV = Baseline hours × percent complete, and percent complete is computed only over the Tickets currently mapped. Offshore teams create Tickets sprint by sprint, so a WP's Ticket set is almost always incomplete. Concretely:
  - WP 2.3 has a baseline of 120h. Sprint 1 created two Tickets (3h estimated each), and both are resolved. Percent complete = 100%, so **EV = 120h** after 6h of work. SPI and CPI look spectacular.
  - Sprint 2 creates ten more Tickets. Percent complete drops to 17% and EV falls by 100h in one snapshot, with no work lost.
  - A WP with zero mapped Tickets: percent complete is undefined (0? 100? excluded?).
  - Estimate edits in Backlog's single estimate field, and Tickets reopened after resolution, move EV with no work happening.
  - A *Map* Disposition of an unresolved emergent Ticket *lowers* the target WP's percent complete, so honest mapping is punished with lower EV.

  The PRD rejected burn-derived percent complete because it forces CPI ≈ 1. The replacement is just as broken: EV becomes a function of backlog grooming. It is also the metric the client sees first.
- **Fix:** Choose and specify a percent-complete rule that is anchored to the Baseline and not to the Ticket set. Options: (a) percent complete = resolved-estimate / **max(Baseline hours, mapped estimate total)**, so a sparse Ticket set cannot claim more than it covers; (b) require the PM to confirm a WP is "fully ticketed" before Ticket-derived percent complete applies, and otherwise use a PM-entered value or 0/50/100 rules; (c) cap each period's EV change and flag it. Also define: percent complete for a WP with no Tickets; how reopened Tickets are handled (EV may fall, and the drop is flagged); how estimate changes are handled (take estimates as of the Baseline, or live?). Add testable cases for all of them. Close the §12 assumption with the founder's real reporting practice *before* architecture starts.

### C4. The Snapshot-delta ledger has no rules for a Ticket's lifecycle, and FR-25's invariant cannot hold
- **Location:** FR-25 ("sum of a Ticket's ledger entries equals its current actual hours in the Tracker"), FR-19, FR-20, FR-17 ("one or more Backlog projects"), addendum A.2.
- **Issue:** Undefined cases, each of which corrupts AC:
  1. **First snapshot on an in-flight Project.** Every hour logged before the Connector existed lands as a single delta in the first window, attributed to today's assignee at today's Rate. The Project's first Reconciliation Review then shows a huge AC spike (and possibly huge Unmapped Work).
  2. **Deleted Ticket.** "Current actual hours" does not exist. Should its history be reversed (rewriting AC for published periods) or kept? The invariant has no answer.
  3. **Ticket moved** between Backlog projects or Jira projects (its key changes), or between two Connectors of the same Project: it looks like a deletion plus a new Ticket carrying its full history as a single delta. That means double counting or a spike, plus a lost Mapping.
  4. **Overlapping scopes.** Two JQL Connectors can match the same issue, and the same Backlog project can be connected to two momo Projects. The hours are counted twice, and FR-33's "Project and Department totals agree" still passes because both sides double count.
  5. **Scope narrowing** (FR-20: "shows the change") says nothing about what happens to the ledger. Do Tickets that left scope keep their AC?
  6. **Null assignee**, or assignee is a Tracker Account from another organisation (the client's own staff logging hours in their space).
- **Fix:** Add an FR, "Ticket lifecycle in the ledger", covering: an **opening-balance entry** type (flagged, excluded from period metrics by default, and dated at the Connector start); **tombstones** for deleted or out-of-scope Tickets (history kept, no reversal, and future deltas stop); **identity** by the Tracker's stable internal ID (Backlog `id`, Jira `id`), not by key, so moves are detected; **global dedupe** of a Ticket across Connectors and Projects inside a Tenant (one owner, with a conflict shown to the PM); and null or external assignee → "unattributed" at the Project default Rate. Restate the FR-25 invariant as: "sum of entries = last observed actual hours while the Ticket is in scope."

### C5. The money layer leaks the vendor's internal cost structure to the client
- **Location:** FR-12 (Rate = "cost per hour"), FR-30 money layer, FR-34 defaults (EVM summary and Unmapped total shown; Rates "hidden"), UJ-3 (46h = ¥207,000), UJ-4.
- **Issue:** Rates are hidden, but AC(¥) ÷ AC(h) gives the blended internal cost rate. With a small team or a per-WP drill-down, individual cost rates can be derived too. For an offshore vendor, that exposes its margin to the client, which is commercially fatal. It also shows the client the *wrong* number. Under 準委任 the client cares about **billing** rate × hours. Under 請負 the client should not see internal cost at all, and "¥207,000 of unplanned work" at cost reads as an invoice-shaped claim or an admission of loss. The PRD has one Rate concept and no notion of cost versus price.
- **Fix:** (a) Split **Cost Rate** (internal) from **Bill Rate** (client-facing, per Project or role). (b) The client-view money layer is **off by default**; the client sees hours only. (c) When money is enabled for clients, it is computed from Bill Rates, never from Cost Rates, and the Visibility Policy preview warns when figures could let someone derive a rate (for example, fewer than 3 Resources behind a figure). (d) Add a testable consequence: "No client-visible figure is computed from Cost Rates."

### C6. The scope does not fit one founder by Q1 2027, and the cut list trims the wrong things
- **Location:** §8.1, §8.2 cut order, SM-1, SM-2, brief ("must be cut again if Q1 2027 slips").
- **Issue:** Today is 2026-09-19. SM-1 needs four weeks of *before* and four weeks of *after* measurement inside Q1 2027, and SM-2 needs five Projects live with a Published Snapshot in the last 14 days. So production use has to start by roughly **early February 2027**: about 18–19 weeks away, before holidays and client work. The build list in that window: a WBS tree editor with dependencies and a Gantt with Baseline bars, an AI Excel importer that handles merged cells and 令和 dates, two Connectors plus an always-on snapshot service, a multi-tenant RBAC model with four roles and tenant-isolation tests on every endpoint, a mapping-rule engine, an append-only ledger, 11 EVM metrics with four EAC methods, roll-ups to Department and Program, publishing and a client portal in two languages, xlsx template binding that preserves formulas, a security check sheet, and Japan-region hosting with tested restores. The cut order removes template binding, Program roll-up, the re-import diff and Jira. Those are the cheap items. The expensive ones (the Gantt editor, AI import, full EN/JA coverage of every string and email, four EAC methods, Department roll-up) are untouched. The "never cut" wedge list itself contains FR-30's four EAC methods and TCPI, which is gold plating.
- **Fix:** Rewrite §8 as **two releases**. **R0 (founder-only, by about 2026-12-15):** a deterministic column-mapping Excel import (no AI), a read-only tree plus a simple Gantt (plan editing = re-import), Backlog only, the ledger, Mappings and Rules, Reconciliation Review, EVM with the *Typical* EAC only, and a fixed xlsx export. English UI only. Single tenant, with isolation kept in the data model. **R1 (clients, Q1 2027):** Client View and Publish in Japanese, magic-link sign-in, the security sheet, Japan-region hardening. **Post-Q1:** AI import, Jira, template binding, Program/Department roll-up, other EAC methods, WBS editing with dependencies. Give each item a time estimate and a gate date. State as a success condition that the wedge is proven in R0 on the founder's own projects before R1 starts.

---

## High

### H1. The *Plan* Disposition and Catch-all WPs launder Unmapped Work into a green indicator
- **Location:** FR-29 (*Plan* creates a WP in the Current Plan, never the Baseline), FR-24, FR-31 (Unmapped share of total hours), SM-C1.
- **Issue:** A WP created by *Plan* has no Baseline, so PV = EV = 0, but its hours now count as "mapped". The Unmapped Work indicator goes green while the underlying reality (cost with no baseline) is unchanged. Catch-all hours are likewise excluded from the Unmapped share. A PM who wants a green client view can reach one in two clicks. SM-C1 is a founder dashboard metric, not a product guard.
- **Fix:** Redefine the third Health Indicator as **Unplanned Work** = Unmapped + hours on WPs with no Baseline + Catch-all hours above an optionally baselined Catch-all budget. Show the components separately in both views. Add a testable consequence: "No Disposition changes the Unplanned Work indicator colour for the period without a Re-baseline."

### H2. The PM percent-complete override is an unbounded EV dial
- **Location:** FR-30 ("PM can override it, and the override is shown with its author"), NFR-A1, FR-34.
- **Issue:** An override directly sets EV and therefore SPI, CPI, EAC and every indicator. It is the biggest gaming vector in the product, far bigger than Catch-all. "Shown with its author": shown to whom? It is not in the NFR-A1 audit list, not recorded in the Published Snapshot, and no counter-metric covers it.
- **Fix:** Log every override (old value, new value, reason) in NFR-A1. Record overridden WPs in the Published Snapshot, and show a client-visible marker "PM-assessed progress" by default, which the Visibility Policy cannot hide. Add counter-metric SM-C4: the share of EV that comes from overrides.

### H3. A Published Snapshot cannot be reproduced, so it is weak evidence in a dispute
- **Location:** FR-35 (records Baseline version, Tracker Snapshot time, Visibility Policy), FR-31 (thresholds configurable per Tenant), FR-30 (EAC method selectable), FR-12 (Rate recompute).
- **Issue:** The traffic lights and EAC also depend on thresholds, the EAC method, percent-complete overrides, Rates, Dispositions, mapping state and the period's boundaries. None of these is recorded. A Tenant Admin can quietly change the red threshold to 0.5. The client sees green, and FR-31's "rule shown" displays the new rule with no history. If a client disputes a number six months later, the vendor cannot show how it was produced.
- **Fix:** A Published Snapshot freezes a **computation manifest**: thresholds, EAC method, every override, Rate table version, mapping state hash, Disposition list, period boundaries and time zone, and the formula version. Threshold and EAC-method changes join the NFR-A1 audit list. Add a testable consequence: "Recomputing a Published Snapshot from its manifest and the ledger reproduces every figure exactly."

### H4. Which period a delta belongs to is undefined, so FR-20's equation cannot be tested
- **Location:** FR-20 ("for any Reporting Period: mapped + Catch-all + Unmapped = total"), FR-25 (delta over a "time window"), glossary *Reporting Period*, *Unmapped Work*.
- **Issue:** A snapshot window can straddle a period boundary, especially the 6-hour off-hours windows or a multi-day outage (FR-19). Is the delta assigned by the window's end, prorated, or by its start? In which time zone, JST or ICT? Is "mapped" judged by the mapping at recording time or the current mapping? The same question applies to "Unmapped Work for a period".
- **Fix:** Pick one rule: assign by the later snapshot's timestamp, with the Reporting Period defined in the Project's time zone (default JST). Mapping status = the WP on the ledger entry, after any compensating entries from C1. Add a test that sums entries across a boundary-straddling window.

### H5. Mapping Rule semantics (live or sticky) are undefined
- **Location:** FR-22 ("On each Tracker Snapshot, Tickets without a manual Mapping are evaluated"), FR-21 (every Mapping change recorded).
- **Issue:** Rule-mapped Tickets are re-evaluated on every snapshot. If a developer moves a Ticket to another milestone, its Mapping silently flips to another WP, or to Unmapped. Is that a logged Mapping change? Does editing a rule retroactively remap existing Tickets? What happens when a rule targets a WP that has been deleted (FR-5 handles Mappings, not rules)? What if two rules have equal priority?
- **Fix:** Specify: rule-derived Mappings are **live** (re-evaluated) but every flip is logged as a Mapping change by "rule R", and a flip into Unmapped is surfaced in the next Reconciliation Review. Rule edits come with a preview of affected Tickets and a "future only / open period" choice. Deleting a WP asks the PM to retarget its rules. Priority is a strict total order.

### H6. Ticket-Count Mode is undefined at the Project level
- **Location:** FR-27, FR-17, FR-31, glossary.
- **Issue:** "SV/SPI use counts of completed versus planned Tickets": the Baseline has WPs and hours, not planned Tickets, so where does "planned Tickets" come from? In a mixed Project ("show the two measures separately, never add them"), which SPI drives the Schedule indicator and the headline? The Unmapped Work threshold is defined as a share of *hours*, so what applies in count mode?
- **Fix:** Define count-mode PV as Tickets mapped to WPs whose Baseline finish ≤ date (or state plainly that SPI is not available in count mode). Define mixed-Project precedence (hours Connector wins; count Connector shown as a secondary panel) and count-mode thresholds. Better still, make OQ-2 a gate (H11) and cut mixed mode from v1.

### H7. Tracker credentials are user-scoped and full-access, so "read-only" is only a promise
- **Location:** FR-17 (API key), FR-18, NFR-S2, §6.2.
- **Issue:** A Backlog API key carries every permission of its user, including write and delete, across every project that user can see in the space. Jira API tokens are the same. If momo-keikaku is breached, the attacker gets write access to the *client's* Backlog. The space often belongs to the client, and the client never agreed that its data would be pulled into a third-party SaaS. When the PM who owns the key leaves, the Connector dies.
- **Fix:** Jira: use OAuth 2.0 (3LO) with read-only scopes, not tokens. Backlog: recommend a dedicated read-only bot user; document it and detect it where possible. Add a Connector-level "client consent recorded" field (who approved it, and when) that is required before the first snapshot when the space is client-owned. Allow credential rotation without re-mapping. Add all of this to the security answer document.

### H8. AI import sends client-confidential WBS files to a third-party model, and OQ-5 blocks the whole feature
- **Location:** FR-9, NFR-S4, NFR-S6, OQ-5, addendum A.3.
- **Issue:** A client's WBS is usually covered by the vendor's NDA with the client. NFR-S6 covers training and retention but not the vendor's *right* to send the file to a subprocessor. A Japan-region, no-training LLM endpoint may not be available on the provider the founder picks, so NFR-S4 and FR-9 can conflict outright. The feature also cannot be tested as written ("any Excel WBS, whatever its layout").
- **Fix:** Add a deterministic fallback (manual column mapping plus heuristics) that ships first and needs no AI. Add a per-Tenant switch "AI import disabled" for clients that forbid it. Resolve OQ-5 before architecture. Define acceptance against a **golden corpus** of N real WBS files (for example, 10 from the founder's projects, with ≥ 90% of rows correct before any correction).

### H9. The Program and Department roll-up maths is unspecified and easy to get wrong
- **Location:** FR-30 ("roll up… to Program and Department"), FR-33, UJ-5.
- **Issue:** Ratios (SPI, CPI, TCPI) must be recomputed from summed PV, EV and AC, never averaged. EAC cannot be summed across Projects that use different EAC methods without saying so. Department PV and EV need Baseline hours allocated by each assigned Resource's home Department. What about WPs with several assignees, or none? Count-mode Projects cannot join an hours roll-up at all. And a Department receives Unmapped hours only through the Resource, which requires a linked Tracker Account.
- **Fix:** Add a roll-up section: aggregate the base quantities, recompute ratios, split multi-assignee WPs evenly (or by an entered allocation), put unassigned hours in an "unallocated" bucket, list excluded count-mode Projects, and show EAC at portfolio level as a sum with a "mixed methods" marker.

### H10. "Why Now" contradicts the delivery date
- **Location:** §1.1 ("the wedge window… holds only until about 2026-12-01"), SM-1/2/3 (Q1 2027), R7.
- **Issue:** The PRD says the window closes about 2026-12-01 and then plans delivery for Q1 2027. Either the window claim is wrong or the plan misses it. Reviewers and future investors will spot this at once.
- **Fix:** Restate it as "the claim was verified until 2026-12-01 and must be re-checked then" (which is what OQ-7 implies), or tie the R0 date in C6 to it. Do not state a closing window that you plan to miss.

### H11. OQ-2 (Backlog plan tier) is a gate, not an open question
- **Location:** OQ-2, FR-17, FR-27, UJ-2 edge case.
- **Issue:** If the founder's five target spaces are below Standard, or teams leave `actualHours` empty (very common), the entire hours and money wedge collapses to Ticket-Count Mode, where AC, CPI and Unmapped hours do not exist. The product thesis depends on this answer, and the PRD treats it as the second of eight open questions.
- **Fix:** Resolve OQ-2 *before* architecture: check the tier and the actual hours-fill rate on the five Projects for the last 8 weeks. Record the result in the PRD. If the fill rate is under about 70%, reconsider v1 scope (for example, surface "hours not logged" as its own Unmapped signal).

### H12. How Catch-all WPs enter EVM is undefined
- **Location:** FR-24, FR-30, FR-23, SM-5.
- **Issue:** Does a Catch-all WP carry Baseline hours (PV)? A bucket never "completes", so what is its percent complete, and therefore its EV? If it has no Baseline it behaves exactly like Unmapped Work in CPI but not in the indicator (H1). Is it counted as "mapped" in SM-5 coverage?
- **Fix:** A Catch-all WP may carry an optional Baseline *budget*. Its EV is defined as min(AC, budget), a level-of-effort convention, which should be stated. Hours above the budget count as Unplanned (H1). SM-5 excludes Catch-all hours from "mapped".

### H13. The Reconciliation Review is not pinned to a Tracker Snapshot
- **Location:** FR-28, FR-29, FR-35, UJ-3.
- **Issue:** Snapshots run hourly. While Linh records Dispositions, a new snapshot can arrive and add Tickets, change hours and flip rule Mappings. The preview she approves can differ from what gets published, and Dispositions apply to a group whose members changed underneath her.
- **Fix:** The review opens **pinned** to a specific Tracker Snapshot. Newer snapshots show a banner ("N changes since; refresh review"). Publish uses exactly the pinned state, and the Published Snapshot records it (H3). Add a test: preview equals the published output, byte for byte.

### H14. The publish lifecycle is too thin for a client-facing record
- **Location:** FR-35, FR-36.
- **Issue:** Can there be several Published Snapshots for one period? How is a correction made: retract and re-publish, or publish a v2? When a snapshot is retracted after the client has opened it and received an email, the client is not told, so from their side the vendor made a number disappear. That is worse for trust than the error was.
- **Fix:** Allow **superseding** publishes for a period (v1, v2) with a mandatory reason visible to the client ("corrected: …"). Retraction notifies viewers who opened it. Keep the superseded version visible to the client with a "superseded" marker unless the retraction reason is "sent to the wrong party".

### H15. Negative deltas and Rate recompute break money reconciliation and append-only storage
- **Location:** FR-25 (negative entries; "assignee at the later snapshot"), FR-12 ("recompute… from a given date"), FR-39.
- **Issue:** A developer logs 8h in March at Rate A. In April a different assignee holds the Ticket, the Rate is B, and the hours are corrected to 5h. The −3h entry is costed at B, so money does not net out. Separately, "recompute past costs" rewrites costs, which contradicts "ledger entries are never updated in place". Afterwards FR-39 exports no longer match the Published Snapshots.
- **Fix:** Negative deltas are costed with FIFO/LIFO matching against the Ticket's prior positive entries (use their Resource and Rate), and the chosen rule is stated. Rate recompute appends revaluation entries, never edits, and never alters published figures. Exports show both views.

---

## Medium

### M1. Cumulative versus per-period metrics are undefined
- **Location:** FR-28, FR-31 thresholds, glossary *Reporting Period*.
- **Issue:** Is SPI/CPI in the review cumulative to date or for the period? Is the Unmapped share (10/20%) measured per period or cumulatively? The two give opposite colours on the same Project.
- **Fix:** EVM is cumulative (PMI convention). Unmapped share is shown both ways, with the indicator driven by one declared basis. State it in FR-31.

### M2. The PV spread rule is underspecified
- **Location:** FR-30 ("spread over working days"), FR-14.
- **Issue:** Linear spread? Which calendar applies when the Project uses JP + VN (union of holidays, the assignee's calendar, or the Project's)? A WP whose Baseline dates fall entirely on holidays?
- **Fix:** Linear over the Project calendar's working days, with the union of holidays when both calendars are selected. Add edge-case tests.

### M3. BAC and Baseline cost are not defined
- **Location:** Glossary, FR-15, FR-30.
- **Issue:** BAC is used but never defined. How is Baseline cost computed for WPs with several Resources, with no Resource, or where the Rate changes during the WP?
- **Fix:** Add BAC to the glossary as the sum of leaf Baseline hours (and cost). Define Baseline cost as Σ(assigned share × hours × Rate effective at each WP's Baseline date), with unassigned WPs at the Project default Rate.

### M4. Re-import WP identity and conflicts with in-tool edits
- **Location:** FR-11, UJ-1 resolution ("from now on Linh edits the plan in momo-keikaku").
- **Issue:** How are WPs matched across imports: WBS code, name, or row position? If the WBS codes are renumbered, every WP looks "removed and added", and every Mapping is orphaned. In-tool edits and a re-import of the client's newer file will conflict.
- **Fix:** Match on WBS code, then name, and let the PM confirm matches in the diff. Show a three-way conflict (Current Plan edit versus new file) and have the PM choose per field.

### M5. The source of actual dates is undefined
- **Location:** Glossary *Divergence* ("dates"), FR-28.
- **Issue:** Divergence compares actual dates, but no FR says where a WP's actual start and finish come from.
- **Fix:** Actual start = the earliest positive ledger entry, or the earliest "in progress" status of a mapped Ticket. Actual finish = when the WP reaches 100% complete. State both.

### M6. Dispositions persist forever and go stale
- **Location:** FR-29 ("stays with it in later periods until the PM changes it"), SM-7.
- **Issue:** An *Explain* note from week 3 automatically covers 40 more hours in week 12, and SM-7 counts them as "acted upon". Group Dispositions refer to attribute groups whose membership changes.
- **Fix:** A Disposition carries over, but new hours on a Ticket whose last Disposition is from an earlier period are flagged "carried over — confirm". Group Dispositions snapshot their membership. SM-7 counts only Dispositions confirmed in the current period.

### M7. "Resolved" is not defined per Tracker
- **Location:** FR-30 (percent complete from "resolved").
- **Issue:** Backlog statuses are customisable per project, and Jira has status categories and resolutions. Percent complete depends on this, and it is undefined.
- **Fix:** A per-Connector status mapping to {open, in progress, done}. Defaults: Jira status category *Done*, Backlog status "Closed"/完了 and custom statuses as the PM configures. Show it in the UI.

### M8. Internal Viewers and PMs see or edit salary-derived Rates across the Tenant
- **Location:** FR-2 (Internal Viewer reads all Projects), FR-12 (any PM can create Resources and Rates), FR-26.
- **Issue:** Cost Rates are effectively salary data. Every Internal Viewer can read them and person-level actuals for every Project, and any PM can change a Rate that feeds other PMs' Projects.
- **Fix:** Rates are visible and editable only by Tenant Admin, plus an optional "Finance" permission. PMs see cost aggregates only. Internal Viewer scope can be set per Department.

### M9. Client Viewer invitations are an easy exfiltration path
- **Location:** FR-2, FR-3, FR-36.
- **Issue:** A PM can invite any email address, a mistyped domain sends a competitor the Project, and magic links can be forwarded. What does the notification email contain: numbers, or only a link?
- **Fix:** A per-Project allowlist of client email domains. Invitations to other domains need Tenant Admin approval. Notification emails carry no figures. Magic links are single-use and short-lived, bound to the email address. Invitations join the audit log.

### M10. The audit trail misses the actions that move numbers
- **Location:** NFR-A1.
- **Issue:** Not logged: Dispositions, percent-complete overrides, threshold changes, EAC-method changes, Connector scope/JQL changes, imports and re-imports, Rate recompute, Explain edits, Client Viewer invitations.
- **Fix:** Add them all. Rule of thumb: anything that can change a client-visible figure or who sees it is audited.

### M11. Untrusted Tracker and Excel content is not treated as hostile
- **Location:** FR-9, FR-25, FR-38, FR-39, NFR-S*.
- **Issue:** Ticket titles are rendered in the UI (XSS) and exported to CSV/xlsx (formula injection via `=`, `+`, `@`). Uploaded xlsx files can be zip bombs or carry macros or external links. Excel content passed to an LLM can inject prompts that steer the interpretation.
- **Fix:** Add NFR-S7: output encoding everywhere; neutralise formula prefixes on export; size and entry limits on uploads; strip macros and external links; the LLM output is treated as a proposal only (already guaranteed by FR-10) and schema-validated.

### M12. SPI becomes meaningless late in a Project
- **Location:** FR-31 ("never green while Schedule is red"), FR-32.
- **Issue:** Cost-based SPI converges to 1.0 as a Project finishes, even if it is late. The never-green rule loses its force exactly when it matters, and a date forecast built on SPI trends inherits the flaw.
- **Fix:** Add a date-based schedule check (milestone slip against the Baseline, or Earned Schedule SPI(t)) that can independently turn the Schedule indicator amber or red.

### M13. The forecast method is undefined
- **Location:** FR-32.
- **Issue:** "From the current SPI and CPI trend" has no formula, no trend window and no rule for re-baselines inside the window. "The forecast states the inputs it used" is the only testable line.
- **Fix:** Specify it: forecast duration = planned duration / SPI (or SPI(t)), and cost = the EAC per the selected method. The trend window is N periods and is reset by a Re-baseline.

### M14. The raw export cannot rebuild the numbers, despite the promise
- **Location:** FR-39.
- **Issue:** Rebuilding EV needs Ticket status and estimate history, overrides, thresholds, the EAC method and Rates. None of that is in the export list.
- **Fix:** Export the Tracker Snapshot history (or the derived Ticket state per period), overrides, Rate tables and Published Snapshot manifests (H3).

### M15. No data lifecycle and no rules on operator access
- **Location:** §5 NFRs, NFR-O1, FR-40.
- **Issue:** Nothing covers Tenant offboarding and deletion, retention of Tracker Snapshots (which grow without bound: about 2,000 Tickets × 24 snapshots × 365 days), APPI personal-data handling, or how the operator ("seats set by the operator") reaches Tenant data for support.
- **Fix:** Add retention (for example, compact Tracker Snapshots to daily after 90 days while keeping the ledger), a Tenant deletion SLA, a support-access policy (time-boxed, logged, Tenant-visible), and an APPI privacy notice.

### M16. The hierarchy is ambiguous: Program under Department, and PM assignment
- **Location:** Glossary *Program*, FR-1, FR-2.
- **Issue:** "Tenant > Department > Program > Project" implies a Program sits inside one Department, but cross-department programmes are common. FR-2 refers to "a PM assigned to the Project", but no FR defines who assigns PMs.
- **Fix:** Make Program a Tenant-level grouping that is independent of Department. Add to FR-1: a Tenant Admin assigns one or more PMs per Project.

### M17. No data minimisation for Tracker content
- **Location:** Glossary *Tracker Snapshot*, FR-25.
- **Issue:** Snapshots can store titles, descriptions and assignee names from the client's tracker, which is client-confidential data stored and replicated every hour.
- **Fix:** Store only the fields the product uses (ID, key, title, status, estimate, actual hours, assignee ID, and the attributes rules use). No descriptions or comments. Say so in the security answer document.

### M18. Several acceptance criteria cannot be tested
- **Location:** FR-9 ("any Excel WBS"), FR-7 ("without visible lag"), FR-10 ("confidence marker"), FR-38 ("tables expand downward").
- **Issue:** None of these has a pass/fail threshold.
- **Fix:** Golden corpus plus accuracy threshold (H8). Scroll and interaction ≤ 100 ms frame budget at 500 WPs. Confidence below X is highlighted. Template-binding tests on 3 real templates.

---

## Low

### L1. Wrong cross-reference
- **Location:** FR-26 ("hidden from Client Viewers by default (see FR-37)").
- **Issue:** FR-37 is internal Risks/Issues. The default comes from FR-34.
- **Fix:** Change the reference to FR-34.

### L2. Threshold boundaries overlap
- **Location:** FR-31.
- **Issue:** "≥ 0.95 green" and "0.85–0.95 amber" both claim 0.95. Exactly 20% Unmapped is neither amber nor red.
- **Fix:** Use half-open intervals: [0.95, ∞) green, [0.85, 0.95) amber. For Unmapped share: < 10% green, [10%, 20%] amber, > 20% red.

### L3. NFR-P1 is narrow
- **Location:** NFR-P1.
- **Issue:** p75 only, measured on the founder's dataset. No p95, no multi-tenant load, and no target for snapshot processing time.
- **Fix:** Add p95 targets and a target of "a full snapshot of 2,000 Tickets processed in ≤ 5 min".

### L4. Coverage metrics mix Tickets and hours
- **Location:** UJ-2 ("87% of Tickets"), SM-5 ("share of hours"), FR-23.
- **Issue:** The journey celebrates Ticket coverage, and the metric uses hours. The two can diverge sharply.
- **Fix:** Use hours coverage as the headline everywhere and show Ticket coverage as secondary.

### L5. SM-1 is a sample of one, self-reported
- **Location:** SM-1.
- **Issue:** The founder measures his own time saved on his own product. That is fine as a gate, but weak as evidence.
- **Fix:** Also log the time for one non-founder PM on one Project, even informally.

### L6. Changing the Tenant currency after data exists
- **Location:** FR-4.
- **Issue:** Nothing says what happens to existing Rates and ledger costs when the currency changes.
- **Fix:** Lock the currency once any Rate exists, or require a revaluation entry.

### L7. Client viewing is tracked without disclosure
- **Location:** FR-36.
- **Issue:** Recording client opens without telling the client can feel like surveillance to a Japanese client, and it is personal data under APPI.
- **Fix:** Disclose it in the client invitation and the privacy notice.

### L8. What happens to Mapping Rules when their target WP is deleted
- **Location:** FR-5, FR-22.
- **Issue:** FR-5 covers Mappings only.
- **Fix:** Fold this into H5's fix (retarget rules on delete).

### L9. The working title and some glossary terms are still loose
- **Location:** Title ("Working title — confirm"), glossary *Unmapped Work* ("for a period" without an attribution basis).
- **Issue:** Minor, but the *Unmapped Work* definition is where the C1/H4 ambiguity starts.
- **Fix:** Make the glossary definition point to the attribution rule chosen in H4.

---

## Recommended order of repair

1. C6 (rescope into R0/R1 with dates) and H11 (resolve OQ-2 with real data). Everything else is sized against these.
2. C1, C3, C4, H4, H5: rewrite the ledger and mapping semantics as one coherent "Ledger & Attribution" section with worked examples.
3. C2, H1, H12, H2: write the "Unmapped Work in EVM" section, then redefine the Unplanned indicator and override controls.
4. C5, H3, H13, H14: client-trust package (Bill Rate, computation manifest, pinned review, supersede and retract).
5. H7, H8, M9, M11, M15: security package, then update NFR-S5's answer document.
