# Digest: Microsoft incumbent (Project desktop / Project Online / Planner premium) — round 1

## Findings
| # | claim | source URL | publisher | pub_date (YYYY-MM or unknown) | accessed | confidence (high/med/low) | class |
|---|---|---|---|---|---|---|---|
| 1 | Project Online retires Sept 30, 2026 (i.e. 11 days after access date); after that date the service and its data are no longer accessible. Retirement does not affect Project desktop, Project Server Subscription Edition, Planner or To Do. Microsoft names 3 migration paths: Planner premium (formerly Project for the web), Project Server SE (on-prem), Dynamics 365 Project Operations. | https://learn.microsoft.com/projectonline/migrate-to-project-online-from-project-server ; https://learn.microsoft.com/answers/a/12266340 | Microsoft Learn / MS Q&A moderator | unknown (banner current) | 2026-09-19 | high | trajectory |
| 2 | Project for the web was retired Aug 1, 2025; its capabilities continue as "premium plans" inside Microsoft Planner, built on Power Platform with data in Dataverse. | https://learn.microsoft.com/office365/servicedescriptions/project-online-service-description/project-web-service-description | Microsoft Learn | unknown | 2026-09-19 | high | trajectory |
| 3 | Plan 3 premium Planner includes dependencies with lead/lag, baselines, critical path, roadmaps, timeline (Gantt), sprints, custom fields, people view/team workload, goals, task history, custom calendars. Plan 1 = premium plans with Timeline/People/Goals views. | https://learn.microsoft.com/answers/a/12653922 ; https://learn.microsoft.com/planner/understand-planner-trial-and-license-assignments ; https://learn.microsoft.com/planner/planner-for-admins | Microsoft Learn / MS Q&A | unknown (Q&A 2026) | 2026-09-19 | high | feature |
| 4 | Planner premium has **no native budget/cost module**: no planned-vs-actual cost, cost rollups, cost resources. Microsoft's suggested workaround: ≤10 custom fields per plan, Power BI through Dataverse, or bringing actuals in from finance/time systems through Power Automate/APIs "using stable identifiers (Project Code or Task ID) for data mapping". For real actuals reconciliation, Microsoft points to Dynamics 365 Project Operations. | https://learn.microsoft.com/answers/a/12744045 | MS Q&A (Microsoft moderator answer) | 2026 (approx.) | 2026-09-19 | high | feature |
| 5 | Enterprise resource management features of Plan 5 are not available in Planner premium, and there is no known timeline for them (MVP answer). | https://learn.microsoft.com/answers/a/12033813 | MS Q&A (MVP) | unknown | 2026-09-19 | med | feature |
| 6 | Licensing: Project Plan 1 was renamed Planner Plan 1 (Apr 2024). Plan 3/5 were renamed "Planner and Project Plan 3/5" (Sept 18, 2024). The current Learn "Planner subscriptions" page lists only Plan 1 and Plan 3 as premium subscriptions. | https://learn.microsoft.com/planner/planner-for-admins ; https://learn.microsoft.com/planner/licensing | Microsoft Learn | unknown | 2026-09-19 | high | pricing |
| 7 | Message Center MC1253809: Project Plan 5 and Project Online Essentials are retired from sale (end of sale reported as May 1, 2026). Plan 5 customers move to Planner and Project Plan 3 (desktop + Planner premium), and Essentials customers move to Plan 1 or Project Server CALs. | https://pupuweb.com/mc1253809-planner-and-project-online-licensing-change-project-plan-5-and-project-online-essentials-retire-from-sale/ | PUPUWEB (reposts MS Message Center) | 2026-09 (dates inconsistent) | 2026-09-19 | med (secondary; corroborated by #6) | pricing/trajectory |
| 8 | List prices: Planner Plan 1 $10, Plan 3 $30, Plan 5 $55 per user/month (annual). Plan 3 adds the Project desktop client, roadmaps, baselines, resource requests and Copilot. Plan 5 adds portfolio management and enterprise resource management. | https://costbench.com/software/project-management/microsoft-planner/ (aggregator; the microsoft.com pricing page timed out) | Costbench / G2 aggregators | 2026 | 2026-09-19 | med (not verified on the primary page) | pricing |
| 9 | Project Professional 2024 perpetual license costs $1,129.99 (Microsoft Store listing; the US price for Standard 2024 was not confirmed). | https://www.microsoft.com/en-us/microsoft-365/p/project-professional-2024/cfq7ttc0ph40 (from search snippet) | Microsoft Store | unknown | 2026-09-19 | med | pricing |
| 10 | Timeline detail: Project Online-only SKUs stopped selling Oct 1, 2025. SharePoint 2013 workflows (used for governance/stage-gates) were retired Apr 2, 2026. There is no committed read-only window after Sept 30, 2026. | https://onplana.com/blog/microsoft-project-retirement-timeline-2026 ; https://epicflow.com/blog/ms-project-online-retirement/ | Onplana (competing vendor) / Epicflow | 2026-05 | 2026-09-19 | med | trajectory |
| 11 | Gaps vendors report in Planner premium compared with Project Online: 1 baseline (vs 11), no enterprise resource pool, **no timesheets / approved actuals / earned value**, no stage-gates or EPTs, no OData feed, 3,000-task cap per plan, 10 custom fields. | https://onplana.com/blog/microsoft-planner-premium-falls-short-enterprise ; https://onplana.com/blog/microsoft-project-retirement-timeline-2026 | Onplana (biased vendor) | 2026 | 2026-09-19 | med (partly corroborated by #4, #5) | sentiment/feature |
| 12 | Planner has no native Jira sync. Integration options are Power Automate (a generic Jira connector exists: learn.microsoft.com/connectors/jira), Zapier/Unito, or third-party apps such as "MS Planner to Jira Connector" (Crosstown Tech, on both the Atlassian and Microsoft marketplaces). These tools sync task status only; none were found to do reconciliation. | https://crosstowntech.com/apps/sync-microsoft-planner-with-jira/ ; https://marketplace.atlassian.com/apps/1237045/ms-planner-to-jira-connector | Crosstown Tech / Atlassian Marketplace | 2025–2026 | 2026-09-19 | med | feature |
| 13 | Microsoft's own plan-vs-actual tracking (planned vs actual effort, EAC, variance at WBS level) exists in **Dynamics 365 Project Operations**, fed only by Microsoft time sources (e.g. Field Service time, GA Jul 31, 2026), not by external trackers. | https://learn.microsoft.com/dynamics365/release-plan/2026wave1/enterprise-resource-planning/dynamics365-project-operations/track-real-project-progress-field-execution ; https://learn.microsoft.com/dynamics365/project-operations/prod-pma/work-breakdown-structures | Microsoft Learn | 2026 | 2026-09-19 | high | feature |
| 14 | Premium-plan friction: tasks assigned from premium plans get limited editing in "Assigned to me", so team members must open the premium plan to update them. | https://learn.microsoft.com/answers/a/12625624 | MS Q&A | 2026 (approx.) | 2026-09-19 | med | sentiment |
| 15 | Japan: Microsoft sells Plan 3 on a ja-JP page. Japanese MS Q&A threads cover the Project Online end of service. Sayama Keizai Kenkyujo (SRI) offers Project Online → Planner/Excel/Seavus Project Viewer migration support (PR Times, Oct 2025) and relaunched its own "Project+" cloud service, pitched as a Project Online equivalent. | https://www.sayamakeizai.co.jp/projectonlinetoplanner/ ; https://prtimes.jp/main/html/rd/p/000000002.000009095.html ; https://learn.microsoft.com/ja-jp/answers/questions/5901101/project-oline | SRI / PR Times / MS Q&A JP | 2025-10 | 2026-09-19 | med | traction |

## Answers to the owned questions
**Q1 — Retirement status and what premium Planner ships.**
- Project for the web retired Aug 1, 2025 (#2). Project Online retires Sept 30, 2026, with no read-only window promised (#1, #10). Its SharePoint 2013 governance workflows already stopped on Apr 2, 2026 (#10).
- Premium Planner (Plan 3) now has dependencies with lead/lag, critical path, a baseline, Gantt, sprints, roadmaps, team workload and Copilot (#3).
- It has no cost/budget module and no planned-vs-actual cost (#4), and no timesheets or approved actuals (#11).
- It also lacks an enterprise resource pool (#5, #11) and Project Online-grade portfolios (#11). Limits are 3,000 tasks per plan and 10 custom fields (#4, #11).
- For financial actuals, Microsoft points customers to D365 Project Operations (#4, #13).

**Q2 — Pricing and packaging.** Plan 1 is $10, Plan 3 $30, Plan 5 $55 per user/month (aggregator figures; the primary page could not be loaded) (#8). Direction of change is consolidation:
- Plan 5 and Project Online Essentials reportedly retired from sale in 2026 (#7).
- Learn now lists only Plan 1 and Plan 3 (#6).
- Plan 3 is the main SKU: Planner premium plus the Project desktop client.

Project Professional 2024 is still sold as a perpetual license at about $1,130 (#9). Desktop keeps working with local .mpp files after the Online service ends (#3 Q&A).

**Q3 — Jira/Asana/Backlog connectors and reconciliation.**
- There is no native Planner–Jira sync (#12). The options are a generic Power Automate Jira connector or third-party sync apps (Crosstown Tech, Unito, Zapier), all of which sync task status only (#12).
- No Asana or Backlog connector from Microsoft was found.
- Microsoft's own guidance for actuals is do-it-yourself: Power Automate/APIs plus a shared "stable identifier" mapping into custom fields or Dataverse, then Power BI (#4). This is effectively an admission that no product feature does it.
- Native plan-vs-actual effort tracking exists only in D365 Project Operations, fed from Microsoft time sources (#13).

**Q4 — Sentiment 2025–2026.** Loud criticism comes mainly from migration vendors, who have a commercial interest in it: a "downgrade for PMOs", silent task drops at 3,000, no timesheets, a single baseline (#11). First-hand friction appears in MS Q&A threads: premium task edit limits (#14), no budget module (#4), no ETA for resource features (#5). No Reddit, G2 or Capterra 1–3★ reviews were retrieved this round (see below).

**Q5 — Japan.** Microsoft sells Plan 3 directly in Japan, and Japanese MS Q&A threads discuss the Project Online end of service (#15). A local partner, SRI, sells migration paths and its own Project Online-equivalent cloud service (#15). This suggests demand from stranded Japanese Project Online customers. How big the installed base is remains unquantified.

## Reconciliation-wedge verdict for this cluster
**No.** Nothing in the Microsoft stack counts tracker (Jira/Backlog/Asana) work that is unmapped to a plan, in hours or money:
- Planner premium has a baseline but no actuals ledger: no timesheets and no planned-vs-actual cost (#4, #11).
- Microsoft's documented path for external actuals is a do-it-yourself Power Automate + custom-field + Power BI setup keyed on a shared ID (#4).
- Jira sync tools only sync status (#12).

**Partial** only in D365 Project Operations. It keeps separate baseline/planned and actual effort and cost views (EAC, variance), but only from Microsoft-native time sources, at ERP-class cost and complexity (#13).

The retirement makes things worse for plan-vs-actual. Project Online's timesheet/actuals and multiple baselines disappear on Sept 30, 2026, and nothing in Planner replaces them (#10, #11). That leaves a window to target stranded PMOs, including Japan (#15).

## Leads worth chasing (next round)
1. Pull the primary MC1253809 text and the Microsoft 365 roadmap filtered on Planner. Check whether portfolios, timesheets, multiple baselines or a Jira connector are on the 2026–27 roadmap, and confirm the Plan 5 end-of-sale date.
2. Look at Crosstown Tech "MS Planner to Jira Connector" reviews and features: does it map Jira worklogs to Planner tasks or report unmapped issues?
3. Size SRI "Project+" in Japan and other JP migration partners, and check ITreview reviews for Microsoft Project/Planner.
4. Collect first-hand sentiment from Reddit r/MicrosoftProject and G2 1–3★ Planner reviews (last 12 months).

## Looked for but could not find
- Full text of the official Tech Community retirement announcement (the fetch returned only the title).
- The primary microsoft.com Planner pricing page (the fetch timed out). Prices are from aggregators.
- Any Microsoft-built connector for Asana or Backlog (Nulab).
- Any Microsoft feature that flags or quantifies tracker work that isn't mapped to a plan.
- First-hand Reddit/G2/Capterra user reviews for 2025–26 (the search returned vendor blogs instead).
- The US price of Project Standard 2024.
