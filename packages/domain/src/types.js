export const MAPPING_RULE_FIELDS = [
    'milestone',
    'category',
    'issueType',
    'parent',
    'keyPattern',
];
export const DEFAULT_THRESHOLDS = {
    ratioGreen: { num: 95n, den: 100n },
    ratioAmber: { num: 85n, den: 100n },
    tcpiRed: { num: 11n, den: 10n },
    unplannedGreenBelow: { num: 1n, den: 10n },
    unplannedAmberMax: { num: 2n, den: 10n },
};
/**
 * Seed default Resolved set for `connector_setting_event` on Connector create (Story 5.7).
 * Compute paths take the pinned setting head; this is the seed / missing-head fallback only.
 */
export const DEFAULT_RESOLVED_STATUS_IDS = new Set(['Closed']);
/** True when the observation's status is in the Connector's Resolved set (AD-6). */
export function isResolvedStatus(statusId, resolvedStatusIds) {
    return resolvedStatusIds.has(statusId);
}
