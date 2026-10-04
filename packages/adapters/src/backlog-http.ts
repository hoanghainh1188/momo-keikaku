/**
 * AD-6 `backlog-http` — the live Backlog adapter (stories 5.1 and 5.3).
 *
 * GET-only: there is no POST / PUT / PATCH / DELETE code path, and every request goes through
 * `assertBacklogGetOnly`. The API key travels as Backlog's `apiKey` query parameter and is never
 * put in an error message or a log line; errors name the API path only.
 *
 * R0 READ STRATEGY (AR-13, AR-15, AR-62):
 *
 *   * Every snapshot reads the FULL scope: Count Issues, then every Get Issue List page
 *     (`sort=created&order=asc`, 100 per page, created-then-id order within a page), then Count
 *     Issues again — about 20 calls per 2,000 Tickets, paced by the `X-RateLimit-*` headers
 *     (reported as `rateLimit`). Never the API's default `sort=updated&order=desc`: a Ticket
 *     updated mid-read jumps to page 1 and shifts every later page.
 *   * A read is `complete` only when the page union has distinct ids, no duplicates, and its size
 *     equals BOTH counts. An incomplete read is retried once inside this adapter; still
 *     incomplete, it answers `complete: false` and the caller writes nothing and records a failed
 *     attempt (`recordIncompleteRead` in packages/app).
 *   * Incremental reads (`updatedSince`) are deferred, under one guard for when they land: an
 *     incremental read may never mark a Ticket `left_scope`, and a complete full read must still
 *     run at least daily.
 *   * Set-up refuses a scope whose one full read would use more than 25% of the Search bucket per
 *     rate-limit window (`assessSearchBudget`). Slowing a schedule instead is story 5.4's.
 */
import {
  hoursToMh,
  type RateLimitState,
  type TicketAttribute,
  type TicketObservation,
  type TrackerAccountObservation,
} from '@momo/domain';

export type BacklogHttpMethod = 'GET';

/** Only GET is accepted. Any other method is a programming error. */
export function assertBacklogGetOnly(method: string): asserts method is BacklogHttpMethod {
  if (method !== 'GET') {
    throw new Error(`backlog-http is GET-only; refused non-GET method ${method}`);
  }
}

/** Closed set of HTTP methods this adapter may ever call. */
export const BACKLOG_HTTP_ALLOWED_METHODS = ['GET'] as const;

/** Get Issue List's maximum `count`. */
export const BACKLOG_PAGE_SIZE = 100;

/** Per-GET timeout unless the caller overrides it. */
export const BACKLOG_GET_TIMEOUT_MS = 15_000;

export interface BacklogConnectorConfig {
  readonly connectorId: string;
  /** Space host, e.g. `example.backlog.jp`. */
  readonly site: string;
  /** Backlog project key (or numeric id) the Connector reads. */
  readonly scope: string;
}

export interface BacklogCredentials {
  readonly apiKey: string;
}

export type BacklogHttpErrorKind = 'auth' | 'not_found' | 'http' | 'timeout' | 'network' | 'payload';

/** A failed Backlog GET. The message names the API path only — never the query or the key. */
export class BacklogHttpError extends Error {
  constructor(
    readonly kind: BacklogHttpErrorKind,
    readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'BacklogHttpError';
  }
}

/** One full read's Search calls: one per page plus the before and after Count Issues. */
export function estimateSearchCalls(ticketCount: number): number {
  return Math.ceil(ticketCount / BACKLOG_PAGE_SIZE) + 2;
}

/** True when one full read stays within 25% of the Search bucket's limit (AR-13). */
export function fitsSearchBudget(estimatedSearchCalls: number, searchLimit: number): boolean {
  return estimatedSearchCalls * 4 <= searchLimit;
}

export interface BacklogScopeRead {
  complete: boolean;
  observedAt: string;
  tickets: TicketObservation[];
  accounts: TrackerAccountObservation[];
  hoursFieldPresent: boolean;
  rateLimit: RateLimitState | null;
  adapterKind: 'backlog';
}

/** Structural match for packages/app's `SearchBudgetAssessment`. */
export type BacklogSearchBudgetAssessment =
  | {
      readonly kind: 'assessed';
      readonly searchLimit: number;
      readonly ticketCount: number;
      readonly estimatedSearchCalls: number;
      readonly withinBudget: boolean;
    }
  | { readonly kind: 'refused'; readonly reason: 'auth_failed' | 'project_not_found' | 'unreachable' };

interface RawNamed {
  readonly id: number;
  readonly name?: string;
}

interface RawIssue {
  readonly id: number;
  readonly projectId: number;
  readonly issueKey: string;
  readonly summary: string;
  readonly status: RawNamed;
  readonly issueType: RawNamed;
  readonly assignee: RawNamed | null;
  readonly estimatedHours: number | null;
  readonly actualHours: number | null;
  readonly parentIssueId: number | null;
  readonly created: string;
  readonly milestone: readonly RawNamed[];
  readonly category: readonly RawNamed[];
}

interface GetResult {
  readonly body: unknown;
  readonly headers: Headers;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function payloadError(path: string, what: string): BacklogHttpError {
  return new BacklogHttpError('payload', null, `backlog-http GET ${path}: unexpected payload (${what})`);
}

function named(value: unknown, path: string, field: string): RawNamed {
  if (!isRecord(value) || typeof value.id !== 'number') throw payloadError(path, field);
  return { id: value.id, ...(typeof value.name === 'string' ? { name: value.name } : {}) };
}

function nullableNumber(value: unknown, path: string, field: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number') throw payloadError(path, field);
  return value;
}

function namedList(value: unknown, path: string, field: string): RawNamed[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw payloadError(path, field);
  return value.map((item) => named(item, path, field));
}

/** Reads only the whitelisted fields (FR-19); descriptions and comments are never touched. */
function rawIssueFrom(value: unknown, path: string): RawIssue {
  if (!isRecord(value)) throw payloadError(path, 'issue');
  const { id, projectId, issueKey, summary, created } = value;
  if (
    typeof id !== 'number' ||
    typeof projectId !== 'number' ||
    typeof issueKey !== 'string' ||
    typeof summary !== 'string' ||
    typeof created !== 'string'
  ) {
    throw payloadError(path, 'issue');
  }
  return {
    id,
    projectId,
    issueKey,
    summary,
    created,
    status: named(value.status, path, 'status'),
    issueType: named(value.issueType, path, 'issueType'),
    assignee: value.assignee === null || value.assignee === undefined
      ? null
      : named(value.assignee, path, 'assignee'),
    estimatedHours: nullableNumber(value.estimatedHours, path, 'estimatedHours'),
    actualHours: nullableNumber(value.actualHours, path, 'actualHours'),
    parentIssueId: nullableNumber(value.parentIssueId, path, 'parentIssueId'),
    milestone: namedList(value.milestone, path, 'milestone'),
    category: namedList(value.category, path, 'category'),
  };
}

function attribute(kind: TicketAttribute['kind'], item: RawNamed): TicketAttribute {
  return { kind, id: String(item.id), ...(item.name !== undefined ? { label: item.name } : {}) };
}

function ticketFromIssue(issue: RawIssue): TicketObservation {
  return {
    trackerIssueId: String(issue.id),
    key: issue.issueKey,
    title: issue.summary,
    statusId: String(issue.status.id),
    estimateMh: issue.estimatedHours === null ? null : hoursToMh(issue.estimatedHours),
    actualMh: issue.actualHours === null ? null : hoursToMh(issue.actualHours),
    assigneeAccountId: issue.assignee === null ? null : String(issue.assignee.id),
    createdAt: issue.created,
    parentIssueId: issue.parentIssueId === null ? null : String(issue.parentIssueId),
    issueTypeId: String(issue.issueType.id),
    trackerProjectId: String(issue.projectId),
    attributes: [
      ...issue.milestone.map((m) => attribute('milestone', m)),
      ...issue.category.map((c) => attribute('category', c)),
    ],
  };
}

function accountsFrom(issues: readonly RawIssue[]): TrackerAccountObservation[] {
  const seen = new Map<string, TrackerAccountObservation>();
  for (const issue of issues) {
    if (issue.assignee === null) continue;
    const accountId = String(issue.assignee.id);
    if (seen.has(accountId)) continue;
    seen.set(accountId, { accountId, displayName: issue.assignee.name ?? accountId });
  }
  return [...seen.values()];
}

/** Created ascending, the numeric internal id breaking ties (the API takes one sort key). */
function byCreatedThenId(a: RawIssue, b: RawIssue): number {
  const byCreated = Date.parse(a.created) - Date.parse(b.created);
  return byCreated !== 0 && Number.isFinite(byCreated) ? byCreated : a.id - b.id;
}

function rateLimitFrom(headers: Headers): RateLimitState | null {
  const remaining = headers.get('X-RateLimit-Remaining');
  const reset = headers.get('X-RateLimit-Reset');
  if (remaining === null && reset === null) return null;
  const remainingN = remaining === null ? Number.NaN : Number(remaining);
  const resetS = reset === null ? Number.NaN : Number(reset);
  return {
    remaining: Number.isFinite(remainingN) ? remainingN : null,
    resetAt: Number.isFinite(resetS) ? new Date(resetS * 1000).toISOString() : null,
  };
}

interface Attempt {
  readonly complete: boolean;
  readonly issues: readonly RawIssue[];
  readonly lastHeaders: Headers;
}

export interface BacklogHttpOptions {
  /** Observation time source (AD-15); composition roots pass the product Clock. */
  readonly clock: { now(): Date };
  /** Injected fetch for tests; production uses `globalThis.fetch`. */
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
}

/** Build the live Backlog adapter: `readScope` (TrackerPort) and the set-up Search-budget check. */
export function backlogHttpOn(options: BacklogHttpOptions): {
  readScope(
    connectorConfig: BacklogConnectorConfig,
    credentials: BacklogCredentials,
  ): Promise<BacklogScopeRead>;
  assessSearchBudget(
    connectorConfig: Pick<BacklogConnectorConfig, 'site' | 'scope'>,
    credentials: BacklogCredentials,
  ): Promise<BacklogSearchBudgetAssessment>;
} {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? BACKLOG_GET_TIMEOUT_MS;

  async function get(
    site: string,
    path: string,
    params: readonly (readonly [string, string])[],
    apiKey: string,
  ): Promise<GetResult> {
    const method = 'GET';
    assertBacklogGetOnly(method);
    if (apiKey.length === 0) {
      throw new BacklogHttpError('auth', null, `backlog-http GET ${path}: no API key on file`);
    }
    const url = new URL(`https://${site}/api/v2${path}`);
    if (url.hostname !== site) {
      throw new BacklogHttpError('http', null, `backlog-http: refused malformed site for ${path}`);
    }
    for (const [name, value] of params) url.searchParams.append(name, value);
    url.searchParams.set('apiKey', apiKey);

    let response: Response;
    try {
      response = await fetchImpl(url.toString(), {
        method,
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      // The underlying error is dropped on purpose: it can carry the URL, and so the key.
      const timedOut =
        error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw timedOut
        ? new BacklogHttpError('timeout', null, `backlog-http GET ${path} timed out after ${timeoutMs} ms`)
        : new BacklogHttpError('network', null, `backlog-http GET ${path} failed before a response`);
    }
    if (!response.ok) {
      const kind: BacklogHttpErrorKind =
        response.status === 401 || response.status === 403
          ? 'auth'
          : response.status === 404
            ? 'not_found'
            : 'http';
      throw new BacklogHttpError(
        kind,
        response.status,
        `backlog-http GET ${path} failed with status ${response.status}`,
      );
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw payloadError(path, 'not JSON');
    }
    return { body, headers: response.headers };
  }

  async function resolveProjectId(site: string, scope: string, apiKey: string): Promise<number> {
    const path = `/projects/${encodeURIComponent(scope)}`;
    const { body } = await get(site, path, [], apiKey);
    if (!isRecord(body) || typeof body.id !== 'number') throw payloadError(path, 'project');
    return body.id;
  }

  async function countIssues(
    site: string,
    projectId: number,
    apiKey: string,
  ): Promise<{ count: number; headers: Headers }> {
    const path = '/issues/count';
    const { body, headers } = await get(site, path, [['projectId[]', String(projectId)]], apiKey);
    if (!isRecord(body) || typeof body.count !== 'number') throw payloadError(path, 'count');
    return { count: body.count, headers };
  }

  async function listIssues(
    site: string,
    projectId: number,
    offset: number,
    apiKey: string,
  ): Promise<{ issues: RawIssue[]; headers: Headers }> {
    const path = '/issues';
    const { body, headers } = await get(
      site,
      path,
      [
        ['projectId[]', String(projectId)],
        ['sort', 'created'],
        ['order', 'asc'],
        ['count', String(BACKLOG_PAGE_SIZE)],
        ['offset', String(offset)],
      ],
      apiKey,
    );
    if (!Array.isArray(body)) throw payloadError(path, 'issue list');
    const issues = body.map((item) => rawIssueFrom(item, path));
    issues.sort(byCreatedThenId);
    return { issues, headers };
  }

  /**
   * One full pass. Pages stop at `ceil(before / 100)` (or a short page), so a Ticket created
   * mid-read is caught by the after-count rather than chased; a deletion shows as a short union.
   */
  async function readOnce(site: string, projectId: number, apiKey: string): Promise<Attempt> {
    const before = await countIssues(site, projectId, apiKey);
    const issues: RawIssue[] = [];
    for (let offset = 0; offset < before.count; offset += BACKLOG_PAGE_SIZE) {
      const page = await listIssues(site, projectId, offset, apiKey);
      issues.push(...page.issues);
      if (page.issues.length < BACKLOG_PAGE_SIZE) break;
    }
    const after = await countIssues(site, projectId, apiKey);
    const distinct = new Set(issues.map((issue) => issue.id)).size;
    const complete =
      distinct === issues.length && distinct === before.count && distinct === after.count;
    return { complete, issues, lastHeaders: after.headers };
  }

  return {
    async readScope(connectorConfig, credentials) {
      const { site, scope } = connectorConfig;
      const { apiKey } = credentials;
      const projectId = await resolveProjectId(site, scope, apiKey);
      let attempt = await readOnce(site, projectId, apiKey);
      if (!attempt.complete) attempt = await readOnce(site, projectId, apiKey);

      return {
        complete: attempt.complete,
        observedAt: options.clock.now().toISOString(),
        tickets: attempt.issues.map(ticketFromIssue),
        accounts: accountsFrom(attempt.issues),
        hoursFieldPresent: attempt.issues.some((issue) => issue.actualHours !== null),
        rateLimit: rateLimitFrom(attempt.lastHeaders),
        adapterKind: 'backlog',
      };
    },

    async assessSearchBudget(connectorConfig, credentials) {
      const { site, scope } = connectorConfig;
      const { apiKey } = credentials;
      try {
        const path = '/rateLimit';
        const { body } = await get(site, path, [], apiKey);
        const search =
          isRecord(body) && isRecord(body.rateLimit) && isRecord(body.rateLimit.search)
            ? body.rateLimit.search
            : null;
        if (search === null || typeof search.limit !== 'number') {
          throw payloadError(path, 'rateLimit.search.limit');
        }
        const searchLimit = search.limit;
        const projectId = await resolveProjectId(site, scope, apiKey);
        const { count } = await countIssues(site, projectId, apiKey);
        const estimatedSearchCalls = estimateSearchCalls(count);
        return {
          kind: 'assessed',
          searchLimit,
          ticketCount: count,
          estimatedSearchCalls,
          withinBudget: fitsSearchBudget(estimatedSearchCalls, searchLimit),
        };
      } catch (error) {
        if (!(error instanceof BacklogHttpError)) throw error;
        if (error.kind === 'auth') return { kind: 'refused', reason: 'auth_failed' };
        if (error.kind === 'not_found') return { kind: 'refused', reason: 'project_not_found' };
        return { kind: 'refused', reason: 'unreachable' };
      }
    },
  };
}
