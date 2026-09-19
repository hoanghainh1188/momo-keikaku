# OQ7b digest — Engineering-intelligence vendors vs "unplanned effort against a baseline" (round 1, worker 1)

Accessed: 2026-09-20. Public web only. ~21 tool calls.

Questions owned:
- Q1. Jellyfish: does Scenario Planner / Capacity Planner / Deliverables / Allocations hold a planned-effort baseline and compare to actual? Does it report unplanned/KTLO/Other/uncategorized work as effort/cost?
- Q2. LinearB: 2025-2026 changelog on unplanned work, planning accuracy, resource allocation, cost cap, uncategorized; what exactly "planning accuracy"/"unplanned work" measure.
- Q3. Swarmia: 2025-2026 changelog on investment balance, unplanned, uncategorized, FTE cost, capitalization, initiatives; planned vs actual effort per initiative?
- Q4. Backlog (Nulab) integration or Japan presence.

Note on method: WebFetch returns a model summary of the page, not raw text; quotes below are as returned by that summary. Pages I could not open in full are flagged.

## Findings

### Q1 — Jellyfish

| # | Claim | Source URL | Publisher | pub_date | Accessed | Confidence | Class |
|---|---|---|---|---|---|---|---|
| J1 | The Scenario Planner product page describes modelling hypothetical scenarios and trade-offs ("hours and days, not story points"). It does not mention a stored planned-FTE baseline, a plan-vs-actual comparison, or unplanned/KTLO/Other work. | https://jellyfish.co/solutions/scenario-planner/ | Jellyfish | undated | 2026-09-20 | medium (marketing page) | feature |
| J2 | Scenario Planner launched Aug 2023 as "resource allocation modeling": it is forward-looking and hypothetical. The launch post says nothing about baseline storage or variance. | https://jellyfish.co/blog/jellyfish-scenario-planning/ | Jellyfish | 2023-08-15 | 2026-09-20 | medium | feature |
| J3 | Capacity Planner (Feb 2025) forecasts using "expected team size and allocation toward planned work" and estimates carryover. The post does not say it keeps a versioned plan to compare with actuals, and it does not mention KTLO or unplanned capacity. | https://jellyfish.co/blog/help-your-teams-thrive-with-capacity-planner/ | Jellyfish | 2025-02-18 | 2026-09-20 | medium | feature |
| J4 | The Software Delivery Management page is about forecasting, risk and "Model scope, resourcing, and timeline changes". It does not mention planned-vs-actual effort, budget, unplanned work, or scope creep. | https://jellyfish.co/solutions/software-delivery-management/ | Jellyfish | undated | 2026-09-20 | medium | feature |
| J5 | Resource Allocations measures effort (FTE-equivalent) by work category, e.g. Roadmap / KTLO / Support. Jellyfish content frames the goal as driving down unplanned work. So unplanned work is reported as effort **share**, but as a category and not against a per-deliverable planned baseline. | https://jellyfish.co/blog/allocating-with-intent/ (via search summary); https://jellyfish.co/platform/resource-allocations/ | Jellyfish | not verified | 2026-09-20 | low-medium (search-summary level, page not opened) | feature |
| J6 | A search summary said deliverables show "cost, FTEs, contributors, target, and projected completion dates". "Target" appears to be a target **date**, not a target effort. Not verified on a primary page. | search summary of jellyfish.co pages | Jellyfish | n/a | 2026-09-20 | low | feature |
| J7 | "What's New" 2025-2026 includes Capacity Planner (Feb 2025), Team Pulse (Jun 2025), Azure DevOps (Oct 2025), AI Impact (Nov 2025), and 25+ integrations (Dec 2025). No entry on planned-vs-actual effort, unplanned-work cost, or a baseline ledger was found. | https://jellyfish.co/library/whats-new/ | Jellyfish | rolling | 2026-09-20 | medium (the page summary listed items up to Dec 2025; the Mar–Jun 2026 entries seen in search results were not itemised) | trajectory |

### Q2 — LinearB

| # | Claim | Source URL | Publisher | pub_date | Accessed | Confidence | Class |
|---|---|---|---|---|---|---|---|
| L1 | Planning Accuracy = "(Completed Planned Issues / Total Planned Issues) x 100%". Capacity Accuracy counts issues or story points completed, both planned and unplanned, vs planned. Both are measured in **issues/story points only**, with no hours, cost or FTE attached. | https://linearb.helpdocs.io/article/g4czwado46-understanding-project-delivery-trackers | LinearB | "updated 9 months ago" (~Dec 2025) | 2026-09-20 | high (help doc) | feature |
| L2 | Resource Allocation is measured in FTE ("30 days = 1 FTE") with cost estimated from "average salary". It flags "Uncategorized" work (no PM item / epic, inactive epics). The doc does not describe comparing actuals against a planned budget or target allocation. | https://linearb.helpdocs.io/article/npdalbbe4e-resource-allocation-1 | LinearB | undated | 2026-09-20 | high (help doc) | feature |
| L3 | Investment Strategy groups work into New Value / Enhancements / Dev Experience / KTLO / "Inefficiency Pool", and describes itself as "not a financial calculator". No target-vs-actual allocation is documented. | https://linearb.helpdocs.io/article/oaf32occ9w-investment-profile | LinearB | undated | 2026-09-20 | medium-high | feature |
| L4 | The 2026 release notes (latest entry Jun 2026) are about AI analytics, AI code review, Copilot/Amazon Q/Claude Code telemetry, and GitHub team sync. There are **no** entries on planning accuracy, unplanned work, allocation, cost cap, or forecasting. | https://linearb.helpdocs.io/article/b7okinmoom-release-notes-2026 | LinearB | 2026 (to Jun) | 2026-09-20 | medium-high | trajectory |
| L5 | LinearB sells R&D cost capitalization (categorising capitalizable vs non-capitalizable effort by issue type, epic, initiative or custom field). This is a cost view of actual effort, not a variance against a plan. | https://linearb.io/platform/cost-capitalization | LinearB | undated | 2026-09-20 | medium (marketing) | feature |

### Q3 — Swarmia

| # | Claim | Source URL | Publisher | pub_date | Accessed | Confidence | Class |
|---|---|---|---|---|---|---|---|
| S1 | Changelog timeline: FTE-based effort model beta (2024-10-22), FTE investment balance (2024-11-05), updated effort model (2025-04-25), software capitalization CapEx/OpEx (2025-06-11), sprint-view investment breakdown (2025-07-28), reorder breakdowns (2025-10-13), time-off API (2026-02-17), scope filter (2026-06-02), **FTE cost (2026-06-16)**, **initiative forecast with remaining FTE (2026-06-30)**, AI cost beta (2026-08-05), AI ROI (2026-08-07), daily effort model (2026-08-24), leadership signals (2026-09-04). | https://www.swarmia.com/changelog/ | Swarmia | rolling | 2026-09-20 | high (changelog) | trajectory |
| S2 | 2026-06-16: investment balance and focus summary now show cost "in real currency". Cost = FTE-months x admin-set yearly developer cost (EUR/USD). The entry does **not** mention any planned budget comparison. | https://www.swarmia.com/changelog/2026-06-16-fte-cost/ | Swarmia | 2026-06-16 | 2026-09-20 | high | feature |
| S3 | Investment balance docs suggest a "binary breakdown, such as Planned vs. Unplanned work" and a monthly review of uncategorized items. Combined with S2, Swarmia can already show **Unplanned** effort in FTE and currency, provided the customer labels work that way. The split is a categorization of actuals, not a variance against a stored plan. | https://help.swarmia.com/features/focus/balance-engineering-investments | Swarmia | undated | 2026-09-20 | medium-high | feature |
| S4 | Auto-categorization of uncategorized work (AI suggestions, smart categorization Feb 2024; toggle referenced in search summary). This shrinks the "uncategorized" bucket rather than keeping it as its own ledger. | https://www.swarmia.com/changelog/ | Swarmia | 2024-02-13 (+ later toggle, date not verified) | 2026-09-20 | medium | feature |
| S5 | Initiative forecast (2026-06-30) runs Monte Carlo on past FTE to estimate completion date and **remaining FTE** (p50/p80/p90). The changelog entry mentions no planned-effort, budget or target-FTE field. Users can adjust remaining scope and focus, and turn a forecast into a target **date**. | https://www.swarmia.com/changelog/2026-06-30-initiative-forecast/ | Swarmia | 2026-06-30 | 2026-09-20 | high | trajectory |
| S6 | The help page on forecasting initiatives returned 404, so I could not verify whether initiatives have a planned-effort field. | https://help.swarmia.com/deliver-strategic-initiatives/forecasting-initiatives | Swarmia | n/a | 2026-09-20 | n/a | gap |

### Q4 — Backlog / Japan

| # | Claim | Source URL | Publisher | pub_date | Accessed | Confidence | Class |
|---|---|---|---|---|---|---|---|
| B1 | Jellyfish's Dec 2025 "25+ new integrations" cover incident, security, CI/CD, QA, ITSM, error tracking, monitoring and support. Issue trackers named are Jira, Linear and ADO. Backlog did not appear in any result. | https://jellyfish.co/blog/new-data-integrations/ ; https://jellyfish.co/integrations/ | Jellyfish | 2025-12 | 2026-09-20 | low-medium (list not fully enumerated) | feature |
| B2 | Swarmia's changelog mentions only Jira and Linear as trackers (Jira+Linear side by side 2026-02-02; multiple Jira instances 2026-08-12). No Backlog. | https://www.swarmia.com/changelog/ | Swarmia | 2026 | 2026-09-20 | medium | feature |
| B3 | A combined search for the three vendors plus "Japan Backlog Nulab" found nothing linking any of them to Backlog or to a Japan presence. | (search) | — | — | 2026-09-20 | low (absence of evidence) | — |

## Leads worth chasing
- Swarmia investment balance docs: check whether a category or breakdown can have a **target %** (the docs only showed recommended benchmarks). A target plus FTE cost would come close to a baseline.
- Swarmia help sitemap (https://help.swarmia.com/sitemap.md): the initiatives page, to check for an "estimate"/"planned effort" field. The forecast help page 404'd.
- Jellyfish help centre (the product help site was not reached): Deliverables "target" field semantics, and whether Scenario Planner scenarios can be saved and compared with actual allocation afterwards. Also the itemised Jellyfish What's New entries for Mar–Jun 2026.
- LinearB Zendesk 2026 release notes (403 to fetch). The helpdocs copy may lag. Also check LinearB "Investment Strategy" for target settings.
- Swarmia "leadership signals" (2026-09-04): could flag KTLO/unplanned drift; not opened.

## Looked for but could not find
- "Jellyfish scenario planner deliverables planned effort": no planned-vs-actual baseline found.
- "Jellyfish unplanned work KTLO allocation": category share only, no baseline.
- "Jellyfish help deliverables planned FTE actual": no primary doc found.
- "Jellyfish release notes 2026 allocations": no 2026 itemised entries retrieved.
- "LinearB release notes 2026": no planning or allocation entries.
- "LinearB investment strategy target allocation": no target-vs-actual found.
- "Swarmia initiative forecast remaining FTE": forecast only, no planned-effort field.
- "Jellyfish Swarmia LinearB Japan Backlog Nulab": nothing found.
- LinearB Zendesk 2026 release notes: HTTP 403. Swarmia forecasting-initiatives help: 404.

## Verdicts

- **Q1 Jellyfish.** Scenario and Capacity Planner are forward-looking models, and Allocations reports actual effort by category, including KTLO/support. I found no evidence of a stored planned-effort baseline per deliverable, compared over time with actuals, that puts unplanned hours on a separate ledger. Planner plus Allocations together sit closest to the wedge, but no source shows them joined. **Threat: medium.** The pieces exist, and a plan-vs-actual join would be a short roadmap step, but nothing in the evidence says it has been built or announced.
- **Q2 LinearB.** "Planning accuracy" and "unplanned work" are measured in **issue/story-point counts per iteration**, with no effort or cost attached (L1). Resource Allocation has FTE and cost, plus an "Uncategorized" flag, but no planned baseline. The 2026 roadmap is heavily AI-focused, with no planning or allocation entries. **Threat: low.**
- **Q3 Swarmia.** The fastest-moving of the three. Since 2026-06-16 it shows FTE **cost in currency**, and its docs suggest a Planned vs Unplanned breakdown, so it can already report "unplanned effort/cost" as a category of actuals. Since 2026-06-30 it forecasts **remaining FTE** per initiative. I found no stored planned-effort baseline or variance ledger. **Threat: medium, trending up.** Adding one field ("planned FTE per initiative") would give plan-vs-actual. Its unplanned figure depends on customer labelling, and there is no baseline-separation or ledger semantics.
- **Q4.** No evidence of Backlog (Nulab) integration or a Japan presence for any of the three. Their tracker coverage is Jira, Linear and ADO. **Threat in a Backlog-centric Japanese market: low**, based on absence of evidence.

**Overall:** none of the three was shown to report unplanned effort or cost **against a planned-effort baseline** kept separate from that baseline. Swarmia (cost plus Planned/Unplanned breakdown plus FTE forecast) and Jellyfish (Allocations plus Planner) are each one join away from it.
