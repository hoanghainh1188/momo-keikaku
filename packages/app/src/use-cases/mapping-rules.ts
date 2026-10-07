/**
 * Mapping Rules, authored by the PM (story 5.10 / FR-22, AR-18, UX-DR22).
 *
 * Four audited writes — create, edit, delete, reorder — and one read, the move preview. Every
 * write runs in ONE tenant transaction (AD-14) and, in this order:
 *
 *   1. takes the per-Project watermark lock (AR-37), so every read below happens under it;
 *   2. checks the command against the live rules (unique priority, leaf target, known parent);
 *   3. writes the rule row (a delete is SOFT: `deleted_at`, so the events it produced still
 *      name it);
 *   4. re-evaluates every in-scope Ticket against the live rules — heads `manual` /
 *      `disposition` skipped, events appended only on change, each naming the rule that fired
 *      (or the rule a Ticket left for Unmapped);
 *   5. records `mapping.rule_*` with the rule and the number of Tickets moved.
 *
 * NO RULE PATH MOVES THE PLAN (FR-22 / AR-52): nothing here imports the schedule, writes a date
 * or re-runs the scheduler — `mapping-schedule-fence.test.ts` reads this file for exactly that.
 *
 * The preview (`previewMappingRuleChange`) is the same evaluation, read-only: the domain's
 * `previewRuleChange` over the same inputs the save re-evaluates, with the proposed rule list in
 * place of the live one. Reorder applies immediately, without a preview, and reports how many
 * Tickets moved.
 */
import { previewRuleChange, type MappingRule, type RuleChangePreview } from '@momo/domain';
import { PROJECT_REACH, PROJECT_REACH_ROLES, authorize, type RoleDeclaration } from '../authz/authorize';
import type { RequestContext } from '../authz/request-context';
import { audit, type AuditDeclaration } from '../audit';
import type {
  MappingRuleRecord,
  MappingRuleWriteDeps,
  MappingRuleWriteScope,
} from '../ports/mapping-rule-write';
import { isProjectNotFound, type ProjectReadDeps, type RuleEvaluationInputs } from '../ports/project-read';
import type { WriteStamp } from '../ports/audited-write';
import { fail, ok, type Result } from '../result';
import { invalidInputDetails, refuse, runAuditedWrite } from './audited-write';
import {
  MAPPING_RULE_REFUSALS,
  createMappingRuleInputSchema,
  deleteMappingRuleInputSchema,
  previewMappingRuleChangeInputSchema,
  reorderMappingRulesInputSchema,
  resolveRuleDraft,
  toDomainRule,
  updateMappingRuleInputSchema,
  type CreateMappingRuleInput,
  type DeleteMappingRuleInput,
  type PreviewMappingRuleChangeInput,
  type ReorderMappingRulesInput,
  type RuleDraft,
  type UpdateMappingRuleInput,
} from './mapping-rule-input';
import { runProjectRead } from './project-input';

/**
 * What a rule write answers: the id its audit record names (the rule; the Project for a
 * reorder) and how many Tickets its re-evaluation moved — "N Tickets moved".
 */
export interface MappingRuleSaved {
  readonly id: string;
  readonly moved: number;
}

/** What a reorder answers: the Project's id (its audit target) and "N Tickets moved". */
export type MappingRulesReordered = MappingRuleSaved;

type Schema<Command> = Parameters<
  typeof runAuditedWrite<unknown, MappingRuleWriteScope, Command, unknown>
>[0];

/** Roles before parse, Project reach after it, the Project's anchor as the event time. */
async function runRuleWrite<Handle, Command extends { readonly projectId: string }, Value>(
  schema: Schema<Command>,
  deps: MappingRuleWriteDeps<Handle>,
  ctx: RequestContext,
  input: unknown,
  work: (scope: MappingRuleWriteScope, stamp: WriteStamp, command: Command) => Promise<Value>,
): Promise<Result<Value>> {
  const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES });
  if (!roles.ok) return roles;
  return runAuditedWrite(
    schema,
    deps,
    ctx,
    input,
    {
      at: (scope, command) => scope.mappingRules.projectAnchor(command.projectId),
      isNotFound: (error, command) => isProjectNotFound(error, command.projectId),
      authorize: (caller, command) =>
        authorize(caller, { roles: PROJECT_REACH_ROLES, projectId: command.projectId }),
    },
    async (scope, stamp, command) => {
      // AR-37: the lock first, so the checks and the re-evaluation read a settled Project.
      await scope.mappingRules.lockProject(command.projectId);
      return work(scope, stamp, command);
    },
  );
}

/** The audit shape of a rule. */
function audited(record: Omit<MappingRuleRecord, 'id'>) {
  return {
    name: record.name,
    priority: record.priority,
    wpId: record.wpId,
    matchField: record.matchField,
    matchValue: record.matchValue,
  };
}

/** Resolves a draft against the repository, refusing (and rolling back) what may not be saved. */
async function resolveOrRefuse(
  scope: MappingRuleWriteScope,
  projectId: string,
  draft: RuleDraft,
  liveRules: readonly MappingRuleRecord[],
  exceptRuleId: string | null,
): Promise<Omit<MappingRuleRecord, 'id'>> {
  const resolved = await resolveRuleDraft(
    draft,
    {
      targetOf: (wpId) => scope.mappingRules.ruleTargetOf(projectId, wpId),
      ticketIdForKey: (key) => scope.mappingRules.ticketIdForKey(projectId, key),
      liveRules,
    },
    exceptRuleId,
  );
  if (resolved.kind === 'not_found') refuse('not_found');
  if (resolved.kind === 'invalid_input') refuse('invalid_input', resolved.details);
  return resolved.record;
}

function liveRuleOrRefuse(liveRules: readonly MappingRuleRecord[], ruleId: string): MappingRuleRecord {
  const rule = liveRules.find((r) => r.id === ruleId);
  if (!rule) refuse('not_found');
  return rule;
}

/** FR-22: a new rule, then every in-scope Ticket re-evaluated against the live rules. */
export async function createMappingRule<Handle>(
  deps: MappingRuleWriteDeps<Handle>,
  ctx: RequestContext,
  input: CreateMappingRuleInput,
): Promise<Result<MappingRuleSaved>> {
  return runRuleWrite(createMappingRuleInputSchema, deps, ctx, input, async (scope, stamp, command) => {
    const { projectId } = command;
    const live = await scope.mappingRules.liveRules(projectId);
    const record = await resolveOrRefuse(scope, projectId, command, live, null);
    const ruleId = deps.ids.next();
    await scope.mappingRules.insertRule({ ...record, id: ruleId, projectId });
    const { moved } = await scope.mappingRules.reevaluate(stamp, projectId);
    await audit.record(scope, stamp, 'mapping.rule_create', ruleId, {
      projectId,
      rule: audited(record),
      moved,
    });
    return { id: ruleId, moved };
  });
}

/** FR-22: an edited rule (name, priority, target or condition), then the re-evaluation. */
export async function updateMappingRule<Handle>(
  deps: MappingRuleWriteDeps<Handle>,
  ctx: RequestContext,
  input: UpdateMappingRuleInput,
): Promise<Result<MappingRuleSaved>> {
  return runRuleWrite(updateMappingRuleInputSchema, deps, ctx, input, async (scope, stamp, command) => {
    const { projectId, ruleId } = command;
    const live = await scope.mappingRules.liveRules(projectId);
    const before = liveRuleOrRefuse(live, ruleId);
    const record = await resolveOrRefuse(scope, projectId, command, live, ruleId);
    await scope.mappingRules.updateRule({ ...record, id: ruleId, projectId });
    const { moved } = await scope.mappingRules.reevaluate(stamp, projectId);
    await audit.record(scope, stamp, 'mapping.rule_update', ruleId, {
      projectId,
      before: audited(before),
      after: audited(record),
      moved,
    });
    return { id: ruleId, moved };
  });
}

/** FR-22: a SOFT delete; the Tickets it mapped are re-evaluated against the remaining rules. */
export async function deleteMappingRule<Handle>(
  deps: MappingRuleWriteDeps<Handle>,
  ctx: RequestContext,
  input: DeleteMappingRuleInput,
): Promise<Result<MappingRuleSaved>> {
  return runRuleWrite(deleteMappingRuleInputSchema, deps, ctx, input, async (scope, stamp, command) => {
    const { projectId, ruleId } = command;
    const live = await scope.mappingRules.liveRules(projectId);
    const before = liveRuleOrRefuse(live, ruleId);
    await scope.mappingRules.softDeleteRule(stamp, projectId, ruleId);
    const { moved } = await scope.mappingRules.reevaluate(stamp, projectId);
    await audit.record(scope, stamp, 'mapping.rule_delete', ruleId, {
      projectId,
      before: audited(before),
      moved,
    });
    return { id: ruleId, moved };
  });
}

/**
 * UX-DR22: the rule list in a new order (drag handle or `Alt+↑/↓`). The order must name every
 * live rule exactly once; priorities are renumbered 1..n — unique by construction — and the
 * Tickets re-evaluated. Applies immediately, no preview.
 */
export async function reorderMappingRules<Handle>(
  deps: MappingRuleWriteDeps<Handle>,
  ctx: RequestContext,
  input: ReorderMappingRulesInput,
): Promise<Result<MappingRulesReordered>> {
  return runRuleWrite(reorderMappingRulesInputSchema, deps, ctx, input, async (scope, stamp, command) => {
    const { projectId, orderedRuleIds } = command;
    const live = await scope.mappingRules.liveRules(projectId);
    const liveIds = new Set(live.map((r) => r.id));
    if (orderedRuleIds.some((id) => !liveIds.has(id))) refuse('not_found');
    if (orderedRuleIds.length !== live.length) {
      refuse('invalid_input', { orderedRuleIds: [MAPPING_RULE_REFUSALS.orderMismatch] });
    }
    await scope.mappingRules.renumberRules(projectId, orderedRuleIds);
    const { moved } = await scope.mappingRules.reevaluate(stamp, projectId);
    await audit.record(scope, stamp, 'mapping.rule_reorder', projectId, {
      projectId,
      before: live.map((r) => r.id),
      after: [...orderedRuleIds],
      moved,
    });
    return { id: projectId, moved };
  });
}

/** The id a proposed (not yet saved) rule carries in a preview. */
export const PROPOSED_RULE_ID = 'proposed';

/** The preview, and whether hours mean anything for this Project (false in Ticket-Count Mode). */
export type MappingRulePreview = RuleChangePreview & { readonly hoursAvailable: boolean };

type PreviewOutcome =
  | { readonly kind: 'ok'; readonly preview: MappingRulePreview }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'invalid_input'; readonly details: Readonly<Record<string, readonly string[]>> };

async function previewOver(
  inputs: RuleEvaluationInputs,
  change: PreviewMappingRuleChangeInput['change'],
): Promise<PreviewOutcome> {
  const live: MappingRuleRecord[] = inputs.rules.map((r) => ({
    id: r.id,
    priority: r.priority,
    name: r.name,
    wpId: r.wpId,
    matchField: r.match.field,
    matchValue: r.match.value,
  }));
  let proposed: MappingRule[];
  if (change.kind === 'delete') {
    if (!live.some((r) => r.id === change.ruleId)) return { kind: 'not_found' };
    proposed = inputs.rules.filter((r) => r.id !== change.ruleId);
  } else {
    const exceptRuleId = change.kind === 'update' ? change.ruleId : null;
    if (exceptRuleId !== null && !live.some((r) => r.id === exceptRuleId)) return { kind: 'not_found' };
    const resolved = await resolveRuleDraft(
      change,
      {
        targetOf: async (wpId) => inputs.wpKinds.get(wpId) ?? 'absent',
        ticketIdForKey: async (key) => inputs.ticketIdsByKey.get(key) ?? null,
        liveRules: live,
      },
      exceptRuleId,
    );
    if (resolved.kind !== 'ok') return resolved;
    const rule = toDomainRule({ ...resolved.record, id: exceptRuleId ?? PROPOSED_RULE_ID });
    proposed = [...inputs.rules.filter((r) => r.id !== exceptRuleId), rule];
  }
  return {
    kind: 'ok',
    preview: {
      ...previewRuleChange(proposed, inputs.tickets, inputs.head, inputs.hoursByTicket),
      hoursAvailable: inputs.hoursAvailable,
    },
  };
}

/**
 * UX-DR22: what saving a create, edit or delete WOULD move — "+14 Tickets / +32h would move to
 * WP 2.3; 2 Tickets leave WP 2.1". Read-only. Refuses exactly what the save would refuse, so a
 * draft the save would reject never shows a preview (and Save stays disabled).
 */
export async function previewMappingRuleChange<Handle>(
  deps: ProjectReadDeps<Handle>,
  ctx: RequestContext,
  input: PreviewMappingRuleChangeInput,
): Promise<Result<MappingRulePreview>> {
  // Roles BEFORE parse, so a caller outside the set learns nothing from the command's shape.
  const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES });
  if (!roles.ok) return roles;
  const parsed = previewMappingRuleChangeInputSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input', invalidInputDetails(parsed.error));
  const { projectId, change } = parsed.data;

  const outcome = await runProjectRead(ctx, { projectId }, async (tenantId, id) =>
    previewOver(await deps.projectRead.loadRuleEvaluation(deps.handle, tenantId, id), change),
  );
  if (!outcome.ok) return outcome;
  const value = outcome.value;
  if (value.kind === 'not_found') return fail('not_found');
  if (value.kind === 'invalid_input') return fail('invalid_input', value.details);
  return ok(value.preview);
}

/** What each write records (the audit gate, `tests/audited-use-cases.test.ts`). */
export const MAPPING_RULE_AUDIT = {
  createMappingRule: { audited: ['mapping.rule_create'] },
  updateMappingRule: { audited: ['mapping.rule_update'] },
  deleteMappingRule: { audited: ['mapping.rule_delete'] },
  reorderMappingRules: { audited: ['mapping.rule_reorder'] },
} as const satisfies Readonly<Record<string, AuditDeclaration>>;

/** Role declarations (colocated — see `role-declarations.ts`). */
export const MAPPING_RULE_ROLES = {
  createMappingRule: PROJECT_REACH,
  updateMappingRule: PROJECT_REACH,
  deleteMappingRule: PROJECT_REACH,
  reorderMappingRules: PROJECT_REACH,
  previewMappingRuleChange: PROJECT_REACH,
} as const satisfies Readonly<Record<string, RoleDeclaration>>;
