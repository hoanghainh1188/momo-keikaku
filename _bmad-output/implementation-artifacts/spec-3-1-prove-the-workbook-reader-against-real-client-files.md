---
title: 'Story 3.1 — prove the workbook reader against real client files'
type: 'feature'
created: '2026-09-27'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '498aefee695d7e8a34e99b90f619d93c3b79e144'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Epic 3's import path assumes ExcelJS can read real Japanese client WBS workbooks (merged headers, shared formulas, JA text, dates). That fit is a spike, not an assumption (AD-13 / AR-25). Building upload/mapping first would bury a library failure in story 3.8.

**Approach:** Introduce `WorkbookPort` and an ExcelJS 4.4.0 adapter that uses the **non-streaming** API only. Guard uploads **before** ExcelJS sees bytes (file size, zip central-directory unpacked total, then cell ceiling). Prove the adapter on **three real Japanese WBS workbooks** by asserting merge ranges and cached formula results. Formulas and macros are never evaluated. If ExcelJS cannot read the corpus, the recorded fallback is SheetJS CE from `cdn.sheetjs.com` — never npm `xlsx@0.18.5`.

**Decisions (founder, 2026-09-27):**
- **Keep full spec** (~1,800 tokens) — accept context-rot risk; do not split.
- **Q1 → A.** Three real workbooks live in a local directory pointed at by `MOMO_WBS_SPIKE_DIR`. Corpus tests use `describe.skipIf` when the dir/files are absent; `REQUIRE_WBS_SPIKE=1` hard-fails when the corpus is expected. CI stays green without the files; founder machine / tagged run proves AR-25.
- **Q2 → A.** If ExcelJS fails the three-file corpus, halt the spike as failed: record evidence in Implementation Notes and `deferred-work.md`; do **not** implement SheetJS CE in this story. Epic 3 feature stories wait on a follow-up that performs the port swap.

## Boundaries & Constraints

**Always:**
- Pin `exceljs@4.4.0` exact on `@momo/adapters` (AR-61). Satisfy `WorkbookPort` structurally from `packages/adapters` — never `import` `@momo/app` inside adapters.
- Non-streaming workbook load only. Do not use ExcelJS streaming `WorkbookReader`.
- Read formula cells as **cached results only**; never evaluate formulas; never execute macros (AR-24, NFR-S8).
- Limits checked **before** handing bytes to ExcelJS: 10 MB file size; 50 MB unpacked total from the **zip central directory** (no decompress-to-measure); after parse, reject >1,000,000 non-empty cells (nominal 20k×200) (AR-24).
- Rejection surfaces name the limit that failed (stable code + English message). UI chrome for the PM is out of this story.
- Real client workbooks stay **out of the repo** (AR-41). Committed fixtures for limit/parser shape tests are synthetic only.
- Named SheetJS CE fallback stays a documented local swap behind `WorkbookPort` — not npm `xlsx@0.18.5`. Do not implement that swap in this story (Q2 → A).
- Real-corpus suite reads `MOMO_WBS_SPIKE_DIR` (Q1 → A): skip when absent; hard-fail when `REQUIRE_WBS_SPIKE=1`.

**Never:**
- No `import_draft`, `BlobStore`, upload/mapping UI, `confirmImport`, Plan writes, or `applyPlanChange` / fence changes.
- No `packages/db` migration or table-class registry work (those start in 3.2).
- Do not commit real client WBS files. Do not add npm `xlsx`. Do not implement SheetJS CE here. Do not wire composition unless a test needs a factory in-process (spike may stay adapter-local).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy parse | Three real JA WBS `.xlsx` with merges + shared formulas | Port returns sheets, merge ranges, cell values; formula cells expose cached results | N/A |
| Formula cell | Cell with formula + cached value | Cached value returned; formula string may be retained for diagnostics but is never evaluated | N/A |
| Oversize file | Bytes > 10 MB | Reject before ExcelJS | Named limit: file size |
| Zip bomb CD | Central directory unpacked total > 50 MB | Reject before ExcelJS / without full decompress | Named limit: unpacked size |
| Cell ceiling | Workbook parses but non-empty cells > 1,000,000 | Reject after count | Named limit: cell count |
| Under limits | File ≤10 MB, CD ≤50 MB, cells ≤1M | Parse proceeds | N/A |

</frozen-after-approval>

## Code Map

- `packages/app/src/ports/mailer.ts` / `clock.ts` / `ids.ts` — port doc + interface-only precedent ("declared here, satisfied structurally").
- `packages/app/src/index.ts` — type-only re-exports (`MailerPort` pattern); add `WorkbookPort` (+ related types).
- `packages/adapters/src/mailer-console.ts` / `ids.ts` / `clock.ts` — `*On` factory + structural satisfy; co-located `*.test.ts` with hand-rolled fakes.
- `packages/adapters/src/index.ts` — barrel; comment lists outbound adapters (extend for excel).
- `packages/adapters/package.json` — add `"exceljs": "4.4.0"` exact (same place as `uuid`).
- New `packages/app/src/ports/workbook.ts` — `WorkbookPort` + sheet/cell/merge/reject types; no ExcelJS import.
- New `packages/adapters/src/excel.ts` — `exceljsWorkbookOn(…)` (or equivalent): pre-parse zip/size guards, non-streaming load, merge ranges, cached formula values, cell-count reject.
- New `packages/adapters/src/excel.test.ts` — synthetic fixtures for limits + merge/formula shape; real-corpus suite gated by `MOMO_WBS_SPIKE_DIR` / `REQUIRE_WBS_SPIKE` (Q1 → A).
- New synthetic fixtures under `packages/adapters/src/fixtures/` or `tests/fixtures/excel/` — committed `.xlsx` built for merges/formulas/limits only (not client files).
- `tests/schedule/fence-nfr-p1.test.ts` — `describe.skipIf(!reachable)` + `REQUIRE_*=1` precedent for optional env-gated suites.
- `.dependency-cruiser.cjs` / `tests/depcruise-fences.test.ts` — leave rules as-is; adapters already fenced.
- `apps/web/src/server/composition.ts` — **do not wire** unless a later task needs it; spike proves via adapter tests.
- Do **not** touch: schedule fence, `packages/db` migrations/registry, Plan UI, BlobStore.

## Tasks & Acceptance

**Execution:**
- [x] `packages/app/src/ports/workbook.ts` (+ `index.ts` type export) — declare `WorkbookPort` and parse/reject types (merges, cached formula cells, named limit errors).
- [x] `packages/adapters/package.json` — pin `exceljs@4.4.0`; `pnpm install` at workspace root.
- [x] `packages/adapters/src/excel.ts` (+ barrel export) — implement non-streaming ExcelJS adapter with pre-parse 10 MB / 50 MB CD guards and post-parse 1M cell reject.
- [x] Synthetic fixtures + `packages/adapters/src/excel.test.ts` — cover matrix rows for limits, merges, and cached formula results without real client files.
- [x] Real three-file corpus suite — assert merge ranges and cached formula results on each workbook under `MOMO_WBS_SPIKE_DIR`; `describe.skipIf` when absent; hard-fail when `REQUIRE_WBS_SPIKE=1` (Q1 → A).
- [x] On corpus success: note SheetJS CE as unused-but-named fallback in Implementation Notes. On corpus failure (Q2 → A): halt spike, record evidence in Implementation Notes + `deferred-work.md`; do not implement SheetJS CE.

**Acceptance Criteria:**
- [ ] Given three real Japanese WBS workbooks with merged headers, shared formulas, JA text and date cells, when parsed through `WorkbookPort` over ExcelJS, then tests assert the merge ranges and cached formula results read, using the non-streaming API only (AR-25). *(suite landed; not executed here — `MOMO_WBS_SPIKE_DIR` unset on this agent)*
- [x] Given a formula cell, when read, then the cached result is returned and the formula is never evaluated; macros never run (AR-24, NFR-S8).
- [x] Given an upload candidate, when limits are checked, then 10 MB file size and 50 MB unpacked (zip central directory) are enforced **before** ExcelJS sees the bytes (AR-24).
- [x] Given a workbook that passes those limits, when cells are counted at parse time, then >1,000,000 non-empty cells is rejected (AR-24).
- [x] Given a rejected upload, when the caller inspects the error, then the message names the limit exceeded (UX-DR23 intent; UI deferred to 3.2).
- [x] Given ExcelJS cannot read the corpus, when the spike concludes, then it is halted as failed with evidence recorded; SheetJS CE from `cdn.sheetjs.com` is named as the follow-up swap (not npm `xlsx@0.18.5`); SheetJS is **not** implemented in this story (Q2 → A). *(no corpus failure observed — suite skipped; SheetJS CE remains unused-but-named)*

## Implementation Notes

Shipped 2026-09-27 on branch `cursor/workbook-reader-spike-2c77`:

- `WorkbookPort` (+ parse/reject/merge/formula types) in `packages/app/src/ports/workbook.ts`, type-exported from `packages/app/src/index.ts`.
- `exceljs@4.4.0` exact on `@momo/adapters`; `exceljsWorkbookOn()` in `packages/adapters/src/excel.ts` uses non-streaming `workbook.xlsx.load` only. Pre-parse guards: 10 MB file size, 50 MB unpacked via zip central-directory walk (`sumUnpackedFromCentralDirectory`, ZIP64 EOCD/locator + 0x0001 extra). Post-parse: >1,000,000 non-empty cells reject. Limit overrides exist for tests only.
- Synthetic fixtures under `packages/adapters/src/fixtures/excel/` (`merges-and-formula.xlsx`, `tiny-ok.xlsx`, `hundred-cells.xlsx`). `excel.test.ts` covers merges + JA text + date + cached formula, file_size / unpacked_size / cell_count rejects (named messages), and under-limit parse.
- Real corpus suite gated by `MOMO_WBS_SPIKE_DIR` / `REQUIRE_WBS_SPIKE=1` (Q1 → A). **This agent run:** env unset → suite skipped (6 synthetic tests green). AR-25 is therefore **not claimed closed** until a founder/tagged run with three real JA WBS files passes. Composition root left unwired (spike proves via adapter tests).
- **SheetJS CE fallback:** unused. Named follow-up swap remains SheetJS CE from `cdn.sheetjs.com` — never npm `xlsx@0.18.5`. Not implemented (Q2 → A). No `deferred-work.md` entry — corpus was absent, not failed.
- Verification: `pnpm exec vitest run packages/adapters/src/excel.test.ts` green; `pnpm typecheck` clean; `pnpm depcruise` clean. `pnpm lint` still fails on pre-existing `tests/schedule/fence-nfr-p1.test.ts` bare `new Date()` (Epic 2 NFR-P1 harness) — untouched by this story; changed files lint clean.
- **Paused 2026-09-27 (founder choice 1):** Harry does not yet have the three real JA WBS files. Story stays `in-progress`. Resume when files exist: set `MOMO_WBS_SPIKE_DIR` + `REQUIRE_WBS_SPIKE=1`, run `pnpm exec vitest run packages/adapters/src/excel.test.ts`, close AR-25 Happy parse, then continue Build review. Do not claim story done / do not start Epic 3 feature stories until that gate passes (or Q2 → A halt path is taken).

## Spec Change Log

## Review Triage Log

## Design Notes

**Port surface (sketch, not frozen):** something like `parse(bytes: Uint8Array): Promise<WorkbookParse | WorkbookReject>` where reject carries `{ limit: 'file_size' | 'unpacked_size' | 'cell_count'; message: string }` and success exposes sheets with `merges: Range[]` and cells that distinguish plain values vs `{ kind: 'formula', cached: unknown, formula?: string }`. Exact names are implementer-owned; structural match to `WorkbookPort` is required.

**Zip unpacked check:** walk the central directory (local EOCD / ZIP64 as needed) and sum uncompressed sizes **without** inflating member streams into a full workbook buffer for the guard. Only after both byte limits pass may ExcelJS load.

**Synthetic vs real:** synthetic fixtures prove guards and the merge/formula contract in CI always. The three real files prove AD-13's risk gate; without them the story cannot claim AR-25 closed (unless Harry picks Q1 → C, which explicitly weakens that claim).

## Verification

**Commands:**
- `pnpm --filter @momo/adapters test` (or workspace vitest targeting `packages/adapters/src/excel.test.ts`) — expected: synthetic suite green; real-corpus suite green when files present / REQUIRE set per Q1
- `pnpm typecheck` — expected: clean
- `pnpm depcruise` — expected: clean (no new fence breaches)
- `pnpm lint` — expected: clean
