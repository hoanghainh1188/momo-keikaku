# OQ7a Jira-side recon, round 1-1: digest

Researcher: web-only sub-agent | Run date: 2026-09-20 | ~22 tool calls | Several fetches returned HTTP 429 (appfire.com) or DNS failure (wiki.bigpicture.one), so some evidence comes only from search-engine snippets. Those findings are marked "snippet".

**Decision served:** Does any Jira-side tool already report work or hours logged OUTSIDE the plan (unplanned, unscoped or unmapped worklogs) next to a plan baseline? This run also re-checks three older claims before they go into sales battlecards.

**Questions**
- Q1. Tempo (Timesheets, Financial Manager/Cost Tracker, Capacity Planner, Structure): is there any view or report of worklogs that fall outside a Financial Manager project's scope, or of unplanned work?
- Q2. Jira Plans (Advanced Roadmaps): does it have baselines as of 2026? Has Atlassian shipped any planned-vs-actual feature in 2025-2026?
- Q3. BigPicture (Appfire): which editions include baselines, including the new Advanced edition? Does it compare planned and actual effort or cost from worklogs, and does it show unplanned work?

---

## Findings

### Q1: Tempo

| # | Claim | Source URL | Publisher | pub_date | accessed | confidence | class |
|---|---|---|---|---|---|---|---|
| 1.1 | A Financial Manager project's scope is built from a Jira filter, a structure, Jira spaces or Jira epics. So scope is not only a Jira filter. | https://help.tempo.io/financialmanager/latest/cost-tracker-faq (via search snippet); https://help.tempo.io/financialmanager/latest/creating-a-financial-manager-project | Tempo | undated (living doc) | 2026-09-20 | high | feature |
| 1.2 | Worklogs outside scope are left out without notice. The docs say subtask hours are "NOT automatically included" unless the subtasks are in the filter. Hours logged for the future are "also not included". With a fixed timeframe, time logged before or after it "is not included". | https://help.tempo.io/financialmanager/latest/cost-tracker-faq | Tempo | undated | 2026-09-20 | high | feature |
| 1.3 | The FAQ and the "Changing the Project Scope" page say nothing about any view of worklogs outside scope. On a scope change, the page only says groupings are kept for items still in scope. It does not say what happens to worklogs on items that drop out. | https://help.tempo.io/financialmanager/latest/cost-tracker-faq ; https://help.tempo.io/financialmanager/latest/changing-the-project-scope-jira-filter | Tempo | undated | 2026-09-20 | medium (this is an absence in the docs, not an explicit denial) | feature |
| 1.4 | Capacity Planner's Planned vs Actual report shows planned hours, actual hours and a variance. Actual Time is "the total time that has been logged". A negative variance means more time was logged than planned. The report has no documented "unplanned" row or category. | https://help.tempo.io/planner/latest/planned-vs-actual-reports | Tempo | undated | 2026-09-20 | medium | feature |
| 1.5 | Closest match found: Timesheets can list "unaccounted hours". These are worklogs with no account category. To see them, group a report by Account and Issue, and the "No Account" worklogs appear in the first or last row. The source is the DC/Server doc. The grouping is by account, not by plan, and it has no baseline. | https://help.tempo.io/timesheets-dc/latest/viewing-unaccounted-hours-tempo-server | Tempo | undated | 2026-09-20 | high (for DC); Cloud not verified | feature |
| 1.6 | The Timesheets/Planner/Financial Manager release notes from 2025 to 2026-09-08 have nothing on out-of-scope, unscoped or unplanned worklogs. The Financial Manager items are Fixed Price Projects (2025-02-18) and reporting improvements (2025-01-15). The latest entry is 2026-09-08 (Timesheets Reports redesign). | https://help.tempo.io/planner/latest/timesheets-planner-cost-tracker-release-notes | Tempo | 2026-09-08 (latest entry) | 2026-09-20 | medium | trajectory |
| 1.7 | A Tempo marketing comparison page says unplanned incident time logged in Jira is "instantly visible" through Capacity Planner and Structure. This means the hours are visible in the aggregate. It is not a separate out-of-plan report. | tempo.io/comparison/aha-vs-tempo (snippet only, page not fetched) | Tempo (vendor marketing) | unknown | 2026-09-20 | low | feature (marketing claim) |

### Q2: Jira Plans

| # | Claim | Source URL | Publisher | pub_date | accessed | confidence | class |
|---|---|---|---|---|---|---|---|
| 2.1 | Suggestion JSWCLOUD-20495 ("baseline a plan against target dates") is still open. Status: Gathering Interest, Unresolved, unassigned. It has 323 votes and 155 watchers. It was created 2020-07-02 and updated about 13 hours before access, so it is active but not shipped. | https://jira.atlassian.com/browse/JSWCLOUD-20495 | Atlassian | 2020-07-02 (updated ~2026-09-19) | 2026-09-20 | high | trajectory |
| 2.2 | A Community Champion (not Atlassian staff) answered in January 2023 that the Portfolio-era baseline "has not returned". The suggested workaround is custom "baseline start/end date" fields. | https://community.atlassian.com/forums/Jira-questions/Using-Jira-Plans-formally-portfolio-how-to-manage-baselines/qaq-p/2239965 | Atlassian Community | 2023-01-15 | 2026-09-20 | medium (secondary; confirmed by 2.1) | feature |
| 2.3 | A "Jira Plans roadmap for 2026?" thread (January to June 2026) has no Atlassian staff replies. It does not mention baselines or planned vs actual. | https://community.atlassian.com/forums/Advanced-Planning-in-Jira/Jira-Plans-roadmap-for-2026/td-p/3178912 | Atlassian Community | 2026-01-21 / last 2026-06-23 | 2026-09-20 | low-medium | trajectory |
| 2.4 | No evidence was found of a 2025-2026 Atlassian launch for plan snapshots or planned vs actual. A third-party blog says Jira has "no dedicated planned-vs-actual chart" apart from the Velocity chart. | search results only; brokenbuild.net blog (snippet) | third party | unknown | 2026-09-20 | low | feature |

### Q3: BigPicture (Appfire)

| # | Claim | Source URL | Publisher | pub_date | accessed | confidence | class |
|---|---|---|---|---|---|---|---|
| 3.1 | Appfire released BigPicture Advanced on 2026-08-04. BigPicture is now one Marketplace app with two editions, Standard and Advanced. Standard covers Gantt, resources and capacity, and risk. Advanced adds OKRs, financial management ("Track budgets and actual spending"), RICE/WSJF prioritization and advanced reporting. | https://www.prnewswire.com/news-releases/appfire-releases-new-bigpicture-advanced-edition-for-expanded-enterprise-strategic-portfolio-management-for-jira-302841889.html | Appfire via PR Newswire | 2026-08-04 | 2026-09-20 | high | feature/trajectory |
| 3.2 | The Marketplace listing shows Standard and Advanced editions, hosted on both Cloud and Data Center (DC 10.0.0-10.7.4). The listing does not name baselines or planned vs actual for either edition. | https://marketplace.atlassian.com/apps/1212259/bigpicture-ppm-strategic-portfolio-management-for-jira | Atlassian Marketplace (Appfire listing) | live listing | 2026-09-20 | high (listing); baselines by edition unresolved | feature |
| 3.3 | Under the older lineup, baseline management was described as "available in BigPicture Enterprise only". Limits: one current baseline per task and up to 20 baseline history records per box. The source is Appfire's DC docs, last updated 2025-07-08 and marked archived. The Enterprise-only wording comes from a search snippet. | https://appfire.atlassian.net/wiki/spaces/DLP/pages/297635840 ; https://appfire.atlassian.net/wiki/spaces/DLP/pages/696975739/Baselines+configuration | Appfire | 2025-07-08 | 2026-09-20 | medium | feature |
| 3.4 | Baselines are drawn as bold lines showing each task's position when the baseline was created, so they are schedule (date) baselines. No retrieved doc said whether baselines capture effort or cost. | https://appfire.atlassian.net/wiki/spaces/DLP/pages/297635840 | Appfire | 2025-07-08 | 2026-09-20 | medium | feature |
| 3.5 | BigPicture's Financials module computes Actual Cost from work logged to tasks and shows budget vs actual. The source is a partner blog (snippet). A 2025 community thread asks how to add up Cost Tracker actuals in BigPicture, which suggests native worklog-to-cost support is limited or depends on configuration. | geniusgecko.com/mastering-the-bigpicture-financials-module... (snippet); https://community.atlassian.com/forums/App-Central-questions/How-do-I-make-a-column-on-BigPicture-that-aggregates-actual/qaq-p/2937330 (title only) | Genius Gecko (partner); Atlassian Community | unknown / ~2025 | 2026-09-20 | low-medium | feature |
| 3.6 | Nothing retrieved describes BigPicture showing unplanned or out-of-scope worklogs. | none | none | none | 2026-09-20 | low (absence) | feature |

---

## Leads worth chasing
- **Tempo Timesheets Cloud "No Account" grouping.** Check whether the Cloud Reports redesign of 2026-09-08 keeps a "No Account" or "unaccounted" row. So far this is confirmed only for DC (1.5). If it exists, it is the nearest existing feature to an "outside the plan" bucket, though it is not tied to a plan baseline.
- **Tempo Financial Manager "Reviewing Your Projects at a Glance" and "Comparing Planned Hours Versus Actual Hours" pages** (help.tempo.io/financialmanager/latest/comparing-planned-hours-versus-actual-hours). These were not fetched. They may show how planned hours from Capacity Planner meet in-scope actuals.
- **Tempo comparison page wording on "unplanned incident time"** (tempo.io/comparison/aha-vs-tempo). Fetch it to confirm the exact claim a Tempo seller would use.
- **BigPicture Standard vs Advanced feature matrix** on appfire.com/bigpicture and bigpicture.one/pricing (appfire.com returned 429). This is needed to settle which new edition includes baselines (3.3 predates the new lineup).
- **Old BigPicture Enterprise Marketplace listing** (marketplace.atlassian.com/apps/1215158). Check whether it was merged into Advanced.
- **JSWCLOUD-20495 activity.** The ticket was updated about 13 hours before access. Read the latest comment for any Atlassian staff statement.

## Looked for but could not find
Exact searches run: "Tempo Financial Manager project scope filter worklogs"; "Tempo Planner planned vs actual unplanned work"; "Tempo Timesheets worklogs \"no account\" report"; "Tempo Cost Tracker worklogs outside project"; "Tempo Structure unplanned work worklogs"; "Jira Plans baseline"; "Atlassian Jira plans snapshot planned vs actual 2026"; "BigPicture baseline edition"; "\"BigPicture Advanced\" Appfire"; "BigPicture Cloud baselines Enterprise only"; "BigPicture Standard Advanced edition baselines comparison"; "BigPicture budget actual cost worklogs".
- No Tempo doc or release note describes an "out of scope", "unscoped", "unplanned" or "unallocated" worklog report in Financial Manager or Capacity Planner.
- No Atlassian doc or changelog entry announces baselines or plan snapshots in Jira Plans for 2025-2026. Atlassian's own support docs (support.atlassian.com) were not fetched directly this run. Evidence rests on the open suggestion ticket.
- No edition-level statement places baselines in BigPicture Standard or in Advanced after the 2026-08 change.
- Nothing shows BigPicture reporting unplanned or out-of-scope work.

---

## Verdicts

**Q1 prior claim:** "Financial Manager scope = a Jira filter; worklogs outside the filter are simply not counted, with no out-of-scope report." **QUALIFIED.**
- Confirmed: worklogs outside scope are left out without notice (1.2), and no out-of-scope report exists in Financial Manager docs or 2025-2026 release notes (1.3, 1.6).
- Corrections:
  - Scope can also be a structure, spaces or epics, not only a Jira filter (1.1).
  - Tempo Timesheets has an adjacent feature: the "No Account" or unaccounted-hours grouping. It surfaces worklogs outside the account classification, confirmed for DC (1.5).
  - Capacity Planner's Planned vs Actual shows total over-logging as a variance, but it does not show which work was unplanned (1.4).
- Battlecard wording should be: "no report of worklogs outside the plan scope next to a baseline". Do not say "no way to see unclassified time".

**Q2 prior claim:** "Jira Plans has no baselines." **CONFIRMED as of 2026-09-20.**
- JSWCLOUD-20495 is still "Gathering Interest" with 323 votes (2.1).
- No 2025-2026 Atlassian launch was found (2.3, 2.4).
- Caveat: the evidence is the open ticket plus absence of any launch. Atlassian's product docs were not checked directly.

**Q3 prior claim:** baselines in BigPicture by edition, and planned vs actual from worklogs. **QUALIFIED.**
- Baselines exist, are schedule baselines (dates), allow up to 20 history versions, and were Enterprise-only under the old lineup (3.3, 3.4).
- Since 2026-08-04 the lineup is Standard and Advanced (3.1, 3.2). Which of these includes baselines is **unverified**, so battlecards should not name an edition yet.
- Advanced adds budget vs actual spending (3.1). Actual cost from logged work appears only in secondary sources (3.5).
- No evidence of any unplanned or out-of-scope worklog view (3.6).

**Overall answer to the decision:** none of the three tools shows evidence of a report of hours logged outside the plan next to a plan baseline. The nearest features are:
- Tempo Timesheets' "No Account" row, which is classification, not plan scope.
- Tempo Planner's aggregate over-logging variance.
- BigPicture's date baselines plus budget vs actual.
