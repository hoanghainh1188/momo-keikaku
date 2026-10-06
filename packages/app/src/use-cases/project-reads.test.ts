import { describe, expect, it } from 'vitest';
import type { ProjectBundle, ProjectReadDeps, ProjectReview } from '../ports/project-read';
import { getProjectHeader, getProjectReview } from '.';
import type { RequestContext } from '../authz/request-context';

/** A signed-in caller in `tenantId` that reaches `prj-1` (story 1.5). */
function ctxOf(tenantId: string): RequestContext {
  return { tenantId, userId: 'test-reader', roles: ['pm'], projectIds: ['prj-1'], locale: 'en' };
}

/**
 * The two project read use cases against a fake port — no database, no environment.
 *
 * What the cross-tenant harness cannot pin cheaply is pinned here: the exact `Result` each
 * branch produces, that the port is not even called for a malformed input, and that a failure
 * which is NOT an invisible Project propagates instead of being dressed up as `not_found`.
 * The harness then proves the same contract end to end against real row-level security.
 */

/** Opaque stand-ins: the use cases must hand the port's value back untouched. */
const BUNDLE = { marker: 'bundle' } as unknown as ProjectBundle;
const REVIEW = { marker: 'review' } as unknown as ProjectReview;
const HANDLE = { marker: 'handle' };

interface Call {
  readonly handle: unknown;
  readonly tenantId: string;
  readonly projectId: string;
}

/** A port that records its calls and answers from `behave`. */
function fakeDeps(behave: (projectId: string) => 'ok' | Error) {
  const calls: Call[] = [];
  const answer = <T>(value: T) =>
    async (handle: typeof HANDLE, tenantId: string, projectId: string): Promise<T> => {
      calls.push({ handle, tenantId, projectId });
      const outcome = behave(projectId);
      if (outcome instanceof Error) throw outcome;
      return value;
    };
  const deps: ProjectReadDeps<typeof HANDLE> = {
    handle: HANDLE,
    projectRead: {
      loadProjectBundle: answer(BUNDLE),
      loadReview: answer(REVIEW),
      loadRuleEvaluation: async () => {
        throw new Error('the project reads never load a rule evaluation');
      },
    },
  };
  return { deps, calls };
}

/** packages/db's wording for an invisible Project, verbatim (repo.ts). */
const notFoundError = (projectId: string) =>
  new Error(`project ${projectId} not found — run \`pnpm seed\` to seed`);

const CASES = [
  { name: 'getProjectHeader', run: getProjectHeader, expected: BUNDLE },
  { name: 'getProjectReview', run: getProjectReview, expected: REVIEW },
] as const;

describe.each(CASES)('$name', ({ run, expected }) => {
  it('returns exactly what the port returned, for the context\'s Tenant', async () => {
    const { deps, calls } = fakeDeps(() => 'ok');
    const result = await run(deps, ctxOf('ten-a'), { projectId: 'prj-1' });

    expect(result).toEqual({ ok: true, value: expected });
    if (result.ok) expect(result.value).toBe(expected);
    // The Tenant comes from the context and nowhere else; the handle is passed through.
    expect(calls).toEqual([{ handle: HANDLE, tenantId: 'ten-a', projectId: 'prj-1' }]);
  });

  it('answers not_found — never a throw — for a Project the Tenant cannot see', async () => {
    const { deps, calls } = fakeDeps((projectId) => notFoundError(projectId));
    // Reach must pass so the refusal comes from the port (RLS), not the role gate.
    const ctx = { ...ctxOf('ten-b'), projectIds: ['prj-of-a'] };
    const result = await run(deps, ctx, { projectId: 'prj-of-a' });

    // No `details`: the refusal must carry nothing, so it cannot disclose anything.
    expect(result).toEqual({
      ok: false,
      error: { code: 'not_found', messageKey: 'errors.not_found' },
    });
    expect(calls).toEqual([{ handle: HANDLE, tenantId: 'ten-b', projectId: 'prj-of-a' }]);
  });

  it('answers not_found for a viewer, without calling the port', async () => {
    const { deps, calls } = fakeDeps(() => 'ok');
    const viewer = { ...ctxOf('ten-a'), roles: ['client_viewer'] as const };
    expect(await run(deps, viewer, { projectId: 'prj-1' })).toEqual({
      ok: false,
      error: { code: 'not_found', messageKey: 'errors.not_found' },
    });
    expect(calls).toEqual([]);
  });

  it('answers not_found, not invalid_input, to a viewer sending malformed input', async () => {
    // Pins role-before-parse: moving authorize after parse would answer invalid_input here.
    const { deps, calls } = fakeDeps(() => 'ok');
    const viewer = { ...ctxOf('ten-a'), roles: ['client_viewer'] as const };
    expect(await run(deps, viewer, { projectId: '' })).toEqual({
      ok: false,
      error: { code: 'not_found', messageKey: 'errors.not_found' },
    });
    expect(calls).toEqual([]);
  });

  it('answers not_found when a PM\'s projectIds does not contain the Project', async () => {
    const { deps, calls } = fakeDeps(() => 'ok');
    const unassigned = { ...ctxOf('ten-a'), projectIds: ['prj-other'] };
    expect(await run(deps, unassigned, { projectId: 'prj-1' })).toMatchObject({
      error: { code: 'not_found' },
    });
    expect(calls).toEqual([]);
  });

  it('lets a tenant_admin through with empty projectIds', async () => {
    const { deps, calls } = fakeDeps(() => 'ok');
    const admin = { ...ctxOf('ten-a'), roles: ['tenant_admin'] as const, projectIds: [] };
    expect(await run(deps, admin, { projectId: 'prj-1' })).toMatchObject({ ok: true });
    expect(calls).toEqual([{ handle: HANDLE, tenantId: 'ten-a', projectId: 'prj-1' }]);
  });

  it('rethrows any other failure rather than answering not_found for it', async () => {
    // A connection failure is not a missing Project. Mapping it to not_found would render an
    // outage as "this Project does not exist" — and a use case that swallowed it and returned
    // a default would render it as a Project with no data.
    const outage = new Error('connect ECONNREFUSED 127.0.0.1:55433');
    const { deps } = fakeDeps(() => outage);
    await expect(run(deps, ctxOf('ten-a'), { projectId: 'prj-1' })).rejects.toBe(outage);
  });

  it('does not mistake another Project\'s not-found for this one', async () => {
    const { deps } = fakeDeps(() => notFoundError('prj-other'));
    await expect(run(deps, ctxOf('ten-a'), { projectId: 'prj-1' })).rejects.toThrow(
      'project prj-other not found',
    );
  });

  it.each([
    ['empty', { projectId: '' }],
    ['absent', {}],
    ['not a string', { projectId: 42 }],
    // `/p/%00/review`: Postgres refuses NUL in a text parameter, so it must not get that far.
    ['NUL-bearing', { projectId: 'prj\0ec2' }],
  ])('answers invalid_input for an %s projectId, without calling the port', async (_label, input) => {
    const { deps, calls } = fakeDeps(() => 'ok');
    const result = await run(deps, ctxOf('ten-a'), input as { projectId: string });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_input');
    expect(result.error.messageKey).toBe('errors.invalid_input');
    expect(Object.keys(result.error.details ?? {})).toEqual(['projectId']);
    // No default Project: the repository's `prj-ec2` default is not carried forward.
    expect(calls).toEqual([]);
  });
});
