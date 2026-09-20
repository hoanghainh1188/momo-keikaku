---
name: momo-keikaku — Ledger Paper
description: Visual identity for momo-keikaku, a plan-vs-actuals reconciliation and reporting tool for PMs/BrSEs running Japanese client projects. An editorial, report-sheet (帳票) aesthetic with Swiss precision, set in one neutral sans on a neutral ground; data visualisation is the primary ornament.
status: final
created: 2026-09-20
updated: 2026-09-20
sources:
  - {planning_artifacts}/prds/prd-momo-keikaku-2026-09-19/prd.md
  - {planning_artifacts}/prds/prd-momo-keikaku-2026-09-19/addendum.md
  - {planning_artifacts}/briefs/brief-momo-keikaku-2026-09-19/brief.md
peer: EXPERIENCE.md
colors:
  # Surfaces — paper, sheet, sunk (neutral greys; the sheet is told apart by rules, not warmth)
  paper: '#F5F5F5'
  sheet: '#FFFFFF'
  paper-sunk: '#EBEBEB'
  rule: '#D6D6D6'
  rule-strong: '#8F8F8F'
  # Ink
  ink: '#1D1F23'
  ink-muted: '#5A5D63'
  ink-faint: '#8A8C90'
  # Primary — 藍 ai indigo (actions, Current Plan)
  primary: '#1F3A5F'
  on-primary: '#FFFFFF'
  primary-soft: '#E3E9F1'
  selection: '#DCE6F2'
  focus-ring: '#2B6CB0'
  # Plan semantics
  baseline: '#6E7580'
  current-plan: '#1F3A5F'
  earned: '#1D1F23'
  # Unplanned Work — 藤 fuji violet (information, never alarm)
  unplanned: '#6B4E9B'
  on-unplanned: '#FFFFFF'
  unplanned-soft: '#ECE6F4'
  # Health — report-style muted RAG, always with glyph + word
  health-green: '#2F6B45'
  health-green-soft: '#E3EFE6'
  health-amber: '#8A5A00'
  health-amber-glyph: '#D9A21B'
  health-amber-soft: '#F8EDD3'
  health-red: '#A8322A'
  health-red-soft: '#F6E1DE'
  health-unavailable: '#8A8C90'
  # Calendar shading
  holiday-jp: '#F3E6E3'
  holiday-vn: '#E6EEE4'
  weekend: '#F0F0F0'
typography:
  report-title:
    fontFamily: IBM Plex Sans JP
    fontSize: 28px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  section-title:
    fontFamily: IBM Plex Sans JP
    fontSize: 18px
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: 0.01em
  figure-xl:
    fontFamily: IBM Plex Sans JP
    fontSize: 32px
    fontWeight: '500'
    lineHeight: '1.1'
    letterSpacing: -0.01em
  figure-md:
    fontFamily: IBM Plex Sans JP
    fontSize: 20px
    fontWeight: '500'
    lineHeight: '1.2'
  body:
    fontFamily: IBM Plex Sans JP
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.6'
  table:
    fontFamily: IBM Plex Sans JP
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.45'
  table-figure:
    fontFamily: IBM Plex Sans JP
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1.45'
  label:
    fontFamily: IBM Plex Sans JP
    fontSize: 11px
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: 0.06em
  caption:
    fontFamily: IBM Plex Sans JP
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.45'
rounded:
  none: 0px
  sm: 2px
  DEFAULT: 2px
  full: 9999px
spacing:
  unit: 4px
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '6': 24px
  '8': 32px
  '12': 48px
  row-height: 32px
  row-height-compact: 28px
  sheet-margin: 32px
  sheet-max-width: 1440px
  rail-width: 360px
  topbar-height: 48px
  sidebar-width: 224px
  sidebar-width-collapsed: 48px
  gutter: 24px
  margin-mobile: 16px
components:
  button-primary:
    background: '{colors.primary}'
    foreground: '{colors.on-primary}'
    radius: '{rounded.sm}'
    height: 32px
    typography: '{typography.body}'
  button-secondary:
    background: '{colors.sheet}'
    foreground: '{colors.primary}'
    border: '1px solid {colors.rule-strong}'
    radius: '{rounded.sm}'
    height: 32px
  button-quiet:
    background: transparent
    foreground: '{colors.ink}'
    radius: '{rounded.sm}'
  sheet:
    background: '{colors.sheet}'
    border: '1px solid {colors.rule}'
    radius: '{rounded.none}'
    padding: '{spacing.sheet-margin}'
  nav-sidebar:
    background: '{colors.paper-sunk}'
    border-right: '1px solid {colors.rule}'
    radius: '{rounded.none}'
    width: '{spacing.sidebar-width}'
    width-collapsed: '{spacing.sidebar-width-collapsed}'
    group-label: '{typography.label}'
    group-rule: '1px solid {colors.rule}'
  nav-item:
    height: 32px
    radius: '{rounded.none}'
    foreground: '{colors.ink}'
    typography: '{typography.body}'
    icon: 16px
    hover: '{colors.selection}'
    active-background: '{colors.sheet}'
    active-marker: '2px solid {colors.primary}'
    active-foreground: '{colors.primary}'
    disabled-foreground: '{colors.ink-faint}'
  health-badge:
    typography: '{typography.label}'
    radius: '{rounded.sm}'
    green: { background: '{colors.health-green-soft}', foreground: '{colors.health-green}', glyph: circle }
    amber: { background: '{colors.health-amber-soft}', foreground: '{colors.health-amber}', glyph: triangle }
    red: { background: '{colors.health-red-soft}', foreground: '{colors.health-red}', glyph: diamond }
    unavailable: { background: '{colors.paper-sunk}', foreground: '{colors.ink-muted}', glyph: dash }
  metric-cell:
    value: '{typography.figure-md}'
    label: '{typography.label}'
    formula: '{typography.caption}'
    border-top: '1px solid {colors.ink}'
  scope-ledger-bar:
    height: 16px
    radius: '{rounded.none}'
    mapped-baselined: '{colors.current-plan}'
    mapped-non-baselined: '{colors.unplanned}'
    catch-all: '{colors.baseline}'
    unmapped: '{colors.unplanned}'
    unplanned-hatch: '45deg, 2px stripe, {colors.on-unplanned} at 35% over {colors.unplanned}'
  gantt-bar-baseline:
    fill: transparent
    border: '1px solid {colors.baseline}'
    height: 6px
  gantt-bar-current:
    fill: '{colors.current-plan}'
    height: 10px
    earned-fill: '{colors.earned}'
  gantt-milestone:
    shape: diamond
    size: 10px
    fill: '{colors.ink}'
  unplanned-chip:
    background: '{colors.unplanned-soft}'
    foreground: '{colors.unplanned}'
    radius: '{rounded.sm}'
    typography: '{typography.label}'
  internal-marker:
    foreground: '{colors.ink-muted}'
    border: '1px dashed {colors.rule-strong}'
    typography: '{typography.label}'
    radius: '{rounded.sm}'
  snapshot-pin:
    background: '{colors.paper-sunk}'
    foreground: '{colors.ink}'
    typography: '{typography.caption}'
    radius: '{rounded.sm}'
  table-header:
    background: '{colors.paper-sunk}'
    foreground: '{colors.ink-muted}'
    typography: '{typography.label}'
    border-bottom: '1px solid {colors.ink}'
  table-row:
    height: '{spacing.row-height}'
    border-bottom: '1px solid {colors.rule}'
    selected: '{colors.selection}'
  flag-cell:
    border-left: '3px solid {colors.health-amber-glyph}'
    background: '{colors.health-amber-soft}'
  preview-band:
    background: '{colors.primary}'
    foreground: '{colors.on-primary}'
    typography: '{typography.label}'
  input:
    background: '{colors.sheet}'
    border: '1px solid {colors.rule-strong}'
    border-focus: '2px solid {colors.focus-ring}'
    radius: '{rounded.sm}'
    height: 32px
---

# momo-keikaku — Visual Identity (DESIGN.md)

Peer spine: [`EXPERIENCE.md`](EXPERIENCE.md) owns how things work; this file owns how they look. Both spines win over any mock, wireframe or import. No mockups were produced in this run (headless fast path) [ASSUMPTION].

## Brand & Style

momo-keikaku is the place where a Japanese client project's plan, the work actually done, and the numbers agree. The people who read it — a Vietnamese PM/BrSE preparing Thursday's teirei, a Japanese client owner checking before Friday's meeting — already trust one visual genre: the printed business report (報告書, 帳票). Ruled tables, figures that line up, a status column, a stamp-like sense of "this was checked." The product earns trust by looking like the most careful version of that document, not like a SaaS dashboard.

The direction is **Ledger Paper, lighter** (founder decision, 2026-09-20): an editorial report sheet with Swiss/International precision, set in one neutral sans on a neutral ground. The discipline of the report is kept; its costume is not. Two things were deliberately dropped: the mincho "報告書 voice" (a second, serif display family) and the warm paper tint. Both were doing by decoration what rules, alignment and figures already do by structure.

- **The screen is a sheet of paper.** Content sits on white sheets laid on a neutral near-white ground. The sheet is told apart from the ground by its rule and its edge, not by warmth. Structure comes from hairline rules and alignment, not from cards, shadows or tinted boxes.
- **Numbers are the headline.** Figures are large, tabular and right-aligned. Every figure can show its formula and inputs; the design gives the formula a quiet but permanent place (caption line under the value), because the PRD requires every metric to be explainable.
- **Data visualisation is part of the type system.** The Scope Ledger Bar, the EVM S-curve and the Baseline-vs-Current Gantt are drawn with the same inks, rules and weights as the tables around them. Charts are never decorative panels.
- **Calm about Unplanned Work.** Unplanned Work is information about how accurate the plan is, never a judgement of people (PRD §7.1). It has its own hue — 藤 (fuji) violet with a hatch — deliberately outside the red/amber alarm vocabulary.
- **Restraint.** One action colour (藍 ai indigo), one type family. No gradients, no illustrations, no emoji, no celebratory motion. The product is a tool a client will audit.

What this is not: a KPI-tile dashboard, a cards-in-a-grid template, a "productivity analytics" surface, or anything that ranks people. It does carry a left sidebar (founder decision, 2026-09-20) — but a ruled, collapsible index of the project's surfaces, not a decorated app shell.

## Colors

The palette is neutral surfaces, ink and a small set of semantic hues. The greys carry no hue at all (founder decision, 2026-09-20): the warm paper tint is gone, and the sheet now separates from the ground by rule and edge. Every non-neutral colour has exactly one meaning.

- **Paper `{colors.paper}` (#F5F5F5)** — the app ground. Neutral near-white, low-glare; a held-back grey whose only job is to let the white sheet sit forward.
- **Sheet `{colors.sheet}` (#FFFFFF)** — the surface content sits on: the report body, tables, the Gantt canvas, dialogs.
- **Paper-sunk `{colors.paper-sunk}` (#EBEBEB)** — table headers, the left sidebar, the right rail, the snapshot pin, read-only zones. One clear step below paper, so a sunk zone still reads as sunk now that the ground is pale.
- **Rules `{colors.rule}` (#D6D6D6) / `{colors.rule-strong}` (#8F8F8F)** — hairlines between rows (`rule`) and around inputs and the table-head underline (`rule-strong`). Both were re-derived to the same lightness as the warm rules they replace, so rule weight reads identically. A 1px `{colors.ink}` rule is reserved for "this is a section of the report" — the top edge of a metric group, the underline of a table head, the rule under a `section-title`. With one type family, these rules do more of the work of hierarchy than before; they are structure, not decoration.
- **Ink `{colors.ink}` (#1D1F23)** — all primary text and figures (16.5:1 on sheet). **Ink-muted `{colors.ink-muted}`** — labels, captions, formulas (6.6:1 on sheet). **Ink-faint `{colors.ink-faint}`** — disabled and decorative only; never used for text a user needs to read (3.4:1).
- **Primary 藍 `{colors.primary}` (#1F3A5F)** — primary actions, links, the active sidebar item and its marker, and the Current Plan in charts. Using the same indigo for "act" and "the living plan" is intentional: the Current Plan is the thing the PM edits.
- **Baseline `{colors.baseline}` (#6E7580)** — the Baseline in every chart, drawn as an outline, never filled. Grey because the Baseline is history: fixed, reference-only.
- **Unplanned 藤 `{colors.unplanned}` (#6B4E9B)** — Unplanned Work and its components, everywhere, in both PM and Client views, in R0 and R1 (founder decision, 2026-09-20: confirmed unchanged). Always with the diagonal hatch in graphics, so it reads without colour. Never red, never amber; never used for errors, warnings or people.
- **Health `{colors.health-green}` / `{colors.health-amber}` / `{colors.health-red}`** — only for the three Health Indicators and the overall status, and for the milestone-slip state. Muted report tones rather than traffic-light neon. The amber text tone (#8A5A00) is darker than the amber glyph tone (#D9A21B) so text passes AA. `{colors.health-unavailable}` marks Ticket-Count Mode "unavailable" indicators.
- **Calendar `{colors.holiday-jp}` / `{colors.holiday-vn}` / `{colors.weekend}`** — Gantt shading. The weekend tint is now a neutral grey (#F0F0F0) like the rest of the surfaces; the two holiday tints keep their hue, because hue is how JP and VN read apart at a glance — and they also carry different patterns (dots vs. vertical lines) so they differ without colour.
- **Focus `{colors.focus-ring}`** — keyboard focus only.

Measured contrast (WCAG 2.1), recomputed against the neutral surfaces: ink on sheet 16.5, ink on paper 15.1, ink on paper-sunk 13.8, ink-muted on sheet 6.6, ink-muted on paper 6.1, ink-muted on paper-sunk 5.5, ink-faint on sheet 3.4 (non-text only), primary on sheet 11.5, primary on paper 10.5, white on primary 11.5, unplanned on sheet 6.6, unplanned on its soft fill 5.4, health-green on its soft fill 5.4, health-amber on its soft fill 5.1, health-red on its soft fill 5.3, focus-ring on sheet 5.4, focus-ring on paper 5.0. Baseline outline on sheet 4.7, on paper 4.3 (graphics need 3:1). Every text pair above clears AA; every graphic pair clears 3:1.

Input borders meet WCAG 1.4.11: `{colors.rule-strong}` was darkened from #A3A3A3 to #8F8F8F (3.2:1 on sheet, 2.9:1 on paper-sunk) so that non-text UI boundaries clear 3:1 as NFR-U1 requires (decision 2026-09-20, founder). Where an input sits on `{colors.paper-sunk}`, use `{colors.ink-muted}` for its border instead.

Avoid: a second accent colour; a hue in the surface greys; red for anything except the red Health state and destructive confirmations; colour as the only carrier of meaning.

Theme: light only in R0 and R1. Dark mode is deferred; add `-dark` suffixed tokens when it is designed [ASSUMPTION].

## Typography

**One family: IBM Plex Sans JP** (SIL OFL, full EN + JA coverage, so both scripts render with the same rhythm). Titles, body, tables, figures, captions and labels are all set in it (founder decision, 2026-09-20 — the earlier mincho "報告書 voice" was dropped). There is no display face and no second family anywhere in the product, including the wordmark.

Hierarchy is carried by **size, weight and rule**, not by a change of voice:

- **Size** does the coarse work. The ramp is deliberately gappy — 28 / 18 / 14 / 13 / 12 / 11 for text, 32 / 20 for figures — so two adjacent levels are never in doubt.
- **Weight** does the fine work. 400 for body and table text, 500 for every figure, 600 for titles and labels. Nothing is set in 300 or 700; a three-step weight scale keeps JA glyphs legible at 11–13px, where a heavier or lighter cut muddies dense kanji.
- **Rule** does the structural work. A `section-title` is always followed by a 1px `{colors.ink}` rule spanning the section; a `report-title` sits above a 1px ink rule the full width of the sheet. The rule, not a serif, is what says "a new part of the report starts here." This is the single most load-bearing change from the two-family scheme: if the rules are dropped, the hierarchy collapses.

Ramp: `report-title` 28/600, tracked −0.01em (project name + Reporting Period on the Review and Client View) · `section-title` 18/600, tracked 0.01em (the report page headings: Status, Unplanned Work, Ahead/Behind, Effort & Cost, Forecast) · `figure-xl` 32/500 (headline metrics on the Status page) · `figure-md` 20/500 (metric cells) · `body` 14/400 · `table` 13/400 and `table-figure` 13/500 · `caption` 12/400 · `label` 11/600 caps-tracked (EN only; JA labels are not tracked or uppercased).

`figure-xl` is larger than `report-title` on purpose: numbers are the headline, and with one family the only way to say so is scale.

Rules:
- Figures always use tabular numerals (`font-variant-numeric: tabular-nums`) and are right-aligned in columns so decimals line up.
- Units are typeset smaller and in `{colors.ink-muted}` after the figure: **46**h, **¥207,000**, **0.91** SPI.
- Formulas are set in `{typography.caption}` with real operators (EV ÷ AC, −, ×), never code-style.
- Japanese text uses the full-width forms the user typed; the UI never converts. Mixed EN/JA lines are one family throughout, so no fallback seam appears mid-line.
- Minimum rendered size is 11px (labels); table text never drops below 13px.
- Never simulate the old serif voice with an italic, a letter-spaced caps title or a system serif fallback. If a heading needs more presence, give it the ink rule and the space above it, not another typeface.

## Layout & Spacing

A 4px base grid (`{spacing.unit}`), compact by design: the PM is reading dozens of WPs and Tickets at once [ASSUMPTION].

- **App frame.** A `{spacing.topbar-height}` (48px) top bar spanning the full width — project switcher, snapshot pin, user menu, and the sidebar toggle at its left edge. Below it, a **collapsible left sidebar** (founder decision, 2026-09-20, replacing the horizontal project tab strip) holding the project's surfaces, and the content area to its right.
- **Left sidebar.** `{spacing.sidebar-width}` (224px) expanded, `{spacing.sidebar-width-collapsed}` (48px) collapsed to an icon rail. `{colors.paper-sunk}` fill with a 1px `{colors.rule}` right edge — a sunk index beside the sheet, consistent with the Disposition rail. Items are 32px rows: 16px icon + label, `{colors.selection}` on hover, and the active item gets a white (`{colors.sheet}`) fill with a 2px `{colors.primary}` marker on its left edge, so the sheet appears to run continuously from the active item into the content area. Grouped by weekly rhythm with `{typography.label}` group headings separated by 1px rules: *Review* alone at the top, then **Plan** (Plan, Baselines, Import), **Actuals** (Mapping, Connectors), **Report** (Export, Publish [R1], Published Snapshots [R1], Risks & Issues [R1]), and **Project settings** pinned to the bottom. Collapsed, the icon rail keeps the group rules and shows each label as a tooltip on hover/focus; R1 and Post-Q1 items are omitted entirely in R0, not disabled.
- **Sheet.** Content sits on a white sheet with `{spacing.sheet-margin}` padding, max width `{spacing.sheet-max-width}`, centred in the content area (the area *right of the sidebar*, not the viewport). Wide tables and the Gantt may bleed to the full width of the content area. Collapsing the sidebar hands 176px back to them — that is what the collapse is for.
- **Reconciliation Review.** Two columns when the content area is ≥1216px wide: the report sheet (fluid) and the Disposition rail (`{spacing.rail-width}`, `{colors.paper-sunk}`). Because the sidebar eats into that width, the rail survives to 1440px viewport with the sidebar expanded, and to 1280px with it collapsed; below that the rail becomes a drawer. Measure the content area, not the window.
- **Report pages.** Each report page is a section with a `section-title`, a 1px ink rule, then a 12-column grid. Metric cells sit 4 or 6 to a row; charts span 8 columns with a 4-column annotation; tables span 12.
- **Rhythm.** 8px inside a component, 16px between related components, 32px between report sections, 48px before a new report page. Uneven by intent: the jump between pages is what makes them read as pages.
- **Tables.** Row height `{spacing.row-height}` (32px); compact mode 28px. Numeric columns right-aligned; text left; status columns centred.
- **Client View (R1).** No sidebar and no top bar chrome — it is a document, not an app shell. Single column, max 960px, generous 48px section spacing — a two-minute read, not a workspace. Down to 360px width with `{spacing.margin-mobile}` side margins.
- **Print.** The sidebar, top bar and Disposition rail are `display: none` in the print stylesheet; the sheet prints full-width. Nothing in the sidebar is the only route to information on the page.

## Elevation & Depth

Depth comes from layering paper, not from shadows.

- Level 0 — paper ground. Level 1 — sheet (white, 1px `{colors.rule}` border, no shadow). Level 1-sunk — `{colors.paper-sunk}` zones: the left sidebar, the Disposition rail, table headers.
- The sidebar is level 1-sunk, never a floating panel: expanded or collapsed it is in the layout flow and pushes the content area, so nothing is ever hidden underneath it. The one exception is below 1024px, where it becomes an overlay drawer and takes the single shadow.
- Only floating layers cast a shadow: popovers, menus, the formula popover, the Disposition drawer, the sidebar drawer below 1024px, dialogs. One shadow: `0 4px 16px rgba(29,31,35,0.12)`.
- The Publish preview (R1) is a sheet framed inside a sheet: an inset 1px `{colors.rule-strong}` frame with the `preview-band` across its top edge.

## Shapes

Near-square. `{rounded.sm}` (2px) on buttons, inputs, badges and chips — just enough to read as controls. `{rounded.none}` on sheets, tables, chart bars, sidebar items and the Scope Ledger Bar: ledgers have square corners, and a sidebar item is a ruled row, not a pill. `{rounded.full}` only for avatar initials and the circle glyph of the green Health state. Health glyphs are shapes with meaning — circle (green), triangle (amber), diamond (red), dash (unavailable) — and must never be swapped for decoration.

## Components

- **Left sidebar (`nav-sidebar` / `nav-item`).** The project's index. Sunk fill, 1px rule at its right edge, group labels in `{typography.label}` over 1px `{colors.rule}` separators. Items are square-cornered 32px rows with a 16px icon and a text label; active = white fill + 2px indigo left marker + indigo label; hover = `{colors.selection}`. Collapsed it is a 48px icon rail: the active marker and group rules stay, labels become tooltips. The toggle is a 16px chevron control at the left of the top bar, never a hamburger. The sidebar itself is the only navigation chrome — it never also carries counts, badges or a search field.
- **Buttons.** `button-primary` (indigo fill, white text) — one per view region at most: *Confirm import*, *Save rule*, *Publish*. `button-secondary` (white, indigo text, strong rule border) for everything else. `button-quiet` for table-row actions. Height 32px. Destructive confirmations use `{colors.health-red}` text on a secondary button, never a red fill.
- **Health badge.** Glyph + word + (optionally) the driving figure: "▲ Amber · SPI 0.91". Soft fill with the tone as text. In the Status page, badges scale up to a row of three plus the overall status, each with its rule caption underneath ("Amber because 0.85 ≤ SPI < 0.95").
- **Metric cell.** A 1px ink rule on top; `label` above; value in `figure-md` (or `figure-xl` on Status); unit in muted ink; a caption line with the formula and inputs; a period-change line ("+0.03 this period"). "PM-adjusted" and "low evidence" appear as small outlined tags after the value. Unavailable values render as an em dash plus the reason caption, never "0".
- **Scope Ledger Bar** — the signature element. A single 16px, square-cornered, 100%-width bar split into the four FR-20 buckets in fixed order: mapped to baselined WPs (indigo), mapped to non-baselined WPs (violet, hatched), Catch-all (baseline grey; the part beyond its Baseline hours hatched violet), Unmapped (violet, hatched, darker hatch). Opening Balances sit outside the bar as a separate thin grey segment with its own label. Every segment has a label with hours and share directly beneath it — no legend-only reading.
- **EVM S-curve.** Cumulative lines on the sheet: PV as a thin grey dashed line (the Baseline), EV solid indigo, AC solid ink, with the Unplanned share of AC as a hatched violet band stacked on the top of AC. As-of date as a vertical 1px ink rule labelled with the snapshot time. Direct labels at line ends; no legend box.
- **Gantt.** Each row: Baseline as a hollow 6px outline bar (`gantt-bar-baseline`) sitting just above the Current Plan's solid 10px indigo bar (`gantt-bar-current`); earned progress fills the Current Plan bar in ink from the left. Summary rows use a bracket-shaped bar. Milestones are ink diamonds; a slipped milestone gets a red diamond outline and the Baseline diamond ghosted at its original date. Non-working days shaded; today as a 1px indigo rule.
- **Tables.** `table-header` (sunk fill, caps label, ink underline), `table-row` with hairline separators, no zebra striping. Tree grid indentation 16px per level with a thin vertical guide line.
- **Unplanned chip.** Violet soft fill and violet text, prefixed with a small hatched square: "▨ Unplanned 38h".
- **Internal marker.** A dashed-outline tag reading "Internal" beside every money figure and every PM-only section header, so the PM always knows what can never reach a client.
- **Snapshot pin.** Sunk chip in the top bar: "Snapshot 19 Sep 18:00 JST · 42 min ago". Turns to amber tones with a triangle glyph when older than 24h.
- **Flagged cell** (Import Preview, Mapping conflicts). Amber left rule 3px + amber soft fill + a short reason in caption text below the value.
- **Preview band.** Indigo band with white caps label "Preview — not published" across the top of the publish preview frame.
- **Inputs.** White, strong-rule border, 2px focus-ring on focus. Labels above, in `label`.
- **Icons.** 16px, 1.5px stroke, square line caps, geometric. Used sparingly and always with a text label — the one place an icon stands alone is the collapsed sidebar rail, where the label survives as an `aria-label` and a tooltip, and the user chose the collapse.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Build structure from hairline rules, alignment and whitespace | Wrap every group in a shadowed rounded card |
| Right-align tabular numbers and show the unit in muted ink | Centre numbers or mix proportional figures in columns |
| Give every metric its formula caption | Show a bare number with no way to see how it was made |
| Use violet + hatch for Unplanned Work everywhere | Paint Unplanned Work red or amber, or put it on a person |
| Pair every Health colour with a glyph and a word | Use colour alone, traffic-light neon, or gauges |
| Draw the Baseline hollow and the Current Plan solid | Fill both bars, or let the Baseline look editable |
| Set everything in IBM Plex Sans JP and carry hierarchy with size, weight and the ink rule | Add a second family, a serif display face, or an italic/caps "report voice" substitute |
| Keep every surface grey strictly neutral | Warm the paper, sheet or rules back up with a cream or beige tint |
| Keep one indigo primary action per region | Add a second accent colour for emphasis |
| Put the project's surfaces in the collapsible left sidebar and let it collapse for the Gantt and wide tables | Bring back a horizontal tab strip, or pin the sidebar open so wide tables can never reclaim the width |
| Mark money and PM-only sections "Internal" | Show money anywhere near a client surface |
| Use bars, lines and tables | Use pies, donuts, radar charts or 3D |
