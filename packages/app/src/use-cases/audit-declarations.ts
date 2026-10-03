/**
 * EVERY write use case's audit declaration, in one table — what the audit gate
 * (`tests/audited-use-cases.test.ts`) reads.
 *
 * Internal to `use-cases/`, like `project-input.ts`: not re-exported from `use-cases/index.ts`,
 * whose exports ARE the primary enumerated surface. The gate also enumerates a second
 * schedule/calendar module list (Epic 2 retro F10 / Q1→B) whose writers stay off that barrel.
 * A module that adds write use cases spreads its own declaration in here; the gate fails, with
 * no database, naming any exported use case that is neither a registered read nor declared here.
 */
import type { AuditDeclaration } from '../audit';
import { SET_BASELINE_AUDIT } from '../baseline/set-baseline';
import { CALENDAR_AUDIT } from '../calendar/publish-calendar-version';
import { SCHEDULE_AUDIT } from '../schedule/apply-plan-change';
import { MEMBERSHIP_WRITE_AUDIT } from './membership-writes';
import { ORG_WRITE_AUDIT } from './org-writes';
import { PROJECT_WRITE_AUDIT } from './project-writes';
import { RESOURCE_WRITE_AUDIT } from './resource-writes';
import { TENANT_CURRENCY_AUDIT } from './tenant-currency';

/**
 * Every write's audit declaration — Epic 1 use-cases plus the schedule/calendar second module
 * list (Epic 2 retro F10 / Q1→B). Schedule/calendar stay off `use-cases/index.ts`.
 */
export const USE_CASE_AUDIT: Readonly<Record<string, AuditDeclaration>> = {
  ...PROJECT_WRITE_AUDIT,
  ...ORG_WRITE_AUDIT,
  ...MEMBERSHIP_WRITE_AUDIT,
  ...RESOURCE_WRITE_AUDIT,
  ...TENANT_CURRENCY_AUDIT,
  ...SCHEDULE_AUDIT,
  ...CALENDAR_AUDIT,
  ...SET_BASELINE_AUDIT,
};
