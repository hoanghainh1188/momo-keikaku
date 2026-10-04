/**
 * AD-6 `backlog-http` scaffold (story 5.1).
 *
 * GET-only: there is no POST / PUT / PATCH / DELETE code path. The full paginated
 * completeness loop (Count Issues, Search-budget gate) lands in story 5.3 — this
 * file holds the types and the non-GET refuse so CI can prove the fence now.
 */
import type { TicketObservation, TrackerAccountObservation } from '@momo/domain';

export type BacklogHttpMethod = 'GET';

/** Only GET is accepted. Any other method is a programming error. */
export function assertBacklogGetOnly(method: string): asserts method is BacklogHttpMethod {
  if (method !== 'GET') {
    throw new Error(`backlog-http is GET-only; refused non-GET method ${method}`);
  }
}

/** Closed set of HTTP methods this adapter may ever call. */
export const BACKLOG_HTTP_ALLOWED_METHODS = ['GET'] as const;

export interface BacklogConnectorConfig {
  readonly connectorId: string;
  readonly site: string;
  readonly scope: string;
}

export interface BacklogCredentials {
  readonly apiKey: string;
}

/**
 * Scaffold `TrackerPort` for live Backlog. `readScope` refuses until story 5.3 wires
 * the completeness loop — callers in 5.1 only need the GET-only fence and types.
 */
export function backlogHttpOn(_options: {
  /** Injected fetch for tests; production wires `globalThis.fetch`. */
  readonly fetch?: typeof globalThis.fetch;
}): {
  readScope(
    connectorConfig: BacklogConnectorConfig,
    credentials: BacklogCredentials,
  ): Promise<{
    complete: boolean;
    observedAt: string;
    tickets: TicketObservation[];
    accounts: TrackerAccountObservation[];
    hoursFieldPresent: boolean;
    rateLimit: null;
    adapterKind: 'backlog';
  }>;
  /** Perform a single GET against the Backlog API (scaffold; 5.3 expands this). */
  getJson(url: string, apiKey: string): Promise<unknown>;
} {
  const fetchImpl = _options.fetch ?? globalThis.fetch;

  return {
    async getJson(url: string, apiKey: string): Promise<unknown> {
      const method = 'GET';
      assertBacklogGetOnly(method);
      const response = await fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error(`backlog-http GET ${url} failed with status ${response.status}`);
      }
      return response.json();
    },

    async readScope(_connectorConfig, _credentials) {
      // Story 5.3: Count Issues before/after, page union, Search-budget gate.
      throw new Error(
        'backlog-http readScope is not implemented in story 5.1; completeness lands in 5.3',
      );
    },
  };
}
