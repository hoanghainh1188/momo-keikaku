---
title: Brainstorm intent — Project Online PMO switch
date: 2026-09-19
source: _bmad-output/brainstorming/brainstorm-project-online-pmo-switch-2026-09-19/.memlog.md
next: bmad-product-brief
---

# Brainstorm Intent: Project Online PMO Switch

## Central question
When a Japanese PMO loses Project Online on 2026-09-30, why would it pick us over Planner Premium or SRI Project+, and what is the minimum core PM feature set it needs before it can switch?

## Fixed premises (not reopened)
- Reconciliation model stays as decided: an unmapped-work ledger plus a separate baseline ledger.
- Competitive research findings R1–R7 are treated as constraints. The research's wedge validity expires 2026-12-01.

## Target customer and timing
- **Target:** "stranded" Japanese PMOs. They exported to XML or Excel in a hurry and now run teirei (the regular status meeting) by hand in Excel after 30/09.
- **Tolerance (user-reported):** they will put up with the hand-made Excel for about 1–2 months.
- **Window 1:** 30/09 to about the end of November 2026. After that they sign with SRI or settle for Planner.
- **Window 2:** opens 2027-01-01, when Backlog changes its pricing.
- **Reality check:** today is 2026-09-19 and nothing is coded yet. The product cannot be the tool PMOs use in the week after 30/09. v1 must be usable within about 8 weeks, built by one founder.

## Why us vs Planner Premium
- Planner Premium physically cannot hold the target: 3000-task cap, 1 baseline, 10 custom fields, no cost tracking, no enterprise resource pool.
- Qualification test: a PMO with more than 3000 tasks or a large shared resource pool cannot fit in Planner.
- We keep unlimited-depth WBS, a large shared pool, custom fields and EVM.
- Pitch line: "Planner loses 10 of 11 baselines and all cost."

## Why us vs SRI Project+
- SRI keeps the old problem alive until 2031: % complete is self-reported and reports are still made by hand.
- We keep everything the PMO already has (all baselines, custom fields). We also allow full export back to .mpp/XML, so there is no lock-in.
- We also make the teirei report honest and automatic.
- Pitch line: with SRI you pay to keep the same old problem until 2031.

## How the unmapped line is positioned
- It is not sold as a separate feature. It shows up inside report pages the PMO already uses: EVM (honest CPI/EAC), forecast drivers and the load statement.
- Example line: "forecast +18% over, 11 pts from work not in plan."

## Minimum core v1 (collapsed scope)
**What drove the collapse (user decision):** time. The PMO must be able to run its regular teirei right after 30/09. Five candidate v1 cores were considered: Migration vault, Report factory, Resource command centre, Forecast & recovery, MS Project lite. The survivor is "Report factory" built on top of "Migration vault".

Build order:
1. **Import** .mpp/XML and the PMO's own hand-made Excel, with a dry-run parity report before committing. The report shows date differences, missing resources and which baselines were carried over.
2. **Backlog read** (connector).
3. **Cost rollup and honest EVM:**
   - cost = resource rate × hours, rolled up the WBS tree and by department
   - SV/SPI, CV/CPI and EAC/ETC, including an unmapped-hours line
   - only enough to fill the report pages
4. **Fill the PMO's own teirei template.** xlsx comes first; pptx comes later.

## Next wave (after v1, aimed at window 2)
- Scheduling engine: dependency-based and effort-driven. It recalculates the schedule after a manual reallocation (user: rescheduling after reallocation is required) and supports hard deadline constraints. People still decide who moves.
- What-if sandbox: preview a reallocation before applying it. Applying changes only the current schedule; the baseline is untouched. Each reallocation is logged with a reason.
- Cross-project load heatmap: person × week, planned load vs real load, with unmapped hours included.
- Probabilistic forecast with drivers:
  - built from the history of how imported baselines slipped
  - for fixed-date contracts, shows the probability of hitting the date
- Ranked recovery options: crashing, fast-tracking, borrowing from the shared pool, scope cut. Each option is checked against the 36-kyotei overtime cap.
- Layered calendars: national > client company > department > person, with a preloaded Vietnamese calendar. Warns when the VN team is off (for example Tet) during a JP deadline run-up.
- pptx output.
- Portfolio health one-pager: traffic lights computed from SPI, CPI, hit probability and unmapped %.
- Integrations beyond Backlog (Jira, Redmine, Asana), and two trackers per project.
- Custom fields carried over from .mpp with no count cap.
- UI familiar to MS Project JP users.

## Explicitly out
- Automatic resource levelling. None of the PMO's weekly resource jobs (detect overload, detect uneven allocation, report upward) needs it.

## Japanese PMO practice (user-reported from client experience)
- Upward reports are mostly made in Excel and PowerPoint.
- The most painful hand-made pages are schedule ahead/behind, cost, forecast and risk.
- Clients accept a probabilistic forecast (e.g. 70%), but want a summary of which work makes up that number. No black box.
- After the forecast slide, directors usually demand overtime to catch up. The tool should propose feasible recovery options, not just report.
- The constraint that actually kills options is the fixed contractual delivery date.
- The calendar must know each client company's own holidays.
- Switching friction comes from three things:
  - data migration
  - user training
  - custom fields that cannot be fitted to the company's real process
- Integration with Jira, Backlog, Redmine, Asana and similar tools is a switch blocker.
- A project health overview report is a switch blocker.
- Data migration is a switch blocker.

## Go-to-market moves
- Before 30/09: publish a free Japanese guide on exporting Project Online completely, covering what to keep and in which format to preserve baselines and custom fields. It gives real help and builds the first customer list.
- Pitch to stranded PMOs: "you exported in a hurry; give us that file and it becomes your teirei report."
- The boss pitch must be specific and checkable. Generic "cheaper / more features / more integrations" claims are easy for Microsoft to counter.
  - Price per PM seat: members stay in Backlog at no extra cost, while Planner charges every member. Worked example: 5 PMs + 200 members.
  - "This month's teirei takes 5 minutes instead of 2 days, same template."
  - "210h last month sat in no plan item; that is why project Z is late."

## Open questions and risks
- **Planner member licensing:** do members of Planner Premium plans need a paid licence (Plan 1 or higher)? The per-PM-seat pricing pitch depends on the answer.
- **Feasibility:** can one founder build v1 within about 8 weeks?
- **Crowd Log:** a competitor still to assess.
- **Procurement gate:** customers require a completed security check sheet and data residency in Japan.
- **Schedule parity:** after import, recomputed dates must match MS Project, and any difference must be explained.
