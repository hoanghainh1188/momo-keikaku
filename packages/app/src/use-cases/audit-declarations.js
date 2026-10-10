import { COMPARE_BASELINE_VERSIONS_AUDIT } from '../baseline/compare-baseline-versions';
import { RE_BASELINE_AUDIT } from '../baseline/re-baseline';
import { RE_DERIVE_PINNED_BASELINE_AUDIT } from '../baseline/re-derive-pinned';
import { SET_BASELINE_AUDIT } from '../baseline/set-baseline';
import { CALENDAR_AUDIT } from '../calendar/publish-calendar-version';
import { SCHEDULE_AUDIT } from '../schedule/apply-plan-change';
import { MAPPING_RULE_AUDIT } from './mapping-rules';
import { MEMBERSHIP_WRITE_AUDIT } from './membership-writes';
import { ORG_WRITE_AUDIT } from './org-writes';
import { PROJECT_WRITE_AUDIT } from './project-writes';
import { RESOURCE_WRITE_AUDIT } from './resource-writes';
import { TENANT_CURRENCY_AUDIT } from './tenant-currency';
import { CONNECTOR_WRITE_AUDIT } from './connector-writes';
/**
 * Every write's audit declaration — Epic 1 use-cases plus the schedule/calendar second module
 * list (Epic 2 retro F10 / Q1→B). Schedule/calendar stay off `use-cases/index.ts`.
 */
export const USE_CASE_AUDIT = {
    ...PROJECT_WRITE_AUDIT,
    ...MAPPING_RULE_AUDIT,
    ...ORG_WRITE_AUDIT,
    ...MEMBERSHIP_WRITE_AUDIT,
    ...RESOURCE_WRITE_AUDIT,
    ...TENANT_CURRENCY_AUDIT,
    ...SCHEDULE_AUDIT,
    ...CALENDAR_AUDIT,
    ...SET_BASELINE_AUDIT,
    ...RE_BASELINE_AUDIT,
    ...COMPARE_BASELINE_VERSIONS_AUDIT,
    ...RE_DERIVE_PINNED_BASELINE_AUDIT,
    ...CONNECTOR_WRITE_AUDIT,
};
