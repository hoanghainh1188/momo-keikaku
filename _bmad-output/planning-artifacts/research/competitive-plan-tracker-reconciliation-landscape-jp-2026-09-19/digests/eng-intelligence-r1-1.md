# Digest: Engineering intelligence / SEI platforms (Jellyfish, LinearB, Swarmia; DX, Faros, Allstacks) — round 1

Budget used: 15 tool calls (6 searches, 7 page fetches, plus search-snippet evidence). Accessed date for all rows: 2026-09-19.

## Findings
| # | claim | source URL | publisher | pub_date | accessed | confidence | class |
|---|---|---|---|---|---|---|---|
| 1 | Jellyfish allocates effort in FTE units, inferred from tickets, commits, reviews and workflows, then combined with roster/payroll/cost data to produce cost allocation and capitalizable work. It calls this a "patented Allocations data model" that replaces timesheets. | https://jellyfish.co/platform/rd-cost-capitalization-2/ ; https://jellyfish.co/blog/rd-cost-capitalization-methods/ | Jellyfish | unknown | 2026-09-19 | med (search snippets of official pages, not full read) | feature |
| 2 | Jellyfish "Deliverables" show cost, FTEs, contributors, target date and projected completion date per deliverable (epic/initiative). | https://jellyfish.co/solutions/business-alignment/ (search snippet) | Jellyfish | unknown | 2026-09-19 | med | feature |
| 3 | Jellyfish's integrations catalog lists issue trackers Jira, Linear and Azure Boards only. No Asana, Backlog (Nulab), MS Project or Smartsheet, and no APAC/Japan content. (A search snippet also mentions Productboard, so that integration may exist but is unconfirmed.) | https://jellyfish.co/integrations/ | Jellyfish | unknown (live page) | 2026-09-19 | high for listed items, med for absences | feature |
| 4 | Jellyfish reported more than 700 customers in a May 2026 announcement. Its last disclosed funding is the Series C (2022), about $114M total. No 2026 acquisition was found. | https://jellyfish.co/newsroom/... (search snippet); https://tracxn.com/d/companies/jellyfish/... | Jellyfish / Tracxn | 2026-05 | 2026-09-19 | med | trajectory/traction |
| 5 | LinearB Resource Allocation works as "per person, per issue, per day". If a developer has several active issues in a day, the day is split equally. 30 days = 1 FTE. Cost = FTE × average salary. | https://linearb.helpdocs.io/article/npdalbbe4e-resource-allocation-1 | LinearB docs | unknown | 2026-09-19 | high | feature |
| 6 | In LinearB, work with no linked PM item shows as "Uncategorized", and there is an "Issues With No Epics" metric. Supported PM tools: Jira and Azure Boards only, with 6 months of history. The Resource Allocation doc has no comparison against a planned baseline. | same as #5 | LinearB docs | unknown | 2026-09-19 | high | feature |
| 7 | The LinearB Project Delivery Tracker defines planned work as issues/points in the sprint at start, and "added" work as items added more than 24h after sprint start. It reports Planning Accuracy (completed planned / total planned) and Capacity Accuracy (planned plus unplanned completed vs. planned). This is at sprint level and counts issues/story points, not hours or cost. | https://linearb.helpdocs.io/article/g4czwado46-understanding-project-delivery-trackers | LinearB docs | unknown | 2026-09-19 | high | feature |
| 8 | LinearB pricing: Essentials $29/user/mo (min 50 devs, GitHub Cloud only); Enterprise $59/user/mo (min 100 devs). Resource Allocation, Cost Capitalization and Monte Carlo Project Forecasting are Enterprise only. Both plans carry AI credits (AI code review, AI impact, MCP server). Annual billing only. | https://linearb.io/pricing | LinearB | live page (≤3 mo) | 2026-09-19 | high | pricing |
| 9 | Swarmia effort model: at most 1 FTE per developer per month, spread across all issues and PRs the developer touched that month. | https://help.swarmia.com/features/focus/balance-engineering-investments/activity-and-effort-based-models | Swarmia docs | unknown | 2026-09-19 | high | feature |
| 10 | Changelog 2026-06-16: Swarmia added cost to Investment Balance and Focus Summary. Cost = FTE-months × an admin-set yearly average cost per developer (EUR/USD). | https://www.swarmia.com/changelog/2026-06-16-fte-cost/ | Swarmia | 2026-06 | 2026-09-19 | high | feature/trajectory |
| 11 | Swarmia's software capitalization counts only work linked to issues ("each line item... documentation in the form of an issue"). Developers verify their own activity. | https://help.swarmia.com/features/capitalize-software-development-costs (search snippet) | Swarmia docs | unknown | 2026-09-19 | med | feature |
| 12 | Swarmia pricing: Standard $45/dev/mo and Enterprise $55/dev/mo (annual). Free under 10 devs. À la carte: Software capitalization $18, AI adoption & cost $5, Surveys $9, Productivity & AI impact $23. Billed per developer in teams; PMs are not billed. Trackers include Jira, Linear and Azure Boards. | https://www.swarmia.com/pricing/ | Swarmia | live page (≤3 mo) | 2026-09-19 | high | pricing |
| 13 | Atlassian acquired DX for about $1B (announced Sep 2025, closed Nov 2025). DX is being folded into Atlassian's Software Collection and Rovo. It had more than 350 enterprise customers. The pitch centres on measuring AI investment and developer productivity. | https://www.businesswire.com/news/home/20251110683591/en/... ; https://www.atlassian.com/blog/announcements/atlassian-acquires-dx | Business Wire / Atlassian | 2025-11 / 2025-09 | 2026-09-19 | high (older than 6 mo; context only) | trajectory |
| 14 | Third-party comparison blogs say allocation accuracy "depends on ticket hygiene" (commits to tickets to initiatives) and that the category suffers from developer surveillance perception. They describe Jellyfish as CFO-oriented with low adoption among engineering managers and developers. These are vendor/aggregator blogs, not first-hand reviews. | https://codepulsehq.com/guides/engineering-analytics-tools-comparison ; https://wetheflywheel.com/en/comparisons/linearb-vs-jellyfish-vs-swarmia/ | competitor/aggregator blogs | 2026 | 2026-09-19 | low | sentiment |
| 15 | Swarmia prices typically run lower than LinearB at negotiated deal level (about $240–450/dev/yr ranges). Aggregator data. | https://www.vendr.com/marketplace/swarmia ; https://www.vendr.com/marketplace/linearb | Vendr | 2026 | 2026-09-19 | low | pricing |

## Answers to the owned questions

**1. What they measure.**
- All three measure investment/effort allocation by category (#1, #5, #9) and R&D cost capitalization (#1, #8, #11, #12).
- Planned vs. unplanned is measured only at sprint scope: LinearB counts issues added more than 24h after sprint start, with Planning/Capacity Accuracy (#7).
- Delivery forecasting is tied to epics/deliverables: Jellyfish projected completion (#2), LinearB Monte Carlo (#8). Neither forecasts against a formal baseline schedule.

**2. How effort and cost are computed.**
- All three infer effort from Git plus tracker activity. Nobody uses time logs.
- LinearB splits each person-day equally across the issues active that day (#5). Swarmia caps each developer at 1 FTE per month, spread across the issues and PRs they touched (#9). Jellyfish uses its patented allocation model (#1).
- Cost is FTE × average salary (LinearB #5, Swarmia #10) or payroll/roster data (Jellyfish #1).
- So they can express cost for "uncategorized" work, but only as a proxy derived from activity. They do not measure hours.

**3. Plan ingestion and tracker coverage.**
- No evidence that any of them ingests MS Project, Gantt charts or baselines.
- The planning objects they use are Jira/Linear/Azure Boards epics and initiatives (#3, #6, #12).
- Asana and Backlog (Nulab) are not listed for Jellyfish (#3). LinearB supports Jira and Azure Boards only (#6). Swarmia's page lists Jira, Linear and Azure Boards (#12).

**4. Pricing, buyer and minimum sizes.**
- LinearB: $29–59/dev/mo with 50/100-dev minimums. Allocation, capitalization and forecasting are Enterprise only (#8).
- Swarmia: $45–55/dev/mo, or $18 à la carte for capitalization; free under 10 devs (#12).
- Jellyfish: pricing not retrieved.
- Buyers are the VP Eng / CTO, with finance pulled in for capitalization (#1, #14). None is positioned for a PMO.

**5. Complaints.**
- Only low-confidence evidence was found: surveillance perception, accuracy dependent on ticket hygiene, and low adoption below the CFO/VP level (#14).
- No first-hand G2 1–3★ reviews were read this round, so this is a gap.

**6. Trajectory.**
- The category is pivoting hard to AI-impact measurement: LinearB AI credits and MCP (#8), Swarmia AI à la carte (#12), Jellyfish's AI-tool integrations list (#3).
- Swarmia added cost in June 2026 (#10). Jellyfish reported 700+ customers in May 2026 (#4). Atlassian now owns DX (#13).
- No Japan/APAC presence found (#3).

## Reconciliation-wedge verdict for this cluster

**Partial, and no on the core.**
- These tools do surface tracker work that isn't linked to an epic ("Uncategorized", "Issues With No Epics", #6). They also put a cost on work (FTE × salary, #5, #10) and report sprint scope-creep counts (#7). Together that is the nearest analogue to "X tickets / $Y not in plan".
- But the "plan" they compare against is the tracker's own epic/sprint hierarchy, not an external PMI plan with work packages.
- Effort is inferred FTE, not hours.
- None of them keeps separate baseline vs. actual ledgers, ingests MS Project or Gantt baselines, or supports Backlog or Asana (#3, #6, #12).
- The wedge is not owned here. The risk is that these vendors could easily add an "unmapped cost" report because they already compute FTE-cost per issue.

## Leads worth chasing (next round)
- Jellyfish docs on "Scenario Planner" / capacity planning and whether deliverables can hold a planned-effort baseline. Also Jellyfish pricing via Vendr.
- Read G2 1–3★ reviews for Jellyfish, LinearB and Swarmia (2025–2026) directly. Check whether Swarmia or LinearB have any Japanese customers or resellers.
- Faros AI (custom data model and connectors; may ingest arbitrary sources such as Asana) and Allstacks (forecasting against roadmap) were not checked this round.
- Check the Swarmia docs for how the cost of unlinked PRs is reported, and whether that cost is surfaced as a separate bucket.

## Looked for but could not find
- Jellyfish list pricing.
- Any SEI support for Backlog (Nulab), Asana, MS Project or baseline import.
- A Japan/APAC office or localization for any of the three.
- First-hand 2025–2026 customer reviews (not retrieved).
- Allstacks and Faros feature detail (budget exhausted).
