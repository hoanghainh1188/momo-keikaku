# Digest: Sync / integration tools bridging MS Project and trackers — round 1

Budget used: 14 tool calls (WebSearch/WebFetch), 7 sources read in full (plus search snippets).

## Findings
| # | claim | source URL | publisher | pub_date (YYYY-MM or unknown) | accessed | confidence (high/med/low) | class |
|---|---|---|---|---|---|---|---|
| 1 | Ceptah Bridge is an MS Project plug-in doing two-way (or both at once) import/export/sync of Jira issues and MS Project tasks; changes can be previewed and approved before applying; works with local .mpp files and Project Server/Project Online; Jira Cloud/Server/DC. | https://www.ceptah.com/ | Ceptah (vendor) | unknown | 2026-09-19 | high | feature |
| 2 | Ceptah Bridge updates MS Project "overall and actual work, including task usage" from Jira worklogs and estimates; supports Tempo Timesheets; baseline initialisation/update listed under time tracking. | https://www.ceptah.com/ | Ceptah (vendor) | unknown | 2026-09-19 | med (vendor page, not verified in docs) | feature |
| 3 | Ceptah pricing: annual subscription from $360 (1 user) to $3,120 (20 users); custom quote above 20 users. So it is priced per MS Project user (the planner), not per Jira user. | https://www.ceptah.com/ | Ceptah (vendor) | unknown | 2026-09-19 | med (page date unknown) | pricing |
| 4 | Ceptah on Atlassian Marketplace: 4.4/5 from 16 reviews, 5,157 downloads, v3.19.1 released 2026-06-01 (bug fix for activation); Partner Supported; Jira Server/DC up to 11.3.11. | https://marketplace.atlassian.com/apps/9203/ceptah-bridge-jira-ms-project-plugin | Atlassian Marketplace | 2026-06 | 2026-09-19 | high | traction |
| 5 | No evidence that Ceptah detects Jira issues that are not linked to any plan task. Neither vendor page mentions it. | https://www.ceptah.com/ ; Marketplace listing | Ceptah / Atlassian | unknown | 2026-09-19 | low (absence of evidence) | feature |
| 6 | TPG PSLink (The Project Group) is middleware that links Jira two-way with MS Project Server/Online (and Planisware): work packages go from plan to Jira as Versions/Epics/Issues; completion progress and recorded effort flow back from Jira; Jira worklogs are read and can be passed to SAP CATS for cost allocation. | https://www.theprojectgroup.com/en/middleware/jira-integration | The Project Group (vendor) | unknown | 2026-09-19 | med | feature |
| 7 | PSLink page gives no pricing, no baseline-vs-actual ledger, and no detection of unmapped issues. | same as #6 | TPG | unknown | 2026-09-19 | low (absence) | feature |
| 8 | "MS Planner to Jira Connector": one-time or automated sync (Planner→Jira, Jira→Planner, or both) checked every 5 minutes; only manages items it created and never deletes. Docs do not list the synced fields. | https://msplannertojira.gitbook.io/docs/basics/sync-types | MS Planner to Jira Connector (vendor docs) | unknown | 2026-09-19 | med | feature |
| 9 | Planview Hub (formerly Tasktop) has a Microsoft Project Server connector and a Jira connector (60+ systems in total). Marketing says status, default/custom fields, comments, attachments and relationships sync. No hour rollup or unmapped-work claim found. | https://www.planview.com/products-solutions/products/hub/integrations/microsoft-project-server/ | Planview | unknown | 2026-09-19 | med (snippet only, page not read) | feature |
| 10 | OpsHub (OIM) connects Jira to Azure DevOps, ServiceNow, GitHub, Clarity PPM and 60+ tools. No MS Project Online connector was found in this run. | https://www.opshub.com/integrations/jira-integration/ | OpsHub | unknown | 2026-09-19 | low (search snippet) | feature |
| 11 | Getint syncs Jira, ADO, ServiceNow and others two-way, including worklogs. No MS Project connector was found. | https://www.getint.io/integrations/jira-azure-devops | Getint | unknown | 2026-09-19 | low (search snippet) | feature |
| 12 | Unito prices by connectors, "items in sync" (each synced item counts twice, once per side) and features. Self-serve Basic/Pro plans sync every 5–15 minutes; Enterprise adds on-prem connectors and historical data sync. Exact prices are shown only in the app. No MS Project or Planner connector is named on the pricing page. | https://unito.io/pricing/ | Unito | unknown (live page) | 2026-09-19 | high | pricing |
| 13 | Third-party figure for Unito: Basic about $65/mo (750 items) and Pro $299/mo (2,500–10,000 items). | https://www.notelinker.com/unito-pricing | NoteLinker (aggregator) | 2026 | 2026-09-19 | low (aggregator) | pricing |
| 14 | Exalate launched a "New Exalate" with AI assistant Aida (AI scripting, onboarding, troubleshooting, chat-based "Conversation Mode" in early access). Pricing changed from per instance to outcome-based: active items in sync, per connection. | https://exalate.com/blog/new-exalate-experience/ | Exalate | unknown (2025–26) | 2026-09-19 | med (search snippet) | trajectory / pricing |
| 15 | Exalate connectors listed in docs: Jira, Azure DevOps, ServiceNow, Zendesk, GitHub, Salesforce, Freshdesk, Freshservice, Asana, Xurrent. MS Project and Planner are not listed. Plans are named Starter/Scale/Pro/Enterprise, and aggregators cite roughly $100–$550/mo. | https://docs.exalate.com/docs/new-exalate-pricing-model | Exalate docs | unknown | 2026-09-19 | med | pricing / feature |
| 16 | Unito on Capterra: 4.5/5 from 22 reviews, 9% negative. Complaint themes are a sync outage lasting over a month with slow support, cost ("$19 … to $374 / MONTHLY for a sync tool"), and confusing setup. Review dates were not captured. | https://www.capterra.com/p/147319/Unito/ | Capterra | unknown | 2026-09-19 | med (dates unknown, may be stale) | sentiment |
| 17 | Backlog (Nulab) has no native sync with MS Project. Nulab positions Backlog as an alternative to MS Project, and its Microsoft integrations are Teams, Copilot and OneDrive. | https://nulab.com/compare/backlog-vs-microsoft-project/ ; https://nulab.com/blog/product-updates/backlog/microsoft-copilot-integration/ | Nulab | unknown | 2026-09-19 | med (snippets) | positioning |
| 18 | No Japanese-language third-party connector for Backlog to MS Project was found. JP articles treat Backlog's own Gantt chart as the substitute. | https://backlog.com/ja/function/ganttchart/ | Nulab JP | unknown | 2026-09-19 | low (absence) | positioning |

## Answers to the owned questions
**Q1. Which tools sync MS Project / Planner with trackers?**
- **MS Project desktop/Online ↔ Jira:** the dedicated tools are Ceptah Bridge (two-way, all MS Project fields, worklogs, estimates, % complete, dates, preview-before-apply) (#1, #2, #4) and TPG PSLink (two-way for Project Server/Online; worklogs read-only; effort and progress flow back into the plan) (#6).
- **Planner ↔ Jira:** covered by the small "MS Planner to Jira Connector" (one-way or two-way; fields not documented) (#8).
- **Enterprise hubs:** Planview Hub covers Project Server ↔ Jira (#9).
- **No MS Project connector found:** Exalate, Unito, Getint and OpsHub are tracker-to-tracker tools. Their links to Asana and Jira exist, but no MS Project link was found (#10–#12, #15).
- **Backlog (Nulab):** no MS Project connector found anywhere (#17, #18).

**Q2. Anything beyond sync?**
- **Partial.** Ceptah rolls Jira worklogs and estimates into MS Project actual work and task usage, and says it supports baseline initialise/update (#2).
- PSLink pulls recorded effort into the plan and pushes worklogs to SAP for cost allocation (#6).
- Both only handle items that are already mapped. No tool documents detecting tracker issues outside the plan (#5, #7).
- The Planner connector explicitly manages only the items it created (#8). Unmapped work is invisible by design.

**Q3. Pricing and packaging**
- **Ceptah:** per planner seat, $360–$3,120/yr (#3).
- **Unito:** metered by items in sync, counted on both sides; opaque in-app pricing (#12, #13).
- **Exalate:** moved from per-instance to per-connection, active-items outcome-based pricing, with AI bundled (#14, #15).
- **Planview Hub and PSLink:** enterprise quotes only; no public pricing found.

**Q4. Complaints (1–3★)**
- Only Unito's were captured: a month-long outage, cost for a "single-function" tool, and confusing setup (#16). Review dates were not captured, so treat as possibly stale.
- Ceptah's 4.4★ over 16 reviews suggests a small user base (#4); its low-star reviews were not read.
- No 2025–26 G2 or Marketplace negatives were retrieved for Exalate, Getint or Planview Hub.

**Q5. Trajectory**
- Exalate: AI assistant Aida plus outcome-based pricing (#14).
- Ceptah is maintained but incremental (v3.19.1, 2026-06, bug fix) (#4).
- No funding or acquisition signals were found in this run for Getint, Unito or OpsHub.

## Reconciliation-wedge verdict for this cluster
**PARTIAL, and only on the "actuals feed" half.**
- **Actuals feed (covered):** Ceptah Bridge (#2) and TPG PSLink (#6) already roll Jira worklog hours into MS Project actual work on mapped tasks. Ceptah also claims baseline handling, so "tracker hours → plan actuals" is not new for Jira + MS Project.
- **Unmapped work (not covered):** nothing retrieved quantifies tracker work that is unmapped to any plan task, whether as a count, hours or money. Every tool only processes items it created or linked (#5, #7, #8).
- **Separate baseline vs actual ledgers:** no evidence that any tool keeps them as a product concept. The ledgers live inside MS Project itself.
- **Backlog (Nulab):** no bridge to MS Project exists at all (#17, #18). This is a clean gap for the Japan and Japan–Vietnam market.

## Leads worth chasing (next round)
1. Ceptah docs and release notes: check exactly how the baseline handling and the worklog → actual work / timephased task usage mapping work, and whether a "Jira issues not in plan" query or report exists. Also read its 1–3★ Marketplace reviews.
2. TPG PSLink / TPG Japan presence, plus other Project Online middleware (e.g. Onepoint, Sensei, FluentPro "Integration Hub" for Project Online ↔ Jira/Asana). FluentPro was not checked this round.
3. The Project Online retirement timeline, and whether Planner "premium plans" has any Jira or Asana connector with hours. This decides whether MS Project–side bridges are a shrinking market.
4. Japanese Backlog middleware: Backlog API tools on ITreview, and SI vendors' Excel/WBS ↔ Backlog sync tools (e.g. the "Backlog WBS" add-in).
5. Asana ↔ MS Project connectors (e.g. Project Plan 365, ProjectManager.com importers).

## Looked for but could not find
- Any tool that reports tracker tickets unlinked to plan tasks in hours or cost.
- Any MS Project ↔ Backlog connector, in English or Japanese.
- OpsHub and Getint MS Project connectors.
- Public pricing for Planview Hub and PSLink.
- Dated 2025–26 low-star reviews for Exalate, Getint and Ceptah.
- Funding or acquisition news from the last 6 months for Getint, Unito, OpsHub and Exalate.
- Field lists for the Planner–Jira connector.
