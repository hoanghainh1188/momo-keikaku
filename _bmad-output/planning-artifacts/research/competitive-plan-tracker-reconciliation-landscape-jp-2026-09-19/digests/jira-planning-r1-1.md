# Digest: Jira-side planning — round 1

## Findings
| # | claim | source URL | publisher | pub_date (YYYY-MM or unknown) | accessed | confidence (high/med/low) | class (feature/pricing/positioning/trajectory/sentiment/traction) |
|---|---|---|---|---|---|---|---|
| 1 | Tempo Financial Manager compares actual vs projected hours, cost (labor at rates + fixed expenses) and revenue. Actuals come from logged time; projections need Capacity Planner. | https://help.tempo.io/financialmanager/latest/comparing-actual-kpis-versus-projected-kpis | Tempo (official help) | unknown | 2026-09-19 | high | feature |
| 2 | A Financial Manager project's scope is set by a Jira filter at import. The docs say nothing about worklogs on issues outside that scope, and there is no "unplanned / unmapped work" concept. | same as #1 | Tempo (official help) | unknown | 2026-09-19 | med (inferred from what the docs leave out) | feature |
| 3 | Tempo Capacity Planner has a "Planned vs Actual" report: planned time (Planner) vs logged time (Timesheets), with % variance. Over-plan logging shows in yellow. It covers hours only, no cost, and needs both apps. The docs don't say how work with zero planned hours is shown. | https://help.tempo.io/planner/latest/planned-vs-actual-reports | Tempo (official help) | unknown | 2026-09-19 | high | feature |
| 4 | Tempo's own marketing sells "budget vs forecast vs actual" and a "Budget vs Spend" report fed by Timesheets or native Jira worklogs. | https://www.tempo.io/products/project-financial-management/project-cost-forecasting (search snippet only; the direct fetch returned 404) | Tempo (marketing) | unknown | 2026-09-19 | med | positioning |
| 5 | BigPicture baselines are Enterprise-only (the doc is for Data Center). There is one current baseline per task, up to 20 baseline history records per box, and baseline fields can sync to Jira. | https://appfire.atlassian.net/wiki/spaces/DLP/pages/297635840 (search snippet) | Appfire docs | unknown | 2026-09-19 | med | feature |
| 6 | BigPicture imports MS Project / Excel files (MSP import). | https://bigpicture.one/blog/migrating-ms-project-jira/ (search snippet) | Appfire blog (marketing) | unknown | 2026-09-19 | med | feature |
| 7 | Appfire launched "BigPicture Advanced" on 2026-08-04: SPM with strategic planning, financial governance/budgeting and prioritization inside Jira. It is one Marketplace listing with Standard and Advanced editions. | https://appfire.com/newsroom/bigpicture-advanced-strategic-portfolio-management-jira ; https://www.prnewswire.com/news-releases/appfire-releases-new-bigpicture-advanced-edition-for-expanded-enterprise-strategic-portfolio-management-for-jira-302841889.html | Appfire / PR Newswire | 2026-08 | 2026-09-19 | med (snippets; full release not read) | trajectory |
| 8 | Jira Plans (Premium) does not compute a critical path or slack, and the timeline supports finish-to-start dependencies only. | https://getsimplegantt.com/blog/jira-critical-path-guide/ (search snippet) | Simple Gantt (third-party vendor) | 2026 | 2026-09-19 | med (vendor with an interest) | feature |
| 9 | Jira Plans has no baselines today. An older version had them, and the feature request JSWCLOUD-20495 is still open. | https://community.atlassian.com/forums/Jira-questions/Using-Jira-Plans-formally-portfolio-how-to-manage-baselines/qaq-p/2239965 (search snippet) | Atlassian Community | 2023-01 (approx.; stale) | 2026-09-19 | med | feature |
| 10 | Jira Premium costs about $18.30/user/month at 100 users (cloud). | https://titanapps.io/blog/jira-pricing ; https://saascrmreview.com/jira-pricing/ (snippets; the Atlassian pricing page fetch came back truncated) | third-party | 2026 | 2026-09-19 | low-med (not verified on the primary source) | pricing |
| 11 | Data Center end of sale to new customers: 2026-03-30. Existing customers can expand until 2028-03-30. Data Center reaches end of life (read-only) on 2029-03-28. DC prices rose ~15% on 2026-02-17. | https://ones.com/blog/atlassian-data-center-pricing-increase-2026/ ; https://corptec.com.au/blog/atlassian/atlassian-data-centre-jira-service-desk-confluence-jira-pricing-updates-2026/ (snippets) | third-party partners | 2026 | 2026-09-19 | med (several sources agree; Atlassian primary not read) | pricing/trajectory |
| 12 | Atlassian's "Strategy Collection" (Enterprise Strategy & Planning) bundles Focus (GA), Talent (new workforce planning) and Jira Align. | https://www.atlassian.com/blog/announcements/strategy-collection (search snippet) | Atlassian | 2025-2026 | 2026-09-19 | med | trajectory |
| 13 | August 2026 Focus release adds **Funds**: budgets, costs, benefits, forecasts and variance next to initiatives, with spend tracked in real time via the Teamwork Graph. Also **Strategic Intelligence** (AI, beta: flags at-risk priorities across Jira/Goals/Funds) and **Asks** (cross-team intake routed to priorities). Atlassian says only 11% of leaders have work connected to priorities. | https://www.atlassian.com/blog/leadership/innovation-spotlight-august-2026 | Atlassian (official) | 2026-08 | 2026-09-19 | high | trajectory/feature |
| 14 | Jira Align added labor-rate tracking in its 2026 updates. | Strategy Collection search snippet (innovation-spotlight-march-2026) | Atlassian | 2026-03 | 2026-09-19 | low-med | feature |
| 15 | Tempo Timesheets scores 4.4 on Capterra/GetApp. Complaints: rigid report customization, lag on large datasets, weak accounting integration, learning curve, "complex and pricey". Financial Manager is listed from "$1/month" (per user, tiered). | https://www.getapp.com/project-management-planning-software/a/cost-tracker/ ; https://www.capterra.com/p/190126/Tempo/reviews/ (aggregator snippets) | Capterra/GetApp | 2026 | 2026-09-19 | low-med (aggregator summary; review dates not seen) | sentiment/pricing |
| 16 | BigPicture on Capterra: "Contact vendor" pricing. Cons: slow/laggy, and crossing the free-seat tier means paying for every seat. Only 2 reviews, both 5★, from 2022–2024. | https://capterra.com/p/196907/BigPicture/ | Capterra | 2022-2024 (stale) | 2026-09-19 | med | sentiment |

## Answers to the owned questions
**Q1 Scheduling / baselines / resources / cost / portfolio**
- Jira Plans: cross-team timeline, finish-to-start dependencies and capacity (#8). No critical path (#8) and no baselines (#9). It has no native cost ledger.
- BigPicture: Gantt, portfolios, and baselines in the Enterprise edition, with 20 history records and Jira field sync (#5).
- Tempo splits the work across apps: Capacity Planner (resources), Timesheets (actuals), Financial Manager (cost, budget, revenue) (#1, #3). Its Structure product was not researched.
- Atlassian's top tier (Focus + Funds + Talent + Align) now covers portfolio finance (#12–14).

**Q2 Plan vs actual / unplanned work / MS Project import**
- Tempo is the strongest here. It does planned vs actual in hours (#3), and budget vs actual vs forecast in money, using logged time at rates (#1, #4).
- Tempo's plan vs actual is scoped to a Jira filter, or to time planned against issues/spaces. Neither doc mentions work logged outside the plan scope (#2, #3). "Over-plan" shows only as a variance colour.
- BigPicture compares baseline dates against the current schedule (#5). It did not show hour or cost reconciliation.
- Focus Funds tracks spend variance at initiative level (#13).
- MS Project import: BigPicture yes (#6). Jira Plans and Tempo: none found.

**Q3 Pricing**
- Jira Premium is about $18.30/user/month (#10; not verified on Atlassian's page).
- Data Center end of sale to new customers was 2026-03-30; end of life is 2029-03-28; DC prices rose ~15% (#11). This pushes everyone to cloud, which is relevant for Japanese on-prem shops.
- Tempo Financial Manager starts at $1/user/month (#15). BigPicture pricing is quote-only (#16).
- Marketplace per-tier prices were not retrieved.

**Q4 Complaints**
- Tempo: complex, pricey, rigid reports, lag on large data (#15).
- BigPicture: slow, and the seat cliff when leaving the free tier (#16, stale).
- No 2025–26 low-star Marketplace reviews were retrieved. This is a gap.

**Q5 Trajectory**
- Atlassian (Aug 2026): Focus Funds, the Strategic Intelligence AI beta, Asks, and the Strategy Collection bundle (#12, #13).
- Appfire (Aug 2026): BigPicture Advanced SPM edition with financial governance (#7).
- Both are moving upmarket into strategic portfolio management (SPM) and portfolio finance. Neither is moving into work-package ↔ ticket reconciliation.

## Reconciliation-wedge verdict for this cluster
**Partial.**
- Tempo (Financial Manager + Capacity Planner + Timesheets) keeps planned and actual separate for hours and money, fed by Jira worklogs (#1, #3). This is the closest incumbent to a baseline-vs-actual ledger.
- Its "plan" is resource time allocated to issues, spaces or filters. It is not a work breakdown structure (WBS) with a persistent work-package ↔ ticket mapping.
- No retrieved doc shows a report like "N tickets / X hours logged on issues that belong to no plan item" (#2, #3).
- BigPicture baselines cover schedule only (#5). Jira Plans has no baselines (#9). Focus Funds works at initiative/portfolio level, not ticket level (#13).
- The explicit, quantified unmapped-work view appears unowned in this cluster. This is unverified until someone checks Tempo's "unplanned"/zero-plan handling hands-on.
- None of these is multi-tracker (Backlog, Asana): all are Jira-only.

## Leads worth chasing (next round)
1. How Tempo handles worklogs with no planned allocation: the Capacity Planner "Planned vs Actual" grouping by issue/account, and the Financial Manager "unassigned"/"other" rows. Look at the Tempo Cloud release notes (https://www.tempo.io/updates/planned-vs-actual-release).
2. Focus Funds docs: are actuals fed from Jira worklogs or from finance imports? Does Talent/Align compute labor cost of Jira work not linked to any priority? The "11% connected" framing is exactly this gap.
3. BigPicture Advanced full release and BigPicture cost/budget module docs; check for any "unscheduled / outside-box tasks" report.
4. Planview AdaptiveWork / Portfolios Jira connector (not covered this round).
5. Atlassian Marketplace 1–3★ reviews for Tempo Financial Manager and BigPicture, 2025–2026.
6. Verify the Jira Premium price and the Data Center end-of-life dates on atlassian.com.

## Looked for but could not find
- Any doc from this cluster naming "unplanned work" / "unmapped issues" quantified in hours or cost.
- Verified Jira Premium pricing from Atlassian's own page (the fetch came back truncated).
- MS Project import for Jira Plans or Tempo.
- 2025–26 low-star Marketplace reviews.
- Planview's Jira integration details.
- Tempo Structure features.
