/**
 * AD-6 TrackerPort and FixtureCursorPort (story 5.1).
 *
 * Declared here; satisfied structurally by `packages/adapters` (fixture-replay /
 * backlog-http) and by `packages/db` (fixture-cursor repository). Composition roots
 * wire them; adapters never import `@momo/db`.
 */
import type {
  AdapterKind,
  RateLimitState,
  TicketObservation,
  TrackerAccountObservation,
} from '@momo/domain';

/** Closed R0 adapter kinds. `jira` arrives Post-Q1. */
export type TrackerAdapterKind = AdapterKind;

/** Connector configuration the adapter needs to read a scope (credentials stay separate). */
export interface TrackerConnectorConfig {
  readonly connectorId: string;
  readonly tenantId: string;
  /** Live Backlog space host, or a fixture scenario directory name under `fixtures/backlog/`. */
  readonly site: string;
  /** Project key / scope filter the Connector was set up with. */
  readonly scope: string;
  /** Declared connector.adapter: `backlog` | `fixture` (selection may still honour the override). */
  readonly adapter: TrackerAdapterKind;
  /**
   * For `fixture-replay`: which scenario directory to read
   * (`fixtures/backlog/<scenario>/NNNN.json`). Defaults to `site` when omitted.
   */
  readonly scenario?: string;
}

/** Write-only credentials; never logged (NFR-S2). Empty for fixture-replay. */
export interface TrackerCredentials {
  readonly apiKey?: string;
  readonly token?: string;
}

/** AD-6 `TrackerPort.readScope` result. */
export interface ScopeRead {
  readonly complete: boolean;
  readonly observedAt: string;
  readonly tickets: readonly TicketObservation[];
  readonly accounts: readonly TrackerAccountObservation[];
  readonly hoursFieldPresent: boolean;
  readonly rateLimit: RateLimitState | null;
  readonly adapterKind: TrackerAdapterKind;
}

/**
 * The only outbound path to a tracker (AD-6). Implementations: `fixture-replay`,
 * `backlog-http`, `jira-cloud` later. A `complete: false` read must never reach a writer
 * (story 5.3): the caller records it through `recordIncompleteRead` and writes nothing.
 */
export interface TrackerPort {
  readScope(
    connectorConfig: TrackerConnectorConfig,
    credentials: TrackerCredentials,
  ): Promise<ScopeRead>;
}

/**
 * Set-up Search-budget check (story 5.3 / AR-13): Get Rate Limit's Search bucket, the scope's
 * Count Issues, and whether one full read stays within 25% of that bucket. `refused` carries a
 * reason only — never a status body or the key.
 */
export type SearchBudgetAssessment =
  | {
      readonly kind: 'assessed';
      readonly searchLimit: number;
      readonly ticketCount: number;
      readonly estimatedSearchCalls: number;
      readonly withinBudget: boolean;
    }
  | {
      readonly kind: 'refused';
      readonly reason: 'auth_failed' | 'project_not_found' | 'unreachable';
    };

export interface SearchBudgetPort {
  assessSearchBudget(
    connectorConfig: { readonly site: string; readonly scope: string },
    credentials: { readonly apiKey: string },
  ): Promise<SearchBudgetAssessment>;
}

/**
 * Per-Connector fixture page cursor. Owned by `packages/db`; adapters take this port
 * and never import the database (AD-1 / AR-12).
 */
export interface FixtureCursorPort {
  /** Next page index to read (0-based), or 0 when unset. */
  get(connectorId: string): Promise<number>;
  /** Persist the next page index after a successful read. */
  set(connectorId: string, nextPageIndex: number): Promise<void>;
}
