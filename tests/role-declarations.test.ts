import { describe, expect, it } from 'vitest';
import { PROJECT_REACH_ROLES, TENANT_ADMIN_ROLES } from '../packages/app/src/authz/authorize';
import { ROLES, type Role } from '../packages/app/src/authz/request-context';
import {
  USE_CASE_ROLES,
  type RoleDeclaration,
} from '../packages/app/src/use-cases/role-declarations';
import { readSurfaceFunctionNames, READ_SURFACE_MODULE } from './read-use-cases';

/**
 * THE ROLE GATE (story 1.5, AD-12). Pure: no database, no environment.
 *
 * Every export of `packages/app/src/use-cases/index.ts` must appear in `USE_CASE_ROLES`. A new
 * use case that ships without a declaration fails here, named — the same spirit as the
 * audited-use-case and cross-tenant enumerations. Declarations that name nothing on the surface
 * fail too. The runners call `authorize` with the same role sets; this table is the mechanical
 * enumeration.
 */

const ROLE_DECLARATIONS_MODULE = 'packages/app/src/use-cases/role-declarations.ts';

const KNOWN_ROLES = new Set<string>(ROLES);

const PROJECT_SCOPED = new Set([
  'getProjectHeader',
  'getProjectReview',
  'getProjectMapping',
  'getClientView',
  'planTicketsAsWorkPackage',
  'mapTickets',
  'mapTicket',
  'explainTickets',
  'markChangeRequestCandidates',
]);

describe('every use case declares its roles', () => {
  it('declares every export of the use-case surface', () => {
    const exported = readSurfaceFunctionNames();
    const undeclared = exported.filter((name) => !Object.hasOwn(USE_CASE_ROLES, name));
    expect(
      undeclared,
      `these functions are exported from ${READ_SURFACE_MODULE} with no role declaration in ` +
        `${ROLE_DECLARATIONS_MODULE}: ${undeclared.join(', ')}. Declare each { roles, projectScoped }.`,
    ).toEqual([]);
  });

  it('declares nothing that is not an exported use case', () => {
    const exported = new Set(readSurfaceFunctionNames());
    const stale = Object.keys(USE_CASE_ROLES).filter((name) => !exported.has(name));
    expect(
      stale,
      `${ROLE_DECLARATIONS_MODULE} declares ${stale.join(', ')}, which is not an export of ` +
        `${READ_SURFACE_MODULE}`,
    ).toEqual([]);
  });

  it('gives every declaration known roles and a non-empty set', () => {
    const broken = Object.entries(USE_CASE_ROLES).flatMap(([name, declaration]) => {
      const problems: string[] = [];
      if (declaration.roles.length === 0) problems.push(`${name}: no roles`);
      const unknown = declaration.roles.filter((role) => !KNOWN_ROLES.has(role));
      if (unknown.length > 0) problems.push(`${name}: unknown roles ${unknown.join(', ')}`);
      return problems;
    });
    expect(broken).toEqual([]);
  });

  it('matches the story\'s role sets — admin-only vs project-reach', () => {
    const expected: Readonly<Record<string, RoleDeclaration>> = Object.fromEntries(
      Object.keys(USE_CASE_ROLES).map((name) => {
        const projectScoped = PROJECT_SCOPED.has(name);
        return [
          name,
          {
            roles: (projectScoped ? PROJECT_REACH_ROLES : TENANT_ADMIN_ROLES) as readonly Role[],
            projectScoped,
          },
        ];
      }),
    );
    expect(USE_CASE_ROLES).toEqual(expected);
  });
});
