/**
 * THE EXCELJS WORKBOOK ADAPTER (AD-13 / AR-24 / AR-25, story 3.1).
 *
 * Satisfies `packages/app`'s `WorkbookPort` structurally (like every other adapter here — this
 * package implements the ports, never imports them). Non-streaming `Workbook.xlsx.load` only:
 * ExcelJS's streaming `WorkbookReader` has historically weak merge support and is not used.
 *
 * Guards run BEFORE ExcelJS sees the bytes (AR-24):
 *   1. file size ≤ 10 MB
 *   2. zip central-directory unpacked total ≤ 50 MB (no decompress-to-measure)
 * and AFTER parse:
 *   3. non-empty cells ≤ 1,000,000 (nominal 20,000 × 200)
 *
 * Formula cells expose cached results only — never evaluated; macros never run (NFR-S8).
 *
 * Named fallback if this spike cannot read the real corpus: SheetJS CE from `cdn.sheetjs.com`
 * (never npm `xlsx@0.18.5`). That swap is not implemented in story 3.1.
 */

import ExcelJS from 'exceljs';

/** AR-24 defaults. Tests may lower them via `exceljsWorkbookOn({ … })`. */
export const WORKBOOK_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const WORKBOOK_MAX_UNPACKED_BYTES = 50 * 1024 * 1024;
export const WORKBOOK_MAX_NON_EMPTY_CELLS = 1_000_000;

export type WorkbookLimitName = 'file_size' | 'unpacked_size' | 'cell_count';

export interface WorkbookRejectResult {
  readonly ok: false;
  readonly limit: WorkbookLimitName;
  readonly message: string;
}

export interface WorkbookMerge {
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
}

export type WorkbookPlain = null | boolean | number | string | Date;

export interface WorkbookFormula {
  readonly kind: 'formula';
  readonly cached: unknown;
  readonly formula?: string;
}

export type WorkbookValue = WorkbookPlain | WorkbookFormula;

export interface WorkbookCellRecord {
  readonly row: number;
  readonly col: number;
  readonly value: WorkbookValue;
}

export interface WorkbookSheetRecord {
  readonly name: string;
  readonly merges: readonly WorkbookMerge[];
  readonly cells: readonly WorkbookCellRecord[];
}

export interface WorkbookOkResult {
  readonly ok: true;
  readonly sheets: readonly WorkbookSheetRecord[];
}

export type WorkbookResult = WorkbookOkResult | WorkbookRejectResult;

export interface ExceljsWorkbookLimits {
  readonly maxFileBytes?: number;
  readonly maxUnpackedBytes?: number;
  readonly maxNonEmptyCells?: number;
}

const SIG_EOCD = 0x06054b50;
const SIG_ZIP64_EOCD_LOCATOR = 0x07064b50;
const SIG_ZIP64_EOCD = 0x06064b50;
const SIG_CENTRAL_DIR = 0x02014b50;

function reject(limit: WorkbookLimitName, message: string): WorkbookRejectResult {
  return { ok: false, limit, message };
}

function readU16LE(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readU32LE(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function readU64LE(view: DataView, offset: number): number {
  // ZIP sizes we care about fit under Number.MAX_SAFE_INTEGER for the 50 MB guard.
  const lo = view.getUint32(offset, true);
  const hi = view.getUint32(offset + 4, true);
  return hi * 0x1_0000_0000 + lo;
}

/**
 * Sum uncompressed sizes from the ZIP central directory without inflating member streams.
 * Returns `null` when the buffer is not a recognisable ZIP (caller treats that as unpacked 0
 * for the guard — ExcelJS will then fail the load, which is outside the named-limit contract).
 */
export function sumUnpackedFromCentralDirectory(bytes: Uint8Array): number | null {
  if (bytes.byteLength < 22) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // EOCD is at the end; comment may pad it. Search backwards for the signature.
  let eocd = -1;
  const searchStart = Math.max(0, bytes.byteLength - (0xffff + 22));
  for (let i = bytes.byteLength - 22; i >= searchStart; i -= 1) {
    if (readU32LE(view, i) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  let cdOffset = readU32LE(view, eocd + 16);
  let cdEntries = readU16LE(view, eocd + 10);
  let useZip64 = cdOffset === 0xffffffff || cdEntries === 0xffff;

  if (useZip64) {
    // ZIP64 end-of-central-directory locator sits immediately before the EOCD.
    const locator = eocd - 20;
    if (locator < 0 || readU32LE(view, locator) !== SIG_ZIP64_EOCD_LOCATOR) return null;
    const zip64EocdOffset = readU64LE(view, locator + 8);
    if (zip64EocdOffset + 56 > bytes.byteLength) return null;
    if (readU32LE(view, zip64EocdOffset) !== SIG_ZIP64_EOCD) return null;
    cdEntries = Number(readU64LE(view, zip64EocdOffset + 32));
    cdOffset = Number(readU64LE(view, zip64EocdOffset + 48));
  }

  if (cdOffset < 0 || cdOffset >= bytes.byteLength) return null;

  let total = 0;
  let offset = cdOffset;
  for (let i = 0; i < cdEntries; i += 1) {
    if (offset + 46 > bytes.byteLength) return null;
    if (readU32LE(view, offset) !== SIG_CENTRAL_DIR) return null;

    let uncompressed = readU32LE(view, offset + 24);
    const nameLen = readU16LE(view, offset + 28);
    const extraLen = readU16LE(view, offset + 30);
    const commentLen = readU16LE(view, offset + 32);
    const compressed = readU32LE(view, offset + 20);
    const localHeaderOffset = readU32LE(view, offset + 42);

    const extraStart = offset + 46 + nameLen;
    const extraEnd = extraStart + extraLen;
    if (extraEnd + commentLen > bytes.byteLength) return null;

    if (
      uncompressed === 0xffffffff ||
      compressed === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      // ZIP64 extra field (header id 0x0001): sizes as needed, in order.
      let p = extraStart;
      let found = false;
      while (p + 4 <= extraEnd) {
        const id = readU16LE(view, p);
        const size = readU16LE(view, p + 2);
        const data = p + 4;
        if (data + size > extraEnd) break;
        if (id === 0x0001) {
          let cursor = data;
          if (uncompressed === 0xffffffff) {
            if (cursor + 8 > data + size) return null;
            uncompressed = readU64LE(view, cursor);
            cursor += 8;
          }
          found = true;
          break;
        }
        p = data + size;
      }
      if (!found && uncompressed === 0xffffffff) return null;
    }

    total += uncompressed;
    offset = extraEnd + commentLen;
  }

  return total;
}

/** A1 / $A$1 → { row, col } (1-based). */
function a1ToRowCol(a1: string): { row: number; col: number } {
  const m = /^\$?([A-Za-z]+)\$?(\d+)$/.exec(a1.trim());
  if (!m) throw new Error(`exceljsWorkbookOn: unparseable A1 ref "${a1}"`);
  const letters = m[1]!.toUpperCase();
  let col = 0;
  for (let i = 0; i < letters.length; i += 1) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  return { row: Number(m[2]), col };
}

function parseMergeRange(range: string): WorkbookMerge {
  const [start, end] = range.split(':');
  if (!start || !end) throw new Error(`exceljsWorkbookOn: unparseable merge "${range}"`);
  const a = a1ToRowCol(start);
  const b = a1ToRowCol(end);
  return {
    top: Math.min(a.row, b.row),
    left: Math.min(a.col, b.col),
    bottom: Math.max(a.row, b.row),
    right: Math.max(a.col, b.col),
  };
}

function isFormulaValue(
  value: ExcelJS.CellValue,
): value is ExcelJS.CellSharedFormulaValue | ExcelJS.CellFormulaValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('formula' in value || 'sharedFormula' in value)
  );
}

function mapCellValue(cell: ExcelJS.Cell): WorkbookValue {
  const value = cell.value;

  if (isFormulaValue(value)) {
    const formula =
      'formula' in value && typeof value.formula === 'string'
        ? value.formula
        : 'sharedFormula' in value && typeof value.sharedFormula === 'string'
          ? value.sharedFormula
          : undefined;
    return {
      kind: 'formula',
      cached: 'result' in value ? value.result : undefined,
      ...(formula !== undefined ? { formula } : {}),
    };
  }

  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return value;
  }
  if (value instanceof Date) return value;
  if (typeof value === 'object' && 'richText' in value) {
    return value.richText.map((part) => part.text).join('');
  }
  if (typeof value === 'object' && 'text' in value && typeof value.text === 'string') {
    return value.text;
  }
  if (typeof value === 'object' && 'error' in value) {
    return String(value.error);
  }
  // Hyperlink / shared-string wrappers already narrowed above; fall back to text.
  if (typeof value === 'object' && 'hyperlink' in value && 'text' in value) {
    return typeof value.text === 'string' ? value.text : String(value.hyperlink);
  }
  return null;
}

function sheetMerges(worksheet: ExcelJS.Worksheet): WorkbookMerge[] {
  const model = worksheet.model as { merges?: string[] } | undefined;
  const ranges = model?.merges ?? [];
  return ranges.map(parseMergeRange);
}

/**
 * `WorkbookPort`, reading through ExcelJS's non-streaming API with AR-24 limits applied before
 * (file / unpacked) and after (cell count) the library load.
 */
export function exceljsWorkbookOn(limits: ExceljsWorkbookLimits = {}) {
  const maxFileBytes = limits.maxFileBytes ?? WORKBOOK_MAX_FILE_BYTES;
  const maxUnpackedBytes = limits.maxUnpackedBytes ?? WORKBOOK_MAX_UNPACKED_BYTES;
  const maxNonEmptyCells = limits.maxNonEmptyCells ?? WORKBOOK_MAX_NON_EMPTY_CELLS;

  return {
    parse: async (bytes: Uint8Array): Promise<WorkbookResult> => {
      if (bytes.byteLength > maxFileBytes) {
        return reject(
          'file_size',
          `Workbook exceeds the file size limit of ${maxFileBytes} bytes ` +
            `(received ${bytes.byteLength} bytes).`,
        );
      }

      const unpacked = sumUnpackedFromCentralDirectory(bytes);
      if (unpacked !== null && unpacked > maxUnpackedBytes) {
        return reject(
          'unpacked_size',
          `Workbook exceeds the unpacked size limit of ${maxUnpackedBytes} bytes ` +
            `(central directory reports ${unpacked} bytes).`,
        );
      }

      const workbook = new ExcelJS.Workbook();
      // Non-streaming load only — never WorkbookReader.
      // ExcelJS's ambient `Buffer` is `interface Buffer extends ArrayBuffer`, which collides
      // with Node's `Buffer` under `@types/node`. JSZip accepts Uint8Array at runtime.
      await workbook.xlsx.load(bytes as never);

      const sheets: WorkbookSheetRecord[] = [];
      let nonEmpty = 0;

      workbook.eachSheet((worksheet) => {
        const cells: WorkbookCellRecord[] = [];
        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
            nonEmpty += 1;
            cells.push({
              row: rowNumber,
              col: colNumber,
              value: mapCellValue(cell),
            });
          });
        });
        sheets.push({
          name: worksheet.name,
          merges: sheetMerges(worksheet),
          cells,
        });
      });

      if (nonEmpty > maxNonEmptyCells) {
        return reject(
          'cell_count',
          `Workbook exceeds the non-empty cell limit of ${maxNonEmptyCells} ` +
            `(counted ${nonEmpty} non-empty cells).`,
        );
      }

      return { ok: true, sheets };
    },
  };
}
