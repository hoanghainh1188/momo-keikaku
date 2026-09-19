---
title: Reconciliation — Product Brief vs PRD
created: 2026-09-19
inputs:
  - briefs/brief-momo-keikaku-2026-09-19/brief.md
  - briefs/brief-momo-keikaku-2026-09-19/addendum.md
targets:
  - prds/prd-momo-keikaku-2026-09-19/prd.md
  - prds/prd-momo-keikaku-2026-09-19/addendum.md
---

# Reconciliation: Product Brief → PRD

Scope: everything in the brief and brief addendum that the PRD and PRD addendum drop, contradict, weaken, or misstate. These known intentional choices are **not** flagged: .mpp is post-v1; UI in EN/JA; EVM is effort-based in hours; Catch-all WP and Tracker Snapshot vs Published Snapshot are PRD additions.

Severity key: **high** = changes a product decision, a principle, or a core risk; **medium** = loses information that downstream UX, architecture, or GTM work needs; **low** = nuance, market detail, or wording.

## Summary

| # | Gap | Severity |
|---|---|---|
| G1 | The "demand is inferred" risk is dropped, and §6.1 makes "Unmapped Work" the headline anyway | high |
| G2 | Client default visibility is wider than the brief's "decided" table (EVM summary and Unmapped Work total shown by default) | high |
| G3 | Risk, one of the four most painful report pages, can never reach the client or the xlsx export. This contradicts "all visibility is configurable" | high |
| G4 | Forecast is missing from the client view, and FR-32 does not say that it includes Unmapped Work | medium |
| G5 | "Free tier works from day one with no history" is dropped, and no FR covers the opening balance or first-day value | medium |
| G6 | There is no differentiation or honest-moat section: the "commodity" framing, the combination edge and the BrSE-seat authenticity are lost | medium |
| G7 | Lychee Redmine is missing from the competitor checks | medium |
| G8 | "Calendars must know each client's own company holidays" is weakened: v1 has no way to add project-level non-working days | medium |
| G9 | The PRD has no risk register, and v1 scope grows beyond the brief without being weighed against the one-founder risk | medium |
| G10 | Practice fact dropped: directors default to overtime, and the fixed delivery date is the binding constraint | low |
| G11 | Next-wave detail was thinned: forecast from baseline slip history and its driver contents, load heatmap including unmapped hours, Custom Fields mappable to tracker fields, lead magnet | low |
| G12 | Business-model nuance dropped: rework attribution, and willingness to pay that grows with data | low |
| G13 | Project Online, SRI Project+ and Flagxs market facts are dropped | low |
| G14 | Jira is narrowed to Jira Cloud only, which the brief does not state | low |
| G15 | "User training" as a cause of stalled tool switches is not addressed | low |
| G16 | "Users compensate with spreadsheets and scripts" and TeamSpirit (a commodity competitor) are dropped | low |

---

## G1. The "demand is inferred" risk is dropped, and the headline is set on an unvalidated phrase — HIGH

- **Source (brief, Risks):** "**Demand is inferred.** No one has yet asked for 'unmapped hours' by name; the voiced pain is 'I can't compare the plan with what happened.' The founder's own projects are the first real test."
- **PRD location:** missing. The PRD has no risk section. §6.1 says instead: "The headline is Unmapped Work measured in hours and money alongside a real Baseline (R1)". §8.2 says: "The wedge (FR-20–FR-31, FR-34–FR-36) is never cut."
- **Problem:** the PRD treats the wedge as validated demand. The brief says it is a hypothesis, and that users describe the pain as plan-vs-actual comparison, not "unmapped hours". No metric or open question checks the hypothesis.
- **Suggested fix:** add a Risks section (or an OQ) that carries this risk. In §6.1, allow copy to lead with the voiced pain ("compare the plan with what happened") and show Unmapped Work as the proof point. Add a validation signal to §9. For example, record whether the founder and the first client act on Unmapped Work (SM-7 partly does this), and capture the client's own words in the SM-3 follow-up conversation.

## G2. Client default visibility is wider than the brief's decided rules — HIGH

- **Source (brief addendum B, "Visibility rules (decided)"):** "Japanese client | The PM-published snapshot: health indicators (computed **including** unmapped hours), delivery milestones and schedule". Also: "the defaults above are a product principle."
- **PRD location:** FR-34 Consequences: "By default, Health Indicators, milestones, schedule (level 2), **the Unmapped Work total with Explain notes, and EVM summary** are shown." UJ-4 also shows the client "計画外作業 46h".
- **Problem:** by default the brief exposes Unmapped Work only through its effect on health. The PRD's default also exposes the raw Unmapped Work total and the EVM summary. Given the brief's contract-politics risk (scope disputes under 請負, billing disputes under 準委任), a visible hours total is a materially different default from health that includes the hours.
- **Suggested fix:** align the FR-34 defaults with addendum B (health, milestones and schedule). Make the Unmapped Work total, Explain notes and EVM summary opt-in per Project. Alternatively, record this as a deliberate change to a decided principle, with the reason, and get the founder's sign-off. Update UJ-4 to match.

## G3. Risk page cannot reach the client or the export, which contradicts "all visibility is configurable" — HIGH

- **Source (brief, Problem):** "Ahead/behind, cost, forecast and risk are rebuilt by hand in Excel and PowerPoint every cycle". Brief addendum E: "The most painful pages are ahead/behind, cost, forecast and risk." Brief addendum B: "All visibility is configurable; the defaults above are a product principle." Internal risks are hidden *by default*.
- **PRD location:** FR-37: "No Visibility Policy setting can expose internal Risks/Issues in v1." FR-38 bindable fields: "EVM Metrics, Health Indicators, Unmapped Work totals, milestone table, WP table". These include neither risks nor forecast. PRD addendum B says the Client View "should mirror those four pages".
- **Problem:** risk is one of the four pages that cost the PM time. In v1 there is no client-facing risk content and no way to put risks into the xlsx report, so the PM still builds that page by hand. This works against SM-1 (save 5 h/week). The absolute ban also contradicts "all visibility is configurable", and the PRD addendum's "mirror the four pages" contradicts the PRD body.
- **Suggested fix:** split Risks/Issues into internal and client-publishable, with internal as the default. Alternatively, let the PM mark individual risks as publishable. Add a risk table and forecast to the FR-38 bindable fields. If internal-only is intended, state it as a deliberate deviation and remove "risk" from addendum B's mirror list.

## G4. Forecast is missing from the client view, and FR-32 does not say it includes Unmapped Work — MEDIUM

- **Source (brief, What Makes This Different):** "It shows up inside pages the client already reads (EVM, health, forecast), not as a separate feature."
- **PRD location:** the FR-34 section list (Health Indicators, EVM detail, milestones, schedule, Unmapped Work detail, Explain notes, Change Request candidates) has no forecast. FR-32 says nothing about Unmapped Work. FR-38 has no forecast binding.
- **Suggested fix:** add Forecast as a Visibility Policy section. In FR-32, state that the forecast uses Project-level AC including Unmapped Work (FR-30), and list its inputs. Add forecast fields to FR-38.

## G5. "Works from day one with no history" is dropped — MEDIUM

- **Source (brief, Business Model):** "The free tier **sees the present** (reconciliation, unmapped work, divergence) and works from day one with no history."
- **PRD location:** §1 and §4.13 keep "sees the present" but drop "works from day one with no history". UJ-3 starts from "two weeks of Actuals Ledger history". No FR defines how hours that already exist on Tickets at the first Tracker Snapshot are treated. FR-25 implies an opening entry but does not say which Reporting Period it belongs to or how it affects AC and Unmapped Work.
- **Suggested fix:** add an FR, or Consequences on FR-19/FR-25, for the first snapshot. Pre-existing hours become an opening balance: dated at connection, attributed to the mapped WP or to Unmapped Work, and shown on the first Reconciliation Review. Add a day-one journey step to UJ-2: the PM sees Unmapped Work in hours and money right after the first snapshot. The day-one promise is also the free-tier promise.

## G6. No differentiation or honest-moat section — MEDIUM

- **Source (brief, What Makes This Different):** "Tracker hours on linked tasks are already a commodity (Tempo, Ceptah, TeamSpirit)." Also: "**Built from inside the BrSE seat.** … the founder's daily reality, not a researched persona." Also: "**The moat is thin, honestly.** … The edge is the combination (PMI plan, Backlog + Jira, hours-based ledgers, Japanese PM buyer) and execution speed."
- **PRD location:** partial. §1.1 keeps only "Execution speed is part of the moat". The commodity framing, the four-part combination and the insider authenticity are missing. The candid "thin moat" tone is also lost.
- **Suggested fix:** add a short "Differentiation" subsection under §1. It should say what is commodity and should not be over-invested in (linked-task hours), what the combination edge is, and the honest moat assessment. This guides which features must be excellent and which only need to be adequate.

## G7. Lychee Redmine is missing from the competitor checks — MEDIUM

- **Source (brief, Risks):** "**Competitors to check.** Crowd Log (クラウドログ) and Lychee Redmine for Japanese plan-vs-actual".
- **PRD location:** OQ-1 covers Crowd Log only. Lychee Redmine is not mentioned anywhere, although the PRD names Redmine as the next Connector (§8.2).
- **Suggested fix:** add Lychee Redmine to OQ-1, or add a new OQ. It matters twice: as a plan-vs-actual competitor, and when the Redmine Connector wave is planned.

## G8. Client company holidays are weakened — MEDIUM

- **Source (brief addendum E):** "Calendars must know each client's own company holidays."
- **PRD location:** FR-14 covers national JP/VN holidays only. Client, department and person calendars are "next wave" (§8.2, FR-14 Out of Scope). The brief itself defers *layered* calendars, but addendum E states the need as a "must".
- **Problem:** Japanese client companies commonly close on non-national days, such as year-end closures and summer holidays. In v1 these days count as working days, which distorts PV spread, dependency lag and SPI.
- **Suggested fix:** keep full layering in the next wave. In v1, allow a per-Project list of extra non-working days as a minimal client calendar that feeds FR-14's working-day calculations. At minimum, record the tension as an OQ.

## G9. No risk register, and v1 scope grows without being weighed against the one-founder risk — MEDIUM

- **Source (brief, Risks):** "**Scope versus one founder.** v1 grew beyond the brainstorm's minimal cut … It must be cut again if Q1 2027 slips."
- **PRD location:** §8.2 has a cut order, but the PRD has no Risks section. The brief's risks are scattered (§6.3, NFR-S4/S5, OQs) or missing (G1). The PRD also adds v1 scope the brief does not list:
  - full Custom Fields (FR-8); the brief addendum D lists Custom Fields as a next-wave idea;
  - raw data export (FR-39), which pulls forward part of the next-wave "Trust on migration" idea;
  - Program roll-up;
  - re-import diff;
  - four EAC methods plus TCPI;
  - email notifications and view tracking;
  - snapshot retraction;
  - the Internal Viewer role;
  - three sign-in methods.

  None of these are weighed against the one-founder risk.
- **Suggested fix:** add a §Risks that carries all six brief risks, with owner and mitigation. Mark each PRD scope addition that goes beyond the brief, and put the non-wedge additions (Custom Field grouping, the extra EAC methods, notifications) into the cut order.

## G10. Overtime and fixed-date practice fact dropped — LOW

- **Source (brief addendum E):** "Directors default to demanding overtime; the fixed contractual delivery date is the constraint that rules out other options."
- **PRD location:** missing. The PRD addendum C keeps the 36-kyotei check but not the reason behind it.
- **Suggested fix:** add it to PRD addendum B or C as the rationale for recovery options and the schedule-constrained EAC.

## G11. Next-wave detail thinned — LOW

- **Source (brief addendum D):**
  - Forecast: "from baseline slip history, with a drivers block (certain %, top slipping items, unmapped hours by team)".
  - Load statement: "planned versus real load including unmapped hours".
  - Custom fields: "mappable to tracker fields".
  - "Free lead magnet: a Japanese-language export and migration guide."
- **PRD location:** PRD addendum C drops the forecast's input (baseline slip history) and its driver contents, and drops "including unmapped hours" from the heatmap. FR-8 and addendum C drop "mappable to tracker fields". The lead magnet is missing.
- **Suggested fix:** restore these details in PRD addendum C. Put the lead magnet in a GTM note or an OQ.

## G12. Business-model nuance dropped — LOW

- **Source (brief, Business Model):** "The paid tier **learns from the past** (rework attribution, estimate accuracy, forecasting from history), so willingness to pay grows as data accumulates."
- **PRD location:** §1 and §4.13 keep only the slogan. Rework attribution and the logic that willingness to pay grows with data are missing. There is also a tension within the brief: "estimate-accuracy scoring" is listed as Out, yet it is part of the paid tier.
- **Suggested fix:** keep the three paid-tier capabilities and the accumulation logic in §4.13 or the addendum. This also justifies the append-only ledger design, because the data has to survive for the paid tier.

## G13. Project Online market facts dropped — LOW

- **Source (brief addendum A):** "The retirement does not affect Project desktop or local .mpp files. Only PWA, timesheets, OData and desktop sync to Project Online stop working." Also: "SRI Project+ (hosted Project Server, ¥100k–200k/month, supported until 2031) and Flagxs (migration campaign until 2026-10-31, 30% off)".
- **PRD location:** §1.1 and §2.2 name the vendors without these facts. PRD addendum D keeps the Planner correction only.
- **Suggested fix:** add these facts to PRD addendum D. They support why .mpp stays opportunistic and prevent overclaiming in messaging.

## G14. Jira narrowed to Cloud only — LOW

- **Source (brief, Scope):** "Backlog and Jira connectors (read-only)" (no edition limit).
- **PRD location:** FR-18 `[ASSUMPTION: Jira Data Center/Server is out of v1; Jira Cloud only.]` and §8.2.
- **Suggested fix:** confirm with the founder whether any of the five target projects use Jira DC/Server, and link this to OQ-2.

## G15. "User training" stall factor not addressed — LOW

- **Source (brief addendum E):** "Tool switches stall on data migration, user training, and custom fields that cannot match the real process."
- **PRD location:** PRD addendum B repeats the sentence but only acts on migration and custom fields. No onboarding requirement exists for the PM or the Client Viewer.
- **Suggested fix:** add a UX note or light NFR: a PM can reach the first Reconciliation Review without training, and a Client Viewer needs no instructions. SM-C3 hints at this.

## G16. Minor problem-framing facts dropped — LOW

- **Source (brief, Problem):** "users compensate with spreadsheets and scripts". Brief, What Makes This Different: "(Tempo, Ceptah, TeamSpirit)".
- **PRD location:** missing. FR-20 names Tempo and Ceptah only, in a different context.
- **Suggested fix:** add these facts to the §1 Vision problem paragraph and to the differentiation note (G6).
