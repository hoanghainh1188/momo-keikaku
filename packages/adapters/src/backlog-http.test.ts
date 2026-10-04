import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertBacklogGetOnly,
  backlogHttpOn,
  BACKLOG_HTTP_ALLOWED_METHODS,
  BacklogHttpError,
  estimateSearchCalls,
  fitsSearchBudget,
} from './backlog-http';

const HERE = dirname(fileURLToPath(import.meta.url));
const NOW = new Date('2026-09-16T09:00:00.000Z');
const CLOCK = { now: () => NOW };
const CONFIG = { connectorId: 'con-1', site: 'example.backlog.jp', scope: 'EC2' } as const;
const KEY = 'secret-api-key';
const PROJECT_ID = 4242;

/** A whitelisted-field Backlog issue plus a description, which must never be carried. */
function issue(id: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    projectId: PROJECT_ID,
    issueKey: `EC2-${id}`,
    keyId: id,
    summary: `Synthetic ticket ${id}`,
    description: 'never persisted',
    status: { id: 1, name: 'Open' },
    issueType: { id: 7, name: 'Task' },
    assignee: { id: 1001, name: 'Nguyen Thi Linh', mailAddress: 'linh@example.com' },
    estimatedHours: 8,
    actualHours: null,
    parentIssueId: null,
    created: `2026-06-01T01:${String(Math.floor(id / 60) % 60).padStart(2, '0')}:${String(id % 60).padStart(2, '0')}Z`,
    milestone: [],
    category: [],
    ...overrides,
  };
}

function issues(from: number, to: number): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (let id = from; id <= to; id += 1) out.push(issue(id));
  return out;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

interface Call {
  readonly url: URL;
  readonly init: RequestInit;
}

/**
 * A scripted Backlog. `counts` answers successive Count Issues calls; `list(offset, pass)`
 * answers Get Issue List, where `pass` is the 0-based completeness pass (a pass starts at the
 * before-count).
 */
function fakeBacklog(script: {
  readonly counts: readonly number[];
  readonly list?: (offset: number, pass: number) => Record<string, unknown>[];
  readonly searchLimit?: number;
  readonly status?: (path: string) => number | undefined;
}) {
  const calls: Call[] = [];
  let countCalls = 0;
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, init: init ?? {} });
    const path = url.pathname.replace('/api/v2', '');
    const forced = script.status?.(path);
    if (forced !== undefined) return json({ errors: [{ message: 'nope' }] }, forced);
    const rateHeaders = { 'X-RateLimit-Remaining': String(100 - calls.length), 'X-RateLimit-Reset': '1789549200' };
    if (path === '/rateLimit') {
      return json({ rateLimit: { read: { limit: 600 }, search: { limit: script.searchLimit ?? 150 } } });
    }
    if (path === `/projects/${CONFIG.scope}`) return json({ id: PROJECT_ID, projectKey: CONFIG.scope });
    if (path === '/issues/count') {
      const count = script.counts[Math.min(countCalls, script.counts.length - 1)]!;
      countCalls += 1;
      return json({ count }, 200, rateHeaders);
    }
    if (path === '/issues') {
      const pass = Math.floor((countCalls - 1) / 2);
      const offset = Number(url.searchParams.get('offset'));
      return json(script.list?.(offset, pass) ?? [], 200, rateHeaders);
    }
    return json({}, 404);
  }) as typeof globalThis.fetch;
  return { fetch, calls, paths: () => calls.map((c) => c.url.pathname.replace('/api/v2', '')) };
}

describe('backlog-http GET-only fence (story 5.1 / FR-17)', () => {
  it('allows only GET in BACKLOG_HTTP_ALLOWED_METHODS', () => {
    expect(BACKLOG_HTTP_ALLOWED_METHODS).toEqual(['GET']);
  });

  it('refuses every non-GET method at assertBacklogGetOnly', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const) {
      expect(() => assertBacklogGetOnly(method)).toThrow(/GET-only/);
    }
    expect(() => assertBacklogGetOnly('GET')).not.toThrow();
  });

  it('has no non-GET method literal on a fetch options object in source', () => {
    const source = readFileSync(join(HERE, 'backlog-http.ts'), 'utf8');
    // Ban `method: 'POST'` / `method: "PUT"` style call sites — not prose in comments.
    const callSite = /\bmethod\s*:\s*['"](POST|PUT|PATCH|DELETE)['"]/;
    expect(source).not.toMatch(callSite);
    // Also ban bare fetch with those method strings assigned.
    const assigned = /\b(?:const|let)\s+method\s*=\s*['"](POST|PUT|PATCH|DELETE)['"]/;
    expect(source).not.toMatch(assigned);
  });

  it('issues only GETs, authenticating by the apiKey query parameter with a timeout signal', async () => {
    const backlog = fakeBacklog({ counts: [2], list: () => issues(1, 2), searchLimit: 150 });
    const adapter = backlogHttpOn({ clock: CLOCK, fetch: backlog.fetch });
    await adapter.readScope(CONFIG, { apiKey: KEY });
    await adapter.assessSearchBudget(CONFIG, { apiKey: KEY });
    expect(backlog.calls.length).toBeGreaterThan(0);
    for (const call of backlog.calls) {
      expect(call.init.method).toBe('GET');
      expect(call.url.host).toBe('example.backlog.jp');
      expect(call.url.searchParams.get('apiKey')).toBe(KEY);
      expect(call.init.signal).toBeInstanceOf(AbortSignal);
      expect(JSON.stringify(call.init.headers)).not.toMatch(/Authorization|Bearer/);
    }
  });
});

describe('backlog-http Get Issue List order (story 5.3 / AR-13)', () => {
  it('requests sort=created&order=asc&count=100 on the resolved numeric projectId — never updated desc', async () => {
    const backlog = fakeBacklog({ counts: [150], list: (offset) => issues(offset + 1, Math.min(offset + 100, 150)) });
    const adapter = backlogHttpOn({ clock: CLOCK, fetch: backlog.fetch });
    await adapter.readScope(CONFIG, { apiKey: KEY });
    const lists = backlog.calls.filter((c) => c.url.pathname === '/api/v2/issues');
    expect(lists.map((c) => c.url.searchParams.get('offset'))).toEqual(['0', '100']);
    for (const { url } of lists) {
      expect(url.searchParams.get('sort')).toBe('created');
      expect(url.searchParams.get('order')).toBe('asc');
      expect(url.searchParams.get('count')).toBe('100');
      expect(url.searchParams.getAll('projectId[]')).toEqual([String(PROJECT_ID)]);
      expect(url.searchParams.get('sort')).not.toBe('updated');
    }
    const counts = backlog.calls.filter((c) => c.url.pathname === '/api/v2/issues/count');
    for (const { url } of counts) {
      expect(url.searchParams.getAll('projectId[]')).toEqual([String(PROJECT_ID)]);
    }
  });

  it('orders a page by created, then numeric internal id as the tiebreak', async () => {
    const created = '2026-06-01T01:00:00Z';
    const backlog = fakeBacklog({
      counts: [4],
      list: () => [
        issue(30, { created }),
        issue(9, { created: '2026-06-01T02:00:00Z' }),
        issue(12, { created }),
        issue(2, { created }),
      ],
    });
    const read = await backlogHttpOn({ clock: CLOCK, fetch: backlog.fetch }).readScope(CONFIG, {
      apiKey: KEY,
    });
    expect(read.tickets.map((t) => t.trackerIssueId)).toEqual(['2', '12', '30', '9']);
  });
});

describe('backlog-http completeness (story 5.3 / AR-13)', () => {
  it('is complete when the distinct page union equals Count Issues before and after', async () => {
    const backlog = fakeBacklog({
      counts: [150, 150],
      list: (offset) => issues(offset + 1, Math.min(offset + 100, 150)),
    });
    const read = await backlogHttpOn({ clock: CLOCK, fetch: backlog.fetch }).readScope(CONFIG, {
      apiKey: KEY,
    });
    expect(read.complete).toBe(true);
    expect(read.adapterKind).toBe('backlog');
    expect(read.observedAt).toBe(NOW.toISOString());
    expect(read.tickets).toHaveLength(150);
    expect(new Set(read.tickets.map((t) => t.trackerIssueId)).size).toBe(150);
    expect(backlog.paths()).toEqual([
      `/projects/${CONFIG.scope}`,
      '/issues/count',
      '/issues',
      '/issues',
      '/issues/count',
    ]);
    expect(read.rateLimit).toEqual({ remaining: 95, resetAt: '2026-09-16T09:00:00.000Z' });
    expect(read.accounts).toEqual([{ accountId: '1001', displayName: 'Nguyen Thi Linh' }]);
  });

  it('maps only whitelisted fields; hours via hoursToMh; attributes from milestone and category', async () => {
    const backlog = fakeBacklog({
      counts: [1],
      list: () => [
        issue(5, {
          estimatedHours: 1.5,
          actualHours: 0.25,
          parentIssueId: 3,
          milestone: [{ id: 11, name: 'Phase2-Sprint1' }],
          category: [{ id: 21, name: 'Development' }],
        }),
      ],
    });
    const read = await backlogHttpOn({ clock: CLOCK, fetch: backlog.fetch }).readScope(CONFIG, {
      apiKey: KEY,
    });
    expect(read.tickets).toEqual([
      {
        trackerIssueId: '5',
        key: 'EC2-5',
        title: 'Synthetic ticket 5',
        statusId: '1',
        estimateMh: 1500n,
        actualMh: 250n,
        assigneeAccountId: '1001',
        createdAt: '2026-06-01T01:00:05Z',
        parentIssueId: '3',
        issueTypeId: '7',
        trackerProjectId: String(PROJECT_ID),
        attributes: [
          { kind: 'milestone', id: '11', label: 'Phase2-Sprint1' },
          { kind: 'category', id: '21', label: 'Development' },
        ],
      },
    ]);
    expect(JSON.stringify(read.tickets, (_k, v) => (typeof v === 'bigint' ? String(v) : v))).not.toMatch(
      /never persisted|mailAddress|linh@example/,
    );
    expect(read.accounts[0]).not.toHaveProperty('email');
  });

  it('reports hoursFieldPresent when any Ticket carries actual hours, including 0', async () => {
    const zero = fakeBacklog({ counts: [2], list: () => [issue(1), issue(2, { actualHours: 0 })] });
    const withZero = await backlogHttpOn({ clock: CLOCK, fetch: zero.fetch }).readScope(CONFIG, {
      apiKey: KEY,
    });
    expect(withZero.hoursFieldPresent).toBe(true);
    expect(withZero.tickets[1]!.actualMh).toBe(0n);

    const none = fakeBacklog({
      counts: [2],
      list: () => [issue(1, { estimatedHours: null }), issue(2)],
    });
    const withNone = await backlogHttpOn({ clock: CLOCK, fetch: none.fetch }).readScope(CONFIG, {
      apiKey: KEY,
    });
    expect(withNone.hoursFieldPresent).toBe(false);
    expect(withNone.tickets[0]!.estimateMh).toBeNull();
    expect(withNone.tickets[0]!.actualMh).toBeNull();
  });

  it('retries once on count drift and answers complete when the retry settles', async () => {
    const backlog = fakeBacklog({
      counts: [2, 3, 3, 3],
      list: (_offset, pass) => (pass === 0 ? issues(1, 2) : issues(1, 3)),
    });
    const read = await backlogHttpOn({ clock: CLOCK, fetch: backlog.fetch }).readScope(CONFIG, {
      apiKey: KEY,
    });
    expect(read.complete).toBe(true);
    expect(read.tickets.map((t) => t.trackerIssueId)).toEqual(['1', '2', '3']);
    expect(backlog.paths().filter((p) => p === '/issues/count')).toHaveLength(4);
    expect(backlog.paths().filter((p) => p.startsWith('/projects/'))).toHaveLength(1);
  });

  it('answers complete:false after exactly one retry when a duplicate id appears on both passes', async () => {
    // Page shift: a Ticket appears on page 1 and again on page 2; another is skipped.
    const backlog = fakeBacklog({
      counts: [101],
      list: (offset) => (offset === 0 ? issues(1, 100) : [issue(100)]),
    });
    const read = await backlogHttpOn({ clock: CLOCK, fetch: backlog.fetch }).readScope(CONFIG, {
      apiKey: KEY,
    });
    expect(read.complete).toBe(false);
    expect(backlog.paths().filter((p) => p === '/issues/count')).toHaveLength(4);
    expect(backlog.paths().filter((p) => p === '/issues')).toHaveLength(4);
  });

  it.each([
    ['union shorter than both counts', [3], () => issues(1, 2)],
    ['after-count larger than the union', [2, 3, 2, 3], () => issues(1, 2)],
    ['before-count larger than the union', [3, 2, 3, 2], () => issues(1, 2)],
  ] as const)('is incomplete when the %s', async (_label, counts, list) => {
    const backlog = fakeBacklog({ counts, list });
    const read = await backlogHttpOn({ clock: CLOCK, fetch: backlog.fetch }).readScope(CONFIG, {
      apiKey: KEY,
    });
    expect(read.complete).toBe(false);
    expect(backlog.paths().filter((p) => p === '/issues/count')).toHaveLength(4);
  });

  it('answers an empty project complete without listing a page', async () => {
    const backlog = fakeBacklog({ counts: [0] });
    const read = await backlogHttpOn({ clock: CLOCK, fetch: backlog.fetch }).readScope(CONFIG, {
      apiKey: KEY,
    });
    expect(read).toMatchObject({ complete: true, tickets: [], accounts: [], hoursFieldPresent: false });
    expect(backlog.paths()).toEqual([`/projects/${CONFIG.scope}`, '/issues/count', '/issues/count']);
  });
});

describe('backlog-http failures never leak the key (story 5.3 / NFR-S2)', () => {
  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [404, 'not_found'],
    [500, 'http'],
  ] as const)('throws BacklogHttpError on %s, naming the path only', async (status, kind) => {
    const backlog = fakeBacklog({ counts: [1], status: () => status });
    const error = await backlogHttpOn({ clock: CLOCK, fetch: backlog.fetch })
      .readScope(CONFIG, { apiKey: KEY })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BacklogHttpError);
    expect(error).toMatchObject({ kind, status });
    expect(String((error as Error).message)).not.toContain(KEY);
    expect(String((error as Error).message)).not.toContain('apiKey');
  });

  it('throws a timeout BacklogHttpError when the GET is aborted, without the URL', async () => {
    const fetch = (async () => {
      throw new DOMException(`The operation timed out: https://x/?apiKey=${KEY}`, 'TimeoutError');
    }) as typeof globalThis.fetch;
    const error = await backlogHttpOn({ clock: CLOCK, fetch, timeoutMs: 5 })
      .readScope(CONFIG, { apiKey: KEY })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'timeout', status: null });
    expect(String((error as Error).message)).not.toContain(KEY);
  });

  it('refuses an empty API key before any request', async () => {
    const backlog = fakeBacklog({ counts: [1] });
    await expect(
      backlogHttpOn({ clock: CLOCK, fetch: backlog.fetch }).readScope(CONFIG, { apiKey: '' }),
    ).rejects.toMatchObject({ kind: 'auth' });
    expect(backlog.calls).toEqual([]);
  });
});

describe('backlog-http Search budget at set-up (story 5.3 / AR-13)', () => {
  it('estimates pages plus the before/after counts', () => {
    expect(estimateSearchCalls(0)).toBe(2);
    expect(estimateSearchCalls(100)).toBe(3);
    expect(estimateSearchCalls(101)).toBe(4);
    expect(estimateSearchCalls(2_000)).toBe(22);
  });

  it('fits only when the estimate is at most 25% of the Search limit', () => {
    expect(fitsSearchBudget(22, 88)).toBe(true);
    expect(fitsSearchBudget(22, 87)).toBe(false);
  });

  it('calls Get Rate Limit, resolves the project and counts its issues', async () => {
    const backlog = fakeBacklog({ counts: [1_900], searchLimit: 150 });
    const assessment = await backlogHttpOn({ clock: CLOCK, fetch: backlog.fetch }).assessSearchBudget(
      CONFIG,
      { apiKey: KEY },
    );
    expect(assessment).toEqual({
      kind: 'assessed',
      searchLimit: 150,
      ticketCount: 1_900,
      estimatedSearchCalls: 21,
      withinBudget: true,
    });
    expect(backlog.paths()).toEqual(['/rateLimit', `/projects/${CONFIG.scope}`, '/issues/count']);
  });

  it('answers withinBudget:false when one full read exceeds 25% of the Search limit', async () => {
    const backlog = fakeBacklog({ counts: [1_900], searchLimit: 80 });
    const assessment = await backlogHttpOn({ clock: CLOCK, fetch: backlog.fetch }).assessSearchBudget(
      CONFIG,
      { apiKey: KEY },
    );
    expect(assessment).toMatchObject({ kind: 'assessed', estimatedSearchCalls: 21, withinBudget: false });
  });

  it.each([
    [401, 'auth_failed'],
    [404, 'project_not_found'],
    [503, 'unreachable'],
  ] as const)('maps HTTP %s to refused %s', async (status, reason) => {
    const backlog = fakeBacklog({
      counts: [1],
      status: (path) => (path === '/rateLimit' ? undefined : status),
    });
    const assessment = await backlogHttpOn({ clock: CLOCK, fetch: backlog.fetch }).assessSearchBudget(
      CONFIG,
      { apiKey: KEY },
    );
    expect(assessment).toEqual({ kind: 'refused', reason });
  });
});
