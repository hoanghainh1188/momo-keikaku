import { describe, expect, it } from 'vitest';
import type { RequestContext, Role } from '../packages/app/src/authz/request-context';
import { ROLES } from '../packages/app/src/authz/request-context';
import type { Result } from '../packages/app/src/result';
import * as useCases from '../packages/app/src/use-cases';
import { USE_CASE_ROLES } from '../packages/app/src/use-cases/role-declarations';
import { readSurfaceFunctionNames, READ_SURFACE_MODULE } from './read-use-cases';

/**
 * THE ROLE GATE (story 1.5, AD-12). Pure: no database, no environment.
 *
 * Two proofs, both required:
 *
 *   1. Enumeration — every export of `packages/app/src/use-cases/index.ts` appears in
 *      `USE_CASE_ROLES`, nothing stale, every declaration names known non-empty roles. A new
 *      use case that ships without a declaration fails here, named — the same spirit as the
 *      audited-use-case and cross-tenant enumerations.
 *   2. Enforcement — every export, called with a viewer-only context, a deps Proxy that
 *      throws on any access, and deliberately malformed input, answers `not_found` and never
 *      touches deps. That is what proves the runners call `authorize` BEFORE parse: a table
 *      entry alone would leave this green.
 *
 * The declarations themselves are pinned by an inline snapshot of `USE_CASE_ROLES`, so story
 * 1.6 can add a third shape (e.g. `tenant_admin` | `pm` with no Project) by updating the
 * snapshot rather than a hand-copied set.
 */

const ROLE_DECLARATIONS_MODULE = 'packages/app/src/use-cases/role-declarations.ts';

const KNOWN_ROLES = new Set<string>(ROLES);

const VIEWER_ROLES = ['client_viewer', 'internal_viewer'] as const satisfies readonly Role[];

/** A signed-in viewer of `ten-a` that names a Project — enough for a reach check if roles leaked past. */
function viewerContext(role: (typeof VIEWER_ROLES)[number]): RequestContext {
  return {
    tenantId: 'ten-a',
    userId: 'usr-viewer',
    roles: [role],
    projectIds: ['prj-1'],
    locale: 'en',
  };
}

/**
 * Deps that record every property access and then throw. A use case that opens a transaction
 * or reads a port before authorising fails loudly; a clean `not_found` leaves `touches` empty.
 */
function throwingDeps(): { readonly deps: object; readonly touches: string[] } {
  const touches: string[] = [];
  const deps = new Proxy(
    {},
    {
      get(_target, prop) {
        // Avoid thenable traps if something awaits the deps object by mistake.
        if (prop === 'then') return undefined;
        touches.push(String(prop));
        throw new Error(`deps.${String(prop)} accessed before authorize`);
      },
    },
  );
  return { deps, touches };
}

type UseCaseFn = (
  deps: unknown,
  ctx: RequestContext,
  input: unknown,
) => Promise<Result<unknown>>;

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

  it('pins every use case\'s declared roles', () => {
    expect(USE_CASE_ROLES).toMatchInlineSnapshot(`
      {
        "assignMemberProject": {
          "projectScoped": false,
          "roles": [
            "tenant_admin",
          ],
        },
        "changeMemberRole": {
          "projectScoped": false,
          "roles": [
            "tenant_admin",
          ],
        },
        "createDepartment": {
          "projectScoped": false,
          "roles": [
            "tenant_admin",
          ],
        },
        "createProgram": {
          "projectScoped": false,
          "roles": [
            "tenant_admin",
          ],
        },
        "createProject": {
          "projectScoped": false,
          "roles": [
            "tenant_admin",
          ],
        },
        "explainTickets": {
          "projectScoped": true,
          "roles": [
            "tenant_admin",
            "pm",
          ],
        },
        "getClientView": {
          "projectScoped": true,
          "roles": [
            "tenant_admin",
            "pm",
          ],
        },
        "getProjectHeader": {
          "projectScoped": true,
          "roles": [
            "tenant_admin",
            "pm",
          ],
        },
        "getProjectMapping": {
          "projectScoped": true,
          "roles": [
            "tenant_admin",
            "pm",
          ],
        },
        "getProjectReview": {
          "projectScoped": true,
          "roles": [
            "tenant_admin",
            "pm",
          ],
        },
        "mapTicket": {
          "projectScoped": true,
          "roles": [
            "tenant_admin",
            "pm",
          ],
        },
        "mapTickets": {
          "projectScoped": true,
          "roles": [
            "tenant_admin",
            "pm",
          ],
        },
        "markChangeRequestCandidates": {
          "projectScoped": true,
          "roles": [
            "tenant_admin",
            "pm",
          ],
        },
        "planTicketsAsWorkPackage": {
          "projectScoped": true,
          "roles": [
            "tenant_admin",
            "pm",
          ],
        },
        "reassignProjectDepartment": {
          "projectScoped": false,
          "roles": [
            "tenant_admin",
          ],
        },
        "reassignProjectProgram": {
          "projectScoped": false,
          "roles": [
            "tenant_admin",
          ],
        },
        "renameDepartment": {
          "projectScoped": false,
          "roles": [
            "tenant_admin",
          ],
        },
        "renameProgram": {
          "projectScoped": false,
          "roles": [
            "tenant_admin",
          ],
        },
        "renameProject": {
          "projectScoped": false,
          "roles": [
            "tenant_admin",
          ],
        },
        "revokeMembership": {
          "projectScoped": false,
          "roles": [
            "tenant_admin",
          ],
        },
        "unassignMemberProject": {
          "projectScoped": false,
          "roles": [
            "tenant_admin",
          ],
        },
      }
    `);
  });
});

describe('every use case authorises before parse', () => {
  it('answers not_found to a viewer, touching no deps, for every export', async () => {
    const surface = useCases as Readonly<Record<string, UseCaseFn>>;
    const offenders: string[] = [];

    for (const name of readSurfaceFunctionNames()) {
      const fn = surface[name];
      if (typeof fn !== 'function') {
        offenders.push(`${name}: not a function on ${READ_SURFACE_MODULE}`);
        continue;
      }

      for (const role of VIEWER_ROLES) {
        const { deps, touches } = throwingDeps();
        let result: Result<unknown>;
        try {
          result = await fn(deps, viewerContext(role), {});
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          offenders.push(`${name} (${role}): threw before answering — ${reason}`);
          continue;
        }

        if (result.ok || result.error.code !== 'not_found') {
          offenders.push(
            `${name} (${role}): expected not_found, got ${JSON.stringify(result)}`,
          );
        }
        if (touches.length > 0) {
          offenders.push(
            `${name} (${role}): touched deps before authorize — ${touches.join(', ')}`,
          );
        }
      }
    }

    expect(offenders, offenders.join('\n') || undefined).toEqual([]);
  });
});
