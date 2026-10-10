import { describe, expect, it } from 'vitest';
import { assertLedgerSeqMax, selectLedgerForPin } from './ledger-pin';

describe('selectLedgerForPin (AR-21)', () => {
  const snapshotSeqById = new Map([
    ['snap-a1', 1],
    ['snap-a2', 2],
    ['snap-b1', 10],
    ['snap-b2', 11],
  ]);

  const entries = [
    { seq: 1, connectorId: 'ca', snapshotId: 'snap-a1' },
    { seq: 2, connectorId: 'ca', snapshotId: 'snap-a2' },
    { seq: 3, connectorId: 'cb', snapshotId: 'snap-b1' },
    { seq: 4, connectorId: 'cb', snapshotId: 'snap-b2' },
  ];

  it('keeps entries whose snapshot seq is ≤ the pin per Connector', () => {
    const pin = new Map([
      ['ca', 'snap-a1'],
      ['cb', 'snap-b2'],
    ]);
    const { entries: filtered, ledgerSeqMax } = selectLedgerForPin(
      entries,
      pin,
      snapshotSeqById,
    );
    expect(filtered.map((e) => e.seq)).toEqual([1, 3, 4]);
    expect(ledgerSeqMax).toBe(4);
  });

  it('excludes entries above the pinned snapshot for that Connector', () => {
    const pin = new Map([['ca', 'snap-a1']]);
    const { entries: filtered, ledgerSeqMax } = selectLedgerForPin(
      entries,
      pin,
      snapshotSeqById,
    );
    expect(filtered.map((e) => e.seq)).toEqual([1]);
    expect(ledgerSeqMax).toBe(1);
  });

  it('greenfield empty pin → empty ledger and null ledgerSeqMax', () => {
    const { entries: filtered, ledgerSeqMax } = selectLedgerForPin(
      entries,
      new Map(),
      snapshotSeqById,
    );
    expect(filtered).toEqual([]);
    expect(ledgerSeqMax).toBeNull();
  });

  it('ledger_seq_max is assertion-only over the filtered set', () => {
    const pin = new Map([['ca', 'snap-a2']]);
    const { entries: filtered, ledgerSeqMax } = selectLedgerForPin(
      entries,
      pin,
      snapshotSeqById,
    );
    expect(ledgerSeqMax).toBe(2);
    expect(() => assertLedgerSeqMax(filtered, ledgerSeqMax)).not.toThrow();
    expect(() => assertLedgerSeqMax(filtered, 99)).toThrow(/ledger_seq_max assertion failed/);
  });

  it('throws naming an unknown pin snapshot id instead of silently emptying the connector', () => {
    const pin = new Map([['ca', 'snap-missing']]);
    expect(() => selectLedgerForPin(entries, pin, snapshotSeqById)).toThrow(
      /unknown pin snapshot id "snap-missing" for connector "ca"/,
    );
  });
});
