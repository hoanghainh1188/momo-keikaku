import { eq } from 'drizzle-orm';
import * as s from './schema';
/**
 * An UPDATE must change exactly the one row the use case found. Zero means the row vanished or
 * was never visible — the use case checked visibility first, so that is a bug, not a `not_found`,
 * and it must not commit as though the change landed.
 */
function exactlyOne(table, id, rowCount) {
    if (rowCount !== 1) {
        throw new Error(`${table} ${id}: expected to update exactly one row, updated ${rowCount ?? 0}`);
    }
}
export function orgRepositoryOn({ tx, tenantId }) {
    return {
        findDepartment: async (id) => {
            const [row] = await tx
                .select({ id: s.department.id, name: s.department.name })
                .from(s.department)
                .where(eq(s.department.id, id))
                .for('update');
            return row ?? null;
        },
        findProgram: async (id) => {
            const [row] = await tx
                .select({ id: s.program.id, departmentId: s.program.departmentId, name: s.program.name })
                .from(s.program)
                .where(eq(s.program.id, id))
                .for('update');
            return row ?? null;
        },
        /** `FOR UPDATE`, like every `find*` here: the row stays as read until the transaction ends. */
        findProject: async (id) => {
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
        insertDepartment: async (row) => {
            await tx.insert(s.department).values({ id: row.id, tenantId, name: row.name });
        },
        renameDepartment: async ({ id, name }) => {
            const res = await tx.update(s.department).set({ name }).where(eq(s.department.id, id));
            exactlyOne('department', id, res.rowCount);
        },
        insertProgram: async (row) => {
            await tx
                .insert(s.program)
                .values({ id: row.id, tenantId, departmentId: row.departmentId, name: row.name });
        },
        renameProgram: async ({ id, name }) => {
            const res = await tx.update(s.program).set({ name }).where(eq(s.program.id, id));
            exactlyOne('program', id, res.rowCount);
        },
        insertProject: async (row) => {
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
        renameProject: async ({ id, name }) => {
            const res = await tx.update(s.project).set({ name }).where(eq(s.project.id, id));
            exactlyOne('project', id, res.rowCount);
        },
        setProjectProgram: async ({ id, programId, }) => {
            const res = await tx.update(s.project).set({ programId }).where(eq(s.project.id, id));
            exactlyOne('project', id, res.rowCount);
        },
        setProjectDepartment: async ({ id, departmentId, programId, }) => {
            const res = await tx
                .update(s.project)
                .set({ departmentId, programId })
                .where(eq(s.project.id, id));
            exactlyOne('project', id, res.rowCount);
        },
    };
}
