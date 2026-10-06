/**
 * Mapping Rule server actions (story 5.10 / FR-22, UX-DR22).
 * Prove: a refused rule write does not revalidate; a landed one revalidates Mapping and Review;
 * saveMappingRule routes create vs update on `ruleId`; previewMappingRule presents hours as
 * strings and counts the moves.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidatePath = vi.hoisted(() => vi.fn());
const ctx = vi.hoisted(() => ({ userId: 'u1', roles: ['pm'], projectIds: ['p1'], locale: 'en' }));
const requestContext = vi.hoisted(() => vi.fn(async () => ctx));
const uc = vi.hoisted(() => ({
  createMappingRule: vi.fn(),
  updateMappingRule: vi.fn(),
  deleteMappingRule: vi.fn(),
  reorderMappingRules: vi.fn(),
  previewMappingRuleChange: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('@/server/composition', () => ({
  requestContext,
  ...uc,
  explainTickets: vi.fn(),
  mapTicket: vi.fn(),
  mapTickets: vi.fn(),
  markChangeRequestCandidates: vi.fn(),
  planTicketsAsWorkPackage: vi.fn(),
}));

const { saveMappingRule, removeMappingRule, reorderMappingRuleList, previewMappingRule } =
  await import('./actions');

const DRAFT = {
  projectId: 'p1',
  name: 'Support',
  priority: 3,
  wpId: 'wp-1',
  matchField: 'category' as const,
  matchValue: 'Support',
};
const REFUSED = {
  ok: false,
  error: { code: 'invalid_input', messageKey: 'errors.invalid_input', details: { priority: ['priority_taken'] } },
};

beforeEach(() => {
  revalidatePath.mockReset();
  for (const fn of Object.values(uc)) fn.mockReset();
});

describe('saveMappingRule', () => {
  it('without ruleId creates; a landed write revalidates Mapping and Review', async () => {
    uc.createMappingRule.mockResolvedValueOnce({ ok: true, value: { id: 'r-new', moved: 4 } });
    expect(await saveMappingRule(DRAFT)).toEqual({ ok: true, moved: 4 });
    expect(uc.createMappingRule).toHaveBeenCalledWith(DRAFT, ctx);
    expect(uc.updateMappingRule).not.toHaveBeenCalled();
    expect(revalidatePath.mock.calls.map((c) => c[0])).toEqual(['/p/p1/mapping', '/p/p1/review']);
  });

  it('with ruleId updates', async () => {
    uc.updateMappingRule.mockResolvedValueOnce({ ok: true, value: { id: 'r-1', moved: 0 } });
    expect(await saveMappingRule({ ...DRAFT, ruleId: 'r-1' })).toEqual({ ok: true, moved: 0 });
    expect(uc.updateMappingRule).toHaveBeenCalledWith({ ...DRAFT, ruleId: 'r-1' }, ctx);
    expect(uc.createMappingRule).not.toHaveBeenCalled();
  });

  it('a refused write answers the refusal and does not revalidate', async () => {
    uc.createMappingRule.mockResolvedValueOnce(REFUSED);
    expect(await saveMappingRule(DRAFT)).toEqual({
      ok: false,
      code: 'invalid_input',
      details: { priority: ['priority_taken'] },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('removeMappingRule / reorderMappingRuleList', () => {
  it('revalidate only when the write landed', async () => {
    uc.deleteMappingRule.mockResolvedValueOnce({ ok: false, error: { code: 'not_found', messageKey: 'errors.not_found' } });
    expect(await removeMappingRule({ projectId: 'p1', ruleId: 'r-x' })).toEqual({
      ok: false,
      code: 'not_found',
      details: {},
    });
    expect(revalidatePath).not.toHaveBeenCalled();

    uc.reorderMappingRules.mockResolvedValueOnce({ ok: true, value: { id: 'p1', moved: 2 } });
    expect(await reorderMappingRuleList({ projectId: 'p1', orderedRuleIds: ['b', 'a'] })).toEqual({
      ok: true,
      moved: 2,
    });
    expect(revalidatePath.mock.calls.map((c) => c[0])).toEqual(['/p/p1/mapping', '/p/p1/review']);
  });
});

describe('previewMappingRule', () => {
  it('presents mh as hour strings and counts the moves; never revalidates', async () => {
    uc.previewMappingRuleChange.mockResolvedValueOnce({
      ok: true,
      value: {
        arrivals: [{ wpId: 'wp-2', tickets: 2, mh: 32_000n }],
        departures: [{ wpId: 'wp-1', tickets: 2, mh: 32_000n }],
        toUnmapped: { tickets: 1, mh: 1_500n },
        moves: [{}, {}, {}],
        hoursAvailable: true,
      },
    });
    const change = { kind: 'delete' as const, ruleId: 'r-1' };
    expect(await previewMappingRule({ projectId: 'p1', change })).toEqual({
      ok: true,
      arrivals: [{ wpId: 'wp-2', tickets: 2, hours: '32.0' }],
      departures: [{ wpId: 'wp-1', tickets: 2, hours: '32.0' }],
      toUnmapped: { tickets: 1, hours: '1.5' },
      moveCount: 3,
      hoursAvailable: true,
    });
    expect(uc.previewMappingRuleChange).toHaveBeenCalledWith({ projectId: 'p1', change }, ctx);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('answers a refusal as code + details', async () => {
    uc.previewMappingRuleChange.mockResolvedValueOnce(REFUSED);
    expect(
      await previewMappingRule({ projectId: 'p1', change: { kind: 'delete', ruleId: 'r-1' } }),
    ).toEqual({ ok: false, code: 'invalid_input', details: { priority: ['priority_taken'] } });
  });
});
