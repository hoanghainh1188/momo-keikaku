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

---

## BUILD: R0 demo (feat/r0-demo)

Decisions and deviations from building the runnable R0 demo. Command: `pnpm demo`.

### BUILD: correctness fixes taken from the architecture reviews
- **BUILD:** Adversarial review **H3** honoured. A ledger entry's active Baseline is chosen
  **by sequence** (`max(seq)` of committed `baseline_version`), never by comparing the
  fixture's `observedAt` against the Baseline's `recorded_at`. Under the timestamp
  reading every fixture entry would carry no active Baseline, 100% of hours would be
  Unplanned Work, and the demo would show a red indicator no amount of mapping could
  clear. Covered by a unit test.
- **BUILD:** Reconcile review **G-5** honoured, fix (a) + (b). Fixture files store
  `observedAtOffsetHours` relative to a demo anchor rather than absolute instants, and
  the anchor is a **fixed clock** stored on the project row (`project.demo_anchor` =
  `2026-09-16T09:00Z`, Wednesday 18:00 JST — Linh's UJ-3 moment). Without this the
  snapshot is permanently stale, the 24h warning always fires and the current Reporting
  Period is empty.
- **BUILD:** All other review findings left unfixed and marked in code as
  `TODO(review-adversarial H1/H4)` etc.: the per-project advisory lock for `seq`
  allocation and rule evaluation (H1, H4), RLS and the non-owner role (AD-3),
  append-only triggers and grants (AD-5), pg-boss (AD-2), connector scope history (G-3),
  tracker-account link history (G-4). Safe only because the demo is single-user.

### BUILD: deviations from the architecture spine
- **BUILD:** pnpm **9.15** (spine says 12.4.2), Next **15.5** (spine says 16.3.5),
  TypeScript 5.7 (spine says 6.0.3) — what this machine and the registry have.
  Postgres **18.6** matches the spine.
- **BUILD:** Effort is integer `number` milli-hours, not `bigint` (AD-4). Exact to 2^53
  mh; avoids bigint friction through Drizzle and JSON. Integer milli-hours and the
  single rounding site in `domain/present` are unchanged.
- **BUILD:** No `apps/worker`. Ingest runs inside the seed, as the build brief directed.
  The `ingestSnapshot` function itself is unchanged and would move to the worker as-is.
- **BUILD:** Schema applied with `drizzle-kit push`, not versioned migrations. Fine for a
  demo that is always seeded from clean; R0 proper needs migration files.
- **BUILD:** Project time zone handled as a fixed +09:00 offset rather than a tz
  database. `domain/calendar` takes the offset as a parameter, so this is swappable.
- **BUILD:** `dependency-cruiser` not installed; the import graph is respected by hand
  (`packages/domain` imports nothing from the workspace and does no I/O).
- **BUILD:** Strings are inline English. i18n was a non-goal, but they are **not** yet
  externalised into `messages/{en,ja}.json`, so "leave strings ready" is only partly met.

### BUILD: ports
- **BUILD:** Web app on **3101**, not 3100. Port 3100 on this machine is held by an
  unrelated service (`packages/server/dist/index.js`, PID 51090) that was not mine to
  stop. Overridable with `PORT=… pnpm demo`.
- **BUILD:** Postgres published on host **55433** (another Postgres container is already
  running here). The compose volume mounts `/var/lib/postgresql`, not
  `/var/lib/postgresql/data`, which postgres:18 requires.

### BUILD: UI decisions applied (from the founder, mid-build)
- **BUILD:** "Ledger Paper, lighter" applied to every screen built: Review, Plan, Mapping,
  Baselines, Connectors, Client View preview. One sans family (IBM Plex Sans JP, EN+JA),
  no Shippori Mincho; neutral near-white ground instead of warm paper, with the sheet
  distinguished by hairline rules; a collapsible **left sidebar** instead of the
  horizontal Excel-style tab strip, keeping the top bar's project switcher and snapshot
  pin. Kept: single indigo action colour, Unplanned Work in 藤 violet with the diagonal
  hatch and never red/amber, square corners, right-aligned tabular figures, a formula
  caption under every metric, charts in the same inks as the tables, Scope Ledger Bar as
  the signature element. No screens were built the old way, so nothing needed adjusting.

### BUILD: demo dataset
- **BUILD:** The dataset is generated deterministically (`pnpm fixtures:generate`) and
  committed, so the seed and the golden tests read the same bytes. Tuned so the wedge is
  legible: SPI 0.91, CPI all-in 0.80 against planned-scope 0.92, Unplanned Work 16.8% of
  the period and 13.0% cumulative, with **all three** components non-zero
  (166.0h unmapped, 50.8h Catch-all overflow, and 0.0h non-baselined until the PM uses
  the *Plan* disposition, which is the point of that disposition).
- **BUILD:** The UJ-3 numbers from the PRD (CPI 0.84 / planned-scope 0.97 / 46h) were
  treated as illustrative and not forced; the generated figures tell the same story.
- **BUILD:** A Catch-all WP's Tickets deliberately exceed its LOE Baseline hours so the
  third component of Unplanned Work is visible. Catch-all WPs are measured as Level of
  Effort (EV = PV), per the Glossary.

### BUILD: not built
- **BUILD:** Excel import (FR-9–11) and xlsx export (FR-38/39) — the stretch items, not
  reached. Also: auth, RLS, publishing persistence, Re-baseline, on-demand snapshot
  refresh, Jira, AI import, Department roll-up.
