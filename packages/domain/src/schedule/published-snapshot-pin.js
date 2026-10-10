/**
 * Narrow an unknown pin to the typed contract. Requires a finite integer `baselineVersionSeq`.
 */
export function publishedSnapshotBaselinePin(value) {
    if (typeof value !== 'object' || value === null) {
        throw new TypeError('PublishedSnapshotBaselinePin: expected object');
    }
    const seq = value.baselineVersionSeq;
    if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 1) {
        throw new TypeError('PublishedSnapshotBaselinePin: baselineVersionSeq is required (positive integer)');
    }
    return { baselineVersionSeq: seq };
}
