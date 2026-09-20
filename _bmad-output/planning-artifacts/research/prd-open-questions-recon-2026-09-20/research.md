---
title: 'Competitive research: PRD open questions recon'
type: 'competitive'
topic: 'PRD open questions recon'
decision: 'Which PRD open questions can be closed, and does research R1 (the unmapped-work wedge) still hold?'
source: 'native-run'
status: final
preset: 'standard'
validation: 'normal'
created: '2026-09-20'
updated: '2026-09-20'
rounds: 1
digests: 5
sources: 65
---

# Competitive research: PRD open questions recon

**Decision this research serves:** which of the momo-keikaku PRD's open questions (OQ-1, OQ-2, OQ-7, OQ-9) can be closed on public evidence, and does research R1 — "position on the unmapped-work ledger plus a separate Baseline" — still hold after a second, targeted sweep?

## Executive summary

**Verdict: R1 still holds. Five independent sweeps, five different vendor clusters, and not one product was found that reports effort outside the plan against a stored plan baseline. But the margin has narrowed, and one battlecard claim must be reworded before it is ever said out loud.**

| Question | Verdict | Confidence | Status |
|---|---|---|---|
| OQ-1 Direct JP competitors (Crowd Log, Lychee Redmine) | Neither reaches the wedge. Crowd Log has no tracker connector at all; Lychee is Redmine-locked | High for Crowd Log, high for Lychee | **Closable** — downgrade to a watch item |
| OQ-2 Backlog plans and API (public half) | New plans keep API, Gantt and burndown on all three paid tiers. The official matrix has **no hours row** at all | High on plans and API; **medium on hours**, by inference | **Half-closable** — the private half is founder data |
| OQ-7a Jira-side (Tempo, Jira Plans, BigPicture) | No out-of-plan report anywhere. Jira Plans still has no baselines. Two battlecard facts need narrowing | High on Jira Plans; high-medium on Tempo; **BigPicture edition now unverified** | **Re-check done; two corrections land** |
| OQ-7b Engineering intelligence (Jellyfish, LinearB, Swarmia) | None has a planned-effort baseline. Swarmia is now one field away and moving fast | Medium-high | **Threat re-rated: Swarmia medium-and-rising** |
| OQ-9 Market movement (VN trackers, Backlog leavers) | Unresolved on share. **Redmine appears at least as often as Backlog on both sides** | Low on dominance; medium on churn | **Not closable until Q1 2027** |

**The three things that actually change something.**

1. **Redmine keeps showing up where the PRD does not expect it.** Every readable Vietnamese BrSE posting names Redmine, Jira and Backlog together, usually with Redmine first [53][54][55]. Redmine is also the destination most often named by people reacting to the Backlog repricing [62][63][65]. Meanwhile the only Japanese product with a real baseline plus EVM is Redmine-locked [7]. The PRD currently orders connectors Backlog (R0) → Jira (Post-Q1) → Redmine → Asana (§8.3). The evidence does not support Redmine sitting third.
2. **Backlog's new plan matrix does not mention hours at all.** The official 2027 feature PDF has no row for 予定時間/実績時間 or 工数 on any of Economy, Business or Professional [13]. Hours are on Standard-and-above today [16], and Standard auto-migrates to Economy [15], so hours *probably* survive on every paid plan — but that is an inference, not a published fact. FR-27 (Ticket-Count Mode) is load-bearing precisely because this is unresolved.
3. **One battlecard claim is now wrong as written.** Tempo Timesheets does have an unaccounted-hours view: group a report by Account and Issue and the "No Account" worklogs appear as their own row [27]. That is classification, not plan scope, and it carries no baseline — but "Tempo gives you no way to see unclassified time" would be a falsifiable overstatement in front of a Tempo user. The defensible claim is narrower and stated in §3.

**Biggest caveat, unchanged from the 2026-09-19 report.** The wedge claim still rests on evidence of absence — docs, changelogs and marketing, never a hands-on trial. This run made that absence broader and better-sourced, not different in kind. The Tempo trial and the Jellyfish demo named in OQ-7 remain the only cheap ways to overturn it, and desk research has now gone as far as it can.

---

## 1. OQ-1 — Direct competitors: Crowd Log (クラウドログ) and Lychee Redmine

**Verdict: neither is a direct competitor today. Crowd Log is an adjacent threat that is opening up; Lychee Redmine is structurally locked out of the Japanese Backlog market.** OQ-1 asked two things: does Crowd Log connect to Backlog or Jira and flag unplanned work, and does Lychee's EVM now read other trackers. Both answers are no.

**Confidence: high.** Official vendor pages, pricing pages and 2025–2026 release feeds were read directly for both products. The one gap is Crowd Log's help centre, which returned HTTP 403 to the fetcher.

**Key evidence.**

- **Crowd Log has no issue-tracker integration of any kind.** Its official integration page lists attendance tools (KING OF TIME, ジョブカン, 勤革時, HRMOS勤怠), Slack/Teams webhooks, import/export and an API — and names no tracker [1] (accessed 2026-09-20). ITreview's independent integration list for the product shows only Google Calendar, Outlook and the same three attendance tools [2]. The homepage adds CSV import of historical data and nothing else [3].
- **Crowd Log does do 計画 vs 実績 — on its own data.** A 進捗管理 feature released 2025-11-14 shows planned and actual hours with progress on a Gantt chart, auto-aggregating member-entered hours against predicted hours [5]. The release says nothing about unplanned or unmapped work, and nothing about external trackers. Actual hours come from Crowd Log's own calendar-assisted timesheet, not from tracker worklogs (inference from [1][3][5][6], medium confidence).
- **Crowd Log is opening up, which is the real signal.** 2026 shipped a kintone integration plugin (2026-08-19), a new API exposing project revenue and cost detail (2026-08-07), a calendar-format timesheet (2026-07-21) and member/mobile updates (2026-09-07) [6]. None is a tracker connector. The direction of travel is what matters.
- **Pricing puts it well below a PM tool.** Basic from ¥600/user/month including Gantt and reports; Premium from ¥1,500/user/month adding 損益管理, approval workflow and API連携 [4].
- **Lychee Redmine's EVM actuals are Redmine 作業時間 only.** AC is the sum of each Redmine ticket's logged work; PV is the sum of 予定工数 by due date. The page names no external tracker, CSV or Backlog/Jira source [7].
- **Lychee does have real baselines.** Its EVM supports ベースライン比較: two reference dates overlaid to compare figures such as EAC [7]. This is the one competitor capability that overlaps FR-15/FR-16 directly.
- **Lychee's 2026 releases went to agile and AI, not to connectors.** Neo Backlog (its own agile backlog, not Nulab Backlog), Neo Kanban, AI ticket generation from meeting minutes, AI report summaries, EVM/cost fixes and resource-baseline visualisation — no Backlog/Jira/GitHub actuals connector [8].
- **One near-miss worth naming.** A 2026 Lychee release added a REST API for time entries carrying an indirect-work classification (間接作業, full CRUD) [8]. That creates a way to log hours *outside* tickets, which is a partial structural analog of an out-of-plan bucket. There is no evidence of any reconciliation reporting built on it, and it is Redmine-locked.
- **Nobody else in Japan does it either.** TimeCrowd × Backlog (2023) records actual time per Backlog issue and writes it back into Backlog's time fields for labour-cost analysis — actuals only, no plan comparison, no unplanned view [10]. The demand signal is DIY: a Nulab customer built its own PV/AC/EV tool on top of Backlog [11], and multiple engineering blogs describe Backlog API → spreadsheet hour aggregation [12].

**Impact on PRD.** Closes OQ-1 as asked. Relieves §6 "Thin moat" for Crowd Log and Lychee *as of today* and converts it into a dated watch item under OQ-7. Lychee's ベースライン比較 [7] is the nearest analog to **FR-15/FR-16** in the Japanese market and belongs on any battlecard that claims local tools have no baseline — that claim is true of Backlog, not of Lychee. Leaves **§1.2** (the four-piece differentiation) intact: neither product has tracker coverage, so neither has three of the four pieces.

---

## 2. OQ-2 — Backlog 2027 plans, hours and API (public half only)

**Verdict: the plan and API half is closed and favourable. The hours half cannot be closed from public sources, and the private half was never research's to answer.** OQ-2 as written has two halves: a public half (which post-2027 plans exist, and do they still expose hours) and a private half (which plan each of the five target spaces will be on, and what share of tickets actually have hours filled in). Only the public half was in scope for this run.

**Confidence: high on plans, pricing, mapping and API; medium on hours, by inference only.**

**Key evidence.**

- **Three paid plans from 2027-01-01**, from the official feature PDF linked off Nulab's help centre [13] and the announcement [14][15] (2026-06-17): Economy ¥21,000/mo (15 users, 30 projects, 30GB), Business ¥36,300/mo (unlimited users and projects, 100GB), Professional ¥100,000/mo (unlimited, 300GB). Annual billing takes 5% off. 3-month and 6-month billing are discontinued; bank-transfer customers move to annual only.
- **API is available on all three paid plans** [13, p2]. So are Gantt and burndown. What moved up-tier is AI Assistant, Nulab Flowbase, cross-project Gantt, long-range Gantt, custom attributes and 孫課題 — all Business and above [13].
- **The feature matrix has no row for 予定時間/実績時間 or 工数 on any plan** [13, pp1–2]. This is an absence in the official document, not a statement that hours were removed.
- **Today, hours are a Standard-and-above attribute.** The current pricing page states that 開始日, 予定時間 and 実績時間 are available on Standard and above [16], so Starter and Free lack them in the UI now.
- **Hours probably survive on every new paid plan — medium confidence, by inference.** Three legs: Standard (which has hours today) auto-migrates to Economy; Economy includes Gantt and burndown, both Standard-tier features today; and no source anywhere says hours moved up a tier [13][15][16]. Whether the new Free plan exposes hours is unknown.
- **Migration mapping** [15]: Standard → Economy if ≤15 users and ≤30 projects, otherwise Business or above. Premium → Business. Platinum → Professional. Starter has no equivalent and needs manual action. Free continues but its cap drops from 10 to 5 users; existing spaces with 6–10 keep access but cannot add members. Enterprise keeps its features at new pricing. Current plans accept new contracts until 2026-12-31; existing contracts switch at their first renewal on or after 2027-01-01.
- **The API's hours fields exist but their plan behaviour is undocumented.** The issue object carries `startDate`, `estimatedHours` and `actualHours`, shown as `null` in the doc example, with no plan note [17]. Whether a Starter or Free space returns `null` or omits the fields is unknown.
- **Rate limits are per user per minute, split four ways** (read / update / search / icon), shared across all of one user's API keys, exposed via `X-RateLimit-*` headers, with HTTP 429 on breach [18]. Documented values: 600 / 150 / 150 / 60 for paid plans, 60 / 15 / 15 / 6 for Free — 2021 figures still shown in the docs [19]. `GET /api/v2/rateLimit` returns the live values for the caller.
- **No worklog endpoint has appeared, and none is coming.** The API changelog through its most recent entry (2026-03-31) shows nothing on worklogs, time entries or hours; 2025–2026 entries are group-API removal, notification/activity fields, and the Document APIs [20].
- **Neither the renewal announcement nor the blog mentions any change to API access or rate limits** [14][15] (medium confidence: evidence of absence).
- Trade press covered the renewal [21], but its reported figures contradicted the official PDF and were discarded.

**Impact on PRD.** Confirms **research R3** and the architecture it forces: with no worklog endpoint [20] and one `actualHours` value per issue [17], **FR-25** (ledger entries from snapshot deltas) remains the only correct design. Confirms **FR-19**'s schedule is feasible on paid-plan rate limits [19] — 600 reads/min per user is generous against an hourly snapshot. Leaves **FR-17**'s data-driven hours detection correct and now clearly load-bearing: since the official matrix is silent on hours [13], detection from the data is the only safe approach, and the PRD already specifies exactly that. Keeps **FR-27** (Ticket-Count Mode) in scope at full weight — it cannot be descoped on the strength of a medium-confidence inference. Does **not** close OQ-2: the private half (which plan each of the five spaces lands on, and the real fill rate of the hours field) is founder data.

---

## 3. OQ-7a — Jira-side re-check: Tempo, Jira Plans, BigPicture

**Verdict: no Jira-side tool reports hours logged outside the plan next to a plan baseline. One prior claim is confirmed, two need narrowing before they reach a battlecard.** This sweep existed to re-verify three facts the PRD flagged as stale under OQ-7 and research R6.

**Confidence: high on Jira Plans; high on Tempo's core behaviour with a documented adjacent feature; BigPicture's baseline-by-edition claim is now unverified.** Several Appfire fetches failed (HTTP 429 on appfire.com, DNS failure on wiki.bigpicture.one), so part of the BigPicture evidence is search-snippet level.

**Key evidence.**

- **Tempo — prior claim QUALIFIED.** Scope for a Financial Manager project is not only a Jira filter: it can be a structure, Jira spaces or Jira epics [23]. Within that scope, out-of-scope work is dropped without notice — the FAQ says subtask hours are "NOT automatically included" unless the subtasks are in the filter, future-dated hours are "also not included", and with a fixed timeframe, time logged before or after it "is not included" [24]. The scope-change page says only that groupings are kept for items still in scope; it does not say what becomes of worklogs on items that drop out [25].
- **Tempo's nearest feature to the wedge is real and must be acknowledged.** Timesheets can list unaccounted hours: group a report by Account and Issue and worklogs with no account category appear in their own row [27]. Confirmed for Data Center; Cloud not verified. This is classification, not plan scope, and there is no baseline anywhere near it.
- **Capacity Planner's Planned vs Actual shows planned hours, actual hours and a variance** — "Actual Time" is the total logged, and a negative variance means more was logged than planned [26]. There is no documented "unplanned" row or category: you can see that you over-logged, not *what* was unplanned.
- **Nothing shipped in 2025–2026 changes this.** Tempo's Timesheets/Planner/Financial Manager release notes through 2026-09-08 contain nothing on out-of-scope, unscoped or unplanned worklogs; the Financial Manager entries are Fixed Price Projects (2025-02-18) and reporting improvements (2025-01-15) [28].
- One Tempo marketing comparison page claims unplanned incident time logged in Jira is "instantly visible" via Capacity Planner and Structure [29] (low confidence, snippet only). That is visibility in the aggregate, not an out-of-plan report — but it is the line a Tempo seller will use.
- **Jira Plans — prior claim CONFIRMED as of 2026-09-20.** Suggestion JSWCLOUD-20495 ("baseline a plan against target dates") is still open: Gathering Interest, unresolved, unassigned, 323 votes, 155 watchers, created 2020-07-02 and updated roughly 13 hours before access [30]. The 2023 Community answer that the Portfolio-era baseline "has not returned" still stands, with custom baseline start/end date fields as the workaround [31]. A "Jira Plans roadmap for 2026?" thread running January–June 2026 drew no Atlassian staff reply and never mentions baselines or planned-vs-actual [32]. Caveat: the evidence is an open ticket plus absence of any launch; Atlassian's own product docs were not fetched this run.
- **BigPicture — prior claim QUALIFIED, and the edition is now unknown.** Appfire released BigPicture Advanced on 2026-08-04; the app is now one Marketplace listing with two editions, Standard and Advanced [33]. Standard covers Gantt, resources and capacity, and risk; Advanced adds OKRs, financial management ("Track budgets and actual spending"), RICE/WSJF and advanced reporting [33]. The Marketplace listing names neither baselines nor planned-vs-actual for either edition [34].
- **The "Enterprise only" baseline fact predates the relineup.** Appfire's DC docs — last updated 2025-07-08 and marked archived — describe baselines as Enterprise-only, one current baseline per task and up to 20 baseline history records per box [35]. Baselines are drawn as bold lines showing each task's position when the baseline was taken, so they are **schedule (date) baselines**; no retrieved doc says they capture effort or cost [35]. Which of Standard or Advanced now carries them is unverified.
- **BigPicture's Financials computes Actual Cost from logged work** and shows budget vs actual — but only in a partner blog snippet, alongside a 2025 community thread asking how to aggregate Cost Tracker actuals, which suggests native worklog-to-cost support is limited or configuration-dependent [36] (low-medium). Nothing retrieved shows BigPicture reporting unplanned or out-of-scope work.

**Impact on PRD.** Confirms **FR-20** (scope completeness) as the sharpest differentiator in the PRD: Tempo's documented behaviour [24] is exactly the silent exclusion FR-20 forbids, and it is now verified rather than stale. Forces two wording corrections to **research R6** as traced in §11 and to any material built from it:
- *Say:* "no report of worklogs outside the plan scope, next to a baseline." *Do not say:* "no way to see unclassified time" — Tempo's No Account row falsifies that [27].
- *Do not name a BigPicture edition* in any battlecard until the Standard/Advanced matrix is read [33][34][35]. The PRD's existing note under OQ-7 — that BigPicture does have baselines, so battlecards must not claim Jira-side tools have none — stands and now needs the edition caveat on top.

Leaves **FR-15/FR-16** differentiation intact: Jira Plans still has no baseline [30], and BigPicture's are date-only [35], not effort or cost. Confirms the R1 traceability row in **§11** without amendment.

---

## 4. OQ-7b — Engineering intelligence re-check: Jellyfish, LinearB, Swarmia

**Verdict: none of the three was shown to report unplanned effort or cost against a stored planned-effort baseline. Swarmia is now one field away and shipping monthly. Re-rate the threat.**

**Confidence: medium-high.** Changelogs and help docs were read directly for LinearB and Swarmia. Jellyfish evidence is weaker — its help centre was not reached, several pages are marketing-level, and the March–June 2026 What's New entries were not itemised.

**Key evidence.**

- **Jellyfish: the pieces exist, the join does not.** Scenario Planner models hypothetical trade-offs "in hours and days, not story points" and mentions no stored planned-FTE baseline, no plan-vs-actual comparison and no unplanned/KTLO reporting [37]; it launched in August 2023 as forward-looking resource-allocation modelling [38]. Capacity Planner (2025-02-18) forecasts from "expected team size and allocation toward planned work" and estimates carryover, without a versioned plan to compare against actuals [39]. The Software Delivery Management page is about forecasting, risk and modelling scope/resourcing/timeline changes — not planned-vs-actual effort or budget [40]. Resource Allocations measures effort as FTE-equivalent by work category (Roadmap / KTLO / Support), so unplanned work is reported as an effort **share**, not against a per-deliverable baseline [41] (low-medium; page not opened). What's New through December 2025 lists Capacity Planner, Team Pulse, Azure DevOps, AI Impact and 25+ integrations, with no planned-vs-actual or baseline entry [42]. **Threat: medium** — Planner plus Allocations sit closest to the wedge, but no source shows them joined.
- **LinearB: measured in the wrong unit entirely.** Planning Accuracy is "(Completed Planned Issues / Total Planned Issues) × 100%", and Capacity Accuracy counts issues or story points completed — planned and unplanned — against planned. Both are **issue and story-point counts with no hours, cost or FTE attached** [44]. Resource Allocation does have FTE ("30 days = 1 FTE") with cost estimated from average salary, and flags "Uncategorized" work with no PM item or epic — but documents no comparison against a planned budget or target allocation [45]. Investment Strategy groups work into New Value / Enhancements / Dev Experience / KTLO / "Inefficiency Pool" and explicitly calls itself "not a financial calculator", with no target-vs-actual [46]. The 2026 release notes through June are AI analytics, AI code review, Copilot/Amazon Q/Claude Code telemetry and GitHub team sync — nothing on planning, unplanned work, allocation or cost [47]. R&D cost capitalization categorises capitalizable effort but is a view of actuals, not a variance [48]. **Threat: low.**
- **Swarmia: the one to watch.** Its changelog shows a steady march toward the wedge [49]: FTE effort model beta (2024-10-22), FTE investment balance (2024-11-05), updated effort model (2025-04-25), CapEx/OpEx capitalization (2025-06-11), sprint-view investment breakdown (2025-07-28), time-off API (2026-02-17), scope filter (2026-06-02), **FTE cost (2026-06-16)**, **initiative forecast with remaining FTE (2026-06-30)**, AI cost beta (2026-08-05), AI ROI (2026-08-07), daily effort model (2026-08-24), leadership signals (2026-09-04).
  - Since 2026-06-16, investment balance and focus summary show cost in real currency: FTE-months × an admin-set yearly developer cost. The entry mentions no planned-budget comparison [50].
  - The investment-balance docs suggest a binary breakdown "such as Planned vs. Unplanned work", plus a monthly review of uncategorized items [51]. Combined with FTE cost, **Swarmia can already show unplanned effort in FTE and in currency** — but only as a categorization of actuals, dependent on the customer labelling work that way, with no stored plan and no baseline separation.
  - Auto-categorization of uncategorized work shrinks that bucket rather than keeping it as its own ledger [49] — the opposite of the PRD's design intent.
  - The initiative forecast (2026-06-30) runs Monte Carlo on past FTE to estimate a completion date and **remaining FTE** at p50/p80/p90, with no planned-effort, budget or target-FTE field mentioned [52].
  - **Threat: medium and trending up.** One field — "planned FTE per initiative" — would give Swarmia plan-vs-actual in currency.
- **None of the three touches Backlog or Japan.** Jellyfish's December 2025 "25+ new integrations" cover incident, security, CI/CD, QA, ITSM, error tracking, monitoring and support; the issue trackers named are Jira, Linear and Azure DevOps, with no Backlog [43]. Swarmia's changelog names only Jira and Linear (Jira + Linear side by side 2026-02-02; multiple Jira instances 2026-08-12) [49]. A combined search for all three plus Japan or Nulab found nothing. **Threat in a Backlog-centric Japanese market: low**, on absence of evidence.

**Impact on PRD.** Confirms **research R7** (quarterly changelog watch) and sharpens it: the watch should be **Swarmia-weighted and monthly**, not an even quarterly sweep across three vendors — LinearB's 2026 direction is AI, not planning [47], and Jellyfish has shipped nothing in this space since February 2025 [39][42]. Reinforces **§1.2**: the unit of measure is the moat. LinearB counts issues [44], Jellyfish and Swarmia infer FTE from activity [41][49] — none reads tracker hours, and none reads Backlog [43][49]. Supports keeping **FR-24** (Catch-all WPs) and **FR-26** (attribution honesty) as designed: Swarmia's auto-categorization of the uncategorized bucket [49] is the anti-pattern the PRD deliberately avoids. Leaves the **§6 "Thin moat"** risk correctly stated, with Swarmia named ahead of the other two.

---

## 5. OQ-9 — Market movement: trackers in VN offshore, and where Backlog leavers go

**Verdict: unresolved on tracker dominance, and too early on churn. But both halves point the same way, at Redmine.**

**Confidence: low on dominance (n=2 independent postings); medium that no public share data exists in the sources checked; medium on churn.** This is the weakest of the five sweeps and should not be over-read. ITviec returned HTTP 410 and TopCV returned 403, so the posting sample collapsed from six to three readable, of which two are near-identical reposts of one headhunter listing.

**Key evidence.**

- **Every readable posting names all three trackers.** A BrSE posting for Japanese clients requires "Redmine, Zira [sic], Backlog, Odoo" (2024-11-19) [53]; TD Consulting's TDC00184 BrSE listing names "Redmine, Jira, Backlog, Odoo" in near-identical text, so it counts as the same posting [54]; Vitalify Asia's Bridge Project Manager listing (Japanese PO, N2) says "PJ Task Management: Redmine / Jira / Backlog / Etc.." [55], echoed in the ITviec snippet for the same role [56]. Tally: 2 of 2 independent postings name each of Backlog, Jira and Redmine — **Redmine usually listed first**. Asana never appeared.
- **No survey or share data exists.** The 2025 Offshore Development White Paper ranks Vietnam first at 43% as an offshore destination, per secondary write-ups, and contains no tracker-usage data [60].
- **Nulab's own Vietnam report supports a client-driven tool choice.** It says some VN offshore firms pick Redmine or GitLab because they are self-hosted and free, and that Backlog use follows the client — CodLuck uses it because its Japanese partners "frequently use 'Backlog'". It names seven VN Backlog users (CodLuck, NAL, PIRAGO, Relipa, TOMOSIA, VMO, VHEC) and one firm still on Redmine and evaluating (Haposoft) [57]. Nulab also publishes VN offshore case studies (HBLab, PiraGo) and has run a Backlog-for-VN-offshore webinar [58], and CO-WELL Asia announced a Vietnamese-language version of Backlog [59] (low confidence, title only).
- **The Backlog backlash is real and well documented.** From 2027-01-01 the old Standard plan (unlimited users, ¥16,000/mo) has no like-for-like successor: staying on unlimited users means Business at ¥36,300/mo, about 2.27×. ITmedia reports strong negative social-media reaction, quoting "2.27倍は無理" and "続ける意味がなくなったので乗り換える" — and names no destination tools [61].
- **But nobody has actually left yet.** In the Hatena comments on that article, Redmine, Linear and Jira are each named once (Jira unfavourably); the dominant sentiment is reluctant retention — alternatives exist, "but none are just right" [62]. The one detailed first-person post (Qiita, 2026-09-08) is a Starter-plan user facing roughly a 7.8× rise (¥30,780 → ¥239,400/yr) who weighed GitHub Issues (rejected: clients and sales staff can't use it), Trac (outdated) and Redmine ("a lot of customers use it" but not modern enough) — and chose **none of them**, building a read-only Backlog archive viewer instead [63]. Two note.com essays discuss the rise without announcing a move or a destination [64].
- **No vendor is hunting the switchers.** An option-listing column lays out four routes — downgrade to Economy, accept Business, self-host Redmine, or outsource Redmine / switch SaaS (Linear, Jira, Asana, Notion) — and notes that Nulab's official importer only runs Redmine → Backlog, so **there is no official tool for leaving** [65]. No migration campaign was found from Atlassian, Asana, Linear or ClickUp in Japan.
- One unverified but structurally relevant signal: search snippets mention SMEs worried about user-count overages from inviting partners (パートナー招待), which bears directly on multi-company offshore setups. Not traced to a first-person source.

**Impact on PRD.** Does **not** close OQ-9; its own "revisit after 2027-01-01" is correct, since most renewals switch after that date. Nothing here contradicts **FR-17** shipping first — Backlog remains the right R0 connector, and client-driven tool choice [57] supports a connector-led strategy. But it puts real pressure on the **§8.3 connector order**: Redmine is both the existing VN offshore default [53][55][57] and the destination most often named by Backlog leavers [62][63][65], while Asana appears in neither dataset. **Research R4** ("Redmine before Asana") is confirmed and arguably understated. Sharpens the **§6 "Backlog churn"** risk: the churn is currently *sentiment*, not movement, and the Jira-connector hedge may be aimed at the wrong destination — no first-person post chose Jira [62][63]. Leaves **FR-18** (Jira, Post-Q1) justified on market size but not on churn.

---

## Cross-dimension insights

1. **Does R1 still hold? Yes — and this run is the strongest evidence for it so far.** Five sweeps, five clusters, none of which reports effort outside the plan against a stored plan baseline: Crowd Log has no tracker at all [1][2][3]; Lychee is Redmine-locked [7][8]; Tempo drops out-of-scope worklogs silently and has no out-of-plan report [24][28]; Jira Plans has no baseline [30]; BigPicture's baselines are dates only [35]; LinearB counts issues [44]; Jellyfish and Swarmia infer FTE and categorise actuals [41][49][51]. The absence is now wider and better sourced than it was on 2026-09-19. It remains an absence.
2. **The wedge's real protection is the unit of measure, not the feature.** Every near-competitor that can express effort in money does so through inferred FTE and payroll averages [41][45][49], and every one that can express plan adherence does so in issue counts [44]. Nobody reads tracker hours into a plan baseline. That is a data-model gap, not a feature gap, which is why "one field away" [52] overstates how close Swarmia is — the field is easy, the hours are not.
3. **Redmine is the finding the PRD did not go looking for.** It arrives from three unrelated directions in one night: the only Japanese product with a genuine EVM baseline runs on it [7]; every readable Vietnamese BrSE posting names it, usually first [53][54][55]; and it is the destination most often named by people reacting to the Backlog repricing [62][63][65]. §8.3 currently places it behind Jira. Nothing in this run supports that ordering, and two things argue against it.
4. **Backlog's silence about hours is the single largest architectural risk still open.** The official 2027 matrix has no hours row on any plan [13]. The inference that Economy keeps hours is reasonable but medium-confidence [15][16], and the API docs say nothing about plan-dependent behaviour of `estimatedHours` / `actualHours` [17]. FR-17's data-driven detection and FR-27's Ticket-Count Mode are the correct hedges and must not be descoped — but the founder can resolve this in an afternoon with an API call that no amount of web research can substitute for.
5. **Two battlecard facts moved, and both moved toward narrower claims.** Tempo's unaccounted-hours row [27] and BigPicture's now-unknown baseline edition [33][34][35] both mean the PRD's §11/R6 traceability row is directionally right but rhetorically overextended. The corrections cost nothing if made now and cost credibility if made in front of a prospect.
6. **The demand signal remains inferred, and this run did not change that.** The only first-party evidence of anyone wanting this is still indirect: DIY Backlog-to-spreadsheet hour aggregation [12] and one customer who built their own EVM tool on Backlog [11]. No user in any of the five sweeps asked for unmapped hours by name. The §6 "demand is inferred" risk stands exactly as the PRD states it.

---

## (a) NEEDS FOUNDER DECISION

These are calls only the founder can make. They are not research tasks; more desk research will not move any of them.

1. **Connector order: does Redmine move ahead of Jira?** §8.3 currently reads Backlog (R0) → Jira (FR-18, Post-Q1) → Redmine → Asana. Redmine is the VN offshore default [53][55][57], the most-named Backlog escape route [62][63][65], and the substrate of the only JP competitor with a real baseline [7]. Asana appears in neither dataset. **Decision:** keep the order, swap Redmine and Jira in the Post-Q1 wave, or drop Asana from the roadmap entirely. Affects **§8.3**, **FR-18**, the §6 Backlog-churn mitigation, and the R4 row in **§11**.
2. **Do you accept the medium-confidence hours inference and proceed to `bmad-architecture`, or block on a hands-on check?** OQ-2's resolve-by is "before `bmad-architecture`". The public half is now closed except for the one thing that matters: the official matrix has no hours row [13], and only inference says Economy keeps hours [15][16]. **Decision:** proceed on the inference with FR-27 as insurance, or spend an hour calling `GET /api/v2/issues/:key` and `GET /api/v2/rateLimit` on a real space first. Affects **OQ-2**, **FR-17**, **FR-27**, and the architecture gate.
3. **Approve the narrowed battlecard wording, or fund the trial first.** Two R6 facts need correcting before they are said in public: Tempo *does* have an unaccounted-hours view [27], and no BigPicture edition can be named for baselines after the 2026-08-04 relineup [33][34][35]. **Decision:** adopt "no report of worklogs outside the plan scope, next to a baseline" and the no-edition rule now, or hold positioning until the Tempo trial runs. Affects **§11 (R6 row)**, **OQ-7**, **FR-20**, and any GTM material.
4. **Spend the Tempo-trial and Jellyfish-demo budget, or accept absence-of-evidence through R1?** OQ-7 names both as the things that could overturn R1, with a resolve-by of "before public positioning (R1)". This run exhausted what public sources can say — every remaining Tempo and Jellyfish question needs a logged-in account [27][29][37][41]. **Decision:** book both now, or accept medium confidence on the wedge claim until R1. Affects **OQ-7**, **§11 (R1 row)**, **§6 (thin moat)**.
5. **Set the Crowd Log trigger and the response.** Crowd Log already does 計画 vs 実績 on a Gantt [5] and spent 2026 opening up: a revenue/cost API (2026-08-07) and a kintone plugin (2026-08-19) [6]. It has no tracker connector today [1][2][3]. **Decision:** what event triggers a response (a Backlog or Jira connector appearing on [1]? a 予定外 term appearing in a release note?), and what the response is — accelerate, reposition, or ignore. Affects **§6 (thin moat)** and **OQ-7**.
6. **Re-rate the engineering-intelligence watch from even-quarterly to Swarmia-weighted.** Research R7 treats LinearB, Swarmia and Jellyfish alike. The evidence does not: Swarmia ships monthly and is one field from plan-vs-actual in currency [49][50][52]; LinearB's 2026 is AI-only [47]; Jellyfish has shipped nothing relevant since 2025-02 [39][42]. **Decision:** make the Swarmia changelog a monthly check and drop the other two to semi-annual, or leave R7 as written. Affects **§11 (R7 row)** and **OQ-7**.
7. **Does the §6 Backlog-churn mitigation survive contact with the evidence?** The stated hedge is the Post-Q1 Jira connector. But no first-person post chose Jira [62][63], the churn is sentiment rather than movement [61][62][64], and there is no official way to leave Backlog at all [65]. **Decision:** keep the Jira hedge, re-point it at Redmine, or accept that the hedge cannot be chosen before Q1 2027 data exists. Affects **§6**, **FR-18**, **OQ-9**.

---

## (b) Still unanswered, and what it would take

**Could still overturn or materially move R1**

1. **Does Tempo Cloud keep the "No Account" / unaccounted-hours row after the 2026-09-08 Reports redesign?** Confirmed only for Data Center [27][28]. If Cloud has it, it is the nearest shipping analog to an out-of-plan bucket anywhere in the market. *What would answer it:* a one-hour Tempo Cloud trial with deliberately out-of-scope worklogs — the same trial OQ-7 already names.
2. **Do Jellyfish deliverables carry a planned-effort target, or only a target date?** The one source suggesting effort was a search summary, unverified on a primary page [41]. Jellyfish's help centre was not reached this run, and the March–June 2026 What's New entries were never itemised [42]. *What would answer it:* a Jellyfish demo, or access to its help centre — pricing is not public, so the demo is the realistic route.
3. **Can a Swarmia investment category carry a target percentage?** The docs show recommended benchmarks, not targets [51]. A target plus FTE cost [50] would be a de facto baseline. Separately, do Swarmia initiatives have a planned-effort field? The forecasting help page returned 404 [52]. *What would answer it:* the Swarmia help sitemap and the initiatives page, or a trial account.
4. **Which BigPicture edition carries baselines after 2026-08-04?** The Enterprise-only fact is archived and predates the relineup [35]; neither the PR nor the Marketplace listing resolves it [33][34]. *What would answer it:* the Standard-vs-Advanced matrix on appfire.com/bigpicture or bigpicture.one/pricing — both returned HTTP 429 this run; retry, or check whether the old Enterprise listing (app 1215158) merged into Advanced.
5. **Is anyone piping Backlog or Jira worklogs into Crowd Log through its Premium API?** The 2026-08-07 revenue/cost API makes it structurally possible [6], and the Crowd Log help centre (help.crowdlog.jp) returned HTTP 403 [1]. *What would answer it:* a browser read of the Crowd Log help centre's 工数・予算 articles, and a search of partner or customer posts referencing the API.

**Backlog mechanics (blocks OQ-2, and the architecture gate)**

6. **Do `estimatedHours` and `actualHours` return `null` or vanish entirely on a plan without the hours feature?** The get-issue doc carries no plan note [17]. This determines whether FR-17's hours detection tests for null or for field absence. *What would answer it:* one API call against a Free or Starter space.
7. **What are the per-plan rate limits after 2027-01-01?** The published figures are from 2021 and are only described as differing "by plan" [18][19]; neither renewal page mentions rate limits at all [14][15]. *What would answer it:* `GET /api/v2/rateLimit` on an Economy space after migration; until then, design FR-19 against the Free-plan floor.
8. **Does the new Free plan expose hours, and what must a Starter space do?** The official PDF excludes Free entirely [13], and the per-plan migration help articles returned HTTP 403 to both WebFetch and curl [22]. *What would answer it:* a browser or Wayback read of support-ja articles 58584410096153 (Starter) and 58585222415257 (Enterprise).
9. **Which plan will each of the five target spaces be on, and what share of their tickets actually have hours filled in?** This is the private half of OQ-2 and is not answerable by research at all. *What would answer it:* the founder reading the five spaces. It decides how much of R0 and R1 runs in Ticket-Count Mode.

**Market sizing (blocks OQ-9)**

10. **Which tracker actually dominates VN offshore work for Japan?** The sample is two independent postings [53][54][55]; ITviec and TopCV block the fetcher [56]. *What would answer it:* a browser-based sample of ~30 current postings, or — far better — asking the seven VN firms Nulab names [57] what their Japanese clients require.
11. **Where do Backlog leavers actually go?** No first-person completed migration exists yet [62][63][64][65], and most renewals switch after 2027-01-01 [15]. *What would answer it:* re-run this sweep in Q1 2027; the X trending page on the repricing needs a logged-in browser and is probably the richest source of named destinations.
12. **Does any vendor launch a Backlog-switcher campaign?** None found [65]. *What would answer it:* watch Atlassian, Asana, Linear and ClickUp Japan through Q4 2026.

**Housekeeping**

13. **Which month shipped Lychee's 間接作業 time-entry API, and does Lychee report 間接/チケット外 hours against the plan?** [8] The closest structural analog to an out-of-plan bucket in the JP market, currently undated and unreported.
14. **Read the Ryobi Systems EVM-on-Backlog case study in full** [11]. Seen only as a snippet. It is the strongest demand evidence found for the wedge and a free specification of what a productised version needs.
15. **Read the latest comment on JSWCLOUD-20495** [30]. It was updated ~13 hours before access; an Atlassian staff statement there would change the Jira Plans baseline verdict.

---

## Source appendix

| [n] | Supports | Publisher | Pub date | Accessed | Confidence |
|---|---|---|---|---|---|
| [1] | Crowd Log integrations: attendance + Slack/Teams + API, no tracker | [CrowdWorks](https://www.crowdlog.jp/function/system-linkage/) | live | 2026-09-20 | high (for what the page lists) |
| [2] | ITreview's Crowd Log integration list: no Backlog/Jira | [ITreview](https://www.itreview.jp/products/crowdlog/coordination) | live | 2026-09-20 | medium |
| [3] | Crowd Log homepage: calendar/attendance + CSV import only | [CrowdWorks](https://www.crowdlog.jp/) | live | 2026-09-20 | high |
| [4] | Crowd Log pricing: Basic ¥600, Premium ¥1,500 per user/mo | [CrowdWorks](https://www.crowdlog.jp/pricing/) | live | 2026-09-20 | high |
| [5] | Crowd Log 進捗管理: 計画 vs 実績 hours on a Gantt | [CrowdWorks news](https://crowdworks.co.jp/news/ywhdvqt0v/) | 2025-11-14 | 2026-09-20 | high |
| [6] | Crowd Log 2026: kintone plugin, revenue/cost API, no tracker | [CrowdWorks](https://www.crowdlog.jp/news/) | 2026-07 to 2026-09 | 2026-09-20 | high |
| [7] | Lychee EVM: AC from Redmine 作業時間; ベースライン比較 | [Agileware](https://lychee-redmine.jp/plugin/evm/) | live | 2026-09-20 | high |
| [8] | Lychee 2026 releases: agile/AI; 間接作業 time-entry API; no tracker connector | [TechMatrix](https://lychee.techmatrix.jp/release/2026-2/) | 2026 (Jan–Sep) | 2026-09-20 | medium-high |
| [9] | Third-party listing of Lychee integrations (~5) | [PRONI アイミツ](https://saas.imitsu.jp/cate-project-management/service/1412/integration) | live | 2026-09-20 | low (snippet) |
| [10] | TimeCrowd × Backlog: actuals per issue, written back; no plan comparison | [TimeCrowd via PR TIMES](https://prtimes.jp/main/html/rd/p/000000018.000077582.html) | 2023-03-06 | 2026-09-20 | high |
| [11] | Customer-built EVM tool on Backlog (PV/AC/EV per task) | [Nulab](https://backlog.com/ja/customers/case-study-ryobi-systems-evm/) | unknown | 2026-09-20 | low (snippet) |
| [12] | DIY Backlog API → spreadsheet hour aggregation | [MOTEX](https://tech.motex.co.jp/entry/2024/05/22/171849) ; [GLASS](https://glass-inc.jp/media/how-to-automatically-aggregate-backlog-man-hours-in-a-google-spreadsheet/) | 2024 onward | 2026-09-20 | low-medium |
| [13] | Backlog 2027 plan matrix: prices, limits, API on all paid tiers, **no hours row** | [Nulab PDF](https://backlog.com/ja/service-document/new-plans-2027.pdf) | ~2026-06 | 2026-09-20 | high (for what the matrix shows) |
| [14] | Plan revision announced 2026-06-17, effective 2027-01-01; billing changes | [Nulab](https://nulab.com/ja/info/backlog-plan-renewal/) | 2026-06-17 | 2026-09-20 | high |
| [15] | Old→new mapping, transition timing, Free cap 10→5, Enterprise | [Nulab blog](https://backlog.com/ja/blog/new-plans-2027/) | 2026-06-17 | 2026-09-20 | high |
| [16] | Current plans; 開始日/予定時間/実績時間 are Standard-and-above | [Nulab](https://backlog.com/ja/pricing/) | live | 2026-09-20 | high |
| [17] | Issue object carries startDate/estimatedHours/actualHours; no plan note | [Nulab Developer](https://developer.nulab.com/ja/docs/backlog/api/2/get-issue/) | undated | 2026-09-20 | high (fields); unknown (plan behaviour) |
| [18] | Rate limits per user/min, four request types, X-RateLimit headers, 429 | [Nulab Developer](https://developer.nulab.com/ja/docs/backlog/rate-limit/) | undated | 2026-09-20 | high |
| [19] | Values 600/150/150/60 paid, 60/15/15/6 Free; GET /rateLimit | [Nulab](https://backlog.com/ja/blog/backlog-api-rate-limit-announcement/) ; [Nulab Developer](https://developer.nulab.com/ja/docs/backlog/api/2/get-rate-limit/) | 2021-01-25 | 2026-09-20 | high (2021 values, still in docs) |
| [20] | API changelog to 2026-03-31: no worklog/time-entry endpoints | [Nulab Developer](https://developer.nulab.com/ja/docs/backlog/changelog/) | latest 2026-03-31 | 2026-09-20 | high |
| [21] | Trade-press coverage of the renewal (figures discarded) | [@IT / ITmedia](https://atmarkit.itmedia.co.jp/ait/articles/2607/24/news048.html) | 2026-07-24 | 2026-09-20 | low (for details) |
| [22] | Per-plan migration help articles (Starter, Enterprise) — HTTP 403, unread | [Nulab support-ja](https://support-ja.backlog.com/hc/ja/articles/58584410096153) | n/a | 2026-09-20 | n/a (gap) |
| [23] | Tempo FM scope = filter, structure, spaces **or** epics | [Tempo help](https://help.tempo.io/financialmanager/latest/creating-a-financial-manager-project) | undated | 2026-09-20 | high |
| [24] | Out-of-scope worklogs omitted silently (subtasks, future, timeframe) | [Tempo help](https://help.tempo.io/financialmanager/latest/cost-tracker-faq) | undated | 2026-09-20 | high |
| [25] | Scope change: groupings kept for in-scope items; nothing on dropped worklogs | [Tempo help](https://help.tempo.io/financialmanager/latest/changing-the-project-scope-jira-filter) | undated | 2026-09-20 | medium (absence) |
| [26] | Capacity Planner Planned vs Actual: hours + variance, no unplanned row | [Tempo help](https://help.tempo.io/planner/latest/planned-vs-actual-reports) | undated | 2026-09-20 | medium |
| [27] | Timesheets "No Account" / unaccounted hours grouping (DC) | [Tempo help](https://help.tempo.io/timesheets-dc/latest/viewing-unaccounted-hours-tempo-server) | undated | 2026-09-20 | high (DC); Cloud unverified |
| [28] | Tempo release notes to 2026-09-08: nothing on out-of-scope/unplanned | [Tempo help](https://help.tempo.io/planner/latest/timesheets-planner-cost-tracker-release-notes) | 2026-09-08 (latest) | 2026-09-20 | medium |
| [29] | Tempo marketing: unplanned incident time "instantly visible" | Tempo (tempo.io/comparison/aha-vs-tempo) | unknown | 2026-09-20 | low (snippet, vendor) |
| [30] | JSWCLOUD-20495 still Gathering Interest, 323 votes, 155 watchers | [Atlassian](https://jira.atlassian.com/browse/JSWCLOUD-20495) | 2020-07-02 (upd. ~2026-09-19) | 2026-09-20 | high |
| [31] | Portfolio-era baseline "has not returned"; custom-field workaround | [Atlassian Community](https://community.atlassian.com/forums/Jira-questions/Using-Jira-Plans-formally-portfolio-how-to-manage-baselines/qaq-p/2239965) | 2023-01-15 | 2026-09-20 | medium (secondary) |
| [32] | 2026 Jira Plans roadmap thread: no staff reply, no baselines mentioned | [Atlassian Community](https://community.atlassian.com/forums/Advanced-Planning-in-Jira/Jira-Plans-roadmap-for-2026/td-p/3178912) | 2026-01-21 / 2026-06-23 | 2026-09-20 | low-medium |
| [33] | BigPicture Advanced released; Standard/Advanced editions; financials | [Appfire via PR Newswire](https://www.prnewswire.com/news-releases/appfire-releases-new-bigpicture-advanced-edition-for-expanded-enterprise-strategic-portfolio-management-for-jira-302841889.html) | 2026-08-04 | 2026-09-20 | high |
| [34] | Marketplace listing: two editions, Cloud + DC; no baseline/PvA named | [Atlassian Marketplace](https://marketplace.atlassian.com/apps/1212259/bigpicture-ppm-strategic-portfolio-management-for-jira) | live | 2026-09-20 | high (listing); edition unresolved |
| [35] | Baselines Enterprise-only (old lineup); date baselines; 20 history records | [Appfire docs](https://appfire.atlassian.net/wiki/spaces/DLP/pages/297635840) | 2025-07-08 (archived) | 2026-09-20 | medium |
| [36] | BigPicture Financials actual cost from worklogs; aggregation question | [Atlassian Community](https://community.atlassian.com/forums/App-Central-questions/How-do-I-make-a-column-on-BigPicture-that-aggregates-actual/qaq-p/2937330) ; Genius Gecko (snippet) | ~2025 | 2026-09-20 | low-medium |
| [37] | Jellyfish Scenario Planner: hypothetical, "hours and days"; no baseline | [Jellyfish](https://jellyfish.co/solutions/scenario-planner/) | undated | 2026-09-20 | medium (marketing) |
| [38] | Scenario Planner launched as forward-looking allocation modelling | [Jellyfish](https://jellyfish.co/blog/jellyfish-scenario-planning/) | 2023-08-15 | 2026-09-20 | medium |
| [39] | Capacity Planner: forecast + carryover; no versioned plan vs actuals | [Jellyfish](https://jellyfish.co/blog/help-your-teams-thrive-with-capacity-planner/) | 2025-02-18 | 2026-09-20 | medium |
| [40] | SDM page: forecasting/risk/modelling, no planned-vs-actual effort | [Jellyfish](https://jellyfish.co/solutions/software-delivery-management/) | undated | 2026-09-20 | medium |
| [41] | Resource Allocations: FTE effort by category (Roadmap/KTLO/Support) | [Jellyfish](https://jellyfish.co/platform/resource-allocations/) ; [Jellyfish](https://jellyfish.co/blog/allocating-with-intent/) | not verified | 2026-09-20 | low-medium (page not opened) |
| [42] | What's New to Dec 2025: no planned-vs-actual or baseline entry | [Jellyfish](https://jellyfish.co/library/whats-new/) | rolling | 2026-09-20 | medium (Mar–Jun 2026 not itemised) |
| [43] | Jellyfish integrations: Jira, Linear, ADO; no Backlog | [Jellyfish](https://jellyfish.co/integrations/) ; [Jellyfish](https://jellyfish.co/blog/new-data-integrations/) | 2025-12 | 2026-09-20 | low-medium |
| [44] | LinearB Planning/Capacity Accuracy = issue & story-point counts only | [LinearB help](https://linearb.helpdocs.io/article/g4czwado46-understanding-project-delivery-trackers) | ~2025-12 | 2026-09-20 | high |
| [45] | LinearB Resource Allocation: FTE + salary cost; "Uncategorized"; no baseline | [LinearB help](https://linearb.helpdocs.io/article/npdalbbe4e-resource-allocation-1) | undated | 2026-09-20 | high |
| [46] | Investment Strategy buckets; "not a financial calculator"; no targets | [LinearB help](https://linearb.helpdocs.io/article/oaf32occ9w-investment-profile) | undated | 2026-09-20 | medium-high |
| [47] | LinearB 2026 release notes (to Jun): AI only, nothing on planning | [LinearB help](https://linearb.helpdocs.io/article/b7okinmoom-release-notes-2026) | 2026 (to Jun) | 2026-09-20 | medium-high |
| [48] | LinearB R&D cost capitalization: view of actuals, not variance | [LinearB](https://linearb.io/platform/cost-capitalization) | undated | 2026-09-20 | medium (marketing) |
| [49] | Swarmia changelog: FTE model → FTE cost → initiative forecast; Jira/Linear only | [Swarmia](https://www.swarmia.com/changelog/) | rolling | 2026-09-20 | high |
| [50] | FTE cost in real currency (FTE-months × yearly dev cost); no planned budget | [Swarmia](https://www.swarmia.com/changelog/2026-06-16-fte-cost/) | 2026-06-16 | 2026-09-20 | high |
| [51] | Investment balance docs suggest Planned vs Unplanned breakdown | [Swarmia help](https://help.swarmia.com/features/focus/balance-engineering-investments) | undated | 2026-09-20 | medium-high |
| [52] | Initiative forecast: Monte Carlo remaining FTE (p50/p80/p90); no planned field | [Swarmia](https://www.swarmia.com/changelog/2026-06-30-initiative-forecast/) | 2026-06-30 | 2026-09-20 | high |
| [53] | BrSE posting: "Redmine, Zira [sic], Backlog, Odoo" | [timviec365 (Hrvalu)](https://timviec365.vn/brseky-su-cau-noi-tieng-nhat-ha-noi-che-djo-tot5070tr-p2015275.html) | 2024-11-19 | 2026-09-20 | medium |
| [54] | TDC00184 BrSE: same four tools (likely the same posting as [53]) | [TD Consulting](https://tdconsulting.vn/job/tdc00184-brse-ky-su-cau-noi/) | undated | 2026-09-20 | medium |
| [55] | Vitalify Asia BPM (N2): "Redmine / Jira / Backlog / Etc.." | [TopDev](https://topdev.vn/detail-jobs/bridge-project-manager-bpm-vitalify-asia-cong-ty-tnhh-vitalify-a-chau-2071386) | undated (expired) | 2026-09-20 | medium |
| [56] | Same role on ITviec: "Jira/Confluence, Redmine, Backlog" | [ITviec](https://itviec.com/it-jobs/bridge-project-manager-brse-it-communicator-vitalify-asia-3350) | unknown | 2026-09-20 | low (snippet; page 410) |
| [57] | VN firms pick Redmine/GitLab when free; Backlog follows the client; 7 named users | [Nulab](https://nulab.com/ja/blog/backlog/case-study-report-on-the-use-of-backlog-in-vietnam/) | undated | 2026-09-20 | medium (vendor) |
| [58] | Nulab VN offshore case studies (HBLab, PiraGo) + VN webinar | [Nulab](https://nulab.com/blog/user-stories/offshore-development-company-hblab-cuts-costs-20-using-backlog/) ; [Nulab](https://backlog.com/ja/blog/case-study-pirago/) | undated | 2026-09-20 | medium (vendor marketing) |
| [59] | CO-WELL Asia developing a Vietnamese Backlog version | [CO-WELL Asia](https://co-well.vn/en/announcement-of-developing-the-vietnamese-version-of-backlog-project-managing-tool/) | unknown | 2026-09-20 | low (title only) |
| [60] | Offshore White Paper 2025: VN first at 43%; no tracker data | [SHIFT ASIA](https://shiftasia.com/ja/column/2025%E5%B9%B4%E7%89%88%E3%82%AA%E3%83%95%E3%82%B7%E3%83%A7%E3%82%A2%E9%96%8B%E7%99%BA%E7%99%BD%E6%9B%B8%E3%81%8B%E3%82%89%E8%AA%AD%E3%81%BF%E8%A7%A3%E3%81%8F%E6%9C%80%E6%96%B0%E5%8B%95%E5%90%91/) ; [DEHA](https://deha.co.jp/magazine/offshore-white-paper-2025/) | 2025 | 2026-09-20 | medium for 43%; no tracker data |
| [61] | Backlog repricing backlash; ~2.27× on unlimited users; no destinations named | [ITmedia NEWS](https://www.itmedia.co.jp/news/article/2608/27/2000000862/) | 2026-08-27 | 2026-09-20 | high |
| [62] | Hatena comments: Redmine/Linear/Jira named once each; reluctant retention | [Hatena](https://b.hatena.ne.jp/entry/s/www.itmedia.co.jp/news/article/2608/27/2000000862/) | 2026-08-27 onward | 2026-09-20 | low-medium (extraction incomplete) |
| [63] | Starter user at ~7.8×: rejected GitHub Issues/Trac/Redmine, built an archive viewer | [Qiita (@a-kanae)](https://qiita.com/a-kanae/items/c1546912c4a1115fcf6c) | 2026-09-08 | 2026-09-20 | high (as one data point) |
| [64] | Two essays on the price rise; neither announces a move | [note](https://note.com/howmanydesigns/n/nee7672c9eee6) ; [note](https://note.com/se_maruo/n/n4a699e22b6e2) | 2026-08-27 / 2026-08-30 | 2026-09-20 | medium |
| [65] | Four options column; Nulab's importer only runs Redmine→Backlog | [Oflight](https://www.oflight.co.jp/ja/columns/backlog-price-hike-redmine-migration-2026) | 2026-08-28 | 2026-09-20 | low (option-listing) |

## Staleness map

Windows as in the 2026-09-19 report: feature and pricing 3 months, trajectory and traction 6 months, sentiment 12 months.

| Claim | Class | Pub | Re-check by | Stale |
|---|---|---|---|---|
| [53] VN BrSE posting naming all three trackers | traction | 2024-11 | 2025-05-01 | **yes**. Only readable independent posting; resample in a browser |
| [31] Jira Plans baseline "has not returned" | feature | 2023-01 | 2023-04-01 | **yes**, but superseded by [30] (checked 2026-09-20) |
| [10] TimeCrowd × Backlog | integration | 2023-03 | 2023-06-01 | **yes**. Re-check whether any plan comparison was added |
| [35] BigPicture baselines Enterprise-only | feature | 2025-07 | 2025-10-01 | **yes**, and superseded by the 2026-08 relineup [33]. Do not cite by edition |
| [19] Backlog rate-limit values | api | 2021-01 | 2021-04-01 | **yes** by date, but still the current published figures. Verify by API call |
| [5] Crowd Log 進捗管理 release | feature | 2025-11 | 2026-02-01 | **yes**. Covered by the OQ-7 watch |
| [50][52] Swarmia FTE cost, initiative forecast | feature | 2026-06 | 2026-09-01 | **yes**. This is the monthly watch item |
| [13][14][15][16][17] Backlog plans, hours, API | pricing/feature | 2026-06 to live | 2026-12-01 | no. Re-verify after 2027-01-01 |
| [24][26][27][30][44][45][49][51] core feature and absence claims | feature | 2026-09 | 2026-12-01 | no |
| [33][34] BigPicture Advanced lineup | trajectory | 2026-08 | 2027-02-01 | no |
| [61][62][63][64][65] Backlog churn sentiment | sentiment | 2026-08/09 | 2027-08-01 | no, but the *behaviour* only becomes visible after 2027-01-01 |

**Earliest meaningful re-check: 2026-12-01**, matching OQ-7's own resolve-by, covering the absence claim behind R1 and every competitor feature claim. A second pass is due immediately after **2027-01-01** for Backlog's plan migration, hours availability, rate limits and actual churn destinations. The Swarmia changelog [49] should be checked monthly, not quarterly, until it either ships a planned-effort field or stops moving.
