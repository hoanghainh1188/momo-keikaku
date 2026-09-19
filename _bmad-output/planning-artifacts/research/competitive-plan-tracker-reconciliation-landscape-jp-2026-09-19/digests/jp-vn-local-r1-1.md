# Digest: Local tools in Japan and Vietnam — round 1

Budget used: 15 WebSearch/WebFetch calls (cap reached); ~6 pages actually read (fetched), the rest from search-result snippets (lower confidence, flagged).

## Findings
| # | claim | source URL | publisher | pub_date (YYYY-MM or unknown) | accessed | confidence (high/med/low) | class |
|---|---|---|---|---|---|---|---|
| 1 | ITreview JP "project management" category: 69 products, 2,408 reviews as of 2026-09-07. Top by review count: Backlog 746 (4.0★), Notion 214, Jira 213 (3.8★), Redmine 206 (3.7★), Asana 204, monday.com 149, Trello 121, Wrike 66, Brabio! 62 (3.7★), Smartsheet 58; Lychee Redmine 45 (4.1★). | https://www.itreview.jp/categories/project-management | ITreview | 2026-09 | 2026-09-19 | high (single source; fetched) | traction |
| 2 | Backlog is also #1 on ITreview in a separate listing (review count, Oct 2025, ahead of Jira and Notion) — second, older ITreview view, same publisher, so not independent. | https://community.itreview.jp/categories/project-management/qas/200 (snippet) | ITreview community | 2025-10 | 2026-09-19 | med | traction |
| 3 | Backlog pricing (JPY/month, flat per space, not per user): Starter ¥2,700 (≤30 users), Standard ¥16,000, Premium ¥27,000, Platinum ¥75,000 (unlimited users). Gantt, burndown and estimated/actual hours (予定時間/実績時間) only from Standard up; Gantt on Standard limited to a 6-month view. Page has no date. | https://backlog.com/ja/pricing/ | Nulab | unknown (live page) | 2026-09-19 | high | pricing/feature |
| 4 | Backlog stores per-issue 実績時間 (actual hours) but third-party writers say it can't aggregate: to total actual hours over a period you export to Excel/Sheets. That gap is served by add-ons: TimeCrowd writes tracked time back into Backlog's 実績時間; GLASS blog shows auto-aggregating to Google Sheets; TerraSky shows a Salesforce+Backlog 工数 setup. | https://prtimes.jp/main/html/rd/p/000000018.000077582.html ; https://glass-inc.jp/media/how-to-automatically-aggregate-backlog-man-hours-in-a-google-spreadsheet/ ; https://base.terrasky.co.jp/articles/KvANS (all snippets) | TimeCrowd / GLASS / TerraSky | unknown | 2026-09-19 | med (snippets, not fetched) | feature/sentiment |
| 5 | Lychee Redmine (Agileware) pricing: Free ¥0 (Kanban only); Standard ¥900/user/mo (Gantt, Kanban, dashboard, AI assistant); Premium ¥1,400 (+time mgmt, resource mgmt, EVM, cost mgmt, CCPM); Business ¥2,100 (+project reports, custom fields). Sold in 10-user units; cloud fee from ¥5,000/month per server. The page lists no baseline feature and no Backlog/Jira import. | https://lychee-redmine.jp/plan/ | Agileware (official) | unknown (live page) | 2026-09-19 | high | pricing/feature |
| 6 | TeamSpirit Connector for Jira (GA 2023-01-18): work hours entered on Jira tickets flow automatically into TeamSpirit's 工数 (effort) actuals, so engineers don't re-enter time. | https://corp.teamspirit.com/ja-jp/news/release/2023/01/jira (snippet) ; https://www.teamspirit.com/news/jira | TeamSpirit (official) | 2023-01 | 2026-09-19 | med (snippet; stale >12 mo) | feature |
| 7 | TeamSpirit Project Cost Management: budget hours and sales targets set monthly for plan-vs-actual (予実); actual hours calculated automatically from TeamSpirit's time tracking to show project cost in real time. It works per project/month, not per WBS task. | https://www.teamspirit.com/ja-jp/service/ts/pj.html (snippet) | TeamSpirit (official) | unknown | 2026-09-19 | med | feature/positioning |
| 8 | Engineerforce (Atlassian Solution Partner, founded 2020-08): estimates sync into Jira as epics/stories, and it compares planned hours at estimate time with actuals, identifying tasks that deviated or were unplanned (想定外). Press release dated 2021-03-31; no pricing disclosed. | https://prtimes.jp/main/html/rd/p/000000008.000068877.html | Engineerforce via PR TIMES | 2021-03 | 2026-09-19 | high on the claim; STALE (current status unknown) | feature |
| 9 | OBPM Neo (Sumitomo/SINT, not TIS): PMBOK-based, CMMI Level 3-oriented, integrated PM; per-project sales and cost budgets with actuals (予実); a "system integration" page covers standard import/export. No Jira/Backlog connector confirmed. | https://products.sint.co.jp/obpm ; https://products.sint.co.jp/obpm/function/coordination (snippets) | SINT (official) | unknown | 2026-09-19 | med | feature/positioning |
| 10 | Jira-side JP practice: stock Jira is enough for simple plan-vs-actual; organisational 工数 management with approvals and reporting points to Tempo (per the Ricksoft blog, a JP Atlassian partner). | https://www.ricksoft.jp/blog/articles/001712.html (snippet) | Ricksoft | unknown | 2026-09-19 | med | feature |
| 11 | Migration signal: Serverworks (JP SIer) wrote up moving from 29 Backlog projects to centralised Jira management with automation. | https://blog.serverworks.co.jp/backlogtojira (snippet) | Serverworks | unknown | 2026-09-19 | low-med | trajectory |
| 12 | ITreview Backlog reviews (2026-06/07) ask for cross-project tasks, workflow features and notifications. On the page as fetched, no review directly criticised 工数/予実 or cost reporting. | https://www.itreview.jp/products/backlog/reviews | ITreview | 2026-06/07 | 2026-09-19 | med (couldn't filter to 1–3★) | sentiment |
| 13 | Base Wework (VN): Kanban, Gantt, list and chart views; custom fields for budget/weight; workload-based resource balancing; auto-updated progress reports with completion forecasts. No evidence of actual-cost ledgers or tracker (Jira/Backlog) integration. | https://base.vn/app/wework (snippet) | Base.vn (official) | unknown | 2026-09-19 | med | feature |
| 14 | 1Office (VN): project module has list, Kanban, grid and Gantt views; priced per user in Standard/Professional/Enterprise tiers, but the snippet shows no VND figure. | https://1office.vn/support_feature/du-an-2 ; https://1office.vn/bao-gia-phan-mem-quan-ly-cong-viec (snippets) | 1Office (official) | unknown | 2026-09-19 | low-med | feature/pricing |
| 15 | VN offshore firms serving JP: BrSE job ads (Rikkeisoft and others) require skill with Jira, Backlog and Redmine for progress reporting to JP clients and for bug/test management. Evidence that all three co-exist, not which one dominates. | https://tuyendung.rikkeisoft.com/recruitment/detail/tuyen-dung-brse1712565302 (snippet) | Rikkeisoft careers | unknown | 2026-09-19 | med | positioning |
| 16 | FPT Software: most of its Japan work was historically for Hitachi (Wikipedia); no source found on which tracker it uses. | https://en.wikipedia.org/wiki/FPT_Software (snippet) | Wikipedia | unknown | 2026-09-19 | low | positioning |

## Answers to the owned questions

**Q1: Which JP tools do 予実/工数 linked to WBS/Gantt, and pull actuals from Backlog/Jira?**
- Lychee Redmine Premium+ ties time, resource, EVM and cost management to Redmine tickets on a Gantt (#5). Its actuals come from Redmine itself, not Backlog/Jira.
- OBPM Neo covers per-project budget vs actual (#9).
- Backlog has per-issue estimated/actual hours on Standard+ (#3) but aggregation is weak, so a cottage industry of export/Sheets/TimeCrowd/Salesforce add-ons exists (#4).
- Pulling actuals from trackers: TeamSpirit takes Jira hours into its 工数 actuals (#6) and runs project-level cost 予実 (#7). Engineerforce (2021) compared Jira actuals with estimates and flagged unplanned tasks (#8), the closest match to the wedge, but it is stale.
- No tool found that pulls Backlog actuals into a WBS 予実 view (only TimeCrowd, which writes hours *into* Backlog).

**Q2: Pricing and positioning**
- Backlog: flat ¥2,700–¥75,000/month per space (#3). It is general-purpose team PM, used well beyond IT.
- Lychee Redmine: ¥900 / ¥1,400 / ¥2,100 per user/month in 10-user units, plus a cloud server fee (#5). EVM and CCPM point at IT/SI PMs.
- OBPM Neo: PMBOK/CMMI orientation, so SIer PMO buyers (#9); price not retrieved.
- TeamSpirit: attendance + 工数 + project cost, aimed at back-office/finance-linked 工数 (#6–7); price not retrieved.

**Q3: Traction**
- Backlog is the clear JP leader by ITreview review volume: 746 reviews vs ~210 for Jira and Redmine (#1). A second ITreview view agrees (#2), but it is the same publisher, so treat the lead as strong-but-single-source.
- Among 予実-capable specialists, Brabio! (62) and Lychee Redmine (45) are small in review volume (#1).
- An ITトレンド ranking exists (it-trend.jp/project_management/ranking) but was not read.

**Q4: Complaints 2025–2026**
- Fetched recent Backlog reviews ask for cross-project tasks and workflow features (#12). Neither review surface fetched here showed a 1–3★ complaint about 工数/予実.
- The "Backlog can't aggregate hours" point comes from third-party blogs (#4), not ITreview.
- Low-star filtering was not achieved; this is a gap.

**Q5: Vietnam**
- Base Wework (#13) and 1Office (#14) have Gantt and some budget/resource fields. Neither shows tracker integration or baseline-vs-actual cost ledgers.
- At JP-facing offshore firms, BrSE job ads name Jira, Backlog and Redmine together (#15). Which one dominates is unproven.
- No FPT tracker evidence (#16).

## Reconciliation-wedge verdict for this cluster
**Partial / mostly no.**
- Tracker-to-actuals feeds exist: TeamSpirit ← Jira hours (#6–7) feeds project-level cost 予実, and Engineerforce (#8) compared Jira actuals to estimates and flagged "unplanned" tasks. That is the nearest thing to quantifying unmapped work, but it is 2021 and its current status is unverified.
- Nothing found in JP or VN keeps a persistent plan-WBS ↔ Backlog/Jira ticket mapping with separate baseline and actual ledgers, or reports "N tickets / X hours / ¥Y not belonging to any plan task."
- Backlog-sourced reconciliation specifically appears absent. The market patches it with spreadsheets and time trackers (#4), despite Backlog being the #1 JP tool (#1).

## Leads worth chasing (next round)
1. Engineerforce today: is it still live, does it support Backlog, pricing, and does it quantify unplanned hours/cost? (Closest wedge overlap.)
2. TeamSpirit Connector for Jira docs: is a Backlog connector planned? Does the mapping go to WBS tasks or only projects? Pricing.
3. ITreview low-star (1–3★) reviews for Lychee Redmine, OBPM Neo, Brabio!, TeamSpirit 工数 (use the ?sort / star filter).
4. Backlog API and Nulab changelog 2026: any new 工数/report/AI 予実 features (the search snippet hinted at AI-generated progress reports).
5. VN offshore tooling: Rikkeisoft/FPT/NAL engineering blogs or Viblo posts naming the client-mandated tracker. Also Nulab's Vietnam activity.
6. Other JP 工数 tools with Backlog/Jira connectors: TimeCrowd, PROJECT KEEPER, Rakuraku (楽々), クラウドログ, freee工数.

## Looked for but could not find
- A JP or VN product quantifying tracker tickets unmapped to a plan, in hours or money (current).
- Backlog → WBS 予実 connector from any vendor.
- OBPM Neo, TeamSpirit, Brabio!, Base.vn and 1Office prices (not retrieved within budget).
- ITreview 1–3★ reviews filtered for 工数/予実 (2025–2026).
- Hard evidence of which tracker FPT Software or other large VN offshore firms standardise on for JP clients.
- Jooto, PROJECT KEEPER and Rakuraku details (not reached within budget).
