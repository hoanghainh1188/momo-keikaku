# Overnight autonomous run — 2026-09-20

The founder authorised an unattended run of the remaining BMAD phases overnight (UX → architecture → epics/stories → sprint planning → build) with the goal of a runnable demo by morning. Gates were NOT stopped at; every decision taken on the founder's behalf is logged below for morning review.

Branch: `feat/r0-demo` (main untouched).

## Decisions taken on the founder's behalf
- Demo scope = R0 wedge vertical slice, runnable locally with one command; tracker data comes from recorded Backlog-shaped fixtures (no live Backlog — OQ-2 still open, no credentials used).
- UX and architecture run in headless mode in parallel; epics/stories and sprint planning follow.

## Log
- UX: [ASSUMPTION] Working mode = fast path (headless): creative tools off, no HTML mockups or wireframes produced; spines are the only contract.
- UX: [ASSUMPTION] Stakes = B2B tool, founder-only in R0 then client-facing in R1 (not regulated); Reviewer Gate and bmad-review polish lenses skipped in the overnight run.
- UX: [ASSUMPTION] Visual direction = "Ledger Paper": editorial Japanese business-report sheet (帳票) with Swiss precision; hairline rules, dense tabular figures, data viz as the primary ornament.
- UX: [ASSUMPTION] Palette = warm paper surface + sumi ink text + a single 藍 (ai) indigo primary for actions and Current Plan; no decorative accent colour.
- UX: [ASSUMPTION] Unplanned Work is encoded in 藤 (fuji) violet with a diagonal hatch, never red or amber, so it reads as information about plan accuracy rather than a fault.
- UX: [ASSUMPTION] Health colours are muted report-style green / amber / red and always paired with a shape glyph (circle / triangle / diamond) and a word, per NFR-U1.
- UX: [ASSUMPTION] Baseline bars render as hollow outlines, Current Plan as solid indigo bars, earned progress as an ink fill inside the Current Plan bar.
- UX: [ASSUMPTION] Typography = Shippori Mincho B1 (report titles and section headings only) + IBM Plex Sans JP (all UI, tables and numbers, tabular figures); two families, both OFL.
- UX: [ASSUMPTION] Density = compact: 4px base unit, 13px table text, 14px body; PM screens are information-dense by design.
- UX: [ASSUMPTION] Shape = 2px corners on controls, 0 on sheets and tables; no shadows except floating overlays (popover, drawer, dialog).
- UX: [ASSUMPTION] Theme = light only for R0 and R1; dark mode deferred, tokens named so a dark set can be added later.
- UX: [ASSUMPTION] Form factor = desktop web (1280px+ primary, 1024px minimum) for PM screens; Client View (R1) responsive and read-only down to 360px.
- UX: [ASSUMPTION] UI system = no inherited visual kit; behaviour built on an accessible headless primitive library (Radix-class); architecture to confirm the library.
- UX: [ASSUMPTION] The Reconciliation Review is the project landing surface and is laid out as the four report pages clients already read (Status, Ahead/Behind, Effort & Cost, Forecast) plus an Unplanned Work section and a Disposition queue rail.
- UX: [ASSUMPTION] Signature visual = the Scope Ledger Bar: one 100% bar of the four FR-20 buckets (mapped baselined / mapped non-baselined / catch-all / unmapped) with the Unplanned part hatched; it appears on Review, Mapping and Connector surfaces.
- UX: [ASSUMPTION] Money in PM views is shown by default (UJ-3 shows ¥), always tagged with an "Internal" marker, and can be hidden per user with a toggle.
- UX: [ASSUMPTION] Disposition keyboard shortcuts: M (Map), P (Plan), C (Change Request candidate), E (Explain), J/K to move through the queue.
- UX: [ASSUMPTION] Client View Japanese label for Unplanned Work uses the draft 計画外作業 pending validation with the first client (PRD OQ-3, addendum B).
- UX: [ASSUMPTION] Excel import is a three-step flow (Sheet & header row, Column mapping, Import Preview); nothing is written until the explicit Confirm import action on step 3.
- UX: [ASSUMPTION] Publish preview (R1) renders the exact Client View inside a framed sheet with a persistent "Preview, not published" band; publish is a separate confirm dialog.
- UX: [ASSUMPTION] Accessibility floor = WCAG 2.1 AA as set by PRD NFR-U1 (not 2.2).
- UX: [ASSUMPTION] Charts = cumulative EVM S-curve (PV / EV / AC with the Unplanned band stacked on AC), bars and tables only; no pies, donuts, gauges or speedometers.
- UX: [ASSUMPTION] Gantt default time scale = weeks, with JP and VN holidays shaded in two distinguishable patterns; the tree grid is the accessible equivalent of the Gantt.
- UX: [ASSUMPTION] Product name stays a working title; no logo or wordmark is defined, the wordmark is set in the display face.
- UX: [ASSUMPTION] Journey protagonists (Linh, Tanaka-san, Hoang) are taken verbatim from PRD UJ-1..UJ-6, which the PRD marks illustrative.
- RESEARCH: a sub-agent downloaded Nulab's public PDF new-plans-2027.pdf (~1.8 MB, backlog.com official) into the session scratchpad without asking first — flagged for the founder; no other downloads.
- UX: [ASSUMPTION] Navigation = no persistent left sidebar; project views are horizontal tabs like workbook sheet tabs (Review, Plan, Mapping, Baselines, Connectors, ...), Review is the landing tab.
- UX: [ASSUMPTION] In the Review, the Unplanned Work section sits directly after Status and before Ahead/Behind, Effort & Cost and Forecast.
- UX: [ASSUMPTION] Dispositions are undoable from the group history until the Review's next publish or export; Map applies immediately with an in-place figure update.
- UX: [ASSUMPTION] Review and Client View get an A4-landscape print stylesheet because upward reporting is still document-based.
- UX: [ASSUMPTION] PM editing is not supported below 1024px (read-only single-column Review with a notice); drag-and-drop only for Ticket-to-WP mapping and Gantt bar dates, both with keyboard equivalents.
