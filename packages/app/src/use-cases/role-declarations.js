import { COMPARE_BASELINE_VERSIONS_ROLES } from '../baseline/compare-baseline-versions';
import { RE_BASELINE_ROLES } from '../baseline/re-baseline';
import { RE_DERIVE_PINNED_BASELINE_ROLES } from '../baseline/re-derive-pinned';
import { SET_BASELINE_ROLES } from '../baseline/set-baseline';
import { CALENDAR_ROLES } from '../calendar/publish-calendar-version';
import { SCHEDULE_ROLES } from '../schedule/apply-plan-change';
import { GET_PROJECT_HEADER_ROLES } from './get-project-header';
import { GET_PROJECT_MAPPING_ROLES } from './get-project-mapping';
import { GET_PROJECT_REVIEW_ROLES } from './get-project-review';
import { AUDIT_LOG_READ_ROLES } from './list-audit-log';
import { ORG_LIST_READ_ROLES } from './list-org';
import { MAPPING_RULE_ROLES } from './mapping-rules';
import { MEMBERSHIP_WRITE_ROLES } from './membership-writes';
import { ORG_WRITE_ROLES } from './org-writes';
import { PROJECT_WRITE_ROLES } from './project-writes';
import { RESOURCE_WRITE_ROLES } from './resource-writes';
import { TENANT_CURRENCY_ROLES } from './tenant-currency';
import { CONNECTOR_WRITE_ROLES } from './connector-writes';
/**
 * Spread order matters only for readability — the gate asserts the key set against the exported
 * surface (use-cases barrel plus the schedule/calendar second module list — Epic 2 retro F10),
 * and a duplicate key would be a compile error in the module that owns it.
 */
export const USE_CASE_ROLES = {
    ...GET_PROJECT_HEADER_ROLES,
    ...GET_PROJECT_REVIEW_ROLES,
    ...GET_PROJECT_MAPPING_ROLES,
    ...PROJECT_WRITE_ROLES,
    ...MAPPING_RULE_ROLES,
    ...ORG_WRITE_ROLES,
    ...ORG_LIST_READ_ROLES,
    ...MEMBERSHIP_WRITE_ROLES,
    ...RESOURCE_WRITE_ROLES,
    ...AUDIT_LOG_READ_ROLES,
    ...TENANT_CURRENCY_ROLES,
    ...SCHEDULE_ROLES,
    ...CALENDAR_ROLES,
    ...SET_BASELINE_ROLES,
    ...RE_BASELINE_ROLES,
    ...COMPARE_BASELINE_VERSIONS_ROLES,
    ...RE_DERIVE_PINNED_BASELINE_ROLES,
    ...CONNECTOR_WRITE_ROLES,
};
