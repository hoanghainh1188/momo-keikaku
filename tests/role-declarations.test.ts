import { describe, expect, it } from 'vitest';
import type { RequestContext, Role } from '../packages/app/src/authz/request-context';
import { ROLES } from '../packages/app/src/authz/request-context';
import type { Result } from '../packages/app/src/result';
import * as useCases from '../packages/app/src/use-cases';
import { USE_CASE_ROLES } from '../packages/app/src/use-cases/role-declarations';
import { readSurfaceFunctionNames, READ_SURFACE_MODULE } from './read-use-cases';
import {
  readScheduleCalendarWriteFunctionNames,
  SCHEDULE_CALENDAR_WRITE_MODULES,
  scheduleCalendarWriteFns,
} from './schedule-calendar-writes';

/**
 * THE ROLE GATE (story 1.5, AD-12). Pure: no database, no environment.
 *
 * Two proofs, both required:
 *
 *   1. Enumeration — every export of `packages/app/src/use-cases/index.ts` AND every function
 *      export of the schedule/calendar write modules (Epic 2 retro F10 / Q1→B) appears in
 *      `USE_CASE_ROLES`, nothing stale, every declaration names known non-empty roles. A new
 *      use case that ships without a declaration fails here, named — the same spirit as the
 *      audited-use-case and cross-tenant enumerations.
 *   2. Enforcement — every export, called with a viewer-only context, a deps Proxy that
 *      throws on any access, and deliberately malformed input, answers `not_found` and never
 *      touches deps. That is what proves the runners call `authorize` BEFORE parse: a table
 *      entry alone would leave this green. Every export whose declared roles exclude `pm` is
 *      also called as a PM and must refuse the same way, which ties each declared role set to
 *      the one its runner enforces. And every `projectScoped` export is called as a PM whose
 *      `projectIds` omit the Project, with input it accepts (`WELL_FORMED_INPUT`), and must refuse
 *      the same way — the reach half, checked after parse (AD-12).
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

/** The Project the reach loop's inputs name — never one in the unassigned PM's projectIds. */
const UNREACHED_PROJECT = 'prj-unreached';

/**
 * Input each project-scoped use case ACCEPTS, naming `UNREACHED_PROJECT` — so the reach check,
 * which runs after parse, is what refuses it. The reach loop fails, naming the export, when a
 * project-scoped entry has no input here: a new one (story 1.6's, say) adds its own.
 */
const WELL_FORMED_INPUT: Readonly<Record<string, unknown>> = {
  getProjectHeader: { projectId: UNREACHED_PROJECT },
  getProjectReview: { projectId: UNREACHED_PROJECT },
  getProjectMapping: { projectId: UNREACHED_PROJECT },
  mapTickets: { projectId: UNREACHED_PROJECT, wpId: 'wp-1', ticketIds: ['tkt-1'] },
  planTicketsAsWorkPackage: { projectId: UNREACHED_PROJECT, name: 'New work', ticketIds: ['tkt-1'] },
  explainTickets: { projectId: UNREACHED_PROJECT, note: 'Client asked for it.', ticketIds: ['tkt-1'] },
  markChangeRequestCandidates: { projectId: UNREACHED_PROJECT, ticketIds: ['tkt-1'] },
  mapTicket: { projectId: UNREACHED_PROJECT, ticketId: 'tkt-1', wpId: 'wp-1' },
  applyPlanChange: { kind: 'clear_project_start', projectId: UNREACHED_PROJECT },
  publishCalendarVersion: { projectId: UNREACHED_PROJECT },
  patchNationalCalendarFlags: {
    projectId: UNREACHED_PROJECT,
    calendarJp: true,
    calendarVn: false,
  },
  addProjectNonWorkingDay: { projectId: UNREACHED_PROJECT, day: '2026-01-01' },
  removeProjectNonWorkingDay: { projectId: UNREACHED_PROJECT, day: '2026-01-01' },
  setBaseline: { projectId: UNREACHED_PROJECT },
  reBaseline: { projectId: UNREACHED_PROJECT, reason: 'scope change' },
  compareBaselineVersions: {
    projectId: UNREACHED_PROJECT,
    fromVersionSeq: 1,
    toVersionSeq: 2,
  },
};

type UseCaseFn = (
  deps: unknown,
  ctx: RequestContext,
  input: unknown,
) => Promise<Result<unknown>>;

/** Use-cases barrel plus schedule/calendar writers — the full enumerated surface. */
function allDeclaredSurfaceNames(): string[] {
  return [...readSurfaceFunctionNames(), ...readScheduleCalendarWriteFunctionNames()].sort();
}

const CALLABLE: Readonly<Record<string, UseCaseFn>> = {
  ...(useCases as Readonly<Record<string, UseCaseFn>>),
  ...scheduleCalendarWriteFns(),
};

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

  it('declares every schedule/calendar write export (retro F10 / Q1→B)', () => {
    const exported = readScheduleCalendarWriteFunctionNames();
    const undeclared = exported.filter((name) => !Object.hasOwn(USE_CASE_ROLES, name));
    expect(
      undeclared,
      `these functions are exported from ${SCHEDULE_CALENDAR_WRITE_MODULES.join(' / ')} with no ` +
        `role declaration in ${ROLE_DECLARATIONS_MODULE}: ${undeclared.join(', ')}. Declare each ` +
        '{ roles, projectScoped } and merge via SCHEDULE_ROLES / CALENDAR_ROLES.',
    ).toEqual([]);
  });

  it('declares nothing that is not an exported use case or schedule/calendar writer', () => {
    const exported = new Set(allDeclaredSurfaceNames());
    const stale = Object.keys(USE_CASE_ROLES).filter((name) => !exported.has(name));
    expect(
      stale,
      `${ROLE_DECLARATIONS_MODULE} declares ${stale.join(', ')}, which is not an export of ` +
        `${READ_SURFACE_MODULE} or ${SCHEDULE_CALENDAR_WRITE_MODULES.join(' / ')}`,
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
        "addProjectNonWorkingDay": {
          "projectScoped": true,
          "roles": [
            "tenant_admin",
            "pm",
          ],
        },
        "appendProjectDefaultRate": {
          "projectScoped": false,
          "roles": [
            "tenant_admin",
          ],
        },
        "appendResourceRate": {
          "projectScoped": false,
          "roles": [
            "tenant_admin",
          ],
        },
        "applyPlanChange": {
          "projectScoped": true,
          "roles": [
            "tenant_admin",
            "pm",
          ],
        },
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
        "changeTenantCurrency": {
          "projectScoped": false,
          "roles": [
            "tenant_admin",
          ],
        },
        "compareBaselineVersions": {
          "projectScoped": true,
          "roles": [
            "tenant_admin",
            "pm",
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
        "createResource": {
          "projectScoped": false,
          "roles": [
            "tenant_admin",
            "pm",
          ],
        },
        "explainTickets": {
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
        "listAuditLog": {
          "projectScoped": false,
          "roles": [
            "tenant_admin",
          ],
        },
        "listDepartments": {
          "projectScoped": false,
          "roles": [
            "tenant_admin",
          ],
        },
        "listPrograms": {
          "projectScoped": false,
          "roles": [
            "tenant_admin",
          ],
        },
        "listProjects": {
          "projectScoped": false,
          "roles": [
            "tenant_admin",
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
        "patchNationalCalendarFlags": {
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
        "publishCalendarVersion": {
          "projectScoped": true,
          "roles": [
            "tenant_admin",
            "pm",
          ],
        },
        "publishCalendarVersionFanOut": {
          "projectScoped": false,
          "roles": [
            "tenant_admin",
            "pm",
          ],
        },
        "reBaseline": {
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
        "removeProjectNonWorkingDay": {
          "projectScoped": true,
          "roles": [
            "tenant_admin",
            "pm",
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
        "setBaseline": {
          "projectScoped": true,
          "roles": [
            "tenant_admin",
            "pm",
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

/**
 * Calls `name` with `ctx`, throwing deps and malformed input, and returns what is wrong with the
 * answer: anything but `not_found`, or any touch of deps. Empty when the refusal was clean.
 */
async function refusalProblems(
  name: string,
  label: string,
  ctx: RequestContext,
  input: unknown = {},
): Promise<string[]> {
  const fn = CALLABLE[name];
  if (typeof fn !== 'function') {
    return [
      `${name}: not a function on ${READ_SURFACE_MODULE} or ` +
        SCHEDULE_CALENDAR_WRITE_MODULES.join(' / '),
    ];
  }

  const { deps, touches } = throwingDeps();
  let result: Result<unknown>;
  try {
    result = await fn(deps, ctx, input);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return [`${name} (${label}): threw before answering — ${reason}`];
  }

  const problems: string[] = [];
  if (result.ok || result.error.code !== 'not_found') {
    problems.push(`${name} (${label}): expected not_found, got ${JSON.stringify(result)}`);
  }
  if (touches.length > 0) {
    problems.push(`${name} (${label}): touched deps before authorize — ${touches.join(', ')}`);
  }
  return problems;
}

describe('every use case authorises before parse', () => {
  it('answers not_found to a viewer, touching no deps, for every export', async () => {
    const offenders: string[] = [];
    for (const name of allDeclaredSurfaceNames()) {
      for (const role of VIEWER_ROLES) {
        offenders.push(...(await refusalProblems(name, role, viewerContext(role))));
      }
    }
    expect(offenders, offenders.join('\n') || undefined).toEqual([]);
  });

  // The reach half (AD-12). Role refusal is before parse, so the two loops around this one can use
  // malformed input; reach is checked AFTER parse, so this loop needs input each use case accepts.
  // A PM whose projectIds omit the Project the input names must be refused before any load or
  // transaction — a project-scoped runner that forgot its reach check would answer ok here, or
  // touch the throwing deps.
  it('answers not_found to an unassigned PM, touching no deps, for every project-scoped export', async () => {
    const unassigned: RequestContext = {
      ...viewerContext('client_viewer'),
      userId: 'usr-pm',
      roles: ['pm'],
      projectIds: ['prj-assigned'],
    };
    const scoped = Object.entries(USE_CASE_ROLES)
      .filter(([, declaration]) => declaration.projectScoped)
      .map(([name]) => name);
    const missing = scoped.filter((name) => !Object.hasOwn(WELL_FORMED_INPUT, name));
    expect(
      missing,
      `add a well-formed input naming ${UNREACHED_PROJECT} to WELL_FORMED_INPUT for: ${missing.join(', ')}`,
    ).toEqual([]);
    const stale = Object.keys(WELL_FORMED_INPUT).filter((name) => !scoped.includes(name));
    expect(stale, `WELL_FORMED_INPUT names what is not a project-scoped export: ${stale.join(', ')}`).toEqual([]);

    const offenders: string[] = [];
    for (const name of scoped) {
      offenders.push(
        ...(await refusalProblems(name, 'unassigned pm', unassigned, WELL_FORMED_INPUT[name])),
      );
    }
    expect(offenders, offenders.join('\n') || undefined).toEqual([]);
  });

  // The other side of the same check: a runner that refused EVERY PM (reach compared against the
  // wrong field, say) would pass the loop above. A PM whose projectIds DO include the Project must
  // get past authorisation — which, with these deps, shows as a touch of deps.
  it('lets an assigned PM past authorisation for every project-scoped export', async () => {
    const assigned: RequestContext = {
      ...viewerContext('client_viewer'),
      userId: 'usr-pm',
      roles: ['pm'],
      projectIds: [UNREACHED_PROJECT],
    };
    const blocked: string[] = [];
    for (const [name, declaration] of Object.entries(USE_CASE_ROLES)) {
      if (!declaration.projectScoped) continue;
      const fn = CALLABLE[name]!;
      const { deps, touches } = throwingDeps();
      try {
        const result = await fn(deps, assigned, WELL_FORMED_INPUT[name]);
        if (touches.length === 0) blocked.push(`${name}: answered ${JSON.stringify(result)} without reaching its deps`);
      } catch {
        if (touches.length === 0) blocked.push(`${name}: threw without reaching its deps`);
      }
    }
    expect(blocked, blocked.join('\n') || undefined).toEqual([]);
  });

  // The viewer loop cannot tell WHICH role set a runner enforces — both sets refuse viewers. This
  // ties each declaration to its runner: an export whose declared roles exclude `pm` must refuse
  // a PM too, so an admin-only runner that passed `PROJECT_REACH_ROLES` would fail here, named.
  it('answers not_found to a PM, touching no deps, for every export not declared for pm', async () => {
    const pmContext: RequestContext = { ...viewerContext('client_viewer'), userId: 'usr-pm', roles: ['pm'] };
    const offenders: string[] = [];
    for (const [name, declaration] of Object.entries(USE_CASE_ROLES)) {
      if (declaration.roles.includes('pm')) continue;
      offenders.push(...(await refusalProblems(name, 'pm', pmContext)));
    }
    expect(offenders, offenders.join('\n') || undefined).toEqual([]);
  });
});
