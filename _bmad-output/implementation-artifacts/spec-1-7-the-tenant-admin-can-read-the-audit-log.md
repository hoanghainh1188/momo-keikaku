---
title: 'Story 1.7 — The Tenant Admin can read the audit log'
type: 'feature'
created: '2026-09-22'
status: 'done'
baseline_commit: 'ef46e2ad74d94be324f6138269564c60c8910b58'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-3-audit-mechanism.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-6-resources-and-the-dated-rates-behind-every-money-figure.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `audit_log` is written by every NFR-A1 use case and by the seed, but nothing in the
product reads it — a Tenant Admin cannot answer "who changed this, and when", the cross-tenant
harness still lists `audit_log` as unreached, and payload decode schemas live only in the write
harness.

**Approach:** Add a Tenant-Admin-only read use case that lists (and filters) the Tenant's
`audit_log` rows, wire a filterable Audit log surface from the user menu, move payload decode
schemas next to `AUDIT_ACTIONS`, extend IdentityPort so actors and the top bar resolve to
email/name, and land the NFR-S2 / NFR-S8 floor (pino redaction + `dangerouslySetInnerHTML` lint).

Decided by the founder on 2026-09-22: **Keep full spec.** Filters = action + actor + date range
on `at`. Actor display resolves to email via IdentityPort; top bar shows the signed-in user's
name (closes deferred L590). Rows show target + decoded payload. Non-enum actions (e.g. seed
`demo.seed`) remain visible as opaque strings.

## Boundaries & Constraints

**Always:**
- One new read use case, `tenant_admin` only, `projectScoped: false`; runner calls `authorize`
  before parse; entry in `role-declarations.ts` + `USE_CASE_ROLES` snapshot; export from
  `use-cases/index.ts` so the READ harness enumerates it the day it lands.
- Refusal for any non–Tenant Admin is `not_found` (FR-2), never `forbidden`.
- Read runs inside `withTenant`; remove `audit_log` from `UNREACHED_TENANT_OWNED_TABLES` or the
  reach assertion fails.
- Filters: optional `action` (enum member), optional `actor` (exact match on stored actor string),
  optional `from`/`to` inclusive bounds on `at`.
- Each visible row shows actor (resolved email when the id is known, else the raw `actor` string),
  time (`at`), action, `target`, and decoded payload. Enum members type as `AuditAction`; unknown
  actions stay opaque strings and still render. Payload decode schemas live in
  `packages/app/src/audit/`; the write harness imports them (closes deferred L427–491).
- IdentityPort gains a `{ userId, email, locale }` lookup (AD-23 first reader). Audit page uses it
  for actors; the top-bar user chip shows name (or email if no name) beside role — closes deferred
  L590.
- UI is reached from the user menu (Tenant Admin), per EXPERIENCE.md — not the Project sidebar.
  React text only; no raw HTML.
- `pino` redaction covers `*.apiKey`, `*.token`, `*.password`, `*.clientSecret`, `*.idToken` and
  `authorization` (AD-16 / NFR-S2). `dangerouslySetInnerHTML` is an ESLint error (NFR-S8).
- New Postgres probe Tenants use a seq base of `850_000_000` or higher. Files UTF-8 without BOM.

**Never:**
- No read of `identity_event` on any Tenant-scoped surface (spine / AD-14).
- No change to how writes call `audit.record`; no new audit actions; no schema / grant rewrite of
  `audit_log` beyond what the reader needs (keep SELECT+INSERT).
- No Organisation / Resources / Users admin pages this story — only the Audit log surface.
- No invitation, password-reset, or Google work; no i18n catalog (story 1.9) — inline English is fine.
- No free-text / full-text search over the log. No push.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Admin lists log | Tenant Admin; own Tenant has rows | Rows with actor email, time, action, target, decoded payload | — |
| Admin filters | action and/or actor and/or from–to | Only matching rows of own Tenant | — |
| PM / viewer requests | Non–Tenant Admin context | `not_found`; no rows returned | before parse |
| Cross-Tenant | Admin of A; rows exist only in B | Empty for A; never B's rows (harness) | RLS + withTenant |
| Seed / non-enum action | Row with `demo.seed` | Visible; action shown as opaque string; payload best-effort decode or raw | — |
| Unknown actor id | `user:<id>` with no auth_user row | Show raw `actor` string | — |
| Top bar | Signed-in Admin or PM | Chip shows name (or email) · role | — |

</frozen-after-approval>

## Code Map

- `packages/db/src/schema.ts:384-392` — `auditLog` (`seq`, `tenant_id`, `actor`, `action`,
  `target`, `payload`, `at`). Do not reshape; reader SELECTs these columns.
- `packages/db/src/table-classes.ts:268-279` + `sql/grants.sql` — append-only SELECT+INSERT; leave
  grants. RLS already Tenant-scoped (`sql/rls.sql:231-238`).
- `packages/db/src/audit-sink.ts` — sole writer; do not change. New reader: a small
  `packages/db/src/repo-audit.ts` (or equivalent) used only through a port.
- `packages/app/src/audit/index.ts:30-59` — `AUDIT_ACTIONS` / `audit.record`. Add payload zod
  schemas (+ optional `AuditAction → schema` map) here; move union out of
  `tests/write-harness.ts:282-322`.
- `packages/app/src/use-cases/role-declarations.ts` — add `adminOnly` entry for the new read
  (mirror org writes' shape). Update `tests/role-declarations.test.ts` snapshot /
  `WELL_FORMED_INPUT` if the gate requires it for non-projectScoped reads.
- `packages/app/src/authz/authorize.ts` — reuse `TENANT_ADMIN_ROLES`; no project id.
- `packages/app/src/ports/identity.ts` — today session only. Extend with a `{ userId, email,
  locale }` (and name if the auth_user row has one) lookup; `packages/db/auth` implements it.
  Top bar and audit actor resolution both consume it.
- `packages/app/src/use-cases/index.ts` — export the new read so `readSurfaceFunctionNames` sees it.
- `tests/read-use-cases.ts:714-720` — remove `audit_log` from `UNREACHED_TENANT_OWNED_TABLES`; add
  `kind: 'read'` entry with `adminContextOf` / `mustSurface` naming `audit_log`.
- `tests/cross-tenant.test.ts` — reach assertion will fail until the above is done.
- `apps/web/src/components/shell.tsx:59` — replace role-only `userchip` with name/email · role and
  a user-menu link to the Audit log for Tenant Admins (EXPERIENCE.md:51). No Project-sidebar entry.
- `apps/web/src/server/composition.ts` — bind the new read port; no page-level authz.
- `apps/web` — new route under an admin path (agent picks `/admin/audit` unless contradicted);
  server component loads via use case; table UI, Ledger-Paper lighter.
- `eslint.config.js` — today clock/env/tenant/AD-4 only; add `dangerouslySetInnerHTML` ban
  (spine AD-16 / NFR-S8). Introduce `pino` (pinned 10.3.1 in spine) with the AD-16 redact paths —
  worker still notes there is no logger port (`apps/worker/src/index.ts:19`); land a shared logger
  module the story's AC can point at, even if few call sites exist yet.
- Continuity: story 1.6 probe bases through `840_000_000` — use `≥ 850_000_000`. Deferred anchors:
  L268–270 (unreached), L427–430 / L489–491 (payload schemas), L590–592 (identity lookup — Q2).

## Tasks & Acceptance

**Execution:**
- [x] `packages/app/src/audit/` — payload decode schemas (+ action→schema map if cheap); harness
  imports from here — deferred L427–491
- [x] `packages/app` + `packages/db` — audit-log read port, use case (filters: action/actor/from/to),
  role declaration, export — FR-2, NFR-A1, AD-12
- [x] `packages/app` + `packages/db/auth` — IdentityPort `{userId,email,locale[,name]}` lookup;
  top-bar chip + audit actor resolution — closes deferred L590
- [x] `tests/read-use-cases.ts` + harness — register read; drop `audit_log` from UNREACHED —
  FR-1 isolation proof
- [x] `apps/web` — user-menu → `/admin/audit`; filters + columns (actor email, time, action,
  target, payload) — UX Admin: Audit log
- [x] `pino` redaction module + ESLint `dangerouslySetInnerHTML` ban — NFR-S2, NFR-S8, AR-29
- [x] Unit + Postgres suites (probe `≥ 850_000_000`): I/O matrix, role gate, cross-tenant empty,
  non-enum row visible — FR-2
- [x] `HANDOFF.md` / `deferred-work.md` / `sprint-status.yaml` — record land; UTF-8 no BOM

**Acceptance Criteria:**
- Given audit rows from story 1.3's mechanism, when a Tenant Admin opens the audit log, then they
  can filter by action, actor and date range, and each row shows actor (email when known), time,
  action, target and decoded payload (NFR-A1).
- Given a user who is not a Tenant Admin, when they request the audit log, then the answer is
  `not_found` (FR-2).
- Given the log (and the logger), when rendered / logged, then no Tracker credential appears, and
  pino redaction covers `*.apiKey`, `*.token`, `*.password` and `authorization` (NFR-S2, AR-29).
- Given any displayed text, when checked, then React escaping is the path and
  `dangerouslySetInnerHTML` is a lint error (NFR-S8, AR-29).
- Given a signed-in user, when the top bar renders, then it shows their name (or email) and role.

## Implementation Notes

- **Read use case.** `listAuditLog` (`packages/app/src/use-cases/list-audit-log.ts`):
  `authorize` with `TENANT_ADMIN_ROLES` before parse; optional filters `action` (enum member only),
  `actor` (exact stored string), `from`/`to` inclusive on `at`. Non-enum rows (seed `demo.seed`)
  still list; filtering *by* a non-enum action is `invalid_input`. Export + `adminOnly` role
  declaration; harness entry uses `adminContextOf` / `mustSurface: auditLogLabels` with
  `crossTenant: 'own-tenant-ok'`.
- **Port + repo.** `AuditLogReadPort` / `repo-audit.ts` `listAuditLog` inside `withTenant`;
  newest-first by `seq`. Sink unchanged. `audit_log` removed from `UNREACHED_TENANT_OWNED_TABLES`
  (remaining unreached: `program`, `project_default_rate_entry`).
- **Payloads.** `packages/app/src/audit/payloads.ts` — union + `AUDIT_PAYLOAD_BY_ACTION` +
  `decodeAuditPayload`; write harness imports the union. Typed `record` overloads deferred
  (map documents shapes only).
- **Identity.** `IdentityPort.lookupUser` → `{ userId, email, locale, name }` via `lookupUserOn`
  on `auth_user`. Top bar via `apps/web/src/lib/user-chip.ts` (`userLabelFromIdentity` /
  `formatUserChip`) shows name-or-email · role; audit actors resolve email when `user:<id>` is
  known, else raw stamp.
- **UI.** `/admin/audit` under a thin admin layout (no Project sidebar). User-menu link for
  Tenant Admins only. Filter form + real table; payload rendered via React text helper (no
  `JSON.stringify`, no HTML). Placeholder / filter construction avoid the web-composition
  `user:` / `actor:` source fence.
- **Security floor.** `createLogger` + `PINO_REDACT_PATHS` in `packages/app` (pino 10.3.1);
  worker uses it for pg-boss events. ESLint `dangerouslySetInnerHTML` ban + planted-file lint
  test.
- **Probes.** Unit `list-audit-log.test.ts` + `logger.test.ts`; Postgres `tests/audit-log.test.ts`
  bases `850_000_000` / `860_000_000`. Cross-tenant harness green with `REQUIRE_DB=1`.
- **Surprise.** Logger landed in `packages/app` (not adapters) so the worker can import it without
  opening the adapters composition-root carve-out. Pino's `*.apiKey` alone does not redact a
  top-level `apiKey` — bare paths were added beside the wildcards.
- **Review patches (2026-09-22).** `createLogger` merges array/object `redact` with
  `PINO_REDACT_PATHS` + censor; redaction test drives `createLogger` with a capture stream.
  `listAuditLog` refuses `from > to`; unit asserts `from`/`to` Dates on the port call; noop
  `isAuditAction` ternary removed. `/admin/audit` parses `datetime-local` as Asia/Tokyo; keeps
  the form on `invalid_input` (404 only for `not_found`). Postgres suite asserts newest-first
  seq, action filter shrinks, and `lookupUserOn` / `actorDisplay` email on a `user:<id>` row.
  `UserChip` test covers `audit-log-link` present/absent.
- **Review patches round 2 (2026-09-22).** `tests/web-composition.test.ts` wires `lookupUserOn` on
  the `@momo/db-auth` mock and asserts `composition.listAuditLog` reaches repo list + identity
  lookup. Postgres suite asserts actor exact-match and inclusive `from`/`to` windows. Deferred
  L268 marked YES (both halves closed). HANDOFF Latest aligned to `in-review` / sprint
  `in-progress` until step-05.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence / route |
|---|---|---|
| Blind: unbounded list / no limit | medium | Real — repo returns all matching rows. Spec never required a page size; R0 seed is small. **defer** (entry already in deferred-work) |
| Blind / Edge: datetime-local TZ vs Asia/Tokyo When | false | carried — `toIsoInstant` / `toLocalInput` treat wall time as Asia/Tokyo (UTC+9). |
| Blind / Edge: `from > to` → empty | low | carried — zod refine + unit refuse `invalid_input`. |
| Blind: `invalid_input` → 404 | false | carried — page keeps form + filter error; only `not_found` → `notFound()`. |
| Blind: actor filter is stamp not email | false | Frozen Always: exact match on stored `actor` string. |
| Blind: `AUDIT_PAYLOAD_BY_ACTION` unused by decode | false | Document map; typed `record` deferred (L489). |
| Blind: HANDOFF / sprint status inconsistency | false | carried — HANDOFF `in-review`; sprint `in-progress` until step-05. |
| Blind: edit this build's spec / AC vs AD-16 list | false | Reject / logger exceeds epic AC wording intentionally. |
| Gap: `createLogger` test never calls factory | medium | carried — drive `createLogger` + array-redact merge case. |
| Edge: array `redact` drops AD-16 paths | medium | carried — `mergeRedact` unions paths. |
| Gap: composition `listAuditLog` never invoked | medium | **patch** round 2 — describe asserts repo list + `lookupUserOn`. |
| Gap: Postgres lacks actor / from–to filters | medium | **patch** round 2 — actor stamp + inclusive window cases. |
| Blind: UserChip a11y / empty-state / ROLE_LABELS dup / Admin chrome | low/false | Reject or false — unlikely everyday / spec says use-case authz. |
| Blind: noop `isAuditAction` ternary | low | carried — `action: row.action` only. |
| Gap: unit from/to, lookupUserOn, showAuditLog | medium | carried — unit Dates, Postgres email, UserChip link tests. |
| Blind: formatPayload no credential redact | false | Credentials never land in `audit_log` payloads. |
| Blind: deferred L268 still PARTIAL | low | **patch** round 2 — marked YES. |
| Edge: lookupUser throw / unparseable → 404 | low/false | Reject / false — null on miss; invalid dates → form error. |

## Design Notes

This is the first Tenant Admin **read** surface and the first admin route. Keep it thin: one use
case, one page, no inventing Organisation/Users. Payload schemas belong beside the enum because
both `record` and the reader must agree; a full typed `record` overload can wait if the map alone
unblocks decode.

`identity_event` stays unread here even though an older deferred note called 1.7 a "natural
owner" — the spine and the identity-reset review assign forensic reads to an operator surface.

## Verification

**Commands:**
- `pnpm lint` / `pnpm typecheck` / `pnpm depcruise` — exit 0; new eslint rule trips on a planted
  `dangerouslySetInnerHTML`
- `pnpm exec vitest run packages/app tests/role-declarations.test.ts tests/write-harness` (or the
  suites that import payload schemas) — green; snapshot updated deliberately
- `REQUIRE_DB=1` Postgres suites for the new probe file(s) — I/O matrix + cross-tenant
- Sabotage: strip pre-parse `authorize` from the reader — role gate / unit role cases fail naming
  it; restore
- Confirm `audit_log` absent from `UNREACHED_TENANT_OWNED_TABLES` and present in measured reach
