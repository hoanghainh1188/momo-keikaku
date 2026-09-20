---
title: momo-keikaku
status: final
created: 2026-09-19
updated: 2026-09-19
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
- **R0** is founder-only, targeted for 2026-12-15.
- **R1** is client-facing, for Q1 2027.

Every FR is tagged with the release it belongs to: R0, R1 or Post-Q1. Research recommendations are cited as "research R1"–"research R7" so they are not confused with the R0/R1 release tags. Vocabulary is anchored in the §3 Glossary. Features are grouped in §4. FR IDs are global and stable, so they are not always sequential within a section (FR-41, FR-42). Decisions confirmed during PRD creation are listed in §13. Technical approach and next-wave design detail live in `addendum.md`.

## 1. Vision

momo-keikaku is a web application for PMs and BrSEs who run Japanese client projects with offshore teams. It is the single place where a project's plan, the work actually done, and the numbers agree, and where every party can trust them.

Today the plan lives in an Excel WBS and the work lives in Backlog or Jira. Every week the PM reconciles the two by hand. The PM then rebuilds the same ahead/behind, cost, forecast and risk pages in Excel or PowerPoint. That takes five hours or more a week. Emergent work is either forced into the plan, which breaks the baseline, or silently dropped. As a result, actuals are always understated and never overstated, and estimates built on them stay wrong.

momo-keikaku reads the trackers without asking the offshore team to change anything. It keeps a persistent mapping from Work Packages to Tickets and builds an Actuals Ledger that is separate from the Baseline.

Its headline behaviour is that **Unplanned Work is measured, not dropped**. Hours spent outside the baselined plan are shown as effort and, for the PM, also as money. They appear inside the pages the client already reads: in the Health Indicators and the schedule by default, and in EVM and the forecast when the PM turns them on. The PM decides how to present them before anything is published.

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
- **The absence claim is short-lived.** The research found that nobody owns an unmapped-work ledger, but that finding is due for re-check on 2026-12-01 and again after 2027-01-01. Engineering-intelligence vendors could add a similar view cheaply (research R7). R0 therefore targets 2026-12-15 so the wedge is proven on real projects quickly. Speed of execution is part of the moat.

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
  - **Persona + context:** Linh is a BrSE/PM in Hanoi running a Japanese e-commerce client's phase 2. The client sent their own Excel WBS. It has merged cells, Japanese headers, and a custom 担当会社 (responsible company) column.
  - **Entry state:** Linh is signed in as a PM, on an empty project page.
  - **Path:**
    1. She uploads the .xlsx file.
    2. The system suggests a mapping from columns to fields, based on the headers: WBS code, name, start, finish, effort and assignee.
    3. She confirms the mapping. The extra columns become Custom Fields.
    4. The Import Preview shows every row with its level and flags problems, such as dates it could not read or assignees it does not know.
    5. She fixes one date column's format and confirms.
    6. She sets the Baseline.
  - **Climax:** the WBS appears as a tree with a Gantt view. Summary dates and effort roll up, and the Baseline is recorded.
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
- **Project** — one client engagement. It has one owning Department, one or more assigned PMs, one Plan, a Baseline history, zero or more Connectors, and one Visibility Policy.
- **Contract Type** — 請負 (fixed-scope) or 準委任/labo (time-and-materials or dedicated team). It is informational only in v1.
- **Plan** — the Project's WBS, a tree of Work Packages. The **Current Plan** is the living, editable version of it.
- **Work Package (WP)** — a node in the Plan. A leaf WP carries planned effort and dates. A summary WP rolls up its children.
- **Milestone** — a WP with zero duration, flagged as a milestone, with a target date and a done date.
- **Baseline** — an immutable, versioned record, taken at a point in time, of every WP's planned dates and effort, plus the cost derived from Rates. It is stored on the **Baseline Ledger**. A **Re-baseline** is a PM action that records a new Baseline version with a mandatory reason.
- **Baseline hours** — a leaf WP's planned effort in the active Baseline. A WP with no Baseline hours is *non-baselined*.
- **BAC (Budget at Completion)** — the Project-level sum of Baseline hours over all baselined leaf WPs. Its money form sums each leaf WP's Baseline hours × the Rate in effect at the Baseline date. The hours are split equally across the WP's assigned Resources, and unassigned WPs use the Project default Rate.
- **Percent Complete** — a leaf WP's share of work done, derived from Ticket completion as defined in FR-30 and never from burned effort.
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
- **Divergence** — the differences between the Baseline, the Current Plan and actuals, per WP.
- **EVM Metrics** — PV, EV, AC, SV, SPI, CV, CPI, EAC, ETC, VAC and TCPI, as defined in FR-30. They are measured in effort hours (工数). Money is a derived layer shown only in PM and internal views.
- **Health Indicator** — a computed green, amber or red status for Schedule, Effort/Cost, or Unplanned Work. The **overall status** combines the three (FR-31).
- **Visibility Policy** — the per-Project configuration of what Client Viewers see.
- **Published Snapshot** — an immutable, reproducible, PM-approved copy of a Project's client-facing report. It is the only thing Client Viewers see.
- **Client View** — what a Client Viewer sees: the Published Snapshots of their Projects (FR-36).
- **Risk / Issue** — an item the PM records on a Project or WP (FR-37). It is internal by default, and the PM can mark it client-visible.
- **Import Preview** — the mandatory confirmation screen for every Excel import.
- **Custom Field** — a WP field defined by the user.
- **Holiday Calendar** — non-working days: JP and VN national holidays plus days off specific to the Project.
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

### 4.2 Plan (WBS) Authoring

**Description:** The PM builds a Plan either by importing it (4.3) or by creating it in the tool. The PM keeps it current by editing it or re-importing it. v1 has no automatic rescheduling. Realises UJ-1.

#### FR-5: Create and edit Work Packages — *R0*

A PM can create, edit, move and delete WPs. For each WP the PM sets:
- name, start date and finish date;
- planned effort in hours;
- assigned Resources;
- Custom Field values;
- the milestone flag.

**Consequences (testable):**
- **Roll-up:** summary WP dates and effort roll up from the children.
- **Deleting a WP with Mappings:** the PM must choose a target WP for those Mappings, or confirm that they become unmapped. Mapping Rules that target the deleted WP are disabled and flagged.
- **Actual dates:** a WP's actual start is the time of its first ledger entry. Its actual finish is set when the PM marks it complete.

#### FR-6: Finish-to-start dependencies — *Post-Q1*

A PM can add finish-to-start dependencies with a lag in working days.

**Consequences (testable):**
- Cycles are rejected.
- A violated dependency is flagged. The schedule is not recalculated automatically.

#### FR-7: Tree and Gantt views — *R0*

A PM can view the Plan as a tree grid and as a Gantt. The Gantt shows the active Baseline's bars next to the Current Plan's bars, with non-working days shaded.

**Consequences (testable):**
- The views meet NFR-P1.

#### FR-8: Custom Fields — *R0*

A PM can define Custom Fields of type text, number, date or single-select. They can be used as columns and grouping axes.

**Consequences (testable):**
- The product sets no limit on the number of Custom Fields. A Project with 100 Custom Fields still meets NFR-P1.

### 4.3 Excel Import

**Description:** The PM uploads an Excel WBS.
- In R0, the PM maps columns to fields, with suggestions based on the headers.
- AI interpretation of arbitrary layouts comes Post-Q1.

In every release, nothing is committed until the PM confirms the mandatory Import Preview. A misread WBS corrupts every number downstream. Realises UJ-1.

#### FR-9: Upload and column mapping — *R0*

A PM can:
- upload an .xlsx file;
- choose the sheet and the header row;
- map each column to a field: WBS code or indentation level, name, start, finish, effort, assignee, milestone, or a Custom Field.

The system suggests mappings by matching English and Japanese headers.

**Consequences (testable):**
- **Hierarchy:** read from WBS codes (1, 1.1, 1.1.1) or from indentation.
- **Dates:** the Western and Japanese forms used in the founder's files are parsed, for example 2026/10/01 and 10月1日.
- **Merged cells:** unmerged, with each cell taking the merged value.
- **Acceptance corpus:** at least 10 real WBS files from the founder's projects. For each file, 100% of rows land at the correct level with 5 or fewer manual corrections in the preview.

#### FR-10: Mandatory Import Preview — *R0*

Before anything is committed, the PM sees every row as it will be imported, with its level, its values and any flagged problems. The PM can correct values, levels and column mappings.

**Consequences (testable):**
- **Confirmation:** no code path commits an import without an explicit PM confirmation.
- **Unknown assignees:** assignees that do not match a Resource are listed. The PM creates or links a Resource for each one.
- **Counts:** the preview reports rows read, rows imported and rows skipped, with a reason for each skipped row.
- **Untrusted content:** cell content is treated as untrusted. Formulas and macros are never executed, and text is escaped wherever it is displayed.

#### FR-11: Re-import with diff — *R0*

A PM can import a new version of the file into an existing Plan and review a diff that shows added, changed and removed WPs.

**Consequences (testable):**
- **Matching WPs:** WPs are matched by WBS code. Without a code, they are matched by name within the same parent. Pairs that cannot be matched are shown for the PM to resolve.
- **Conflicts:** for imported fields, the re-imported value wins. The diff lists every value that overwrites an edit made in the tool.
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
- The calendar data covers 2026–2028.
- All working-day calculations exclude the Project's non-working days.

**Out of Scope:** layered client, department and person calendars (Post-Q1).

### 4.5 Baseline Management

**Description:** The Baseline and the actuals live on separate ledgers. A Baseline is never edited. Plan changes go to the Current Plan. The Baseline moves only through an explicit, reasoned Re-baseline (research R6).

#### FR-15: Set Baseline — *R0*

A PM can set a Baseline from the Current Plan.

**Consequences (testable):**
- A Baseline cannot be edited after it is recorded.
- Before the first Baseline, the Project shows a "no baseline yet" state instead of EVM Metrics.

#### FR-16: Re-baseline with history — *R0*

A PM can Re-baseline. A reason is mandatory, and the PM can link Change Request candidates.

**Consequences (testable):**
- Every Baseline version is kept, with its author, time and reason.
- Any two versions can be compared WP by WP.
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
- **No rewriting:** the ledger itself is never rewritten. Attribution is computed from the ledger and the Mapping history.
- **Published Snapshots:** they freeze the attribution in force when they were published (FR-35).
- **Audit:** every Mapping change is recorded with its author and time (NFR-A1).

#### FR-22: Mapping Rules — *R0*

A PM can define Mapping Rules on Ticket attributes, in priority order:
- **Backlog:** milestone, category, issue type, parent issue, key pattern.
- **Jira:** epic or parent, label, component, fix version, issue type, key pattern.

**Consequences (testable):**
- **Rules are live:** on every Tracker Snapshot, each Ticket without a manual Mapping is re-evaluated against the rules in priority order.
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
- Unmapped Work is grouped by Tracker attribute and can be expanded to individual Tickets, with hours (and money, in PM views).
- Every number links to the Tickets or WPs behind it.
- The Contract Type is shown next to Unplanned Work.

#### FR-29: Dispositions — *R0*

A PM can record a Disposition for any Unmapped Ticket or group of them.

**Consequences (testable):**
- ***Map*** creates Mappings. Because attribution follows FR-21, those hours leave Unplanned Work.
- ***Plan*** creates a WP in the Current Plan and maps the Tickets to it. Its hours count as Unplanned Work until a Re-baseline includes that WP. Hours recorded before that Re-baseline stay Unplanned Work (FR-30).
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
- **Caps and flags:** Percent Complete is capped at 99% until the PM marks the WP complete. A WP with fewer than three Mapped Tickets is flagged "low evidence".
- **PM override:** the PM can override Percent Complete, but a reason is required. The override is written to the audit trail and marked "PM-adjusted" in the Published Snapshot. The marker is always shown to Client Viewers next to the Health Indicators it affects, and no Visibility Policy setting can hide it.
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
- **Milestone slip:** Schedule is at least amber when any Milestone is past its Baseline date and not done, whatever the SPI.
- **Overall status:** the worst of the three indicators. It is never green while Schedule is red, even when CPI > 1 (pmi-techniques v2).
- **Late in a project:** SPI converges to 1, so SV and the forecast finish date are always shown next to it.
- **Transparency:** the rule behind each colour is shown next to it.

#### FR-32: Forecast — *R0*

The system shows the forecast effort at completion and a forecast finish date.

**Consequences (testable):**
- The effort forecast is the EAC from the Project's selected EAC Method, so it includes Unplanned Work.
- Forecast finish = Baseline start + (Baseline duration in working days ÷ SPI). While EV < BAC, it is never earlier than the next working day after the as-of date. When SPI is 0 or unavailable, no forecast date is shown.
- The UI labels the forecast finish as a simple trend heuristic, not a PMI formula.
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
  - the computed values it displays;
  - the Tracker Snapshot, Baseline version, attribution and Visibility Policy it was computed from;
  - any Percent Complete overrides in force;
  - the Health thresholds, the EAC Method, the Reporting Period boundaries and time zone, and the formula version.
- **Reproduction test:** recomputing a Published Snapshot from its stored inputs and the Actuals Ledger reproduces every displayed figure exactly.
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
- the Plan;
- Baseline versions;
- Mapping history;
- the Actuals Ledger;
- Ticket status, estimate and actual hours for each retained Tracker Snapshot;
- Percent Complete overrides;
- Rate history and Project default Rates;
- Health threshold and EAC Method history;
- the stored inputs of each Published Snapshot (from R1).

**Consequences (testable):**
- For a given as-of date, the export contains enough data to recompute every EVM Metric outside the tool (no lock-in).

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
- **NFR-R1 Snapshot reliability.** Over a month, 99% of scheduled Tracker Snapshots succeed, or are retried successfully within one interval. Failures are visible to the PM.
- **NFR-R2 Backups.** Daily backups, kept for 30 days. A restore is tested before R1. RPO is 24 hours; RTO is 1 business day.
- **NFR-P1 Performance.** Measured with 5 Projects, each with 500 WPs and 2,000 Tickets:
  - the Reconciliation Review, the tree/Gantt view and the Client View load in under 2 s (p75) and under 4 s (p95);
  - Plan edits save in under 500 ms (p75) and under 1 s (p95);
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
  - *Mitigation:* the R0/R1 split (§8). The brief requires scope to be cut again if a gate date slips.
- **Import accuracy.** A misread WBS corrupts every number downstream.
  - *Mitigation:* the mandatory Import Preview, the acceptance corpus (FR-9), and deferring AI interpretation to Post-Q1.
- **Thin moat.** Engineering-intelligence vendors, Crowd Log (クラウドログ) or Lychee Redmine could add a similar view.
  - *Mitigation:* speed (R0 by 2026-12-15), the four-piece combination (§1.2), and the competitive checks in OQ-1 and OQ-7.
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

## 8. MVP Scope and Releases

### 8.1 R0 — founder-only (target 2026-12-15)

**Scope:**
- A single Tenant, with isolation built into the data model.
- Tenant Admin and PM roles. English UI.
- Column-mapping Excel import, with the mandatory preview and a diff on re-import.
- WP editing, tree and Gantt views, Custom Fields and Milestones.
- Resources, Rates, Tracker Account linking and Holiday Calendars.
- The Baseline Ledger.
- The Backlog Connector, with snapshots, scope completeness and Ticket lifecycle handling.
- Mappings, Mapping Rules and Catch-all WPs.
- The Actuals Ledger and Ticket-Count Mode.
- The Reconciliation Review and Dispositions.
- EVM with the Typical EAC method, Health Indicators and the forecast.
- A fixed-layout xlsx export and the raw data export.
- Hosting in a Japan region.

**FRs:** 1, 2 (partial), 3 (partial), 4 (English), 5, 7–17, 19–32 (FR-30 with Typical EAC only), 38 (fixed layout of the PM view), 39, 42.

**Beyond the brief:** full Custom Fields, the re-import diff, the raw data export and two sign-in methods. All four are in the cut order (§8.3).

**Gate before R1 starts:** on at least 3 of the founder's projects, the Reconciliation Review has been used for 4 consecutive weekly reports. In each of those weeks, Unplanned Work was found and given Dispositions. The founder also judges the numbers trustworthy enough to show a client.

R1 starts only after this gate passes. Build capacity and per-item estimates for R0 are tracked in OQ-10.

### 8.2 R1 — client-facing (Q1 2027, after the §8.1 gate)

**Scope:**
- The Client Viewer role, the Visibility Policy, Publish, and the Client View in English and Japanese.
- Client-visible Risks.
- xlsx export of Published Snapshots, including Risks.
- Sign-in by email magic link and by Microsoft account.
- PM Seat accounting.
- The security check sheet answer document.
- A tested restore from backup.

**FRs:** 2 (Client Viewer), 3, 4 (Japanese), 34–37, 38 (Published Snapshot export and Risks), 40.

### 8.3 Post-Q1 (next waves)

**Deferred from the v1 FRs:**
- AI-assisted import (FR-41).
- The Jira Cloud Connector (FR-18).
- Dependencies (FR-6).
- Template-bound xlsx export (FR-38).
- Program and Department roll-up, and the Internal Viewer role (FR-33, FR-2).
- The Atypical, Schedule-constrained and Flawed-estimate EAC methods (FR-30).
- Full Japanese coverage of the PM screens.

**New capabilities:**
- A scheduling engine and a what-if sandbox.
- A cross-project load heatmap.
- A probabilistic forecast with its drivers.
- Ranked recovery options, including the 36-kyotei overtime check.
- Layered calendars. `[NOTE FOR PM]` The warning when Tết falls during a JP deadline is cheap and very visible for exactly this user. It could be pulled forward.
- pptx output.
- .mpp import, opportunistic. This overrides the .mpp part of research R2.
- Redmine and then Asana Connectors (research R4).
- Jira Data Center.
- SAML/SCIM.
- Billing automation and the paid "learns from the past" tier.
- A formal change-request workflow.
- Bill rates, and money in Client Views.

**Cut order if a gate date slips** (the brief requires cutting again):
1. Gantt → a tree with date columns.
2. Re-import diff → replace the whole Plan, with a confirmation.
3. Custom Fields editor → keep only the fields created by import.
4. Google sign-in → email and password only.
5. Raw data export (FR-39) → the Actuals Ledger and Mapping history only.

The wedge is never cut: FR-19–FR-32 (FR-30 with Typical EAC only), FR-34–FR-36 and FR-42.

## 9. Non-Goals (Explicit)

- Not a replacement for Backlog or Jira. No Ticket, sprint or board management.
- Not a sync tool. It never writes to Trackers.
- Not an engineering-productivity or surveillance product. No activity metrics and no per-person ranking.
- Not an MS Project clone for enterprise PMOs.
- No automatic resource levelling, ever.
- No self-learning estimate calibration or estimate-accuracy scoring in v1. That is the future paid tier.
- No pricing per Tracker user, ever (research R5).

## 10. Success Metrics

**Primary** (all three met by the end of Q1 2027)
- **SM-1: Reconciliation and reporting time saved.**
  - *Measure:* the founder's weekly time spent reconciling and building reports, logged for four weeks before adoption (during the R0 build, October–November 2026) and four weeks after (Q1 2027).
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
- **SM-8: Demand signal.** The number of client meetings where the Unplanned Work line led to a concrete action: a Change Request discussion, a re-plan, or explicit acceptance. Target: at least 2 by the end of Q1 2027. This tests the inferred demand (§6). Validates FR-31, FR-34.

**Counter-metrics (do not optimise)**
- **SM-C1: Catch-all share of total hours.** It must not rise while Unplanned Work falls. Counterbalances SM-5.
- **SM-C2: Unplanned Work share itself.** Success means Unplanned Work is visible and explained, not that it is small. Counterbalances SM-7.
- **SM-C3: Time clients spend in the Client View.** A trusted two-minute read is the goal. Counterbalances SM-3.
- **SM-C4: Share of EV that comes from PM Percent Complete overrides.** A rising share means the numbers are being steered. Counterbalances SM-2 and FR-31.

## 11. Research Recommendations — Traceability

| Research rec | How this PRD applies it |
|---|---|
| R1: position on the unmapped-work ledger plus a separate Baseline; sync is never the headline | Vision, §1.2, §7.1; FR-15, FR-16, FR-20, FR-25–FR-31, FR-42. Medium confidence until the Tempo and Jellyfish checks in OQ-7 |
| R2: Backlog beachhead, timed to the repricing | §1.1; Backlog Connector in R0. The .mpp part is overridden by the brief's locked beachhead (§8.3) |
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
10. **OQ-10 Build capacity.** How many hours per week can the founder spend building, and what is the estimate for each R0 item? This shows whether 2026-12-15 holds and which cut-order step (§8.3) fires first.
    - *Owner:* founder.
    - *Resolve by:* before `bmad-sprint-planning`.

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
- v1 is split into R0 (founder-only, 2026-12-15) and R1 (client-facing, Q1 2027). Everything else is Post-Q1.

**Added 2026-09-20, after the architecture reviewer gate and the overnight research:**
- The Reporting Period length is configurable per Project from R0 (closes OQ-6).
- Retroactive Rate corrections are handled by recomputation against pinned inputs, not by adjusting entries (FR-12).
- The Tenant deletion path ships in R0 (NFR-D1).
- Health thresholds are Tenant defaults with per-Project overrides (FR-31).
- The first client shown Unplanned Work will be a 準委任/labo engagement, because a billing conversation is easier to recover from than a 請負 scope dispute (closes OQ-3's contract-type half).
- The research R2 beachhead is overridden by the brief's: Excel WBS + Backlog, with .mpp later.
- UI languages are English and Japanese.
