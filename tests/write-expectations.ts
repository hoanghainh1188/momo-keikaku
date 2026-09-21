/**
 * What an own-Tenant write must land, per write entry of `tests/read-use-cases.ts` — keyed by the
 * registry's name, and asserted both ways (every write has one, every one names a write) by
 * `tests/cross-tenant-writes.test.ts`, with no database.
 *
 * The five project writes' rows are exactly what the actions always wrote (story 1.2 slice 4 /
 * 1.3 slice 1, unchanged). The eight organisation writes' (story 1.3 slice 2) are the org row
 * after the change — whole, so a write touching another column shows — and one audit row stamped
 * with the harness's Clock, carrying the previous value where there is one.
 */
import type { Landed } from './write-harness';
import type { WriteTarget } from './read-use-cases';

export interface ExpectContext {
  readonly target: WriteTarget;
  /** The Project's anchor: the project writes' event time. */
  readonly at: Date;
  /** The harness's Clock: the organisation writes' event time. */
  readonly now: Date;
  readonly actor: string;
  /** The `9.` Work Packages the Project had before the write. */
  readonly ninesBefore: number;
  /** The ids the id port handed out during the write, in order. */
  readonly newIds: readonly string[];
  /** Every row the write could change, as it was before — where previous values come from. */
  readonly before: Landed;
}

export interface ExpectedRows {
  readonly mappingEvents: readonly Record<string, unknown>[];
  readonly dispositions: readonly Record<string, unknown>[];
  readonly audits: readonly Record<string, unknown>[];
  readonly workPackages: readonly Record<string, unknown>[];
  readonly departments: readonly Record<string, unknown>[];
  readonly programs: readonly Record<string, unknown>[];
  readonly projects: readonly Record<string, unknown>[];
}

export type Expect = (ctx: ExpectContext) => ExpectedRows;

export const NO_ROWS: ExpectedRows = {
  mappingEvents: [],
  dispositions: [],
  audits: [],
  workPackages: [],
  departments: [],
  programs: [],
  projects: [],
};

function dispositionMappings({ target, at, actor }: ExpectContext, wpId: string) {
  return target.ticketIds.map((ticketId) => ({
    id: `map-${ticketId}-${at.getTime()}`,
    tenantId: target.tenantId,
    projectId: target.projectId,
    ticketId,
    wpId,
    source: 'disposition',
    ruleId: null,
    at,
    actor,
  }));
}

function disposition(
  { target, at, actor }: ExpectContext,
  kind: string,
  wpId: string | null,
  note: string | null,
) {
  return {
    dispositions: [
      {
        id: `disp-${kind}-${at.getTime()}`,
        tenantId: target.tenantId,
        projectId: target.projectId,
        kind,
        ticketIds: [...target.ticketIds],
        wpId,
        note,
        at,
        actor,
      },
    ],
    audits: [
      {
        tenantId: target.tenantId,
        actor,
        action: `disposition.${kind}`,
        target: target.projectId,
        payload: { ticketIds: [...target.ticketIds], wpId, note },
        at,
      },
    ],
  };
}

/** FR-21's manual Mapping rows. `wpId` is the raw command value: `''` is the unmap. */
export function manualMapping(
  target: WriteTarget,
  at: Date,
  actor: string,
  wpId: string,
): ExpectedRows {
  const ticketId = target.ticketIds[0];
  return {
    ...NO_ROWS,
    mappingEvents: [
      {
        id: `map-${ticketId}-${at.getTime()}`,
        tenantId: target.tenantId,
        projectId: target.projectId,
        ticketId,
        wpId: wpId === '' ? null : wpId,
        source: 'manual',
        ruleId: null,
        at,
        actor,
      },
    ],
    audits: [
      {
        tenantId: target.tenantId,
        actor,
        action: wpId === '' ? 'mapping.unmap' : 'mapping.map',
        target: ticketId,
        payload: { wpId },
        at,
      },
    ],
  };
}

/** One organisation audit row, stamped with the Clock. */
function orgAudit({ target, now, actor }: ExpectContext, action: string, on: string, payload: unknown) {
  return [{ tenantId: target.tenantId, actor, action, target: on, payload, at: now }];
}

/** A row as it was before the write — the base an in-place change is expected against. */
function rowBefore<T extends { id: string }>(rows: readonly T[], id: string, table: string): T {
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error(`the probe Tenant has no ${table} ${id} to change`);
  return row;
}

export const EXPECTED: Readonly<Record<string, Expect>> = {
  mapTickets: (ctx) => ({
    ...NO_ROWS,
    mappingEvents: dispositionMappings(ctx, ctx.target.wpId),
    ...disposition(ctx, 'map', ctx.target.wpId, null),
  }),
  planTicketsAsWorkPackage: (ctx) => {
    const { target, at, ninesBefore } = ctx;
    const wpId = `wp-new-${at.getTime()}`;
    return {
      ...NO_ROWS,
      mappingEvents: dispositionMappings(ctx, wpId),
      ...disposition(ctx, 'plan', wpId, null),
      workPackages: [
        {
          id: wpId,
          tenantId: target.tenantId,
          projectId: target.projectId,
          wbsCode: `9.${ninesBefore + 1}`,
          name: 'Harness Plan',
          parentId: null,
          isLeaf: true,
          isMilestone: false,
          isCatchAll: false,
          start: null,
          finish: null,
          plannedMh: 0n,
          completedAt: null,
          milestoneDoneAt: null,
          assignedResourceIds: [],
          deletedAt: null,
        },
      ],
    };
  },
  explainTickets: (ctx) => ({ ...NO_ROWS, ...disposition(ctx, 'explain', null, 'Harness note.') }),
  markChangeRequestCandidates: (ctx) => ({
    ...NO_ROWS,
    ...disposition(ctx, 'cr_candidate', null, null),
  }),
  mapTicket: ({ target, at, actor }) => manualMapping(target, at, actor, target.wpId),

  // --- FR-1's organisation writes ----------------------------------------------------------------
  createDepartment: (ctx) => {
    const [id] = ctx.newIds;
    return {
      ...NO_ROWS,
      departments: [{ id, tenantId: ctx.target.tenantId, name: 'Harness Department' }],
      audits: orgAudit(ctx, 'department.create', id!, { name: 'Harness Department' }),
    };
  },
  renameDepartment: (ctx) => {
    const was = rowBefore(ctx.before.departments, ctx.target.departmentId, 'department');
    return {
      ...NO_ROWS,
      departments: [{ ...was, name: 'Harness Department renamed' }],
      audits: orgAudit(ctx, 'department.rename', was.id, {
        before: was.name,
        after: 'Harness Department renamed',
      }),
    };
  },
  createProgram: (ctx) => {
    const [id] = ctx.newIds;
    const { tenantId, departmentId } = ctx.target;
    return {
      ...NO_ROWS,
      programs: [{ id, tenantId, departmentId, name: 'Harness Program' }],
      audits: orgAudit(ctx, 'program.create', id!, { departmentId, name: 'Harness Program' }),
    };
  },
  renameProgram: (ctx) => {
    const was = rowBefore(ctx.before.programs, ctx.target.programId, 'program');
    return {
      ...NO_ROWS,
      programs: [{ ...was, name: 'Harness Program renamed' }],
      audits: orgAudit(ctx, 'program.rename', was.id, {
        before: was.name,
        after: 'Harness Program renamed',
      }),
    };
  },
  createProject: (ctx) => {
    const [id] = ctx.newIds;
    const { tenantId, departmentId, programId } = ctx.target;
    return {
      ...NO_ROWS,
      projects: [
        {
          id,
          tenantId,
          departmentId,
          programId,
          name: 'Harness Project',
          clientName: 'Harness Client',
          contractType: '準委任',
          // The documented defaults (packages/app's NEW_PROJECT_DEFAULTS), pinned as values.
          tzOffsetMinutes: 540,
          teireiWeekday: 1,
          defaultRateJpy: 0,
          eacMethod: 'typical',
          calendarJp: true,
          calendarVn: false,
          demoAnchor: ctx.now,
        },
      ],
      audits: orgAudit(ctx, 'project.create', id!, {
        name: 'Harness Project',
        departmentId,
        programId,
        clientName: 'Harness Client',
        contractType: '準委任',
      }),
    };
  },
  renameProject: (ctx) => {
    const was = rowBefore(ctx.before.projects, ctx.target.projectId, 'project');
    return {
      ...NO_ROWS,
      projects: [{ ...was, name: 'Harness Project renamed' }],
      audits: orgAudit(ctx, 'project.rename', was.id, {
        before: was.name,
        after: 'Harness Project renamed',
      }),
    };
  },
  reassignProjectProgram: (ctx) => {
    const was = rowBefore(ctx.before.projects, ctx.target.projectId, 'project');
    return {
      ...NO_ROWS,
      projects: [{ ...was, programId: null }],
      audits: orgAudit(ctx, 'project.reassign_program', was.id, {
        before: was.programId,
        after: null,
      }),
    };
  },
  reassignProjectDepartment: (ctx) => {
    const was = rowBefore(ctx.before.projects, ctx.target.projectId, 'project');
    const { departmentId, programId } = ctx.target;
    return {
      ...NO_ROWS,
      projects: [{ ...was, departmentId, programId }],
      audits: orgAudit(ctx, 'project.reassign_department', was.id, {
        before: { departmentId: was.departmentId, programId: was.programId },
        after: { departmentId, programId },
      }),
    };
  },
};
