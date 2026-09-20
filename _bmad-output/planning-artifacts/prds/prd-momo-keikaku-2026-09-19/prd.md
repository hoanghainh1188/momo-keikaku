---
title: momo-keikaku
status: final
created: 2026-09-19
updated: 2026-09-20
---

# PRD: momo-keikaku
*Working title — confirm.*

## 0. Document Purpose

This PRD defines v1 of momo-keikaku for the founder (PM) and for the downstream UX, architecture, and epic/story workflows. It builds on these inputs and does not repeat them:

- the product brief `briefs/brief-momo-keikaku-2026-09-19/brief.md` and its `addendum.md`;
- the competitive research `research/competitive-plan-tracker-reconciliation-landscape-jp-2026-09-19/research.md`;
- the PMI references in `docs/references/` (pmi-techniques v1 and v2, and the Smart PM Suite SRS), which are the formula source for EVM (FR-30, FR-31).

Research recommendations R1–R7 are binding constraints. §11 shows where each one lands. The brief locked the reconciliation mechanism and the beachhead, and this PRD does not reopen them.

v1 ships in two releases (§8):
- **R0** is founder-only, targeting **2027-04-14** (range 2027-02-12 … 2027-07-06), sized by `bmad-sprint-planning` on 2026-09-20 at 1,180 hours; the original 2026-12-15 was withdrawn the same day (§8.1).
- **R1** is client-facing. **Its Q1 2027 date was withdrawn on 2026-09-20** and it carries no replacement until R1 is sized (§8.2).

Every FR is tagged with the release it belongs to: R0, R1 or Post-Q1. Research recommendations are cited as "research R1"–"research R7" so they are not confused with the R0/R1 release tags. Vocabulary is anchored in the §3 Glossary. Features are grouped in §4. FR IDs are global and stable, so they are not always sequential within a section (FR-41, FR-42). Decisions confirmed during PRD creation are listed in §13. Technical approach and next-wave design detail live in `addendum.md`.

## 1. Vision

momo-keikaku is a web application for PMs and BrSEs who run Japanese client projects with offshore teams. It is the single place where a project's plan, the work actually done, and the numbers agree, and where every party can trust them.

Today the plan lives in an Excel WBS and the work lives in Backlog or Jira. Every week the PM reconciles the two by hand. The PM then rebuilds the same ahead/behind, cost, forecast and risk pages in Excel or PowerPoint. That takes five hours or more a week. Emergent work is either forced into the plan, which breaks the baseline, or silently dropped. As a result, actuals are always understated and never overstated, and estimates built on them stay wrong.

momo-keikaku reads the trackers without asking the offshore team to change anything. It keeps a persistent mapping from Work Packages to Tickets and builds an Actuals Ledger that is separate from the Baseline.

Its headline behaviour is that **Unplanned Work is measured, not dropped**. Hours spent outside the baselined plan are shown as effort and, for the PM, also as money. They appear inside the pages the client already reads: in the Health Indicators and the schedule by default, and in EVM and the forecast when the PM turns them on. The PM decides how to present them before anything is published.

**The plan is a working plan, not a stored picture of one.** Work Package dates are derived by the scheduler from duration, finish-to-start dependencies, constraints and the JP/VN working-day calendar, and they are recalculated the moment any of those change — so a task that slips moves the tasks that depend on it, and the critical path is always current. This is what lets the plan leave Excel and live here: a plan the PM has to re-date by hand is a plan the PM will keep maintaining somewhere else. A Baseline therefore stores the inputs a schedule was derived from, not only the dates it produced, so any past plan can be re-derived and explained (NFR-C1).

Over two to three years the product expands in three steps:
1. the founder's own projects;
2. the founder's Japanese clients;
3. Japanese PMs and BrSEs on Backlog and Jira in general.

The free experience "sees the present": reconciliation, Unplanned Work and divergence. It works from day one with no history. A later paid tier "learns from the past": rework attribution, estimate accuracy and forecasting from history. It turns years of honest actuals into estimates that are finally right, so willingness to pay grows as data accumulates. This is one reason both ledgers are append-only.

### 1.1 Why Now

- **Backlog repricing, 2027-01-01.**
  - Cross-project Gantt moves to the Business tier and above.
  - The cheapest unlimited-user plan goes from ¥16,000 to ¥36,300 per month. One firm's annual cost rises about 2.3×.
  - The repricing drew public backlash (research R2).
  - Users already compensate with spreadsheets and scripts to compare plan and actuals (brief).
- **Jooto shutdown, July 2027** (from the brief). Backlog is courting Jooto's users.
- **Project Online retirement, 2026-09-30.** These users are not the v1 buyer (§2.2). But the retirement keeps the Japanese planning-tool market in motion and makes the "missing Baseline" message land (research R6).
- **The absence claim is short-lived.** The research found that nobody owns an unmapped-work ledger, but that finding is due for re-check on 2026-12-01 and again after 2027-01-01. Engineering-intelligence vendors could add a similar view cheaply (research R7). R0 therefore aims to prove the wedge on real projects quickly, and speed of execution is part of the moat. Note the limit of that argument: R0 is founder-only, so its date is a dogfooding date, not a market date. The dates that faced the market were R1 and the 2027-01-01 Backlog repricing — **and on 2026-09-20 the first was withdrawn and the second moved behind R0** (§8.1, §8.2). The repricing now falls while R0 is still being built, so "speed of execution is part of the moat" no longer has a dated event to be fast for. The argument is kept because the *risk* is unchanged; what is gone is the schedule that answered it (§6, *thin moat*).

### 1.2 Differentiation

The wedge rests on four pieces:
- a PMI-style plan with a real Baseline;
- Backlog and Jira coverage;
- hours-based ledgers that are kept separate;
- a Japan-localised product sold to the PM/BrSE buyer.

Each piece is weak alone; they are defensible only together.

Feeding tracker hours into linked plan tasks is already a commodity: Ceptah, TPG PSLink, Tempo Financial Manager and the TeamSpirit Jira connector all do it. What nobody currently owns is reporting the complement: the work outside every plan item, shown as effort and kept on a ledger separate from the Baseline.

## 2. Target User

### 2.1 Jobs To Be Done

**PM / BrSE (primary; pays for a seat)**
- *Functional:* produce the weekly teirei report correctly, in minutes rather than an evening.
- *Functional:* see emergent work before it becomes a surprise, and decide whether to plan it, charge for it, or explain it.
- *Functional:* track effort and cost by project and by department, even though people work across several projects.
- *Social:* show the Japanese client numbers they can trust, without walking into a scope or billing dispute unprepared.
- *Emotional:* stop holding the plan and reality together as two separate stories.

**Japanese client (secondary; free Client Viewer)**
- *Functional:* see project health, delivery milestones and the schedule without having to ask.
- *Social/emotional:* trust that the numbers include work that fell outside the plan.

**Offshore team (tertiary; never uses the tool)**
- *Contextual:* keep working in Backlog or Jira exactly as today. Nothing is asked of them, and no training is needed.

### 2.2 Non-Users (v1)

- Enterprise PMOs migrating off Project Online. SRI Project+, Flagxs and Planner Premium already serve them (brief).
- Offshore developers as active users of the tool.
- Engineering leaders who want activity-based productivity analytics (the buyers of LinearB, Swarmia and Jellyfish).
- Teams whose work lives in Redmine or Asana. Connectors for those are deferred (§8.3).

### 2.3 Key User Journeys

The protagonists are illustrative, drafted from the brief. The founder should replace them with a real week on one of the five target projects.

- **UJ-1. Linh turns the client's Excel WBS into a live plan on day one.** *(R0)*
  - **Persona + context:** Linh is a BrSE/PM in Hanoi running a Japanese e-commerce client's phase 2. The project is four months old. The client sent their own Excel WBS. It has merged cells, Japanese headers, a 進捗率 (percent complete) column, a 実績開始 / 実績終了 (actual start / actual finish) pair, and a custom 担当会社 (responsible company) column.
  - **Entry state:** Linh is signed in as a PM, on an empty project page.
  - **Path:**
    1. She uploads the .xlsx file.
    2. The system suggests a mapping from columns to fields, based on the headers: WBS code, name, start, finish, effort, assignee, actual start, actual finish and percent complete. The file carries no duration column and no predecessor column, which is the common case for a client WBS.
    3. She confirms the mapping. The extra columns become Custom Fields.
    4. The Import Preview shows every row with its level and flags problems, such as dates it could not read or assignees it does not know. It also shows what it derived from each imported start/finish pair — a duration in working days, with the original dates kept as reference columns — and, separately, the progress it read: which rows arrive complete, which in progress, and with what percent complete (FR-9, FR-10).
    5. She fixes one date column's format, sets the Project start, accepts today as the Data Date, and confirms.
    6. The scheduler runs and the plan gets its dates. Finished work keeps the actual dates the file carried, work in progress is scheduled over what is left of it, and only remaining work is placed after the Data Date. Because the file carried no dependencies, every WP is as-soon-as-possible; she adds the six links that matter and watches the WPs downstream of them move.
    7. She sets the Baseline, which pins the durations, dependencies, constraints, actual dates, calendar version and Data Date behind those dates, not only the dates.
  - **Climax:** the WBS appears as a tree grid carrying derived dates, predecessors, Float and the critical-path marker. Summary dates and effort roll up, the work already done is where it actually happened, and the Baseline is recorded.
  - **Resolution:** Linh keeps the plan current in momo-keikaku, by editing it there or by re-importing.
  - **Edge case:** if the workbook has several candidate sheets, the preview asks which one is the WBS. Nothing is committed until she confirms.

- **UJ-2. Linh connects Backlog and maps the plan to real Tickets.** *(R0)*
  - **Persona + context:** Linh, on the same project as UJ-1. The offshore team already logs hours in the client's Backlog space, and the project is mid-flight.
  - **Entry state:** a project with a Baseline and no Connector.
  - **Path:**
    1. She adds a Backlog Connector, using the API key of a read-only bot user and the project key.
    2. The first Tracker Snapshot records every in-scope Ticket, and each Ticket's existing hours as an Opening Balance.
    3. She creates Mapping Rules, for example "milestone *Phase2-Sprint3* → WP 2.3", and drags a few Tickets onto WPs by hand.
  - **Climax:** 87% of hours are mapped. The rest are listed as Unmapped Tickets, each with its hours.
  - **Resolution:** new Tickets that match a rule are mapped on the next Tracker Snapshot.
  - **Edge case:** the client's Backlog space exposes no actual hours. The Connector detects this, the project runs in Ticket-Count Mode, and the UI says so plainly.

- **UJ-3. Linh prepares Thursday's teirei report in twenty minutes.** *(R0 review, R1 publish)*
  - **Persona + context:** Linh, on the same project as UJ-1 and UJ-2.
  - **Entry state:** Wednesday evening. The project has two weeks of Actuals Ledger history.
  - **Path:**
    1. She opens the Reconciliation Review for the current Reporting Period. It is pinned to the latest Tracker Snapshot.
    2. It shows SPI 0.91, all-in CPI 0.84, planned-scope CPI 0.97, and 46h of Unplanned Work (¥207,000 in her PM view). Most of it comes from 11 Unmapped Tickets: bug fixes on a feature the client added verbally.
    3. She records Dispositions:
       - *Map:* three Tickets (8h) go to an existing WP, and their hours leave Unplanned Work immediately. Unplanned Work drops to 38h.
       - *Plan:* a new WP "Coupon rule changes" is created. Its hours stay Unplanned Work until the next Re-baseline.
       - *Change Request candidate:* five Tickets.
       - *Explain:* the rest, with the note "environment issues on client staging".
    4. She previews the Client View and publishes.
  - **Climax:** the Published Snapshot shows Health Indicators that include the remaining 38h of Unplanned Work, together with Linh's note.
  - **Resolution:** she exports the numbers to xlsx and attaches the file to the meeting invite.
  - **Edge case:** if the latest Tracker Snapshot is more than 24 hours old, the system warns her and offers a refresh before she publishes.

- **UJ-4. Tanaka-san checks the project before the Friday meeting.** *(R1)*
  - **Persona + context:** the client-side project owner in Osaka. He does not want to ask the vendor for status.
  - **Entry state:** he received an invitation email in Japanese and is signed in as a Client Viewer.
  - **Path:**
    1. The latest Published Snapshot opens.
    2. He sees Health Indicators, milestones and the schedule.
    3. The Unplanned Work indicator reads 計画外作業 10% (38h), with Linh's note.
  - **Climax:** before the meeting, he understands where the project stands and why effort is ahead of plan.
  - **Resolution:** he arrives ready to discuss the Change Request candidate instead of asking for status.
  - **Edge case:** he never sees money, Rates, named staffing, internal Risks or unpublished numbers, even by editing the URL.

- **UJ-5. Hoang looks at department effort across five projects.** *(Post-Q1)*
  - **Persona + context:** the founder, who also heads the delivery department.
  - **Entry state:** month-end. Five Projects have active Connectors, and most Tracker Accounts are linked to Resources.
  - **Path:** he opens the Department view. It shows this month's actual effort and cost by home Department, including Unplanned Work per project.
  - **Climax:** he sees that one project's Unplanned Work is consuming a tenth of the department's capacity.
  - **Resolution:** he raises it with that project's PM.
  - **Edge case:** hours from a Tracker Account that nobody has linked appear on the *Unattributed* line, so the Department total still equals the sum of the Project totals.

- **UJ-6. Linh brings the client in for the first time.** *(R1)*
  - **Persona + context:** Linh, after the R0 gate (§8.1) has passed on her project.
  - **Entry state:** the project has several weeks of Reconciliation Reviews and no Client Viewers.
  - **Path:**
    1. She adds the client's email domain to the project's allowed domains.
    2. She invites Tanaka-san as a Client Viewer. The Tenant Admin is notified.
    3. She reviews the Visibility Policy defaults in the publish preview and leaves them as they are.
    4. She publishes the first Published Snapshot.
    5. Tanaka-san receives a Japanese invitation email that holds a link and no figures, and signs in with a magic link.
  - **Climax:** Tanaka-san opens the first Published Snapshot without needing instructions.
  - **Resolution:** the weekly cycle in UJ-3 and UJ-4 begins.
  - **Edge case:** an invitation to an address outside the allowed domains is refused, with the reason shown.

## 3. Glossary

- **Tenant** — one customer organisation. Data never crosses Tenants.
- **Department** — an organisational unit inside a Tenant. It is the home of Resources and a roll-up axis.
- **Program** — an optional grouping of Projects inside one Department. A Project's Program belongs to the Project's owning Department. The hierarchy is Tenant > Department > Program > Project > Work Package.
- **Project** — one client engagement. It has one owning Department, one or more assigned PMs, one Plan, a Baseline history, zero or more Connectors, one Visibility Policy, and the three scheduling settings below (FR-43).
- **Project start** — the date the forward pass uses as its origin. It is a Project setting, it is mandatory before a Project can be scheduled, and it is not a WP field (FR-43).
- **Project finish** — an optional contractual or committed finish date the PM sets. When it is set, the backward pass runs from it, which makes Float absolute and allows it to go negative. When it is not set, the backward pass runs from the **computed finish** — the latest derived finish in the Plan — which makes Float relative. The backward pass anchors on one of these two and on nothing else, never on a Constraint (FR-6b). This PRD uses exactly two names for the two dates — *Project finish* for the date the PM set, and *computed finish* for the derived one — and no third name anywhere.
- **Data Date** — the as-of boundary between what has happened and what is still planned, set per Project (FR-43). Completed work keeps its actual dates; the forward pass schedules only remaining work, and never earlier than the Data Date. It is a scheduling input, so Baselines and Published Snapshots pin it. **It is the only thing that advances the plan through time**: no Tracker Snapshot, Mapping change or ledger entry moves it or any derived date (FR-21, FR-22).
- **Actual start / actual finish** — the dates on which a leaf WP's work really started and really finished. They are scheduling inputs the PM owns: typed on the WP, imported with the plan (FR-9), or accepted from a proposal (FR-5). They are dates, not timestamps of a click, and nothing derives them from tracker activity. FR-6b reads them and never moves them.
- **First observed activity** — the date of a WP's earliest ledger entry across its Mapped Tickets. It is **display-only evidence**, offered as a proposed actual start that the PM accepts or ignores. It is never itself an actual date and never reaches the scheduler (FR-5, FR-21).
- **Contract Type** — 請負 (fixed-scope) or 準委任/labo (time-and-materials or dedicated team). It is informational only in v1.
- **Plan** — the Project's WBS, a tree of Work Packages. The **Current Plan** is the living, editable version of it.
- **Work Package (WP)** — a node in the Plan. A leaf WP carries planned effort, a Duration and any Constraint, and is the only kind of WP the scheduler schedules; its dates are derived by the scheduler, not typed. A summary WP carries no Duration, Constraint or Dependency: its dates and effort are a pure roll-up of its children, an output of the passes and never an input to them (FR-5, FR-6b).
- **Duration** — how many working days a WP occupies. Distinct from planned effort: 40 hours may be 5 days for one Resource or 2 days for two and a half. R0 schedules on Duration.
- **Dependency** — a finish-to-start link from one leaf WP to another, with a lag in working days. R0 supports this one type, between leaf WPs only; SS, FF and SF are Post-Q1.
- **Constraint** — a PM instruction that pins a leaf WP against the scheduler: *as soon as possible* (the default), *must start on*, or *must finish on*. All three are **soft**: the scheduler never draws a plan in which a successor starts before its predecessor finishes, so where a constraint and the dependency graph disagree the graph wins on the dates. The constraint is then reported as a **violation on the WP that carries it** — how many working days late it is, and the chain that drove it — and it changes no other WP's Float (FR-6b).
- **Float** — a WP's latest start minus its earliest start: how far it can slip before the **computed finish** moves, or before a **Project finish** the PM set is missed. It is **negative** only when the plan cannot meet a Project finish the PM set, and a negative value is shown as it is rather than clamped to zero. A *must finish on* Constraint the plan cannot meet is a violation on its own WP and makes Float negative nowhere.
- **Critical Path** — the chain that drives the finish the backward pass anchored on: the WPs whose Float equals the **minimum Float measured against that finish** — zero on a plan with slack, negative on a plan that cannot meet a Project finish the PM set. It is deliberately not defined as zero Float, because a late plan has no zero-Float WPs and the most critical work would drop off the path exactly when the plan is in trouble. It is equally deliberately not defined against Constraints: one missed *must finish on* must not be able to push the chain that actually decides when the project ends off the path (FR-6b). Any slip on a critical-path WP moves the computed finish.
- **Milestone** — a leaf WP with zero duration, flagged as a milestone. A milestone's **target date is a *must finish on* Constraint**, not a date field of its own: it is captured, scheduled, violated, exported and baselined exactly like any other constraint (FR-5, FR-6a). A milestone therefore carries a derived date from the passes, a target date that is its constraint, an **actual finish** recorded when the work is done — there is no separate "done date", and "done" means the WP has an actual finish (FR-5) — and a Baseline date that is the derived date pinned at the last Baseline. None of them is typed into a planned-date field.
- **Baseline** — an immutable, versioned record, taken at a point in time, of every WP's planned dates and effort, the scheduling inputs those dates were derived from (Duration, Dependencies with their lags, Constraints, the actual dates in force, the Project start, the Project finish, the Data Date and the Holiday Calendar version), plus the cost derived from Rates. The pinned set is listed in full in FR-15. It is stored on the **Baseline Ledger**. A **Re-baseline** is a PM action that records a new Baseline version with a mandatory reason.
- **Baseline hours** — a leaf WP's planned effort in the active Baseline. A WP with no Baseline hours is *non-baselined*.
- **BAC (Budget at Completion)** — the Project-level sum of Baseline hours over all baselined leaf WPs. Its money form sums each leaf WP's Baseline hours × the Rate in effect at the Baseline date. The hours are split equally across the WP's assigned Resources, and unassigned WPs use the Project default Rate.
- **Percent Complete** — a leaf WP's share of work done, never derived from burned effort. It exists in two forms, and the difference between them is a reconciliation signal rather than an error:
  - **Observed Percent Complete** — derived from Ticket completion as defined in FR-30. It follows the evidence and moves whenever a Tracker Snapshot or a Mapping changes. It feeds EVM and the Reconciliation Review. **It is never a scheduling input.**
  - **Recorded Percent Complete** — the PM's own figure: imported with the plan or set as an audited override (FR-9, FR-30). **This is the one FR-6b reads** to derive a WP's remaining duration.
  Where the two disagree, the Reconciliation Review shows both — *evidence says 60%, the plan says 30%* — and the PM accepts, explains or re-plans. Accepting writes a Recorded value, and only then does the plan move.
- **Level of Effort (LOE)** — the PMI convention for support work with no deliverable: EV equals PV.
- **EAC Method** — the per-Project choice of EAC formula (FR-30).
- **Resource** — a person with a home Department and a Rate history with effective dates.
- **Rate** — a Resource's internal cost per hour. It is used only in PM and internal views, and only a Tenant Admin sets it.
- **Project default Rate** — the Rate a Project uses for Unattributed hours and for WPs with no assigned Resource. A Tenant Admin sets it.
- **Tracker** — Backlog (R0) or Jira (Post-Q1).
- **Connector** — a read-only link from a Project to one Tracker scope.
- **Ticket** — an issue in a Tracker, identified by the Tracker's stable internal ID rather than its key.
- **Resolved** — a Ticket status the Connector treats as done. In Jira this is status category *Done*. In Backlog it is *Closed* (完了) by default, configurable per Connector.
- **Tracker Account** — a user identity in a Tracker, optionally linked to a Resource (FR-13).
- **Unattributed hours** — hours from a Tracker Account that is not linked to a Resource, or from a Ticket with no assignee. They are costed at the Project default Rate and appear on an *Unattributed* line in Department roll-ups.
- **Tracker Snapshot** — a timestamped read of every in-scope Ticket.
- **Actuals Ledger** — an append-only record of changes to each Ticket's actual hours, derived from consecutive Tracker Snapshots. It is separate from the Baseline Ledger.
- **Opening Balance** — the ledger entry that records hours a Ticket already had before momo-keikaku could observe them (FR-42).
- **Mapping** — a persistent association between a Ticket and one leaf WP, made by hand or by a Mapping Rule.
- **Mapping Rule** — a stored condition on Ticket attributes that maps the matching Tickets to a WP.
- **Mapped Ticket** / **Unmapped Ticket** — a Ticket with or without a Mapping.
- **Catch-all WP** — a WP the PM flags as a bucket for miscellaneous work. If it has Baseline hours, it is measured as Level of Effort.
- **Unmapped Work** — hours on Unmapped Tickets.
- **Unplanned Work** — hours spent outside the baselined plan. It is the sum of three parts:
  - Unmapped Work;
  - hours on non-baselined WPs, for example WPs created by the *Plan* Disposition;
  - hours on Catch-all WPs beyond their Baseline hours.

  It carries actual effort but no earned value. Whether an hour counts as baselined is judged against the Baseline version active when its ledger entry was recorded (FR-30).
- **Ticket-Count Mode** — the measurement mode used when a Connector exposes no hours.
- **Disposition** — the PM's decision on an Unmapped Ticket or a group of them: *Map*, *Plan*, *Change Request candidate* or *Explain*.
- **Change Request candidate** — a Disposition that marks Tickets as possible client-requested scope, for discussion with the client or for a Re-baseline. v1 has no approval workflow.
- **Teirei** (定例) — the regular status meeting with the client, usually weekly.
- **Reporting Period** — the window a report covers, measured in the Project's time zone (default JST). Its length is set per Project — weekly (the default, aligned to the teirei day), biweekly or monthly — because clients report on different cadences (founder decision, 2026-09-20, closing OQ-6). Changing the length applies from the next Period; past Periods keep their boundaries.
- **Reconciliation Review** — the PM-only view of one Reporting Period, pinned to one Tracker Snapshot.
- **Divergence** — the differences between the Baseline, the Current Plan and actuals, per WP. Every date difference carries its cause — *edited*, *moved by a predecessor*, *calendar changed*, *data date advanced*, *actual dates recorded*, *progress changed* or *project dates changed* — so a recalculation that shifts a long tail of WPs nobody touched does not have to be triaged by hand (FR-28).
- **EVM Metrics** — PV, EV, AC, SV, SPI, CV, CPI, EAC, ETC, VAC and TCPI, as defined in FR-30. They are measured in effort hours (工数). Money is a derived layer shown only in PM and internal views.
- **Health Indicator** — a computed green, amber or red status for Schedule, Effort/Cost, or Unplanned Work. The **overall status** combines the three (FR-31).
- **Visibility Policy** — the per-Project configuration of what Client Viewers see.
- **Published Snapshot** — an immutable, reproducible, PM-approved copy of a Project's client-facing report. It is the only thing Client Viewers see.
- **Client View** — what a Client Viewer sees: the Published Snapshots of their Projects (FR-36).
- **Risk / Issue** — an item the PM records on a Project or WP (FR-37). It is internal by default, and the PM can mark it client-visible.
- **Import Preview** — the mandatory confirmation screen for every Excel import.
- **Custom Field** — a WP field defined by the user.
- **Holiday Calendar** — non-working days: JP and VN national holidays plus days off specific to the Project. It has a dated, append-only version history, like Rates, covering both the Project's own days off **and the national holiday tables themselves**, so a past schedule re-derives against the calendar that was in force when it was taken (FR-14).
- **Roles** — Tenant Admin, PM (holds a seat), Internal Viewer, and Client Viewer.
- **PM Seat** — the unit of pricing. Viewers never consume one.
- **R0 / R1 / Post-Q1** — the release tags defined in §8.

## 4. Features

### 4.1 Tenant, Organisation and Access

**Description:** The data model is fixed from day one: Tenant > Department > Program > Project > WP. Resources belong to a home Department and work across Projects. R0 runs a single Tenant for the founder, but isolation is built into the data model from the start.

#### FR-1: Tenant and hierarchy — *R0*

A Tenant Admin can:
- create Departments, Programs and Projects;
- assign each Project an owning Department, and optionally a Program;
- assign PMs to Projects.

**Consequences (testable):**
- Every stored record carries its Tenant.
- For every read endpoint, an automated test proves that no data from another Tenant is returned.
- A Project's Program must belong to the Project's owning Department.
- Moving a Project between Programs leaves its Baselines, ledger, Mappings, Published Snapshots and audit trail unchanged. Only the Program roll-up it contributes to changes.

#### FR-2: Roles and permissions — *R0: Tenant Admin and PM; R1: Client Viewer; Post-Q1: Internal Viewer*

A Tenant Admin can invite users as PM, Internal Viewer or Client Viewer. A PM can invite Client Viewers to their own Projects.

**Consequences (testable):**
- **Client Viewer reach:** a Client Viewer reaches only the Published Snapshots of the Projects they were invited to. Any other URL returns "not found".
- **Invitations:** Client Viewers can be invited only at email domains the PM has allowed for that Project. The Tenant Admin is notified of every Client Viewer invitation.
- **Rates:** only a Tenant Admin can create or change Rates and Project default Rates. Rates are visible only to Tenant Admins and to the PMs of the Projects that use them. Internal Viewers see aggregates only.
- **Editing and publishing:** only a Project's PMs or a Tenant Admin can edit its Plan, Mappings or Visibility Policy, or publish.

#### FR-3: Sign-in — *R0: email + password or Google; R1: email magic link and Microsoft*

Users can sign in, and a Tenant Admin can revoke access.

**Consequences (testable):**
- Sessions expire after an idle time that can be configured. The default is 8 hours.
- Revocation takes effect on the user's next request.
- **Magic links (R1):** they are single-use, are bound to the invited email address, and expire after a short, configurable time (default 15 minutes).

**Out of Scope:** SAML/SCIM, which is added only if a client's security check sheet requires it.

#### FR-4: Language and locale — *R0: English; R1: Japanese*

Each user can choose English or Japanese. Dates and numbers follow the chosen locale.

**Consequences (testable):**
- **R1 coverage:** every Client View string, Published Snapshot label and client email exists in both languages.
- **PM screens:** PM-internal screens reach full Japanese coverage Post-Q1.
- **PM notes:** notes the PM writes are shown as written, with no machine translation.
- **Currency:** the Tenant currency defaults to JPY and cannot be changed once any Rate exists.

**Out of Scope:** a Vietnamese UI.

### 4.2 Plan (WBS) Authoring and Scheduling

**Description:** The PM builds a Plan either by importing it (4.3) or by creating it in the tool. The PM keeps it current by editing it or re-importing it. **The plan is scheduler-owned:** the PM supplies the scheduling inputs — duration, dependencies, constraints, progress and the dates on which work actually started and finished — and the scheduler derives every *planned* date from them and recalculates the moment one of them changes (FR-6b). Realises UJ-1.

Two statements make that precise, and the rest of this PRD is written so that both are literally true:

- **One writer of derived dates.** `FR-6b` is the only producer of a WP's planned start and finish. Not the importer (FR-9), not a re-import (FR-11), not a Disposition (FR-29), not the Mapping layer (FR-21, FR-22), not a Tracker Snapshot (FR-19), not the PM.
- **Actual dates are inputs, not derived dates, and they have exactly two writers.** A leaf WP's actual start and actual finish are written by the PM — typed on the WP or accepted from a proposal (FR-5) — and by an Excel import or re-import the PM confirms (FR-9, FR-10, FR-11). A re-import may also clear one, but only where its column is mapped and the cell is empty, and every clearing is listed in the diff (FR-11). Nothing else writes them: ledger activity is shown as evidence beside them and never becomes them, so no background job can move the plan (FR-21, FR-22).

#### FR-43: Project schedule settings — *R0*

Each Project carries the three scheduling settings that live above WP level: a **Project start**, an optional **Project finish**, and a **Data Date**. A PM sets all three. They are Project settings, not WP fields, and they are inputs to FR-6b.

**Consequences (testable):**
- **Project start** is mandatory before a Project can be scheduled. A Project with none shows a "no project start yet" state in place of dates, and FR-6b does not run. Import proposes the earliest imported start, which the PM confirms (FR-10).
- **Project finish** is optional, and is the contractual or committed date. Setting it moves no WP: it changes only the backward pass's origin (FR-6b), which is what makes Float absolute rather than relative and what allows a plan that cannot meet the date to show negative Float. The UI always says which finish a displayed Float was computed against.
- **Data Date** is the as-of boundary between work done and work remaining. **A Project is created with none.** It is set in the same action that sets the Project start — in the FR-10 preview on the import path, or in Project settings — and it **defaults to today**, never to a date read out of the plan's contents. Thereafter the PM advances it, in practice at the Reporting Period boundary, during the Reconciliation Review. **It is never advanced automatically**, because advancing it re-dates every remaining WP.
- **The Data Date is the only thing that advances the plan through time.** Connecting a Tracker, taking a Tracker Snapshot, mapping or remapping a Ticket, and a Mapping Rule firing in the background all leave every WP date exactly where it was (FR-21, FR-22). The schedule moves when the PM moves it.
- **A Data Date is never set earlier than the latest actual finish in the Plan.** An attempt is rejected with the WPs that block it, because the scheduler would otherwise have to place completed work in the future. Actual finishes are dates the PM recorded or imported (FR-5, FR-9), so this rule constrains the PM's own record of the past, not a clock reading.
- **Every change to any of the three triggers a full recalculation** (FR-6b) and is recorded in the audit trail with its author, its time and its previous value (NFR-A1).
- **Pinned:** all three are pinned into every Baseline version (FR-15) and into every Published Snapshot (FR-35), because they are scheduling inputs rather than display settings.

#### FR-5: Create and edit Work Packages — *R0*

A PM can create, edit, move and delete WPs. For each **leaf** WP the PM sets:
- name;
- duration in working days;
- planned effort in hours (distinct from duration — 40 hours may be 5 days for one Resource or 2 days for two and a half);
- an optional scheduling constraint (default *as soon as possible*);
- an optional **actual start** and **actual finish**;
- assigned Resources;
- Custom Field values;
- the milestone flag.

**Planned start and finish dates are not typed.** They are derived by FR-6b from duration, dependencies, constraints, progress, the actual dates, the Data Date (FR-43) and the working-day calendar. A PM who wants to pin a planned date does so with a constraint, which the scheduler applies and reports on.

**Consequences (testable):**
- **Scheduling inputs are leaf-only:** duration, constraints and dependencies can be held only on a leaf WP. Giving a leaf WP a child is therefore an edit the PM must resolve in the same action — the tool asks which child takes the duration, constraint and links, or confirms that they are dropped — and no code path leaves a scheduling input on a summary WP.
- **Roll-up:** a summary WP's dates are the earliest start and the latest finish among its descendants, and its effort is their sum. Summary dates are an output of the recalculation and are never read back into it (FR-6b).
- **Deleting a WP with Mappings:** the PM must choose a target WP for those Mappings, or confirm that they become unmapped. Mapping Rules that target the deleted WP are disabled and flagged.
- **Deleting a leaf WP with dependencies:** its incoming and outgoing edges are deleted with it and are listed in the confirmation, with the WPs at the other end. **They are never re-linked predecessor-to-successor**, because an edge the PM never drew is an edge nobody can explain later; the PM re-links deliberately if the chain still holds.
- **Moving or re-parenting a WP re-validates the graph.** FR-6a's rules are invariants of the Plan, not checks that run only when a link is drawn, so a move that would leave an illegal edge behind — a summary endpoint, or an ancestor/descendant pair — is an edit the PM must resolve in the same action, exactly like giving a leaf WP a child.
- **Actual dates are PM-owned inputs, not observations.** A leaf WP's actual start and actual finish are dates the PM sets, imports with the plan (FR-9), or accepts from a proposal. Marking a WP complete asks for its actual finish and proposes today, which the PM can change to the date the work really finished. Where the WP has Mapped Tickets, the **first observed activity** — the date of its earliest ledger entry — is shown beside the actual start field as evidence and offered as a one-click fill. **It is never written as the actual start by the system.** Both actual dates are inputs to FR-6b, which reads them and never moves them.
- **An actual finish cannot precede its actual start.** An attempt is rejected with the reason. An actual date later than the Data Date is neither accepted silently nor rejected: the PM is asked to advance the Data Date to cover it in the same action, because the two are one statement about how far the plan has got (FR-43).

#### FR-6a: Dependency, duration and constraint capture — *R0*

A PM can add finish-to-start dependencies between leaf WPs with a lag in working days. Duration and scheduling constraints are held per leaf WP (FR-5). All three are imported from Excel where the source file carries them (FR-9), exported with the plan and its calendar (FR-39), and pinned into every Baseline version (FR-15, FR-16).

**Consequences (testable):**
- A dependency that would create a cycle is rejected at entry, naming the cycle.
- **A dependency with an endpoint on a summary WP is rejected at entry**, with the reason. A summary WP's dates are a roll-up, not a schedulable quantity (FR-5).
- **A dependency whose endpoints are in an ancestor/descendant relationship is rejected at entry.** This check is separate from the cycle check and cannot be replaced by it: the cycle check runs over the dependency graph, and an ancestor/descendant link is a cycle only once the roll-up edges are taken into account.
- A dependency between WPs in different Projects is rejected in R0.
- **These are invariants, not entry checks.** Entry is where they are usually enforced, but the same four rules are validated by every recalculation (FR-6b) and by every structural edit — a move, a re-parent, a delete, an import or a re-import — because a move can turn a legal link into an ancestor/descendant link or a leaf endpoint into a summary endpoint without any link being touched (FR-5). A Plan that violates one is never scheduled: the recalculation stops, names the offending edges, and shows the last good schedule marked stale.
- Importing a plan whose dependency columns reference unknown WPs reports them in the Import Preview rather than discarding them silently.

#### FR-6b: Schedule recalculation — *R0*

The schedule is recalculated automatically whenever a scheduling input changes. The complete trigger list is: a duration; a dependency added, removed or re-lagged; a constraint; a WP created, deleted, moved or re-parented; an **actual start or actual finish**; a **Recorded Percent Complete** — imported or overridden by the PM, never the Observed figure (§3, FR-30); a calendar version; and the Data Date, Project start or Project finish. **A WP that slips moves the WPs that depend on it.** No user action is required, and no other part of the system writes a planned WP date.

**Nothing derived from Tracker evidence is ever a scheduling input.** This is the invariant behind the trigger list, and it is what keeps the list closed. Tracker evidence — snapshots, ledger entries, Mappings, Mapping Rules, and the Observed Percent Complete computed from them — drives attribution, Unplanned Work, EVM and the Reconciliation Review. It never drives a date. Evidence reaches the plan only through a PM action: an override, an import, or advancing the Data Date. A new evidence-derived figure added later is not a new trigger; it inherits this rule.

**What is not a trigger, by design.** A Tracker Snapshot, a ledger entry, a Mapping or remapping, a Mapping Rule firing in the background, and a change in the Observed Percent Complete change attribution, Unplanned Work and EVM — and no WP date. The plan does not move while nobody is looking at it, so NFR-P1's 300 ms budget covers PM edits and never a background job, and a displayed schedule is never stale against its inputs (NFR-C1).

**Consequences (testable):**
- **What is scheduled:** leaf WPs only. Summary dates are rolled up from the result and are never read back in (FR-5).
- **Scope and concurrency of a recalculation:** one recalculation covers the whole Project, never a subgraph, so no partially stale plan is ever displayed. Recalculations of the same Project are serialised: an edit arriving during a recalculation is applied to that recalculation's result, never interleaved with it. NFR-P1 sets the latency budget.
- **Progress awareness — the Data Date (FR-43).** Each leaf WP is one of three things, and the scheduler treats each differently:
  - **complete** — it has an actual finish. Its dates *are* its actual dates. The scheduler never moves them, and it passes its actual finish to its successors.
  - **in progress** — it has an actual start and no actual finish. Its start is its actual start. It is scheduled forward over its **remaining duration** from no earlier than the Data Date.
  - **remaining** — it has neither. The passes place it, and it never starts earlier than the Data Date.

  Importing a mid-flight project therefore never re-dates work already done, and the critical path is the critical path of the work that is left. Every one of the founder's target projects is mid-flight, so this is the normal case, not an edge case. **The actual dates that drive this come from the PM and from the import** (FR-5, FR-9), so a project that started before momo-keikaku saw it arrives with its progress intact, before any Connector exists.
- **Remaining duration is derived from progress, not from elapsed time.** It is `duration × (1 − Percent Complete)`, rounded up to whole working days and never fewer than one. The Percent Complete it reads is the **Recorded** one — imported or set as an audited PM override — and never the Observed figure derived from Ticket completion, and never burned effort (§3, FR-30). A WP with no Recorded value is scheduled as though it were 0% done, and the Reconciliation Review shows the Observed figure beside it so the gap is visible and the PM can accept it. Elapsed calendar time is deliberately not used: a WP 90% through its calendar window and 10% done would otherwise forecast one day remaining, which is the dishonest arithmetic this product exists to remove. Remaining duration is always derived, never stored, so it cannot drift from the inputs behind it.
- **Forward pass:** each remaining WP's earliest start is the latest of the Data Date, the Project start (FR-43) and every predecessor's finish plus lag, counted in working days on the Project's Holiday Calendar version (FR-14).
- **Backward pass:** each WP's latest start and finish are derived backwards through the same graph from **one anchor and one only** — the **Project finish** where the PM has set one, and otherwise the **computed finish**, the latest derived finish in the Plan. **Constraints are never anchors.** Which of the two was used is shown wherever Float is shown, because the two produce different Float and the difference reaches the client on a published schedule (FR-34).
- **Float** is latest start minus earliest start, and **may be negative** — but only ever because the plan cannot meet a Project finish the PM set. The **critical path** is the set of WPs whose Float equals the minimum Float measured against the anchor above: zero on a plan with slack, negative on a plan that cannot meet its Project finish. It is never the zero-Float set, and it is never displaced by a constraint violation. It is identified in the tree grid (FR-7).
- **Constraints are soft, and a violation is reported rather than hidden.** A *must start on* or *must finish on* date is applied as a lower or upper bound on that WP's dates wherever the dependency graph allows it. Where it does not, **the graph wins**: the scheduler never draws a successor starting before its predecessor finishes. The WP is then flagged with a constraint violation that names the date asked for, the date derived, **how many working days late it is**, and the predecessor chain that forced it.
- **A violation stays on the WP that owns it.** An unmet *must finish on* does **not** push negative Float onto that WP or onto anything upstream of it, and does not change any other WP's Float. This is a deliberate choice against the more common CPM behaviour: one constraint missed by six weeks would otherwise give its own chain Float −30 and leave the longest path — the chain that actually decides when the project ends — at Float ≥ 0 and off the critical path, which is exactly the failure §3's *Critical Path* entry exists to avoid. Violations are surfaced as their own ranked list, worst first, alongside the critical path rather than inside it, and the Schedule Health Indicator reads both (FR-31).
- **Out-of-sequence progress: an actual date always wins.** Real teams start WP 2.4 while WP 2.3 is still open, so an actual start that precedes its predecessor's finish is normal, not an error. The "a successor never starts before its predecessor finishes" invariant binds **remaining work only**; a complete or in-progress WP keeps its actual dates whatever the graph says, its successors are driven from those dates, and the pair is flagged as an out-of-sequence link — named, counted and explained exactly like a constraint violation. The scheduler never rewrites history to preserve an invariant about the future.
- **A leaf WP with no duration is not scheduled.** FR-9 can create one (a row carrying only half a start/finish pair). It is listed in a "not schedulable yet" block with its reason, it is excluded from both passes and from the critical path, its successors are driven from its predecessors as though it were absent, and it blocks a Baseline (FR-15). It is never silently treated as duration 1 or duration 0.
- **Outside the calendar's coverage the scheduler stops rather than guesses.** If a pass would place a date beyond the Holiday Calendar's loaded range (FR-14), the recalculation halts and reports the WPs and the range it needs. A schedule computed against assumed working days is not re-derivable and would fail FR-15's test years later.
- **Determinism:** the same pinned inputs always produce the same dates. Ordering is explicit and ties are broken by the rule recorded in the architecture document (NFR-C1, OQ-13) — not left to iteration order, and not asserted here as though it already existed.
- **Milestones** are zero-duration leaf WPs and participate in the passes normally. A milestone's target date is its *must finish on* constraint (§3), so a missed target is a constraint violation on that milestone, reported with the days late and the chain behind it.

**Deliberately excluded from R0** — see §8.3. Resource levelling; the SS, FF and SF dependency types; effort-driven scheduling, where duration is derived from effort divided by assignment; constraint types beyond the three in FR-5; recovery behaviour when a constraint is violated, beyond reporting it; and the what-if sandbox.

#### FR-7: Plan tree grid — *R0*; Gantt — *R1*

**R0 ships exactly one scheduling surface: the tree grid.** A PM views and edits the whole Plan there — the hierarchy, the derived dates and every scheduling input behind them. A Gantt arrives in R1, alongside the client-facing schedule it exists to serve (FR-34).

*Why one.* Two complete dependency- and constraint-editing surfaces is two builds, each under NFR-U1's WCAG 2.1 AA keyboard bar, which most off-the-shelf Gantt components fail (OQ-11). The tree grid is the accessible one, it carries every column the engine produces, and it needs no third-party component — so it is the one R0 builds, and the Gantt is a later addition rather than a cut waiting to be taken.

**Consequences (testable):**
- **The tree grid is the complete scheduling surface.** It shows, per WP: the derived start and finish, the actual start and actual finish, duration, Percent Complete, a predecessor column with lags, the constraint type and date, a Float column and a critical-path marker. Dependencies and constraints are created, edited and deleted there. Nothing FR-6a captures or FR-6b produces is reachable only from a Gantt.
- **Progress is visible as progress.** Each WP reads as complete, in progress or remaining (FR-6b), and the Data Date is shown on the surface as the boundary between the two halves of the plan.
- **Baseline comparison** is shown as columns — the active Baseline's dates beside the Current Plan's, with the difference — because R0 has no bars to draw them on.
- **Constraint violations** (FR-6b) are marked on the WP, and the explanation — date asked for, date derived, working days late, the chain that forced it — is reachable from the marker. **Out-of-sequence links** are marked the same way.
- **Negative Float** is displayed as a negative number, never as zero or blank.
- **Gantt (R1):** bars for the Current Plan against the active Baseline, dependency arrows, critical-path emphasis, the Data Date as a vertical line, and non-working days shaded. It is a second view of the same data, not a second source of truth, and it adds no scheduling capability the tree grid lacks.
- The design of the tree grid is open and is handed to `bmad-ux` (OQ-11). This PRD states what the surface must carry, not how it looks. The build-versus-buy decision for a Gantt component moves to R1 with the Gantt.
- The views meet NFR-P1.

#### FR-8: Custom Fields — *R0*

A PM can define Custom Fields of type text, number, date or single-select. They can be used as columns and grouping axes.

**Consequences (testable):**
- **The tested bound is the bound.** A Project with 100 Custom Fields meets NFR-P1, and that is the limit R0 owes. The product does not block the 101st, but it warns that behaviour beyond the tested bound is untested, and no further engineering is in R0 scope (§7.3). "No limit" was an unbounded promise inside a frozen scope.

### 4.3 Excel Import

**Description:** The PM uploads an Excel WBS.
- In R0, the PM maps columns to fields, with suggestions based on the headers.
- AI interpretation of arbitrary layouts comes Post-Q1.

In every release, nothing is committed until the PM confirms the mandatory Import Preview. A misread WBS corrupts every number downstream. Realises UJ-1.

#### FR-9: Upload and column mapping — *R0*

A PM can:
- upload an .xlsx file;
- choose the sheet and the header row;
- map each column to a field: WBS code or indentation level, name, start, finish, **duration, predecessors, lag, constraint type, constraint date**, **actual start, actual finish, percent complete**, effort, assignee, milestone, or a Custom Field.

The system suggests mappings by matching English and Japanese headers.

**Consequences (testable):**
- **Imported planned dates never become WP dates.** The importer writes no derived start or finish; nothing outside the scheduler does (FR-6b). An imported start/finish pair is converted instead:
  - where a duration column is also mapped, the duration column wins, and the imported dates are kept as reference Custom Fields named after their source columns;
  - where it is not, each WP's duration is derived as the working-day count from the imported start to the imported finish inclusive, on the Project's Holiday Calendar (FR-14), and the imported dates are kept as reference Custom Fields;
  - a row carrying only one of the pair, or a finish before its start, is flagged in the Import Preview and imported with no duration.

  **Imported dates are never turned into constraints automatically.** A plan of three hundred *must start on* constraints is a typed schedule wearing a different hat, which is the failure FR-5 exists to remove. The PM adds constraints deliberately.
- **The import carries progress, because every real plan is mid-flight.** Three further columns can be mapped, and each is confirmed in the FR-10 preview like everything else:
  - **actual start** and **actual finish** are imported as the WP's actual dates (FR-5). They are the one kind of date the importer does write, and they are not planned dates: FR-6b reads them as the record of what already happened and never moves them. Without them a four-month-old project would arrive with every leaf marked *remaining* and the scheduler would re-date finished work forward from the Data Date — the failure the Data Date exists to prevent. A row with an actual finish and no actual start is flagged; a row whose actual finish precedes its actual start is flagged and neither is imported.
  - **percent complete** is imported as a Percent Complete override on that WP (FR-30), with the reason recorded as imported from the file and the row, so it is audited and marked PM-adjusted like any other override. It stands until the PM clears it, at which point FR-30's evidence-based figure takes over. FR-6b uses it to derive remaining duration, so an in-progress WP arrives with the right amount of work left rather than all of it. A value outside 0–100, or one on a WP with an actual finish that is not 100, is flagged in the preview and never guessed.
  - A row that carries an actual finish arrives **complete**; one with an actual start only arrives **in progress**; one with neither arrives **remaining** (FR-6b). The preview states which of the three each row will be.
- **Milestone rows are the one deliberate exception to the no-auto-constraint rule.** A row mapped as a milestone takes **duration 0** — the working-day derivation above does not run on it, so a single date cannot become a duration of 1 — and its imported date becomes a ***must finish on* constraint**, which is what a milestone target is in this product (§3). Where a milestone row carries both a start and a finish, the finish is the target. This exception is narrow and is stated rather than inferred: without it, every imported milestone would lose the date the client cares about most, and both of FR-31's milestone rules would have nothing to fire on until the PM retyped each target by hand. The preview lists every constraint created this way, and the PM can clear any of them before committing.
- **Predecessors:** a mapped predecessor column is read as a list of WBS codes or WP names, each with an optional lag in working days, and is applied as FR-6a dependencies. Codes matching no WP, and links FR-6a rejects — cycles, ancestor/descendant pairs, summary endpoints, cross-project links — are listed in the Import Preview with their rows and reasons, and are never dropped silently.
- **Constraints:** a mapped constraint-type column is read as one of the three types in FR-5. An unrecognised value is flagged in the preview, never guessed.
- **Hierarchy:** read from WBS codes (1, 1.1, 1.1.1) or from indentation.
- **Dates:** the Western and Japanese forms used in the founder's files are parsed, for example 2026/10/01 and 10月1日.
- **Merged cells:** unmerged, with each cell taking the merged value.
- **Acceptance corpus:** at least 10 real WBS files from the founder's projects. For each file, 100% of rows land at the correct level with 5 or fewer manual corrections in the preview.

#### FR-10: Mandatory Import Preview — *R0*

Before anything is committed, the PM sees every row as it will be imported, with its level, its values and any flagged problems. The PM can correct values, levels and column mappings.

**Consequences (testable):**
- **Confirmation:** no code path commits an import without an explicit PM confirmation.
- **Project settings:** if the Project has no Project start or Data Date, the preview asks for both before it will commit. It proposes the **earliest imported start** as the Project start, and **today** as the Data Date. The Data Date is never proposed from the file's contents: the latest imported date is the plan's intended *end*, often a year out, and accepting it would schedule every remaining WP after the plan's own finish (FR-43, §3). Where the file carried actual dates, the preview also offers the latest imported actual date as an alternative, and says which of the two it is proposing.
- **Schedule preview:** the preview shows the duration derived for every row, the dependencies and constraints it read, the progress it read, and — once the Project start and Data Date are confirmed — the dates the scheduler will produce. The PM corrects durations, links, constraints, progress and levels in the preview. **The PM never corrects a planned date**, because no planned date is imported.
- **Progress preview:** the preview shows, per row, the actual start, the actual finish and the percent complete it read; which of FR-6b's three states the row will arrive in; and the remaining duration that follows. Totals are shown for the file: how many rows arrive complete, in progress and remaining. A plan whose rows are all *remaining* on a project the PM knows is mid-flight is visible before it is committed, not after the first Baseline has pinned it.
- **Milestone constraints:** every *must finish on* constraint created from a milestone row (FR-9) is listed, with its row and its date, and can be cleared individually before committing.
- **Unknown assignees:** assignees that do not match a Resource are listed. The PM creates or links a Resource for each one.
- **Counts:** the preview reports rows read, rows imported and rows skipped, with a reason for each skipped row.
- **Untrusted content:** cell content is treated as untrusted. Formulas and macros are never executed, and text is escaped wherever it is displayed.

#### FR-11: Re-import with diff — *R0*

A PM can import a new version of the file into an existing Plan and review a diff that shows added, changed and removed WPs.

**Consequences (testable):**
- **Matching WPs:** WPs are matched by WBS code. Without a code, they are matched by name within the same parent. Pairs that cannot be matched are shown for the PM to resolve.
- **Conflicts:** for imported fields, the re-imported value wins. The diff lists every value that overwrites an edit made in the tool.
- **Planned dates are not an imported field.** A re-import can overwrite durations, dependencies, constraints, actual dates and percent complete, and the diff shows each of those; it never writes a planned WP date. Planned dates change only because FR-6b recomputed them, and the diff shows the resulting date movement in a separate section from the input changes that caused it, so the PM can see cause and effect rather than a wall of moved dates.
- **Actual dates and progress are only ever moved forward by a re-import, never erased by silence.** A re-import clears an actual date or a Percent Complete override only where the corresponding column is mapped and the cell is empty, and every such clearing is listed in the diff as its own line. An unmapped progress column leaves the WP's recorded progress untouched, exactly as an unmapped predecessor column leaves the graph untouched.
- **Links made in the tool survive an ambiguous re-import.** A re-import removes a dependency only when a predecessor column is mapped and no longer names it. If no predecessor column is mapped, the dependency graph is left untouched and the diff says so explicitly, rather than silently erasing scheduling work the PM did in the tool.
- **Baseline:** a re-import never changes a Baseline.
- **Removed WPs:** their Mappings are handled as in FR-5.

#### FR-41: AI-assisted interpretation — *Post-Q1*

The system proposes how to read an arbitrary layout:
- detects the tables;
- infers the hierarchy;
- reads Japanese era dates, for example 令和8年10月1日;
- marks its confidence on every uncertain cell.

The PM still confirms everything in the FR-10 preview.

**Consequences (testable):**
- **Opt-in:** Excel content goes to a model provider only if the Tenant Admin has opted in. The provider must not train on the data, must meet NFR-S4, and must be listed as a subprocessor (NFR-S5).
- **Confidence:** every cell below the confidence threshold (a Tenant setting) is highlighted, and the threshold is shown in the preview.
- **Acceptance:** the FR-9 acceptance corpus plus files that use Japanese era dates, with the same pass bar as FR-9.

### 4.4 Resources, Rates and Calendars

#### FR-12: Resources and Rates — *R0*

A Tenant Admin or PM can create Resources, each with a home Department. Only a Tenant Admin sets a Resource's dated Rate history and each Project's default Rate (FR-2).

**Consequences (testable):**
- An hour is valued at the Rate in effect when the hour was recorded.
- If a Rate is corrected retroactively, the Actuals Ledger is left untouched and money is recomputed against the pinned Rate history, so every figure still derives from pinned inputs and earlier Published Snapshots reproduce exactly (founder decision, 2026-09-20). Past entries are never rewritten.

#### FR-13: Tracker Account linking — *R0*

A PM can link Tracker Accounts to Resources. The system suggests links by matching names or emails.

**Consequences (testable):**
- **Unattributed hours:** hours from an unlinked Tracker Account, or from a Ticket with no assignee, are recorded as Unattributed hours and costed at the Project default Rate.
- **Department roll-ups:** Unattributed hours appear on the *Unattributed* line, so Department totals still equal Project totals.

#### FR-14: Holiday Calendars — *R0*

Each Project's Holiday Calendar uses Japanese national holidays, Vietnamese national holidays (including Tết), or both. The PM can add Project-specific non-working days, such as the client company's own holidays.

**Consequences (testable):**
- The national calendar data covers 2026–2028. A schedule that would run past the loaded range does not fall back to assumed working days: FR-6b halts and reports the range it needs, and the range is extended as an operator action.
- All working-day calculations exclude the Project's non-working days.
- **Dated, append-only history over the whole calendar, national tables included.** Three kinds of change create a new calendar **version**, each with its author or source, its time and an optional reason: adding or removing a Project-specific non-working day; changing which national calendars are in use; and **any correction or extension of the JP or VN national holiday tables themselves**. Earlier versions are never edited or deleted. The national tables are the point: Japan legislates holidays year by year and substitute holidays move, they are 95% of the calendar, and a "version" that tracked only the PM's own days off would let a system-data update silently change what every past Baseline re-derives to — D-3's failure surviving in most of the calendar. A version therefore identifies the effective non-working-day set in full, not a name plus a moving table.
- **Past schedules re-derive against the version they were taken with.** A Baseline pins the calendar version in force when it was taken (FR-15); a Published Snapshot pins the version it was computed with (FR-35). Adding a client holiday in November, or correcting a 2027 Japanese substitute holiday in December, therefore cannot change what an October Baseline re-derives to, and FR-15's re-derivation test cannot fail because system data moved under it.
- **The Current Plan always uses the latest version.** Creating a version triggers a recalculation (FR-6b), and the resulting date movement appears in the Reconciliation Review with the cause *calendar changed* (FR-28).

**Out of Scope:** layered client, department and person calendars (Post-Q1).

### 4.5 Baseline Management

**Description:** The Baseline and the actuals live on separate ledgers. A Baseline is never edited. Plan changes go to the Current Plan. The Baseline moves only through an explicit, reasoned Re-baseline (research R6).

#### FR-15: Set Baseline — *R0*

A PM can set a Baseline from the Current Plan.

**Consequences (testable):**
- A Baseline cannot be edited after it is recorded.
- Before the first Baseline, the Project shows a "no baseline yet" state instead of EVM Metrics.
- **A Baseline pins inputs, not only outputs.** Every Baseline version records, per leaf WP: its planned dates, its planned effort, **and** the inputs those dates came from — duration, constraint type, constraint date, the milestone flag, the actual start and actual finish, and the **Percent Complete** the WP had at that moment. Per Project it records the complete dependency graph with its lags as it stood, the Holiday Calendar version (FR-14), and the Project start, Project finish and Data Date (FR-43). Actual dates, progress and the Data Date are pinned because FR-6b reads them — progress drives remaining duration, so a Baseline without it cannot reproduce a single in-progress WP's dates. A pinned set that omits any of them cannot re-derive the plan it claims to explain.
- **Re-derivation test:** re-running FR-6b over a Baseline version's pinned inputs alone — with no reference to the Current Plan — reproduces that version's dates, Float, constraint violations and critical path exactly, on any machine and at any later date (NFR-C1). The test compares the critical path as an ordered set, so it depends on the tie-break rule being written down rather than emergent (OQ-13). This is an automated test, not a claim in prose.
- **No partial pinning.** A Baseline cannot be recorded while any leaf WP is missing a duration, or while the Project has no Project start, because the result would not be re-derivable. The PM is shown the blocking WPs.

#### FR-16: Re-baseline with history — *R0*

A PM can Re-baseline. A reason is mandatory, and the PM can link Change Request candidates.

**Consequences (testable):**
- Every Baseline version is kept, with its author, time and reason.
- Any two versions can be compared WP by WP.
- **Any two versions can also be compared as plans, not only as rows.** A dependency is an edge, not a WP attribute, so a WP-by-WP diff can show that WP 2.4 and everything after it moved three weeks while showing no reason anywhere: the removed link between 2.3 and 2.4 has no row. The comparison therefore also lists, per Project: dependencies added and removed, lags changed, constraints added, changed and removed, durations changed, actual dates recorded or corrected, Percent Complete changed, milestone flags changed, the Holiday Calendar version, and any change to the Project start, Project finish or Data Date (FR-43).
- **Every date change is attributable.** For any WP whose dates differ between two Baseline versions, the comparison names at least one input change from the list above that accounts for it. A plan that moved for no recorded reason is the failure this requirement exists to prevent.
- Every Published Snapshot records the Baseline version it used.

### 4.6 Tracker Connectors

**Description:** Connectors are read-only. The offshore team keeps working in Backlog or Jira. An always-on service takes Tracker Snapshots, from which the Actuals Ledger is built, because Backlog exposes only one actual-hours value per issue and has no worklog API (research R3). Realises UJ-2.

**Out of Scope:**
- Redmine and Asana Connectors (Post-Q1, Redmine first per research R4).
- Writing back to Trackers (never).

#### FR-17: Backlog Connector — *R0*

A PM can connect a Project to one or more Backlog projects.

**Consequences (testable):**
- **Read only:** the Connector makes only read calls.
- **Access set-up:** the set-up flow recommends a dedicated read-only bot user. For a client-owned space, the PM records who on the client side approved the connection, and when, before the first Tracker Snapshot.
- **Hours detection:** whether hours are available is detected from the data, not from the Backlog plan name. If the actual-hours field is absent, or empty on every Ticket, the Connector runs in Ticket-Count Mode and says so.
- **Credential rotation:** credentials can be rotated without losing Mappings.
- **Bad credentials:** an invalid or revoked credential produces a Connector error. The PM is notified in the app and by email within one snapshot interval.

#### FR-18: Jira Connector — *Post-Q1*

A PM can connect a Project to Jira Cloud by project key or by JQL.

**Consequences (testable):**
- The Connector authenticates with OAuth 2.0 using read-only scopes.
- It reads each Ticket's own time spent (not the aggregate across sub-tasks) and uses the same snapshot-delta ledger as Backlog.

**Out of Scope:** Jira Data Center and Jira Server.

#### FR-19: Tracker Snapshot schedule — *R0*

The system takes a Tracker Snapshot of each active Connector on a schedule. A PM can also trigger one on demand.

**Consequences (testable):**
- **Interval:** hourly during JP and VN business hours, and at least every 6 hours outside them.
- **Freshness:** the age of the latest successful Tracker Snapshot is always visible.
- **Failures:** a failed snapshot loses no data. The next successful snapshot records the full difference.
- **Stored fields:** only the Ticket fields the product needs are stored: ID, key, title, status, estimate, actual hours, assignee, and the attributes Mapping Rules use. Descriptions and comments are never stored.
- **Retention:** Tracker Snapshots older than 90 days are compacted to one per day. The Actuals Ledger is never compacted.

#### FR-20: Scope completeness — *R0*

Every Ticket in scope is either mapped or reported as unmapped. Nothing in scope is silently excluded (research R6).

**Consequences (testable):**
- For any Reporting Period and Connector, these four mutually exclusive figures sum to the total ledger hours in that Connector's scope for that Period, excluding Opening Balances:
  - hours mapped to baselined WPs that are not Catch-all WPs;
  - hours mapped to non-baselined WPs that are not Catch-all WPs;
  - hours mapped to Catch-all WPs;
  - Unmapped Work.
- Opening Balances are reported separately, per Connector.
- If a Connector's scope changes, the Reconciliation Review shows the change, the Tickets that left scope, and their hours.

#### FR-42: Ticket lifecycle in the ledger — *R0*

The Actuals Ledger stays correct as Tickets appear, change, move or disappear.

**Consequences (testable):**
- **Opening Balance:** hours already on a Ticket are recorded as an Opening Balance, dated at the snapshot, in two cases only:
  - the Ticket is in the Connector's first Tracker Snapshot;
  - the Ticket enters scope because the PM changed the Connector's scope.

  Opening Balances count in cumulative AC. Period metrics exclude them, so a Project connected mid-flight shows no false spike. This is how the free experience works from day one without history.
- **Other first sightings:** a Ticket first seen in any later snapshot (for example, created since the previous snapshot) records all its hours as a normal delta in that snapshot's Period.
- **Deleted or out of scope:** the Ticket keeps its ledger history. Its hours are not reversed and no further deltas are recorded. It is listed as "left scope", with its hours.
- **Moved within scope:** the Ticket keeps its identity (the Tracker's internal ID). A key change, or a move between Tracker projects within scope, does not create a new Ticket.
- **One owner:** within a Tenant, each Ticket is owned by exactly one Connector. If a second Connector's scope overlaps, the overlap is shown to the PM as a conflict and the hours are not counted twice.
- **Invariant:** for every in-scope Ticket, the sum of its ledger entries equals its last observed actual hours.

### 4.7 Work Package ↔ Ticket Mapping

**Description:** Mappings persist across Tracker Snapshots and Plan edits. Mapping Rules keep new Tickets mapped without manual work. Realises UJ-2 and UJ-3.

#### FR-21: Manual Mapping and attribution — *R0*

A PM can map one or many Tickets to a leaf WP, remap them, or unmap them.

**Consequences (testable):**
- **One WP per Ticket:** a Ticket maps to at most one leaf WP.
- **Attribution follows the current Mapping:** all of a Ticket's ledger entries are attributed to the WP it is mapped to now. Remapping moves them, and Unplanned Work updates immediately.
- **Mapping never moves the plan.** Mapping, remapping and unmapping change attribution, Unplanned Work, Percent Complete's evidence and every EVM figure — and no WP date. They do not write a WP's actual start or actual finish and they do not trigger a recalculation (FR-5, FR-6b). The WP's **first observed activity** is recomputed and shown beside its actual start as evidence, and the PM may take it with one click; until the PM does, the schedule is exactly where it was. This is what lets the PM reconcile for an hour without the plan shifting underneath the review.
- **No rewriting:** the ledger itself is never rewritten. Attribution is computed from the ledger and the Mapping history.
- **Published Snapshots:** they freeze the attribution in force when they were published (FR-35).
- **Audit:** every Mapping change is recorded with its author and time (NFR-A1).

#### FR-22: Mapping Rules — *R0*

A PM can define Mapping Rules on Ticket attributes, in priority order:
- **Backlog:** milestone, category, issue type, parent issue, key pattern.
- **Jira:** epic or parent, label, component, fix version, issue type, key pattern.

**Consequences (testable):**
- **Rules are live:** on every Tracker Snapshot, each Ticket without a manual Mapping is re-evaluated against the rules in priority order.
- **Live rules never move the plan.** Re-evaluation runs hourly and unattended (FR-19), so it is the one part of the system that could re-date a plan while nobody is watching. It cannot: it changes attribution only, it writes no actual date, and it triggers no recalculation (FR-5, FR-6b, FR-21). A PM who opens the tool on Monday sees the dates they left on Friday, with the hours behind them updated.
- **Manual wins:** a manual Mapping always overrides a rule.
- **Priority:** rule priorities form a strict order. No two rules share a priority.
- **Preview:** before saving a new, edited or deleted rule, the PM sees a preview of the Tickets and hours that would move.
- **Deleting a rule:** the Tickets it mapped are re-evaluated against the remaining rules.
- **Rule flips are logged:** when re-evaluation changes a Ticket's Mapping, the change is recorded as a Mapping change by that rule (NFR-A1). A Ticket that a rule moves to Unmapped is highlighted in the next Reconciliation Review.

#### FR-23: Mapping coverage — *R0*

A PM can see mapping coverage per Connector: how much is mapped, in Catch-all WPs, and unmapped. The share of Tickets and the share of hours are reported separately.

#### FR-24: Catch-all WPs — *R0*

A PM can flag a WP as a Catch-all WP.

**Consequences (testable):**
- **With Baseline hours:** the Catch-all WP is measured as Level of Effort. Its AC counts only up to its Baseline hours. Hours beyond that are Unplanned Work and appear only on the Project's *Unplanned* line (FR-30), so they are never counted twice.
- **Without Baseline hours:** all of its hours are Unplanned Work.

### 4.8 Actuals Ledger

**Description:** The ledger is built from the differences between Tracker Snapshots, never from imported worklogs. It is append-only and kept separate from the Baseline Ledger. Attribution to a person or a day is approximate by design (research R3). Realises UJ-3.

#### FR-25: Ledger entries from snapshot deltas — *R0*

When a Ticket's actual hours change between two Tracker Snapshots, the system appends a ledger entry that records:
- the Ticket;
- the change in hours (the delta);
- the snapshot window (from the earlier snapshot to the later one);
- the assignee at the later snapshot, and the linked Resource.

**Consequences (testable):**
- **Period:** an entry belongs to the Reporting Period that contains the timestamp of its later snapshot.
- **Negative deltas:** they are recorded as negative entries and never discarded. They are costed at the Resource and Rate of the Ticket's most recent positive entries, so money nets out.
- **Corrections:** entries are never updated. A correction is made with a new entry.

#### FR-26: Attribution honesty — *R0*

Every breakdown of actuals by person or by day is labelled approximate, with the reason.

**Consequences (testable):**
- The notice appears on every view at person level or day level.
- Actuals at person level never appear in Client Views (FR-34).
- No view ranks or scores people by Unplanned Work.

#### FR-27: Ticket-Count Mode — *R0*

When a Connector exposes no hours, progress still uses the Baseline and Ticket completion. Metrics that need actual effort are unavailable.

**Consequences (testable):**
- **Still computed:** PV, EV, SV and SPI are computed as in FR-30, with Percent Complete on the count basis.
- **Unavailable:** AC, CV, CPI, EAC, ETC, VAC and TCPI show "unavailable — tracker provides no hours", never zero.
- **Unplanned Work:** shown as a count of Tickets. The Unplanned Work indicator uses the Ticket-count share, with the FR-31 thresholds.
- **Health:** the Effort/Cost indicator shows "unavailable". The overall status is the worst of the available indicators and names the unavailable one.
- **Mixed Projects:** in a Project with both an hours Connector and a count Connector, AC-based metrics cover only the hours Connector and are labelled with that coverage. Hours and counts are never added together.

### 4.9 Reconciliation Review and Dispositions

**Description:** This is the wedge. For each Reporting Period, the PM sees the plan, Divergence, EVM and Unplanned Work, and decides what to do with each part before publishing. Unplanned Work is presented as information about how accurate the plan is, not as a judgement of people (§7.1). Realises UJ-3.

#### FR-28: Reconciliation Review — *R0*

A PM can open the Reconciliation Review for any Reporting Period. It shows:
- EVM Metrics;
- Health Indicators;
- Divergence by WP;
- mapping coverage;
- Unplanned Work, broken down into its three components.

**Consequences (testable):**
- The Review is pinned to a specific Tracker Snapshot, and that snapshot's time is shown.
- **Date movement carries its cause, and the list is complete.** Every WP whose Current Plan dates have moved since the previous Review is marked with one of exactly seven causes: *edited* (a duration, dependency or constraint on this WP changed), *moved by a predecessor* (only upstream inputs changed), *calendar changed* (FR-14), *data date advanced* (FR-43), *actual dates recorded* (the PM recorded or corrected an actual start or actual finish, marking a WP complete included — FR-5), *progress changed* (a Recorded Percent Complete moved, so remaining duration moved — FR-6b, FR-30), or *project dates changed* (the Project start or Project finish moved, which re-anchors a pass for the whole Plan — FR-43). Derived dates mean one duration edit can move a hundred WPs; without the cause, the PM would triage those hundred by hand every week. There is no cause for a mapping change, because a mapping change cannot move a date (FR-21, FR-22) — the blank cause column that would otherwise appear is designed out rather than explained away.
- The Review shows the Project's Data Date and offers to advance it to the Period boundary. Advancing it is an explicit PM action (FR-43).
- Unmapped Work is grouped by Tracker attribute and can be expanded to individual Tickets, with hours (and money, in PM views).
- Every number links to the Tickets or WPs behind it.
- The Contract Type is shown next to Unplanned Work.

#### FR-29: Dispositions — *R0*

A PM can record a Disposition for any Unmapped Ticket or group of them.

**Consequences (testable):**
- ***Map*** creates Mappings. Because attribution follows FR-21, those hours leave Unplanned Work.
- ***Plan*** creates a leaf WP in the Current Plan and maps the Tickets to it. Its hours count as Unplanned Work until a Re-baseline includes that WP. Hours recorded before that Re-baseline stay Unplanned Work (FR-30).
  - **It does not move the plan, and neither does any other Disposition.** The WP is created with no dependencies and an *as soon as possible* constraint, so the recalculation it triggers touches nothing but the WP itself. *Map*, *Change Request candidate* and *Explain* change no WP date at all, because mapping does not (FR-21). The PM never has to stop reconciling, minutes before publishing, to do scheduling.
  - **Its dates come from the work already done, once the PM says so.** Its mapped Tickets carry ledger entries, so the action proposes an actual start from their **first observed activity** (FR-5) and a duration of the working days from there to the Data Date. The PM accepts or changes both in the same dialog. On acceptance FR-6b treats the WP as *in progress* and pins it at that actual start rather than placing it in the future; if the PM clears the proposal, the WP is *remaining* and is placed after the Data Date, which is equally honest and equally local. Either way the proposal is a proposal: nothing writes an actual date behind the PM's back.
  - **Linking it into the graph is a later, deliberate act**, done from the plan surface. That is the point at which the rest of the plan may move, and it is outside the Reconciliation Review.
- ***Change Request candidate*** collects the Tickets and their hours into a list the PM can export.
- ***Explain*** attaches a note. Client Viewers see the note only when a Published Snapshot includes it.
- **Indicator colour:** apart from *Map*, no Disposition changes the colour of the Unplanned Work indicator without a Re-baseline.
- **New hours after a Disposition:** the Ticket is flagged "new hours since disposition", and those hours count as not yet dispositioned.
- **Group Dispositions:** a Disposition recorded on a group covers the Tickets in the group when it was recorded. Tickets that join the group later are not covered.

**Out of Scope:** a formal change-request approval workflow with the client.

### 4.10 EVM and Health Indicators

**Description:** Honest EVM uses PMI definitions, is measured in effort hours (工数), and includes Unplanned Work. The formulas follow `docs/references/`, plus standard PMBOK definitions for ETC and VAC. Health Indicators are computed, and each shows the rule behind it. Realises UJ-3 and UJ-4.

#### FR-30: EVM computation — *R0 with Typical EAC; the other EAC methods Post-Q1*

The system computes EVM Metrics at WP level and at Project level as of any date. All metrics are cumulative to that date. The Reconciliation Review also shows how much each metric changed within the Period.

**Consequences (testable):**

*Units and inputs*
- **Units:** the primary unit is effort in hours. The money layer (hours × Rate) appears only in PM and internal views and is labelled with its unit. CPI in money can differ from CPI in hours, because the people planned and the people who did the work can have different Rates. The UI says so.
- **PV:** the Baseline hours of baselined leaf WPs, spread linearly over each WP's baseline working days up to the as-of date.
- **AC:** hours from the Actuals Ledger, attributed according to FR-21.

*Percent Complete and EV*
- **Percent Complete** of a leaf WP is never derived from burned effort:
  - *estimate basis*, used when every Mapped Ticket has an estimate: resolved mapped estimate hours ÷ the larger of (the WP's Baseline hours, the total mapped estimate hours);
  - *count basis*, used when any Mapped Ticket has no estimate: resolved Tickets ÷ Mapped Tickets;
  - *no Mapped Tickets:* 0%, flagged "no evidence".
- **Estimates:** Ticket estimates are read from the latest Tracker Snapshot. A change in EV caused by an estimate edit is flagged in the Review.
- **Caps and flags:** Percent Complete is capped at 99% until the WP has an actual finish (FR-5), which is what "complete" means. A WP with fewer than three Mapped Tickets is flagged "low evidence".
- **Only the Recorded figure is a scheduling input.** The figure this section derives from Ticket completion is the **Observed Percent Complete** (§3). It drives EVM and the Reconciliation Review, and it never moves a date — otherwise an hourly Tracker Snapshot would re-date the plan while nobody was looking (FR-6b).
  - FR-6b reads the **Recorded Percent Complete** instead: imported with the plan, or set by the PM as an audited override below. A PM override therefore does move dates, and the movement appears in the Review with the cause *progress changed* (FR-28).
  - A WP with no Recorded value is scheduled as 0% done, however far along its Tickets say it is. The Review shows both figures side by side, so a WP the evidence says is 60% done and the plan still treats as untouched is visible rather than silently assumed either way. Accepting the Observed figure writes a Recorded override, which is a PM action with a reason attached like any other.
- **PM override:** the PM can override Percent Complete, but a reason is required. An imported percent complete is written as such an override, with the file and row as its reason (FR-9), so nothing enters the numbers or the schedule unaudited. The override is written to the audit trail and marked "PM-adjusted" in the Published Snapshot. The marker is always shown to Client Viewers next to the Health Indicators it affects, and no Visibility Policy setting can hide it.
- **EV:** Baseline hours × Percent Complete. If EV falls, for example because a Ticket was reopened, the drop is flagged in the Review.

*Unplanned Work in EVM*
- Unplanned Work is actual effort with no earned value. This is deliberate: it is the honest part of the numbers.
- At Project level, AC is the AC of the baselined leaf WPs plus an *Unplanned* line that holds the Unplanned Work, with PV = EV = 0. The roll-up therefore sums exactly.
- **Baselined status is historical:** whether a ledger entry counts as baselined is judged against the Baseline version active when the entry was recorded. A Re-baseline stops new hours on a newly baselined WP from counting as Unplanned Work. Earlier hours stay Unplanned Work, so a Re-baseline never erases Unplanned history.
- Two CPIs are always shown:
  - **CPI (all-in)** = EV / total AC. This is the headline figure, the one the Effort/Cost indicator uses, and the one every EAC formula uses.
  - **CPI (planned scope)** = EV / AC of the baselined WPs only.

*Formulas.* CV, SV, CPI, SPI, TCPI and EAC come from pmi-techniques v1 and v2 and SRS §5. ETC and VAC are standard PMBOK definitions that do not appear in `docs/references/`.
- CV = EV − AC
- SV = EV − PV
- CPI = EV / AC
- SPI = EV / PV
- TCPI = (BAC − EV) / (BAC − AC). When BAC − AC ≤ 0, the UI shows "BAC exhausted" instead of a number.
- ETC = EAC − AC
- VAC = BAC − EAC

*EAC Method*

The PM chooses one EAC Method per Project. The method is shown next to every EAC.

| Method | Formula | Release | Notes |
|---|---|---|---|
| Typical | EAC = BAC / CPI | R0 | The default, and the only method in R0 |
| Atypical | EAC = AC + (BAC − EV) | Post-Q1 | |
| Schedule-constrained | EAC = AC + (BAC − EV) / (CPI × SPI) | Post-Q1 | For fixed-date 請負 contracts |
| Flawed estimate | EAC = AC + bottom-up ETC | Post-Q1 | The PM enters ETC per leaf WP, and it rolls up. The SRS also lets engineers enter ETC. v1 deliberately does not, because nothing is asked of the offshore team |

*Roll-up and transparency*
- Ratios are always recomputed from summed PV, EV and AC. They are never averaged.
- Every metric shows its formula, its inputs and a one-line interpretation:
  - CV or SV > 0 means under budget or ahead; < 0 means over budget or behind;
  - CPI or SPI < 1 means over budget or behind;
  - TCPI > 1 means the remaining work must beat the planned efficiency.

#### FR-31: Health Indicators — *R0*

The system computes three Health Indicators and an overall status:
- **Schedule**, from SPI and Milestones;
- **Effort/Cost**, from all-in CPI and TCPI;
- **Unplanned Work**, from its share of total hours in the Reporting Period.

**Consequences (testable):**
- **Default thresholds** (Tenant defaults, which a Project can override; an override is recorded and shown next to the indicator — founder decision, 2026-09-20):

  | Indicator | Green | Amber | Red |
  |---|---|---|---|
  | SPI or CPI | ≥ 0.95 | ≥ 0.85 and < 0.95 | < 0.85 |
  | TCPI | — | — | > 1.1, or BAC exhausted |
  | Unplanned Work share | < 10% | 10%–20% inclusive | > 20% |

- **Unplanned Work basis:** the indicator uses the Reporting Period's share, excluding Opening Balances. The cumulative share is shown next to it.
- **TCPI rule:** Effort/Cost is red if the TCPI threshold is crossed, whatever the CPI. TCPI > 1.1 means the remaining work must be done more than 10% more efficiently than planned, which the references treat as a red flag. The current CPI is shown next to TCPI for comparison.
- **Milestone slip, actual:** Schedule is at least amber when any Milestone is past its Baseline date and has no actual finish — which is what "not done" means (§3, FR-5) — whatever the SPI.
- **Milestone slip, forecast:** Schedule is at least amber when a Milestone's **derived** date (FR-6b) is later than its Baseline date, even though that date has not yet passed. This is a deliberate R0 decision, not an oversight left for later: the scheduler knows about the slip before the date arrives, and an indicator that waits for the date to pass is worth less than the engine that computed it. The indicator names which of the two rules fired.
- **Negative Float:** Schedule is red when the Project's minimum Float is negative — the plan cannot meet a **Project finish** the PM set (FR-6b, FR-43) — whatever the SPI. Where no Project finish is set, Float is relative, this rule cannot fire, and the indicator says so rather than implying the plan is safe.
- **Constraint violation:** Schedule is at least amber when any *must finish on* constraint is unmet, and **red** when the unmet constraint belongs to a Milestone. This is a separate rule from negative Float on purpose: a violation stays on its own WP and never makes Float negative elsewhere (FR-6b), so without this rule a missed contractual date could sit outside every indicator. The indicator names the worst violation and how many working days late it is.
- **Overall status:** the worst of the three indicators. It is never green while Schedule is red, even when CPI > 1 (pmi-techniques v2).
- **Late in a project:** SPI converges to 1, so SV and both finish dates from FR-32 — the computed finish and the trend finish — are always shown next to it.
- **Transparency:** the rule behind each colour is shown next to it.

#### FR-32: Forecast — *R0*

The system shows the forecast effort at completion and, next to it, the two finish dates the product can produce.

**Consequences (testable):**
- The effort forecast is the EAC from the Project's selected EAC Method, so it includes Unplanned Work.
- **Two finish dates exist, and both are shown, together and labelled.** They answer different questions and they will disagree:
  - the **computed finish** — the Project's derived finish from FR-6b, computed from the real dependency graph, the Data Date and the remaining durations. It is the same quantity §3 and FR-6b name, under the same name and no other: this PRD has two finish dates the scheduler touches, the *Project finish* the PM set and the *computed finish*, and a third label for either of them would be a third date to a reader. This is the plan's own answer, it is the one the Schedule Health Indicator uses (FR-31), and it is the one behind the dates on the schedule Client Viewers see when the schedule is published (FR-34);
  - the **trend finish** = Baseline start + (Baseline duration in working days ÷ SPI) — what the date becomes if the remaining plan keeps running at the efficiency observed so far. While EV < BAC it is never earlier than the next working day after the as-of date. When SPI is 0 or unavailable, no trend finish is shown.
- **Terms and rounding:** "Baseline start" is the Project start pinned in the active Baseline (FR-43), and "Baseline duration" is the working days from it to the Baseline's latest finish. The division is evaluated in whole working days and rounded up, so the figure stays inside NFR-C1's integer discipline and cannot drift between recomputations.
- The UI labels the trend finish as a simple trend heuristic, not a PMI formula, and labels the computed finish as the scheduler's output. **Where the two disagree, the UI says so and shows the gap**, because that gap is a real signal about the plan and hiding it would be the dishonest kind of simplification this product exists to avoid.
- A probabilistic forecast with drivers is Post-Q1.

#### FR-33: Department and Program roll-up — *Post-Q1*

A PM or Internal Viewer can see planned and actual effort, cost and Unplanned Work rolled up by Program, and actual effort, cost and Unplanned Work by Department. Realises UJ-5.

**Consequences (testable):**
- **Program roll-up:** full EVM, recomputed from summed values.
  - Program EAC is the sum of the Projects' EACs. If the Projects use different EAC Methods, the sum is marked "mixed methods".
  - Projects in Ticket-Count Mode are left out of AC-based Program metrics and listed as excluded.
- **Department roll-up:** actual effort and cost by each Resource's home Department across Projects, which is capacity consumption. It shows no Department CPI, because EV and PV belong to the Project's owning Department, not to the person's home Department.
- **Totals match:** Department totals, including the *Unattributed* line, equal Project totals for the same period.

### 4.11 Publishing and Client View

**Description:** Visibility is honest but mediated by the PM. Client Viewers see only what the PM publishes, and only in effort hours. The Health Indicators they see always include Unplanned Work. The defaults follow the rules decided in the brief, as interpreted in §13. Realises UJ-3, UJ-4 and UJ-6.

#### FR-34: Visibility Policy — *R1*

A PM configures, per Project, which sections Client Viewers see.

**Consequences (testable):**
- **Shown by default:**
  - Health Indicators, including the Unplanned Work indicator as a share and in hours;
  - the PM's *Explain* notes, only where the PM attached one;
  - milestones;
  - the schedule, as a Gantt to WBS level 2.
- **Optional, off by default:** the Unplanned Work breakdown by group, EVM detail, forecast, Change Request candidates, and client-visible Risks.
- **Never shown:** money, Rates, named staffing, person-level actuals, Tracker Account names, Ticket content, and internal Risks or Issues.
- **Health Indicators always count Unplanned Work.** Hiding the breakdown hides only the detail, not its effect on the Health Indicators.
- **Plain statement:** the Client View states that Unplanned Work carries effort but no earned value.
- **Audit:** every change to the Visibility Policy is recorded in the audit trail.

#### FR-35: Publish — *R1*

A PM can preview exactly what Client Viewers will see, then publish it as a Published Snapshot.

**Consequences (testable):**
- **Immutable and reproducible:** a Published Snapshot stores:
  - the computed values it displays, **including every derived date, Float and critical-path marking on the schedule it shows**;
  - the Tracker Snapshot, Baseline version, attribution and Visibility Policy it was computed from;
  - **the scheduling inputs that schedule was derived from**: the dependency graph with its lags, and per WP the duration, constraint, milestone flag, actual start, actual finish and Percent Complete, together with the Project start, Project finish, Data Date (FR-43) and Holiday Calendar version (FR-14) in force at publish time;
  - any Percent Complete overrides in force;
  - the Health thresholds, the EAC Method, the Reporting Period boundaries and time zone, and the formula version.
- **Reproduction test:** recomputing a Published Snapshot from its stored inputs and the Actuals Ledger reproduces every displayed figure exactly, **the schedule included** — re-running FR-6b over the snapshot's pinned scheduling inputs reproduces every date it displayed, however far the Current Plan has moved since. A duration edit made on Friday does not change the Gantt published on Thursday. Derived dates are the most volatile thing on the page, so this is where the pinning doctrine matters most.
- **Stale data warning:** if the latest Tracker Snapshot is more than 24 hours old at publish time, the system warns and offers a refresh.
- **Corrections:** a correction is published as a new version, marked as superseding the earlier one, with a reason. Client Viewers see the correction. The superseded version stays visible to them, marked "superseded" with the reason.
- **Retraction:** the PM can retract a snapshot with a reason, which hides it from Client Viewers. Client Viewers who had opened it are notified by email, with the reason.
- **History:** retracted and superseded snapshots stay in the audit history.

#### FR-36: Client View — *R1*

A Client Viewer can open the Published Snapshots of their Projects in English or Japanese.

**Consequences (testable):**
- The latest Published Snapshot is the landing page.
- Client Viewers get an email in their language when a new snapshot is published. The email holds a link and no figures. They can opt out.
- The system records when each Client Viewer opens each snapshot, and the PM can see this. The Client View tells viewers that views are recorded.

#### FR-37: Risks and Issues — *R1*

A PM can record Risks and Issues on a Project and on its WPs. Each item is internal by default. The PM can mark individual items as client-visible.

**Consequences (testable):**
- Internal Risks and Issues never appear in any Published Snapshot or client export.
- Client-visible Risks appear only when the Risks section of the Visibility Policy is on.

### 4.12 Export

#### FR-38: xlsx report export — *R0: fixed layout of the current PM view; R1: Published Snapshot export and Risks; Post-Q1: the PM's own template*

A PM can export an xlsx report. It contains EVM Metrics, Health Indicators, Unplanned Work, the forecast, milestones and the WP table.
- In R0 the PM exports the current PM view.
- From R1 the PM can also export a Published Snapshot, and the report includes Risks.

**Consequences (testable):**
- **Client-safe exports:** an export of a Published Snapshot contains only what its Visibility Policy allowed.
- **Formula injection:** text values that begin with `=`, `+`, `-` or `@` are escaped, so no formula can be injected.
- **Templates (Post-Q1):** the PM binds named ranges in their own template. Formatting, other sheets and formulas are preserved.
- **Template acceptance (Post-Q1):** tested on 3 real client report templates from the founder's projects.

#### FR-39: Raw data export — *R0*

A PM can export the following as xlsx or CSV:
- the Plan, **with every scheduling input**: per WP the duration, constraint type and date, milestone flag, derived dates, actual dates and Percent Complete, plus the Project's complete dependency graph with its lags;
- the Project start, Project finish and Data Date, with their history (FR-43);
- the Holiday Calendar and its version history (FR-14);
- Baseline versions, each with the scheduling inputs it pinned (FR-15);
- Mapping history;
- the Actuals Ledger;
- Ticket status, estimate and actual hours for each retained Tracker Snapshot;
- Percent Complete overrides;
- Rate history and Project default Rates;
- Health threshold and EAC Method history;
- the stored inputs of each Published Snapshot (from R1).

**Consequences (testable):**
- For a given as-of date, the export contains enough data to recompute every EVM Metric outside the tool (no lock-in).
- **The plan leaves too, not just the numbers.** The export contains enough to re-derive the schedule outside the tool — the graph, the durations, the constraints, the actual dates, the progress, the calendar version and the Data Date — so a PM leaving momo-keikaku takes a working plan rather than a picture of one. This is the claim an Excel refugee will actually test, and it is the stronger half of the no-lock-in promise.

### 4.13 Seats

#### FR-40: PM Seat accounting — *R1*

A Tenant Admin can see and manage PM Seats. Only the PM role consumes a seat (research R5).

**Consequences (testable):**
- Viewers, Tracker Accounts and offshore Tracker users never change the seat count.
- v1 has no payment integration. The operator sets seats. Pricing is still to be decided (OQ-4).

## 5. Cross-Cutting NFRs

- **NFR-S1 Tenant isolation.** Enforced in the data layer and tested automatically (FR-1).
- **NFR-S2 Credentials.** Tracker credentials are encrypted at rest. They are never shown after entry and never logged.
- **NFR-S3 Encryption.** TLS 1.2 or later in transit, and encryption at rest for all customer data.
- **NFR-S4 Data residency.** Customer data and backups are stored in a Japan region from R0.
- **NFR-S5 Security check sheet.** A pre-filled answer document for the Japanese security check sheet (セキュリティチェックシート) exists before the first Client Viewer is invited (R1). It covers:
  - data location;
  - encryption;
  - access control;
  - backups;
  - audit logs;
  - incident response;
  - subprocessors;
  - Connector permissions.
- **NFR-S6 Personal data.** Tracker Account names and the hours of offshore staff are personal data under Japan's APPI and Vietnam's Decree 13/2023.
  - The cross-border transfer to Japan is disclosed in the security document.
  - Only the fields in FR-19 are stored.
  - The data is deleted when the Tenant is deleted.
- **NFR-S7 Operator access.** Operator support access to a Tenant's data needs a grant from the Tenant Admin. The grant expires after a set time, and all access is logged.
- **NFR-S8 Untrusted content.** Tracker content (Ticket titles and attributes) and Excel content are treated as untrusted.
  - They are escaped wherever they are displayed.
  - Exports neutralise formula prefixes (FR-38).
  - Uploads have limits on file size and unpacked size, set during architecture. Files over the limits are rejected with a message.
- **NFR-D1 Data lifecycle.** Tenant data is kept while the Tenant is active. On request it is deleted within 30 days, and copies in backups go when those backups expire. The deletion path ships in R0 — a documented, audited operator procedure is enough, and it needs no UI (founder decision, 2026-09-20).
- **NFR-A1 Audit trail.** Every action that changes reported numbers or who can see them is logged with the actor and the time. The Tenant Admin can view the log. Logged actions:
  - publish, supersede and retract;
  - Re-baseline;
  - scheduling input changes: dependencies added, removed or re-lagged; durations; constraints; WPs created, deleted, moved or re-parented;
  - **actual start and actual finish changes**, including marking a WP complete, with the previous value and the source — typed, imported (FR-9), or accepted from a first-observed-activity proposal (FR-5). These are logged as scheduling input changes because FR-6b reads them, and because they are the only dates a human writes;
  - Project start, Project finish and Data Date changes (FR-43);
  - Holiday Calendar version changes (FR-14);
  - Visibility Policy changes;
  - Mapping and Mapping Rule changes, including Mapping changes made by rules;
  - Dispositions and *Explain* note edits;
  - Percent Complete overrides;
  - Rate and Project default Rate changes;
  - Health threshold and EAC Method changes;
  - imports and re-imports;
  - Connector scope and credential changes;
  - role changes;
  - Client Viewer invitations;
  - exports.
- **NFR-C1 Computation determinism.** Every derived number — schedule dates and float (FR-6b), ledger totals, and EVM (FR-30, FR-31) — is reproducible: the same pinned inputs always yield the same output, on any machine and at any later date.
  - Money and effort are held and computed in integers, never floating point, so a recomputed Published Snapshot cannot drift from the stored one.
  - Where an algorithm must choose between equally valid orderings, the tie-break must be explicit and written down rather than left to iteration order. **The rule itself is an architecture deliverable, not a property this PRD can assert** (OQ-13): FR-15's re-derivation test and FR-35's reproduction test both compare the critical path as an ordered set, which is precisely where an undocumented tie-break shows up as a flaky test years later.
  - Mapping, remapping and background rule evaluation change no derived date (FR-21, FR-22), so a displayed schedule is never stale against the inputs it was derived from.
  - A Baseline stores the inputs a schedule was derived from, not only the dates it produced, so any historical plan can be re-derived and explained. The pinned set is listed in full in FR-15 and includes the Holiday Calendar **version** and the Data Date: pinning a calendar by name rather than by version, or omitting the as-of boundary the forward pass ran from, is not pinning the inputs.
  - Published Snapshots pin the same set (FR-35), because the derived schedule is the most volatile thing they display.
- **NFR-R1 Snapshot reliability.** Over a month, 99% of scheduled Tracker Snapshots succeed, or are retried successfully within one interval. Failures are visible to the PM.
- **NFR-R2 Backups.** Daily backups, kept for 30 days. A restore is tested before R1. RPO is 24 hours; RTO is 1 business day.
- **NFR-P1 Performance.** Measured with 5 Projects, each with 500 WPs and 2,000 Tickets:
  - the Reconciliation Review, the plan tree grid and the Client View load in under 2 s (p75) and under 4 s (p95);
  - Plan edits save in under 500 ms (p75) and under 1 s (p95), **including the FR-6b recalculation they trigger**;
  - a full schedule recalculation of a 500-WP Project completes in under 300 ms (p95), so an edit never presents the PM with stale dates;
  - a full Tracker Snapshot of 2,000 Tickets is read and written to the ledger within 5 minutes.
- **NFR-I1 Internationalisation.** All text is externalised in English and Japanese. Full-width and half-width Japanese characters display correctly. Text sorts by Unicode code point after NFKC width normalisation, so full-width and half-width forms sort together.
- **NFR-U1 Accessibility.** WCAG 2.1 AA for contrast and keyboard access. Health Indicators never rely on colour alone.
- **NFR-O1 Observability.** The operator can see Connector health, snapshot lag and import failures without reading customer data.

## 6. Risks

- **Demand is inferred, not observed.** No user in the research asked for "unmapped hours" by name. The pains users voiced are "I can't compare the plan with what happened" and the missing Baseline.
  - *Mitigation:* R0 proves the wedge on the founder's own projects before R1 starts (the gate in §8.1). SM-8 tracks whether clients act on Unplanned Work.
- **Contract politics.** Visible Unplanned Work can trigger scope disputes under 請負 contracts and billing disputes under 準委任.
  - *Mitigation:* the PM mediates every release of numbers (Reconciliation Review → Dispositions → Publish). Client Views show effort only. The first test is with one real client (OQ-3).
  - *Decision rule:* if the first 請負 client objects to Unplanned Work, the Unplanned Work indicator stays in the Health Indicators. For 請負 Projects, the Unplanned Work breakdown and Change Request candidates stay off. If the objection is to the hours figure itself, FR-34 is revisited before the next client is invited.
- **Scope versus one founder.** v1 is large for one person.
  - *Mitigation:* the R0/R1 split (§8), and the R0 scope freeze in §7.3. The brief requires scope to be cut again if a gate date slips.
  - *The date-slip rule, anchored on the sized date (2026-09-20).* This replaces the interim trigger, as that trigger's own closing line required once `bmad-sprint-planning` returned a date. **The anchor is R0 at `2027-04-14`, with an upper bound of `2027-07-06`** (§8.1).
    - **What is actually at risk is capacity, not calendar.** The date rests on a founder sustaining **40 h/week for 29.5 weeks** while remaining PM on five projects and still owing a weekly teirei report. Nothing in the plan mitigates that, so the rule watches the hours, not just the deadline. A trigger that only fires in April 2027 would give seven months of silence on the one assumption most likely to break.
    - **The one quantity that matters is `E`, estimated-hours closed per week.** Every story carries an hour estimate (OQ-12's appendix). For any period, `E = (sum of the estimates of the stories closed in it) ÷ (weeks in it)`. It needs no judgment and no separate record of hours worked — two logged facts and one division. **The plan needs `E` = 40** (1,180 ÷ 29.5 weeks). **The upper bound 2027-07-06 is 41.3 weeks out, so it needs `E` ≥ 1,180 ÷ 41.3 = 28.6.**
    - **The threshold is therefore `E` < 28.6, and nothing else.** Equivalently: at a true 40 h/week the estimates may run 40 % light before the bound is breached; at 30 h/week only 5 % light; at 25 h/week the bound is already gone at perfect estimates. *(An earlier draft of this rule set the threshold at "h/h ≥ 1.35 at 40 h/week, or any sustained 30 h/week". Both were wrong — the exact figures are 1.40 and h/h > 1.05 — which is precisely why the rule is now stated as one measured quantity against one number rather than as a table of cases.)*
    - **`E` is measured over a trailing 8-week window, never a single month.** Stories are lumpy: Epic 2 alone has four worth 36, 32, 22 and 22 hours, and a month spent 90 % through story 2.9 would score `E` = 0 on closures while a month of small closures scores well. Eight weeks is wide enough that no single story dominates it and narrow enough to still be news. A story counts in the window its last acceptance criterion passes in; nothing is counted partially, because partial credit is the judgment this rule exists to avoid.
    - **The first checkpoint is Epic 1, and it has a calendar backstop.** Epic 1 is 156 h — 13 % of R0, and in every scenario the sizing considered. At `E` = 40 it closes **2026-10-17**. Assess at its last story **or on 2026-11-15, whichever comes first**, so a slow Epic 1 cannot postpone its own checkpoint — at `E` = 20 it would otherwise not close until 2026-11-24. **If `E` < 28.6, re-derive the R0 date from the measured `E` and bring the result to §8.1 before Epic 2's migration story (2.1) is written** — 2.1 is Epic 2's first story and spends the expand/contract exemption once, so the gate sits on a seam with nothing committed past it. The founder signs the re-derived date off within one week; the build continues on Epic 1 leftovers meanwhile, not on 2.1.
    - **The monthly check, on any two consecutive months.** On the first working day of each month from 2026-11-01, the founder appends one line to §13: **the stories closed in the preceding calendar month, by ID, and the hours worked**. If **any two consecutive months both have `E` < 28.6** — a rolling pair, not a fixed tiling — the **§8.3 cut order fires at item 0**, then item 1, and each further qualifying pair thereafter takes the next item, counting only months after the one that last fired. *Rolling, because fixed pairs (Nov+Dec, then Jan+Feb) would let a bad **December + January** straddle two pairs and never fire — and year-end plus Tết is the likeliest bad pair on this calendar.* Two months, not one, because a single bad month is a holiday and not a trend. The 2026-09-20 → 10-31 ramp is reported in the first line as one period; it is diagnostic and is not half of a pair.
    - **Firing it is a signal, not a remedy — and item 1 is not free.** Items 1–6 are worth **107 net hours, 9 % of R0** (item 0 adds 18, so all seven are ~125 h — 11 %) (OQ-12's report; §8.3 lists the items, not their cost). It cannot absorb a capacity shortfall of any size. Worse, **item 1 deletes every milestone target date**, because §3 defines a milestone's target *as* a *must finish on* constraint: FR-31's two milestone rules, FR-9's milestone import and FR-7's milestone column all lose their input. The cheapest rescue is a milestone-only deadline flag, which **no FR states and which therefore needs `bmad-correct-course`** — so the cheapest cut is the one that reopens the governance gate. Before firing item 1, cut OQ-11's **Comfort rows first** (~18 h, no FR behaviour lost, no gate). What the trigger is really for is to say early and in writing that R0 needs the decision declined on 2026-09-20: reduce the §8.1 list materially, which §7.3 permits without a correct-course pass.
- **Import accuracy.** A misread WBS corrupts every number downstream.
  - *Mitigation:* the mandatory Import Preview, the acceptance corpus (FR-9), and deferring AI interpretation to Post-Q1.
- **Thin moat.** Engineering-intelligence vendors, Crowd Log (クラウドログ) or Lychee Redmine could add a similar view.
  - *Mitigation:* speed to a proven wedge, the four-piece combination (§1.2), and the competitive checks in OQ-1 and OQ-7. **This mitigation weakened on 2026-09-20** when R0 grew by the scheduler and its date was withdrawn. **It weakened again on 2026-09-20's sizing**, which put R0 at 2027-04-14 and withdrew R1's date entirely (§8.1, §8.2): the 2027-01-01 Backlog repricing — the moment this mitigation was timed to — now falls while R0 is still being built, with nothing client-facing to meet it. Speed is no longer defended at any dated event, and this mitigation is carried as weakened rather than restated. What remains is the four-piece combination and the competitive checks. Speed was previously claimed at R1 and at the repricing, not at an R0 date that faces no customer.
- **Backlog churn.** Teams leaving Backlog after the repricing could shrink the beachhead.
  - *Mitigation:* the Jira Connector (Post-Q1) is the hedge. OQ-9 tracks where teams leaving Backlog go.

## 7. Constraints and Guardrails

### 7.1 Framing

- Divergence and Unplanned Work are shown as information about how accurate the plan is, never as a judgement of individuals. This follows research cross-insight 5 and the surveillance stigma attached to engineering-intelligence tools.
- Product copy never leads with "sync" or "actuals import". The headline is Unplanned Work measured against a real Baseline (research R1).

### 7.2 Trust boundaries

- Connectors are strictly read-only. The offshore team's workflow never changes.
- Nothing is committed from an import without PM confirmation. No AI is used in R0 or R1.
- Client-facing Health Indicators always include Unplanned Work. The PM controls how it is presented (notes, level of detail), not whether it counts.
- Client Viewers see effort hours only. Money and Rates never leave PM and internal views. This keeps the vendor's cost structure and margin private.

### 7.3 R0 scope is closed

**R0 scope is frozen as of 2026-09-20.** The list in §8.1 is complete. Any further **addition** to R0 — a new requirement, a new capability, or a "while we are here" — must go through `bmad-correct-course` and produce a sprint change proposal the founder approves, exactly as the scheduler did on 2026-09-20.

**What the freeze does not block.** A freeze that stopped the downstream skills from finishing work R0 already owns would be a freeze on delivery, not on scope — and it would contradict this PRD's own briefs, which hand `bmad-ux` and `bmad-architecture` questions they cannot answer without designing something (OQ-11, OQ-13). The line is therefore drawn between *resolving* and *adding*:

| | Needs no correct-course pass | Needs a correct-course pass |
|---|---|---|
| `bmad-ux` | Designing the surface FR-6a, FR-6b and FR-7 already require — including the answer to what the PM sees when one edit moves a hundred dates, and how a violation, an out-of-sequence link or negative Float is explained. Deciding *how* is the job; the cost of *what* is already in R0. | Any new screen, field, state or capability not required by an R0 FR. Wanting a Gantt in R0 is an addition (FR-7 puts it in R1). |
| `bmad-architecture` | Choosing the tie-break rule (OQ-13), the recalculation trigger mechanics, the schema and the migration — every decision an R0 FR already implies. | Any new FR, NFR or non-functional target beyond §5. |
| `bmad-create-epics-and-stories` | Decomposing the frozen §8.1 list; writing acceptance criteria that restate an FR's stated consequences. | An acceptance criterion that asserts behaviour no FR states. |
| `bmad-sprint-planning` | Sizing, and **cutting** (§8.3). | — |

An open question this PRD already owns is resolved by its named owner and written back into the PRD; that is not a scope addition. A requirement nobody wrote down is. Where a downstream session cannot tell which it is holding, it says so and asks, rather than assuming either.

*Why this is a guardrail and not a note.* On 2026-09-20 R0 grew three times in one morning: the scheduler (FR-6a, FR-6b); then two constraint types beyond the ASAP-only boundary the founder had approved (§13); then the progress-aware scheduling, Project schedule settings and calendar versioning those two made necessary (FR-43, FR-14). In the same morning the 2026-12-15 target was withdrawn, which removed §6's only scope-control trigger. Growth with the brake removed is how a solo v1 becomes an eighteen-month v1. The correct-course gate is the brake. **It does not come off.** An earlier draft of this sentence said it "stays on until `bmad-sprint-planning` has returned a date and a verdict against the frozen list (OQ-12)" — that condition was met on 2026-09-20, and read literally the freeze would have lapsed at the exact moment sizing showed R0 to be 1,180 hours and roughly five times over the date then implied. That is when scope control matters most, not least. **The "until" was a drafting error against §13's F-1 decision**, which froze R0 with no expiry, and it is removed: additions still need a correct-course pass, and cuts still need none.

This guardrail binds this PRD and every session downstream of it. It does not restrict *cutting* R0: the cut order in §8.3 stays available without a correct-course pass, and so does anything that reduces scope.

*How it is enforced, given that the reviewer is also the founder.* A norm with no artifact behind it is a wish. So: **every downstream artifact produced against this PRD opens with one line naming which column of the table above its output sits in** — "resolves OQ-n / decomposes FR-n", or "adds: correct-course proposal attached". A session that cannot write that line has found a scope addition. This does not make the brake automatic; it makes skipping it a visible omission in a file rather than a decision nobody recorded.

## 8. MVP Scope and Releases

### 8.1 R0 — founder-only (target 2027-04-14)

> **The target is `2027-04-14`, range 2027-02-12 … 2027-07-06.** The withdrawn 2026-12-15 date was set on 2026-09-19 with no estimate behind it, and R0 then grew by the scheduler (FR-6a, FR-6b). `bmad-sprint-planning` sized R0 on 2026-09-20 at **1,180 hours across 70 stories** (826–1,652) and returned this date against a founder capacity of **40 hours a week** (OQ-10, reclosed 2026-09-20). Working: `planning-artifacts/oq12-sprint-planning-2026-09-20.md`.
>
> **Read the date as "mid-April with a tail to July", not as a commitment.** The 1,180 h figure assumes focused hours. Sustained 40 h/week solo for **29.5 weeks — about 6.8 months** — with no fresh-eye review and less recovery, makes the pessimistic 1,652 h outcome *more* likely than the optimistic one. There is no slack in it for holiday, illness or a client emergency, and the founder remains PM on five projects throughout. This is the plan's single point of failure; §6 carries the trigger that converts a slip into a decision.
>
> R0 has no external commitment attached to it — it is founder-only — so the date moving costs dogfooding time, not market position. **R1 is a different matter: its Q1 2027 date did not survive this sizing (§8.2).**

**Scope:**
- A single Tenant, with isolation built into the data model.
- Tenant Admin and PM roles. English UI.
- Column-mapping Excel import, with the mandatory preview and a diff on re-import. The import carries the plan's **progress** — actual start, actual finish and percent complete — so a mid-flight project arrives mid-flight (FR-9, FR-10).
- WP editing, the plan tree grid (the single R0 scheduling surface — FR-7), Custom Fields and Milestones.
- **Dependencies, duration and constraints, with automatic schedule recalculation, Float and the critical path to the Project finish where one is set — otherwise to the computed finish** (FR-6a, FR-6b), over a Project start, an optional Project finish and a Data Date (FR-43), so a mid-flight project is scheduled on the work that is left. *(The Project finish is optional, so the anchor must name both cases; FR-6b already did. Closes readiness finding R-4.)*
- Resources, Rates, Tracker Account linking and Holiday Calendars.
- The Baseline Ledger.
- The Backlog Connector, with snapshots, scope completeness and Ticket lifecycle handling.
- Mappings, Mapping Rules and Catch-all WPs.
- The Actuals Ledger and Ticket-Count Mode.
- The Reconciliation Review and Dispositions.
- EVM with the Typical EAC method, Health Indicators and the forecast.
- A fixed-layout xlsx export and the raw data export.
- Hosting in a Japan region.

**FRs:** 1, 2 (partial), 3 (partial), 4 (English), 5, 6a, 6b, 7 (tree grid only — the Gantt is R1), 8–17, 19–32 (FR-30 with Typical EAC only), 38 (fixed layout of the PM view), 39, 42, 43. **That is 36 entries**, counting FR-6a and FR-6b separately — the number, not an adjective, because it was the input to OQ-12's sizing, which closed on 2026-09-20 and re-affirmed all 36.

**This list is frozen (§7.3).** Additions go through `bmad-correct-course`; cuts follow §8.3.

**Re-affirmed in full against the date, 2026-09-20.** `bmad-sprint-planning` put the choice to the founder as OQ-12 required: re-affirm these 36 entries, reduce them, or raise capacity. **The founder re-affirmed all 36 and raised capacity to 40 h/week instead of cutting.** Nothing was removed, so no `bmad-correct-course` pass was needed, and **the §8.3 cut order remains available and entirely unexercised.** It is worth 9 % of R0, so it is a signal to heed rather than a remedy to rely on.

**The report's own recommendation was to REDUCE, and the founder overrode it.** That is recorded here rather than smoothed away, because the override is the decision: `bmad-sprint-planning` sized a minimum-wedge R0 at 744 h and recommended it; the founder judged the full list worth the capacity instead. The recommendation is not thereby wrong, and it remains the option §6's trigger points back to if the date slips.

**Beyond the brief:** full Custom Fields, the re-import diff, the raw data export and two sign-in methods. All four are in the cut order (§8.3).

**Gate before R1 starts:** on at least 3 of the founder's projects, the Reconciliation Review has been used for 4 consecutive weekly reports. In each of those weeks, Unplanned Work was found and given Dispositions. The founder also judges the numbers trustworthy enough to show a client.

R1 starts only after this gate passes. Build capacity is settled at 40 h/week (OQ-10, reclosed). Per-item estimates and the R0 date were **OQ-12**, owned by `bmad-sprint-planning`; it reported on 2026-09-20 and OQ-12 is closed. Every entry above is now sized, and the per-story breakdown is the appendix of OQ-12's report; `implementation-artifacts/sprint-status.yaml` tracks the same 70 stories' build status and carries no hours.

**The gate is what moves R1, and it is four weeks wide.** Because it needs four *consecutive* weekly Reviews after R0 is in founder use, the earliest possible gate pass is **2027-05-12** — R0's date plus four weeks — and R1's own build starts only after that.

### 8.2 R1 — client-facing (date withdrawn, after the §8.1 gate)

> **Q1 2027 is withdrawn.** R0's sizing on 2026-09-20 put R0 at 2027-04-14; the §8.1 gate then needs four consecutive weekly Reviews, so on the central estimate the earliest gate pass is **2027-05-12 — already Q2** — and that is *before* R1's own build begins. Q1 2027 misses by 42 days there, and by four months on the pessimistic branch.
>
> **One branch does reach Q1, and it is not a plan.** At the optimistic 826 h, R0 lands 2027-02-12 and the gate passes 2027-03-12, inside Q1 — but only if the estimate comes in 30 % under *and* 40 h/week holds without a bad week, *and* R1's own build then takes no time at all, which it does not, since R1 has never been sized. Q1 2027 therefore survives only as a best case that no part of the plan is steering for, which is not a date a PRD should carry.
>
> **This section deliberately carries no replacement date**, for the same reason §8.1 carried none between 2026-09-20 and its sizing: R1's own scope below has never been estimated. A date needs `bmad-sprint-planning` to size R1 after the §8.1 gate passes, against the capacity that is true then. Naming a quarter before that would repeat the error the 2026-12-15 target already made once.
>
> **What this costs.** §6's *thin moat* risk is the one that bites: the wedge stays unproven with a client for longer, while Swarmia sits one "planned FTE" field away from it. That risk is now carried knowingly rather than hidden behind a quarter the plan could not meet.

**Scope:**
- The Gantt (FR-7), alongside the client-facing schedule it serves (FR-34).
- The Client Viewer role, the Visibility Policy, Publish, and the Client View in English and Japanese.
- Client-visible Risks.
- xlsx export of Published Snapshots, including Risks.
- Sign-in by email magic link and by Microsoft account.
- PM Seat accounting.
- The security check sheet answer document.
- A tested restore from backup.

**FRs:** 2 (Client Viewer), 3, 4 (Japanese), 7 (the Gantt), 34–37, 38 (Published Snapshot export and Risks), 40.

### 8.3 Post-Q1 (next waves)

**Deferred from the v1 FRs:**
- AI-assisted import (FR-41).
- Nothing of the Gantt: it is R1, not Post-Q1 (FR-7, §8.2).
- The Jira Cloud Connector (FR-18).
- Template-bound xlsx export (FR-38).
- Program and Department roll-up, and the Internal Viewer role (FR-33, FR-2).
- The Atypical, Schedule-constrained and Flawed-estimate EAC methods (FR-30).
- Full Japanese coverage of the PM screens.

**Scheduling — what R0 deliberately leaves here.** R0 ships the scheduler in FR-6b. The boundary below is a decision, not an oversight: everything in it is where Microsoft Project's thirty years actually sit, and none of it is needed to make a slipped task move its dependents.

| Excluded from R0 | Why it waits |
|---|---|
| Resource levelling | NP-hard; heuristics and endless edge cases, for a problem the founder currently solves by looking |
| The SS, FF and SF dependency types, with lead | Real added complexity in both engine and UI; FS covers about 90% of real plans |
| Effort-driven scheduling (duration derived from effort ÷ assignment) | Couples scheduling to resource assignment; R0 schedules on duration |
| Cross-project and portfolio scheduling | FR-6a rejects cross-project links; in R0 one Project is one graph |
| Recovery behaviour on a violated constraint — crash, fast-track, re-plan options | R0 reports the violation, its size and the chain that caused it; choosing what to do about it is the Post-Q1 recovery-options work |
| What-if sandbox | Needs a second plan to compare against; belongs with the recovery options below |

**All three constraint types ship in R0** — *as soon as possible*, *must start on* and *must finish on* (FR-5, FR-6b). This is a deliberate expansion beyond the approved sprint change proposal, which placed the latter two in Post-Q1. It is recorded as a second reversal in §13 rather than left in an exclusion table that would have argued against the scope the PRD had just taken on, and its consequences are specified instead of discovered later: soft-constraint semantics, negative Float against a Project finish, a critical path anchored on the finish rather than on any constraint, and violation reporting that names the days late and the predecessor chain (FR-6b). Constraint types **beyond** these three — as-late-as-possible, start-no-earlier-than, standalone deadline flags — stay Post-Q1, because each further type multiplies the conflict cases the UI must explain.

**The semantics FR-6b implies are specified, not excluded.** An exclusion list is only honest if it is complete, and the expensive parts of a scheduler are semantics rather than features. Each of the following is in R0 and has a home in the requirements, so that no reader has to infer it:

| Implied by FR-6b | Where it is specified |
|---|---|
| Progress-aware scheduling, so a mid-flight plan is not re-dated | The Data Date: FR-43, and FR-6b's complete / in progress / remaining rules |
| The forward pass's origin and the backward pass's target | Project start and Project finish: FR-43, §3 |
| Constraint-conflict semantics, negative Float, and keeping a violation off other WPs' Float | FR-6b; §3 *Float* and *Critical Path* |
| Out-of-sequence progress, where an actual start precedes its predecessor's finish | FR-6b: the actual date wins, the invariant binds remaining work, the pair is flagged |
| Remaining duration on an in-progress WP | FR-6b: `duration × (1 − Percent Complete)`, from FR-30's progress and never from elapsed time |
| A producer for actual dates on a project that started before the tool saw it | FR-5 (PM-set) and FR-9/FR-10 (imported and confirmed) |
| Calendar versioning, so that pinning "the calendar" pins its contents | FR-14's dated, append-only version history |
| Recalculation scope, concurrency and cost | FR-6b: whole-Project and serialised per Project, inside NFR-P1's budget |

**New capabilities:**
- A what-if sandbox over the FR-6b scheduler.
- A cross-project load heatmap.
- A probabilistic forecast with its drivers.
- Ranked recovery options, including the 36-kyotei overtime check.
- Layered calendars, including the warning when Tết falls during a JP deadline run-up. It is cheap and very visible for exactly this user, and it is still **Post-Q1**: the 2026-09-20 note suggesting it could be pulled forward is withdrawn, because an open invitation to grow R0 sitting inside the exclusion list is the opposite of §7.3.
- pptx output.
- .mpp import, opportunistic. This overrides the .mpp part of research R2.
- Redmine and then Asana Connectors (research R4).
- Jira Data Center.
- SAML/SCIM.
- Billing automation and the paid "learns from the past" tier.
- A formal change-request workflow.
- Bill rates, and money in Client Views.

**Cut order if a gate date slips** (the brief requires cutting again). **This is the only cut order** — still one order, now seven items deep. OQ-12 used to point at item 1 rather than name a separate first cut, because two orders in one document is no order at all; that clause is struck (§12, OQ-12) now that FAIL was returned and no cut taken, but its principle is why item 0 was folded in here instead of being left to live in OQ-11.

**Sized 2026-09-20, and an item 0 added above item 1** (OQ-11, OQ-12). **The order now has seven items.** Items 1–6 are worth **107 net hours — 9 % of R0**; item 0 adds 18, so all seven come to about **125 h, 11 %**. Either way this order is a signal that R0 needs a decision, not a remedy that supplies one. Item 0 goes first because it is the only cut here that costs nothing in FRs:

0. **The plan surface's Comfort rows** (`EXPERIENCE.md` › *Build Tiers*) → Core only. Worth **~18 h**: three rows in the tree-grid story, two each in dependency editing, the What-moved band (*Undo this edit*) and the exceptions rail. **Cutting Comfort removes no FR behaviour** — what is lost is speed and discoverability — so unlike item 1 it needs no correct-course pass and deletes nothing. It sits above item 1 for exactly that reason. *`EXPERIENCE.md` still describes its Core/Comfort split as "a recommendation to `bmad-sprint-planning`, not a decision taken here"; OQ-12 took that decision, and this item is where it landed. The tier list is now normative for the cut order, and `bmad-ux` should restate it as decided.*
1. **The two extra constraint types** (*must start on*, *must finish on*) → *as soon as possible* only. This is the biggest saving per line cut: it removes negative Float, the finish-anchored critical path's harder half, soft-constraint semantics, violation display and explanation for three types, and most of OQ-11's difficult UI. Milestone targets then need a home, and the cheapest is a milestone-only deadline flag that reports slip without participating in the passes — FR-31's two milestone rules survive on it, and FR-9's milestone import writes it instead of a constraint.
2. **Float and critical-path display** (FR-6b) → keep the forward pass and automatic recalculation; drop the backward pass, the Float column and the critical-path marker. The Schedule Health Indicator loses its negative-Float rule (FR-31) and keeps both milestone rules. **Item 2 is taken only after item 1**, never before: dropping Float while the two extra constraint types are still in scope would leave constraint violations reported with no Float behind them — precisely the badge nobody reads that FR-6b argues against. Taken in this order, item 1 removes the violations and item 2 then removes only the backward pass.
3. Re-import diff → replace the whole Plan, with a confirmation.
4. Custom Fields editor → keep only the fields created by import.
5. Google sign-in → email and password only.
6. Raw data export (FR-39) → the Actuals Ledger and Mapping history only.

The wedge is never cut: FR-19–FR-32 (FR-30 with Typical EAC only), FR-34–FR-36 and FR-42.

**FR-6b's forward pass is never cut either.** Automatic recalculation is the reason the plan can live in this tool rather than in Excel; without it the Plan is a static picture and the founder keeps reconciling dates by hand. Item 2 exists because the backward pass, while cheap, is separable — recalculation is not.

**There is no "drop the Gantt" cut, because R0 has no Gantt.** The earlier cut order opened with Gantt → tree grid, which required R0 to build two complete WCAG-AA scheduling surfaces so that the cheapest cut stayed available. That is backwards: an option is only worth preserving when preserving it costs less than exercising it saves. FR-7 therefore ships the tree grid alone in R0 and moves the Gantt to R1 — the cut taken now, at full value, with the build-versus-buy decision off R0's critical path.

## 9. Non-Goals (Explicit)

- Not a replacement for Backlog or Jira. No Ticket, sprint or board management.
- Not a sync tool. It never writes to Trackers.
- Not an engineering-productivity or surveillance product. No activity metrics and no per-person ranking.
- Not an MS Project clone for enterprise PMOs.
- No automatic resource levelling, ever.
- No self-learning estimate calibration or estimate-accuracy scoring in v1. That is the future paid tier.
- No pricing per Tracker user, ever (research R5).

## 10. Success Metrics

**Primary.** SM-1 and SM-2 are measured against **R0 entering founder use (2027-04-14, §8.1)**, not against a quarter; SM-3 follows R1 and therefore has no date while R1 has none (§8.2). *Q1 2027 was the target here until 2026-09-20; OQ-12's sizing put R0 itself in Q2, so a Q1 deadline for metrics that can only be measured after adoption was arithmetically unreachable.*

- **SM-1: Reconciliation and reporting time saved.**
  - *Measure:* the founder's weekly time spent reconciling and building reports, logged for four weeks before adoption (during the R0 build) and four weeks after. With R0 at 2027-04-14 that second window closes about **2027-05-12** — the same four weeks the §8.1 gate needs, so one measurement serves both. **The window is anchored to adoption, not to a month**, so it moves with the date's 2027-02-12 … 2027-07-06 range instead of silently re-importing a deadline.
  - *Target:* at least 5 hours per week saved.
  - *Caveat:* a sample of one, self-reported. This is accepted for the user-zero stage.
  - *Validates:* FR-20–FR-32, FR-38.
- **SM-2: Projects live.**
  - *Measure:* Projects that have a Baseline, an active Connector, and a Reconciliation Review used in the last 14 days. From R1, a Published Snapshot in the last 14 days is also required.
  - *Target:* 5 of the founder's main projects.
  - *Validates:* FR-9–FR-17, FR-19, FR-28, FR-35.
- **SM-3: First client reads a Published Snapshot.**
  - *Measure:* at least one Client Viewer from a real client opens a Published Snapshot, and a follow-up conversation is recorded.
  - *Validates:* FR-34–FR-36.

**Secondary**
- **SM-4: Import correction effort.** Manual corrections per file in the Import Preview. Target: 5 or fewer on the acceptance corpus (FR-9). Validates FR-9–FR-11.
- **SM-5: Mapping coverage.** The share of hours on Mapped Tickets, excluding Tickets mapped to Catch-all WPs, after a Project's first two weeks. Target: at least 80%. Validates FR-21–FR-23.
- **SM-6: Snapshot freshness.** The median age of the latest Tracker Snapshot at publish time. Target: under 2 hours. Validates FR-19, NFR-R1.
- **SM-7: Unplanned Work acted upon.** The share of Unmapped Work hours that have a Disposition at publish time. Hours flagged "new hours since disposition" count as not acted upon. Target: at least 90%. Validates FR-29.
- **SM-8: Demand signal.** The number of client meetings where the Unplanned Work line led to a concrete action: a Change Request discussion, a re-plan, or explicit acceptance. Target: at least 2 **within a quarter of R1 shipping** — it needs a client reading a Published Snapshot, so it cannot precede R1, whose date is withdrawn (§8.2). *Was "by the end of Q1 2027".* This tests the inferred demand (§6), and the §6 *thin moat* risk grows the longer it goes unmeasured. Validates FR-31, FR-34.

**No dated criterion for the wedge survives 2026-09-20.** SM-1 and SM-2 are anchored to R0's adoption, and SM-3 and SM-8 both require a client reading a Published Snapshot, which needs R1 — whose date is withdrawn (§8.2). So the thing the product exists to prove has no deadline attached to it any more. That is an honest consequence of the sizing rather than an oversight, and §6's *thin moat* risk is where it is carried.

**Counter-metrics (do not optimise)**
- **SM-C1: Catch-all share of total hours.** It must not rise while Unplanned Work falls. Counterbalances SM-5.
- **SM-C2: Unplanned Work share itself.** Success means Unplanned Work is visible and explained, not that it is small. Counterbalances SM-7.
- **SM-C3: Time clients spend in the Client View.** A trusted two-minute read is the goal. Counterbalances SM-3.
- **SM-C4: Share of EV that comes from PM Percent Complete overrides.** A rising share means the numbers are being steered. Counterbalances SM-2 and FR-31.

## 11. Research Recommendations — Traceability

| Research rec | How this PRD applies it |
|---|---|
| R1: position on the unmapped-work ledger plus a separate Baseline; sync is never the headline | Vision, §1.2, §7.1; FR-15, FR-16, FR-20, FR-25–FR-31, FR-42. Medium confidence until the Tempo and Jellyfish checks in OQ-7 |
| R2: Backlog beachhead, timed to the repricing | §1.1; Backlog Connector in R0. The .mpp part is overridden by the brief's locked beachhead (§8.3). **Timing lapsed 2026-09-20:** the 2027-01-01 repricing now precedes R0 (2027-04-14) and R1 has no date, so the beachhead stands but nothing is timed to that event — see §6's *thin moat* |
| R3: snapshot-delta ledger, with a fallback to Ticket counts | FR-19, FR-25, FR-27, FR-42 |
| R4: Redmine before Asana | §8.3 |
| R5: price per PM seat | FR-40, §9 |
| R6: battlecards on the missing baseline and on silent exclusion | FR-15, FR-16, FR-20. The battlecard material itself is outside this PRD. Several R6 facts are due for re-check (OQ-7) |
| R7: quarterly watch of LinearB, Swarmia and Jellyfish | OQ-7 |

## 12. Open Questions

1. **OQ-1 Direct competitors.** Does Crowd Log (クラウドログ) connect to Backlog or Jira and flag unplanned work? Does Lychee Redmine's EVM now read other trackers?
   - *Owner:* founder.
   - *Resolve by:* before public positioning (R1).
2. **OQ-2 Backlog hours on the five target projects.** Does each project's space expose actual hours, and what share of Tickets actually have hours filled in? Which post-2027-01-01 plan (Economy, Business or Professional) will each space be on, and does that plan still expose hours? The answer decides how much of R0 and R1 runs in Ticket-Count Mode. Run hours detection (FR-17) again after 2027-01-01.
   - *Owner:* founder.
   - *Resolve by:* before `bmad-architecture`.
3. **OQ-3 First client test.** Contract Type decided 2026-09-20: a 準委任/labo engagement goes first. Still open: which client, and what the first *Explain* notes will say.
   - *Owner:* founder.
   - *Resolve by:* before the first publish.
4. **OQ-4 Pricing.** Seat price and free-tier limits.
   - *Owner:* founder.
   - *Resolve by:* before any external PM onboards.
5. **OQ-5 AI provider.** The AI provider and its data terms for FR-41.
   - *Owner:* founder.
   - *Resolve by:* Post-Q1, before FR-41 is built.
6. **OQ-6 Reporting cadence.** ~~Weekly only, or do some clients need biweekly or monthly Periods?~~ **Closed 2026-09-20:** some clients report biweekly or monthly, so the Reporting Period length is per Project from R0 (§3 Glossary).
7. **OQ-7 Competitive watch.**
   - *Owner:* founder.
   - Re-check the "nobody does this" claim. *Resolve by:* 2026-12-01, and again after 2027-01-01.
   - Check the LinearB, Swarmia and Jellyfish changelogs (research R7). *Resolve by:* quarterly.
   - Re-verify the stale research R6 facts before they appear in any battlecard: that Jira Plans has no baselines, and that Tempo drops worklogs outside its filter. BigPicture Enterprise does have baselines, so battlecards must not claim that Jira-side tools have none. *Resolve by:* before public positioning (R1).
   - Run a one-hour Tempo trial and a Jellyfish demo. Either could overturn research R1. *Resolve by:* before public positioning (R1).
8. **OQ-8 Client sign-in policy.** Will Japanese client IT allow magic-link email, or will it require Microsoft sign-in only?
   - *Owner:* founder.
   - *Resolve by:* before R1.
9. **OQ-9 Market movement.** Where are teams leaving Backlog going? Which tracker dominates in Vietnamese offshore firms that serve Japan?
   - *Owner:* founder.
   - *Resolve by:* revisit after 2027-01-01.
10. ~~**OQ-10 Build capacity.**~~ **Reclosed 2026-09-20 at 40 hours per week.** First closed the same day at "20+ hours per week"; that figure is **superseded**. When `bmad-sprint-planning` sized R0 at 1,180 h, the founder chose to raise capacity rather than cut the §8.1 list — the full §8.3 cut order is worth 9 % of R0 and doubling capacity is worth 50 %, so it was the only lever large enough. **This is now the plan's single point of failure** and §6's date-slip rule watches it directly. The other half of the question, a per-item estimate for R0, was OQ-12 and is closed.
11. ~~**OQ-11 The plan surface is uncosted and undesigned.**~~ **Closed 2026-09-20, both halves.** The design half closed when the UX spines landed the plan surface in full (PR #3): `EXPERIENCE.md` now specifies the predecessor cell, the constraint cell, the Float and critical-path columns, the schedule strip, the What-moved band, the exceptions rail and its three explainers, and tiers every element Core or Comfort. The cost half closed with `bmad-sprint-planning`: **the FR-6b engine is 92 h and the plan surface is 98 h** — a ratio of **1.07**. The surface is not a rounding error on the engine, which is what this question asked to have settled either way. Its Comfort rows are worth ~18 h and cutting them removes no FR behaviour, which places them **above** §8.3 item 1 in any sensible cut order. *The original question is retained below for the record.*

    **The FR-6b engine is cheap**: a topological traversal with working-day arithmetic, whose correctness is expressible as table-driven tests. **Its editing surface is neither cheap nor designed** — at the time of writing, `DESIGN.md` and `EXPERIENCE.md` mentioned dependencies nowhere. R0 owes **one** surface, the tree grid (FR-7), and on it: dependency creation, editing and deletion, with rejection errors that name the cycle or the ancestor/descendant pair (FR-6a); derived dates, actual dates, progress, Float and the critical-path marker as columns; constraint display and violation explanation for three constraint types, including days late and the chain behind it; out-of-sequence links; negative Float; and an answer to what the PM sees when one edit moves a hundred dates. All of it sits under **NFR-U1**'s WCAG 2.1 AA keyboard access. The Gantt, and with it the build-versus-buy decision for a Gantt component, moved to R1 on 2026-09-20 precisely so that this question is asked once rather than twice. **This PRD deliberately does not invent the design.**
    - *Owner:* `bmad-ux` for the design; `bmad-sprint-planning` for the cost.
    - *Not a scope addition:* designing what FR-6a, FR-6b and FR-7 already require is `bmad-ux`'s job and needs no correct-course pass (§7.3). Adding anything those FRs do not require does.
    - *Sizing:* OQ-12 must size the plan surface as **its own line item**, separately from the engine. The engine being cheap is the reason the surface keeps being costed as though it were.
    - *Resolve by:* before any story that touches the plan surface is estimated.
12. ~~**OQ-12 R0 is unsized.**~~ **Closed 2026-09-20 — see the closure note below. The paragraph that follows is the question as it stood; its present tense ("R0 is unsized", "No Epics or Stories exist", "at 20+ hours a week") describes 2026-09-19 and is false now: 8 epics and 70 stories exist, every one is sized, and capacity is 40 h/week.** R0 is **36 FR entries** (§8.1) plus a scheduler and its UI: Excel import against a ten-file acceptance corpus, a Backlog connector with snapshot scheduling and lifecycle handling, an append-only ledger, EVM with PMI formulas, health indicators, a forecast, two export formats, the plan tree grid, custom fields, resources, rates, calendars and baselines. At 20+ hours a week, solo. **No Epics or Stories exist**, so no per-item estimate exists for any of it, and the date that would have exposed a mismatch was withdrawn on the same morning the scope grew (§8.1, §6). This is recorded as a gap; this PRD does not guess at estimates.
    - *Owner:* `bmad-sprint-planning`, after `bmad-create-epics-and-stories`.
    - *Required outputs:* (a) a date for §8.1; (b) an explicit re-affirmation or reduction of the frozen §8.1 list against that date; (c) a verdict; (d) a separate figure for the plan surface (OQ-11). ~~If the verdict is CONCERNS or FAIL, the first cut is **item 1 of the §8.3 cut order**~~ — **this clause did not survive contact with the answer.** The verdict was FAIL and **no cut was taken.** Item 1 was the first cut considered, as written; it was then measured at 36 net hours against a shortfall of roughly five times, so cutting it would have changed the date by under a week while deleting every milestone target date. The founder raised capacity instead. **The clause presumed a cut could close whatever gap the verdict found, and it cannot** — it is superseded by the 2026-09-20 decision block in §13, and the cut order remains available and unexercised.
    - *Resolve by:* before step 7 (build) of `sprint-change-proposal-2026-09-20.md` starts.
    - **CLOSED 2026-09-20.** `planning-artifacts/oq12-sprint-planning-2026-09-20.md`, with a per-story hour table in its appendix and build status for the same 8 epics / 70 stories in `implementation-artifacts/sprint-status.yaml`. All four outputs delivered: **(a)** `2027-04-14`, range 2027-02-12 … 2027-07-06, against **1,180 h** (826–1,652). **(b) re-affirmed in full** — the founder raised capacity to 40 h/week instead of cutting, so nothing was removed and no correct-course pass was needed. **(c) FAIL** against the dates this PRD implied that morning, on two measured findings: the implied 2026-11-30 buys **17 %** of R0 at the then-current 20 h/week — Epic 1 and 47 hours, and none of the wedge; even at the decided 40 h/week it is only 34 % — and the entire §8.3 cut order is worth **9 %**. The verdict is resolved by the capacity decision, not by anything in the plan. **(d)** engine 92 h, plan surface 98 h (see OQ-11).
    - *What it could not resolve:* **R1's Q1 2027 date**, which does not survive and is withdrawn in §8.2 pending an R1 sizing.
13. **OQ-13 The deterministic tie-break rule is asserted but unwritten.** NFR-C1 requires that where the scheduler must choose between equally valid orderings the tie-break is explicit and documented, and FR-6b says ties are broken deterministically. **No document says what the rule is.** FR-15's re-derivation test and FR-35's reproduction test both compare the critical path exactly, which is where an undocumented tie-break surfaces — as a test that passes on one machine and fails on another, years after the decision was made.
    - *Owner:* `bmad-architecture`, which writes the rule into the architecture document and makes the two tests assert against it.
    - *Not a scope addition:* the requirement already exists in NFR-C1; only its content is missing (§7.3).
    - *Resolve by:* before the first scheduler story is estimated.

## 13. Decision Log (confirmed 2026-09-19)

The founder confirmed every inference made in the draft; each is now a decision:

- The protagonists in §2.3 are illustrative.
- No SAML/SCIM and no machine translation of PM notes in v1.
- Jira is Cloud only and Post-Q1. It uses each Ticket's own time spent, fed through the same snapshot-delta ledger as Backlog.
- Tracker Snapshots are taken hourly in business hours and at least every 6 hours outside them.
- EVM is effort-based (工数). Percent Complete is based on Ticket completion (FR-30), with the 99% cap and the "low evidence" flag. PM overrides are audited. Percent Complete derived from burned effort was rejected (addendum D).
- EVM formulas follow `docs/references/`. Typical EAC is the default and the only method in R0.
- Default Health thresholds are as set in FR-31.
- The forecast is a deterministic trend.
- No payment integration in v1. Pricing is still to be decided.
- Data is stored in a Japan region from R0. RPO is 24 hours; RTO is 1 business day.
- No AI in R0 or R1.
- Client Views show effort hours only, never money.
- Client default visibility (brief addendum B): the Unplanned Work indicator, as a share and in hours, is shown by default, because it *is* the Health Indicator that the brief says includes unmapped hours. *Explain* notes appear only where the PM attached one, so they are opt-in by nature. EVM detail, the breakdown and the forecast are off by default (FR-34).
- A Program belongs to its Projects' owning Department, following the brief's hierarchy (Tenant > Department > Program > Project).
- v1 is split into R0 (founder-only, 2026-12-15) and R1 (client-facing, Q1 2027). Everything else is Post-Q1. — *Superseded 2026-09-20 on both dates: R0 is 2027-04-14 and R1's quarter is withdrawn; dependencies moved from Post-Q1 into R0 and the 2026-12-15 date was withdrawn. The split itself stands. See the 2026-09-20 entries below.*

**Added 2026-09-20, after the architecture reviewer gate and the overnight research:**
- The Reporting Period length is configurable per Project from R0 (closes OQ-6).
- Retroactive Rate corrections are handled by recomputation against pinned inputs, not by adjusting entries (FR-12).
- The Tenant deletion path ships in R0 (NFR-D1).
- Health thresholds are Tenant defaults with per-Project overrides (FR-31).
- The first client shown Unplanned Work will be a 準委任/labo engagement, because a billing conversation is easier to recover from than a 請負 scope dispute (closes OQ-3's contract-type half).
- The research R2 beachhead is overridden by the brief's: Excel WBS + Backlog, with .mpp later.
- UI languages are English and Japanese.

**Added 2026-09-20, after the scheduling review (see `sprint-change-proposal-2026-09-20.md`):**
- **Dependencies move from Post-Q1 into R0, together with automatic schedule recalculation** (FR-6a, FR-6b). This *reverses* the 2026-09-19 release-split decision, which placed "dependencies editing" in Post-Q1, and goes further than the brief's original "basic dependencies and date rollup". Reason: a status review found the product could compute no schedule at all, and the founder confirmed the destination is a real project management tool in which a slipped task moves its dependents. Recorded as a deliberate reversal, not a correction.
- **WP dates are no longer typed by the PM.** They are derived by FR-6b; a PM who wants to pin a date uses a constraint (FR-5).
- **Baselines pin scheduling inputs, not only the dates they produced** (NFR-C1), so a past plan can be re-derived and explained. This is the item that could not have been recovered later.
- **The scheduler's R0 boundary is explicit** (§8.3): no resource levelling, no SS/FF/SF, no effort-driven scheduling, no constraint types beyond ASAP / must-start-on / must-finish-on, no what-if sandbox.
- **The 2026-12-15 R0 target is withdrawn** and re-derived in `bmad-sprint-planning`. R0 faces no customer, so its date costs dogfooding time rather than market position.
- ~~**OQ-10 closed:** the founder has 20+ hours per week.~~ **Superseded later the same day: 40 hours per week** (see the sprint-planning block below).
- **Known process gap:** `brief.md` placed basic dependencies in v1 while the release split placed them in Post-Q1, and `reconcile-brief.md` did not flag the divergence. The reconciliation artifacts are left unedited as evidence about the process.

**Added 2026-09-20, after the adversarial review of the scheduling amendment (`review-scheduling-adversarial.md`):**

- **All three constraint types stay in R0** — *as soon as possible*, *must start on*, *must finish on*. This is a **second deliberate reversal**: the approved sprint change proposal put the latter two in Post-Q1, and the first amendment took them into R0 without recording the expansion. The founder confirms it and accepts the consequences, which are now specified rather than left to be met in the build: constraints are **soft**, the dependency graph wins on the dates, a violation is reported with the chain that caused it, **Float may be negative**, and **the critical path is the minimum-Float chain, not the zero-Float chain** (FR-6b, §3, §8.3). ~~If sprint planning returns CONCERNS or FAIL, these two types are the first cut considered (OQ-12).~~ **It returned FAIL on 2026-09-20 and they were considered first, as written — then kept.** Item 1 measured 36 net hours against a shortfall of about five times, and taking it would have deleted every milestone target date (§3, §6). The founder raised capacity instead, so all three constraint types stand and the cut order is unexercised. They remain item 1 if the §6 trigger fires, now behind item 0.
- **Projects carry a Data Date** (FR-43). Completed work keeps its actual dates; the forward pass schedules only remaining work, from the Data Date forward. Every one of the five target projects is mid-flight, so without this the first real import would have re-dated work already done and the critical path would have described a project that never happened. Baselines (FR-15) and Published Snapshots (FR-35) pin it, because it is a scheduling input and not a display setting.
- **Project start and Project finish are defined** (FR-43, §3). The forward pass has an origin, the backward pass has a target, and the PRD now distinguishes the contractual finish the PM sets from the computed finish wherever it matters — the choice that decides whether Float is absolute or relative.
- **Excel import no longer writes dates** (FR-9, FR-10, FR-11). An imported start/finish pair becomes a duration plus reference columns; imported dates are never silently converted into constraints; a re-import can move scheduling inputs but never a date. FR-9 can now map duration, predecessor, lag and constraint columns, which FR-6a already claimed it imported.
- **Baselines and Published Snapshots pin the schedule** (FR-15, FR-16, FR-35), with re-derivation as an automated test rather than a sentence of prose, and the Baseline comparison gained a graph diff, because a WP-by-WP diff cannot record that a link was removed.
- **The Holiday Calendar gains a dated, append-only version history** (FR-14), on the same argument that gave Rates one: pinning a calendar by name does not pin its contents.
- **Scheduling is leaf-only** (FR-5, FR-6a, FR-6b). Summary dates are a pure roll-up and are never an input, and dependencies on summary WPs or between ancestors and descendants are rejected at entry.
- **R0 scope is frozen** (§7.3). Any further R0 addition goes through `bmad-correct-course`, and the brake does **not** lapse now that a date exists — see §7.3. §6's interim trigger is replaced by the date-slip rule (2026-09-20).
- **The dependency-editing surface and the R0 estimate are open items, not decisions** (OQ-11, OQ-12), handed to `bmad-ux` and `bmad-sprint-planning`. The PRD states what the surface must carry and declines to invent the design or the numbers.
- **Pre-amendment Baselines are not comparable to later ones** — they pin dates with no inputs behind them and cannot be re-derived. This costs nothing: the build is paused, migrations are pre-production, and no real Baseline exists. It is recorded here only so that a later reader does not go looking for a migration problem that never existed.

**Added 2026-09-20, after the second adversarial review of the scheduling amendment (`review-scheduling-adversarial-2.md`):**

- **The import carries progress** (FR-9, FR-10). Actual start, actual finish and percent complete are mappable columns with the same preview-and-confirm treatment as everything else. Without them the flagship journey — UJ-1, which imports and Baselines a mid-flight project *before* any Connector exists — would arrive with every leaf marked *remaining*, and the scheduler would re-date finished work forward from the Data Date. The Data Date machinery was correct and had no fuel; this is the fuel.
- **Actual dates are PM-owned inputs, and the ledger never writes them** (FR-5, FR-21, FR-22, FR-29, FR-43, NFR-A1). A WP's actual start is no longer "the time of its first ledger entry". That date is now *first observed activity* — display-only evidence, offered as a one-click proposal. The consequence is the one the founder asked for: Mapping, remapping and hourly Mapping Rule re-evaluation change attribution and never a date, so the plan advances only when the PM advances the Data Date, and §4.2's single-writer statement is literally true rather than nearly true.
- **All three constraint types stay in R0, and the critical path is fixed by design rather than by removal** (FR-6b, §3). The backward pass anchors only on the Project finish, set or computed; never on a constraint. An unmet *must finish on* is a violation on its own WP — days late, and the chain that drove it — and propagates negative Float nowhere. Float is negative only against a Project finish the PM set. FR-31 gains a separate constraint-violation rule so a missed contractual date still reaches the Health Indicators.
- **Remaining duration comes from progress, not elapsed time** (FR-6b): `duration × (1 − Percent Complete)`, rounded up, never below one working day. Percent Complete is already computed honestly (FR-30); not using it in the one place a forecast is produced was the inconsistency.
- **R0 ships one scheduling surface** (FR-7, §8.2, §8.3, OQ-11). The tree grid is it. The Gantt moves to R1, next to the client-facing schedule it serves. Building two complete WCAG-AA editing surfaces in R0 so that the cheapest cut stayed available was paying more to keep an option than exercising it saves; the cut is taken now, at full value.
- **Out-of-sequence progress is specified** (FR-6b): an actual date always wins, the "a successor never starts before its predecessor finishes" invariant binds remaining work only, and the pair is flagged like a constraint violation. It is guaranteed to fire on the first real import, so it is not left to the build.
- **Imported milestones keep their target** (FR-9). A milestone row takes duration 0 and its imported date becomes a *must finish on* constraint — one narrow, deliberate exception to "imported dates never become constraints", written as an exception rather than discovered as a gap.
- **The whole calendar is versioned, national tables included** (FR-14), and FR-6b halts rather than guessing beyond the loaded range.
- **§7.3's freeze distinguishes resolving from adding** (§7.3, OQ-11, OQ-13). Resolving an open question R0 already owns is the owner's job and needs no correct-course pass; adding a requirement nobody wrote down does. A table names who may do what, every downstream artifact must state which side of it its output sits on, and §8.3's invitation to pull layered calendars forward is withdrawn.
- ~~**The cut trigger is a procedure, not an inference**~~ (§6): R0 in founder use by 2026-11-30 for R1 to deliver in Q1 2027; a monthly line appended to this log; the first "not yet" on or after 2026-12-01 fires the §8.3 cut order at item 1. **Superseded 2026-09-20 by the date-slip rule** in the block below, as this trigger's own closing line required once sprint planning returned a date.
- **One cut order, reconciled with OQ-12** (§8.3). The two extra constraint types are item 1; Float and critical-path display is item 2 and is never taken before item 1, because that ordering is what stops a cut leaving "a badge nobody reads". — *Amended 2026-09-20: the order gains **item 0**, the plan surface's Comfort rows (~18 h), above item 1, because cutting Comfort removes no FR behaviour while cutting item 1 deletes every milestone target date. Still one order, now seven items.*
- **Named and counted rather than approximated:** the frozen §8.1 list is 36 FR entries, not "roughly thirty" (OQ-12); "done date" is the milestone's actual finish and not a fourth date (§3); the tie-break rule NFR-C1 asserts is now an architecture deliverable (OQ-13); FR-6a's graph rules are invariants re-validated on every move, re-parent and recalculation, not entry checks (FR-5, FR-6a); a deleted leaf WP's edges are deleted and listed, never silently re-linked (FR-5); a leaf WP with no duration is excluded from the passes and blocks a Baseline (FR-6b); FR-28's cause list is closed at **seven** — the seventh, *project dates changed*, was added with FR-43's Project start/finish trigger and this line said "six" until 2026-09-20; FR-8's "no limit" is replaced by the tested bound; and SM-1 no longer carries the withdrawn R0 build dates.

### Sprint planning decision (confirmed 2026-09-20)

`bmad-sprint-planning` sized R0 and put OQ-12's choice to the founder. Working:
`planning-artifacts/oq12-sprint-planning-2026-09-20.md`.

- **R0 is 1,180 hours across 70 stories** (range 826–1,652), in 8 epics. The four largest are Epic 2's scheduler (308 h), Epic 5's Connector and ledger (240 h), Epic 6's Review (160 h) and Epic 1's substrate (156 h) — 73 % between them.
- **The §8.1 list is re-affirmed in full, and capacity rises to 40 h/week** (OQ-10 reclosed, superseding "20+"). The founder chose capacity over cutting because the arithmetic left no alternative: the entire §8.3 cut order is worth 107 net hours — **9 % of R0** — while doubling capacity is worth 50 %. **Nothing was cut, so no correct-course pass was needed and the cut order remains unexercised.**
- **The R0 target is `2027-04-14`**, range 2027-02-12 … 2027-07-06 (§8.1). The withdrawn interim anchor of 2026-11-30 would have bought 17 % of R0 at the 20 h/week then in force — Epic 1 and 47 hours, and none of the wedge — and 34 % even at 40 h/week, so the §8.1 gate could not have begun either way.
- **R1's Q1 2027 date is withdrawn** (§8.2). Capacity cannot recover it: the gate needs four consecutive weekly Reviews after R0 is in use, so the earliest gate pass is 2027-05-12, already Q2, before R1's own build. R1 carries no replacement date until it is sized, for the same reason §8.1 carried none.
- **The date-slip rule replaces the interim trigger** (§6), and watches capacity rather than only the calendar, because 40 h/week sustained for 29.5 weeks — by a founder who is still PM on five projects — is this plan's single point of failure. First checkpoint is Epic 1 (**2026-10-17** at plan velocity), then monthly stories-closed-and-hours lines appended here. The measured quantity is **`E` = estimated hours closed per week**; the plan needs 40 and the 2027-07-06 bound needs **28.6**. **Any two consecutive months both below 28.6 fire the cut order at item 0**, then item 1, and so on down the seven items.
- **OQ-11 closes, both halves.** Engine 92 h, plan surface 98 h — a ratio of 1.07. The surface was never a rounding error on the engine, which is what the question existed to settle. Its Comfort rows are ~18 h and cut without touching an FR, so they sit above §8.3 item 1.
- **The report's recommendation was REDUCE — to a 744 h minimum-wedge R0 — and the founder overrode it.** The override is the decision and is recorded as one.
- **What the report put in front of the founder before the choice**, recorded as stated rather than as accepted: the date reads *mid-April with a tail to July*, since sustained doubled load makes the pessimistic branch likelier than the optimistic one; there is no slack for holiday, illness or a client emergency; and §6's *thin moat* risk lengthens while the wedge stays unproven with a client. The founder chose with these in view; the PRD does not claim more than that.
