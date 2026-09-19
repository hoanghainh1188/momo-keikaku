---
review: tech-currency
target: ../ARCHITECTURE-SPINE.md
lens: "Every committed decision web-researched or reality-checked, not asserted from training data: versions, existence/fit, live starter defaults."
date: 2026-09-20
verdict: PASS WITH FIXES
---

# Tech-Currency Review: momo-keikaku Architecture Spine

## Verdict

**PASS WITH FIXES.** I re-checked every version in the Stack table against the npm registry today, and all of them are current `latest` (see the table below). Nothing named in the spine is dead or out of date. The weak spots are claims about fit and behaviour that the memlog records as decisions but never checked against live docs. Two of them are correctness risks: pg-boss "singleton" semantics and Backlog offset pagination. Four more are live defaults that will break or surprise the first `pnpm dev`: the Postgres 18 image volume path, pnpm 12 build-script blocking, the `SET LOCAL` parameter style, and TypeScript 6 defaults. None of these need an AD to be rewritten. Each needs a sentence or two added to the AD's rule.

## Verified today (2026-09-20)

| Item | Spine | Registry / source today | Status |
| --- | --- | --- | --- |
| next | 16.3.5 | latest 16.3.5 (2026-09-11), engines node >=20.9 | OK |
| react | 19.3.0 | latest 19.3.0 (2026-09-09) | OK |
| drizzle-orm / drizzle-kit | 0.45.2 / 0.31.10 | latest; **1.0.0-rc.5 on `rc` tag** | OK, but see F3 |
| pg | 8.23.0 | latest | OK |
| pg-boss | 12.33.2 | latest (2026-09-18), node >=22.12 | OK, but see F1 |
| better-auth (+ @better-auth/drizzle-adapter) | 1.7.5 | latest; peers `next ^16`, `drizzle-orm ^0.45.2`, `drizzle-kit >=0.31.4`, `vitest ^5` | OK, fit confirmed |
| next-intl | 4.14.5 | latest; peer `next ^16` | OK, see F7 |
| exceljs | 4.4.0 | latest; published 2023-10-19; only a 4.4.1-prerelease since (2024-12) | Stale, see F6 |
| zod / pino / tsx / dependency-cruiser | 4.6.5 / 10.3.1 / 4.23.13 / 18.3.1 | all latest; dep-cruiser engines `^22‖^24‖>=26` | OK |
| vitest | 5.0.1 | latest (published 2026-09-15, a 5-day-old major); peer `vite ^6.4‖^7‖^8` | OK, see F7 |
| @playwright/test | 1.63.0 | latest | OK |
| TypeScript | 6.0.3 (not 7.0.2) | latest is 7.0.2; typescript-eslint 8.70 caps `typescript <6.1.0`; Next 16.3 type-checks on TS ^6.0.3 through the JS API with no flags | **Pin is correct**, see F7 |
| pnpm | 12.4.2 | latest (2026-09-15); a native (Rust) binary; installing via npm needs Node >=22.13 | Exists, see F5 |
| Node.js | 24.21.0 "Krypton" | nodejs.org index: v24.21.0 LTS, 2026-09-07 | OK. Node 26 becomes LTS in Oct 2026; staying on 24 is fine (maintenance until Apr 2028) |
| PostgreSQL | 18.6 (docker + RDS) | Docker Hub tag `18.6` exists; RDS PG 18 GA since 2025-11-14; RDS release notes list 18.6 | OK, see F4 |
| ECS Fargate / RDS / S3 / Secrets Manager in ap-northeast-1 | assumed | Long-standing Tokyo services; RDS PG 18 has no regional restriction listed | OK |
| SES in Tokyo | assumed | AWS endpoints page lists `email.ap-northeast-1.amazonaws.com` and SMTP `email-smtp.ap-northeast-1` | OK; default quota is sandbox, 200/day and 1/s |
| All pinned versions older than pnpm's 1-day `minimumReleaseAge` | n/a | Every pin was published at least 2 days ago | OK |

## Findings

### F1 (HIGH): the pg-boss "one snapshot in flight per Connector" claim relies on the wrong mechanism (AD-7, AD-15)

- **Claim:** "One snapshot per Connector is in flight at a time (pg-boss `singletonKey = connectorId`)."
- **Reality (pgboss.io, today):** Since v10, `singletonKey` by itself on a `standard` queue only extends *throttling* ("one job per key within the time slot", used with `singletonSeconds`). It does not stop two jobs with the same key from being active at once. The live docs say a key is "only guaranteed unique per state under the `short` and `stately` policies". Only-one-active needs the queue to be *created* with a policy:
  - `singleton`: 1 active, unlimited queued
  - `stately`: 1 queued plus 1 active
  - `exclusive`: 1 queued-or-active

  Each of these is extended per `singletonKey`.
- **Also unverified:** pg-boss creates and migrates its own schema on `start()`. That conflicts with AD-3's "the app connects as a non-owner role". If the app role has no `CREATE` on the database or schema, the worker's first boot fails.
- **Fix:**
  1. Rewrite the AD-7 bullet as: "`ingest-snapshot` queue created via `createQueue(name, { policy: 'stately' })`, jobs sent with `singletonKey = connectorId`". `stately` fits best: one queued on-demand request coalesces behind the running one, and the rest are dropped.
  2. Add to AD-17: the pg-boss schema is installed and migrated by the maintenance/owner role during `migrate`, and the app role runs pg-boss with auto-migration off and only DML grants on the `pgboss` schema. Check the exact constructor option name (`migrate`/`schema`) against the v12 constructor docs in the first spike.
  3. AD-15: cron can't express the "JP or VN working day" calendar. Say explicitly that schedules are an hourly `schedule(name, '0 * * * *', data, { tz: 'Asia/Tokyo' })` tick, and that the handler decides hourly vs 6-hourly through `domain/calendar`. Use `missed: 'skip'` so the worker doesn't catch up on missed ticks after an outage.

### F2 (HIGH): a full Backlog read with offset pagination can silently skip Tickets and falsely mark them `left_scope` (AD-6, AD-7)

- **Claim:** "about 20 Get Issue List calls per 2,000 Tickets, paced by the `X-RateLimit-*` headers", and "only a complete read can mark `left_scope`".
- **Reality (developer.nulab.com, today):**
  - Get Issue List takes `count` 1–100 plus `offset`. The default is `sort=updated`, `order=desc`.
  - Get Issue List counts against the **Search** bucket. The Get Rate Limit example shows search 150/min against read 600/min, and the limits depend on the plan (lower on Free).
  - Limits apply per API user, so any other integration using the same key shares the headroom.
  - A 429 is returned when the limit is exceeded.
- **The problem:** With the default sort, any Ticket updated during the ~20-page read jumps to page 1 and shifts every later page. One or more Tickets are then never seen, yet the read still "completes". AD-7 would record a false `left_scope` and possibly an `opening_balance` when the Ticket reappears. The memlog verified only the rate-limit headers and the page size, not ordering stability.
- **Fix:**
  1. Specify `sort=created&order=asc`. New Tickets append at the end, and existing positions are stable apart from deletions.
  2. Define `complete` as "the union of pages has distinct ids, and its size equals Count Issue (same filter) taken before and after the read". Otherwise retry once, then record a failed attempt.
  3. At Connector setup, call Get Rate Limit and store the Search limit. Refuse or slow the schedule if the Search budget per snapshot exceeds a fraction of it, for example 25%.
  4. Add a "ticket updated mid-read" scenario to `fixtures/backlog`.

### F3 (MEDIUM): the RLS `SET LOCAL` pattern as written can't take a bind parameter; FORCE RLS isn't emitted by Drizzle; Drizzle 1.0 is at RC (AD-3)

- **`SET LOCAL`:** `SET LOCAL app.tenant_id = $1` is not parameterizable in Postgres, and interpolating the value into the string is an injection foot-gun. Drizzle's own RLS docs use `set_config(..., TRUE)`.
  - Fix: `withTenant` runs `select set_config('app.tenant_id', $1, true)` with a bound uuid.
  - Policies use `NULLIF(current_setting('app.tenant_id', true), '')::uuid`, so an unset variable yields no rows instead of a 42704 error. The system path gets predictable behaviour this way.
  - This is transaction-scoped, so it is safe with a `pg` Pool, provided every query runs inside the `withTenant` transaction. Add a lint or test that bans the bare `db` on tenant tables.
- **FORCE RLS:** Drizzle 0.45's `pgPolicy`/`enableRLS` don't emit `FORCE ROW LEVEL SECURITY`. The spine already keeps a separate `rls.sql`. State that FORCE lives there, and add a CI assertion over `pg_class.relforcerowsecurity` for every table with `tenant_id`.
- **Drizzle 1.0:** `drizzle-orm@1.0.0-rc.5` is on the `rc` tag, and Better Auth's peer range already accepts `>=1.0.0-rc.1`. A GA could land mid-build and bring RLS, RQB and migrator changes.
  - Fix: pin exact `0.45.2` / `0.31.10` (no caret), and add "upgrade to Drizzle 1.x after R0" to Deferred.

### F4 (MEDIUM): the Postgres 18 Docker image changed its data path, and the local tag floats (AD-17, local diagram)

- **Reality (Docker Hub, today):** From 18 onward, `PGDATA=/var/lib/postgresql/18/docker` and the image `VOLUME` is `/var/lib/postgresql`. The common `volumes: - pgdata:/var/lib/postgresql/data` mount is silently ignored, and data is lost on `docker compose down`.
- **Tag drift:** The spine writes `postgres:18` in AD-17 and the diagram but pins 18.6 in the Stack table.
- **Fix:**
  - Compose uses `image: postgres:18.6` and mounts `pgdata:/var/lib/postgresql`.
  - Pin RDS `engine_version = 18.6` (confirmed available), so local and production minors match.
  - Optional: since PG 18 has a native `uuidv7()`, say the app-generated UUIDv7 is deliberate (the IDs are needed before insert for idempotent ingest).

### F5 (MEDIUM): pnpm 12 live defaults will fail the first install (AD-17)

- **Reality (pnpm.io 11.0/12.0 release notes):**
  - pnpm 12 is a native Rust binary.
  - The defaults inherited from 11 are `strictDepBuilds: true` (build scripts fail unless listed in `allowBuilds`), `minimumReleaseAge: 1440` (1 day), `blockExoticSubdeps: true` and `verifyDepsBeforeRun: install`.
  - Unknown `pnpm-workspace.yaml` keys fail when a pnpm version is pinned. `onlyBuiltDependencies` and similar settings are gone.
  - This stack pulls in postinstall builds: `esbuild` via tsx, vite/vitest and drizzle-kit; `sharp` via next; and the Playwright browsers.
- **Fix:**
  - AD-17 gains a line: `packageManager: "pnpm@12.4.2"` in the root `package.json`, and `pnpm-workspace.yaml` declares `allowBuilds` for the exact build-script packages (settle the list in the first `pnpm install`).
  - Keep the 1-day release-age gate. It is a free supply-chain control, and every current pin already clears it.
  - The Dockerfile installs the pnpm binary, not `npm i -g pnpm` (that route needs Node >=22.13, which 24 satisfies anyway).

### F6 (MEDIUM): the ExcelJS capability and the SheetJS fallback are asserted, not checked (AD-13, Open Questions)

- **ExcelJS:** 4.4.0 is still `latest`, published 2023-10-19, with only a 4.4.1 prerelease (2024-12) since. The spine says it reads "cell values, cached formula results and merge ranges".
  - In the non-streaming API that is plausible: formula cells come back as `{formula, result}` or `{sharedFormula, result}`, and merges as `cell.isMerged`/`cell.master`/`worksheet.model.merges`. But nobody ran it against a real Japanese WBS workbook.
  - The streaming `WorkbookReader` path is where merge support is historically weak.
  - The 20,000 × 200 limit is up to 4M cells, and the in-memory reader at that size needs gigabytes on a Fargate task.
- **The fallback:** The spine names "SheetJS CE" as the swap target. The npm package `xlsx` is frozen at 0.18.5 and carries known advisories (prototype pollution and ReDoS). SheetJS now ships only from `cdn.sheetjs.com` tarballs.
- **Fix:**
  - Add a spike to the first story: parse 3 real workbooks (merged headers, shared formulas, JA text, dates) through `WorkbookPort` and assert merges and cached results.
  - Lower the parse ceiling or state the worker memory (for example, reject above 1M non-empty cells).
  - Do the 50 MB "unpacked" check by reading the zip central directory *before* handing the file to ExcelJS, because ExcelJS has no zip-bomb guard.
  - Amend the Open Question: "fallback is SheetJS CE from `cdn.sheetjs.com` (not npm `xlsx@0.18.5`)".

### F7 (LOW): smaller live-default notes

- **TypeScript 6.0 defaults:** `strict: true`, `types: []` (no automatic `@types/node`), and `rootDir` defaults to the tsconfig directory. `baseUrl` is deprecated.
  - The worker, db and adapters packages need `"types": ["node"]`. Use `paths` without `baseUrl` in the shared base tsconfig.
  - The 6.0.3 pin is confirmed right: typescript-eslint caps below 6.1, and Next 16.3 type-checks TS 6 on its default path. Record the typescript-eslint cap as the reason in the memlog.
- **next-intl on Next 16:** the `middleware.ts` convention is now `proxy.ts`. next-intl's `createMiddleware` goes in `proxy.ts`, and a custom wrapper must be exported as `proxy`. If this is missed, locale negotiation silently never runs. Say whether locale lives in a URL prefix or a cookie; the i18n convention doesn't say.
- **vitest 5.0.1** is a 5-day-old major and needs an explicit `vite` peer. Acceptable, but pin exactly and expect patch churn.
- **SES** is available in Tokyo (API and SMTP endpoints confirmed). New accounts start in the sandbox (200 emails/day, 1/s). Put "request SES production access" in the R1 Deferred item for the sender domain.
- **Better Auth + RLS:** confirmed peer-compatible with next 16, drizzle 0.45.2 and drizzle-kit 0.31.10. Better Auth's tables (`user`, `session`, `account`, `verification`) are not tenant-owned, so state that they are exempt from AD-3's FORCE RLS set and that the membership table is tenant-owned. In Next 16 server actions, Better Auth needs its `nextCookies()` plugin for session cookies to be set.

## What the memlog did well

- It checked versions against the live registry, and every one still matches today.
- The TS 6 vs 7 call was reasoned rather than defaulted.
- It checked Better Auth's peer ranges.
- The Backlog rate-limit headers and page size were looked up rather than assumed.

The gap is one level deeper: *behaviour* claims (queue semantics, pagination ordering, parameterized `SET`, image defaults, package-manager defaults) were written as facts without a matching check.

## Sources

- npm registry (`npm view <pkg> version|peerDependencies|engines|dist-tags|time`), run 2026-09-20
- https://nodejs.org/dist/index.json
- https://hub.docker.com/_/postgres (tags; PG 18 PGDATA/VOLUME change)
- https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-versions.html
- https://aws.amazon.com/about-aws/whats-new/2025/11/amazon-rds-postgresql-major-version-18
- https://docs.aws.amazon.com/general/latest/gr/ses.html
- https://pgboss.io/api/queues, https://pgboss.io/api/jobs, https://pgboss.io/api/scheduling
- https://developer.nulab.com/docs/backlog/rate-limit/, /api/2/get-issue-list/, /api/2/get-rate-limit/
- https://orm.drizzle.team/docs/rls
- https://pnpm.io/blog/releases/12.0, https://pnpm.io/blog/releases/11.0
- https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html
- https://next-intl.dev/docs/routing/middleware
