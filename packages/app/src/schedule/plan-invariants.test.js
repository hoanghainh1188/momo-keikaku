import { describe, expect, it } from 'vitest';
import { ANCESTOR_DESCENDANT_LINK, CROSS_PROJECT_LINK, DEPENDENCY_CYCLE, PLAN_INVARIANT_RULES, SUMMARY_ENDPOINT, checkPlanInvariants, } from './plan-invariants';
const PROJECT = 'prj-a';
const wp = (id, parentId = null, projectId = PROJECT) => ({
    id,
    wbsCode: id,
    parentId,
    projectId,
});
const edge = (predecessorId, successorId) => ({
    predecessorId,
    successorId,
});
const check = (wps, edges) => checkPlanInvariants({ projectId: PROJECT, wps }, edges);
const refusedWith = (dependencies) => ({
    ok: false,
    error: { code: 'invalid_input', messageKey: 'errors.invalid_input', details: { dependencies } },
});
describe('checkPlanInvariants', () => {
    it('declares the four rule codes once, in fixed order', () => {
        expect(PLAN_INVARIANT_RULES).toEqual([
            'dependency_cycle',
            'ancestor_descendant_link',
            'summary_endpoint',
            'cross_project_link',
        ]);
    });
    it('is ok for a legal plan', () => {
        expect(check([wp('1'), wp('2'), wp('3')], [edge('1', '2'), edge('2', '3')])).toEqual({
            ok: true,
            value: undefined,
        });
    });
    it('refuses a cycle with exactly its code', () => {
        expect(check([wp('1'), wp('2')], [edge('1', '2'), edge('2', '1')])).toEqual(refusedWith([DEPENDENCY_CYCLE]));
    });
    it('refuses an ancestor/descendant link with its code and, as it must, the summary endpoint', () => {
        // Every ancestor/descendant edge has a summary end, so the two cannot be raised apart.
        expect(check([wp('1'), wp('1.1', '1')], [edge('1', '1.1')])).toEqual(refusedWith([ANCESTOR_DESCENDANT_LINK, SUMMARY_ENDPOINT]));
    });
    it('refuses a summary endpoint with exactly its code', () => {
        expect(check([wp('1'), wp('2'), wp('2.1', '2')], [edge('1', '2')])).toEqual(refusedWith([SUMMARY_ENDPOINT]));
    });
    it('refuses a cross-project link with exactly its code', () => {
        expect(check([wp('1'), wp('2', null, 'prj-b')], [edge('1', '2')])).toEqual(refusedWith([CROSS_PROJECT_LINK]));
    });
    it('lists all four codes in fixed order when all four are broken, whatever the input order', () => {
        const wps = [wp('X', null, 'prj-b'), wp('3'), wp('2.1', '2'), wp('2'), wp('1')];
        const edges = [edge('1', 'X'), edge('2', '2.1'), edge('3', '3')];
        const expected = refusedWith([...PLAN_INVARIANT_RULES]);
        expect(check(wps, edges)).toEqual(expected);
        expect(check([...wps].reverse(), [...edges].reverse())).toEqual(expected);
    });
    it('never echoes a Work Package id in its details', () => {
        const result = check([wp('secret-wp'), wp('other')], [edge('secret-wp', 'secret-wp')]);
        expect(JSON.stringify(result)).not.toContain('secret-wp');
    });
});
