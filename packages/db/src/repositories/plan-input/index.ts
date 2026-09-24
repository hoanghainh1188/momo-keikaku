/**
 * AD-25 plan-input writers (story 2.9) — duration / constraint / dependency patches.
 *
 * Bound to one transaction and one Tenant. Only `packages/app/src/schedule` may import this
 * module (`.dependency-cruiser.cjs` `SCHEDULING_REPOSITORIES`). Every write goes through the
 * fence; these functions never open a transaction of their own.
 *
 * 23503 / 23514 from the leaf and type CHECKs / FKs surface as Postgres errors; the fence maps
 * them to `invalid_input` with the plan-invariant rule codes.
 */
import { and, eq } from 'drizzle-orm';
import type { Bound } from '../../bound';
import { projectNotFound } from '../../project-not-found';
import * as s from '../../schema';

export type ConstraintType = 'asap' | 'must_start_on' | 'must_finish_on';

export interface DurationPatch {
  readonly projectId: string;
  readonly wpId: string;
  readonly durationDays: number | null;
}

export interface ConstraintPatch {
  readonly projectId: string;
  readonly wpId: string;
  readonly constraintType: ConstraintType;
  readonly constraintDate: string | null;
}

export interface DependencyAdd {
  readonly projectId: string;
  readonly predecessorWpId: string;
  readonly successorWpId: string;
  readonly lagDays: number;
}

export interface DependencyRemove {
  readonly projectId: string;
  readonly predecessorWpId: string;
  readonly successorWpId: string;
}

export interface DependencyReLag {
  readonly projectId: string;
  readonly predecessorWpId: string;
  readonly successorWpId: string;
  readonly lagDays: number;
}

async function requireProject(bound: Bound, projectId: string): Promise<void> {
  const [row] = await bound.tx.select({ id: s.project.id }).from(s.project).where(eq(s.project.id, projectId));
  if (!row) throw projectNotFound(projectId);
}

export function planInputRepositoryOn(bound: Bound) {
  const { tx, tenantId } = bound;

  return {
    async patchDuration(command: DurationPatch): Promise<void> {
      await requireProject(bound, command.projectId);
      const updated = await tx
        .update(s.workPackage)
        .set({ durationDays: command.durationDays })
        .where(
          and(
            eq(s.workPackage.tenantId, tenantId),
            eq(s.workPackage.projectId, command.projectId),
            eq(s.workPackage.id, command.wpId),
          ),
        )
        .returning({ id: s.workPackage.id });
      if (updated.length === 0) throw projectNotFound(command.projectId);
    },

    async patchConstraint(command: ConstraintPatch): Promise<void> {
      await requireProject(bound, command.projectId);
      const updated = await tx
        .update(s.workPackage)
        .set({
          constraintType: command.constraintType,
          constraintDate: command.constraintDate,
        })
        .where(
          and(
            eq(s.workPackage.tenantId, tenantId),
            eq(s.workPackage.projectId, command.projectId),
            eq(s.workPackage.id, command.wpId),
          ),
        )
        .returning({ id: s.workPackage.id });
      if (updated.length === 0) throw projectNotFound(command.projectId);
    },

    async addDependency(command: DependencyAdd): Promise<void> {
      await requireProject(bound, command.projectId);
      await tx.insert(s.wpDependency).values({
        tenantId,
        projectId: command.projectId,
        predecessorWpId: command.predecessorWpId,
        successorWpId: command.successorWpId,
        type: 'FS',
        lagDays: command.lagDays,
        predIsLeaf: true,
        succIsLeaf: true,
      });
    },

    async removeDependency(command: DependencyRemove): Promise<void> {
      await requireProject(bound, command.projectId);
      await tx
        .delete(s.wpDependency)
        .where(
          and(
            eq(s.wpDependency.tenantId, tenantId),
            eq(s.wpDependency.projectId, command.projectId),
            eq(s.wpDependency.predecessorWpId, command.predecessorWpId),
            eq(s.wpDependency.successorWpId, command.successorWpId),
          ),
        );
    },

    async reLagDependency(command: DependencyReLag): Promise<void> {
      await requireProject(bound, command.projectId);
      const updated = await tx
        .update(s.wpDependency)
        .set({ lagDays: command.lagDays })
        .where(
          and(
            eq(s.wpDependency.tenantId, tenantId),
            eq(s.wpDependency.projectId, command.projectId),
            eq(s.wpDependency.predecessorWpId, command.predecessorWpId),
            eq(s.wpDependency.successorWpId, command.successorWpId),
          ),
        )
        .returning({ seq: s.wpDependency.seq });
      if (updated.length === 0) throw projectNotFound(command.projectId);
    },
  };
}

export type PlanInputRepository = ReturnType<typeof planInputRepositoryOn>;
