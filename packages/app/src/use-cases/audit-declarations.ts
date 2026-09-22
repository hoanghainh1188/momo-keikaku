/**
 * EVERY write use case's audit declaration, in one table — what the audit gate
 * (`tests/audited-use-cases.test.ts`) reads.
 *
 * Internal to `use-cases/`, like `project-input.ts`: not re-exported from `use-cases/index.ts`,
 * whose exports ARE the enumerated surface. A module that adds write use cases spreads its own
 * declaration in here; the gate fails, with no database, naming any exported use case that is
 * neither a registered read nor declared here.
 */
import type { AuditDeclaration } from '../audit';
import { MEMBERSHIP_WRITE_AUDIT } from './membership-writes';
import { ORG_WRITE_AUDIT } from './org-writes';
import { PROJECT_WRITE_AUDIT } from './project-writes';
import { RESOURCE_WRITE_AUDIT } from './resource-writes';
import { TENANT_CURRENCY_AUDIT } from './tenant-currency';

export const USE_CASE_AUDIT: Readonly<Record<string, AuditDeclaration>> = {
  ...PROJECT_WRITE_AUDIT,
  ...ORG_WRITE_AUDIT,
  ...MEMBERSHIP_WRITE_AUDIT,
  ...RESOURCE_WRITE_AUDIT,
  ...TENANT_CURRENCY_AUDIT,
};
