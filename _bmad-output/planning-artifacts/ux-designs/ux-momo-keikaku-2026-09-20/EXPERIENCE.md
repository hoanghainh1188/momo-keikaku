---
name: momo-keikaku
status: final
created: 2026-09-20
updated: 2026-09-20
sources:
  - {planning_artifacts}/prds/prd-momo-keikaku-2026-09-19/prd.md
  - {planning_artifacts}/prds/prd-momo-keikaku-2026-09-19/addendum.md
  - {planning_artifacts}/briefs/brief-momo-keikaku-2026-09-19/brief.md
peer: DESIGN.md
---

# momo-keikaku — Experience Spine (EXPERIENCE.md)

Peer spine: [`DESIGN.md`](DESIGN.md) owns how things look (tokens referenced here as `{path.to.token}`). This file owns how things work. The PRD is the source of truth for scope, FR behaviour and vocabulary; this spine does not restate FR consequences, it decides how they surface. Glossary terms (Work Package, Unplanned Work, Disposition, Published Snapshot …) are used exactly as in PRD §3. Items tagged [ASSUMPTION] were decided in the unattended overnight run and are logged in `.memlog.md`.

> **PRD §7.3 position — this artifact *resolves*, it does not *add*.** It designs the scheduling surface FR-6a, FR-6b, FR-7 and FR-43 already require, and closes the design half of **OQ-11**. That is the `bmad-ux` / *needs no correct-course pass* column of §7.3's table. Nothing below is a screen, field, state or capability no R0 FR requires. The Gantt stays in R1 (FR-7).

One mockup accompanies this spine: [`mockups/plan-tree-grid.html`](mockups/plan-tree-grid.html), the Plan surface on the Schedule preset, carrying the schedule strip, the What-moved band, the frozen columns, all three exception types, a negative-Float row and the critical path. Every other surface is built from these tables alone. Where the mockup and the spines disagree, the spines win.

## Foundation

- **Form factor.** Web application. PM and Tenant Admin screens are desktop-first: designed for 1280px+ and supported down to 1024px [ASSUMPTION]. The Client View (R1) is responsive and read-only down to 360px, because Tanaka-san may open it on a phone before the meeting [ASSUMPTION].
- **UI system.** No inherited visual kit. Behaviour (focus management, menus, dialogs, popovers, tabs, comboboxes) is built on an accessible headless primitive library (Radix-class); architecture confirms the library [ASSUMPTION]. `DESIGN.md` is the visual identity reference.
- **Releases.** R0 is founder-only, English UI, Tenant Admin + PM roles. R1 adds the Client Viewer, Visibility Policy, Publish, Client View (EN/JA), Risks and Issues — **and the Gantt** (FR-7). **R0 ships exactly one scheduling surface, the Plan tree grid**, so every scheduling act described below happens there and nothing is reachable only from a chart R0 does not have. Every surface below is tagged with its release; R0 builds nothing tagged R1 or Post-Q1, but R0 layouts reserve the space R1 needs (for example the Publish action slot on the Review).
- **Locale.** R0: English only, but every string is externalised and every layout is checked with Japanese strings of +30% length (NFR-I1). Dates: `19 Sep 2026` (EN) / `2026/09/19` (JA). Times always show the Project time zone (default JST).

## Information Architecture

Hierarchy: Tenant › Project › project surfaces. The project is the unit of work, and its surfaces live in a **collapsible left sidebar** (founder decision, 2026-09-20, replacing the horizontal workbook-style tab strip). Visual spec in `DESIGN.md` › Layout & Spacing and › Components.

- **What is in the sidebar:** every project surface, grouped in the order a weekly cycle uses them. *Review* stands alone at the top (it is the landing surface); then **Plan** (Plan, Baselines, Import), **Actuals** (Mapping, Connectors), **Report** (Export, and in R1 Publish, Published Snapshots, Risks & Issues), with **Project settings** pinned to the bottom. R1 and Post-Q1 surfaces are absent in R0, not greyed out. Post-Q1 Department view is a Home surface, not a project one, and never appears here.
- **What is not:** the top bar keeps the project switcher, the snapshot pin and the user menu (Admin surfaces and the money toggle stay in the user menu). Cross-project surfaces never enter the sidebar — switching project is a top-bar act, moving inside a project is a sidebar act.
- **Why it collapses:** the Plan grid and the Review's wide tables are the reason — in R0 the Plan grid above all, because its presets are sized against the content area, not the viewport. Collapsing returns 176px to the content area and is the expected posture on Plan and on the Review's wide tables. The state is per user, persisted, and survives navigation and reload; it never changes on its own except at the breakpoints in *Responsive & Platform*, and a manual toggle always wins until the user crosses a breakpoint again.
- **Ordering and depth:** one level only. Mapping's three sub-views (Tickets, Rules, Coverage) are tabs *within* the Mapping surface, not sidebar children; Import's steps are a wizard within Import. The sidebar never nests.

| Surface | Release | Reached from | Purpose | PRD |
|---|---|---|---|---|
| Projects (home) | R0 | Sign-in; logo | List of the user's Projects, each with overall status glyph, Unplanned Work share, snapshot age and last review date | FR-1 |
| **Review** (Reconciliation Review) — project landing surface | R0 | Project row; sidebar; `g r` | The wedge. One Reporting Period, pinned to one Tracker Snapshot, laid out as the report pages plus the Disposition queue | FR-28–32, FR-20, FR-26 |
| **Plan** — the single R0 scheduling surface | R0 | Sidebar; `g p`; any WP link | Tree grid of the Current Plan: hierarchy, derived dates, actual dates, duration, progress, predecessors with lags, constraints, Float, the critical path and the three schedule exceptions. Dependencies and constraints are created, edited and deleted here. Also WP editing, Custom Fields, Milestones and the Project schedule settings. The Gantt is R1 and adds no capability this grid lacks | FR-5, FR-6a, FR-6b, FR-7, FR-8, FR-43 |
| Mapping | R0 | Sidebar; `g m`; any "Unmapped" link | Three sub-views: Tickets (map / remap / unmap), Rules (ordered list with preview), Coverage (per Connector) | FR-21–24, FR-13 |
| Baselines | R0 | Sidebar; Plan toolbar | Baseline history (author, time, reason), Set Baseline / Re-baseline, compare any two versions WP by WP | FR-15, FR-16 |
| Import | R0 | Sidebar (Plan group); Plan toolbar "Import / Re-import"; empty-project state | Upload → Sheet & header → Column mapping → Import Preview (or Re-import diff) → Confirm | FR-9–11 |
| Connectors | R0 | Sidebar; snapshot pin; connector error banner | Backlog Connector setup, scope, approval record, hours detection result, snapshot history, credential rotation, Tracker Account linking | FR-17, FR-19, FR-42, FR-13 |
| Export | R0 | Review toolbar; sidebar (Report group) | Fixed-layout xlsx report; raw data export | FR-38, FR-39 |
| Project settings | R0 | Sidebar (pinned to the bottom) | Project start, Project finish and Data Date (also editable from the Plan's schedule strip); Holiday Calendar and its version; Reporting Period cadence; EAC Method (Typical only in R0); Catch-all defaults | FR-43, FR-14, FR-30 |
| Admin: Organisation | R0 | User menu (Tenant Admin) | Departments, Programs, Projects, PM assignment | FR-1 |
| Admin: Resources & Rates | R0 | User menu (Tenant Admin) | Resources, dated Rate history, Project default Rates | FR-12 |
| Admin: Users | R0 / R1 | User menu (Tenant Admin) | Invite, roles, revoke; Client Viewer invitation notices (R1) | FR-2, FR-3 |
| Admin: Audit log | R0 | User menu (Tenant Admin) | Filterable log of every NFR-A1 action | NFR-A1 |
| Publish (preview + Visibility Policy) | R1 | Sidebar (Report group); Review toolbar "Preview client view" | Exact Client View preview, Visibility Policy toggles, stale-snapshot check, Publish | FR-34, FR-35 |
| Published Snapshots | R1 | Sidebar (Report group) | History: published / superseded / retracted, viewer opens per snapshot, supersede and retract actions | FR-35, FR-36 |
| Risks & Issues | R1 | Sidebar (Report group) | Register on Project and WPs; internal by default, per-item client-visible toggle | FR-37 |
| Client View | R1 | Invitation / notification email link (magic link) | Landing = latest Published Snapshot; snapshot history list; language switch | FR-36 |
| Department view | Post-Q1 | Home (not in the project sidebar) | Effort and cost by home Department incl. *Unattributed* line | FR-33 |

**Closure check.** Every UJ in PRD §2.3 lands on a surface above: UJ-1 → Import, Plan, Baselines; UJ-2 → Connectors, Mapping; UJ-3 → Review, Publish (R1), Export; UJ-4 → Client View; UJ-5 → Department view (Post-Q1, not specified further here); UJ-6 → Admin: Users / project Client Viewers, Publish, Client View. Admin surfaces (Organisation, Resources & Rates, Audit log) have no UJ; they are covered by the set-up steps inside Flow 1 and Flow 2 below.

### Plan — surface structure

R0's single scheduling surface (FR-7). Every scheduling input the PM owns, and every date the scheduler derives from them, is reachable here; nothing lives only in a chart, because R0 has none. Top to bottom: the **schedule strip**, the **toolbar**, the **tree grid**; to its right the **schedule-exceptions rail**; and, after every recalculation, the **What-moved band** between toolbar and grid. Each element is tagged *Core* or *Comfort* in *Build Tiers* below, which is how OQ-11 was sized as two figures rather than one: **engine 92 h, this surface 98 h** (closed 2026-09-20).

1. **Schedule strip.** One ruled line above the grid carrying the Project's scheduling context: Project start · Project finish (or *not set*) · Data Date · computed finish · minimum Float · and the Float anchor written as a sentence, not a label — "Float measured against the Project finish, 31 Mar 2027", or "Float measured against the computed finish, 12 Mar 2027 — relative, because no Project finish is set" (FR-6b, FR-43). All three settings are editable here as well as in Project settings; each edit recalculates and raises the What-moved band. The strip never scrolls away, because it is the only place a Float number means anything.
2. **Toolbar.** Column-preset switcher · `/` filter · expand-to-level · column chooser (within the preset) · *Set Baseline* / *Compare baselines* · *Import / Re-import*.
3. **Tree grid.** The columns and cell rules below.
4. **Schedule-exceptions rail** (right, `{spacing.rail-width}`) — the same shape as the Review's Disposition rail, because it is the same act: a ranked queue of things asking for a decision. Behaviour in *Component Patterns*.

**Columns.** Three frozen leading columns never scroll horizontally: **WBS code**, **Name** (carrying the tree's expand control, `aria-level` and `aria-expanded`) and the **state glyph** — complete, in progress or remaining (FR-6b). After them, one of four presets:

| Preset | Columns after the frozen three | The question it answers |
|---|---|---|
| **Schedule** (default) | Derived start · Derived finish · Duration · Predecessors · Constraint (type and date in one column) · Float · Critical · Exception | When does this run, and what decides that? |
| **Progress** | Actual start · Actual finish · Recorded % · Observed % · Gap · Remaining duration · Evidence | How far has it really got? |
| **Baseline compare** | Baseline start · Derived start · Δ · Baseline finish · Derived finish · Δ · Baseline duration · Duration · Δ · Baseline effort · Effort · Δ | What moved since the Baseline? FR-7 asks for this as columns, because R0 has no bars to draw it on |
| **All** | Everything above, plus planned effort, Resources and Custom Fields | Everything. The only preset that scrolls horizontally |

Every preset but *All* is sized to fit **the grid's own width**, which is 1232px at a 1280px viewport with the sidebar collapsed and the exceptions rail in its drawer. The Schedule preset measures **1,229px** — a 330px frozen block and 899px of scrolling columns, measured in [`mockups/plan-tree-grid.html`](mockups/plan-tree-grid.html), not estimated — so the ordinary working posture never scrolls sideways, with 3px to spare. **The rail and the full Schedule preset do not both fit at 1280px**, and there is no honest way to make them: shrinking the columns to fit would truncate "Must finish on 18 Mar 2027" and "Out of sequence", which are the two strings the surface exists to show. So the exceptions rail is a **drawer below 1680px** and a pinned column above it (*Responsive & Platform*) — the breakpoint is derived from the measurement, not chosen. The chosen preset is per user, per project, and persisted. The column chooser adds or removes columns within a preset; that variation is saved, and *Reset preset* restores the default set. A column added to one of the three sized presets has to take width from another — that is the contract, not a guideline.

**Cell rules.**

- **Derived dates are not editable, and the grid says why.** Typing into one answers — "Planned dates are derived. To pin a date, set a constraint." — and moves focus to that row's constraint cell (FR-5). The refusal teaches the model; a disabled grey cell would not.
- **The Data Date is rendered on every row, not on a timeline.** Dates on or before it are set in `{colors.ink-muted}`, dates after it in `{colors.ink}`. With the state glyph, that is FR-7's "boundary between the two halves of the plan" made visible in a grid — the thing a Gantt would have drawn as a vertical line.
- **Summary WPs carry no scheduling inputs.** Their duration, predecessor, constraint, Float, critical and exception cells render an em dash whose accessible name is "not applicable — summary work package, rolled up from its children" (FR-5). Never blank: blank reads as missing data.
- **Negative Float is a negative number**, with its minus sign, in `{colors.health-red}` — never 0, never blank (FR-7).
- **The critical path is a word, not a colour.** The Critical column reads "Critical" with its bar glyph, and the row takes a 3px ink left rule. The column header names the anchor in short form — "vs Project finish" or "vs computed finish" — because the same WP can be critical against one and not the other (FR-6b).
- **Percent Complete in the Schedule preset is the Recorded figure**, because that is the one FR-6b reads. The Observed figure appears beside it in the Progress preset and in the Review's *Progress & Dates*, never in place of it.
- **Every exception is a glyph plus a word plus a number** in the Exception cell — "▲ Late 6d", "⇄ Out of sequence", "⊘ No duration" — and the same item appears in the rail. A row is never marked by colour alone.

### Review — page structure

The Review mirrors the four report pages PMs rebuild by hand every week (addendum B), plus the wedge section, in this fixed order [ASSUMPTION]. Each numbered section below opens with a `{typography.section-title}` and its 1px ink rule; with a single type family that rule is what separates the pages, so it is required markup, not styling (`DESIGN.md` › Typography).

1. **Header.** Report title (Project name + Reporting Period, `{typography.report-title}`), Reporting Period picker, snapshot pin, Contract Type, toolbar (Refresh snapshot, Export xlsx, Preview client view [R1]).
2. **Status.** Three Health Indicators + overall status, each with its rule caption. Headline figures: SPI, CPI (all-in), Unplanned Work share and hours.
3. **Unplanned Work** (placed directly after Status because it is the reason the report exists) [ASSUMPTION]. Scope Ledger Bar; the three Unplanned components (Unmapped Work, non-baselined WPs, Catch-all overflow); Unmapped Work grouped by Tracker attribute (milestone, category, issue type…), expandable to Tickets; Opening Balances per Connector; "left scope" and scope-change notices.
4. **Ahead / Behind.** SV, SPI, Milestones table (Baseline date, derived date, actual finish, slip in working days — "done" means the milestone has an actual finish, so there is no separate done date, §3), Divergence by WP (Baseline vs Current Plan vs actual), and both finish dates next to SPI: the computed finish and the trend finish, labelled (FR-32).
5. **Progress & Dates** (founder decision, 2026-09-20). The section where the evidence and the plan are made to face each other, and where the plan's clock is moved. Three blocks, in order:
   - **Observed vs Recorded Percent Complete**, side by side. One row per leaf WP where the two disagree by more than a threshold the PM sets (default 10 points), worst gap first. Per row: the WP, the Observed figure with its basis and evidence count, the Recorded figure with its source, the gap, the EV each would produce, and *Accept*. The row says it in words — "Evidence says 60%. The plan says 30%." *Accept* writes a Recorded override with a reason the PM must type, and the dates it moves appear in the next block with the cause *progress changed* (FR-30, FR-6b, FR-28).
   - **Dates that moved, and why.** Every WP whose Current Plan dates moved since the previous Review, grouped under one of FR-28's seven causes, each group collapsed with its count. No WP appears without a cause, because there is no cause-less movement to show (FR-28).
   - **Data Date.** The Project's current Data Date, the Period boundary, and *Advance to 26 Sep 2026* — which states what it will do before it is pressed (FR-43).
6. **Effort & Cost.** EVM table (PV, EV, AC, CV, CPI all-in, CPI planned scope, TCPI) in hours; money column pair marked Internal; EVM S-curve.
7. **Forecast.** EAC (method named), ETC, VAC, and the two finish dates — the computed finish (the scheduler's output) and the trend finish (labelled "trend heuristic, not a PMI formula"), with the gap between them stated when they disagree (FR-32).
8. **Disposition rail** (right, 360px): queue of undispositioned Unmapped Ticket groups, sorted by hours descending.

## Voice and Tone

Microcopy is plain, factual and blame-free. Brand posture lives in `DESIGN.md` › Brand & Style.

| Do | Don't |
|---|---|
| "Unplanned Work: 38h (10%) — hours spent outside the baselined plan." | "Team overran by 38h." / "Wasted hours" |
| "11 Unmapped Tickets, 46h. Decide how to report them." | "11 tickets are missing from the plan!" |
| "Tracker provides no hours. Effort metrics are unavailable in Ticket-Count Mode." | "0h" / "No data" |
| "Snapshot is 26 hours old. Refresh before publishing?" | "Warning: data may be wrong" |
| "Approximate — hours are spread between snapshots, not taken from worklogs." | Silent person-level charts |
| "PM-adjusted: 60% (reason: QA sign-off pending in client env)" | Hidden overrides |
| "Nothing is written until you confirm." (Import) | "Import started…" before confirmation |
| Numbers first, then meaning: "SPI 0.91 — behind plan" | Meaning without the number |
| Name Tickets by key + title; name WPs by WBS code + name | Name people in any Unplanned Work context |
| "Evidence says 60%. The plan says 30%." | "Progress mismatch detected" |
| "Planned dates are derived. To pin a date, set a constraint." | A greyed-out date cell with no explanation |
| "Late 6 working days. Asked for 18 Mar, derived 26 Mar." | "Constraint violated" / "6 days late" with no calendar named |
| "Actual dates are kept. The successors of 2.4 are driven from its actual start." | "Out-of-sequence error" / "invalid link" |
| "No duration. Excluded from both passes and from the critical path. Blocks the next Baseline." | Silently scheduling it as one day |
| "142 work packages moved · computed finish 12 Mar → 26 Mar 2027" | A grid that quietly redraws itself |
| "Advancing to 26 Sep re-dates 78 remaining work packages." | An *Advance* button that just advances |
| "This violation stays on this work package. It has not changed any other work package's Float." | Leaving the PM to infer what a violation did |

Japanese (R1, Client View and emails): polite business register (です・ます), no exclamation marks. Unplanned Work label draft: **計画外作業**, pending validation with the first client (PRD OQ-3, addendum B) [ASSUMPTION]. Effort unit: **工数 (h)**. The "effort but no earned value" statement (FR-34) is rendered once per Client View, under the Unplanned Work indicator.

## Component Patterns

Behavioural rules. Visual specs are in `DESIGN.md` › Components.

| Component | Where | Behaviour |
|---|---|---|
| Left sidebar | Every project surface | Lists the project's surfaces (see *Information Architecture*). The current surface is `aria-current="page"`. The toggle (top bar, left edge) collapses it to a 48px icon rail and back; `[` does the same from anywhere. Collapsed, each item keeps its accessible name and shows a tooltip on hover and on focus. The collapsed/expanded state is per user and persisted; it is re-evaluated only when the viewport crosses a breakpoint, and a manual toggle wins until the next crossing. Below 1024px it becomes an overlay drawer opened from the top bar, closed by `Esc` or by choosing a surface; the drawer counts as the one allowed modal level. It never carries counts or badges — a stale snapshot or a connector error is announced by its banner on the surface, not by a dot in the nav. |
| Snapshot pin | Top bar on every project surface | Shows the Tracker Snapshot the view is pinned to and its age, live-updating each minute. Click → popover with snapshot time, Connector(s), next scheduled snapshot, *Refresh now*. On the Review the pin is the Review's pinned snapshot; a newer snapshot shows "Newer snapshot available — Re-pin" rather than silently changing figures. |
| Metric cell | Review, Client View | Click or `Enter` opens the formula popover: formula, inputs with their values, one-line interpretation (FR-30), change within the Period, and "Show Tickets / WPs" drill-down. In the Client View drill-down stops at WP level (addendum B). |
| Health badge | Review Status, Projects list, Client View | Hover/focus reveals the threshold rule and the driving figure. Clicking scrolls to the report page that drives it. |
| Scope Ledger Bar | Review, Mapping › Coverage, Connectors | Each segment is a button: clicking filters the list below to that bucket (e.g. Unmapped → the Unmapped groups). Keyboard: arrow keys move between segments. Hours share and Ticket share toggle (FR-23). |
| Unmapped group row | Review › Unplanned Work, Disposition rail | Grouped by Tracker attribute; expands to Tickets (key, title, status, hours, money [Internal]). Multi-select Tickets or whole group. Row flags: "new hours since disposition", "moved to Unmapped by rule", "left scope". |
| Disposition control | Disposition rail, group row, Ticket row | Four actions: **Map** (WP picker, leaf WPs only, searchable by WBS code/name), **Plan** (new WP name + parent; states "counts as Unplanned until the next Re-baseline"), **Change Request candidate**, **Explain** (note, plain text, 1,000 chars, shows "Clients see this note only if you publish it"). Map applies immediately and the Unplanned figures and Scope Ledger Bar update in place with a 1-line change note ("−8h Unplanned"). Every Disposition can be undone from the group's history until the Review's next publish or export [ASSUMPTION]. |
| Formula popover | Any metric | Non-modal, `Esc` closes, focus returns to the metric. |
| Approximate notice | Any person- or day-level breakdown | Inline caption above the chart/table, not dismissible (FR-26). |
| Internal marker | Money figures, PM-only sections | Static. Money toggle in the user menu ("Show money in PM views", default on) [ASSUMPTION]. |
| Tree grid | Plan, Import Preview, Baseline compare | The ARIA treegrid. Expand/collapse per row and "expand to level N". Inline edit on double-click or `Enter`; `Esc` cancels; commit on blur, `Enter` or `Tab`. Column chooser; group by any single-select Custom Field. On Plan it is the scheduling surface: see *Plan — surface structure* for its columns and cell rules, and the rows below for each control on it. A commit that FR-6a rejects changes nothing and triggers no recalculation. **Core.** |
| Schedule strip | Plan, above the grid | Reads the Project start, the Project finish (or *not set*), the Data Date, the computed finish, the minimum Float and the Float anchor sentence. Each setting is an inline edit; every change recalculates (FR-43). Setting a Project finish for the first time is confirmed with what it actually does — "This moves no work package. It changes what Float is measured against, and lets Float go negative" — and clearing it is confirmed the same way. **Core.** |
| Column-preset switcher | Plan toolbar | A segmented control of four: Schedule / Progress / Baseline compare / All. `1`–`4` switch from inside the grid without losing the focused row, so a preset change is a change of view, never of place. Persisted per user per project. **Core** for the first three; the *All* preset and saved per-preset column variations are **Comfort**. |
| Predecessor cell | Plan grid (Schedule, All) | Holds the WP's predecessors as one text field, MS-Project-shaped: `2.3FS+2d, 2.4`. `FS` is the only link type in R0 and may be omitted; lag is in working days and may be negative. Typing opens an autocomplete over WBS code and WP name, **leaf WPs only**. On commit the edge set is diffed and applied, and FR-6a rejections appear under the cell naming the offence and the WPs in it — "2.1 → 2.3 → 2.1 would be a cycle", "4.2 is an ancestor of 4.2.1", "3.0 is a summary work package", "that work package is in another project". The cell keeps the typed text so the PM corrects rather than retypes. **Core.** |
| Links panel | Plan, right slot, `l` | The reading and untangling path for the same edges. Lists the selected WP's predecessors *and* successors as rows — WP picker, lag field, remove — each showing the other end's dates and Float, so a chain reads without leaving the panel. Adding a link here runs the same FR-6a checks and reports them the same way. It shares the rail's slot: opening it replaces the exceptions rail, closing it restores it. **Comfort** — the predecessor cell alone satisfies FR-6a and FR-7. |
| Constraint cell | Plan grid | One column holding both halves — rendered as "Must finish on 18 Mar 2027", edited as type then date: type (*as soon as possible* default / *must start on* / *must finish on*) and date. A non-default type requires the date; clearing the date returns the type to the default. The cell never promises the date will be met — if the graph already makes it impossible, the violation appears in the same row's Exception cell in the same interaction. A milestone's target date **is** its *must finish on* constraint and is edited here like any other, not in a field of its own (§3, FR-6a). **Core.** |
| Schedule-exceptions rail | Plan, right, `{spacing.rail-width}`; a pinned column at ≥1680px and a drawer below it, toggled from the toolbar or with `x` — the toggle always carries the total count, so a shut drawer never hides an exception | Three collapsible groups, always in this order, each with its count: **Constraint violations** (ranked by working days late, worst first), **Out-of-sequence links**, **Not schedulable yet**. `j` / `k` walk the whole rail across groups; `Enter` scrolls the grid to that WP, focuses its row and opens the explainer. Empty, it says "No schedule exceptions" rather than vanishing — absence and emptiness are different facts. This is the surface FR-6b's "ranked list, worst first, alongside the critical path rather than inside it" asks for, and the figure FR-31's Schedule indicator names is its top row. **Core.** |
| Exception explainer | Rail item; the row's Exception cell; `e` | A non-modal popover per type, each answering exactly what the PRD requires to be answerable. **Constraint violation:** the date asked for, the date derived, how many **working days** late and on which Holiday Calendar version, and the predecessor chain that forced it as a walkable list of WPs with each one's finish and lag — arrow keys move along it, each entry focusing that WP behind the popover. It closes with the line that keeps the model honest: "This violation stays on this work package. It has not changed any other work package's Float." (FR-6b, FR-7) **Out-of-sequence link:** "WP 2.4 started 12 Sep, before WP 2.3 finishes 19 Sep. Actual dates are kept. The successors of 2.4 are driven from its actual start." Stated as information; no fix is offered, because there is nothing wrong. **Not schedulable yet:** "No duration. Excluded from both passes and from the critical path; its successors are driven from its predecessors as though it were absent. It blocks the next Baseline." — with a duration field in the popover, so the fix is one action from the explanation (FR-6b, FR-15). **Core;** the chain walk is **Comfort** (the chain can be listed as plain text). |
| What-moved band | Plan, under the toolbar, after every recalculation | One line: "142 work packages moved · computed finish 12 Mar → 26 Mar 2027 · minimum Float +4 → −3", then *See what moved* and *Undo this edit*. The panel groups the moved WPs under FR-28's seven causes with old and new dates; any entry focuses that WP in the grid. The band persists until the next recalculation or until dismissed, so a PM who looked away does not lose the answer. Changed cells take a 300 ms highlight in `{colors.primary-soft}`; reduced-motion users get the highlight without the transition. When an edit moves nothing the band says "No dates moved" — silence and "nothing moved" are different answers. This is OQ-11's "what does the PM see when one edit moves a hundred dates". **Core**, except *Undo this edit*, which is **Comfort**. |
| Progress comparison row | Review › Progress & Dates | Observed and Recorded Percent Complete side by side with the gap; the evidence behind the Observed figure (basis, Mapped Ticket count, "low evidence" / "no evidence" flags) and the source of the Recorded one (imported, with file and row; PM override, with reason; or *none — scheduled as 0%*). *Accept* opens a reason field that cannot be empty and states the consequence before it is pressed: "This writes a Recorded override of 60%. Remaining duration falls from 12 days to 5, and dates will move." (FR-30, FR-6b) **Core.** |
| Data Date panel | Review › Progress & Dates; Project settings; Plan schedule strip | Shows the current Data Date and offers to advance it to the Reporting Period boundary, naming what will happen first — "Advancing to 26 Sep re-dates 78 remaining work packages." An attempt to set it earlier than the latest actual finish is refused with the WPs that block it (FR-43). It is never advanced except by the PM pressing it. **Core.** |
| Mark complete | Plan grid row action; `Shift+Enter` | Asks for the actual finish and proposes today, which the PM changes to the date the work really finished. Where the WP has Mapped Tickets, the **first observed activity** is shown beside the actual start as evidence with a one-click fill — and is never written by the system (FR-5). An actual finish before the actual start is refused with the reason; an actual date later than the Data Date asks to advance the Data Date in the same action (FR-43). **Core.** |
| Gantt **(R1)** | Plan | **Not built in R0** (FR-7). When it arrives it is a second view of the same data and adds no scheduling capability the grid lacks: synchronised vertical scroll with the tree grid, day / week (default) / month scale, dependency arrows, critical-path emphasis, the Data Date as a vertical rule, non-working days shaded. Dragging a Current Plan bar edits its dates and is one more route to what the grid already edits; the Baseline bar is never draggable. Hover shows Baseline vs Current dates and effort. |
| Column mapper | Import step 2 | One row per source column: header text, sample values, suggested field (with "suggested from header 開始日" hint), dropdown to change. Unmapped columns default to "Create Custom Field". |
| Import Preview grid | Import step 3 | Tree grid of every row as it will import, with level, values, and flagged cells. Counts bar: rows read / to import / skipped (with reasons). Unknown assignees panel: create or link a Resource for each. Cells editable in place; level changeable with `Tab`/`Shift+Tab`. |
| Re-import diff | Import step 3 (re-import) | Four filters: Added / Changed / Removed / Unmatched. Changed rows show old → new per field; values that overwrite in-tool edits flagged. Removed WPs with Mappings require a target choice (FR-5). Unmatched pairs resolved by picking a match or "treat as new/removed". |
| Rule list | Mapping › Rules | Ordered list; drag handle or `Alt+↑/↓` to reorder (strict priority). Editing a rule opens a side panel with the condition builder and a live preview: "+14 Tickets / +32h would move to WP 2.3; 2 Tickets leave WP 2.1". Save is disabled until the preview has loaded. |
| Stale / error banner | Top of affected surface | One banner per condition, stacked by severity, each with its fix action (Refresh, Fix credentials, Resolve overlap). |
| Publish dialog (R1) | Publish surface | Summarises what will be visible, snapshot age, Baseline version, PM-adjusted items; requires explicit *Publish*. |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Empty project | Plan, Review | Sheet with two entry actions: "Import an Excel WBS" (primary) and "Create WPs by hand". Review says "No plan yet" and links to Plan. |
| No Project start | Plan, Review | The grid renders the hierarchy, durations, links and constraints; every derived date cell reads "—" with the accessible name "no project start yet". The schedule strip carries the one action, *Set Project start*. FR-6b does not run, and the surface says so rather than showing dates from before (FR-43). |
| Recalculating | Plan | The grid stays interactive; affected date cells show "…", never their previous values. The What-moved band appears when it settles. NFR-P1's 300 ms budget means this state is rarely seen — which is why it has to be right when it is. |
| Plan not scheduled — invariant broken | Plan | A structural edit left an illegal edge (FR-6a). Band at the top of the grid: "This plan cannot be scheduled. 2 dependencies are invalid." with the offending edges named and each one's fix. The grid shows **the last good schedule with every derived date marked stale** — never a guess, never blanks. |
| Calendar range exceeded | Plan | "The schedule runs past the loaded holiday calendar (to 2028-12-31). 14 work packages need calendar data to 2029-06." The recalculation halted rather than assuming working days, and the range it needs is named; the banner says extending it is an operator action (FR-6b, FR-14). |
| Constraint violated | Row Exception cell, rail, Review Status | Amber triangle + "Late 6d"; red diamond when the WP is a milestone (FR-31). The number is always working days, and the explainer names the calendar version it counted on. |
| Out-of-sequence link | Row Exception cell, rail | Neutral ink glyph + "Out of sequence". Never amber, never red: a successor that really did start early is a fact about the work, not a fault (FR-6b). |
| Not schedulable yet | Row, rail, Baselines | Grey glyph + "No duration" — the glyph in `{colors.health-unavailable}`, the word in `{colors.ink-muted}`, so the text still clears AA. The row's date, Float and critical cells read "—". *Set Baseline* is disabled while any exist, with the count and a link into the rail group (FR-6b, FR-15). |
| Negative Float | Float column, schedule strip, Review Status | The number with its minus sign in `{colors.health-red}`, directly under the strip's anchor sentence, so "−3" is never read without "against the Project finish, 31 Mar 2027". Where no Project finish is set, the strip says Float is relative and cannot go negative, rather than letting a screen of zeros imply safety (FR-31, FR-43). |
| No Recorded Percent Complete | Plan Progress preset, Review › Progress & Dates | Recorded reads "none — scheduled as 0%", with the Observed figure beside it. This is the ordinary case on a freshly imported mid-flight plan, so it is a stated state, not a warning (FR-6b, FR-30). |
| Dates moved by another PM | Plan | A second PM on the Project recalculated while this grid was open. The What-moved band appears attributed — "142 work packages moved · edited by Hoang, 3 min ago" — and carries no *Undo*: undoing someone else's edit is not this band's job. |
| No Baseline yet | Review, Plan | Review replaces EVM with "No Baseline yet. EVM starts once you set one." + *Set Baseline*. Unplanned Work section still shows Unmapped Work. On Plan, the Baseline compare preset is disabled with "No Baseline yet" and the other presets work normally — the Current Plan schedules without one. |
| No Connector | Review | Status and Unplanned Work show "Connect Backlog to see actual work" + *Add connector*. Plan remains fully usable. |
| First snapshot running | Connectors, Review | Progress line "Reading 1,240 of ~2,000 Tickets"; the Review is not computed until the snapshot completes. |
| Opening Balance present | Review › Unplanned Work | Separate labelled line per Connector: "Opening Balance 1,120h — hours before momo-keikaku could observe them. Excluded from period metrics." |
| Ticket-Count Mode | Everywhere effort appears | Persistent notice under the Status page; unavailable metrics show "—" + "unavailable — tracker provides no hours" (FR-27); Unplanned Work shown as Ticket count; overall status names the unavailable indicator. Mixed Projects label AC coverage. |
| Snapshot stale (>24h) | Snapshot pin, Review, Publish | Pin turns amber with triangle glyph; Review header banner offers *Refresh now*; Publish (R1) interposes the refresh offer. |
| Connector error | Connectors, banner on every project surface | "Backlog rejected the API key (revoked?). Figures are frozen at the last good snapshot, 19 Sep 18:00." + *Update credentials*. |
| Scope overlap | Connectors, Review | Conflict banner listing overlapping Tickets and owning Connector; hours counted once. |
| Low / no evidence | WP rows, metric cells | Outlined tag "low evidence" (<3 Mapped Tickets) or "no evidence" (0%); tooltip explains. |
| PM-adjusted | WP rows, Health badges, Client View | Tag "PM-adjusted" next to the value; reason in popover; never hideable on client surfaces (FR-30). |
| BAC exhausted | TCPI cell | "BAC exhausted" in place of a number; Effort/Cost red. |
| New hours since disposition | Disposition rail, group rows | Group returns to the queue with the flag and the new hours highlighted. |
| Rule flipped Ticket to Unmapped | Review | Flag "moved to Unmapped by rule 'Phase2 milestone'" on the Ticket, linking to the rule. |
| Left scope | Review › Unplanned Work | Collapsed list "4 Tickets left scope this period (12h, history kept)". |
| Import flagged rows | Import Preview | Flagged cells per `DESIGN.md` flag-cell; filter "Show only flagged"; Confirm stays enabled (flags are warnings) except for blocking errors (no name, unparseable hierarchy), which disable Confirm with a count. |
| Multiple candidate sheets | Import step 1 | Sheet chooser with row counts and first rows of each sheet; nothing committed. |
| Upload rejected | Import step 1 | "File is larger than the limit (N MB)" / "Not an .xlsx file" — inline, with the limit stated. |
| Loading | Any data surface | Skeleton rows matching table layout; figures render as "…" not "0". Target <2 s (NFR-P1). |
| Save failed | Inline edit | Cell keeps the edited value with a red-diamond marker and "Not saved — Retry"; no data loss. |
| Superseded / retracted (R1) | Client View | Superseded snapshot stays listed, marked "Superseded" with reason and link to the correction; retracted snapshots vanish for viewers who never opened them, and openers receive the email notice. |
| Not found (R1) | Client View | Any URL outside the viewer's Published Snapshots returns the same neutral "Page not found" — no hint the resource exists. |

## Interaction Primitives

Keyboard-first for the PM (the Review is a weekly ritual and Dispositions are repetitive); mouse fully supported [ASSUMPTION].

- `g r` / `g p` / `g m` / `g b` / `g c` — go to Review / Plan / Mapping / Baselines / Connectors. These work whether the sidebar is expanded, collapsed or closed; the sidebar is a convenience, never the only route.
- `[` — collapse / expand the left sidebar. Below 1024px it opens and closes the sidebar drawer instead.
- `/` — focus the search/filter of the current surface.
- `j` / `k` — next / previous item in the Disposition rail and in Ticket lists; `x` — select.
- `m` / `p` / `c` / `e` — Disposition on the selection: Map / Plan / Change Request candidate / Explain.
- `u` — undo the last Disposition (while undoable).
- `?` — shortcut sheet.

On **Plan**, on top of the treegrid's standard keys:

- `1`–`4` — Schedule / Progress / Baseline compare / All preset. The focused row is kept.
- `Enter` — edit the focused cell; `Esc` — cancel; `Enter` or `Tab` — commit and move.
- `l` — Links panel for the focused WP; `Esc` closes it and restores the exceptions rail.
- `e` — exception explainer on the focused row, when it has one.
- `Shift+Enter` — mark the focused WP complete (asks for its actual finish).
- `j` / `k` — walk the schedule-exceptions rail; `Enter` — jump to that WP.
- `x` — open or close the schedule-exceptions drawer (below 1680px, where it is not a pinned column).
- `g d` — focus the Data Date in the schedule strip.
- `u` — undo the last plan edit, while the What-moved band is up.
- `Esc` — closes the topmost popover, drawer or dialog; one modal level only, never stacked.
- Drag-and-drop exists in exactly **one** place in R0: Tickets onto WPs in Mapping (UJ-2), with a keyboard equivalent (the Map action). The Gantt's bar-dragging arrives with the Gantt in R1. **Nothing in the plan is edited by dragging in R0** — and nothing needs to be, because planned dates are not typed or dragged at all; they are derived (FR-5, FR-6b).
- No infinite scroll: Ticket and WP lists virtualise within a page; lists over 500 rows paginate.
- Motion: 150ms opacity/transform transitions for popovers and drawers only; figure updates after a Disposition use a 300ms highlight on the changed cells. Reduced-motion users get instant changes.

## Accessibility Floor

WCAG 2.1 AA (PRD NFR-U1) [ASSUMPTION: 2.1 as set by PRD, not 2.2]. Visual contrast is specified in `DESIGN.md` › Colors.

- **Never colour alone.** Health states carry glyph + word; Unplanned Work carries hatch + label; Baseline vs Current Plan differ by outline vs fill and by position; JP vs VN holidays differ by pattern.
- **Every chart has a table.** In R0 there is no chart of the schedule at all — the tree grid *is* the schedule, which is why FR-7 ships it and not a Gantt. The S-curve and Scope Ledger Bar each have a "Show as table" toggle, and their figures also appear in adjacent text. When the Gantt arrives in R1 the grid is its equivalent, not its fallback.
- **Tables are real tables** with column and row headers; the tree grid follows the ARIA treegrid pattern with `aria-level`, `aria-expanded`, `aria-posinset` and `aria-setsize`.
- **The frozen columns are not a second table.** WBS code, Name and the state glyph are frozen visually only; they stay in the same row, in the same reading order, so a screen reader hears one row and the freeze costs nothing. Horizontal scroll exists on the *All* preset alone.
- **The scheduling surface never uses colour alone.** Every exception is glyph + word + number in the Exception cell and again as a rail item; the critical path is the word "Critical" plus a rule, not a tinted row; negative Float is a minus sign before it is a colour; the Data Date boundary is the state glyph before it is an ink weight. Remove every colour from the grid and it still reads.
- **Float is never announced without its anchor.** The Float column header carries the anchor in short form, and the schedule strip states it in full. A number that means two different things under two anchors is not accessible by being large.
- **Recalculation is announced.** After each one, politely: "142 work packages moved. Computed finish 26 March 2027. Minimum Float minus 3." FR-6a rejections are announced assertively, because they mean the edit did not happen.
- **The predecessor cell is fully keyboard-operable** — autocomplete over WBS code and name, inline error text tied to the cell with `aria-describedby`. The Links panel is the non-syntax route to the same edges; if it is cut as *Comfort*, the cut costs discoverability, not access.
- **Focus.** Visible focus ring on every interactive element (`{colors.focus-ring}`); focus returns to the invoking element when a popover or dialog closes; tab order follows the report reading order.
- **Navigation landmarks.** The sidebar is a `<nav>` with an accessible name, the current surface carries `aria-current="page"`, and the toggle exposes `aria-expanded`. A "Skip to content" link precedes it so keyboard and screen-reader users are never made to walk the whole nav on every surface. Collapsing is a visual state only: item names stay in the accessible tree, so a collapsed sidebar is never a loss of information, and the `g` shortcuts reach every surface regardless.
- **Live regions.** Disposition results and figure changes are announced politely ("Unplanned Work now 38 hours, 10 percent").
- **Language.** `lang` attributes set per string so JA screen-reader voices engage on Japanese content (R1).
- **Reduced motion** respected. Text resizes to 200% without loss of content in the Client View; PM screens allow horizontal scroll in wide tables only.

## Responsive & Platform

Widths below are viewport widths. Every PM layout decision is taken on the **content area** (viewport minus the sidebar), because the sidebar is in the flow, not over it. The Client View has no sidebar, so its column is unaffected.

| Width | Left sidebar | PM screens | Client View (R1) |
|---|---|---|---|
| ≥ 1680px | Expanded by default (224px) | Review sheet + Disposition rail. **Plan: grid + schedule-exceptions rail side by side** — the only posture where the rail is a pinned column, because 1,229px of grid plus a 360px rail plus the 48px icon rail is what it takes | Single column, max 960px |
| 1440–1679px | Expanded by default | Review keeps its Disposition rail. On Plan the exceptions rail is a **right drawer**, toggled from the toolbar and by `x`; the grid takes the full width. The rail's counts stay visible on the toolbar toggle, so an exception is never invisible while the drawer is shut | Same |
| 1280–1439px | Collapses to the 48px icon rail by default | Same as above; the collapse is what keeps the Review's Disposition rail alive at this width and gives the Plan grid its 1232px. Expanding by hand drops the Disposition rail to a drawer — an acceptable trade the user made | Same |
| 1024–1279px | Icon rail; expanding is an overlay, not a push | Both rails are right drawers. The three sized presets still fit; *All* scrolls horizontally as it always does | Same |
| < 1024px | Overlay drawer from the top bar, closed by default | Not supported for editing (founder decision, 2026-09-20 — unchanged by the sidebar): a notice suggests a larger screen; Review readable in a single column; Plan read-only, frozen columns plus the Schedule preset scrolling horizontally | Single column; the R1 Gantt simplified to milestone list + level-1 bars; tables scroll horizontally inside their frame |

The default at each breakpoint applies only while the user has not toggled the sidebar at that width; once they have, their choice is kept until the viewport crosses a breakpoint again. The sidebar never animates the content area's width on load — it renders in its remembered state, so no layout shift is introduced (`DESIGN.md` › Elevation & Depth).

Print: the Review and Client View have a print stylesheet (A4 landscape) that reproduces the report pages, since upward reporting is still document-based [ASSUMPTION]. The sidebar, top bar and Disposition rail do not print.

## Inspiration & Anti-patterns

- **Lifted from the Japanese business report (報告書 / 帳票):** ruled tables, the status column, the fixed page order clients already read. Not the mincho heading face — the report's discipline reads through structure, and a second family was decoration (founder decision, 2026-09-20).
- **Lifted from Excel workbooks:** a tree grid that behaves like an outline, column choosers, keyboard-first editing. The PM lives in Excel today; the tool should feel like the best-kept workbook. Not the sheet-tab strip: the project has a dozen surfaces of unequal weight, which a left sidebar groups and a tab strip only crowds (founder decision, 2026-09-20).
- **Lifted from editorial data journalism:** direct labels instead of legends, annotated charts, the formula shown next to the figure.
- **Rejected — KPI tile dashboards and gauges:** they hide how a number was made; every figure here is explainable.
- **Rejected — person-level Unplanned Work, leaderboards, productivity scores:** violates PRD §7.1 and §9; Unplanned Work is about the plan's accuracy.
- **Rejected — "Sync" language and sync-style progress spinners as the headline:** PRD §7.1; the headline is Unplanned Work against a real Baseline.
- **Lifted from MS Project and P6:** the predecessor cell's syntax, the constraint vocabulary, and Float and the critical path as columns. These are the shapes the PM's Japanese counterparts already use in a 工程表, so the grid is legible to both sides of the project. Not their defaults: no resource levelling, no auto-schedule toggle, no task mode, no six constraint types — R0 has three, and each one is reported rather than obeyed.
- **Rejected — auto-applying imports, rules or AI suggestions:** every change to reported numbers is an explicit PM action with a preview.
- **Rejected — dragging as the way to reschedule:** R0 has no bars, and even in R1 the bar is a convenience over the grid, never the source of truth. A plan that can only be edited by aiming a mouse at a pixel is not a plan a keyboard user owns.
- **Rejected — showing negative Float as zero,** or hiding it until a Project finish is set. A plan that cannot meet its contract date should look like one.
- **Rejected — a constraint that quietly wins over the dependency graph.** The graph wins, the constraint is reported, and the violation stays on its own WP (FR-6b). A surface that silently honoured the constraint would be drawing a plan nobody can execute.
- **Rejected — inferring an actual start from tracker activity.** First observed activity is shown beside the field as evidence with a one-click fill, and is never written by the system (FR-5). The alternative is a plan that moves overnight while nobody is watching.
- **Rejected — a preview-and-apply scheduler.** FR-6b recalculates the moment an input changes; a draft plan waiting for approval would be a second plan, and the PM would have to reconcile the two. The What-moved band answers the same fear after the fact, honestly.

## Trust & Visibility Boundaries

Product-specific section: what can and cannot cross from PM views to client surfaces (FR-34, §7.2).

- PM screens mark every money figure and PM-only section "Internal". The Publish preview renders from the same Visibility Policy the Client View uses, so "what you preview is what they see" is literal, not a mock.
- Visibility Policy toggles (R1) live only on the Publish surface, grouped as *Shown by default*, *Optional (off)* and *Never shown* — the last group is listed read-only, so the PM can see what is protected without being able to turn it on.
- The Unplanned Work indicator is not a toggle. Its row in the Policy reads "Always counted in Health Indicators. You control notes and detail, not whether it counts."
- The Client View states that views are recorded (FR-36), in its footer.

## Build Tiers — Core and Comfort (OQ-11)

Product-specific section, and the reason it exists: PRD **OQ-11** records the plan surface as a known, unestimated cost and asks `bmad-sprint-planning` to size it as **its own line item**, separately from the FR-6b engine — because the engine is cheap and the surface keeps being costed as though it were too. So every element above carries a tier, and the sizing can be two figures rather than one.

- **Core** — an R0 FR fails without it.
- **Comfort** — the FR still passes if it is cut; what is lost is speed or discoverability.

Cutting is allowed without a correct-course pass (PRD §7.3). Adding is not.

| Element | Tier | What a cut costs |
|---|---|---|
| Tree grid, frozen columns, treegrid keyboard model | Core | FR-7 has no surface at all. |
| Schedule / Progress / Baseline compare presets | Core | FR-7's column list does not fit a screen, so something it names becomes unreachable. |
| *All* preset; saved per-preset column variations | Comfort | Effort, Resources and Custom Fields are reached from the WP's own editor instead. |
| Predecessor cell, with FR-6a rejection text | Core | FR-6a has no editing surface. |
| Links panel | Comfort | The predecessor cell does the same work. Discoverability drops for a PM who has not met the syntax. |
| Constraint cells | Core | FR-5's constraint, and with it every milestone target (§3), has nowhere to live. |
| Schedule strip | Core | FR-6b requires the Float anchor to be shown wherever Float is shown. |
| Schedule-exceptions rail | Core | FR-6b's ranked list and FR-31's worst-violation figure have no home. |
| Exception explainers (all three types) | Core | FR-7 requires days late and the driving chain to be reachable from the marker. |
| Chain walk inside the violation explainer | Comfort | The chain is listed as plain text without per-WP focus jumps. |
| What-moved band and its cause panel | Core | OQ-11's own question — what the PM sees when one edit moves a hundred dates — goes back to being unanswered. |
| *Undo this edit* on the band | Comfort | The PM re-edits by hand. The plan is never wrong, only slower to fix. |
| Review › Progress & Dates: Observed vs Recorded, with *Accept* | Core | FR-30's side-by-side requirement is unmet — and with it the claim this product is built on. |
| Gap threshold setting on that list | Comfort | The list shows every disagreeing WP at a fixed 10 points. |
| Dates-that-moved list, grouped by cause | Core | FR-28 names seven causes and requires every moved WP to carry one. |
| Data Date panel and its advance action | Core | FR-43's advance action has no surface, and the plan cannot be moved through time. |

**Cut order — adopted 2026-09-20, and now normative.** The Comfort rows above, in the order they are listed. They sit *above* the PRD's own first cut — the two extra constraint types — because cutting them removes no FR behaviour and cutting the constraint types does.

This was offered here as a recommendation to `bmad-sprint-planning`. **It was taken.** OQ-12 closed on 2026-09-20, and **PRD §8.3 now carries these rows as `item 0` of the cut order**, above item 1, for exactly the reason given above — and with the consequence spelled out there that item 1 deletes every milestone target date, because PRD §3 defines a milestone's target *as* a *must finish on* constraint. **So this table is no longer a suggestion: it is the content of item 0**, and the PRD's cut order reads its row order from here. Changing a tier below changes what the PRD cuts first, which makes a retier a PRD-affecting edit rather than a local one.

Sized at **~18 h** for all Comfort rows (OQ-12). Cutting them needs no `bmad-correct-course` pass; cutting item 1 does, because its cheapest rescue — a milestone-only deadline flag — is a capability no FR states.

## Key Flows

Protagonists are PRD §2.3's illustrative personas, used verbatim.

### Flow 1 — Linh turns the client's Excel WBS into a live plan (UJ-1, R0)

1. Linh opens a new, empty Project. It lands on the Review; she picks **Plan** in the left sidebar, which shows "Import an Excel WBS" as the primary action.
2. She drops the client's .xlsx. Step 1 finds two sheets with data and asks which one is the WBS; she picks 「WBS」 and confirms header row 3 from the row preview.
3. Step 2 shows each column with sample values and a suggested field: WBS番号 → WBS code, 作業名 → name, 開始日 / 終了日 → start / finish, 工数 → effort, 担当 → assignee. 担当会社 has no match and defaults to "Create Custom Field".
4. Step 3, the Import Preview: 212 rows read, 208 to import, 4 skipped (blank rows). One date column is flagged — 9 cells unreadable. She fixes the column's date format from the column header menu; the flags clear. The unknown-assignees panel lists 3 names; she links two to existing Resources and creates one.
5. The progress preview says what the file makes of the project's state: 96 rows arrive **complete**, 12 **in progress**, 100 **remaining**. It asks for the two Project settings it cannot guess — it proposes the earliest imported start as the Project start, and **today** as the Data Date, saying which of the two it is proposing and why it is not reading the Data Date out of the file (FR-10, FR-43). She confirms both. She presses *Confirm import*. Nothing was written before this press.
6. **Climax:** Plan opens on the tree grid, Schedule preset. She collapses the sidebar with `[` and the nine schedule columns sit on one screen — summary WPs with rolled-up dates and effort, leaf WPs with dates nobody typed. The strip reads the Project start she just confirmed, today's Data Date, and a computed finish of **12 Mar 2027**. The exceptions rail is not empty: "4 not schedulable yet — no duration", the four rows whose file gave only half a date pair. She walks them with `j`, types four durations into the explainer, and the rail clears. A quiet prompt above the grid — "No Baseline yet" — offers *Set Baseline*; she sets it, and the Baseline compare preset comes alive with a column of zeros. The client's WBS is now a live plan, and it already knows when it ends.
7. Failure: if the hierarchy cannot be read (no WBS codes, no indentation), Confirm is disabled with "Levels could not be read for 208 rows — choose a level source" and a link back to step 2.

### Flow 2 — Linh connects Backlog and maps the plan to Tickets (UJ-2, R0)

1. From the Review's "Connect Backlog" empty state she opens **Connectors** › Add Backlog connector: space URL, API key of a read-only bot user (recommended in the form), project key. For the client-owned space she records who approved it and when — required before the first snapshot.
2. The first snapshot runs with visible progress. Result card: "1,940 Tickets in scope. Hours detected on 92% of Tickets. Opening Balance 1,120h."
3. The Tracker Account panel suggests links to Resources by name/email; she accepts the suggestions in one action.
4. **Mapping** (sidebar, *Actuals*) › Rules: she adds "milestone = Phase2-Sprint3 → WP 2.3". The live preview shows "+214 Tickets, +486h"; she saves.
5. Mapping › Tickets: she drags three remaining Tickets onto WP 2.4.
6. **Climax:** the Coverage view's Scope Ledger Bar reads **87% of hours mapped**; the hatched Unmapped segment lists the rest as Unmapped Tickets with their hours, one click from the Review.
7. Edge: if no Ticket has hours, the result card says "This Backlog space exposes no actual hours. The project runs in Ticket-Count Mode" and explains which metrics remain.

### Flow 3 — Linh prepares Thursday's teirei in twenty minutes (UJ-3, R0 review; R1 publish)

1. Wednesday evening, Linh opens the Project. It lands on the Review for the current Reporting Period, pinned to the snapshot from 42 minutes ago.
2. Status: Schedule ▲ Amber (SPI 0.91), Effort/Cost ◆ Red (CPI all-in 0.84; planned-scope CPI 0.97 shown beside it), Unplanned Work ▲ Amber (12%, 46h, ¥207,000 Internal). The gap between the two CPIs tells her the overrun is Unplanned Work, not the planned scope.
3. The Unplanned Work section's Scope Ledger Bar shows most of it comes from 11 Unmapped Tickets grouped under category "Bug" — fixes on a feature the client added verbally.
4. In the Disposition rail she works by keyboard: selects three Tickets, `m`, picks WP 3.2 — the Unplanned figure animates from 46h to **38h**. She selects the coupon-related Tickets, `p`, names a new WP "Coupon rule changes" (the rail notes they stay Unplanned until the next Re-baseline). Five Tickets `c` as Change Request candidate. The rest `e` with the note "environment issues on client staging".
5. The rail empties: "All Unmapped Work has a Disposition."
6. **Progress & Dates** tells her something the tickets alone did not. WP 4.1 *Payment retries* reads **Observed 60% · Recorded 30%** — nine of fifteen Mapped Tickets resolved, against the 30% the client's Excel carried in March and nobody has touched since. She presses *Accept*, types the reason "QA signed off on retries 16 Sep", and the plan answers: remaining duration 12 days → 5, four work packages moved, cause *progress changed*. Then she advances the Data Date to the Period boundary; it tells her it will re-date 78 remaining work packages before she presses it.
7. **Climax:** she scrolls the report once, top to bottom — Status, Unplanned Work, Ahead/Behind, Progress & Dates, Effort & Cost, Forecast — and it reads like the report she used to spend an evening building, except the 38h of Unplanned Work is in it, explained, and the plan's own dates have caught up with what the team actually did. She exports the xlsx (R0) and attaches it to the meeting invite.
8. R1 continuation: *Preview client view* shows the exact Client View under the "Preview — not published" band; she publishes.
9. Edge: if the snapshot is over 24h old, the pin is amber and both Export and Publish offer *Refresh now* first.

### Flow 4 — Linh answers "so when does it finish now?" (UJ-1 / UJ-3, R0)

The scheduling surface's own flow. It is the one place the product stops reporting and starts computing, so the climax is a number changing, not a screen opening.

1. Tuesday. The client has asked for the API handover to wait two weeks on their side. Linh opens **Plan**, presses `/`, types "handover", lands on WP 3.1 *Client API handover*, and sets its constraint to *must start on* 05 Oct.
2. The What-moved band appears before she has moved her hand: "**86 work packages moved** · computed finish 12 Mar → **26 Mar 2027** · minimum Float +4 → +4". *See what moved* groups them: 85 under *moved by a predecessor*, one under *edited*. Nothing unexplained, and nothing to triage by hand.
3. The exceptions rail now has a first row: **WP 5.2 Final acceptance — late 6 working days**. It is a milestone, so its target was a *must finish on* (§3), and the rail ranks by lateness.
4. `Enter` on it. The explainer: asked for 18 Mar, derived 26 Mar, **6 working days late on the JP+VN calendar, version 3**, and the chain that did it — 3.1 → 3.4 → 4.2 → 5.2, each with its finish and its lag. She walks the chain with the arrow keys and each entry focuses that WP behind the popover. The last line: "This violation stays on this work package. It has not changed any other work package's Float."
5. She had half expected the critical path to jump to this chain. It has not: the Critical column still marks the 4.x run, and the strip still reads "Float measured against the computed finish". The milestone is late; it is not what decides when the project ends. That is the distinction FR-6b keeps violations out of the critical path to protect, and the surface shows it rather than explaining it.
6. **Climax:** she sets the **Project finish** to the contract's 20 Mar 2027. The strip's sentence rewrites itself — "Float measured against the Project finish, 20 Mar 2027" — the minimum Float goes to **−4**, and eleven rows show negative Float with their minus signs. In one line the plan has stopped being a picture and become an argument she can take to Thursday's teirei: *the plan cannot meet the contract date by four working days, and these eleven work packages are why.* She used to reach that sentence, when she reached it at all, by reading a Gantt over a weekend.
7. Edge: had the plan run past the loaded calendar range, the recalculation would have halted and named the range it needs rather than assuming working days (FR-6b, FR-14).
8. Edge: had her edit left an illegal edge behind — a link whose endpoint a re-parent turned into a summary WP — the grid would show the last good schedule marked stale, with the offending edges named, and no dates would have moved at all (FR-6a).

### Flow 5 — Tanaka-san checks the project before Friday's meeting (UJ-4, R1)

1. Tanaka-san clicks the link in a Japanese notification email (no figures in the email) and lands on the latest Published Snapshot in Japanese.
2. The page reads top to bottom: overall status and the three Health Indicators with glyphs and words; milestones; the schedule as a level-2 Gantt; the 計画外作業 indicator reading **10% (38h)** with Linh's note beneath it, and the one-line statement that this effort carries no earned value.
3. **Climax:** in under two minutes he understands where the project stands and why effort is ahead of plan — without asking the vendor.
4. He never sees money, Rates, names, Tickets or internal Risks; editing the URL gives the neutral "Page not found".

### Flow 6 — Linh brings the client in for the first time (UJ-6, R1)

1. After the R0 gate, Linh opens the Project's Client Viewers panel, adds the client's email domain to allowed domains, and invites Tanaka-san. The form states "Your Tenant Admin will be notified."
2. An address outside the allowed domains is refused inline, with the reason.
3. She opens Publish, reviews the Visibility Policy defaults (unchanged), and publishes the first snapshot.
4. **Climax:** Tanaka-san signs in by magic link and the first Published Snapshot opens as his landing page, needing no instructions.

## Open Questions

- ~~**OQ-11 — resolved here, for its design half.**~~ **OQ-11 is closed, both halves, 2026-09-20.** The design half is resolved here: the tree grid, its four presets, dependency and constraint editing, the three schedule exceptions and their explainers, the What-moved band and the Review's *Progress & Dates* section are specified above, and every element carries a Core or Comfort tier. **The cost half closed with `bmad-sprint-planning`**, which sized this surface as its own line item as PRD OQ-11 required: **the FR-6b engine is 92 h and this surface is 98 h — a ratio of 1.07.**

    *Build Tiers* did its job: the sizing produced two numbers, and they settle the question this file was built around. **The surface is not a rounding error on the engine** — it is slightly larger than it. PRD OQ-11's premise, that "the engine being cheap is the reason the surface keeps being costed as though it were", is confirmed rather than assumed. Working: `{planning_artifacts}/oq12-sprint-planning-2026-09-20.md`.
- **The gap threshold** on the Observed-vs-Recorded list (default 10 percentage points) is a starting value, not a researched one. It should move after the first month of real Reviews, and it is a per-Project setting so that it can.
- **The predecessor cell's syntax** is MS-Project-shaped because that is what the PM's Japanese counterparts use in a 工程表. It has not been tried by a second PM. If it turns out to be unlearnable, the answer is to promote the Links panel from Comfort to Core — not to invent a third syntax.
- **The tie-break rule** (PRD OQ-13, `bmad-architecture`) decides the order of equal-Float WPs on the critical path. The surface does not depend on it; FR-15's re-derivation test does. The Critical column's row order is not reproducible until it is written down.
- **Client-facing Japanese wording** for Unplanned Work (計画外作業) and the Explain-note framing — validate with the first client (PRD OQ-3). Blocks R1 copy, not R0.
- **Reporting Period cadence** (PRD OQ-6): the Period picker supports weekly now; biweekly/monthly would change the picker and the period-change captions.
- **Client sign-in** (PRD OQ-8): if Microsoft-only is required, Flow 6 step 4 changes.
- **Headless primitive library** to be confirmed by architecture.
