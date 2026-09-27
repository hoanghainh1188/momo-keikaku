/**
 * WORKBOOK PARSE, AS A PORT (AD-13 / AR-24 / AR-25, story 3.1).
 *
 * Excel import reads bytes through this port — never through ExcelJS directly from a use case.
 * `packages/adapters` owns the ExcelJS 4.4.0 adapter (`exceljsWorkbookOn`); if the spike corpus
 * ever forces a library swap, the recorded fallback is SheetJS CE from `cdn.sheetjs.com` (never
 * npm `xlsx@0.18.5`), and this port is what keeps that swap local.
 *
 * DECLARED HERE, SATISFIED STRUCTURALLY — exactly like `MailerPort` and `Clock`. Adapters never
 * import this package; the composition root's `satisfies WorkbookPort` is where TypeScript
 * checks the shapes agree.
 *
 * Formulas are never evaluated and macros never run: a formula cell exposes only its cached
 * result (and optionally the formula string for diagnostics). Size and unpacked-size limits are
 * the adapter's to enforce before the library sees bytes; the cell ceiling is post-parse.
 */

/** Named upload limits the adapter may reject on (UX-DR23 / AR-24). */
export type WorkbookLimit = 'file_size' | 'unpacked_size' | 'cell_count';

/** A parse that stopped because a named AR-24 limit was exceeded. */
export interface WorkbookReject {
  readonly ok: false;
  readonly limit: WorkbookLimit;
  /** English message that names the limit exceeded. */
  readonly message: string;
}

/** Inclusive 1-based cell range (ExcelJS merge model). */
export interface WorkbookMergeRange {
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
}

/**
 * A non-formula cell value. Dates arrive as `Date` when the workbook stored one; plain numbers
 * stay numbers (Excel serial dates are not reinterpreted here).
 */
export type WorkbookPlainValue = null | boolean | number | string | Date;

/**
 * A formula cell: cached result only. The formula string may be retained for diagnostics; it is
 * never evaluated by this port or its adapters.
 */
export interface WorkbookFormulaValue {
  readonly kind: 'formula';
  readonly cached: unknown;
  readonly formula?: string;
}

export type WorkbookCellValue = WorkbookPlainValue | WorkbookFormulaValue;

/** One non-empty cell at a 1-based row/column. */
export interface WorkbookCell {
  readonly row: number;
  readonly col: number;
  readonly value: WorkbookCellValue;
}

export interface WorkbookSheet {
  readonly name: string;
  readonly merges: readonly WorkbookMergeRange[];
  readonly cells: readonly WorkbookCell[];
}

/** A successful parse of an `.xlsx` into sheets, merges, and cell values. */
export interface WorkbookParse {
  readonly ok: true;
  readonly sheets: readonly WorkbookSheet[];
}

export type WorkbookParseResult = WorkbookParse | WorkbookReject;

/**
 * Read an `.xlsx` buffer into sheets / merges / cached formula values, or reject on a named
 * limit. Implementations must not evaluate formulas or execute macros.
 */
export interface WorkbookPort {
  readonly parse: (bytes: Uint8Array) => Promise<WorkbookParseResult>;
}
