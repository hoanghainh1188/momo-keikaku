/**
 * Story 3.1 — ExcelJS workbook adapter spike (AR-24 / AR-25).
 *
 * Synthetic fixtures cover limits, merges, and cached formula results always.
 * The three-file real corpus under `MOMO_WBS_SPIKE_DIR` proves AR-25 on the founder
 * machine / tagged run; CI skips when the dir is absent, and hard-fails when
 * `REQUIRE_WBS_SPIKE=1` (Q1 → A).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  exceljsWorkbookOn,
  sumUnpackedFromCentralDirectory,
  WORKBOOK_MAX_FILE_BYTES,
  WORKBOOK_MAX_UNPACKED_BYTES,
} from './excel';

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/excel/', import.meta.url));

function fixtureBytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURE_DIR, name)));
}

/** Minimal stored ZIP whose central-directory uncompressed total is `unpackedTotal`. */
function zipWithClaimedUnpacked(unpackedTotal: number, fileName = 'pad.bin'): Uint8Array {
  const name = Buffer.from(fileName, 'utf8');
  const data = Buffer.from([0]);
  const crc = 0;
  const method = 0; // store

  const local = Buffer.alloc(30 + name.length + data.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0, 6); // flags
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(0, 10); // time
  local.writeUInt16LE(0, 12); // date
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18); // compressed
  local.writeUInt32LE(data.length, 22); // local uncompressed (honest; CD lies)
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28); // extra
  name.copy(local, 30);
  data.copy(local, 30 + name.length);

  const central = Buffer.alloc(46 + name.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4); // version made
  central.writeUInt16LE(20, 6); // version needed
  central.writeUInt16LE(0, 8); // flags
  central.writeUInt16LE(method, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20); // compressed
  central.writeUInt32LE(unpackedTotal >>> 0, 24); // claimed uncompressed
  central.writeUInt16LE(name.length, 28);
  central.writeUInt16LE(0, 30); // extra
  central.writeUInt16LE(0, 32); // comment
  central.writeUInt16LE(0, 34); // disk start
  central.writeUInt16LE(0, 36); // int attrs
  central.writeUInt32LE(0, 38); // ext attrs
  central.writeUInt32LE(0, 42); // local header offset
  name.copy(central, 46);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length, 16);
  eocd.writeUInt16LE(0, 20);

  return new Uint8Array(Buffer.concat([local, central, eocd]));
}

const SPIKE_DIR = process.env.MOMO_WBS_SPIKE_DIR;
const REQUIRE_WBS_SPIKE = process.env.REQUIRE_WBS_SPIKE === '1';

function listSpikeWorkbooks(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith('.xlsx'))
    .map((name) => join(dir, name))
    .filter((path) => statSync(path).isFile())
    .sort();
}

const spikeFiles =
  SPIKE_DIR !== undefined && SPIKE_DIR !== ''
    ? (() => {
        try {
          return listSpikeWorkbooks(SPIKE_DIR);
        } catch {
          return [] as string[];
        }
      })()
    : [];

const spikeReady = spikeFiles.length >= 3;

if (REQUIRE_WBS_SPIKE && !spikeReady) {
  throw new Error(
    'REQUIRE_WBS_SPIKE=1 but MOMO_WBS_SPIKE_DIR is unset, unreadable, or holds fewer than ' +
      `three .xlsx files (found ${spikeFiles.length}).`,
  );
}

describe('exceljsWorkbookOn — synthetic limits and shape (story 3.1 / AR-24)', () => {
  it('reads merge ranges and cached formula results without evaluating formulas', async () => {
    const port = exceljsWorkbookOn();
    const result = await port.parse(fixtureBytes('merges-and-formula.xlsx'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const sheet = result.sheets.find((s) => s.name === 'WBS');
    expect(sheet).toBeDefined();
    expect(sheet!.merges).toContainEqual({ top: 1, left: 1, bottom: 1, right: 4 });

    const header = sheet!.cells.find((c) => c.row === 1 && c.col === 1);
    expect(header?.value).toBe('プロジェクト計画ヘッダー');

    const formula = sheet!.cells.find((c) => c.row === 2 && c.col === 5);
    expect(formula?.value).toEqual({
      kind: 'formula',
      cached: 30,
      formula: 'C2+D2',
    });

    const ja = sheet!.cells.find((c) => c.row === 2 && c.col === 1);
    expect(ja?.value).toBe('作業パッケージ');

    const dateCell = sheet!.cells.find((c) => c.row === 2 && c.col === 2);
    expect(dateCell?.value).toBeInstanceOf(Date);
  });

  it('rejects before ExcelJS when the file exceeds the 10 MB size limit', async () => {
    const port = exceljsWorkbookOn();
    const bytes = new Uint8Array(WORKBOOK_MAX_FILE_BYTES + 1);
    // PK signature so a missed size check would not fail for an unrelated reason.
    bytes[0] = 0x50;
    bytes[1] = 0x4b;
    const result = await port.parse(bytes);
    expect(result).toEqual({
      ok: false,
      limit: 'file_size',
      message: expect.stringContaining('file size limit'),
    });
    expect(result.ok === false && result.message).toMatch(/file size/i);
  });

  it('rejects before ExcelJS when the zip central directory unpacked total exceeds 50 MB', async () => {
    const claimed = WORKBOOK_MAX_UNPACKED_BYTES + 1;
    const bytes = zipWithClaimedUnpacked(claimed);
    expect(bytes.byteLength).toBeLessThan(WORKBOOK_MAX_FILE_BYTES);
    expect(sumUnpackedFromCentralDirectory(bytes)).toBe(claimed);

    const port = exceljsWorkbookOn();
    const result = await port.parse(bytes);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.limit).toBe('unpacked_size');
    expect(result.message).toMatch(/unpacked size limit/i);
  });

  it('rejects after parse when non-empty cells exceed the ceiling', async () => {
    const port = exceljsWorkbookOn({ maxNonEmptyCells: 50 });
    const result = await port.parse(fixtureBytes('hundred-cells.xlsx'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.limit).toBe('cell_count');
    expect(result.message).toMatch(/non-empty cell limit/i);
  });

  it('parses a workbook that is under every limit', async () => {
    const port = exceljsWorkbookOn();
    const result = await port.parse(fixtureBytes('tiny-ok.xlsx'));
    expect(result).toMatchObject({
      ok: true,
      sheets: [{ name: 'Tiny', cells: [{ row: 1, col: 1, value: 'ok' }] }],
    });
  });

  it('sums uncompressed sizes from the central directory without needing inflate', () => {
    const tiny = fixtureBytes('tiny-ok.xlsx');
    const sum = sumUnpackedFromCentralDirectory(tiny);
    expect(sum).toBeTypeOf('number');
    expect(sum!).toBeGreaterThan(0);
    expect(sum!).toBeLessThan(WORKBOOK_MAX_UNPACKED_BYTES);
  });
});

describe.skipIf(!spikeReady)(
  'exceljsWorkbookOn — real Japanese WBS corpus (story 3.1 / AR-25)',
  () => {
    const corpus = spikeFiles.slice(0, 3);

    it.each(corpus.map((path, i) => [i + 1, path] as const))(
      'workbook %i asserts merge ranges and cached formula results (%s)',
      async (_n, path) => {
        const port = exceljsWorkbookOn();
        const bytes = new Uint8Array(readFileSync(path));
        const result = await port.parse(bytes);

        expect(result.ok, `parse failed for ${path}: ${JSON.stringify(result)}`).toBe(true);
        if (!result.ok) return;

        expect(result.sheets.length).toBeGreaterThan(0);

        const mergeCount = result.sheets.reduce((n, s) => n + s.merges.length, 0);
        expect(mergeCount, `expected at least one merge range in ${path}`).toBeGreaterThan(0);

        const formulaCells = result.sheets.flatMap((s) =>
          s.cells.filter(
            (c) => typeof c.value === 'object' && c.value !== null && 'kind' in c.value && c.value.kind === 'formula',
          ),
        );
        expect(
          formulaCells.length,
          `expected at least one cached formula cell in ${path}`,
        ).toBeGreaterThan(0);

        for (const cell of formulaCells) {
          const value = cell.value;
          expect(value).toMatchObject({ kind: 'formula' });
          if (typeof value === 'object' && value !== null && 'kind' in value) {
            // Cached result is present (may be null/number/string/Date/error); never re-evaluated.
            expect('cached' in value).toBe(true);
          }
        }
      },
    );
  },
);
