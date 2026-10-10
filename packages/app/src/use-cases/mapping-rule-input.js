/**
 * The inputs the Mapping Rule use cases take (story 5.10 / FR-22), and the one resolution every
 * rule draft goes through before it is saved or previewed.
 *
 * Internal to `use-cases/`, like `project-write-input.ts`: not re-exported from
 * `use-cases/index.ts`, whose exports ARE the enumerated surface.
 */
import { z } from 'zod';
import { MAPPING_RULE_FIELDS } from '@momo/domain';
const noNul = (value) => !value.includes('\0');
const NUL_MESSAGE = 'must not contain a NUL character';
const id = z.string().min(1).refine(noNul, NUL_MESSAGE);
/** The longest rule name and condition value stored. */
export const MAPPING_RULE_TEXT_MAX = 200;
const text = z
    .string()
    .max(MAPPING_RULE_TEXT_MAX)
    .refine((value) => value.trim().length > 0, 'must not be blank')
    .refine(noNul, NUL_MESSAGE);
/**
 * One rule as the PM writes it: ONE condition (Harry Q1). For `parent` the value is the parent
 * Ticket's KEY, resolved to its tracker issue id at save (unknown key → `invalid_input`). For
 * `keyPattern` it is a glob with `*` and `?` only (Harry Q2).
 */
const ruleDraft = {
    name: text,
    priority: z.number().int().min(1).max(100_000),
    wpId: id,
    matchField: z.enum(MAPPING_RULE_FIELDS),
    matchValue: text,
};
export const createMappingRuleInputSchema = z.object({ projectId: id, ...ruleDraft });
export const updateMappingRuleInputSchema = z.object({ projectId: id, ruleId: id, ...ruleDraft });
export const deleteMappingRuleInputSchema = z.object({ projectId: id, ruleId: id });
export const reorderMappingRulesInputSchema = z.object({
    projectId: id,
    orderedRuleIds: z
        .array(id)
        .min(1)
        .refine((ids) => new Set(ids).size === ids.length, 'must not repeat a rule'),
});
const draftChange = z.object(ruleDraft);
export const previewMappingRuleChangeInputSchema = z.object({
    projectId: id,
    change: z.discriminatedUnion('kind', [
        draftChange.extend({ kind: z.literal('create') }),
        draftChange.extend({ kind: z.literal('update'), ruleId: id }),
        z.object({ kind: z.literal('delete'), ruleId: id }),
    ]),
});
/** `invalid_input` rule codes the Mapping Rule use cases answer (the form maps each to a message). */
export const MAPPING_RULE_REFUSALS = {
    priorityTaken: 'priority_taken',
    notLeaf: 'not_leaf',
    unknownParent: 'unknown_parent',
    orderMismatch: 'order_mismatch',
};
/**
 * The one check every saved or previewed rule passes (story 5.10's I/O matrix):
 *
 *   * the target is a live WP of the Project (`not_found` otherwise — another Project's or
 *     Tenant's id is not disclosed), and a leaf, non-milestone one (`invalid_input` / `not_leaf`
 *     for a summary — rules never target summary WPs);
 *   * no OTHER live rule holds the priority (`invalid_input` / `priority_taken`);
 *   * a `parent` key resolves to a Ticket of the Project (`invalid_input` / `unknown_parent`), and
 *     the stored value is its tracker issue id.
 */
export async function resolveRuleDraft(draft, lookups, exceptRuleId) {
    const target = await lookups.targetOf(draft.wpId);
    if (target === 'absent')
        return { kind: 'not_found' };
    if (target === 'not_leaf') {
        return { kind: 'invalid_input', details: { wpId: [MAPPING_RULE_REFUSALS.notLeaf] } };
    }
    if (lookups.liveRules.some((r) => r.id !== exceptRuleId && r.priority === draft.priority)) {
        return { kind: 'invalid_input', details: { priority: [MAPPING_RULE_REFUSALS.priorityTaken] } };
    }
    let matchValue = draft.matchValue.trim();
    if (draft.matchField === 'parent') {
        const parentId = await lookups.ticketIdForKey(matchValue);
        if (parentId === null) {
            return { kind: 'invalid_input', details: { matchValue: [MAPPING_RULE_REFUSALS.unknownParent] } };
        }
        matchValue = parentId;
    }
    return {
        kind: 'ok',
        record: {
            name: draft.name.trim(),
            priority: draft.priority,
            wpId: draft.wpId,
            matchField: draft.matchField,
            matchValue,
        },
    };
}
/** A stored record as the domain evaluates it. */
export function toDomainRule(record) {
    return {
        id: record.id,
        priority: record.priority,
        name: record.name,
        wpId: record.wpId,
        match: { field: record.matchField, value: record.matchValue },
    };
}
