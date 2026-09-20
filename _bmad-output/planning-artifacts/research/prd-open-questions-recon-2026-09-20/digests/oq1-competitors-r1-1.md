# OQ1 Competitors — Round 1, Digest 1 (JP market)

Researcher: web-only subagent · Accessed: 2026-09-20 · ~16 tool calls, 11 distinct sources

Decision served: does a Japanese-market competitor already offer plan (WBS/baseline) vs tracker-actuals reconciliation that surfaces work/hours OUTSIDE the plan, for teams on Backlog or Jira?

Questions:
- Q1. クラウドログ (CrowdLog, Crowd Works): Backlog/Jira integration? What's imported? Does it surface unplanned work (予定外 / 計画外工数 / その他 bucket)? Plan/WBS/Gantt/baseline? Pricing? 2025-2026 releases?
- Q2. Lychee Redmine: do EVM/cost actuals come from anything other than Redmine? Any 2025-2026 external integrations? Baselines?
- Q3. Other JP tools that explicitly surface 計画外作業 / 予定外タスク hours from Backlog.

## Findings

Format: claim | source URL | publisher | pub_date | accessed | confidence | class

### Q1 — クラウドログ
1. CrowdLog's official integration page lists attendance tools (KING OF TIME, ジョブカン, 勤革時, HRMOS勤怠), plus Slack/Teams webhooks, import/export, and API. It does not mention Backlog, Jira, Redmine or GitHub. | https://www.crowdlog.jp/function/system-linkage/ | CrowdWorks (crowdlog.jp) | live | 2026-09-20 | high (for what the page lists) | integration
2. ITreview's integration list for CrowdLog shows only Google Calendar, Outlook, KING OF TIME, HRMOS勤怠 and ジョブカン. No Backlog or Jira. | https://www.itreview.jp/products/crowdlog/coordination | ITreview | live | 2026-09-20 | medium | integration
3. The CrowdLog homepage names calendar (Google/Outlook) and attendance integrations plus CSV import of historical data. It says nothing about Backlog or Jira. | https://www.crowdlog.jp/ | CrowdWorks | live | 2026-09-20 | high | integration
4. Pricing: Basic from ¥600/user/month, which includes ガントチャート, reports and calendar integration. Premium from ¥1,500/user/month adds 損益管理, the approval workflow and API連携. 7-day free trial. | https://www.crowdlog.jp/pricing/ | CrowdWorks | live | 2026-09-20 | high | pricing
5. A 進捗管理機能 released 2025-11-14 shows 計画 vs 実績 hours and progress on a Gantt chart. It auto-aggregates member-entered hours and shows variance against predicted hours. Quote: 「計画」と「実績」の工数および進捗状況を、ガントチャート上で. The release does not mention unplanned or unmapped work, or external trackers. | https://crowdworks.co.jp/news/ywhdvqt0v/ | CrowdWorks (corporate news) | 2025-11-14 | 2026-09-20 | high | feature
6. 2026 news items: kintone integration plugin (2026-08-19), new API for project revenue/cost details (2026-08-07), calendar-format timesheet (2026-07-21), member assignment/mobile updates (2026-09-07). The fetched list contains no Backlog/Jira, 予実 or 計画 items. | https://www.crowdlog.jp/news/ | CrowdWorks | 2026-07 to 2026-09 | 2026-09-20 | high | trajectory
7. Actual hours in CrowdLog come from members entering time in CrowdLog's own timesheet (calendar-assisted), not from tracker worklogs. This is inferred from findings 1, 3, 5 and 6. | (same as above) | — | — | 2026-09-20 | medium (inference) | feature

### Q2 — Lychee Redmine
8. Lychee EVM computes AC as the sum of each Redmine ticket's 作業時間の記録. PV is the sum of 予定工数 by ticket due date. The page mentions no external tracker, CSV or Backlog/Jira source. | https://lychee-redmine.jp/plugin/evm/ | Agileware (lychee-redmine.jp) | live | 2026-09-20 | high | feature
9. Lychee EVM has ベースライン比較: two reference dates can be overlaid to compare EVM figures such as EAC. Quote: 2つの基準日を設定すると…重ねて比較できます. | https://lychee-redmine.jp/plugin/evm/ | Agileware | live | 2026-09-20 | high | feature
10. 2026 release notes cover Lychee Agile (Neo Backlog, Neo Kanban, release lines), AI ticket generation from meeting minutes, AI report summaries, and CSV import for agile backlog items. There are EVM/cost-management fixes and resource-management baseline visualization improvements, but no Backlog/Jira/GitHub actuals connector. ("Neo Backlog" is Lychee's own agile backlog, not Nulab Backlog.) | https://lychee.techmatrix.jp/release/2026-2/ | TechMatrix (Lychee reseller) | 2026 (Jan to Sep) | 2026-09-20 | medium-high | trajectory
11. A 2026 release added a REST API for time entries with an indirect-work classification (間接作業; CRUD). That creates a way to log hours outside tickets, which is a partial analog of an "outside the plan" bucket. The exact month is not captured and there is no evidence of reconciliation reporting. | https://lychee.techmatrix.jp/release/2026-2/ | TechMatrix | 2026 (month unknown) | 2026-09-20 | medium | feature
12. Third-party listing: Lychee has about 5 integrations (OneLogin, Chrome, Slack, etc.). Not verified against the official page. | https://saas.imitsu.jp/cate-project-management/service/1412/integration (via search snippet) | PRONIアイミツ | live | 2026-09-20 | low | integration

### Q3 — Others
13. TimeCrowd × Backlog (press release 2023-03-06): records actual time per Backlog issue/project and syncs it back into Backlog's time fields for labor-cost analysis. It does not compare against a plan and does not surface unplanned work. | https://prtimes.jp/main/html/rd/p/000000018.000077582.html | TimeCrowd Inc. via PR TIMES | 2023-03-06 | 2026-09-20 | high | integration
14. Nulab's Backlog case study: a customer (Ryobi Systems) built its own EVM analysis tool on top of Backlog (PV/AC/EV per task). This is a custom build, not a product. Seen only as a search snippet; not read in full. | https://backlog.com/ja/customers/case-study-ryobi-systems-evm/ | Nulab | unknown | 2026-09-20 | low | trajectory
15. Several blogs (Zenn, MOTEX, GLASS) describe DIY Backlog API → spreadsheet aggregation of 予定時間/実績時間. This suggests Backlog's own plan-vs-actual aggregation is limited enough that users build workarounds. Seen only as search snippets. | https://tech.motex.co.jp/entry/2024/05/22/171849 ; https://glass-inc.jp/media/how-to-automatically-aggregate-backlog-man-hours-in-a-google-spreadsheet/ | various | 2024 onward | 2026-09-20 | low-medium | trajectory

## Leads worth chasing
- CrowdLog Premium API (2026-08-07 revenue/cost API; API version-up posts at crowdlog.jp/blog/129943, /125474): check whether any partner or customer pipes Backlog/Jira worklogs into CrowdLog through it.
- Lychee 間接作業 time-entry API: which month shipped it, and whether Lychee reports 間接/チケット外 hours against the plan.
- Ryobi Systems EVM-on-Backlog case study: read it in full. It is evidence of demand, and a possible sign of what a productized version would need.
- CrowdLog's own 2026 comparison of 17 工数管理 tools (https://www.crowdlog.jp/blog/126688/): may list Backlog-linked time trackers for Q3.
- The CrowdLog help center moved to help.crowdlog.jp (Zendesk) and returned 403 to the fetcher. Retry through a browser to read 工数・予算機能 details.

## Looked for but could not find
- CrowdLog × Backlog or × Jira connector. Searched: 「クラウドログ Backlog 連携」, 「クラウドログ Jira 連携」, 「クラウドログ API 工数 Backlog Jira インポート」 (restricted to crowdlog.jp and support.crowdlog.jp). Also read the official system-linkage page, homepage, pricing page and 2026 news list. None mention Backlog or Jira as integrations.
- A CrowdLog feature that surfaces 予定外 / 計画外 / unmapped hours. None of the pages read use these terms. The 2025-11 進捗管理 release covers only variance on planned tasks. Note: the help article on 工数・予算 could not be read (HTTP 403).
- Lychee EVM or cost actuals from Backlog, Jira, GitHub or CSV time entries. Searched 「Lychee Redmine EVM 実績 連携」 and 「Lychee Redmine 2026 リリース 連携」, and read the EVM page and 2026 release notes. Nothing found.
- Any JP product that explicitly shows 計画外作業 / 予定外タスク hours from Backlog. Searched 「Backlog 工数 予定外 可視化 ツール」. Results were DIY API/spreadsheet posts, a custom EVM case study, and TimeCrowd, which records actuals only. Not searched due to budget: TeamSpirit, 工数ログ, Harvest/Toggl JP, or the Nulab app directory.

## Verdicts
Q1 (クラウドログ):
- No evidence of a native Backlog or Jira integration. Actuals come from CrowdLog's own timesheet, with calendar and attendance feeds and an API on Premium.
- Since 2025-11 it does 計画 vs 実績 on a Gantt chart, i.e. variance on planned tasks. No evidence it surfaces hours outside the plan.
- Adjacent threat, not a direct match. Its 2026 API and kintone moves show it is opening up, so watch for a tracker connector.

Q2 (Lychee Redmine):
- EVM actuals are Redmine 作業時間 only. It has real baselines (ベースライン比較).
- 2026 releases are agile and AI features. No Backlog/Jira/GitHub actuals source was found.
- The new 間接作業 time-entry API is the closest thing to an "outside the plan" bucket, but it is Redmine-locked and not evidenced as reconciliation.

Q3 (others):
- No JP tool found that explicitly surfaces unplanned or unmapped Backlog work against a plan. TimeCrowd records actuals only.
- Demand signals exist: DIY Backlog API spreadsheets and a custom EVM-on-Backlog case study.
- Coverage is partial (budget). TeamSpirit, 工数ログ and the Nulab app directory are unchecked.
