---
title: momo-keikaku — Product Brief
status: final
created: 2026-09-19
updated: 2026-09-19
---

# momo-keikaku — Product Brief

## Executive Summary

momo-keikaku is a web-based project management tool for PMs and BrSEs who run Japanese client projects with offshore teams. The plan lives in an Excel WBS; the work lives in Backlog or Jira. Every week the PM reconciles the two by hand and rebuilds the same status report. Work that never made it into the WBS, usually the small stuff, silently drops out of actuals, so cost is understated and the next estimate is wrong again.

momo-keikaku is the single place where the plan, the real work and the numbers meet. The PM builds or imports the WBS (AI-assisted import from any Excel layout), connects Backlog and Jira, and gets progress, cost and EVM computed automatically, **including the hours spent on tickets that belong to no work package**. The client sees a snapshot the PM has reviewed and published, just as a teirei report is sent today, but with honest numbers and a fraction of the effort.

The founder is user zero: a PM and BrSE who lives this reconciliation every week. The first goal is to run the founder's own projects on the tool; the second is to bring in the founder's Japanese clients.

## The Problem

- **Two sources of truth, reconciled by hand.** The WBS is an Excel file created by the client, the PM or the offshore team, and maintained by the PM. Progress lives in Backlog or Jira. Matching the two for each weekly report costs the PM 5 hours or more a week.
- **Actuals are biased in one direction.** Emergent work is either forced into the plan (breaking the baseline) or silently dropped. What gets dropped is whatever seemed too small to record, so actuals are always understated, never overstated, and estimates built on that history stay wrong.
- **The report pages that hurt most are the ones with formulas.** Ahead/behind, cost, forecast and risk are rebuilt by hand in Excel and PowerPoint every cycle, even though PMI's EVM already defines them.
- **Backlog does not help.** It stores one estimated and one actual hours value per issue, and has no worklog API and no Gantt baseline; users compensate with spreadsheets and scripts. Backlog's repricing on 2027-01-01 moves cross-project Gantt to a higher tier.

## The Solution

A web application with three layers:

1. **A PMI-grounded plan.** The WBS is created in the tool or imported from Excel via an AI-assisted connector (with a preview the PM confirms before anything is committed), then edited in the tool from then on. Resources carry rates, cost rolls up along the WBS and by department, and a baseline ledger is kept separate from actuals.
2. **Reconciliation with the trackers.** Read-only Backlog and Jira connectors, a persistent work-package↔ticket mapping, and an actuals ledger built from snapshot deltas (the only way to track Backlog's single per-issue hours value over time). Tickets outside every work package are reported in hours and money.
3. **Publishing.** Honest EVM (SV/SPI, CV/CPI, EAC/ETC) and health indicators computed from the ledgers. The PM reviews, explains or re-plans, then publishes a snapshot to the client and exports it into the PM's existing xlsx report template.

## What Makes This Different

- **Unmapped work is measured, not dropped.** Tracker hours on linked tasks are already a commodity (Tempo, Ceptah, TeamSpirit). Quantifying the work that belongs to no plan item, alongside a separate baseline ledger, is something no product found in research does. It shows up inside pages the client already reads (EVM, health, forecast), not as a separate feature.
- **Honest but PM-mediated visibility.** By default the client sees the PM-published snapshot, and its health metrics include unmapped hours. The PM sees them first and decides how to present them (add to the WBS, raise a change request, explain). Visibility is configurable, but this default is the product's opinion.
- **Built from inside the BrSE seat.** Excel WBS + Backlog/Jira + Japanese client + offshore team is the founder's daily reality, not a researched persona.
- **The moat is thin, honestly.** Engineering-intelligence vendors could add an "unmapped cost" view cheaply; research's "nobody does this" conclusion holds only until about 2026-12-01. The edge is the combination (PMI plan, Backlog + Jira, hours-based ledgers, Japanese PM buyer) and execution speed.

## Who This Serves

- **Primary: the PM/BrSE** on Japan-facing offshore projects. Maintains the WBS, reconciles it with the tracker and produces the teirei report. Success: the report is right and takes minutes, and emergent work is visible before it becomes a surprise.
- **Secondary: the Japanese client.** Reads health, milestones and schedule from published snapshots. Success: trustworthy numbers without having to ask.
- **Tertiary: the offshore team.** Never learns the tool; keeps working in Backlog or Jira.
- **Not the buyer for v1:** enterprise PMOs migrating off Project Online. Few of the founder's clients use it, and that market already has vendors (SRI Project+, Flagxs campaign, Planner Premium).

## Success Criteria

Target: all three met in Q1 2027.

- The founder saves **5 hours per week** on reconciliation and reporting.
- **5 main projects** run on the tool.
- **The first client opens a published snapshot.**

## Scope

**In v1**
- WBS: create, AI-assisted Excel import with a PM-confirmed preview, edit; basic dependencies and date rollup (needed once the tool is the WBS source of truth).
- Resources and rates; cost rollup by WBS and department; Japanese and Vietnamese national holidays.
- Separate baseline and actuals ledgers; actuals as snapshot deltas, falling back to ticket counts when hours are missing.
- Backlog and Jira connectors (read-only), persistent work-package↔ticket mapping, unmapped-work report in hours and money.
- Honest EVM and health indicators; PM-published client snapshot with configurable visibility; xlsx export into the PM's own template.

**Not in v1 (next waves)**
- Scheduling engine that recalculates after manual reallocation, what-if sandbox, cross-project load heatmap.
- Probabilistic forecast with drivers; ranked recovery options with the 36-kyotei overtime check.
- Layered client/department/person calendars; pptx output; .mpp import; Redmine and Asana connectors.

**Out**
- Automatic resource levelling.
- Self-learning calibration engine and estimate-accuracy scoring (paid tier, later).

**Commitments that cannot be retrofitted** (from the one-pager):
- Multi-tenant data model: `tenant > department > program/portfolio > project > work package`.
- Resources belong to a department but work across projects.
- Cost rolls up on both the project and department axes.
- Baseline and actuals are separate ledgers.
- **Plan dates are derived from pinned scheduling inputs and are owned by the scheduler.** No other module writes a work package's derived start or finish, and nothing derived from tracker evidence is ever a scheduling input. A baseline therefore pins the inputs a schedule came from, not only the dates it produced, so any past plan can be re-derived and explained (sprint change proposal 2026-09-20, A-6; PRD FR-6b, FR-15, NFR-C1).

## Business Model

Price per PM seat, never per tracker user. The free tier **sees the present** (reconciliation, unmapped work, divergence) and works from day one with no history. The paid tier **learns from the past** (rework attribution, estimate accuracy, forecasting from history), so willingness to pay grows as data accumulates.

## Risks and Open Questions

- **Scope versus one founder.** v1 grew beyond the brainstorm's minimal cut: a WBS editor, two connectors and AI import. It must be cut again if Q1 2027 slips.
- **AI import accuracy.** A misread WBS corrupts every number downstream, so the confirmation preview is mandatory, not optional.
- **Demand is inferred.** No one has yet asked for "unmapped hours" by name; the voiced pain is "I can't compare the plan with what happened." The founder's own projects are the first real test.
- **Contract politics.** Under 請負 contracts, visible unmapped hours can trigger scope disputes; under 準委任/labo contracts, billing disputes. PM mediation is the defence, and it must be tested with a real client.
- **Procurement.** Japanese clients may require a security check sheet and Japan data residency before viewing published snapshots.
- **Competitors to check.** Crowd Log (クラウドログ) and Lychee Redmine for Japanese plan-vs-actual; engineering-intelligence vendors for an unmapped-cost feature (quarterly).

## Vision

One place where a Japan-facing project's plan, real work and numbers agree, and every party trusts them. Over 2–3 years the tool expands from the founder's projects, to the founder's clients, to Japanese PMs and BrSEs on Backlog and Jira generally, with the paid tier turning years of honest actuals into estimates that are finally right.
