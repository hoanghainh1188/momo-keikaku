# Epic 1 Context: A Tenant, its people, and nothing leaking between them

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Build the base layer that every later epic writes through. A Tenant Admin can sign in. The organisation (Departments, Programs, Projects, PM assignments, Resources and their dated Rates) is created through audited use cases that are isolated per Tenant. An automated test proves that no read returns another Tenant's data. Every change to reported numbers, or to who can see them, is written to the audit log. The English UI keeps every string in a catalog, with a Japanese catalog beside it. Isolation, audit, exact-integer arithmetic, the application layer and externalised strings cannot be added later, so they come first. This epic is the largest in R0, not a small setup task: it creates five of the eight workspace units, the auth stack, the worker role and the i18n catalogs, and it rewires every existing page onto use cases. **Scope correction (2026-09-23):** Epic 1 ships no Organisation screens and no read use cases for Departments, Programs, Projects or Resources. The only admin surface is the audit log. Inviting a PM does not exist in R0; the seed creates users and memberships.

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

- **Isolation is proved, not assumed.** A test harness with two Tenants runs every read use case. It finds the use cases automatically, so a new one is covered the day it is written. Together with the FORCE-RLS catalog check, this satisfies isolation for the whole product, and later stories do not repeat it.
- **Organisation shape:** Tenant › Department › Program › Project. A Project has one owning Department and, optionally, one Program from that same Department. Moving a Project between Programs changes only its roll-up. Its Baselines, ledger, Mappings and history stay as they are.
- **Roles:** Tenant Admin and PM can be assigned. Client Viewer and Internal Viewer are in the enum but cannot be assigned in R0. Only a Project's PMs or a Tenant Admin may edit its Plan or Mappings. Either role may create a Resource. Only Tenant Admins write Rates and Project default Rates. Rates are visible only to Tenant Admins and to the PMs of Projects that use them.
- **A refusal looks like absence.** Anything outside the caller's reach answers `not_found`, never `forbidden`.
- **Sign-in:** email + password, and Google. Magic link and Microsoft are R1; SAML and SCIM are out of scope. The idle timeout is configurable, default 8 h. Revocation and idle expiry take effect on the very next request. Password reset needs mail, so mail is R0 work: console in development, SES in production. The AWS account, sender domain and SES production access belong to Epic 8.
- **Audit:** the audit row is written in the same transaction as the change. It records the actor, the time, the previous value, and an action from a closed enum. A rollback leaves no row, and a test fails if an audited use case commits without one. Only a Tenant Admin can read the log. Changes to a user's credentials or identity links carry no Tenant and go to `identity_event`, never to `audit_log`. Membership changes are audited use cases, not identity events.
- **Rates are bitemporal.** An hour is valued at the Rate in force on its date. A retroactive correction rewrites nothing, and a published figure still reproduces exactly.
- **Load fixture:** deterministic and seed-driven, 5 Projects × 500 Work Packages plus Resources. Epics 2, 5 and 6 measure their NFR-P1 budgets against this one fixture. Epic 5 adds the Tickets.
- **Localisation:** English UI with every string externalised, and a Japanese catalog keyed identically. Layouts are checked with Japanese strings 30% longer. The domain returns codes, never prose. The currency is JPY and cannot change once any Rate exists. A PM's notes are shown as written, never machine-translated. There is no Vietnamese UI.
- **Security floor:** credentials are redacted from logs. Text from a tracker or a workbook is always escaped. `dangerouslySetInnerHTML` is a lint error.

## Technical Decisions

- **Shape: a hexagonal modular monolith.**
  - `packages/domain` is pure; its only runtime dependency is `zod`.
  - `packages/app` owns use cases, ports, `RequestContext`, authorisation, audit and config.
  - `packages/db` and `packages/adapters` implement the ports.
  - `apps/web` and `apps/worker` call only use cases and `packages/i18n`.
  - `apps/web` may also import `domain/present/index.ts`, and nothing else from the domain.
  - dependency-cruiser enforces the imports. It turns CI red but cannot block a merge, because the repository is on the free plan.
  - ESLint bans `Date.now()`, bare `new Date()` and `process.env` everywhere except `adapters/clock` and `app/config`.
- **Three named exceptions to the import rules (carve-outs), each a single path:**
  1. `packages/db/auth` is the only importer of `better-auth`. Its `createAuth({...})` factory takes everything as arguments and reads no environment.
  2. `apps/web/src/server/composition.ts` is the only web file that imports `packages/db` or `packages/adapters`. It builds two auth instances lazily, from one options value: one with Google, one without Google for the middleware's session refresh. It exports only use-case bindings, auth bindings and request-context resolution.
  3. `apps/worker/src/index.ts` is the only worker file that imports `packages/adapters`. It selects the `Clock` at boot and exports nothing.
- **Google** is one `genericOAuth` OIDC provider with `disableSignUp`, discovered from its issuer URL, never the built-in `socialProviders.google`. A Google sign-in only links to an existing user; it never creates one. The HTTP allowlist is tight. Google sign-in starts only from a server action. Password reset runs only through two server actions, and the mailed link is the product's own `/reset-password?token=…`. The in-repo fake OIDC provider serves local runs and CI. Nothing under `apps/` or `packages/` may import `tests/` or `scripts/`.
- **Tenancy:**
  - Every tenant-owned table has a `tenant_id`, composite foreign keys, and ENABLE + FORCE RLS. FORCE lives in hand-written `rls.sql`.
  - The app role is not the owner and cannot bypass RLS. All access runs inside `withTenant`, using a bound `set_config`. `SET LOCAL` is banned.
  - Cross-tenant `system` work may read only `global` or `operational` tables, never the identity tables. It then enters `withTenant` for each Tenant.
- **Table-class registry:** `table-classes.ts` gives each table one of five classes: `append_only`, `mutable_audited`, `derived`, `global` or `operational`. RLS, grants and triggers are generated from it, and an unregistered table fails CI. `program` and `project_default_rate_entry` are new tables in this epic. The 17 spike tables are registered, not rebuilt. Leave the legacy date columns alone: Epic 2 drops them.
- **Identity bridge:**
  - `tenant_membership` has one row per user and Tenant, with one role. It is the single exception to FORCE-RLS, flagged `tenantBridge` in the registry.
  - Only `resolveRequestContext` reads it. The application role holds no INSERT on it.
  - The last `tenant_admin` can be neither revoked nor demoted. Revoking a user deletes their membership row, and their next request is refused.
- **Sessions:** the session carries an explicit `activeTenantId`, checked against the bridge on every request. The Better Auth cookie cache is disabled, and `nextCookies()` is required. Role, membership and revocation changes never go through the auth adapter.
- **RequestContext** is `{ tenantId, userId, roles, projectIds, locale }`. It is resolved once per render and once per server action. Every use case declares its allowed roles and checks project membership. The UI never authorises.
- **Arithmetic:** effort is `bigint` milli-hours and money is integer JPY. Ratios are unreduced `{num, den}` pairs, compared only through `compareRatio`. Rounding happens only in `domain/present`. Every jsonb value goes through one codec, and "identical" means identical in its decoded form, never in the column text.
- **Append-only and watermarks:** insert-only tables refuse UPDATE and DELETE twice over, through the grant and through a trigger. Only the `maintenance` role is exempt. An append takes the two-argument `pg_advisory_xact_lock` (namespace 1 = Project, 2 = Tenant) before it allocates a `seq`.
- **Conventions:** use cases return a closed-enum code plus a message key. zod validates every boundary. IDs are UUIDv7, generated by the app. Plan dates use `date`, and instants use UTC `timestamptz`. Mail is rendered by one pure `renderMail(kind, locale, vars)` in `packages/i18n`, so the worker can send mail too.
- **Config and local run:**
  - One zod config schema. A missing key fails when it is first read, and the error names the key.
  - `DEPLOYMENT=local|staging|production`: anything other than `local` refuses the console mailer, the fixture clock and the fixture tracker.
  - `CLOCK_MODE=fixture` returns `max(latest fixture observedAt, FIXTURE_TIME_ANCHOR)`, and the seed uses the same clock.
  - The Postgres 18.6 volume is mounted at `/var/lib/postgresql`.
  - The `migrator` role installs pg-boss's schema. The app role runs pg-boss with auto-migration off.

## UX & Interaction Patterns

- The design is desktop-first: 1280px and up, supported down to 1024px. Admin surfaces are reached from the user menu. In Epic 1 only **Admin: Audit log** (`/admin/audit`), a filterable list, is built. The Organisation and Resources & Rates screens are deferred, and Users/invitation is out of scope for R0.
- The visual style is "Ledger Paper, lighter": hairline rules instead of cards, one type family (IBM Plex Sans JP), one action colour, and tabular right-aligned figures.
- Dates are formatted through Intl in the Project time zone (default JST): `19 Sep 2026` in English, `2026/09/19` in Japanese. Text sorts through one NFKC-normalising comparator.
- The floor is WCAG 2.1 AA: never colour alone, real tables, visible focus, and landmarks with a skip link.

## Cross-Story Dependencies

- **Story 1.1:** its one-command `pnpm dev` (slice B3) waits on Epic 2's story 2.1 migration.
- **Story 1.2:** its watermark slice waits on the writers that Epics 2 and 5 add.
- **Story 1.3:** its audit mechanism is what stories 1.4–1.7 write through. Story 1.7 only reads what 1.3 records.
- **Story 1.8:** its fixture is extended with 2,000 Tickets per Project in Epic 5, and measured against in Epics 2, 5 and 6.
- **Epic 2, story 2.17** delivers the deferred Organisation and Resources & Rates screens. It adds the missing read use cases, each registered in the cross-tenant harness. It also narrows `loadProjectBundle`'s unscoped `resource` and `rate_entry` reads to one Project before any screen shows a Rate.
- **Epic 8** owns SES production access, `mailer-ses`, TLS and encryption at rest.
