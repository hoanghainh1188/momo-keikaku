/**
 * `runRoleGatedWrite` — the one wrapper the Organisation, membership and Resource write families
 * share.
 *
 * Epic 1 retrospective, F7. Stories 1.3, 1.4 and 1.6 each hand-wrote the same closure
 * (`runOrgWrite`, `runMembershipWrite`, `runResourceWrite`): authorise against a role set, then
 * delegate to `runAuditedWrite` with a Clock stamp. Three copies meant any change to how a gated,
 * audited, Clock-stamped write runs was a three-site edit where fixing two and missing the third
 * still compiles.
 *
 * What these assertions pin is the ORDER, because that is what a careless extraction loses: the
 * role gate runs BEFORE the schema is parsed, so a caller outside the role set is told
 * `not_found` and never `invalid_input` — refusing on the shape of a command they were not
 * allowed to send would disclose that the command exists.
 */
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { AuditScope } from '../audit';
import { TENANT_ADMIN_ROLES } from '../authz/authorize';
import type { RequestContext, Role } from '../authz/request-context';
import { runRoleGatedWrite } from './audited-write';

const schema = z.object({ name: z.string().min(1) });

function contextWith(roles: readonly Role[]): RequestContext {
  return {
    tenantId: 'ten-gate',
    userId: '019b76da-a800-7000-8000-05aaaaaaaaaa',
    roles,
    projectIds: [],
    locale: 'en',
  } satisfies RequestContext;
}

/** A transaction that records whether it was ever opened, and a scope carrying an audit sink. */
function depsSpy(now: Date) {
  const opened = vi.fn();
  const scope = { audit: { append: vi.fn() } } as unknown as AuditScope;
  return {
    opened,
    deps: {
      handle: {},
      clock: { now: () => now },
      transaction: async <T,>(
        _handle: unknown,
        _tenantId: string,
        work: (scope: AuditScope) => Promise<T>,
      ): Promise<T> => {
        opened();
        return work(scope);
      },
    } as never,
  };
}

describe('runRoleGatedWrite (retro F7)', () => {
  it('refuses a caller outside the role set with not_found, before parsing the command', async () => {
    const { deps, opened } = depsSpy(new Date('2026-09-20T00:00:00.000Z'));
    const work = vi.fn();

    // The input is ALSO malformed. If the gate ran after the parse this would be
    // `invalid_input`, which would tell a caller who may not send this command anything at all
    // about its shape.
    const result = await runRoleGatedWrite(
      schema,
      TENANT_ADMIN_ROLES,
      deps,
      contextWith(['pm']),
      { name: '' },
      work as never,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not_found');
    expect(work, 'the work must not run').not.toHaveBeenCalled();
    expect(opened, 'no transaction may be opened for a refused caller').not.toHaveBeenCalled();
  });

  it('answers invalid_input for a permitted caller sending a malformed command', async () => {
    const { deps, opened } = depsSpy(new Date('2026-09-20T00:00:00.000Z'));
    const work = vi.fn();

    const result = await runRoleGatedWrite(
      schema,
      TENANT_ADMIN_ROLES,
      deps,
      contextWith(['tenant_admin']),
      { name: '' },
      work as never,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_input');
    expect(opened, 'a malformed command opens no transaction either').not.toHaveBeenCalled();
  });

  it('stamps the write from the Clock on the deps', async () => {
    const now = new Date('2027-01-02T03:04:05.678Z');
    const { deps } = depsSpy(now);
    const seen: Date[] = [];

    const result = await runRoleGatedWrite(
      schema,
      TENANT_ADMIN_ROLES,
      deps,
      contextWith(['tenant_admin']),
      { name: 'ok' },
      async (_scope, stamp) => {
        seen.push(stamp.at);
        return undefined;
      },
    );

    expect(result).toEqual({ ok: true, value: undefined });
    expect(seen).toEqual([now]);
  });
});
