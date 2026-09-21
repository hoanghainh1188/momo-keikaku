import { eq } from 'drizzle-orm';
import type { Bound } from './bound';
import * as s from './schema';

/**
 * THE ORGANISATION REPOSITORY — FR-1's Departments, Programs and Projects, read and written for
 * `packages/app`'s organisation writes (story 1.3 slice 2).
 *
 * Satisfies `packages/app`'s `OrgRepository` STRUCTURALLY (this package may not import
 * `@momo/app`); the row types below restate the port's and each composition root's `satisfies`
 * checks the match.
 *
 * BOUND TO ONE TRANSACTION AND ONE TENANT (`Bound`): built by `inTenantTransaction`, every
 * statement runs on its `tx`, under that Tenant's row-level security, and nothing here opens a
 * transaction. So a `find*` answering `null` is "this Tenant cannot see the row" — absent, or
 * another Tenant's; RLS makes them one event — and an UPDATE of such a row would touch nothing.
 *
 * EVERY `find*` LOCKS ITS ROW (`FOR UPDATE`): the `before` a use case records and the check it
 * makes are against the row as it stays until commit, so two concurrent renames cannot both record
 * the same previous name, and two reassignments cannot both pass a stale Program/Department check.
 *
 * It decides nothing: the Program/Department rule, the previous values and the new Project's
 * defaults are the use cases'. It never deletes (the slice's Never list: no deleting or
 * archiving org units), and `setProjectProgram` writes `program_id` alone, so a move between
 * Programs cannot reach any other column or table.
 */

export interface DepartmentRow {
  readonly id: string;
  readonly name: string;
}

export interface ProgramRow {
  readonly id: string;
  readonly departmentId: string;
  readonly name: string;
}

export interface ProjectPlacementRow {
  readonly id: string;
  readonly name: string;
  readonly departmentId: string;
  readonly programId: string | null;
}

export interface NewProjectRow extends ProjectPlacementRow {
  readonly clientName: string;
  readonly contractType: '請負' | '準委任';
  readonly tzOffsetMinutes: number;
  readonly teireiWeekday: number;
  readonly defaultRateJpy: number;
  readonly eacMethod: 'typical';
  readonly calendarJp: boolean;
  readonly calendarVn: boolean;
  readonly demoAnchor: Date;
}

interface Renamed {
  readonly id: string;
  readonly name: string;
}

/**
 * An UPDATE must change exactly the one row the use case found. Zero means the row vanished or
 * was never visible — the use case checked visibility first, so that is a bug, not a `not_found`,
 * and it must not commit as though the change landed.
 */
function exactlyOne(table: string, id: string, rowCount: number | null): void {
  if (rowCount !== 1) {
    throw new Error(`${table} ${id}: expected to update exactly one row, updated ${rowCount ?? 0}`);
  }
}

export function orgRepositoryOn({ tx, tenantId }: Bound) {
  return {
    findDepartment: async (id: string): Promise<DepartmentRow | null> => {
      const [row] = await tx
        .select({ id: s.department.id, name: s.department.name })
        .from(s.department)
        .where(eq(s.department.id, id))
        .for('update');
      return row ?? null;
    },

    findProgram: async (id: string): Promise<ProgramRow | null> => {
      const [row] = await tx
        .select({ id: s.program.id, departmentId: s.program.departmentId, name: s.program.name })
        .from(s.program)
        .where(eq(s.program.id, id))
        .for('update');
      return row ?? null;
    },

    /** `FOR UPDATE`, like every `find*` here: the row stays as read until the transaction ends. */
    findProject: async (id: string): Promise<ProjectPlacementRow | null> => {
      const [row] = await tx
        .select({
          id: s.project.id,
          name: s.project.name,
          departmentId: s.project.departmentId,
          programId: s.project.programId,
        })
        .from(s.project)
        .where(eq(s.project.id, id))
        .for('update');
      return row ?? null;
    },

    insertDepartment: async (row: DepartmentRow): Promise<void> => {
      await tx.insert(s.department).values({ id: row.id, tenantId, name: row.name });
    },

    renameDepartment: async ({ id, name }: Renamed): Promise<void> => {
      const res = await tx.update(s.department).set({ name }).where(eq(s.department.id, id));
      exactlyOne('department', id, res.rowCount);
    },

    insertProgram: async (row: ProgramRow): Promise<void> => {
      await tx
        .insert(s.program)
        .values({ id: row.id, tenantId, departmentId: row.departmentId, name: row.name });
    },

    renameProgram: async ({ id, name }: Renamed): Promise<void> => {
      const res = await tx.update(s.program).set({ name }).where(eq(s.program.id, id));
      exactlyOne('program', id, res.rowCount);
    },

    insertProject: async (row: NewProjectRow): Promise<void> => {
      // Column by column, not a spread: a stray property on `row` must not reach the insert.
      await tx.insert(s.project).values({
        id: row.id,
        tenantId,
        departmentId: row.departmentId,
        programId: row.programId,
        name: row.name,
        clientName: row.clientName,
        contractType: row.contractType,
        tzOffsetMinutes: row.tzOffsetMinutes,
        teireiWeekday: row.teireiWeekday,
        defaultRateJpy: row.defaultRateJpy,
        eacMethod: row.eacMethod,
        calendarJp: row.calendarJp,
        calendarVn: row.calendarVn,
        demoAnchor: row.demoAnchor,
      });
    },

    renameProject: async ({ id, name }: Renamed): Promise<void> => {
      const res = await tx.update(s.project).set({ name }).where(eq(s.project.id, id));
      exactlyOne('project', id, res.rowCount);
    },

    setProjectProgram: async ({
      id,
      programId,
    }: {
      readonly id: string;
      readonly programId: string | null;
    }): Promise<void> => {
      const res = await tx.update(s.project).set({ programId }).where(eq(s.project.id, id));
      exactlyOne('project', id, res.rowCount);
    },

    setProjectDepartment: async ({
      id,
      departmentId,
      programId,
    }: {
      readonly id: string;
      readonly departmentId: string;
      readonly programId: string | null;
    }): Promise<void> => {
      const res = await tx
        .update(s.project)
        .set({ departmentId, programId })
        .where(eq(s.project.id, id));
      exactlyOne('project', id, res.rowCount);
    },
  };
}
