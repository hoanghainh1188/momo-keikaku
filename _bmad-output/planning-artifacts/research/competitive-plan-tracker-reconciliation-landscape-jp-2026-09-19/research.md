---
title: 'Competitive research: Plan-tracker reconciliation landscape (Japan + Vietnam)'
type: 'competitive'
topic: 'Plan-tracker reconciliation landscape (Japan + Vietnam)'
decision: 'Is the plan-to-tracker reconciliation wedge already owned, and how should a standalone PMI-grounded PM tool position against MS Project, Jira-side planning, sync tools, eng-intelligence and JP/VN local tools?'
source: 'native-run'
status: complete
preset: 'standard'
validation: 'normal'
created: '2026-09-19'
updated: '2026-09-19'
claims_verified: 13
claims_unverified: 9
claims_disputed: 0
claims_overturned: 0
---

# Competitive research: Plan-tracker reconciliation landscape (Japan + Vietnam)

**Decision this research serves:** Is the plan-to-tracker reconciliation wedge already owned? And how should a standalone, PMI-grounded PM tool position itself against MS Project, Jira-side planning apps, sync tools, engineering-intelligence platforms and local tools in Japan and Vietnam?

## Executive summary

**Verdict: nobody owns the wedge, but half of it is already a commodity. Position on the half nobody has.**

| Cluster | Wedge verdict | Threat to the wedge |
|---|---|---|
| Microsoft (Project Online / Planner Premium) | No | Low: no tracker actuals at all [6][13] |
| Jira-side planning (Tempo, Jira Plans, BigPicture, Focus) | Partial: plan-vs-actual in hours and money, but out-of-scope work is dropped silently [17][18] | Medium: moving upmarket to portfolio finance [21][22] |
| Sync (Ceptah, PSLink, Unito, Exalate) | Partial: actuals feed for linked tasks only [29][30] | Low: plumbing, priced cheaply [27] |
| Engineering intelligence (LinearB, Swarmia, Jellyfish) | Partial in concept: "Uncategorized" bucket, FTE cost [34] | Medium: cheap for them to add, but no hours, no baseline, no Backlog [34][37][40] |
| Japan + Vietnam local (Backlog, Lychee, TeamSpirit, Base) | No | Low: coarse project-level feeds only [50][51] |

1. **Commodity: feeding tracker hours into a plan's actuals.** Ceptah Bridge, TPG PSLink, Tempo Financial Manager and TeamSpirit's Jira connector already do this for linked work [16][29][30][51]. "We sync actual hours back to the plan" does not differentiate.
2. **Unowned: quantifying tracker work that belongs to no plan item, in hours or money, next to a separate baseline ledger.** Three independent sweeps found no current product that does this [17][18][29][59]. The only past claimant was Engineerforce's 2021 tool; the company has since pivoted to agency work [53][54].
3. **Japan has two forcing events, about 100 days apart, that hit both sides of the product.**
   - **Plan side:** Microsoft Project Online retires on **2026-09-30**, 11 days after this report, with data inaccessible afterwards [1][2][3]. Planner Premium replaces it with one baseline, no timesheets and no cost module [6][11][12].
   - **Tracker side:** Backlog, the #1 PM tool in Japan by ITreview review volume [43], is repricing on **2027-01-01**. The cheapest unlimited-user plan goes from ¥16,000 to ¥36,300 per month [45][46], and users are reacting publicly [46].

**What to do.**
- **R1:** Lead with the unmapped-work ledger plus a separate baseline ledger; treat actuals sync as table stakes. (Medium confidence.)
- **R2:** Beachhead in Japan with .mpp import plus a Backlog connector, timed to 2026-09-30 and 2027-01-01. (High for the dates; demand size unquantified.)
- **R3:** Build the actuals ledger as snapshot deltas. Backlog's API exposes only one `actualHours` value per issue and has no worklog endpoint [48], so hours cannot be attributed by person or date any other way. (High confidence.)

**Biggest caveats.**
- The claim "nobody does this" rests on evidence of absence: official docs and marketing, not hands-on trials. It is medium confidence and should be treated as valid until **2026-12-01** (see Staleness map). A one-hour Tempo trial and a Jellyfish demo are the cheapest ways to overturn it.
- No competitor's customer asked for "unmapped work in hours". The voiced pain is one level up: missing baselines and "I can't compare the plan with what happened" (§6). The demand for the wedge itself is therefore inferred, not observed.

---

## 1. Microsoft incumbent (Project desktop / Project Online / Planner Premium)

**Wedge verdict: No.** Nothing in the Microsoft stack measures tracker work that is outside the plan.

**Offer.**
- **Project Online retires on 2026-09-30.** Microsoft Learn banners and a Microsoft staff answer give the date. The staff answer states that after that date "Project Online and its data will no longer be accessible" [1][2]. An independent university IT notice confirms the date [3] (verified). No official text retrieved says "no read-only period" in those words. The official blog post would not load, so that detail is medium confidence.
- **Project for the web retired on 2025-08-01.** It now lives on as "premium plans" in Planner [4].
- **What Planner Premium (Plan 3) ships:**
  - dependencies with lead/lag, critical path, a baseline, Gantt, sprints, roadmaps, workload and Copilot [5];
  - **no budget/cost module** and no planned-vs-actual cost [6];
  - according to a competing vendor (an interested party): no timesheets, no enterprise resource pool, one baseline where Project Online had 11, a cap of 3,000 tasks per plan, and 10 custom fields [11] (medium confidence; partly corroborated by [6]).
- **Migration from Project Online is manual.** Baselines and resources are not imported, and scheduling can calculate differently [12].

**Tracker integration.**
- **No native Planner–Jira sync.** The options are the generic Power Automate Jira connector or small third-party apps that sync status only [13].
- **Microsoft's own advice for actuals is do-it-yourself:** Power Automate plus a shared "stable identifier" written into custom fields, then Power BI [6].
- **Real plan-vs-actual exists only in Dynamics 365 Project Operations.** It is fed by Microsoft time sources, not external trackers [10].

**Pricing** (direction: consolidation onto Plan 1 and Plan 3):
- **Microsoft Learn now lists only Plan 1 and Plan 3** as premium subscriptions [7].
- **Plan 5 and Project Online Essentials were reportedly retired from sale in 2026** [8] (medium confidence; secondary source reposting Message Center).
- **List prices:** about $10 / $30 / $55 per user per month for Plan 1 / 3 / 5, per aggregators [9] (medium confidence; the primary pricing page did not load).

**Japan.** Sayama Keizai Kenkyujo (SRI) sells five Project Online migration paths. One is its own hosted "Project+", pitched as Project Online-equivalent and supported through 2031, priced by quote [14][15]. The pitch is continuity of WBS/Gantt. None of the paths includes tracker reconciliation.

## 2. Jira-side planning (Jira Plans, BigPicture, Tempo, Atlassian Focus)

**Wedge verdict: Partial.** Planned-vs-actual exists in hours and money (Tempo). Nothing quantifies unmapped work. Everything here is Jira-only.

**Offer.**
- **Tempo** is the closest incumbent to a ledger of planned vs actual.
  - Financial Manager compares actual and projected hours, cost and revenue, using logged time [16].
  - Capacity Planner has a "Planned vs Actual" report in hours [18].
  - Project scope is a Jira filter. The FAQ describes no handling or reporting of worklogs outside that filter [17].
  - The variance report only highlights overage in yellow; it never shows unplanned time as its own line [18].
- **Jira Plans** has **no baselines**. Users fall back on custom date fields and JQL history queries [23]. It also has no critical path, per a third-party vendor [24] (medium confidence).
- **BigPicture** has schedule baselines in its Enterprise edition [19] and imports MS Project files [20]. It does not reconcile hours or cost.

**Trajectory: both Jira-side leaders are moving upmarket into portfolio finance, not down to ticket-level reconciliation.**
- **Atlassian (August 2026):** Focus **Funds** puts budgets, costs, forecasts and variance on initiatives. A Strategic Intelligence AI beta also launched. Atlassian itself claims only 11% of leaders have work connected to priorities [22].
- **Appfire (2026-08-04):** launched BigPicture Advanced for strategic portfolio management and financial governance [21].
- **Atlassian Data Center:** new sales ended 2026-03-30 and end of life is 2029-03-28 [25] (medium confidence). This pushes on-prem Jira shops to the cloud (how many Japanese shops are on-prem was not researched).

**Pricing.**
- **Jira Premium:** about $18.30 per user per month at 100 users (third-party figure; low-medium confidence).
- **Tempo:** users complain about paying per Jira user for every module, and about data lock-in when they leave [26].

## 3. Sync / integration (Ceptah, TPG PSLink, Unito, Exalate, Getint, OpsHub, Planview Hub)

**Wedge verdict: Partial, on the actuals-feed half only.**

**Offer.**
- **Ceptah Bridge** is the dedicated MS Project ↔ Jira plug-in.
  - It maps Time Spent to Actual Work, and Work Log to daily Task Usage [29].
  - Links are an issue key stored in a task custom field [62]. Every time-tracking mapping "has no effect" on unlinked tasks [29].
  - Its docs say nothing about baselines [29] (unverified whether any baseline support exists beyond MS Project's native one).
  - Each sync is a manual review-and-apply run inside the MS Project desktop client [62].
- **TPG PSLink** sends work packages from Project Server/Online into Jira, and pulls effort back to the plan and on to SAP [30].
- **Unito and Exalate** are tracker-to-tracker tools. Neither lists an MS Project connector [31][32]. Getint and OpsHub were checked in search snippets only, and no MS Project connector was found (low confidence).

**Pricing.**
- **Ceptah** charges per planner seat: $360/yr for 1 user up to $3,120/yr for 20 users [27]. It has 4.4★ from 16 reviews and a last release on 2026-06-01, a small, maintained user base [28].
- **Unito** meters by items in sync [31]. **Exalate** moved to per-connection, active-item pricing and bundled AI [32].

**Backlog.** No MS Project ↔ Backlog bridge exists in English or Japanese. Nulab positions Backlog as an *alternative to* MS Project [33].

## 4. Engineering intelligence (LinearB, Swarmia, Jellyfish; DX now Atlassian)

**Wedge verdict: Partial in concept; No in substance.** These tools have no external plan, no baseline and no hours. **Threat level: medium.** They already compute cost per issue, so an "unmapped cost" report would be cheap for them to add.

**Offer.**
- **Effort is inferred from activity, not logged.** None of these tools use hours:
  - LinearB splits each person-day equally across that person's active issues; cost = FTE × average salary [34].
  - Swarmia caps each developer at 1 FTE per month [37], and added cost reporting on 2026-06-16 [38].
  - Jellyfish uses a proprietary "Allocations" model combined with payroll data [41].
- **Closest analogue to the wedge:** LinearB's "Uncategorized" bucket and its "Issues With No Epics" metric [34].
- **LinearB's planned-vs-unplanned view is sprint scope creep only:** issues or story points added more than 24 hours after sprint start [35].

**Coverage.** Jira, Linear and Azure Boards only. No Backlog, Asana or MS Project, and no sign of a Japan/APAC presence [34][39][40].

**Pricing and buyer.**
- **LinearB:** $29–59 per developer per month, with minimums of 50 and 100 developers; allocation is Enterprise-only [36].
- **Swarmia:** $45–55 per developer per month, free under 10 developers [39].
- **Buyer:** VP Engineering or CTO, not the PMO.

**Trajectory.** The category is pivoting to measuring the impact of AI tools [36][39]. Atlassian bought DX in 2025 [42].

**Sentiment.** Allocation is only as accurate as ticket linking, and drill-down into individuals reads as surveillance [60] (low confidence; comparison blogs, not first-party reviews).

## 5. Japan + Vietnam local landscape

**Wedge verdict: No.** No Japanese or Vietnamese product keeps a persistent WBS ↔ Backlog/Jira mapping with an unmapped-work ledger.

**Japan traction.**
- **Backlog leads ITreview's project-management category by far:** 746 reviews, against 213 for Jira, 206 for Redmine and 204 for Asana (as of 2026-09-07) [43].
- **Nulab reports** more than 15,000 paid contracts and about 1.43M users [47] (medium confidence; figures from a search summary).
- **A BOXIL survey of 1,825 respondents ranks クラウドログ first** by market share [58]. That is a different metric (market share, not review volume), and the source page was not opened, so confidence is low (see Open questions).

**Backlog's plan-vs-actual gap.**
- Backlog stores one estimated-hours and one actual-hours value per issue. Actual hours need the Standard plan or above [44].
- The API has no worklog endpoint [48].
- No Gantt baseline was found.
- Users build spreadsheet and script workarounds to total hours [49].

**Backlog repricing** (announced 2026-06-17, effective 2027-01-01):
- The four plans become three: Economy ¥21,000, Business ¥36,300 (unlimited users) and Professional ¥100,000 per month [45].
- Cross-project Gantt and the AI assistant go to Business and above [45].
- ITmedia reports a public backlash. One firm's annual cost rises about 2.3× [46] (verified: Nulab plus an independent press source).

**Local plan-vs-actual (予実) tools.**
- **Lychee Redmine Premium** (¥1,400 per user per month) adds EVM and cost management, but its actuals come from Redmine only [50].
- **TeamSpirit's Jira connector** (built by Ricksoft, 2023) maps each Jira project to one TeamSpirit job. That is coarse, not per ticket. TeamSpirit's official connector list has no Backlog connector [51][52].
- **OBPM Neo** is PMBOK/CMMI-oriented project budget-vs-actual for SI PMOs. No tracker connector was confirmed [55].
- **Japanese Jira shops** go to Tempo for organisation-level 工数 [61].

**Vietnam.**
- **Base Wework** has Gantt, budget fields and workload balancing, but no tracker integration or actual-cost ledger [57].
- **BrSE job postings at offshore firms serving Japan** list Jira, Backlog and Redmine together [56]. It is a mixed-tracker environment, and which tracker dominates is unproven.

## 6. Customer voice across clusters (complaint themes)

| Theme | Hits | Evidence |
|---|---|---|
| No real baseline vs actual | Jira Plans, BigPicture (Enterprise-only, one per program), Planner Premium (one baseline, not migrated) | [23][19][12][11] |
| Cost depends on worklogs, and cost reporting is weak | Tempo Financial Manager, Planner Premium (no timesheets) | [26][11] |
| Per-seat pricing and module sprawl | Tempo (charged per Jira user for each module) | [26] |
| Lock-in and migration pain | Tempo worklog metadata, Project Online → Planner | [26][12] |
| Fragile or manual plan↔tracker sync | Ceptah (desktop review-and-apply), engineering-intelligence tools (depend on ticket hygiene) | [62][60] |
| Surveillance perception | LinearB, Jellyfish | [60] |

The strongest first-party signal is **not** the wedge itself. It is the missing baseline (Jira Plans, Planner) and the painful migration. No reviewer asked for "unmapped work in hours". The pain is voiced one level up: "I can't compare the plan with what happened." Atlassian's public tracker has an open request for planned vs unplanned hours in sprint reports [59].

---

## Cross-dimension insights

1. **The differentiator has to be defined as the unmapped-work ledger, not as syncing actuals.** Across clusters 2, 3 and 5, four vendors already move tracker hours onto linked plan items [16][29][30][51]. What nobody does is: (a) persistently map work packages to tickets across trackers, (b) report the complement, meaning tickets and hours outside every work package, and (c) keep it on a ledger separate from the baseline. Any positioning that leads with "sync" lands in a crowded, cheap category ($360/yr Ceptah [27]).
2. **Japan's two forcing events hit the product's two halves.** The Project Online hard stop (plan side, 2026-09-30) [1][2] and the Backlog repricing (tracker side, 2027-01-01) [45][46] fall within about 100 days of each other. The Japanese migration vendors sell only MS Project continuity [14][15]. The first product whose pitch is "import your .mpp, connect Backlog, see what's missing" has no direct Japanese competitor found in this run.
3. **Backlog's API shapes the architecture.** With only a single `actualHours` value per issue and no worklog endpoint [48], a Backlog connector can only build an actuals ledger by snapshotting and diffing that value over time. Per-person and per-day attribution is approximate, and the hours field is gated to paid tiers [44][45]. The actuals ledger must be designed as time-series deltas, not imported worklogs. It must also degrade gracefully to ticket counts when hours are absent.
4. **The adjacent threat and the moat point in the same direction.** Engineering-intelligence vendors could add "unmapped cost" cheaply [34], but they are VP-Engineering-facing, Jira/Linear-only, activity-inferred and absent from Japan [34][39][40]. The defensible combination is PMI plan import, multi-tracker coverage including Backlog, hours-based ledgers, and a Japanese-localised product sold to the PMO buyer. Each piece is weak alone.
5. **Framing risk surfaced by competitors' users.** Agile communities push back on "proving the plan was accurate" [23]. Engineering-intelligence tools carry a surveillance stigma [60]. This supports framing plan-vs-actual divergence as a measure of the *plan's* accuracy, and unplanned work as information rather than a judgement of team members.
6. **Redmine appears more relevant to the Japan/Vietnam target than Asana.** On ITreview, Redmine (206) is level with Asana (204) [43]. Redmine also appears in Vietnamese offshore BrSE job requirements where Asana does not [56], and it is the actuals base of Lychee Redmine [50]. This is a directional signal, low-medium confidence.

## Recommendations

| # | Recommendation | Feeds | Confidence basis |
|---|---|---|---|
| R1 | Position on the **unmapped-work ledger + separate baseline ledger**. Treat actuals sync as table stakes, never as the headline. | Brief: differentiation; PRD: core value | Medium. Rests on absence of evidence across 3 sweeps [17][29][53][54]; hands-on checks still pending |
| R2 | Make **.mpp/XML import + Backlog connector** the Japan beachhead, with messaging timed to Project Online retirement (2026-09-30) and Backlog repricing (2027-01-01). | Brief: target segment and timing; GTM | High for the dates [1][2][3][45][46]; medium for the size of demand (Japanese installed base unquantified) |
| R3 | Design the actuals ledger as **snapshot deltas** so it works with Backlog's single per-issue hours value. Fall back to ticket counts when hours are missing or plan-gated. | Architecture constraint | High [48][44] |
| R4 | Consider **Redmine ahead of Asana** in the connector order for Japan/Vietnam offshore. | PRD: v1 connector scope | Low-medium [43][56] |
| R5 | **Price per planner/PM seat, not per tracker user.** This matches Ceptah's model [27] and avoids Tempo's most-cited complaint [26]. A flat per-space model (Backlog's) is now also a sore point [46]. | Brief: business model | Medium |
| R6 | Build competitive battlecards around the **missing baseline** (Jira Plans, Planner) and **silent exclusion** (Tempo filter scope, Ceptah unlinked tasks). These are documented and verifiable. | GTM battlecards | High for the facts [17][18][23][29]; the win rate is untested |
| R7 | Watch engineering-intelligence vendors (LinearB, Swarmia, Jellyfish) for an "unmapped cost" feature. Re-check their changelogs quarterly. | Risk register | Medium [34][38] |

## Open questions

**Could overturn R1**

1. **クラウドログ (Crowd Log):** it ranks #1 in the BOXIL survey [58] as a Japanese hours/plan-vs-actual tool. Does it connect to Backlog or Jira and flag unplanned work? It is the most likely direct Japanese competitor and was not researched.
2. **Does Tempo really have no unplanned/unscoped worklog view?** Only docs were read. What would answer it: a one-hour Tempo Cloud trial (Financial Manager + Capacity Planner) with deliberately out-of-scope worklogs.
3. **Jellyfish:** does its Scenario Planner or deliverables model hold a planned-effort baseline? What would answer it: a demo or its docs, since pricing is not public.

**Sizing and timing (R2, R4)**

4. **Size of the stranded Project Online base in Japan,** and whether Planner Premium adoption is absorbing it. What would answer it: partner (SRI) interviews, or Microsoft Japan statements.
5. **Where are Backlog price-hike switchers going?** ITmedia names no destinations [46]. What would answer it: X/note/ITreview posts after 2026-08-26.
6. **Which tracker dominates in Vietnamese offshore firms serving Japan?** Only job-post evidence exists [56]. What would answer it: Viblo/company-blog sweeps or customer interviews.

**Housekeeping**

7. **Does Engineerforce's 2021 product still run behind its login** [54]? It does not affect positioning unless it has been revived.
8. **Microsoft's exact read-only / data-deletion wording** in the official retirement blog post, which did not load.

## Source appendix

| [n] | Supports | Publisher | Pub date | Accessed | Confidence |
|---|---|---|---|---|---|
| [1] | Project Online retires 2026-09-30 (docs banner) | [Microsoft Learn](https://learn.microsoft.com/projectonline/get-started-with-project-online) | live | 2026-09-19 | high |
| [2] | Data inaccessible after retirement; migration paths | [Microsoft Q&A (staff)](https://learn.microsoft.com/answers/a/12266340) | unknown | 2026-09-19 | high |
| [3] | Independent confirmation of the retirement date | [Univ. of Toronto EASI](https://easi.its.utoronto.ca/project-online-retiring-september-30-2026/) | unknown | 2026-09-19 | medium |
| [4] | Project for the web retired 2025-08-01 → Planner premium | [Microsoft Learn](https://learn.microsoft.com/office365/servicedescriptions/project-online-service-description/project-web-service-description) | unknown | 2026-09-19 | high |
| [5] | Plan 3 feature set (baseline, critical path, Gantt) | [Microsoft Q&A](https://learn.microsoft.com/answers/a/12653922) | 2026 | 2026-09-19 | high |
| [6] | No cost module; DIY Power Automate actuals; D365 pointer | [Microsoft Q&A (moderator)](https://learn.microsoft.com/answers/a/12744045) | 2026 | 2026-09-19 | high |
| [7] | Only Plan 1/3 listed as premium subscriptions | [Microsoft Learn](https://learn.microsoft.com/planner/licensing) | live | 2026-09-19 | high |
| [8] | Plan 5 / Essentials end of sale (MC1253809) | [PUPUWEB](https://pupuweb.com/mc1253809-planner-and-project-online-licensing-change-project-plan-5-and-project-online-essentials-retire-from-sale/) | 2026 | 2026-09-19 | medium |
| [9] | Plan 1/3/5 list prices | [Costbench](https://costbench.com/software/project-management/microsoft-planner/) | 2026 | 2026-09-19 | medium |
| [10] | D365 Project Operations plan-vs-actual from MS time sources | [Microsoft Learn](https://learn.microsoft.com/dynamics365/release-plan/2026wave1/enterprise-resource-planning/dynamics365-project-operations/track-real-project-progress-field-execution) | 2026 | 2026-09-19 | high |
| [11] | Planner Premium gaps vs Project Online | [Onplana](https://onplana.com/blog/microsoft-planner-premium-falls-short-enterprise) | 2026 | 2026-09-19 | medium (interested vendor) |
| [12] | Manual migration; baselines/resources not imported | [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/5846989/project-online-project-center-to-planner-premium-m) | 2026-04 | 2026-09-19 | medium-high |
| [13] | Planner↔Jira connectors sync status only | [Crosstown Tech](https://crosstowntech.com/apps/sync-microsoft-planner-with-jira/) | 2025–2026 | 2026-09-19 | medium |
| [14] | SRI's five Project Online migration paths | [PR TIMES (SRI)](https://prtimes.jp/main/html/rd/p/000000002.000009095.html) | 2025-10 | 2026-09-19 | high |
| [15] | SRI Project+ hosted service | [SRI](https://www.sayamakeizai.co.jp/news/reintroduce/) | 2025-10 | 2026-09-19 | high (existence) |
| [16] | Tempo FM actual vs projected hours/cost/revenue | [Tempo help](https://help.tempo.io/financialmanager/latest/comparing-actual-kpis-versus-projected-kpis) | unknown | 2026-09-19 | high |
| [17] | Tempo FM scope = Jira filter; no out-of-scope handling | [Tempo help](https://help.tempo.io/financialmanager/latest/cost-tracker-faq) | unknown | 2026-09-19 | high (absence in FAQ) |
| [18] | Tempo Planned vs Actual report; overage colour only | [Tempo help](https://help.tempo.io/planner/latest/planned-vs-actual-reports) | unknown | 2026-09-19 | high |
| [19] | BigPicture baselines (Enterprise) | [Appfire docs](https://appfire.atlassian.net/wiki/spaces/DLP/pages/297635840) | unknown | 2026-09-19 | medium |
| [20] | BigPicture MS Project import | [BigPicture blog](https://bigpicture.one/blog/migrating-ms-project-jira/) | unknown | 2026-09-19 | medium |
| [21] | BigPicture Advanced launch | [Appfire newsroom](https://appfire.com/newsroom/bigpicture-advanced-strategic-portfolio-management-jira) | 2026-08 | 2026-09-19 | medium |
| [22] | Atlassian Focus Funds, Strategic Intelligence, 11% stat | [Atlassian](https://www.atlassian.com/blog/leadership/innovation-spotlight-august-2026) | 2026-08 | 2026-09-19 | high |
| [23] | Jira Plans has no baselines; workarounds; agile pushback | [Atlassian Community](https://community.atlassian.com/forums/Jira-questions/Using-Jira-Plans-formally-portfolio-how-to-manage-baselines/qaq-p/2239965) | 2023-01 | 2026-09-19 | medium (stale thread) |
| [24] | Jira Plans lacks critical path | [Simple Gantt](https://getsimplegantt.com/blog/jira-critical-path-guide/) | 2026 | 2026-09-19 | medium (interested vendor) |
| [25] | Atlassian DC end of sale / end of life | [ONES](https://ones.com/blog/atlassian-data-center-pricing-increase-2026/) | 2026 | 2026-09-19 | medium |
| [26] | Tempo cost/per-module and lock-in complaints | [Atlassian Community](https://community.atlassian.com/forums/Jira-questions/Is-Tempo-the-best-time-tracking-app-for-Jira/qaq-p/2930710) | 2025-01 / 2026-02 | 2026-09-19 | medium |
| [27] | Ceptah features and per-planner pricing | [Ceptah](https://www.ceptah.com/) | unknown | 2026-09-19 | medium |
| [28] | Ceptah traction (4.4★/16, v3.19.1 2026-06) | [Atlassian Marketplace](https://marketplace.atlassian.com/apps/9203/ceptah-bridge-jira-ms-project-plugin) | 2026-06 | 2026-09-19 | high |
| [29] | Ceptah time mappings; no effect on unlinked tasks | [Ceptah docs](https://www.ceptah.com/Guide/TimeTrackingMappings) | unknown | 2026-09-19 | high |
| [30] | TPG PSLink Jira ↔ Project Server/Online, effort to SAP | [The Project Group](https://www.theprojectgroup.com/en/middleware/jira-integration) | unknown | 2026-09-19 | medium |
| [31] | Unito pricing model; no MS Project connector | [Unito](https://unito.io/pricing/) | live | 2026-09-19 | high |
| [32] | Exalate connectors and pricing model | [Exalate docs](https://docs.exalate.com/docs/new-exalate-pricing-model) | unknown | 2026-09-19 | medium |
| [33] | Nulab positions Backlog vs MS Project | [Nulab](https://nulab.com/compare/backlog-vs-microsoft-project/) | unknown | 2026-09-19 | medium |
| [34] | LinearB allocation model, Uncategorized, trackers | [LinearB docs](https://linearb.helpdocs.io/article/npdalbbe4e-resource-allocation-1) | unknown | 2026-09-19 | high |
| [35] | LinearB planned vs unplanned = sprint scope creep | [LinearB docs](https://linearb.helpdocs.io/article/g4czwado46-understanding-project-delivery-trackers) | unknown | 2026-09-19 | high |
| [36] | LinearB pricing and minimums | [LinearB](https://linearb.io/pricing) | live | 2026-09-19 | high |
| [37] | Swarmia effort model (1 FTE/dev/month) | [Swarmia help](https://help.swarmia.com/features/focus/balance-engineering-investments/activity-and-effort-based-models) | unknown | 2026-09-19 | high |
| [38] | Swarmia added cost 2026-06-16 | [Swarmia changelog](https://www.swarmia.com/changelog/2026-06-16-fte-cost/) | 2026-06 | 2026-09-19 | high |
| [39] | Swarmia pricing and trackers | [Swarmia](https://www.swarmia.com/pricing/) | live | 2026-09-19 | high |
| [40] | Jellyfish integrations (no Backlog/Asana/MSP) | [Jellyfish](https://jellyfish.co/integrations/) | live | 2026-09-19 | high |
| [41] | Jellyfish allocations + payroll cost model | [Jellyfish](https://jellyfish.co/platform/rd-cost-capitalization-2/) | unknown | 2026-09-19 | medium |
| [42] | Atlassian acquires DX | [Atlassian](https://www.atlassian.com/blog/announcements/atlassian-acquires-dx) | 2025-09 | 2026-09-19 | high |
| [43] | ITreview PM category review counts | [ITreview](https://www.itreview.jp/categories/project-management) | 2026-09 | 2026-09-19 | high (single publisher) |
| [44] | Backlog current pricing; hours from Standard up | [Nulab](https://backlog.com/ja/pricing/) | live | 2026-09-19 | high |
| [45] | Backlog plan renewal effective 2027-01-01 | [Nulab](https://nulab.com/ja/info/backlog-plan-renewal/) | 2026-06 | 2026-09-19 | high |
| [46] | Backlog price-hike backlash | [ITmedia NEWS](https://www.itmedia.co.jp/news/article/2608/27/2000000862/) | 2026-08 | 2026-09-19 | high |
| [47] | Backlog 15k paid contracts / ~1.43M users | [Nulab press](https://nulab.com/ja/press/pr2511-backlog-cacoo-update/) | 2025-11 | 2026-09-19 | medium |
| [48] | Backlog API: per-issue estimated/actualHours only, no worklog endpoint | [Nulab Developer](https://developer.nulab.com/docs/backlog/api/2/get-issue/) | live | 2026-09-19 | high |
| [49] | Backlog hours aggregated via spreadsheets | [GLASS](https://glass-inc.jp/media/how-to-automatically-aggregate-backlog-man-hours-in-a-google-spreadsheet/) | unknown | 2026-09-19 | medium |
| [50] | Lychee Redmine pricing, EVM/cost features | [Agileware](https://lychee-redmine.jp/plan/) | live | 2026-09-19 | high |
| [51] | TeamSpirit Connector for Jira (project→job mapping) | [TeamSpirit](https://www.teamspirit.com/news/jira) | 2023-01 | 2026-09-19 | medium (stale) |
| [52] | TeamSpirit TS Connect list; no Backlog | [TeamSpirit](https://www.teamspirit.com/ts-connect/function/mm) | live | 2026-09-19 | high |
| [53] | Engineerforce 2021 estimate-vs-Jira, unplanned work | [ASCII.jp](https://ascii.jp/elem/000/004/049/4049610/) | 2021-03 | 2026-09-19 | high (stale) |
| [54] | Engineerforce now an agency | [Engineerforce](https://engineerforce.io/) | current | 2026-09-19 | medium |
| [55] | OBPM Neo PMBOK/CMMI budget vs actual | [SINT](https://products.sint.co.jp/obpm) | unknown | 2026-09-19 | medium |
| [56] | VN BrSE postings list Jira, Backlog, Redmine | [Rikkeisoft careers](https://tuyendung.rikkeisoft.com/recruitment/detail/tuyen-dung-brse1712565302) | unknown | 2026-09-19 | medium |
| [57] | Base Wework features | [Base.vn](https://base.vn/app/wework) | unknown | 2026-09-19 | medium |
| [58] | BOXIL survey: クラウドログ #1 | [BOXIL Magazine](https://boxil.jp/mag/a7777/) | 2025-05 | 2026-09-19 | low |
| [59] | Open request: planned vs unplanned in sprint report | [Atlassian JIRA](https://jira.atlassian.com/browse/JSW-11327) | unknown | 2026-09-19 | medium |
| [60] | Eng-intel accuracy depends on hygiene; surveillance | [CodePulse](https://codepulsehq.com/guides/engineering-analytics-tools-comparison) | 2026 | 2026-09-19 | low |
| [61] | JP Jira shops go to Tempo for 工数 | [Ricksoft](https://www.ricksoft.jp/blog/articles/001712.html) | unknown | 2026-09-19 | medium |
| [62] | Ceptah linkage by issue key; manual sync runs | [Ceptah docs](https://www.ceptah.com/Guide/Synchronisation) | unknown | 2026-09-19 | high |

## Staleness map

Computed by `recon_kit.py staleness` with these windows: feature and pricing 3 months, trajectory and traction 6 months, sentiment 12 months. 6 of the 22 tracked claims are already outside their window.

| Claim | Class | Pub | Re-check by | Stale |
|---|---|---|---|---|
| [53] Engineerforce 2021 surfaced unplanned Jira work | feature | 2021-03 | 2021-06-01 | **yes**. Historical only; the product's current status is the open question |
| [23] Jira Plans has no baselines | feature | 2023-01 | 2023-04-01 | **yes**. Re-check JSWCLOUD-20495 status |
| [51] TeamSpirit Jira connector project→job mapping | feature | 2023-01 | 2023-04-01 | **yes**. Re-check the Marketplace listing |
| [58] BOXIL: クラウドログ #1 share | traction | 2025-05 | 2025-11-01 | **yes** |
| [45] Backlog repricing 2027-01-01 | pricing | 2026-06 | 2026-09-01 | **yes** by publication date. The announcement is recent; re-check before 2027-01-01 |
| [38] Swarmia added cost reporting | feature | 2026-06 | 2026-09-01 | **yes**. Watch the changelog (R7) |
| [6] [11] [17] [18] [29] [34] [40] [48] feature claims; the "nobody quantifies unmapped work" absence claim | feature | 2026-09 | 2026-12-01 | no |
| [9] [27] Planner and Ceptah pricing | pricing | 2026-09 | 2026-12-01 | no |
| [21] [22] BigPicture Advanced, Atlassian Focus Funds | trajectory | 2026-08 | 2027-02-01 | no |
| [1] [54] Project Online retirement, Engineerforce pivot | trajectory | 2026-09 | 2027-03-01 | no |
| [43] ITreview Backlog lead | traction | 2026-09 | 2027-03-01 | no |

**Earliest non-historical re-check: 2026-12-01.** It covers the absence claim behind the wedge, and all competitor feature and pricing claims. Run a Refresh then, and again right after 2027-01-01 to capture Backlog's repricing aftermath.
