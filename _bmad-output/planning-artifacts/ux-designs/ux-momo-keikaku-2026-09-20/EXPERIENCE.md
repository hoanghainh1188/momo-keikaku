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

## Foundation

- **Form factor.** Web application. PM and Tenant Admin screens are desktop-first: designed for 1280px+ and supported down to 1024px [ASSUMPTION]. The Client View (R1) is responsive and read-only down to 360px, because Tanaka-san may open it on a phone before the meeting [ASSUMPTION].
- **UI system.** No inherited visual kit. Behaviour (focus management, menus, dialogs, popovers, tabs, comboboxes) is built on an accessible headless primitive library (Radix-class); architecture confirms the library [ASSUMPTION]. `DESIGN.md` is the visual identity reference.
- **Releases.** R0 is founder-only, English UI, Tenant Admin + PM roles. R1 adds the Client Viewer, Visibility Policy, Publish, Client View (EN/JA), Risks and Issues. Every surface below is tagged with its release; R0 builds nothing tagged R1 or Post-Q1, but R0 layouts reserve the space R1 needs (for example the Publish action slot on the Review).
- **Locale.** R0: English only, but every string is externalised and every layout is checked with Japanese strings of +30% length (NFR-I1). Dates: `19 Sep 2026` (EN) / `2026/09/19` (JA). Times always show the Project time zone (default JST).

## Information Architecture

Hierarchy: Tenant › Project › project surfaces. The project is the unit of work, and its surfaces live in a **collapsible left sidebar** (founder decision, 2026-09-20, replacing the horizontal workbook-style tab strip). Visual spec in `DESIGN.md` › Layout & Spacing and › Components.

- **What is in the sidebar:** every project surface, grouped in the order a weekly cycle uses them. *Review* stands alone at the top (it is the landing surface); then **Plan** (Plan, Baselines, Import), **Actuals** (Mapping, Connectors), **Report** (Export, and in R1 Publish, Published Snapshots, Risks & Issues), with **Project settings** pinned to the bottom. R1 and Post-Q1 surfaces are absent in R0, not greyed out. Post-Q1 Department view is a Home surface, not a project one, and never appears here.
- **What is not:** the top bar keeps the project switcher, the snapshot pin and the user menu (Admin surfaces and the money toggle stay in the user menu). Cross-project surfaces never enter the sidebar — switching project is a top-bar act, moving inside a project is a sidebar act.
- **Why it collapses:** the Gantt and the wide tables are the reason. Collapsing returns 176px to the content area and is the expected posture on Plan and on the Review's wide tables. The state is per user, persisted, and survives navigation and reload; it never changes on its own except at the breakpoints in *Responsive & Platform*, and a manual toggle always wins until the user crosses a breakpoint again.
- **Ordering and depth:** one level only. Mapping's three sub-views (Tickets, Rules, Coverage) are tabs *within* the Mapping surface, not sidebar children; Import's steps are a wizard within Import. The sidebar never nests.

| Surface | Release | Reached from | Purpose | PRD |
|---|---|---|---|---|
| Projects (home) | R0 | Sign-in; logo | List of the user's Projects, each with overall status glyph, Unplanned Work share, snapshot age and last review date | FR-1 |
| **Review** (Reconciliation Review) — project landing surface | R0 | Project row; sidebar; `g r` | The wedge. One Reporting Period, pinned to one Tracker Snapshot, laid out as the report pages plus the Disposition queue | FR-28–32, FR-20, FR-26 |
| Plan | R0 | Sidebar; `g p` | Tree grid + Gantt of the Current Plan against the active Baseline; WP editing; Custom Fields; Milestones | FR-5, FR-7, FR-8 |
| Mapping | R0 | Sidebar; `g m`; any "Unmapped" link | Three sub-views: Tickets (map / remap / unmap), Rules (ordered list with preview), Coverage (per Connector) | FR-21–24, FR-13 |
| Baselines | R0 | Sidebar; Plan toolbar | Baseline history (author, time, reason), Set Baseline / Re-baseline, compare any two versions WP by WP | FR-15, FR-16 |
| Import | R0 | Sidebar (Plan group); Plan toolbar "Import / Re-import"; empty-project state | Upload → Sheet & header → Column mapping → Import Preview (or Re-import diff) → Confirm | FR-9–11 |
| Connectors | R0 | Sidebar; snapshot pin; connector error banner | Backlog Connector setup, scope, approval record, hours detection result, snapshot history, credential rotation, Tracker Account linking | FR-17, FR-19, FR-42, FR-13 |
| Export | R0 | Review toolbar; sidebar (Report group) | Fixed-layout xlsx report; raw data export | FR-38, FR-39 |
| Project settings | R0 | Sidebar (pinned to the bottom) | Holiday Calendar, Reporting Period cadence, EAC Method (Typical only in R0), Catch-all defaults | FR-14, FR-30 |
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

### Review — page structure

The Review mirrors the four report pages PMs rebuild by hand every week (addendum B), plus the wedge section, in this fixed order [ASSUMPTION]. Each numbered section below opens with a `{typography.section-title}` and its 1px ink rule; with a single type family that rule is what separates the pages, so it is required markup, not styling (`DESIGN.md` › Typography).

1. **Header.** Report title (Project name + Reporting Period, `{typography.report-title}`), Reporting Period picker, snapshot pin, Contract Type, toolbar (Refresh snapshot, Export xlsx, Preview client view [R1]).
2. **Status.** Three Health Indicators + overall status, each with its rule caption. Headline figures: SPI, CPI (all-in), Unplanned Work share and hours.
3. **Unplanned Work** (placed directly after Status because it is the reason the report exists) [ASSUMPTION]. Scope Ledger Bar; the three Unplanned components (Unmapped Work, non-baselined WPs, Catch-all overflow); Unmapped Work grouped by Tracker attribute (milestone, category, issue type…), expandable to Tickets; Opening Balances per Connector; "left scope" and scope-change notices.
4. **Ahead / Behind.** SV, SPI, Milestones table (Baseline date, current date, done date, slip), Divergence by WP (Baseline vs Current Plan vs actual), forecast finish next to SPI.
5. **Effort & Cost.** EVM table (PV, EV, AC, CV, CPI all-in, CPI planned scope, TCPI) in hours; money column pair marked Internal; EVM S-curve.
6. **Forecast.** EAC (method named), ETC, VAC, forecast finish (labelled "trend heuristic, not a PMI formula").
7. **Disposition rail** (right, 360px): queue of undispositioned Unmapped Ticket groups, sorted by hours descending.

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
| Tree grid | Plan, Import Preview, Baseline compare | Expand/collapse per row and "expand to level N". Inline edit on double-click or `Enter`; `Esc` cancels; save on blur or `Enter`. Columns chooser for Custom Fields; group by any single-select Custom Field. |
| Gantt | Plan | Synchronised vertical scroll with the tree grid. Time scale: day / week (default) / month [ASSUMPTION]. Dragging a Current Plan bar edits dates (R0); the Baseline bar is never draggable. Hover shows Baseline vs Current dates and effort. |
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
| No Baseline yet | Review, Plan | Review replaces EVM with "No Baseline yet. EVM starts once you set one." + *Set Baseline*. Unplanned Work section still shows Unmapped Work. Gantt shows Current Plan only with a note. |
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
- `Esc` — closes the topmost popover, drawer or dialog; one modal level only, never stacked.
- Drag-and-drop exists in exactly two places: Tickets onto WPs in Mapping (UJ-2) and Current Plan bars in the Gantt. Both have keyboard equivalents (Map action; date fields).
- No infinite scroll: Ticket and WP lists virtualise within a page; lists over 500 rows paginate.
- Motion: 150ms opacity/transform transitions for popovers and drawers only; figure updates after a Disposition use a 300ms highlight on the changed cells. Reduced-motion users get instant changes.

## Accessibility Floor

WCAG 2.1 AA (PRD NFR-U1) [ASSUMPTION: 2.1 as set by PRD, not 2.2]. Visual contrast is specified in `DESIGN.md` › Colors.

- **Never colour alone.** Health states carry glyph + word; Unplanned Work carries hatch + label; Baseline vs Current Plan differ by outline vs fill and by position; JP vs VN holidays differ by pattern.
- **Every chart has a table.** The Gantt's equivalent is the tree grid; the S-curve and Scope Ledger Bar each have a "Show as table" toggle, and their figures also appear in adjacent text.
- **Tables are real tables** with column and row headers; the tree grid follows the ARIA treegrid pattern with `aria-level` and `aria-expanded`.
- **Focus.** Visible focus ring on every interactive element (`{colors.focus-ring}`); focus returns to the invoking element when a popover or dialog closes; tab order follows the report reading order.
- **Navigation landmarks.** The sidebar is a `<nav>` with an accessible name, the current surface carries `aria-current="page"`, and the toggle exposes `aria-expanded`. A "Skip to content" link precedes it so keyboard and screen-reader users are never made to walk the whole nav on every surface. Collapsing is a visual state only: item names stay in the accessible tree, so a collapsed sidebar is never a loss of information, and the `g` shortcuts reach every surface regardless.
- **Live regions.** Disposition results and figure changes are announced politely ("Unplanned Work now 38 hours, 10 percent").
- **Language.** `lang` attributes set per string so JA screen-reader voices engage on Japanese content (R1).
- **Reduced motion** respected. Text resizes to 200% without loss of content in the Client View; PM screens allow horizontal scroll in wide tables only.

## Responsive & Platform

Widths below are viewport widths. Every PM layout decision is taken on the **content area** (viewport minus the sidebar), because the sidebar is in the flow, not over it. The Client View has no sidebar, so its column is unaffected.

| Width | Left sidebar | PM screens | Client View (R1) |
|---|---|---|---|
| ≥ 1440px | Expanded by default (224px) | Review sheet + Disposition rail; Plan tree + Gantt side by side | Single column, max 960px |
| 1280–1439px | Collapses to the 48px icon rail by default | Same: the collapse is what keeps the Disposition rail and the tree + Gantt pairing alive at this width. Expanding by hand drops the Disposition rail to a drawer — an acceptable trade the user made | Same |
| 1024–1279px | Icon rail; expanding is an overlay, not a push | Disposition rail becomes a right drawer (toggle in toolbar); Plan shows tree or Gantt with a split toggle | Same |
| < 1024px | Overlay drawer from the top bar, closed by default | Not supported for editing (founder decision, 2026-09-20 — unchanged by the sidebar): a notice suggests a larger screen; Review readable in a single column | Single column; Gantt simplified to milestone list + level-1 bars; tables scroll horizontally inside their frame |

The default at each breakpoint applies only while the user has not toggled the sidebar at that width; once they have, their choice is kept until the viewport crosses a breakpoint again. The sidebar never animates the content area's width on load — it renders in its remembered state, so no layout shift is introduced (`DESIGN.md` › Elevation & Depth).

Print: the Review and Client View have a print stylesheet (A4 landscape) that reproduces the report pages, since upward reporting is still document-based [ASSUMPTION]. The sidebar, top bar and Disposition rail do not print.

## Inspiration & Anti-patterns

- **Lifted from the Japanese business report (報告書 / 帳票):** ruled tables, the status column, the fixed page order clients already read. Not the mincho heading face — the report's discipline reads through structure, and a second family was decoration (founder decision, 2026-09-20).
- **Lifted from Excel workbooks:** a tree grid that behaves like an outline, column choosers, keyboard-first editing. The PM lives in Excel today; the tool should feel like the best-kept workbook. Not the sheet-tab strip: the project has a dozen surfaces of unequal weight, which a left sidebar groups and a tab strip only crowds (founder decision, 2026-09-20).
- **Lifted from editorial data journalism:** direct labels instead of legends, annotated charts, the formula shown next to the figure.
- **Rejected — KPI tile dashboards and gauges:** they hide how a number was made; every figure here is explainable.
- **Rejected — person-level Unplanned Work, leaderboards, productivity scores:** violates PRD §7.1 and §9; Unplanned Work is about the plan's accuracy.
- **Rejected — "Sync" language and sync-style progress spinners as the headline:** PRD §7.1; the headline is Unplanned Work against a real Baseline.
- **Rejected — auto-applying imports, rules or AI suggestions:** every change to reported numbers is an explicit PM action with a preview.

## Trust & Visibility Boundaries

Product-specific section: what can and cannot cross from PM views to client surfaces (FR-34, §7.2).

- PM screens mark every money figure and PM-only section "Internal". The Publish preview renders from the same Visibility Policy the Client View uses, so "what you preview is what they see" is literal, not a mock.
- Visibility Policy toggles (R1) live only on the Publish surface, grouped as *Shown by default*, *Optional (off)* and *Never shown* — the last group is listed read-only, so the PM can see what is protected without being able to turn it on.
- The Unplanned Work indicator is not a toggle. Its row in the Policy reads "Always counted in Health Indicators. You control notes and detail, not whether it counts."
- The Client View states that views are recorded (FR-36), in its footer.

## Key Flows

Protagonists are PRD §2.3's illustrative personas, used verbatim.

### Flow 1 — Linh turns the client's Excel WBS into a live plan (UJ-1, R0)

1. Linh opens a new, empty Project. It lands on the Review; she picks **Plan** in the left sidebar, which shows "Import an Excel WBS" as the primary action.
2. She drops the client's .xlsx. Step 1 finds two sheets with data and asks which one is the WBS; she picks 「WBS」 and confirms header row 3 from the row preview.
3. Step 2 shows each column with sample values and a suggested field: WBS番号 → WBS code, 作業名 → name, 開始日 / 終了日 → start / finish, 工数 → effort, 担当 → assignee. 担当会社 has no match and defaults to "Create Custom Field".
4. Step 3, the Import Preview: 212 rows read, 208 to import, 4 skipped (blank rows). One date column is flagged — 9 cells unreadable. She fixes the column's date format from the column header menu; the flags clear. The unknown-assignees panel lists 3 names; she links two to existing Resources and creates one.
5. She presses *Confirm import*. Nothing was written before this press.
6. **Climax:** Plan opens on the tree grid with the Gantt beside it — she collapses the sidebar with `[` and the Gantt takes the width back; summary WPs show rolled-up dates and effort. A quiet prompt above the Gantt — "No Baseline yet" — offers *Set Baseline*; she sets it, and hollow Baseline outlines appear under every solid bar. The client's WBS is now a live plan.
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
6. **Climax:** she scrolls the report once, top to bottom — Status, Unplanned Work, Ahead/Behind, Effort & Cost, Forecast — and it reads like the report she used to spend an evening building, except the 38h of Unplanned Work is in it, explained. She exports the xlsx (R0) and attaches it to the meeting invite.
7. R1 continuation: *Preview client view* shows the exact Client View under the "Preview — not published" band; she publishes.
8. Edge: if the snapshot is over 24h old, the pin is amber and both Export and Publish offer *Refresh now* first.

### Flow 4 — Tanaka-san checks the project before Friday's meeting (UJ-4, R1)

1. Tanaka-san clicks the link in a Japanese notification email (no figures in the email) and lands on the latest Published Snapshot in Japanese.
2. The page reads top to bottom: overall status and the three Health Indicators with glyphs and words; milestones; the schedule as a level-2 Gantt; the 計画外作業 indicator reading **10% (38h)** with Linh's note beneath it, and the one-line statement that this effort carries no earned value.
3. **Climax:** in under two minutes he understands where the project stands and why effort is ahead of plan — without asking the vendor.
4. He never sees money, Rates, names, Tickets or internal Risks; editing the URL gives the neutral "Page not found".

### Flow 5 — Linh brings the client in for the first time (UJ-6, R1)

1. After the R0 gate, Linh opens the Project's Client Viewers panel, adds the client's email domain to allowed domains, and invites Tanaka-san. The form states "Your Tenant Admin will be notified."
2. An address outside the allowed domains is refused inline, with the reason.
3. She opens Publish, reviews the Visibility Policy defaults (unchanged), and publishes the first snapshot.
4. **Climax:** Tanaka-san signs in by magic link and the first Published Snapshot opens as his landing page, needing no instructions.

## Open Questions

- **Client-facing Japanese wording** for Unplanned Work (計画外作業) and the Explain-note framing — validate with the first client (PRD OQ-3). Blocks R1 copy, not R0.
- **Reporting Period cadence** (PRD OQ-6): the Period picker supports weekly now; biweekly/monthly would change the picker and the period-change captions.
- **Client sign-in** (PRD OQ-8): if Microsoft-only is required, Flow 5 step 4 changes.
- **Headless primitive library** to be confirmed by architecture.
