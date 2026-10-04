import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertBacklogGetOnly,
  backlogHttpOn,
  BACKLOG_HTTP_ALLOWED_METHODS,
} from './backlog-http';

const HERE = dirname(fileURLToPath(import.meta.url));

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

  it('getJson only issues GET', async () => {
    const calls: unknown[] = [];
    const fetchMock = (async (...args: unknown[]) => {
      calls.push(args);
      return { ok: true, json: async () => ({ ok: true }) };
    }) as unknown as typeof fetch;
    const adapter = backlogHttpOn({ fetch: fetchMock });
    await adapter.getJson('https://example.backlog.jp/api/v2/issues', 'key');
    expect(calls).toHaveLength(1);
    const init = (calls[0] as unknown[])[1] as { method?: string };
    expect(init.method).toBe('GET');
  });

  it('readScope is not implemented in 5.1 (completeness is 5.3)', async () => {
    const adapter = backlogHttpOn({});
    await expect(
      adapter.readScope(
        { connectorId: 'c', site: 'example.backlog.jp', scope: 'EC2' },
        { apiKey: 'k' },
      ),
    ).rejects.toThrow(/5\.3/);
  });
});
