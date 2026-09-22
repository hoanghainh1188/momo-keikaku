---
title: 'Story 1.9 — Every string is externalised, and the currency is fixed'
type: 'feature'
created: '2026-09-22'
status: 'done'
baseline_commit: '954182ebab1c61a2a44a98bd09a10ffdd216d794'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-4-password-reset.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** R0 ships hardcoded English in every web surface and reset mail; `packages/i18n` is
empty, so R1 Japanese would be a refactor. Money is integer JPY in the domain, but the Tenant has
no durable currency lock once Rates exist.

**Approach:** Fill `@momo/i18n` with identically keyed `en`/`ja` catalogs (Japanese values are
English-mirrored for key parity), `t` / `renderMail`, and next-intl (cookie from `auth_user.locale`,
no URL prefix). Externalise **every current page**; map `messageKey`s; add `compareNfkc` and
locale-aware `Intl` presenters. Add `tenant.currency` default JPY and refuse changes once any Rate
exists. Automated +30% layout gate covers the **durable shell** only (Project/Client demo gates
deferred).

Founder decisions 2026-09-22: **Split** (defer Project/Client layout gate); UI scope **1-A** (all
pages); `ja` **2-B** (English mirror); currency **3-A** (`tenant.currency` + Rate lock); layout
**4-A** automated on shell.

## Boundaries & Constraints

**Always:**
- Catalogs in `packages/i18n/{en,ja}.json`, dotted keys by feature; web + worker import `@momo/i18n`
  (zero workspace deps inside the package).
- R0 UI renders English. `ja` keys match `en` exactly (mirror values OK); missing key fails CI.
- App returns codes + `messageKey`; web maps keys through the catalog. No prose from domain/app.
- Reset mail via `renderMail` in `auth_user.locale` (fallback `en`); composition injects the
  renderer into `createAuth`. Lifetime stays `RESET_PASSWORD_TOKEN_EXPIRES_IN_SECONDS`; hours param
  keeps the `RESET_LINK_HOURS` pin.
- `domain/text.compareNfkc` (NFKC → code point) for product text sorts. Dates/numbers via `Intl`;
  times in Project TZ (default JST). Money stays integer yen display.
- PM notes shown as written. No Vietnamese locale/catalog.
- `tenant.currency` defaults to `JPY`; any change refused once a `rate_entry` or
  `project_default_rate_entry` exists for that Tenant (migration + writer/test).
- Automated +30% length layout gate for auth, password-reset, admin/audit, no-access, shared chrome.
- UTF-8 no BOM; new probe seq bases ≥ `870_000_000` if any probe lands.

**Never:**
- No Vietnamese. No URL locale prefixes. No client-writable `locale`.
- No `mailer-ses` / invitation / Google / role work. No float or currency-tagged money type.
- No `@momo/app` / `@momo/adapters` imports from `packages/i18n` or `packages/db/auth`.
- No automated +30% gate for Review/Plan/Mapping/Connectors/Baselines/`/c/...` (deferred).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Page render | Any stored locale | English UI from `en` keys | Missing key → CI fail |
| Reset mail | locale `en` or `ja` | Catalog subject/body; link + hours | Unknown locale → `en` |
| Use-case fail | `messageKey` set | UI shows catalog string | Never app prose |
| NFKC sort | Full- vs half-width | Same order via `compareNfkc` | — |
| PM note | Free text | Shown as stored | No translation |
| Currency change | No rates yet | Allow only to `JPY` (or refuse non-JPY) | — |
| Currency change | Any Rate exists | Refuse | Named rule / `invalid_input` |
| Key parity | `en` vs `ja` | Identical key sets | CI fail on drift |
| Shell layout | +30% / `ja` length | Gate passes for shell surfaces | Fail CI on overflow |

</frozen-after-approval>

## Code Map

- `packages/i18n/` — stub; add `en.json`/`ja.json`, `t`, `renderMail`, key-parity test.
- `apps/web` — add `next-intl` + `@momo/i18n`; `middleware.ts` is session-only today; externalise
  all `src/app/**` pages (auth, admin, review, plan, mapping, connectors, baselines, `/c`, home,
  no-access).
- `packages/db/auth/src/reset.ts` + `auth.ts` — hardcoded `resetPasswordMail`; inject renderer.
- `apps/web/.../reset-link-hours.ts` + `tests/web-composition.test.ts` — hours pin.
- `packages/app/src/result.ts` / `apps/web/src/server/result.ts` — `messageKey` exists; web maps
  `code` only today.
- `packages/app/src/authz/request-context.ts` + `schema.ts` `auth_user.locale` — already `en`|`ja`.
- `packages/domain/src/present/index.ts` — `yen` hard-codes `en-US`; add locale path.
- `packages/domain` — no `text/compareNfkc`; replace product `localeCompare` sorts (e.g. `review.ts`).
- `packages/db/src/schema.ts` — `tenant` has no `currency`; rates on `rate_entry` /
  `project_default_rate_entry`; `createProject` always inserts default rate yen 0.
- `.dependency-cruiser.cjs` — add i18n “imports nothing / apps may import i18n” edges.

## Tasks & Acceptance

**Execution:**
- [x] `packages/i18n` — catalogs (ja=en mirror), `t`/`renderMail`, key-parity test
- [x] `apps/web` — next-intl cookie locale; externalise every page; map `messageKey`
- [x] `packages/db/auth` + composition — inject mail renderer; drop hardcoded reset copy
- [x] `packages/domain` — `compareNfkc`; locale-aware present; fix NFR-I1 sort sites
- [x] `packages/db` + app — `tenant.currency` migration; refuse change when any Rate exists; tests
- [x] Shell layout gate — automated +30% check for auth/reset/admin/no-access/chrome
- [x] dep-cruiser + lint/typecheck; HANDOFF / deferred-work / sprint-status; UTF-8 no BOM

**Acceptance Criteria:**
- Given R0 UI, when it renders, then English and every current-page string lives in
  `packages/i18n/{en,ja}.json`, imported by both roles (FR-4, AR-1, NFR-I1).
- Given app errors, when shown, then `messageKey` maps through i18n (AR-19).
- Given `ja`, when shipped, then keys match `en` (FR-4).
- Given shell layouts, when gated, then +30% Japanese length is tolerated (NFR-I1, UX-DR27).
- Given width variants, when sorted, then `compareNfkc` decides (NFR-I1).
- Given dates/numbers, when formatted, then `Intl` + Project TZ default JST (FR-4, UX-DR28).
- Given a PM note, when shown, then as written (FR-4).
- Given Tenant currency, when any Rate exists, then change is refused; default JPY (FR-4, AD-4).
- Given Vietnamese UI, then out of scope (FR-4).

## Implementation Notes

- **2026-09-23 (gap closure):** `changeTenantCurrency` declared in `role-declarations.ts` (`tenant_admin`, not project-scoped); web composition wires `tenantCurrencyOn(webDb())`. `pnpm db:sql` regenerates `grants.sql` (`SELECT, UPDATE` on `tenant`).
- **2026-09-23 (1-A string pass):** All `apps/web` page and shared component user-facing copy (Review, Client, Plan, Mapping, Connectors, Baselines, auth, admin audit, disposition rail, scope ledger, map form, gantt tooltips, shell nav aria) wired through `packages/i18n` with ICU params for dynamic fragments. Domain data (project names, health drivers/rules, PM notes, ticket titles, disposition codes, audit payloads) remains rendered as stored. Automated +30% **layout** gate still applies to shell/auth/admin only — not Review/Plan/Mapping/Connectors/Baselines/`/c/` (founder split 4-A).
- **Locale:** R0 UI forced to `en` in `apps/web/src/i18n/request.ts`; cookie from `auth_user.locale` deferred to R1 wiring.
- **Scripts:** `scripts/build-i18n-catalog.mjs` / `apply-i18n-to-web.mjs` are dev aids, not CI gates.
- **2026-09-23 (review patches):** Purged scraper junk keys and `&apos;` entities in catalogs; auth pages use catalog sent/needsLink/metadata; role chips use `shell.roleLabels`; `compareNfkcNumeric` segment compare; shell gate measures `ja` length/px; audit `invalid_input` via `messageFromKey`; `setCurrency` rowCount guard; `resolveLocale` accepts `ja-*`; `SignOut` label from server; `yen`/`formatReportDate` on web with R0 `en`.

## Spec Change Log

## Review Triage Log

| finding | verdict | evidence | route |
|---------|---------|----------|-------|
| BH: junk scraper keys in catalogs (baselines.w_*, plan.b_finish_false, disposition.setopen_*) | medium | Confirmed in `en.json` — values are JSX/code fragments, not product copy | patch |
| BH: `&apos;` stored in catalog values | medium | Two keys contain literal `&apos;` — `t()` is not JSX | patch |
| BH/EH/VG: forgot-password sent copy still hardcoded | medium | `forgot-password/page.tsx:36-37`; catalog has `auth.forgotPassword.sent.*` | patch |
| BH: reset-password “needs the link” hardcoded | medium | `reset-password/page.tsx:42`; catalog has `needsLink` | patch |
| BH: no-access / auth metadata titles hardcoded | low | Browser tab only; catalog has titles — trivial to wire | patch |
| BH: ROLE_LABELS still hard English | medium | `admin/layout.tsx` map; catalog has `shell.userChip.*` | patch |
| BH: brand key `admin.momo_keikaku` vs `shell.*` | low | Works; namespace inconsistency only; no everyday harm | false |
| BH/EH: cookie locale vs R0 English | false | Frozen Intent: R0 UI is English; Design Notes defer cookie to R1; mail still uses `auth_user.locale` | — |
| BH: dates/numbers Intl incomplete | medium | `yen` accepts locale but call sites omit it; report dates still ad-hoc | patch |
| BH/EH/VG: `compareNfkcNumeric` early-returns lexicographic | high | `compareNfkc.ts:14-17`; test pins lex order `1.02,1.10,1.2` — regresses numeric WBS | patch |
| BH: frozen path `packages/i18n/{en,ja}.json` vs `src/messages/` | false | Fix would edit frozen/spec; runtime path works | — |
| BH: no currency UI / no ALTER migration file | false | Intent locks currency, does not require a settings UI; repo applies schema via `drizzle-kit push` | — |
| BH: SignOut `'use client'` + `useTranslations` | medium | Breaks progressive enhancement claimed in comments | patch |
| BH: sprint-status still `in-progress` while spec `in-review` | low | Tracking drift only | patch |
| EH: currency TOCTOU between hasAnyRate and setCurrency | medium (unverified everyday) | Window only before first Project; no txn lock today | defer |
| EH: setCurrency silent when tenant missing | medium | `repo-tenant-currency.ts` ignores rowCount | patch |
| EH: `ja-JP` / `JA` not resolved to `ja` | low | Exact `=== 'ja'` only; trivial broaden | patch |
| EH/VG: `messageFromKey` unused on audit error path | medium | Only defined + unit-tested; audit uses page-local key | patch |
| VG: shell +30% gate never reads `ja` text | medium | `shell-layout-gate.test.ts` scales `en` only | patch |
| VG: `tenantCurrencyOn` SQL untested | medium | Only mocked use-case tests | patch |
| VG: reset-mail locale from `auth_user` unasserted | medium | password-reset asserts English subject only | patch |

## Design Notes

- `renderMail({ locale, key, params })` stays pure in `@momo/i18n`; composition wraps locale from
  `auth_user` for `createAuth`.
- R0 chrome stays English even if `locale=ja`; locale drives mail and future UI.
- After first Project, a Rate always exists (default yen 0) — currency is locked from then on.

## Verification

**Commands:**
- `pnpm lint` / `pnpm typecheck` / `pnpm depcruise` — exit 0
- Unit: key parity; `compareNfkc`; `renderMail` fallback; messageKey mapping; currency refuse;
  shell +30% layout gate
- Password-reset / web-composition hour pins stay green
