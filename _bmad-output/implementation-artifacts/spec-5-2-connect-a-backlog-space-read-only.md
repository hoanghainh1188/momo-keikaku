---
title: 'Story 5.2 — Connect a Backlog space, read-only'
type: 'feature'
created: '2026-10-04'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '872e0572c05d71b2765c06ccc2726284583ef2fa'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A PM cannot connect a Project to a Backlog space: there is no set-up flow, no client-approval gate, no encrypted credential store, no `connector_scope_event`, and `ingestSnapshot` does not refuse unapproved Connectors — so UJ-2 cannot start and FR-17/AR-29 are unmet.

**Approach:** Land Connector set-up (space URL, API key, project key, bot-user recommendation), client approval + ingest refusal, AES-256-GCM credentials with `key_id` (local `CREDENTIALS_KEY`; KMS port refuses until Epic 8), write-only credential surface + redaction, scope events with `scope_seq` on snapshots, credential-error notify (in-app + mail), and rotation that never touches Mapping — without shipping paginated completeness (5.3), the snapshot scheduler (5.4), or the ledger writer transaction (5.5).

**Decisions (agent defaults from AD-7/AD-16/AD-21 / epics ACs; Harry's "build Story 5.2" authorizes):**
- **Credentials on `connector`:** `credentials_ciphertext` (bytea), `credentials_nonce` (bytea), `credentials_key_id` (text); plaintext never stored; rotate overwrites ciphertext only.
- **Approval columns on `connector`:** `approval_recorded_at`, `approval_name` (who on the client side); required before ingest — R0 treats every live Backlog Connector as needing approval (client-owned gate = missing approval).
- **Site:** `connector.site` holds the Backlog host parsed from space URL; `space_label` stays human-readable; `scope` is the project key and is also appended via `connector_scope_event`.
- **Crypto:** `CredentialsCryptoPort` — local AES-256-GCM from `CREDENTIALS_KEY` (32-byte base64) + `CREDENTIALS_KEY_ID`; `CREDENTIALS_CRYPTO=kms` accepted in config but composition refuses naming Epic 8 (same pattern as `MAILER=ses`).
- **Failed attempts:** new append-only `tracker_snapshot_attempt` (reason code + PM-visible message + attempted_at); approval refuse and credential auth failures write rows; full retry/schedule UX is 5.4.
- **Credential-error notify:** use-case records attempt + sets `connector.last_error_*`, mails PM via `MailerPort`, surfaces banner copy on Connectors page; scheduled interval delivery lands with 5.4 — this story proves the notify path when a snapshot attempt fails on auth.
- **Hours detection:** keep `hoursFieldPresent` from `TrackerPort` / last snapshot basis; never read Backlog plan name; UI copy stays data-detected.
- **Mapping on rotate:** rotate credentials only; no delete/rewrite of `mapping_event` / rules.

## Boundaries & Constraints

**Always:**
- Set-up collects space URL, API key, project key; form recommends a dedicated read-only bot user.
- `ingestSnapshot` (domain gate + any app caller) refuses when `approval_recorded_at` is null; refuse is a failed attempt with PM-visible reason.
- Credentials: AES-256-GCM; every ciphertext stores `key_id`; write-only after entry; pino redacts `*.apiKey`, `*.token`, `*.password`, `authorization` (existing list already covers these).
- Scope set/change appends `connector_scope_event`; snapshots that record scope carry `scope_seq`.
- Credential auth failure → Connector error banner + email; figures frozen at last good snapshot time in the copy.
- Rotation keeps all Mappings.

**Never:**
- No non-GET Backlog writes; no full Count Issues completeness loop (5.3).
- No hourly snapshot scheduler / top-bar pin refresh job (5.4).
- No worker Actuals Ledger writer transaction (5.5).
- No `connector_setting_event` / Resolved set UI (later). No Story 3.1. No Jira.
- No plaintext credentials in logs, audit payloads, or job payloads.
- No KMS production adapter body beyond the refuse stub.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Add Backlog Connector | URL + apiKey + project key + approval name/when | Connector row + ciphertext + approval + first `connector_scope_event`; credentials never returned | invalid_input / not_found |
| Ingest without approval | `approval_recorded_at` null | Domain/app refuse; `tracker_snapshot_attempt` failed row; no snapshot write | PM-visible reason |
| Hours from data | ScopeRead with/without actualMh | `hoursFieldPresent` / measurement basis from observations only | N/A |
| Encrypt/decrypt round-trip | CREDENTIALS_KEY local | Ciphertext + key_id; decrypt yields apiKey | Missing key → boot/read error naming key |
| Rotate credentials | New apiKey | Ciphertext replaced; mapping_event unchanged | invalid_input |
| Auth failure notify | Snapshot attempt 401/revoked | Attempt row + last_error + mail + banner with last-good freeze time | Mail best-effort; error still recorded |
| Scope change | New project key | Append `connector_scope_event`; connector.scope updated; later snapshots store that `scope_seq` | not_found |
| Read credentials via use-case | Any list/get connector | No apiKey/token fields in result | N/A |
| KMS mode before Epic 8 | CREDENTIALS_CRYPTO=kms | Composition refuses naming missing adapter | Boot failure |

</frozen-after-approval>

## Code Map

- `packages/db/src/schema.ts` + migration `0005_*` — alter `connector` (site, approval_*, credentials_*, last_error_*); add `connector_scope_event`, `tracker_snapshot_attempt`; add `tracker_snapshot.scope_seq`.
- `packages/db/src/table-classes.ts` + `sql/rls.sql` / `grants.sql` / triggers — register append-only classes; FORCE RLS; appendOnlyGuard.
- `packages/db/src/repositories/` — connector write/read (no plaintext out), scope-event append, attempt append, decrypt-for-adapter only inside trusted ingest path.
- `packages/app/src/ports/credentials-crypto.ts` (**new**) — encrypt/decrypt + keyId.
- `packages/adapters/src/credentials-aes.ts` (**new**) — AES-256-GCM local; wire in composition.
- `packages/app/src/config.ts` — `CREDENTIALS_KEY`, `CREDENTIALS_KEY_ID`, `CREDENTIALS_CRYPTO` (`local`|`kms`).
- `packages/app/src/use-cases/connector-writes.ts` (**new**) — addConnector, rotateCredentials, changeScope; PROJECT_REACH + audit; role/audit declarations merged.
- `packages/domain/src/ledger.ts` (+ types if needed) — `ApprovalRequiredError` / refuse when approval missing (caller supplies approval instant).
- `packages/app/src/use-cases/` notify path — record credential failure + `MailerPort` (console in local).
- `apps/web/src/app/p/[projectId]/connectors/` + form component + server action — set-up UI; bot-user recommendation; approval fields; error banner; remove "not in this demo" credential caption for landed paths.
- `packages/i18n/src/messages/{en,ja}.json` — form, banner, bot recommendation, mail subject/body keys.
- `packages/app/src/logger.ts` — already redacts AD-16 paths; extend tests if new shapes appear.
- `packages/db/src/seed.ts` — fixture connectors get approval_recorded_at so demo ingest paths keep working; no live apiKey.
- Continuity from 5.1: reuse `TrackerPort` / `TrackerCredentials` / `backlog-http` scaffold / composition `trackerPortOn`. Do not expand 5.3 completeness or 5.4 cron.

## Tasks & Acceptance

**Execution:**
- [x] Migration `0005` + schema + table-classes + RLS/grants/triggers — connector columns, `connector_scope_event`, `tracker_snapshot_attempt`, `scope_seq`.
- [x] `CredentialsCryptoPort` + local AES-256-GCM adapter + config keys; kms refuse stub.
- [x] Connector use-cases (add / rotate / change scope) + repos; write-only reads; audit + roles registered.
- [x] Domain/app ingest approval refuse + failed attempt row; credential-failure notify (attempt + banner fields + mail).
- [x] Connectors UI form + banner + i18n (EN/JA); server action wiring.
- [x] Seed/fixture connectors carry approval; hours-detection copy stays data-based.
- [x] Tests: encrypt round-trip + key_id; approval refuse; rotate keeps mappings; scope_event + scope_seq; redaction; notify path; role gate.
- [x] `sprint-status.yaml` — `5-2-…` → `in-progress` then `review`.
- [x] Verify `pnpm lint`, `typecheck`, `depcruise`, `test` exit 0.

**Acceptance Criteria:**
- Given set-up, when a PM adds a Connector, then space URL, API key, project key are taken and a read-only bot user is recommended.
- Given client approval missing, when ingest runs, then it refuses and records a failed attempt with a PM-visible reason.
- Given hours availability, when detected, then it comes from observation data, never a plan name.
- Given credentials stored, when encrypted, then AES-256-GCM ciphertext stores `key_id`; local uses `CREDENTIALS_KEY`.
- Given credentials after entry, when any surface reads the Connector, then no secret is shown; pino redacts secret paths.
- Given rotation, when it completes, then Mapping history is unchanged.
- Given invalid/revoked credential on a snapshot attempt, when it fails, then in-app banner + email fire with freeze-at-last-good copy.
- Given scope set/changed, when persisted, then `connector_scope_event` is appended and snapshots can record `scope_seq`.

## Implementation Notes

- Migration `0005_connector_credentials_and_scope.sql` (+ snapshot): `connector` gains site/approval/credentials/last_error; new `connector_scope_event` + `tracker_snapshot_attempt`; `tracker_snapshot.scope_seq` FK MATCH SIMPLE. table-classes → regenerated RLS/grants/triggers.
- `CredentialsCryptoPort` + `credentialsAesOn` (AES-256-GCM over codec `stringify({ apiKey })`); composition refuses `CREDENTIALS_CRYPTO=kms` naming Epic 8. Config/env generate `CREDENTIALS_KEY` (32-byte base64) + `CREDENTIALS_KEY_ID`.
- Use-cases: `addConnector` / `rotateCredentials` / `changeConnectorScope` on the audited surface (PROJECT_REACH); `gateIngestApproval` / `notifyCredentialFailure` exported from `@momo/app` (off use-cases barrel) with unit coverage. Domain `ApprovalRequiredError` / `requireConnectorApproval` always gates `ingestSnapshot`.
- Connectors page: add form (URL/apiKey/project key/approval + bot recommendation), rotate form, credential-error banner from `last_error_*`; greenfield Projects load without a snapshot; fixture path keeps data-based hours copy and no live key. i18n EN/JA for form/banner/mail subject keys.
- Seed: fixture Connectors pre-approved (`approval_name='fixture'`), initial `connector_scope_event`, snapshots carry that `scope_seq`; no ciphertext for fixture-replay.
- Audit note: `connector.change_scope` payload omits `scope_seq` (global identity seq is not predictable in the write harness); seq still lands on `connector_scope_event` / snapshot column.
- Verified: `pnpm lint`, `typecheck`, `depcruise`, `test` exit 0 (1210 passed / 459 skipped). DB-backed harness skipped without Postgres as before.
- Review fixes: always-on domain approval gate; AES key_id mismatch + empty plaintext refuse; Connectors page loads without snapshot; datetime-local as UTC; i18n mail subject/body; update rowCount checks; rotate mapping-count asserts; action unit tests; DB probe INSERTs include `site`.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence / route |
|---------|---------|------------------|
| Greenfield Connectors page needs snapshot | high | **patch** — `loadBundleInTenant` tolerates no snapshot; Add form renders |
| Domain approval opt-in via `'approvalRecordedAt' in input` | high | **patch** — always `requireConnectorApproval`; field required nullable |
| Empty/invalid approval instant accepted | medium | **patch** — empty string / NaN Date refuse |
| AES decrypt ignores key_id | medium | **patch** — mismatch throws |
| AES encrypt seals empty `{}` | medium | **patch** — refuse neither apiKey nor token |
| datetime-local TZ skew | medium | **patch** — append `Z` when no offset; invalid → invalid_input |
| Hardcoded EN mail; i18n keys dead | medium | **patch** — composition passes `mail.connectorCredentialError` |
| rotate/updateScope/setLastError ignore rowCount | medium | **patch** — require rowCount === 1 |
| rotate unit test never checks mapping count | medium | **patch** — assert count + throw on change |
| Ingest roles untested for viewers | medium | **patch** — viewer not_found cases |
| No connector actions.test.ts | medium | **patch** — added |
| sprint last_updated moved backwards | low | **patch** — set 21:55 |
| Probe INSERTs omit NOT NULL `site` | high | **patch** — tracker/rls tests include site |
| changeConnectorScope has no UI | low | Rejected — set-up appends first scope_event; change use-case audited; UI change deferred as non-everyday |
| Live ingest never calls gate/notify | false | Composition exports + unit path are 5.2 deliverable; scheduler/writer are 5.4/5.5 |
| Mail only acting user / no PM fan-out | medium | **defer** — notifyRecipients port exists; membership fan-out reader not landed |
| Concurrent addConnector race | medium | **defer** — R0 app check; multi-connector overlap is intentional later (FR-42) |
| Bundle meta / attempt persistence untested on Postgres | medium | **defer** — unit + harness mocks; REQUIRE_DB skipped here |
| hasCredentials true with null key_id | low | Rejected — writers always set key_id with ciphertext; not everyday |
| appendSnapshotAttempt returning no seq | low | Rejected — identity insert always returns; complexity > harm |

## Design Notes

- **Ciphertext packing:** AES-256-GCM over JSON `{ apiKey }` (or `{ token }`); store nonce separately; `key_id` column enables offline re-encrypt job later.
- **Decrypt boundary:** only the trusted ingest/adapter composition path may decrypt; use-case list/get never returns secrets.
- **Failed attempt vs snapshot:** attempts are not snapshots; successful ingest still goes through 5.5's writer. This story records refusals/auth failures only.
- **Demo seed:** fixture adapter Connectors are pre-approved with `approval_name = 'fixture'` so existing Review/Mapping demos keep loading.

## Verification

**Commands:**
- `pnpm lint` — exit 0
- `pnpm typecheck` — exit 0
- `pnpm depcruise` — exit 0
- `pnpm test` — exit 0 (including new connector/credentials tests)
