/**
 * Story 6.1 / Q1-A: golden Published Snapshot recompute over a file-fixture corpus.
 * Every registered `formulaVersion` must have at least one fixture; CI recomputes each.
 */
import { describe, expect, it } from 'vitest';
import { FORMULA_VERSION } from '../evm';
import { computeAt, registeredFormulaVersions } from '../formula-version';
import { assertLedgerSeqMax } from '../ledger-pin';
import { loadFormulaCorpus } from './load';

describe('formulaVersion golden recompute (AD-10 / Q1-A)', () => {
  const corpus = loadFormulaCorpus();
  const versions = registeredFormulaVersions();

  it('registers the current formula and keeps a non-empty corpus', () => {
    expect(versions).toContain(FORMULA_VERSION);
    expect(corpus.length).toBeGreaterThan(0);
  });

  it('has at least one golden fixture for every registered formulaVersion', () => {
    for (const version of versions) {
      const fixtures = corpus.filter((c) => c.formulaVersion === version);
      expect(
        fixtures.length,
        `registered formulaVersion "${version}" has no file fixtures under formula-corpus/`,
      ).toBeGreaterThan(0);
    }
  });

  for (const version of versions) {
    for (const fixture of corpus.filter((c) => c.formulaVersion === version)) {
      it(`recomputes ${fixture.id} under ${version}`, () => {
        assertLedgerSeqMax(
          fixture.inputs.ledger.map((e) => ({ seq: e.seq })),
          fixture.inputs.ledgerSeqMax ?? null,
        );
        const result = computeAt(version, fixture.inputs);
        expect(result.formulaVersion).toBe(fixture.expected.formulaVersion);
        expect(result.measurementBasis).toBe(fixture.expected.measurementBasis);
        expect(result.attribution.cumulative.unplannedMh).toBe(fixture.expected.unplannedMh);
        expect(result.attribution.cumulative.totalMh).toBe(fixture.expected.totalMh);
        expect(result.attribution.cumulative.mappedBaselinedMh).toBe(
          fixture.expected.mappedBaselinedMh,
        );
      });
    }
  }
});
