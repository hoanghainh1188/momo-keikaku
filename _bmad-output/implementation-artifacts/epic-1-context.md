# Epic 1 Context: A Tenant, its people, and nothing leaking between them

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Build the base layer that every later epic writes through. A Tenant Admin can sign in. The organisation (Departments, Programs, Projects, PM assignments, Resources and their dated Rates) is created through audited use cases that are isolated per Tenant. An automated test proves that no read returns another Tenant's data. Every action that changes reported numbers, or who can see them, is written to the audit log in the same transaction. The English UI keeps every string in a catalog, with a Japanese catalog beside it. These things cannot be added later, so they come first. This is the largest epic in R0, not a small setup task: it adds the application layer, the auth stack, the worker role, the adapters and the i18n catalogs, and it moves every existing page onto use cases. **What Epic 1 does not ship:** there are no Organisation screens and no read use cases for Departments, Programs, Projects or Resources. Story 2.17 adds them. The only admin screen is the audit log. R0 has no PM invitations; the seed creates users and their memberships.

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

- **Isolation is proved, not assumed.** A harness seeds two Tenants and runs every read use case. It finds the use cases by enumeration, so a new read is covered the day it is written. The harness and the FORCE-RLS catalog check together satisfy isolation for the whole product, so later stories do not repeat it.
- **Organisation:** Tenant › Department › Program › Project. A Project has one owning Department and an optional Program, which must belong to that Department. Moving a Project between Programs changes only its roll-up.
- **Roles:** Tenant Admin and PM can be assigned. Client Viewer and Internal Viewer exist in the enum but cannot be assigned in R0. Only a Project's PMs or a Tenant Admin may edit its Plan or Mappings. Either role may create a Resource, which must have a home Department. Only a Tenant Admin may write a Rate or a Project default Rate. Rates are visible only to Tenant Admins and to the PMs of the Projects that use them. A caller outside their reach gets `not_found`, never `forbidden`.
- **Sign-in:** email + password, and Google. Magic link and Microsoft are R1; SAML and SCIM are out of scope. The idle timeout is configurable, default 8 h. Revocation and idle expiry both take effect on the next request. Password reset needs mail, so mail is R0 work (console in dev, SES in production). SES production access belongs to Epic 8.
- **Audit:** the row is written inside the same `withTenant` transaction as the change. It carries the actor, the time, the previous value, and an action from a closed enum. A test enumerates the audited use cases and fails if any of them commits without writing a row. Only a Tenant Admin can read the log.
- **Rates are bitemporal.** An hour is valued at the Rate in force on its date. A retroactive correction rewrites no ledger entry, and an earlier Published Snapshot still reproduces exactly, because it pinned its own `rate_seq_max`.
- **Load fixture:** 5 Projects × 500 WPs plus Resources, generated deterministically from a seed. Epics 2, 5 and 6 all measure their performance budgets against this one fixture. Epic 5 adds 2,000 Tickets per Project.
- **Localisation:** the UI is English, and every string lives in a catalog. The `ja` catalog uses the same keys as `en`. Layouts are checked with Japanese strings 30% longer than the English ones. The domain returns codes, never prose. Dates and numbers are formatted through `Intl`. Text sorts by code point after NFKC width normalisation. A PM's notes are never machine-translated. The currency is JPY and becomes fixed once any Rate exists. There is no Vietnamese UI.
- **Security floor:** credentials are redacted from logs. Text from a tracker or a workbook is always escaped. `dangerouslySetInnerHTML` is a lint error.

## Technical Decisions

- **Shape:** a hexagonal modular monolith. `packages/domain` is pure, and `zod` is its only runtime dependency. `packages/app` holds use cases, ports, `RequestContext`, authorisation, audit and config. `packages/db` and `packages/adapters` implement the ports. `apps/web` and `apps/worker` call only use cases and `packages/i18n`. dependency-cruiser enforces this. It was switched on only after the pages were moved onto use cases. `Date.now()`, bare `new Date()` and `process.env` are banned outside `adapters/clock` and `app/config`.
- **Tenancy:** every tenant-owned table has `tenant_id NOT NULL` and ENABLE + FORCE RLS, with FORCE in hand-written `rls.sql`. The app role is not the table owner and has no BYPASSRLS. All access runs through `withTenant`, which sets the Tenant with a bound `set_config`; `SET LOCAL` is banned. **Composite `tenant_id` foreign keys were never built in Epic 1.** Story 2.1 adds them (`MATCH FULL`) to the tables that already exist.
- **Table-class registry:** `table-classes.ts` gives every table one of five classes: `append_only`, `mutable_audited`, `derived`, `global` or `operational`. RLS, grants and triggers are generated from the registry, and CI fails on a table it does not list. Epic 1 creates only `program` and `project_default_rate_entry`. Every other event table belongs to the epic whose story first needs it.
- **Append-only:** UPDATE and DELETE are refused twice, by the missing grant and by a trigger. Only the `maintenance` role is exempt. Every append takes the two-argument `pg_advisory_xact_lock` (namespace 1 = Project, 2 = Tenant) **before** it allocates a `seq`, because Postgres assigns `seq` at INSERT and not at COMMIT. `ComputationInputs` capture uses the shared form of the lock.
- **Identity:** Better Auth's tables are class `global`. They are reached only through `IdentityPort` in `packages/db/auth`. `tenant_membership` is the single non-RLS bridge, and only `resolveRequestContext` reads it. The app role cannot INSERT into it, which is why there is no invitation. The session carries an explicit `activeTenantId`, which is checked on every request. The cookie cache is disabled, and `nextCookies()` is required. Revocation and role changes are audited `app` use cases, never writes through the auth adapter. The last Tenant Admin can be neither revoked nor demoted.
- **Arithmetic:** effort is `bigint` milli-hours and money is integer JPY. Ratios are unreduced `{num, den}` pairs, compared only in `compareRatio`. Rounding happens only in `domain/present`. Every jsonb value goes through one codec, so "identical" means the same decoded value, never the same column text.
- **Clock and local run:** `CLOCK_MODE=fixture` returns `max(latest fixture observedAt, FIXTURE_TIME_ANCHOR)`, and the seed reads the same clock. A missing config key fails the zod config schema, and the error names the key. The Postgres 18.6 volume mounts at `/var/lib/postgresql`. The `migrator` role installs pg-boss's schema, and the app role starts pg-boss with auto-migration off. pnpm `allowBuilds` and `"types": ["node"]` handle the pnpm 12 and TypeScript 6 defaults.

## UX & Interaction Patterns

- Epic 1 builds only one admin surface: **Admin: Audit log** (`/admin/audit`), a filterable list of actor, time and action.
- Every string comes from a catalog. Dates are shown in the Project time zone (default JST): `19 Sep 2026` in English, `2026/09/19` in Japanese.
- WCAG 2.1 AA is the floor: never colour alone, real tables, visible focus, and landmarks with a skip link.

## Cross-Story Dependencies

- **Story 1.1** stays open for slice B3 (`pnpm dev` in one command). B3 waited on story 2.1's migration, which is now merged, so B3 is unblocked.
- **Story 1.3's** audit mechanism is what stories 1.4–1.7 write through. Story 1.7 only reads it.
- **Story 1.8's** fixture is extended with Tickets in Epic 5.
- **Story 2.1** pays the composite foreign keys that story 1.2 promised. **Story 2.17** adds the Organisation and Resources & Rates screens and their read use cases. Each read must be registered in the cross-tenant harness; `program` is still declared unreached until then. Story 2.17 also narrows `loadProjectBundle`'s Tenant-wide `resource`/`rate_entry` reads to one Project.
- **Epic 8** owns SES production access, TLS, and encryption at rest.
