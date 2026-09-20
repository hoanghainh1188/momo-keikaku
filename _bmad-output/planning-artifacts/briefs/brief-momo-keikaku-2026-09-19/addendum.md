---
title: momo-keikaku — Product Brief Addendum
created: 2026-09-19
updated: 2026-09-19
---

# Addendum: depth for PRD and architecture

This addendum holds the detail behind `brief.md` that the PRD and architecture work will need.

## A. Beachhead reframe: why not Project Online

The brainstorm `brainstorm-project-online-pmo-switch-2026-09-19` assumed a Japanese PMO stranded by the Project Online retirement on 2026-09-30. In practice, most of the founder's clients use **Excel WBS + Backlog**, and few use Project Online. Web checks on 2026-09-19 also showed:

- The retirement does not affect Project desktop or local .mpp files. Only PWA, timesheets, OData and desktop sync to Project Online stop working.
- That segment already has vendors: SRI Project+ (hosted Project Server, ¥100k–200k/month, supported until 2031) and Flagxs (migration campaign until 2026-10-31, 30% off).
- **Correction:** Planner Premium plan members with a plain M365 licence can view the plan and make basic edits. Only premium fields (dependencies, custom fields, Gantt) need Plan 1 ($10, ¥1,499) or Plan 3 ($30). The brainstorm's pitch, "Planner charges every member", is false.
- Adjacent event: Jooto shuts down in July 2027, and Backlog is courting its users.

As a result, .mpp import remains a later, opportunistic feature.

## B. Visibility rules (decided)

| Audience | Sees by default |
|---|---|
| Japanese client | The PM-published snapshot: health indicators (computed **including** unmapped hours), delivery milestones and schedule |
| PM / BrSE | Everything, live: named staffing, internal risks and issues, unmapped tickets, pre-publication numbers |
| Offshore team | Nothing required; keeps working in Backlog or Jira |

All visibility is configurable; the defaults above are a product principle.

## C. Architecture constraints

- **Web/cloud-first.** This reverses the one-pager's cross-platform desktop choice, for three reasons: Backlog snapshotting needs an always-on process, clients open published snapshots on the web, and AI import runs server-side.
- **Backlog API limits.** Backlog stores one `actualHours` value per issue, has no worklog endpoint, and exposes hours only on Standard plans and above. The actuals ledger is therefore built from time-series snapshot deltas and falls back to ticket counts when hours are missing.
- **Procurement gates.** Japan data residency and readiness for a security check sheet are likely gates.
- **Reviewable import.** AI-assisted Excel WBS import must produce a mapping (hierarchy, dates, resources, custom columns) that the PM reviews before anything is committed.

## D. Next-wave feature ideas (parked from the brainstorm)

- **Scheduling:** dependency-based, effort-driven recalculation after manual reallocation; hard deadline constraints for fixed-date contracts.
- **What-if sandbox:** preview the effects of a reallocation; applying it changes only the current schedule, never the baseline; each reallocation is logged with a reason.
- **Load statement:** a person × week heatmap across projects, showing planned versus real load including unmapped hours ("80% on plan, 130% real").
- **Forecast:** a probabilistic finish date ("70% by 15/03") from baseline slip history, with a drivers block (certain %, top slipping items, unmapped hours by team). For fixed-date contracts, the probability of hitting the date.
- **Recovery options:** crashing, fast-tracking, borrowing from the shared pool, or cutting scope. Each option shows the new date, extra cost and flags, including the 36-kyotei overtime cap (45h/month, 360h/year).
- **Calendars:** layered as national (JP + VN) > client company > department > person; warn when the VN team is off (Tet) during a JP deadline run-up.
- **Reporting:** fill the PM's existing pptx template; a portfolio health one-pager with computed traffic lights.
- **Custom fields:** carried over on import, no cap on count, usable as grouping axes and mappable to tracker fields.
- **Trust on migration:** full export back to Excel or .mpp at any time (no lock-in).
- **Free lead magnet:** a Japanese-language export and migration guide.

## E. Practice facts from the founder's client experience

- Upward reports are mostly Excel and PowerPoint. The most painful pages are ahead/behind, cost, forecast and risk.
- Clients accept probabilistic forecasts but want to see which work makes up the number.
- Directors default to demanding overtime; the fixed contractual delivery date is the constraint that rules out other options.
- Calendars must know each client's own company holidays.
- Tool switches stall on data migration, user training, and custom fields that cannot match the real process.
