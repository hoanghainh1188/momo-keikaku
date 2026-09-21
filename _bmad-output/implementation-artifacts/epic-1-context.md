# Epic 1 Context: A Tenant, its people, and nothing leaking between them

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Stand up the substrate every later epic writes through, delivered as one capability: a Tenant Admin creates the organisation (Departments, Programs, Projects, PM assignments, Resources and dated Rates), invites PMs, and people sign in and can be revoked — with an automated proof that no read returns another Tenant's data and an audit record for every change to reported numbers or to who can see them. Tenant isolation, the audit trail, exact-integer arithmetic, the application layer and externalised strings cannot be retrofitted, which is why they land first. This is the largest epic, not a warm-up: it creates five of the eight workspace units, the application layer, the auth stack, the worker role and the i18n catalogs, and rewires every existing page onto use cases.

## Stories

- Story 1.1: One command brings the whole system up
- Story 1.2: Nothing crosses a Tenant, and the data layer is what proves it
- Story 1.3: The organisation, and the record of who changed it
- Story 1.4: Sign in, and be revoked
- Story 1.5: Roles decide what each person can reach
- Story 1.6: Resources and the dated Rates behind every money figure
- Story 1.7: The Tenant Admin can read the audit log
- Story 1.8: A load fixture worth measuring against
- Story 1.9: Every string is externalised, and the currency is fixed

## Requirements & Constraints

- **Isolation is proved, not asserted:** a two-Tenant harness exercises every read use case, enumerated mechanically so a new one is covered the day it is written; with the FORCE-RLS catalog assertion it discharges the isolation requirement for the whole product.
- **Org shape:** Tenant › Department › Program › Project. A Project has one owning Department and an optional Program from that same Department. Moving a Project between Programs changes only roll-up, never its history.
- **Roles:** Tenant Admin and PM assignable; Client Viewer and Internal Viewer exist in the enum but are not assignable. Only a Project's PMs or a Tenant Admin edit its Plan or Mappings. Rates: written by Tenant Admins only, visible to them and to PMs of Projects using them. Either role may create Resources.
- **Refusal looks like absence:** anything outside the caller's set answers `not_found`, never `forbidden`.
- **Sign-in:** email + password and Google only (magic link and Microsoft later; SAML/SCIM out of scope). Idle timeout configurable, default 8 h. Revocation and idle expiry take effect on the very next request. Password reset needs mail, so mail is in scope (console locally, SES in production; the AWS account and sender domain are Epic 8's). If the schedule slips, Google sign-in is on the cut list (email + password only).
- **Audit:** the record is written inside the same transaction as the change, with actor, time, previous value and an action from a closed enum; a rollback leaves no row; a test fails if an audited use case commits without one. Only the Tenant Admin reads the log.
- **Rates are bitemporal:** an hour is valued at the Rate in force on its date; a retroactive correction rewrites nothing, and a published figure still reproduces exactly.
- **Load fixture:** deterministic, seed-driven, 5 Projects × 500 Work Packages plus Resources; later epics measure against it, and Epic 5 extends it with Tickets.
- **Localisation:** English UI, every string externalised, an identically keyed Japanese catalog; layouts checked with Japanese 30% longer. Currency JPY, fixed once any Rate exists. PM notes shown as written. No Vietnamese UI.
- **Security floor:** credentials redacted from logs; tracker- and workbook-sourced text always escaped; raw HTML injection is a lint error.

## Technical Decisions

- **Shape:** hexagonal modular monolith. `packages/domain` is pure (zod only); `packages/app` owns use cases, ports, `RequestContext`, authz, audit, config; `packages/db` and `packages/adapters` implement ports; `apps/web` and `apps/worker` call only use cases and i18n. dependency-cruiser enforces imports (reports, does not block merges); ESLint bans `Date.now()`, bare `new Date()` and `process.env` outside the clock adapter and config module.
- **Two named carve-outs.** `packages/db/auth` is the only importer of `better-auth`/`@better-auth/*`: it exports `createAuth({ db, secret, baseURL, idleHours, generateId })` (reads no env), the `IdentityPort` adapter, the web-edge functions (allowlisted route handler, session refresh, sign-in, sign-out) and `hashPassword` for the seed. `apps/web/src/server/composition.ts` is the only web file importing `packages/db` or `packages/adapters`; it builds the one auth instance lazily, resolves `RequestContext`, and exports only use-case and auth bindings. `apps/web` may also import `domain/present/index.ts` (formatters, layout geometry) and nothing else from the domain.
- **Tenancy mechanics:** every tenant-owned table has `tenant_id`, composite FKs, ENABLE + FORCE RLS; the app role is a non-owner without bypass; all access runs in `withTenant`, which sets the tenant through a bound `set_config` (`SET LOCAL` is banned). Cross-tenant `system` work reads only `global`/`operational` tables, then enters `withTenant` per Tenant.
- **Table-class registry** assigns each table one of `append_only`, `mutable_audited`, `derived`, `global`, `operational` and generates RLS, grants and triggers; an unregistered table fails CI. Append-only is enforced by missing grants plus a trigger (only a flagged maintenance role bypasses). Identity tables (`auth_user`, `session`, `account`, `verification`) and `tenant_membership` are `global`. Per-entry exceptions: `appPrivileges` (DML on the four Better Auth tables; SELECT only on `tenant`; **SELECT, UPDATE, DELETE and no INSERT on `tenant_membership`** until invitation adds INSERT) and `tenantBridge` (the one table with `tenant_id` but no RLS).
- **The membership bridge (amended):** `tenant_membership` has one row per `(user_id, tenant_id)` with one `role`. It is read to resolve a Tenant only by `resolveRequestContext` via the `MembershipReader` port (`membershipsOf`), and written on the app role only by `packages/db`'s membership writer (`membershipWriterOn`), called only by audited `packages/app` membership use cases. Every statement names `tenant_id` itself. The writer takes all its locks in one `SELECT … ORDER BY user_id FOR UPDATE` over the Tenant's admin rows plus caller and target, at READ COMMITTED, and takes membership locks before any other row lock. A source-discipline test pins which files may name the table, the reader and the writer; a race test covers concurrent writes.
- **Membership rules:** revocation deletes the membership row and touches no session — the resolver refuses and ends any session whose active Tenant has no membership. A Tenant's last `tenant_admin` can be neither revoked nor demoted. Every membership write re-checks the caller's role against the caller's own locked row. `project_ids` never limits a `tenant_admin` (kept across promotion); for a PM it is exactly the reachable Projects. No product path deletes a user (Better Auth's delete-user endpoint is not allowlisted). Queued jobs acting for a user re-check membership when they run.
- **Sessions:** the session carries an explicit `activeTenantId`, validated against the bridge on every request; Better Auth's cookie cache is disabled; `nextCookies()` is required or cookies are silently never set; middleware refreshes the session on each request (a fast path that can only refuse). `IdentityPort` holds only session read, `setActiveTenant`, `endSession` (plus a `{ userId, email, locale }` lookup when the audit log needs it). Better Auth's own `Date` is a named exception: session expiry is its authority alone and never a compute or audit input; its ids come from the UUIDv7 port. Role, membership, invitation and revocation changes never go through the auth adapter. `auth_user.locale` is persisted, not client-writable.
- **RequestContext** `{ tenantId, userId, roles, projectIds, locale }`, resolved once per render and once per server action; every use case declares allowed roles and checks project membership; the UI never authorises.
- **Audit:** `audit.record(ctx, action, target, payload)` inside the use case's own `withTenant` transaction; closed action enum; `audit_log` append-only; later epics extend the enum and the enumeration test.
- **Arithmetic:** effort is `bigint` milli-hours, money integer JPY, ratios unreduced `{num, den}` compared only through `compareRatio`; `round_half_even` per ledger entry; rounding only in `domain/present`; every jsonb value through one codec (bigint as decimal string), compared in decoded form, never as column text.
- **Watermarks:** appends to watermarked tables take the two-argument `pg_advisory_xact_lock` (1 = Project, 2 = Tenant) before allocating `seq`.
- **Conventions:** use cases return a closed-enum code plus message key; zod at every boundary; app-generated UUIDv7 ids from the `Clock`; `date` for plan dates, UTC `timestamptz` for instants. Fixture-mode clock returns the later of the newest fixture timestamp and an anchor, but never moves session expiry.
- **Config and local run:** one zod config schema fails boot naming the missing key; dev defaults include console mailer and Google sign-in disabled. Postgres 18 volume mounted at `/var/lib/postgresql`; pnpm `allowBuilds`; `"types": ["node"]` where needed; next-intl exported from `proxy.ts`; pg-boss schema migrated by the owner role, started by the app role with auto-migration off.
- **Leave the legacy date columns alone** — Epic 2 drops them and creates the status-event table.

## UX & Interaction Patterns

- Desktop-first (1280px+, supported to 1024px). Admin surfaces this epic builds — Organisation, Resources & Rates, Users, Audit log — are reached from the user menu.
- "Ledger Paper, lighter": hairline rules over cards, one type family (IBM Plex Sans JP), one action colour, tabular right-aligned figures; no gradients or celebratory motion.
- Plain, blame-free microcopy; dates `19 Sep 2026` / `2026/09/19` via Intl in the Project time zone (default JST). Text sorts through one NFKC-normalising comparator.
- WCAG 2.1 AA: never colour alone, real tables, visible focus, landmarks with skip link, reduced motion respected.

## Cross-Story Dependencies

- Strictly ordered. 1.1 precedes all; 1.2 (registry, RLS, `withTenant`, harness, rewiring the direct-db pages before the gate goes on, arithmetic and codec) underpins all data work; 1.3's audit mechanism is used by 1.4–1.7; 1.7 reads what 1.3 writes and first needs the identity lookup.
- 1.4 builds identity, the bridge and request-context resolution that 1.5's role model rests on; until 1.5 lands, membership use cases check `tenant_admin` themselves and answer `not_found`. 1.5 must not treat a Tenant Admin's `projectIds` as a limit. Invitation adds INSERT to the bridge's one writer and grant; how an invitation is accepted before a Tenant is known is decided with that story. 1.4's password reset needs the mail port; SES production setup is Epic 8's.
- 1.6 creates and registers `project_default_rate_entry` (append-only, bitemporal like `rate_entry`); 1.3 creates `program`.
- 1.8's fixture is the single shape for Epic 2's recalculation, Epic 5's snapshot and Epic 6's Review budgets.
- Tenant purge (Epic 8) must remove a Tenant's memberships and decide what happens to users left with none.
