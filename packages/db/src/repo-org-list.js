/**
 * THE ORGANISATION LIST READERS (story 2.17) — tenant-scoped SELECTs for the Admin hierarchy
 * pages. Separate from `repo-org.ts`'s FOR UPDATE finders: UI lists must not take write locks.
 *
 * Each call runs inside `withTenant`. Parent names come from joins so the Admin can act without
 * a second round-trip.
 */
import { asc, eq } from 'drizzle-orm';
import * as schema from './schema';
import { withTenant } from './with-tenant';
/** Departments of the caller's Tenant, name ascending then id. */
export async function listDepartments(db, tenantId) {
    return withTenant(db, tenantId, async (tx) => {
        const rows = await tx
            .select({
            id: schema.department.id,
            name: schema.department.name,
        })
            .from(schema.department)
            .where(eq(schema.department.tenantId, tenantId))
            .orderBy(asc(schema.department.name), asc(schema.department.id));
        return rows.map((row) => ({ id: row.id, name: row.name }));
    });
}
/** Programs of the caller's Tenant with owning Department name, name ascending then id. */
export async function listPrograms(db, tenantId) {
    return withTenant(db, tenantId, async (tx) => {
        const rows = await tx
            .select({
            id: schema.program.id,
            departmentId: schema.program.departmentId,
            departmentName: schema.department.name,
            name: schema.program.name,
        })
            .from(schema.program)
            .innerJoin(schema.department, eq(schema.program.departmentId, schema.department.id))
            .where(eq(schema.program.tenantId, tenantId))
            .orderBy(asc(schema.program.name), asc(schema.program.id));
        return rows.map((row) => ({
            id: row.id,
            departmentId: row.departmentId,
            departmentName: row.departmentName,
            name: row.name,
        }));
    });
}
/** Projects of the caller's Tenant with Department and optional Program names. */
export async function listProjects(db, tenantId) {
    return withTenant(db, tenantId, async (tx) => {
        const rows = await tx
            .select({
            id: schema.project.id,
            name: schema.project.name,
            departmentId: schema.project.departmentId,
            departmentName: schema.department.name,
            programId: schema.project.programId,
            programName: schema.program.name,
        })
            .from(schema.project)
            .innerJoin(schema.department, eq(schema.project.departmentId, schema.department.id))
            .leftJoin(schema.program, eq(schema.project.programId, schema.program.id))
            .where(eq(schema.project.tenantId, tenantId))
            .orderBy(asc(schema.project.name), asc(schema.project.id));
        return rows.map((row) => ({
            id: row.id,
            name: row.name,
            departmentId: row.departmentId,
            departmentName: row.departmentName,
            programId: row.programId,
            programName: row.programName,
        }));
    });
}
