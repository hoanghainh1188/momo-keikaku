import { eq } from 'drizzle-orm';
import type { Bound } from './bound';
import * as s from './schema';
import { lockWatermark } from './watermark-lock';

/**
 * THE RESOURCE / RATE REPOSITORY — Resources, `rate_entry`, and `project_default_rate_entry`
 * for `packages/app`'s Resource/Rate writes (story 1.6).
 *
 * Satisfies `packages/app`'s `ResourceWriteRepository` STRUCTURALLY. Bound to one transaction
 * and one Tenant (`Bound`). `findProject` locks the row so a default-Rate append and a concurrent
 * rename cannot race the dual-write of `default_rate_jpy`. It takes `FOR NO KEY UPDATE`, not
 * `FOR UPDATE`: the default-Rate append then waits on the Project's watermark lock while holding
 * that row, and a concurrent Mapping append that already holds the watermark lock takes
 * `FOR KEY SHARE` on the same row through its foreign key. `FOR UPDATE` conflicts with that and
 * deadlocks the pair; `FOR NO KEY UPDATE` does not, and still serialises against a rename.
 *
 * THE TWO APPENDS TAKE THEIR WATERMARK LOCK FIRST (story 1.2 watermark slice, D2): `rate_entry`
 * the Tenant key, `project_default_rate_entry` the Project key (`watermark-lock.ts`).
 */

export interface ResourceDepartmentRow {
  readonly id: string;
}

export interface ResourceRow {
  readonly id: string;
  readonly departmentId: string;
  readonly name: string;
  readonly role: string;
}

export interface NewResourceRow {
  readonly id: string;
  readonly departmentId: string;
  readonly name: string;
  readonly role: string;
}

export interface ResourceProjectRow {
  readonly id: string;
}

export interface RateAppend {
  readonly resourceId: string;
  readonly effectiveFrom: string;
  readonly yenPerHour: number;
}

export interface ProjectDefaultRateAppend {
  readonly projectId: string;
  readonly effectiveFrom: string;
  readonly yenPerHour: number;
}

function exactlyOne(table: string, id: string, rowCount: number | null): void {
  if (rowCount !== 1) {
    throw new Error(`${table} ${id}: expected to update exactly one row, updated ${rowCount ?? 0}`);
  }
}

export function resourceWriteRepositoryOn(bound: Bound) {
  const { tx, tenantId } = bound;
  return {
    findDepartment: async (id: string): Promise<ResourceDepartmentRow | null> => {
      const [row] = await tx
        .select({ id: s.department.id })
        .from(s.department)
        .where(eq(s.department.id, id));
      return row ?? null;
    },

    findResource: async (id: string): Promise<ResourceRow | null> => {
      const [row] = await tx
        .select({
          id: s.resource.id,
          departmentId: s.resource.departmentId,
          name: s.resource.name,
          role: s.resource.role,
        })
        .from(s.resource)
        .where(eq(s.resource.id, id));
      return row ?? null;
    },

    findProject: async (id: string): Promise<ResourceProjectRow | null> => {
      const [row] = await tx
        .select({ id: s.project.id })
        .from(s.project)
        .where(eq(s.project.id, id))
        .for('no key update');
      return row ?? null;
    },

    insertResource: async (row: NewResourceRow): Promise<void> => {
      await tx.insert(s.resource).values({
        id: row.id,
        tenantId,
        departmentId: row.departmentId,
        name: row.name,
        role: row.role,
        trackerAccountIds: [],
      });
    },

    appendResourceRate: async (row: RateAppend): Promise<void> => {
      await lockWatermark(bound, { kind: 'tenant' });
      await tx.insert(s.rateEntry).values({
        tenantId,
        resourceId: row.resourceId,
        effectiveFrom: row.effectiveFrom,
        yenPerHour: row.yenPerHour,
      });
    },

    appendProjectDefaultRate: async (row: ProjectDefaultRateAppend): Promise<void> => {
      await lockWatermark(bound, { kind: 'project', projectId: row.projectId });
      await tx.insert(s.projectDefaultRateEntry).values({
        tenantId,
        projectId: row.projectId,
        effectiveFrom: row.effectiveFrom,
        yenPerHour: row.yenPerHour,
      });
      const res = await tx
        .update(s.project)
        .set({ defaultRateJpy: row.yenPerHour })
        .where(eq(s.project.id, row.projectId));
      exactlyOne('project', row.projectId, res.rowCount);
    },
  };
}
