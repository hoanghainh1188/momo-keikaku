# Digest: verify-wedge (MS Project Online retirement, Engineerforce, Tempo, Ceptah, broad "unplanned work" sweep) — round 2

Budget used: 15 tool calls (8 searches incl. 1 Microsoft Learn search, 7 fetches; 2 fetches failed: techcommunity blog returned no content, a guessed learn.microsoft.com URL returned 404). Accessed date for all rows: 2026-09-19.

## Findings
| # | claim | source URL | publisher | pub_date | accessed | confidence | class |
|---|---|---|---|---|---|---|---|
| 1 | Microsoft Learn Project Online admin pages carry a banner: "Microsoft Project Online will be retired on September 30, 2026", linking to the Planner blog announcement | https://learn.microsoft.com/projectonline/get-started-with-project-online (same banner on ~8 Project Online admin pages; service description says "retired in September 2026") | Microsoft (official docs) | unknown (live banner) | 2026-09-19 | high | trajectory |
| 2 | Microsoft Q&A accepted answer (Microsoft support agent): retirement on September 30, 2026; "After September 30, 2026, Project Online and its data will no longer be accessible"; does not affect Project desktop, Project Server SE, Planner; alternatives are Planner Premium, Project Server SE, Dynamics 365 Project Operations | https://learn.microsoft.com/answers/a/12266340 | Microsoft (Q&A, staff answer) | unknown | 2026-09-19 | high | trajectory |
| 3 | The official announcement is the Planner blog post "Microsoft Project Online is retiring: What you need to know" (ID 4450558); its content could not be fetched this run | https://techcommunity.microsoft.com/blog/plannerblog/microsoft-project-online-is-retiring-what-you-need-to-know/4450558 | Microsoft Tech Community | unknown (fetch failed; ID suggests ~2025-09) | 2026-09-19 | med (existence only) | trajectory |
| 4 | Partners and press independently repeat the Sept 30, 2026 date. Search snippets add: no new customer sales from Oct 1, 2025, no new tenants from April 2026, "a hard stop, not a phased sunset", and data must be exported first. These are snippets only; the pages were not read | https://www.velosio.com/blog/microsoft-project-online-retirement-what-to-do-before-september-30-2026/ ; https://www.epicflow.com/blog/ms-project-online-retirement/ ; https://easi.its.utoronto.ca/project-online-retiring-september-30-2026/ | Velosio (MS partner), Epicflow (vendor), Univ. of Toronto EASI | unknown | 2026-09-19 | med | trajectory |
| 5 | Engineerforce 2021 release: the estimate pushes to Jira as epics/stories, and worklogs are compared to estimated effort per task. The release says it surfaces work "not anticipated as tasks" (タスクとして見込まれていなかった作業) | https://ascii.jp/elem/000/004/049/4049610/ | ASCII.jp (PR Times redistribution of company release) | 2021-03 | 2026-09-19 | high (for 2021 claim); stale | feature |
| 6 | Engineerforce (founded Aug 2020, Tokyo) now presents itself as a UI/UX design, app development and consulting agency ("新規事業の共創パートナー"): 150+ clients, 200+ projects, a no-code development service, and a toB checklist tool. The homepage has a "製品" login link (app.engineerforce.io) but no visible estimation or Jira 予実 product description | https://engineerforce.io/ | Engineerforce (company site) | unknown (current) | 2026-09-19 | med | positioning |
| 7 | Search snippets (not read): no-code development service launched 2025-10-01; engineer job posting ended July 2025 | https://tenshoku.mynavi.jp/company/410355/ ; search summary | Mynavi / search | 2025 | 2026-09-19 | low | trajectory |
| 8 | Tempo Financial Manager (formerly Cost Tracker): a Jira filter defines project scope, and you "re-sync" the project to that filter to pick up new or deleted work items. The FAQ does not mention how worklogs outside the filter are handled, and has no report of unscoped or unplanned worklogs. Subtask hours count only if the filter includes the subtasks; future-dated hours are excluded | https://help.tempo.io/financialmanager/latest/cost-tracker-faq | Tempo (official help) | unknown | 2026-09-19 | high (for absence in FAQ) | feature |
| 9 | Tempo Planner (Capacity Planner) "Planned vs Actual" report compares planned hours with actual logged hours and shows the variance. Logged time above plan is colored yellow. With "View All Worklogs", time from spaces not linked to the team is also included. Unplanned time is not broken out as a separate line | https://help.tempo.io/planner/latest/planned-vs-actual-reports | Tempo (official help) | unknown | 2026-09-19 | high | feature |
| 10 | Ceptah Bridge: task↔issue linkage uses the issue key stored in a task custom field (Text10 by default). For unlinked tasks, "create" is scheduled; "Synchronise Existing" syncs only already-linked items; "skip" excludes a task | https://www.ceptah.com/Guide/Synchronisation (+ search snippets of ceptah.com/KB/GettingStarted) | Ceptah (official docs) | unknown | 2026-09-19 | high | feature |
| 11 | Ceptah Bridge time tracking: Time Spent maps to MS Project Actual Work. Work Log can map to daily Task Usage actual work, per assignee or per task. Remaining estimate syncs in both directions. For every time-tracking mapping, the note on an unlinked task is "Has no effect". There is an import path that creates tasks from issues, but no report of unlinked issues or worklogs. The page does not mention baselines | https://www.ceptah.com/Guide/TimeTrackingMappings | Ceptah (official docs) | unknown | 2026-09-19 | high | feature |
| 12 | Atlassian's public tracker has a feature request, "Planned vs Unplanned Issues in Sprint Report" (planned vs unplanned hours per sprint). This is evidence that native Jira does not offer it; ticket status was not read | https://jira.atlassian.com/browse/JSW-11327 | Atlassian (public issue tracker) | unknown | 2026-09-19 | med | sentiment |
| 13 | Broad sweep ("unplanned work" + plan vs actual + Jira + Gantt) found only Tempo, ActivityTimeline, BigPicture and Structure-style planned-vs-actual reports, all variance by person or issue. None advertises "tracker work not mapped to any plan task, in hours or cost" | https://activitytimeline.com/blog/how-to-create-planned-vs-actual-chart-for-jira ; https://www.tempo.io/blog/the-planned-vs-actuals-report-in-jira-with-tempo | ActivityTimeline, Tempo (vendor blogs) | unknown | 2026-09-19 | med (single sweep) | positioning |

## Verification outcomes
1. **Project Online retires on September 30, 2026: VERIFIED.** Microsoft's official docs banner (#1), a Microsoft staff Q&A answer (#2), and independent partner and university sources (#4) all give this date. Today is 2026-09-19, so retirement is 11 days away.
   **No read-only period: PARTIALLY VERIFIED (lean yes).** Microsoft staff say that after Sept 30, 2026 "Project Online and its data will no longer be accessible" (#2). A partner snippet calls it "a hard stop, not a phased sunset" (#4, not read in full). No retrieved Microsoft text says the words "no read-only period". The official blog post (#3) could not be fetched, so the precise wording remains unverified.
2. **Engineerforce 2021 compared Jira actuals to estimates and flagged unplanned tasks: VERIFIED for 2021** (#5). The claim is stale (2021).
   **Still operating in 2025–2026: VERIFIED for the company. The product is UNVERIFIED and likely de-emphasized** (#6, #7). The company now presents as a design and development agency. The homepage keeps a product login link, but there is no current description of the 予実 or Jira product. Treat it as a probably dormant or pivoted former competitor, not an active one.
3. **Tempo handles out-of-scope worklogs by excluding them silently; there is no "unplanned/unscoped" report: VERIFIED as far as official docs go** (#8, #9).
   - Financial Manager scope is filter-based, and the FAQ does not mention handling or reporting worklogs outside the filter.
   - Planner's Planned vs Actual report shows total actual against planned, with overage colored yellow. It does not separate unplanned hours.
   - This rests on the absence of the feature in the docs we read. Other Tempo pages were not exhaustively checked.
4. **Ceptah Bridge does not report Jira issues or worklogs unlinked to MS Project tasks: VERIFIED** (#10, #11). Time sync has "no effect" for unlinked tasks. Ceptah can import issues as new tasks, which covers creation but gives no reconciliation report.
   **Baseline handling: UNVERIFIED.** Neither doc page read mentions baselines. Actuals flow into MS Project's Actual Work and timephased Task Usage, so any baseline would be MS Project's native one.
5. **A product that explicitly quantifies "unplanned / not-in-plan" tracker work in hours or cost against a Gantt/WBS: NOT FOUND (unverified absence).** In one broad sweep, the closest matches were:
   - Tempo's overage coloring (#9)
   - Engineerforce's 2021 claim that it surfaces unanticipated work (#5), now likely dormant
   - Atlassian's open feature request (#12)

## Answers to the owned questions
- **MS Project Online (#1–4):** The Sept 30, 2026 hard stop is confirmed by Microsoft docs and staff. Wording elsewhere suggests data becomes inaccessible immediately, with no grace period, but we could not read the official blog to confirm "no read-only period". This is a live, time-boxed migration trigger. MS Project desktop and Project Server SE users are unaffected.
- **Engineerforce (#5–7):** It is the only retrieved product that explicitly claimed to surface "work not anticipated as tasks" from Jira against an estimate, and that claim dates from 2021. Today the company markets agency services. The product may still exist behind the login, but nothing shows it being actively marketed.
- **Tempo (#8–9):** Scope is a Jira filter. Worklogs outside the filter are not in the project, and the docs describe no report for them. Planned vs Actual is capacity-based (per person or team), not per plan task, and it lumps unplanned time into total actual.
- **Ceptah (#10–11):** Ceptah is sync plumbing: key-in-custom-field linkage and Time Spent → Actual Work. Unlinked items are ignored for time tracking. There is no reconciliation or unmapped-work report, and baselines are not mentioned in its docs.
- **Broad sweep (#12–13):** The market pattern is "planned vs actual per person or issue". A per-plan-task mapping with an "orphan tickets/hours" ledger did not appear.

## Reconciliation-wedge verdict for this cluster
**Partial overlap only, not owned.**
- Nothing retrieved today quantifies tracker work that is unmapped to a plan, in hours or cost, as a first-class report.
- Tempo excludes out-of-filter work silently (#8), and its variance report only colors overage (#9).
- Ceptah syncs actuals only for linked tasks and ignores the rest (#11).
- Engineerforce made the closest claim ("unanticipated work" visible, #5), but it is from 2021 and the company has since pivoted to agency services (#6).
- No retrieved source keeps separate baseline and actual ledgers fed by tracker data outside MS Project's native baseline, and Ceptah feeds actuals into that native baseline model.

## Leads worth chasing (next round)
- Log into or check the app.engineerforce.io product page, or search "Engineerforce 見積 SaaS 終了" / PR Times 2023–2025, to confirm whether the 予実 product is sunset.
- Fetch the Tempo Financial Manager "Project scope" and "Unplanned/Other worklogs" docs, and the Tempo Timesheets "logged time outside project" reports, to confirm there is truly no unscoped-worklog view.
- Read the Microsoft Tech Community announcement (#3) via another route (e.g., Microsoft Lifecycle "Ending Support in 2026" page) for the exact data-deletion and read-only wording.
- Check whether BigPicture or Structure (Jira) has a "tasks not in plan/box" view with hours.
- Check JSW-11327's status and vote count as a demand signal.

## Looked for but could not find
- A Microsoft primary text explicitly saying "no read-only period" (blog fetch failed).
- Any 2024–2026 Engineerforce material describing the Jira 予実 product.
- Any Tempo doc describing handling of worklogs outside project scope.
- Any Ceptah doc on baselines, or a report of unlinked issues or worklogs.
- Any product marketing "unplanned work in hours/cost vs a Gantt/WBS plan".
