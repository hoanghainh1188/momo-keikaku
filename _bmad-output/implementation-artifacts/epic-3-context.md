# Epic 3 Context: The client's Excel WBS becomes a live plan in one session

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

A PM uploads a real client `.xlsx`, chooses the sheet and header row, maps columns with English and Japanese header suggestions, and confirms a mandatory preview before anything is written. The preview shows every row's level, duration derived from an imported start/finish pair, dependencies and constraints, progress, which of the three scheduling states each row arrives in, and the dates the scheduler will produce. Mid-flight projects therefore arrive mid-flight. A later version of the same file re-imports as a diff that separates input changes from the date movement they caused. This epic is the first real writer of Recorded Percent Complete (alongside Epic 6's audited override). ExcelJS fit is a spike, not an assumption — prove the workbook reader before any import feature.

## Stories

- Story 3.1: Prove the workbook reader against real client files
- Story 3.2: Upload a workbook and map its columns
- Story 3.3: What the importer derives, and the one date it is allowed to keep
- Story 3.4: The import carries the project's progress
- Story 3.5: Nothing is written until the PM confirms
- Story 3.6: Confirming commits once, through the fence
- Story 3.7: Re-import shows a diff, and says what it did not touch
- Story 3.8: The acceptance corpus of ten real client files

## Requirements & Constraints

- **No commit without confirmation.** Cell content is untrusted and escaped everywhere. Formulas are never evaluated; macros never run.
- **Mapping.** Fields: WBS code or indentation, name, start, finish, duration, predecessors, lag, constraint type/date, actual start/finish, percent complete, effort, assignee, milestone, or Custom Field. Suggestions match EN/JA headers and state their reason; unmapped columns default to "Create Custom Field".
- **Imported planned dates never become WP dates.** A start/finish pair becomes a duration (mapped duration column wins; else inclusive working-day count on the Project calendar), with originals kept as reference Custom Fields. Half-pairs and finish-before-start are flagged and imported with no duration. No auto-constraint — **except** a milestone: duration 0, no working-day derivation, imported date (finish when both exist) becomes *must finish on*, clearable in the preview.
- **Progress.** Actual start/finish are the one kind of date the importer writes. Finish without start is flagged; finish before start flags and imports neither. Percent complete is an audited override (reason: imported from file and row) until the PM clears it; out-of-range or non-100 on a finished WP is flagged, never guessed. Rows arrive *complete* / *in progress* / *remaining*; Recorded % drives remaining duration on in-progress WPs.
- **Predecessors & hierarchy.** Predecessors are WBS codes or names with optional working-day lag; unmatched codes and rejected links are listed, never dropped silently. Unrecognised constraint types are flagged. Hierarchy from WBS codes or indentation; Western and Japanese date forms parsed; merged cells unmerge with the merged value.
- **Preview gates.** Missing Project start or Data Date blocks commit: propose earliest imported start, and **today** as Data Date (never a date from the file). Where actuals exist, also offer latest imported actual as an alternative Data Date and say which is proposed. PM corrects inputs and levels, never a planned date. Progress preview shows per-row state, remaining duration, and totals. Counts: read / imported / skipped with reasons. Unknown assignees must be created or linked. Flags are warnings; only blocking errors (no name, unparseable hierarchy) disable Confirm.
- **Re-import.** Match by WBS code, else name within parent; unresolved pairs shown for the PM. Mapped fields win; overwrites of in-tool edits are listed. No planned date written — date movement in a separate section. Empty mapped progress cells clear and are listed; unmapped progress/predecessors leave recorded values untouched (and the diff says so for the graph). Never changes a Baseline; removed WPs' Mappings follow Plan delete rules.
- **Acceptance.** ≥10 real founder WBS files: 100% of rows at correct level with ≤5 manual preview corrections. Corpus includes mid-flight files with actual dates and percent complete; correction counts recorded.

## Technical Decisions

- **Two-phase import.** Upload via `BlobStore`; parse through `WorkbookPort` into `import_draft` (`mutable_audited`). `confirmImport(draftId, draftVersion)` is the only path that writes WPs from a file; audits in the same transaction; recalculates **once after the whole diff commits**. One of exactly two non-PM-edit callers of `recalculateProject` (the other: calendar-version publication).
- **Writes.** Scheduling inputs and actual dates only — never a derived date — through `applyPlanChange`. Diffs that would turn a mapped leaf into a summary are refused.
- **Workbook spike first.** ExcelJS behind `WorkbookPort`; non-streaming API only. Assert merge ranges and cached formula results on three real Japanese WBS workbooks before features. Fallback: SheetJS CE from `cdn.sheetjs.com` — not npm `xlsx@0.18.5`.
- **Limits before the parser.** 10 MB file; 50 MB unpacked from the zip central directory; after parse, reject >1,000,000 non-empty cells (nominal 20,000×200). Rejections name the limit inline.
- **Modules.** `adapters/excel`, `domain/import`, `app/import`. Register `import_draft` in the table-class registry with its migration. Acceptance corpus is **not in the repo** (Japan-region bucket or local-only path; local-only test tag CI skips). AI layout interpretation is Post-Q1 and only another `import_draft` producer.

## UX & Interaction Patterns

- **Flow.** Sidebar Plan group / Plan toolbar *Import / Re-import*; empty Project primary CTA "Import an Excel WBS". Steps: Upload → Sheet & header → Column mapping → Preview (or Re-import diff) → Confirm.
- **Sheet & mapping.** Chooser shows row counts and first rows. Header preview for candidates. Mapper: header, samples, suggested field with reason.
- **Preview grid.** ARIA treegrid; inline edits; levels via `Tab`/`Shift+Tab`. Flagged cells: amber left rule + soft fill + reason; "Show only flagged". Unknown-assignees panel; clearable milestone constraints; counts bar with skip reasons.
- **Re-import diff.** Filters: Added / Changed / Removed / Unmatched. Changed rows old → new; overwrites of in-tool edits flagged. Unmatched: pick a match or treat as new/removed.

## Cross-Story Dependencies

- **Needs Epic 2** (Plan + scheduler). Does not need Epics 4–8 to deliver standalone.
- **Order.** 3.1 (spike) before features; 3.2 creates `import_draft`; 3.3–3.4 interpretation; 3.5–3.6 preview and single commit; 3.7 re-import; 3.8 out-of-repo corpus.
- **Downstream.** First production writer of Recorded Percent Complete and imported actual dates for FR-6b. Epic 4 refuses Baselines while unschedulable rows remain. Epic 5's leaf-mapping rules meet `confirmImport`'s refuse-mapped-leaf-to-summary check. Epic 6 owns the audited override path that clearing an import override hands back to.
