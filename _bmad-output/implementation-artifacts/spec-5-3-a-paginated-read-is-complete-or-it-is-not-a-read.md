---
title: 'Story 5.3 — A paginated read is complete, or it is not a read'
type: 'feature'
created: '2026-10-04'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'a57ad755ff32adf520c77194ee9e32cf4dd75949'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `backlog-http.readScope` still throws, so a live Backlog read cannot prove it saw every Ticket. Without Count Issues before/after, `sort=created&order=asc`, and a Search-budget gate, incomplete pages can look finished and poison the ledger.

**Approach:** Implement the AD-6 completeness loop in `backlog-http`, gate Connector set-up on Search budget, retry an incomplete read once then write nothing + failed attempt, and prove the page-shift fixture reports incomplete with no write — without shipping the 5.4 scheduler or 5.5 ledger writer.

**Decisions (agent defaults from AD-6 / epics ACs; Harry's "build Story 5.3" authorizes):**
- **Auth:** `apiKey` query param (Backlog standard); drop Bearer-only scaffold. GET timeout via `AbortSignal` (15s default).
- **Sort:** request `sort=created&order=asc&count=100`; within each page, stable-sort by numeric issue `id` as the internal-id tiebreak (API has one sort key).
- **Completeness:** Count Issues with the same `projectId[]` filter before and after paging; `complete` iff page-union has distinct ids, no duplicates, and size equals both counts. Incomplete → retry the full loop once inside the adapter; still incomplete → `complete:false`.
- **Failed attempt:** adapter never touches DB; app helper `recordIncompleteRead` appends `tracker_snapshot_attempt` (`read_incomplete`) and writes nothing. Callers that would ingest must check `complete` first.
- **Search budget at set-up:** before `addConnector` insert, call Get Rate Limit + resolve project key → id + Count Issues. Store `connector.search_limit`. Estimate Search cost = `ceil(count/100) + 2` (pages + before/after counts). Refuse set-up when estimate > 25% of `search.limit`. Schedule slowdown is 5.4 — R0 only refuses.
- **Project resolve:** `GET /api/v2/projects/:projectKeyOrId` once per read/set-up; filter with numeric `projectId[]`.
- **R0 strategy doc:** module header on `backlog-http.ts` states full-scope every snapshot; incremental may never mark `left_scope`; complete full read ≥ daily.
- **page-shift gate:** fixture-replay already returns `complete:false` on page 1; add a gate test that an incomplete ScopeRead must not call any snapshot/ledger write port.
- **Hours:** map Backlog `estimatedHours`/`actualHours` through `hoursToMh`; absent → null; `hoursFieldPresent` when any ticket has non-null actual hours field present in payload (including 0).

## Boundaries & Constraints

**Always:**
- Get Issue List uses `sort=created&order=asc` (never default `updated desc`).
- Complete only when distinct page-union size equals Count Issues before **and** after.
- Incomplete → retry once → write nothing + failed attempt visible to the PM.
- page-shift fixture reports incomplete; gate proves no write.
- Set-up calls Get Rate Limit, stores Search limit, refuses when one full read would exceed 25% of Search budget per minute window.
- GET-only; plaintext secrets never logged.

**Never:**
- No 5.4 cron/queue/top-bar pin job; no schedule "slow" path beyond documenting it for 5.4.
- No 5.5 ledger writer / snapshot persist transaction.
- No Story 3.1 workbook reader; no Jira; no incremental/`left_scope` marking here.
- No non-GET Backlog methods; no descriptions/comments persisted.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Complete multi-page read | Count before=N, pages union N distinct, count after=N | `complete:true`, tickets/accounts mapped, rateLimit from Search headers | N/A |
| Count drift / duplicate ids | before≠after or duplicates or union≠counts | Retry once; then `complete:false` | Caller records failed attempt; no write |
| page-shift fixture | scenario `page-shift` page 1 | `complete:false`; gate forbids snapshot/ledger write | N/A |
| Search budget OK | estimate ≤ 25% of search.limit | Connector inserted; `search_limit` stored | N/A |
| Search budget over | estimate > 25% of search.limit | `addConnector` refuses `invalid_input` search_budget | Operator-visible reason |
| Auth / HTTP failure | 401/403/5xx/timeout | Throw; set-up refuse or ingest credential/notify path as appropriate | No partial snapshot write |
| Empty project | count=0 | `complete:true`, empty tickets | N/A |

</frozen-after-approval>

## Code Map

- `packages/adapters/src/backlog-http.ts` — implement `readScope` + `assessSearchBudget` / rate-limit helpers; apiKey query; timeout; issue→TicketObservation map; R0 strategy header doc.
- `packages/adapters/src/backlog-http.test.ts` — completeness matrix (mock fetch), sort query assert, retry-once, budget assess, GET-only fence retained.
- `packages/domain/src/types.ts` — keep `RateLimitState`; optionally extend if Search limit needs more fields (prefer connector column over widening ScopeRead).
- `packages/db/src/schema.ts` + migration `0006_*` — `connector.search_limit` (integer, nullable for fixture connectors).
- `packages/db/src/repositories/connector/index.ts` + `packages/app/src/ports/connector-write.ts` — persist/read `searchLimit` on insert; public row may omit it or expose for diagnostics.
- `packages/app/src/use-cases/connector-writes.ts` — before insert, call budget assess (deps inject `BacklogBudgetPort` / adapter helper); refuse over budget.
- `packages/app/src/use-cases/connector-ingest.ts` — `recordIncompleteRead` (reason `read_incomplete`) mirroring approval/credential attempt pattern.
- `packages/app/src/use-cases/connector-ingest.test.ts` + writes tests — incomplete attempt; budget refuse.
- `packages/adapters/src/fixture-replay.test.ts` (or new gate test) — page-shift incomplete → no write port touched.
- `apps/web/src/server/composition.ts` — wire budget helper into addConnector deps; export incomplete recorder if needed.
- Continuity from 5.2: reuse `appendSnapshotAttempt`, approval/credential patterns; do not expand 5.4/5.5.
- Resolve deferred-work row for apiKey + AbortSignal timeout (5.1 deferral) as done by this story.

## Tasks & Acceptance

**Execution:**
- [x] `packages/adapters/src/backlog-http.ts` — completeness loop, mapping, apiKey+timeout, budget helper, R0 doc header.
- [x] `packages/adapters/src/backlog-http.test.ts` — matrix + sort + retry + budget; remove 5.1 "not implemented" stub test.
- [x] Migration `0006` + schema/repo/port — `search_limit` on connector.
- [x] `connector-writes` + composition — Search budget gate at set-up; store limit.
- [x] `connector-ingest` — `recordIncompleteRead`; unit tests.
- [x] page-shift incompleteness write-gate test.
- [x] Mark deferred apiKey/timeout row resolved; `sprint-status.yaml` → in-progress then review; sync 5.1/5.2 to `done` if still `review`.
- [x] Verify `pnpm lint`, `typecheck`, `depcruise`, `test` exit 0.

**Acceptance Criteria:**
- Given Get Issue List, when called, then `sort=created&order=asc` with id tiebreak — not `updated desc`.
- Given a full read, when completeness is judged, then Count Issues before and after; complete only if distinct union size equals both counts.
- Given incomplete, when finished, then retried once, then writes nothing and records a failed attempt.
- Given page-shift fixture, when replayed, then incomplete and nothing written.
- Given rate limits at set-up, when Search budget for one full read exceeds 25%, then Connector is refused (slowdown deferred to 5.4).
- Given R0 strategy, when documented, then full-scope every snapshot; incremental may never mark `left_scope`; complete full read at least daily.

## Implementation Notes

- **Adapter (`backlog-http.ts`).** `backlogHttpOn({ clock, fetch?, timeoutMs? })` — `clock` is now required (ESLint bans wall-clock reads outside `clock.ts`; web passes `webClock()`, worker `workerClock`). `readScope` resolves the project key once, then runs `readOnce` (Count → pages → Count) and retries once if incomplete. Pages stop at `ceil(before/100)` or a short page, so the call count matches the budget formula exactly (`ceil(N/100) + 2`; empty project lists no page); a Ticket created mid-read is caught by the after-count, not chased. Within a page, issues sort by `created` then numeric `id`. `rateLimit` comes from the last Search response's `X-RateLimit-Remaining` / `X-RateLimit-Reset`. The 5.1 `getJson` scaffold is removed (it had no callers outside its test).
- **Errors.** `BacklogHttpError { kind: auth | not_found | http | timeout | network | payload, status }`; messages name the API path only — never the query string or the key — and the underlying fetch error is dropped on purpose (it can carry the URL). Empty API key refuses before any request.
- **Whitelist.** Payload parsing reads only id / key / summary / status / issueType / assignee / hours / parentIssueId / created / milestone / category. Accounts carry `accountId` + `displayName` only (no `mailAddress`). Attribute ids are Backlog numeric ids with the name as `label`.
- **Set-up budget (`addConnector`).** Role gate → parse → Project reach → `deps.searchBudget.assessSearchBudget` → transaction. The Backlog check runs outside the DB transaction. Refusals are `invalid_input` with rule codes in `ADD_CONNECTOR_REFUSALS`: `projectKey: [search_budget]`, `apiKey: [credential_rejected]`, `projectKey: [project_not_found]`, `spaceUrl: [backlog_unreachable]`. New `AddConnectorDeps` = `ConnectorWriteDeps & { searchBudget }`; the harness entry in `tests/read-use-cases.ts` carries a within-budget stub. The Connectors action maps those codes to operator-visible copy (`connectors.refused_*`, en + ja).
- **Ingest gate.** `recordIncompleteRead` appends one `tracker_snapshot_attempt` (`read_incomplete`) and nothing else (no `last_error`, since the banner is titled as a credential error). `admitScopeRead` is the gate a 5.4/5.5 caller runs between `readScope` and any writer: complete → `admitted` with no transaction; incomplete → records and answers `incomplete`. `tests/page-shift-write-gate.test.ts` replays the committed `page-shift` fixture through it with a recording repository and asserts the only members touched are `findConnector` + `appendSnapshotAttempt`.
- **DB.** `0006_connector_search_limit.sql` (one nullable `ADD COLUMN`, generated by drizzle-kit 0.31.10 + header comment); `insertConnector` writes it; `ConnectorPublicRow` does not expose it yet (5.4 can when the schedule needs it).
- **Verification.** `pnpm lint`, `pnpm typecheck`, `pnpm depcruise`, `pnpm test` all exit 0 (1248 passed, 459 skipped). No Postgres in this environment, so DB-backed suites (`schema-catalog`, `rls`, cross-tenant writes) were skipped — migration `0006` has not been applied against a live database here.
- **Not done / for later.** The schedule-slowdown path and operator alert for an over-budget *running* Connector are 5.4's; `rateLimit` is reported but nothing paces on it yet; no UI lists `tracker_snapshot_attempt` rows (the PM-visible attempt list is 5.4's surface).

## Spec Change Log

## Review Triage Log

## Design Notes

- **Retry ownership:** adapter retries the HTTP completeness loop once; app records the failed attempt. Keeps AD-1 (no DB in adapters) while matching AD-6's "retry once then failed attempt".
- **Budget formula:** Search calls ≈ `ceil(N/100) + 2`; threshold `0.25 * rateLimit.search.limit`. Fixture connectors leave `search_limit` null.
- **ObservedAt:** live reads use response time / wall clock from injected clock optional — default `new Date().toISOString()` at end of successful loop (fixture keeps recorded offsets).

## Verification

**Commands:**
- `pnpm lint` — exit 0
- `pnpm typecheck` — exit 0
- `pnpm depcruise` — exit 0
- `pnpm test` — exit 0 (including backlog-http completeness + budget + incomplete attempt + page-shift gate)
