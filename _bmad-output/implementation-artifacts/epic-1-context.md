# Epic 1 Context: A Tenant, its people, and nothing leaking between them

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Stand up the substrate every later epic writes through: a Tenant Admin creates the organisation (Departments, Programs, Projects, PM assignments, Resources and dated Rates), invites PMs, and people sign in and can be revoked — with an automated proof that no read returns another Tenant's data and an audit record for every change to reported numbers or to who can see them. Tenant isolation, the audit trail, exact-integer arithmetic, the application layer and externalised strings cannot be retrofitted, which is why they land first. This epic creates five of the eight workspace units, the auth stack, the worker role and the i18n catalogs, and rewires every existing page onto use cases.

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

- **Isolation is proved, not asserted:** a two-Tenant harness exercises every read use case, enumerated mechanically so a new one is covered the day it is written; with the FORCE-RLS catalog assertion it discharges isolation for the whole product.
- **Org shape:** Tenant › Department › Program › Project. A Project has one owning Department and an optional Program from that same Department. Moving a Project between Programs changes only roll-up, never its history.
- **Roles:** Tenant Admin and PM are assignable; Client Viewer and Internal Viewer exist in the enum but are not assignable in R0. Only a Project's PMs or a Tenant Admin edit its Plan or Mappings. Rates: written by Tenant Admins only, visible to them and to PMs of Projects using them. Either role may create Resources.
- **Refusal looks like absence:** anything outside the caller's set answers `not_found`, never `forbidden`.
- **Sign-in:** email + password and Google only (magic link and Microsoft later; SAML/SCIM out of scope). Idle timeout configurable, default 8 h. Revocation and idle expiry take effect on the very next request. Password reset needs mail, so mail is in scope (console locally, SES in production; AWS account, sender domain and `mailer-ses` are Epic 8's).
- **Google links, never creates:** a Google identity signs in only as an existing user whose verified email equals Google's verified email (`email_verified === true` on a verified id token, and the local user's email verified too); an already-linked Google `sub` signs in as its own user. Provider tokens are not stored. The link grants no Tenant access — membership still decides. Every refusal lands on `/sign-in?google=refused` with one generic message.
- **Password reset creates nothing, and its reply discloses nothing:** one generic sentence for every request; only a user with a credential account is mailed; no user or `account` row is created. A completed reset replaces the password, ends every session of that user, invalidates their other reset tokens, sets `email_verified` and records one identity event. Tokens live one hour and are single-use. A reset keeps provider links.
- **`email_verified` means** the product delivered a single-use token to the address the row holds now and it was redeemed, or the operator seeded the user, or an already-linked provider asserted that exact address as verified. Product writers: the seed, a completed reset, invitation acceptance; nothing sets it at invitation time; any email change sets it false and deletes that user's reset tokens.
- **Audit:** written inside the same transaction as the change, with actor, time, previous value and an action from a closed enum; a rollback leaves no row; a test fails if an audited use case commits without one. Only the Tenant Admin reads the log. Identity events (credential/identity-link changes, no Tenant) go to `identity_event`, which no Tenant-scoped surface reads.
- **Rates are bitemporal:** an hour is valued at the Rate in force on its date; a retroactive correction rewrites nothing, and a published figure still reproduces exactly.
- **Load fixture:** deterministic, seed-driven, 5 Projects × 500 Work Packages plus Resources; later epics measure against it, and Epic 5 extends it with Tickets.
- **Localisation:** English UI, every string externalised, an identically keyed Japanese catalog; layouts checked with Japanese 30% longer. Currency JPY, fixed once any Rate exists. PM notes shown as written. No Vietnamese UI.
- **Security floor:** credentials redacted from logs; tracker- and workbook-sourced text always escaped; raw HTML injection is a lint error.

## Technical Decisions

- **Shape:** hexagonal modular monolith. `packages/domain` is pure (zod only); `packages/app` owns use cases, ports, `RequestContext`, authz, audit, config; `packages/db` and `packages/adapters` implement ports; `apps/web` and `apps/worker` call only use cases and i18n. dependency-cruiser enforces imports; ESLint bans `Date.now()`, bare `new Date()` and `process.env` outside the clock adapter and config module.
- **Two named carve-outs.** `packages/db/auth` is the only importer of `better-auth`/`@better-auth/*`: it exports `createAuth({ db, secret, baseURL, idleHours, generateId, google?, mailer, now, identityEvents })` (reads no env), the `IdentityPort` adapter, the web-edge functions and `hashPassword` for the seed. `apps/web/src/server/composition.ts` is the only web file importing `packages/db` or `packages/adapters`; it lazily builds **two auth instances** from one options value differing only in discovery-fetching providers — one with Google (pages, server actions, route handler) and one without (middleware session refresh) — resolves `RequestContext`, and exports only use-case and auth bindings. `apps/web` may also import `domain/present/index.ts` and nothing else from the domain.
- **Google as one OIDC provider:** a `genericOAuth` provider (`providerId: 'google'`, `disableSignUp`) discovered from its issuer URL — never Better Auth's built-in `socialProviders.google`. HTTP allowlist is tight; Google starts only from a server action. Password reset runs only through two server actions; the mailed link is the product's own `/reset-password?token=…`, sent inline (never through a job).
- **Google config:** `AUTH_GOOGLE=off` by default; `on` requires client id/secret/issuer. Local/CI use the in-repo fake OIDC provider; no `apps/`/`packages/` file may import `tests/support/`. Discovery failure leaves Google unregistered while password sign-in works.
- **Tenancy:** every tenant-owned table has `tenant_id`, composite FKs, ENABLE + FORCE RLS; the app role is a non-owner without bypass; all access runs in `withTenant` via bound `set_config` (`SET LOCAL` is banned). Cross-tenant `system` work reads only `global`/`operational` tables — never the identity tables — then enters `withTenant` per Tenant.
- **Table-class registry** assigns each table one of `append_only`, `mutable_audited`, `derived`, `global`, `operational` and generates RLS, grants and triggers; an unregistered table fails CI. Identity tables, `tenant_membership` and `identity_event` are `global`.
- **Membership bridge:** `tenant_membership` has one row per `(user_id, tenant_id)` with one `role`. Read only by `resolveRequestContext` via `MembershipReader`; written on the app role only by `membershipWriterOn`, called only by audited membership use cases. Last `tenant_admin` can be neither revoked nor demoted. Revocation deletes the membership row; the resolver refuses and ends any session whose active Tenant has no membership. A Tenant Admin's `projectIds` never limit them.
- **Sessions:** explicit `activeTenantId`, validated against the bridge on every request; Better Auth cookie cache disabled; `nextCookies()` required; middleware refreshes on each request. `IdentityPort` holds session read, `setActiveTenant`, `endSession` (plus identity lookup for audit). Role/membership/invitation/revocation never go through the auth adapter.
- **RequestContext** `{ tenantId, userId, roles, projectIds, locale }`, resolved once per render and once per server action; every use case declares allowed roles and checks project membership; the UI never authorises.
- **Audit / identity events:** `audit.record` inside the use case's own `withTenant` transaction; `audit_log` append-only. `identity_event` written only through `identityEventWriterOn`; `at` is wall time even in fixture-clock mode. Membership changes are audited use cases, never identity events.
- **Arithmetic:** effort is `bigint` milli-hours, money integer JPY, ratios unreduced `{num, den}` compared only through `compareRatio`; rounding only in `domain/present`; every jsonb value through one codec.
- **Watermarks:** appends take the two-argument `pg_advisory_xact_lock` (1 = Project, 2 = Tenant) before allocating `seq`.
- **Conventions:** use cases return a closed-enum code plus message key; zod at every boundary; app-generated UUIDv7 ids from the `Clock`; `date` for plan dates, UTC `timestamptz` for instants.
- **Config and local run:** one zod config schema fails at first read naming the missing key; `MAILER` is `console | ses` (`ses` throws until Epic 8); `DEPLOYMENT=local|staging|production` refuses console mailer, fixture clock and fixture tracker outside `local`. Postgres 18 volume at `/var/lib/postgresql`; leave the legacy date columns alone — Epic 2 drops them.

## UX & Interaction Patterns

- Desktop-first (1280px+, supported to 1024px). Admin surfaces — Organisation, Resources & Rates, Users, Audit log — are reached from the user menu.
- "Ledger Paper, lighter": hairline rules over cards, one type family (IBM Plex Sans JP), one action colour, tabular right-aligned figures; no gradients or celebratory motion.
- Plain, blame-free microcopy; dates `19 Sep 2026` / `2026/09/19` via Intl in the Project time zone (default JST). Text sorts through one NFKC-normalising comparator.
- WCAG 2.1 AA: never colour alone, real tables, visible focus, landmarks with skip link, reduced motion respected.

## Cross-Story Dependencies

- Strictly ordered. 1.1 precedes all; 1.2 (registry, RLS, `withTenant`, harness, rewiring direct-db pages, arithmetic and codec) underpins all data work; 1.3's audit mechanism is used by 1.4–1.7; 1.7 reads what 1.3 writes.
- 1.4 builds identity, the bridge and request-context resolution that 1.5's role model rests on; every later use case declares its entry and calls `authorize`. Invitation adds INSERT to the bridge writer; how acceptance works before a Tenant is known is decided with that story. Password reset uses `mailer-console`; `mailer-ses` is Epic 8's.
- Today only the owner-role seed creates `auth_user` rows. Invitation and R1 sign-in methods must each decide under review that no sign-in method creates a user outside invitation. Sign-in/reset rate limiting, verification sweep, provider unlink, and real-Google discovery hardening are Epic 8 deployment blockers.
- 1.6 creates and registers `project_default_rate_entry`; 1.3 creates `program`.
- 1.8's fixture is the single shape for Epic 2's recalculation, Epic 5's snapshot and Epic 6's Review budgets.
- Tenant purge (Epic 8) must remove a Tenant's memberships and decide what happens to users left with none, including their `identity_event` rows.
