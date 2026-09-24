/**
 * AD-25 plan-input writers (stories 2.9 / 2.10) — duration / constraint / dependency patches,
 * WP authoring (create / soft-delete / re-parent / patch), actuals, Recorded %, Custom Fields,
 * and the actuals-compound Data Date advance.
 *
 * Bound to one transaction and one Tenant. Only `packages/app/src/schedule` may import this
 * module (`.dependency-cruiser.cjs` `SCHEDULING_REPOSITORIES`). Every write goes through the
 * fence; these functions never open a transaction of their own.
 *
 * Append-only writers (`wp_status_event`, `pct_override_event`) call `lockWatermark` before
 * their first INSERT (no-op when the fence already holds the Project key).
 *
 * 23503 / 23514 from the leaf and type CHECKs / FKs surface as Postgres errors; the fence maps
 * them to `invalid_input` with the plan-invariant rule codes.
 */
import { and, eq, or, sql } from 'drizzle-orm';
import type { Bound } from '../../bound';
import { projectNotFound } from '../../project-not-found';
import * as s from '../../schema';
import { lockWatermark } from '../../watermark-lock';

export type ConstraintType = 'asap' | 'must_start_on' | 'must_finish_on';
export type ActualDateSource = 'typed' | 'imported' | 'accepted-from-proposal';
export type CustomFieldType = 'text' | 'number' | 'date' | 'single_select';

/** When a former leaf gains a child: move leaf-only inputs to that child, or drop them. */
export type LeafResolution =
  | { readonly strategy: 'drop' }
  | { readonly strategy: 'move_to_child'; readonly childWpId: string };

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

export interface CreateWpCommand {
  readonly projectId: string;
  readonly wpId: string;
  readonly parentId: string | null;
  readonly wbsCode: string;
  readonly name: string;
  readonly durationDays?: number | null;
  readonly plannedMh?: bigint;
  readonly assignedResourceIds?: readonly string[];
  readonly isMilestone?: boolean;
  readonly constraintType?: ConstraintType;
  readonly constraintDate?: string | null;
  /** Required when `parentId` names a current leaf that still has leaf-only inputs or edges. */
  readonly leafResolution?: LeafResolution;
}

export interface SoftDeleteWpCommand {
  readonly projectId: string;
  readonly wpId: string;
  readonly deletedAt: Date;
}

export interface ReparentWpCommand {
  readonly projectId: string;
  readonly wpId: string;
  readonly newParentId: string | null;
  readonly leafResolution?: LeafResolution;
}

export interface PatchWpNameCommand {
  readonly projectId: string;
  readonly wpId: string;
  readonly name: string;
}

export interface PatchEffortCommand {
  readonly projectId: string;
  readonly wpId: string;
  readonly plannedMh: bigint;
}

export interface PatchResourcesCommand {
  readonly projectId: string;
  readonly wpId: string;
  readonly assignedResourceIds: readonly string[];
}

export interface PatchMilestoneCommand {
  readonly projectId: string;
  readonly wpId: string;
  readonly isMilestone: boolean;
}

export interface AppendStatusEventCommand {
  readonly projectId: string;
  readonly wpId: string;
  readonly actualStart: string | null;
  readonly actualFinish: string | null;
  readonly source: ActualDateSource;
  readonly actor: string;
  readonly at: Date;
}

export interface AppendPctOverrideCommand {
  readonly projectId: string;
  readonly wpId: string;
  readonly recordedPctNum: bigint;
  readonly recordedPctDen: bigint;
  readonly actor: string;
  readonly at: Date;
}

export interface PatchDataDateCommand {
  readonly projectId: string;
  readonly dataDate: string;
}

export interface CreateCustomFieldDefinitionCommand {
  readonly projectId: string;
  readonly definitionId: string;
  readonly name: string;
  readonly fieldType: CustomFieldType;
  readonly options?: readonly string[];
  readonly ordinal?: number;
}

export interface SetCustomFieldValueCommand {
  readonly projectId: string;
  readonly wpId: string;
  readonly definitionId: string;
  readonly textValue?: string | null;
  readonly numberValue?: bigint | null;
  readonly dateValue?: string | null;
  readonly selectValue?: string | null;
}

export interface EdgeEndpoint {
  readonly predecessorWpId: string;
  readonly successorWpId: string;
}

async function requireProject(bound: Bound, projectId: string): Promise<void> {
  const [row] = await bound.tx.select({ id: s.project.id }).from(s.project).where(eq(s.project.id, projectId));
  if (!row) throw projectNotFound(projectId);
}

async function isLeafWp(
  bound: Bound,
  projectId: string,
  wpId: string,
): Promise<boolean> {
  const [row] = await bound.tx
    .select({ isLeaf: s.workPackage.isLeaf })
    .from(s.workPackage)
    .where(
      and(
        eq(s.workPackage.tenantId, bound.tenantId),
        eq(s.workPackage.projectId, projectId),
        eq(s.workPackage.id, wpId),
      ),
    );
  if (!row) throw projectNotFound(projectId);
  return row.isLeaf;
}

async function loadWpRow(
  bound: Bound,
  projectId: string,
  wpId: string,
): Promise<{
  readonly id: string;
  readonly parentId: string | null;
  readonly childCount: number;
  readonly isLeaf: boolean;
  readonly durationDays: number | null;
  readonly constraintType: string;
  readonly constraintDate: string | null;
  readonly deletedAt: Date | null;
}> {
  const [row] = await bound.tx
    .select({
      id: s.workPackage.id,
      parentId: s.workPackage.parentId,
      childCount: s.workPackage.childCount,
      isLeaf: s.workPackage.isLeaf,
      durationDays: s.workPackage.durationDays,
      constraintType: s.workPackage.constraintType,
      constraintDate: s.workPackage.constraintDate,
      deletedAt: s.workPackage.deletedAt,
    })
    .from(s.workPackage)
    .where(
      and(
        eq(s.workPackage.tenantId, bound.tenantId),
        eq(s.workPackage.projectId, projectId),
        eq(s.workPackage.id, wpId),
      ),
    );
  if (!row) throw projectNotFound(projectId);
  return row;
}

async function listEdgesForWp(
  bound: Bound,
  projectId: string,
  wpId: string,
): Promise<EdgeEndpoint[]> {
  return bound.tx
    .select({
      predecessorWpId: s.wpDependency.predecessorWpId,
      successorWpId: s.wpDependency.successorWpId,
    })
    .from(s.wpDependency)
    .where(
      and(
        eq(s.wpDependency.tenantId, bound.tenantId),
        eq(s.wpDependency.projectId, projectId),
        or(
          eq(s.wpDependency.predecessorWpId, wpId),
          eq(s.wpDependency.successorWpId, wpId),
        ),
      ),
    );
}

/**
 * Promote a leaf parent to a summary in one statement: bump `child_count` and clear leaf-only
 * columns together (CHECK is not deferrable). Optionally move duration/constraint/edges to the
 * new child per `leafResolution`.
 */
async function promoteLeafParent(
  bound: Bound,
  projectId: string,
  parentId: string,
  resolution: LeafResolution | undefined,
): Promise<void> {
  const parent = await loadWpRow(bound, projectId, parentId);
  if (!parent.isLeaf) {
    // Already a summary — just bump child_count.
    await bound.tx
      .update(s.workPackage)
      .set({ childCount: sql`${s.workPackage.childCount} + 1` })
      .where(
        and(
          eq(s.workPackage.tenantId, bound.tenantId),
          eq(s.workPackage.projectId, projectId),
          eq(s.workPackage.id, parentId),
        ),
      );
    return;
  }

  const edges = await listEdgesForWp(bound, projectId, parentId);
  const hasLeafInputs =
    parent.durationDays !== null ||
    parent.constraintType !== 'asap' ||
    parent.constraintDate !== null ||
    edges.length > 0;

  if (hasLeafInputs && resolution === undefined) {
    throw Object.assign(new Error('leaf_resolution_required'), {
      code: 'leaf_resolution_required',
    });
  }

  if (resolution?.strategy === 'move_to_child') {
    const childId = resolution.childWpId;
    await bound.tx
      .update(s.workPackage)
      .set({
        durationDays: parent.durationDays,
        constraintType: parent.constraintType,
        constraintDate: parent.constraintDate,
      })
      .where(
        and(
          eq(s.workPackage.tenantId, bound.tenantId),
          eq(s.workPackage.projectId, projectId),
          eq(s.workPackage.id, childId),
        ),
      );

    for (const edge of edges) {
      const newPred = edge.predecessorWpId === parentId ? childId : edge.predecessorWpId;
      const newSucc = edge.successorWpId === parentId ? childId : edge.successorWpId;
      // Drop the old edge and recreate on the child (same lag).
      const [existing] = await bound.tx
        .select({ lagDays: s.wpDependency.lagDays })
        .from(s.wpDependency)
        .where(
          and(
            eq(s.wpDependency.tenantId, bound.tenantId),
            eq(s.wpDependency.projectId, projectId),
            eq(s.wpDependency.predecessorWpId, edge.predecessorWpId),
            eq(s.wpDependency.successorWpId, edge.successorWpId),
          ),
        );
      await bound.tx
        .delete(s.wpDependency)
        .where(
          and(
            eq(s.wpDependency.tenantId, bound.tenantId),
            eq(s.wpDependency.projectId, projectId),
            eq(s.wpDependency.predecessorWpId, edge.predecessorWpId),
            eq(s.wpDependency.successorWpId, edge.successorWpId),
          ),
        );
      if (newPred !== newSucc) {
        const predIsLeaf = await isLeafWp(bound, projectId, newPred);
        const succIsLeaf = await isLeafWp(bound, projectId, newSucc);
        await bound.tx.insert(s.wpDependency).values({
          tenantId: bound.tenantId,
          projectId,
          predecessorWpId: newPred,
          successorWpId: newSucc,
          type: 'FS',
          lagDays: existing?.lagDays ?? 0,
          predIsLeaf,
          succIsLeaf,
        });
      }
    }
  } else if (edges.length > 0) {
    // drop strategy (or no inputs beyond edges already handled): hard-delete edges.
    await bound.tx
      .delete(s.wpDependency)
      .where(
        and(
          eq(s.wpDependency.tenantId, bound.tenantId),
          eq(s.wpDependency.projectId, projectId),
          or(
            eq(s.wpDependency.predecessorWpId, parentId),
            eq(s.wpDependency.successorWpId, parentId),
          ),
        ),
      );
  }

  // Same-statement clear of leaf-only columns + bump child_count (CHECK not deferrable).
  await bound.tx
    .update(s.workPackage)
    .set({
      childCount: sql`${s.workPackage.childCount} + 1`,
      durationDays: null,
      constraintType: 'asap',
      constraintDate: null,
    })
    .where(
      and(
        eq(s.workPackage.tenantId, bound.tenantId),
        eq(s.workPackage.projectId, projectId),
        eq(s.workPackage.id, parentId),
      ),
    );
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
      const predIsLeaf = await isLeafWp(bound, command.projectId, command.predecessorWpId);
      const succIsLeaf = await isLeafWp(bound, command.projectId, command.successorWpId);
      await tx.insert(s.wpDependency).values({
        tenantId,
        projectId: command.projectId,
        predecessorWpId: command.predecessorWpId,
        successorWpId: command.successorWpId,
        type: 'FS',
        lagDays: command.lagDays,
        predIsLeaf,
        succIsLeaf,
      });
    },

    async removeDependency(command: DependencyRemove): Promise<void> {
      await requireProject(bound, command.projectId);
      const deleted = await tx
        .delete(s.wpDependency)
        .where(
          and(
            eq(s.wpDependency.tenantId, tenantId),
            eq(s.wpDependency.projectId, command.projectId),
            eq(s.wpDependency.predecessorWpId, command.predecessorWpId),
            eq(s.wpDependency.successorWpId, command.successorWpId),
          ),
        )
        .returning({ seq: s.wpDependency.seq });
      if (deleted.length === 0) throw projectNotFound(command.projectId);
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

    async createWp(command: CreateWpCommand): Promise<void> {
      await requireProject(bound, command.projectId);

      await tx.insert(s.workPackage).values({
        id: command.wpId,
        tenantId,
        projectId: command.projectId,
        wbsCode: command.wbsCode,
        name: command.name,
        parentId: command.parentId,
        isMilestone: command.isMilestone ?? false,
        isCatchAll: false,
        durationDays: command.durationDays ?? null,
        constraintType: command.constraintType ?? 'asap',
        constraintDate: command.constraintDate ?? null,
        plannedMh: command.plannedMh ?? 0n,
        assignedResourceIds: [...(command.assignedResourceIds ?? [])],
        deletedAt: null,
      });

      if (command.parentId !== null) {
        // When moving leaf inputs onto the new child, resolution must name this wpId.
        const resolution =
          command.leafResolution?.strategy === 'move_to_child'
            ? { strategy: 'move_to_child' as const, childWpId: command.wpId }
            : command.leafResolution;
        await promoteLeafParent(bound, command.projectId, command.parentId, resolution);
      }
    },

    async softDeleteWp(command: SoftDeleteWpCommand): Promise<readonly EdgeEndpoint[]> {
      await requireProject(bound, command.projectId);
      const wp = await loadWpRow(bound, command.projectId, command.wpId);
      if (wp.deletedAt !== null) throw projectNotFound(command.projectId);
      if (wp.childCount > 0) {
        throw Object.assign(new Error('wp_has_children'), { code: 'wp_has_children' });
      }

      const edges = await listEdgesForWp(bound, command.projectId, command.wpId);

      // Hard-delete edges in the same transaction — never cascade via FK, never relink.
      if (edges.length > 0) {
        await tx
          .delete(s.wpDependency)
          .where(
            and(
              eq(s.wpDependency.tenantId, tenantId),
              eq(s.wpDependency.projectId, command.projectId),
              or(
                eq(s.wpDependency.predecessorWpId, command.wpId),
                eq(s.wpDependency.successorWpId, command.wpId),
              ),
            ),
          );
      }

      if (wp.parentId !== null) {
        await tx
          .update(s.workPackage)
          .set({ childCount: sql`GREATEST(${s.workPackage.childCount} - 1, 0)` })
          .where(
            and(
              eq(s.workPackage.tenantId, tenantId),
              eq(s.workPackage.projectId, command.projectId),
              eq(s.workPackage.id, wp.parentId),
            ),
          );
      }

      const updated = await tx
        .update(s.workPackage)
        .set({ deletedAt: command.deletedAt })
        .where(
          and(
            eq(s.workPackage.tenantId, tenantId),
            eq(s.workPackage.projectId, command.projectId),
            eq(s.workPackage.id, command.wpId),
          ),
        )
        .returning({ id: s.workPackage.id });
      if (updated.length === 0) throw projectNotFound(command.projectId);
      return edges;
    },

    /** List in/out edge endpoints for a WP (delete-confirm UI). */
    async listEdgeEndpoints(projectId: string, wpId: string): Promise<readonly EdgeEndpoint[]> {
      await requireProject(bound, projectId);
      return listEdgesForWp(bound, projectId, wpId);
    },

    async reparentWp(command: ReparentWpCommand): Promise<void> {
      await requireProject(bound, command.projectId);
      const wp = await loadWpRow(bound, command.projectId, command.wpId);
      if (wp.deletedAt !== null) throw projectNotFound(command.projectId);
      const oldParentId = wp.parentId;
      if (oldParentId === command.newParentId) return;

      if (oldParentId !== null) {
        await tx
          .update(s.workPackage)
          .set({ childCount: sql`GREATEST(${s.workPackage.childCount} - 1, 0)` })
          .where(
            and(
              eq(s.workPackage.tenantId, tenantId),
              eq(s.workPackage.projectId, command.projectId),
              eq(s.workPackage.id, oldParentId),
            ),
          );
      }

      await tx
        .update(s.workPackage)
        .set({ parentId: command.newParentId })
        .where(
          and(
            eq(s.workPackage.tenantId, tenantId),
            eq(s.workPackage.projectId, command.projectId),
            eq(s.workPackage.id, command.wpId),
          ),
        );

      if (command.newParentId !== null) {
        await promoteLeafParent(
          bound,
          command.projectId,
          command.newParentId,
          command.leafResolution,
        );
      }
    },

    async patchWpName(command: PatchWpNameCommand): Promise<void> {
      await requireProject(bound, command.projectId);
      const updated = await tx
        .update(s.workPackage)
        .set({ name: command.name })
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

    async patchEffort(command: PatchEffortCommand): Promise<void> {
      await requireProject(bound, command.projectId);
      const updated = await tx
        .update(s.workPackage)
        .set({ plannedMh: command.plannedMh })
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

    async patchResources(command: PatchResourcesCommand): Promise<void> {
      await requireProject(bound, command.projectId);
      const updated = await tx
        .update(s.workPackage)
        .set({ assignedResourceIds: [...command.assignedResourceIds] })
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

    async patchMilestone(command: PatchMilestoneCommand): Promise<void> {
      await requireProject(bound, command.projectId);
      const updated = await tx
        .update(s.workPackage)
        .set(
          command.isMilestone
            ? { isMilestone: true, durationDays: 0 }
            : { isMilestone: false },
        )
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

    async appendStatusEvent(command: AppendStatusEventCommand): Promise<void> {
      await requireProject(bound, command.projectId);
      await lockWatermark(bound, { kind: 'project', projectId: command.projectId });
      await tx.insert(s.wpStatusEvent).values({
        tenantId,
        projectId: command.projectId,
        wpId: command.wpId,
        actualStart: command.actualStart,
        actualFinish: command.actualFinish,
        source: command.source,
        actor: command.actor,
        at: command.at,
      });
    },

    async appendPctOverride(command: AppendPctOverrideCommand): Promise<void> {
      await requireProject(bound, command.projectId);
      await lockWatermark(bound, { kind: 'project', projectId: command.projectId });
      await tx.insert(s.pctOverrideEvent).values({
        tenantId,
        projectId: command.projectId,
        wpId: command.wpId,
        recordedPctNum: command.recordedPctNum,
        recordedPctDen: command.recordedPctDen,
        actor: command.actor,
        at: command.at,
      });
    },

    async patchDataDate(command: PatchDataDateCommand): Promise<void> {
      await requireProject(bound, command.projectId);
      const updated = await tx
        .update(s.project)
        .set({ dataDate: command.dataDate })
        .where(and(eq(s.project.tenantId, tenantId), eq(s.project.id, command.projectId)))
        .returning({ id: s.project.id });
      if (updated.length === 0) throw projectNotFound(command.projectId);
    },

    async countCustomFieldDefinitions(projectId: string): Promise<number> {
      await requireProject(bound, projectId);
      const rows = await tx
        .select({ id: s.customFieldDefinition.id })
        .from(s.customFieldDefinition)
        .where(
          and(
            eq(s.customFieldDefinition.tenantId, tenantId),
            eq(s.customFieldDefinition.projectId, projectId),
          ),
        );
      return rows.length;
    },

    async createCustomFieldDefinition(command: CreateCustomFieldDefinitionCommand): Promise<void> {
      await requireProject(bound, command.projectId);
      await tx.insert(s.customFieldDefinition).values({
        id: command.definitionId,
        tenantId,
        projectId: command.projectId,
        name: command.name,
        fieldType: command.fieldType,
        options: [...(command.options ?? [])],
        ordinal: command.ordinal ?? 0,
      });
    },

    async setCustomFieldValue(command: SetCustomFieldValueCommand): Promise<void> {
      await requireProject(bound, command.projectId);
      await tx
        .insert(s.customFieldValue)
        .values({
          tenantId,
          projectId: command.projectId,
          wpId: command.wpId,
          definitionId: command.definitionId,
          textValue: command.textValue ?? null,
          numberValue: command.numberValue ?? null,
          dateValue: command.dateValue ?? null,
          selectValue: command.selectValue ?? null,
        })
        .onConflictDoUpdate({
          target: [
            s.customFieldValue.tenantId,
            s.customFieldValue.projectId,
            s.customFieldValue.wpId,
            s.customFieldValue.definitionId,
          ],
          set: {
            textValue: command.textValue ?? null,
            numberValue: command.numberValue ?? null,
            dateValue: command.dateValue ?? null,
            selectValue: command.selectValue ?? null,
          },
        });
    },
  };
}

export type PlanInputRepository = ReturnType<typeof planInputRepositoryOn>;
