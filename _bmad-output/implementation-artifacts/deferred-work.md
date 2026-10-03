# Deferred work

Goals split out of a Build intent. Each entry is a goal that was in scope when the
work started and was deliberately deferred, with the evidence for the split.

## The `resolved:` field

An entry with no `resolved:` line is OPEN. An entry with one starts with exactly one
of four words, so the ledger can be counted without reading it:

- `YES` — done. What follows is the evidence a reader needs to accept that.
- `PARTIAL` — some of it landed; the line says which half remains. Counts as OPEN.
- `NO` — checked and deliberately not done. Counts as OPEN.
- `OBSOLETE` — the entry no longer describes anything real. Counts as CLOSED, and the
  line says what removed it.

That vocabulary was imposed on 2026-09-23. Before then five spellings were in use
(`YES`, `PARTIAL`, `MOSTLY`, `DONE`, and a bare date), which is why the Epic 1
retrospective could not count the ledger without hand-classifying nine entries (F16),
and why thirty-five entries sat open while the work behind them had already shipped.

- source_spec: none
  summary: Story 1.1 slice B — the one-command local run and the workspace substrate: the five missing workspace units (apps/worker, packages/app, packages/db/auth, packages/adapters, packages/i18n), packages/app/config's zod fail-boot schema, the Clock port with the ESLint bans on Date.now()/new Date()/process.env, pg-boss installed and migrated by the migrator role with the app role on DML grants and auto-migration disabled, and `pnpm dev` bringing Postgres, migrations, RLS/grants/triggers, the seed, web and worker up in one command.
  evidence: Split from story 1.1 on 2026-09-20 at the Build multi-goal gate. Slice A (four major version upgrades — pnpm 9.15.0 to 12.4.2, TypeScript 5.7 to 6.0.3, vitest 2 to 5.0.1, drizzle-orm 0.38 to 0.45.2, plus pinning the Postgres image to 18.6) is independently shippable against the current 43-file codebase and is gated by the CI added in PR #6, so upgrade breakage surfaces on code that already exists rather than on top of five new packages. Founder chose the split. Note the one honest cost: story 1.1's final acceptance criterion spans both slices — its first half (a fresh install and typecheck succeed under pnpm 12 and TypeScript 6) is accepted in slice A, while its second half (apps/worker, packages/db and packages/adapters declaring "types": ["node"]) cannot be accepted until those packages exist in slice B. Slice A therefore closes with that criterion deliberately partial.
  resolved: OBSOLETE, superseding the earlier partial — 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). A parent entry whose own text says the remainder was split into the B2 and B3 entries below. B2 is closed and B3 is open; carrying this as well triple-counts `pnpm dev`. EARLIER: PARTIAL, 2026-09-20. Slice B1 (`spec-1-1-workspace-skeleton.md`) landed the five workspace units, packages/app/config's fail-boot zod schema and the Clock port with the ESLint bans, and closed the second half of story 1.1's final criterion — packages/db, packages/adapters and apps/worker all declare "types": ["node"] now. pg-boss on separated roles and `pnpm dev` remain, split out as the B2 and B3 entries below.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-version-upgrades.md`
  summary: Move apps/web from the Next 15 line (currently resolving 15.5.25) to the decided Next 16.3.5. React needs nothing: ^19.0.0 already resolves 19.3.0, which is the decided version.
  evidence: Deferred 2026-09-20 at the spec's Open Questions gate. The decided stack names Next 16.3.5, but slice A was scoped as a toolchain move and Next 15 to 16 is a framework major. (An earlier draft of this entry said React was also behind at 19.0.0; that was the caret range read as a resolved version — React is already at 19.3.0.) Its breakage would land in the eight apps/web files that reach @momo/db directly — exactly the files Epic 2's story 2.2 rewires onto use cases and then deletes or rewrites. Upgrading them first means debugging code that is already scheduled to change. The cost of deferring is a real divergence: after slice A the whole repo is on the decided stack except apps/web, which nothing enforces and nobody is reminded of, which is why it is written down here. Natural place to pick it up is with or after story 2.2, or sooner if a security advisory lands on Next 15.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-version-upgrades.md`
  summary: Nothing in the verification path ever executes a database query, so the drizzle-orm 0.38→0.45 and pg 8.13→8.23 majors plus the Postgres 18.6 pin are covered only by tsc.
  evidence: Real and verified. All three test files compute from JSON fixtures through the pure domain core; a repo-wide grep of test files for drizzle, pg, getDb, loadReview and @momo/db returns nothing, and CI has no services: postgres block. A row-mapping or DDL difference would ship with all three gates green and surface as wrong money figures on the Review page. Not a defect today — drizzle-kit 0.31.10 was hand-run and still emits all four CREATE INDEX statements from schema.ts, and peek-db.ts reads figures correctly through repo.ts. The fix is a Postgres service in CI plus a round-trip test that seeds and reads back the golden figures, which is the first DB test this repo would have; CI's own header says to add the service when the first test needs one.
  resolved: YES, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). A Postgres 18.6 service and the full prepare sequence run in CI (`.github/workflows/ci.yml`), and `packages/db/src/db-round-trip.test.ts` reads the golden figures back through drizzle + pg — exactly the fix this entry prescribed.
  
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-version-upgrades.md`
  summary: packages/db still owes a per-package "types": ["node"] declaration, and neither slice A nor the recorded slice B deferral names it.
  evidence: epics.md:494 names apps/worker, packages/db AND packages/adapters in story 1.1's final criterion; the spec's closing AC and the slice B entry above both name only apps/worker and packages/adapters. packages/db exists today and has no tsconfig.json. Nothing fails right now because the root tsconfig's include covers packages/**/*.ts with types: ["node"], so the gap is invisible until slice B gives each package its own tsconfig — at which point packages/db can be missed. Verified by ls.
  resolved: YES, 2026-09-20 in slice B1. packages/db/tsconfig.json, packages/adapters/tsconfig.json and apps/worker/tsconfig.json each declare "types": ["node"], which is all three names in epics.md:494. The gap this entry predicted — packages/db being missed once per-package tsconfigs appeared — was avoided because the entry existed.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-version-upgrades.md`
  summary: Node 24.21.0 is pinned only inside CI — no engines field, no .nvmrc, no .node-version — so local runs use whatever Node the developer has.
  evidence: Verified absent. This box runs 24.13.0 while CI now pins 24.21.0, which is exactly the drift class this slice exists to close. Deliberately not patched: adding engines.node: "24.21.0" would break installs on the founder's current Node, so the choice between an exact pin, a range, and an .nvmrc-only convention is a decision rather than a one-line fix. Pair it with the pnpm engines pin at the same time.
  resolved: YES, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). `.nvmrc` holds 24.21.0 and CI reads it via `node-version-file`. The `engines` question was decided against deliberately (commit `f3f114b`), which is the decision this entry was waiting for.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-version-upgrades.md`
  summary: vitest went 2→5 with no coverage configuration, so the project's 80% coverage floor is neither measurable nor gated.
  evidence: vitest.config.ts carries only resolve.alias, test.include and environment — no coverage block, provider or threshold. The project's testing rules mandate 80% minimum. A vitest major is the cheapest moment to add it, but adding a provider and thresholds is new capability and would fail immediately at current coverage, so it needs its own slice.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-version-upgrades.md`
  summary: apps/web is typechecked but never built, and @types/node just crossed a major under it.
  evidence: CI runs tsc --noEmit for apps/web and never next build. The lockfile now resolves next@15.5.25(@types/node@24.13.6), so Next's typings sit on Node 24 types rather than Node 22. The typecheck gate covers types, not a production build, and this gap became load-bearing with this change. Adding next build to CI is new scope.
  resolved: YES, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). CI runs `pnpm --filter @momo/web build`. (The step inherits the job env, so it does not prove the composition root reads no configuration — that residue is its own entry.)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-version-upgrades.md`
  summary: Root tsconfig.json duplicates tsconfig.base.json instead of extending it, and apps/web/tsconfig.json redeclares paths and loses the base's @momo/domain/* and @momo/db/* wildcards.
  evidence: Both verified by comparing the files. The duplication is why baseUrl had to be deleted in three places instead of one, and TS 7 has further deprecations queued that will each need applying twice with nothing detecting drift. The lost wildcards bite the first @momo subpath import from apps/web; none exists today. Both are pre-existing structure — this change removed only baseUrl.
  resolved: PARTIAL, 2026-09-20 in slice B1. tsconfig.json now extends tsconfig.base.json and carries only include/exclude, so a compiler option is edited in one place. The apps/web half is untouched and still open: apps/web/tsconfig.json redeclares paths and still loses the base's @momo/domain/* and @momo/db/* wildcards, which slice B1's spec explicitly told it to leave alone.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-version-upgrades.md`
  summary: drizzle-orm and pg are pinned exactly in three manifests with nothing enforcing lockstep; pnpm 12 catalogs: would reduce it to one edit.
  evidence: Verified across package.json, apps/web/package.json and packages/db/package.json. A future partial bump installs two drizzle instances and the lockfile records it happily. catalogs: is a new mechanism rather than a direct correction, and it would touch the same pnpm-workspace.yaml this slice already edits.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-version-upgrades.md`
  summary: No Dependabot or Renovate config, so the next toolchain drift is discovered rather than alerted — the same way this slice's five stale versions were.
  evidence: .github/ contains only workflows/. Fair against the slice's own reason for existing, and against deferred-work's admission that the Next 16 divergence is held by a written note alone. A CI step diffing manifests against the architecture's Stack table would be the cheaper variant. Either way it is new automation and touches release policy.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-version-upgrades.md`
  summary: sprint-status.yaml has one key for story 1.1 covering both slices, so the story can read done while slice B is unstarted.
  evidence: Verified — 1-1-one-command-brings-the-whole-system-up is the only 1-1 key. Mitigated for now by leaving the story at in-progress rather than advancing it, and by the slice B entry above. A permanent fix means either a tracker key per slice or a convention that a split story stays in-progress until its last slice closes; bmad-sprint-planning owns that file's shape.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-version-upgrades.md`
  summary: Assorted low-severity hygiene: package.json declares db:reset pointing at packages/db/src/reset.ts which does not exist; @types/pg sits in dependencies rather than devDependencies; react/react-dom/next remain caret ranges so their "decided" versions are a lockfile property; drizzle-kit is pinned but no script exercises it.
  evidence: All four verified and all four pre-existing or deliberate. reset.ts absence confirmed by ls — pnpm db:reset fails immediately, and the spec's Design Notes wrongly treat the file as present. @types/pg was already in dependencies; the diff only bumped its version. The caret ranges are the deliberate Next exception recorded above, worded at major granularity on purpose. drizzle-kit's generator path was hand-verified during review but nothing gates it, which is the same hole as the first entry here.
  resolved: PARTIAL, 2026-09-20 in `spec-1-2-rls-and-withtenant.md` review round 1. The `db:reset` half is closed by DELETING the script: it named a file that has never existed, and the neighbouring `seed` script was rewritten in that slice, so leaving a broken entry beside a freshly-edited one was not defensible. Reset is `docker compose down -v` plus `pnpm demo`, which the README already documents. The other three (@types/pg in dependencies, the caret ranges, the ungated drizzle-kit path) are untouched.

- source_spec: none
  summary: Story 1.1 slice B2 — apps/worker and pg-boss on separated database roles: the migrator (owner) role installs and migrates pg-boss's schema during migrate, and the application role starts pg-boss with auto-migration disabled holding only DML grants on that schema.
  evidence: Split from slice B on 2026-09-20 at the Build multi-goal gate, after the founder chose to land the workspace skeleton (B1) first. Independently shippable once B1 exists, and substantial in its own right: pg-boss is not installed, and the migrator/application/maintenance role split does not exist in the database at all. It is database and ops work rather than application layering, so folding it into B1 would mix two debugging surfaces in one PR — the same reasoning that split slice A from slice B.
  resolved: YES, superseding the earlier partial — 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). The single residue this entry's PARTIAL named — the `maintenance` role — now exists: created by `scripts/db-policies.ts` through the shared `ensureRole`, with its policy and grants emitted by `sql/generate.ts`. EARLIER: PARTIAL, 2026-09-20 in `spec-1-1-pgboss-roles.md`. pg-boss 12.33.2 is installed; `scripts/pgboss-migrate.ts` (`pnpm pgboss:migrate`) creates the `momo_migrator` (NOLOGIN owner) and `momo_app` (LOGIN, restricted) roles idempotently, installs/migrates the `pgboss` schema from pg-boss's own generated plan SQL as the owner, and grants the app role USAGE plus DML and nothing else; `apps/worker` constructs pg-boss with `migrate: false`/`createSchema: false` and is gated by `apps/worker/src/worker-round-trip.test.ts`. The `maintenance` role named in this entry's summary was NOT created — it belongs to the append-only exception path, which is story 1.2's (see the new entry below).

- source_spec: none
  summary: Story 1.1 slice B3 — `pnpm dev` bringing Postgres, migrations, the RLS/grants/trigger SQL, the seed, web and worker up in one command.
  evidence: Split from slice B on 2026-09-20, and partly BLOCKED rather than merely deferred. Story 1.1's first acceptance criterion requires `pnpm dev` to apply migrations and to apply the RLS, grants and trigger SQL — and neither exists. There are no migrations at all (the repo uses `drizzle-kit push`; the single pre-production migration is Epic 2 story 2.1's, and CI's prepare step carries a note to switch when it lands), and the RLS, grants and trigger SQL is generated from the table-class registry, which is story 1.2's. So this cannot close as written until 1.2 and 2.1 exist. It also needs B2, since the command starts the worker. Sequence it after 1.2 rather than attempting it next.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-workspace-skeleton.md`
  summary: Two sanctioned one-line `eslint-disable`s survive the clock/env fence: `packages/db/src/client.ts` still reads `process.env.DATABASE_URL`, and `apps/web/src/app/actions.ts:86` still constructs a bare `new Date()`. Both are story 1.2's to remove.
  evidence: Both verified by watching `pnpm lint` fail on them before the disables were added. Neither can be fixed inside this slice. `packages/db` implements ports that `packages/app` declares, so importing `@momo/app` for the connection string would invert the import direction dependency-cruiser will enforce (AD-1) — the correct fix is `getDb(connectionString)`, which changes every caller including the eight `apps/web` files story 1.2 rewires onto use cases. `apps/web` has no composition root to inject a `Clock` from for the same reason. The spec's task list named only the `client.ts` case; the `actions.ts` case was found by running the gate and is recorded in the spec's Implementation Notes. Each disable is one line wide with the rule named, so `reportUnusedDisableDirectives` (left at its default `warn`) reports them the moment they stop being needed.
  resolved: YES, 2026-09-21 in `spec-1-2-web-write-use-cases.md`. The `actions.ts` bare `new Date()` and its eslint-disable are GONE, and not by injecting a Clock: the fallback existed only for a Project with no row, and the five writes now answer `not_found` for that instead (the Project read inside the write's own transaction rejects, `packages/db/src/repo-writes.ts` `anchorOf`). The event time is still the Project's `demoAnchor`, as before. Earlier: PARTIAL, 2026-09-20 in `spec-1-2-rls-and-withtenant.md`. The `client.ts` disable is GONE: `getDb(connectionString)` landed, the hardcoded localhost fallback went with it (and its twin in `drizzle.config.ts`), and `packages/db` reads no environment at all. The `actions.ts` bare `new Date()` is still there. `apps/web` now HAS a composition root — `apps/web/src/server/db.ts` — so the structural blocker this entry named is gone, but injecting a `Clock` through it would mean threading one into each of the five server actions, which is the shape the next slice replaces wholesale when those actions become use-case calls. Left deliberately, one line wide, with the rule named.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-workspace-skeleton.md`
  summary: `**/*.test.ts` is exempt from the ENVIRONMENT half of the fence, so a test may read `process.env`. The wall-clock half stays in force in tests.
  evidence: The environment exemption is forced: `packages/db/src/db-round-trip.test.ts:29` reads `process.env.REQUIRE_DB` to turn an unreachable database into a failure instead of a skip, and this slice's acceptance criteria require that no existing test change (`git diff --stat -- '*.test.ts'` must be empty). The clock exemption was NOT forced and has been removed — grep confirms no test file contains `Date.now()` or `new Date()`, so banning the clock in tests costs nothing and prevents the nondeterminism the ban exists for. Verified by probe: appending `Date.now()` to db-round-trip.test.ts fails the gate, while the unmodified file (which reads process.env) passes. What remains open is narrow: a future test reading configuration directly instead of taking it as a value, which no gate will object to.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-workspace-skeleton.md`
  summary: `apps/worker/tsconfig.json` exists and passes, but no gate runs it: the root tsconfig excludes `apps`, and only `@momo/web` has a `typecheck` script.
  evidence: Verified — `pnpm exec tsc --noEmit -p apps/worker/tsconfig.json` exits 0 by hand, and grep of .github/workflows/ci.yml shows two typecheck steps, neither covering it. The spec's Code Map names this consequence explicitly ("new packages under `packages/` are typechecked automatically but `apps/worker` will not be") and asks only for the `types` declaration, so it was left. It costs nothing today because the worker is an empty skeleton; it starts costing the day slice B2 puts pg-boss code in there. The fix is a `typecheck` script in `apps/worker/package.json` plus a third CI step — which also means departing from the five-field package.json convention the spec pinned, so it belongs with B2's code rather than ahead of it.
  resolved: YES, 2026-09-20, during review of slice B1. `apps/worker/package.json` now carries a `typecheck` script and .github/workflows/ci.yml runs `pnpm --filter @momo/worker typecheck` as a third typecheck step with `if: always()`, beside its two neighbours. Verified by probe: an injected `const __bad: number = 'nope'` in apps/worker/src/index.ts is reported by that step and by nothing else. The five-field package.json convention was departed from for the script, deliberately — an ungated tsconfig is worth less than the convention.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-workspace-skeleton.md`
  summary: The `Clock` port has no consumer and no test. `systemClock` is exported and nothing calls it, so the port's shape is proven only by tsc.
  resolved: YES, 2026-09-22 in `spec-1-8-a-load-fixture-worth-measuring-against.md` — `fixtureClockOn` + web/worker/seed consumers; `packages/adapters/src/clock.test.ts`.
  evidence: Verified by grep — no import of `@momo/adapters` exists anywhere. This is what a skeleton slice looks like and is not a defect, but it means the port's usefulness is unmeasured: the first real consumer (story 1.8's fixture-mode clock, which must return the later of the newest fixture timestamp and a configured anchor) may find the two-method interface wrong. Cheap to change while nothing depends on it; note that it stops being cheap once the scheduler does.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-workspace-skeleton.md`
  summary: The config module's fail-boot behaviour is proven by a hand-run probe, not by a gate. Nothing imports `@momo/app`, so no automated run ever loads it.
  evidence: Verified three ways by hand (`DATABASE_URL` absent, empty, present) and recorded in the spec's Verification section, but `pnpm test` never imports the module and `pnpm lint`/`pnpm typecheck` do not execute it, so a future edit that breaks the parse or stops naming the key would ship green. A unit test over `parseConfig(env)` — which takes the environment as an argument precisely so it can be tested without touching the real process environment — would close this for a few lines. It was not added because this slice adds no tests and the 80% coverage floor is itself deferred (see the vitest coverage entry above); pair the two.
  resolved: YES, 2026-09-20 in slice B2's review round 1. `packages/app/src/config.test.ts` gates `parseConfig` for both keys in both failure modes (absent and empty). Watched to fail: giving `APP_DATABASE_URL` a zod `.default(...)` keeps the inferred type `string` and passes `pnpm typecheck`, and the test catches it.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-workspace-skeleton.md`
  summary: packages/db/src/client.ts still falls back to a hardcoded 'postgres://momo:momo@localhost:55433/momo_keikaku' when DATABASE_URL is unset, so a missing key silently connects to a dev database instead of failing the way packages/app/src/config.ts promises.
  evidence: Confirmed at client.ts:18. It contradicts config.ts's own header for the only key the repo has, on the only path that actually connects. Deliberately not patched: the fallback predates this slice, and removing it breaks `pnpm demo`, which relies on the default rather than setting the variable. Dropping it is a decision about local developer ergonomics and pairs naturally with story 1.2's getDb(connectionString) refactor. drizzle.config.ts:8 carries the identical default and must move with it.
  resolved: YES, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). `packages/db/src/client.ts` takes the connection string as an argument behind `assertConnectionString`, which throws naming both keys. The literal survives only in that file's comment explaining the removal, and in a test fixture.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-workspace-skeleton.md`
  summary: packages/app/src/config.ts parses eagerly at module load and the barrel re-exports the parsed value, so importing @momo/app for any reason requires DATABASE_URL.
  evidence: Confirmed by probe: importing the barrel without the key throws. Correct fail-boot behaviour, and harmless today because nothing imports it. It stops being harmless when story 1.2 puts use cases behind that barrel: every unit test of a pure use case then needs a database URL it never uses. The fix is a design choice (lazy getConfig, or keeping the eager singleton out of the barrel), not a correction.
  resolved: YES, 2026-09-20 in `spec-1-2-rls-and-withtenant.md` review round 1. `packages/app/src/config.ts` now exposes `config` as a getter per key, each parsing only its own key through the same `configSchema.shape[key]` validator, so a process that reads `config.APP_DATABASE_URL` never touches DATABASE_URL. `parseConfig(env)` is unchanged for the two migration scripts that genuinely need both. Verified by probe: with DATABASE_URL unset and only APP_DATABASE_URL exported, `apps/worker` reports `[worker] started against schema 'pgboss' with migration disabled` and `apps/web` serves `/p/prj-ec2/review` with a 200 — which is the role separation those two processes exist to have. Taken here rather than in its own slice because this slice is what made it load-bearing: pointing web and the worker at the restricted role while still demanding the owner's connection string in their environment hands the separation straight back.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-workspace-skeleton.md`
  summary: DATABASE_URL is validated only as a non-empty string, and parseConfig discards the ZodError instead of attaching it as a cause.
  evidence: Both confirmed. ' ' and 'localhost' parse cleanly while every error message promises a PostgreSQL connection string, so the most common configuration mistake still surfaces as a driver error much later, which is what the module exists to prevent. Both are enhancements past what any requirement states rather than corrections, and how strict to be is a decision.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-workspace-skeleton.md`
  summary: parseConfig has no unit test; the fail-boot acceptance criterion is proven only by a hand-run probe that no gate repeats.
  evidence: Confirmed. Nothing blocks adding one (AC 6 forbids changing existing test files, not adding new ones), but it is new work rather than a correction, and because of the eager-parse entry above the test file would itself need DATABASE_URL present to import the module. Worth doing together with the lazy-config change so the test does not inherit a database requirement it has no use for.
  resolved: YES, 2026-09-20 in slice B2's review round 1, and the predicted cost was paid exactly as written: `packages/app/src/config.test.ts` sets both keys with `??=` and then `await import`s the module, purely to get past the eager parse for a function that takes its environment as an argument. The lazy-config entry above is still the real fix.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-workspace-skeleton.md`
  summary: The Clock port exposes now() and nowMs(), two methods that must agree with nothing making them agree, and now() returns a mutable Date.
  evidence: Real design observation, speculative harm. No consumer exists yet, so the shape is proven only by tsc. Story 1.8's fixture clock is the first real implementation and the first chance to find out whether a single primitive with a derived helper would have been better. Cheap to change now, expensive once the scheduler depends on it.
  resolved: YES, 2026-09-22 in `spec-1-8` — fixtureClockOn keeps now/nowMs agreeing on one max ms; shape unchanged and proven by tests.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-workspace-skeleton.md`
  summary: deferred-work.md gained a "resolved:" key that its own header does not define, on entries whose summary still describes the work as open.
  evidence: Confirmed, and purely additive so the workflow's do-not-modify-existing-entries rule holds. The problem is readability: a reader scanning summary lines to find open work reads PARTIAL and YES entries as open. Either document the key and the PARTIAL convention in the header, or move resolved entries into their own section.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-workspace-skeleton.md`
  summary: apps/web/next.config.ts sits inside the clock/env fence although the sibling tooling configs (scripts/, vitest.config.ts, drizzle.config.ts) are deliberately outside it.
  evidence: Confirmed: it appears in the lint file list and lints clean today. It becomes a problem at the first env-driven Next setting, which will need a disable for exactly the 'this is tooling, not application code' reason the other config files never needed one.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-pgboss-roles.md`
  summary: The `maintenance` role is still absent. Slice B2 created only `momo_migrator` and `momo_app`; ARCHITECTURE-SPINE.md's append-only enforcement names a third role with an explicit maintenance flag as the only path allowed to UPDATE or DELETE an append-only table.
  evidence: Confirmed by `pg_roles` after the migrator step — three roles exist (`momo`, `momo_migrator`, `momo_app`) and none is a maintenance role. Deliberately out of scope: the spec's Never excludes the table-class registry, `grants.sql` and the triggers, and the maintenance role has nothing to be an exception to until the append-only triggers exist. Natural home is story 1.2, beside the generated grant SQL.
  resolved: YES, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). `scripts/db-policies.ts` creates `CANONICAL_MAINTENANCE_ROLE` through `pgboss-migrate.ts`'s exported `ensureRole`, and the append-only triggers refuse until `app.maintenance` is set (`rls.test.ts`).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-pgboss-roles.md`
  summary: `pg-boss` is pinned exactly in two manifests (root `package.json` for the migrator script, `apps/worker/package.json` for the runner) with nothing enforcing lockstep, extending the same problem already recorded for `drizzle-orm`/`pg` across three.
  evidence: Verified in both files. Both declarations are genuine — each package imports pg-boss directly — so removing one would be worse, not better. A partial bump installs two pg-boss instances and the lockfile records it happily; worse here than for drizzle, because the two instances would disagree about `pgboss.schema` and the worker would refuse to start against the version the migrator installed. Same fix as the existing entry: pnpm 12 `catalogs:`.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-pgboss-roles.md`
  summary: `packages/app/src/config.ts` now has two required keys and still parses eagerly at module load, so the friction the earlier entry predicted has doubled: `pnpm pgboss:migrate` and the worker both need APP_DATABASE_URL *and* DATABASE_URL, while `pnpm seed`, `pnpm demo` and `drizzle-kit` still run off `packages/db/src/client.ts`'s hardcoded fallback.
  evidence: Confirmed by probe — running either command with APP_DATABASE_URL unset throws naming the key (which is the intended fail-boot behaviour), but a developer who has never needed an environment variable for `pnpm seed` now needs two for the migrator. The local invocation is `DATABASE_URL=... APP_DATABASE_URL=... pnpm pgboss:migrate` and it is written down nowhere a developer would look — README-DEMO.md predates all of this. Pairs with the existing lazy-config entry and the `getDb(connectionString)` refactor; a `.env.example` plus a note in the README is the cheap half.
  resolved: YES, 2026-09-20 in `spec-1-2-rls-and-withtenant.md` review round 1. `packages/app/src/config.ts` now exposes `config` as a getter per key, each parsing only its own key through the same `configSchema.shape[key]` validator, so a process that reads `config.APP_DATABASE_URL` never touches DATABASE_URL. `parseConfig(env)` is unchanged for the two migration scripts that genuinely need both. Verified by probe: with DATABASE_URL unset and only APP_DATABASE_URL exported, `apps/worker` reports `[worker] started against schema 'pgboss' with migration disabled` and `apps/web` serves `/p/prj-ec2/review` with a 200 — which is the role separation those two processes exist to have. Taken here rather than in its own slice because this slice is what made it load-bearing: pointing web and the worker at the restricted role while still demanding the owner's connection string in their environment hands the separation straight back. The documentation half is closed too: README-DEMO.md's quickstart now exports both variables and says which role each names.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-pgboss-roles.md`
  summary: The migrator step's migration path (as opposed to its install path) has never been executed. `getMigrationPlans` is only reached when the installed schema version is behind pg-boss's, which cannot happen until pg-boss is upgraded.
  evidence: Verified by reading the script and by the three runs recorded in the spec: run 1 installed at version 42, runs 2 and 3 took the "already at version 42" branch. The migration branch — including the split at the plan's own `COMMIT;` that keeps inlined `CREATE INDEX CONCURRENTLY` statements out of an implicit transaction — is exercised by nothing. It was written from pg-boss's own note that `migrateCommands()` (unexported) is the programmatic path, and the concurrent tail is empty for every migration in 12.33.2 (checked for v40→42). The honest test needs an older pg-boss schema to migrate from, which means either a fixture dump or installing an older release in a test; both are new work.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-pgboss-roles.md`
  summary: Re-running `pnpm pgboss:migrate` no longer rotates the app role's password, so a changed APP_DATABASE_URL and an existing role can drift apart silently.
  evidence: Deliberate, and a trade rather than a gap. `ALTER ROLE ... PASSWORD` was removed from the existing-role path in review round 1 because re-issuing it put the credential into pg_stat_activity and into any `log_statement` capture on every run, against the security floor. The cost: the password is now written only by `CREATE ROLE`, so rotating APP_DATABASE_URL against an existing role changes nothing and the worker fails to authenticate with a message about the password, not about the drift. Role *attributes* are still re-asserted every run, so only the credential is affected. A `--rotate-password` flag, or an explicit comparison that fails naming the drift, would close it; both are new surface.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-pgboss-roles.md`
  summary: The worker writes to `console` directly. There is no logger port, so a runner that is meant to be operated has no structured output, no levels and no redaction — and the security floor requires that no tracker credential reach logs.
  evidence: Confirmed at `apps/worker/src/index.ts`, which uses `console.error`/`console.warn`/`console.log` for pg-boss's `error` and `warning` events and for its own lifecycle lines. Harmless today (the worker runs nothing and handles no credentials), and a logger port is a decision no story has taken yet. It stops being harmless in Epic 5, when the Connector's jobs carry tracker credentials into exactly those event payloads.
  resolved: YES, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). `apps/worker/src/index.ts` logs through `createLogger` (pino, AD-16 redaction) with zero `console.` calls. NOTE: the `LoggerPort` abstraction was declined on purpose (`packages/app/src/logger.ts`: "can wait until more call sites exist") — the harm is closed, the port is not owed.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-pgboss-roles.md`
  summary: `pnpm test` still silently skips the worker round trip when APP_DATABASE_URL is unset, which is every local run that has not exported it.
  evidence: By design and consistent with `db-round-trip.test.ts`'s REQUIRE_DB contract — CI sets both and a missing key there is a failure, not a skip. Worth recording anyway: the repo now has two DB-backed test files with two different local preconditions (one falls back to a hardcoded URL, one does not), so "pnpm test is green locally" covers less than it appears to. Resolving the `client.ts` fallback entry would make the two consistent.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-pgboss-roles.md`
  summary: The worker requires DATABASE_URL as well as APP_DATABASE_URL, because packages/app/src/config.ts parses the whole schema eagerly at module load.
  evidence: Confirmed by running the worker: it fails naming both keys. The process whose entire purpose is to hold only the restricted credential cannot boot without the owner's connection string, which is a hole in the separation this slice establishes rather than mere friction. Not patched because the fix is a config-module design change — per-key laziness, a worker-specific schema, or parseConfig(env, { require: [...] }) — and it compounds the already-recorded eager-parse entry from slice B1. Do both together.
  resolved: YES, 2026-09-20 in `spec-1-2-rls-and-withtenant.md` review round 1. `packages/app/src/config.ts` now exposes `config` as a getter per key, each parsing only its own key through the same `configSchema.shape[key]` validator, so a process that reads `config.APP_DATABASE_URL` never touches DATABASE_URL. `parseConfig(env)` is unchanged for the two migration scripts that genuinely need both. Verified by probe: with DATABASE_URL unset and only APP_DATABASE_URL exported, `apps/worker` reports `[worker] started against schema 'pgboss' with migration disabled` and `apps/web` serves `/p/prj-ec2/review` with a 200 — which is the role separation those two processes exist to have. Taken here rather than in its own slice because this slice is what made it load-bearing: pointing web and the worker at the restricted role while still demanding the owner's connection string in their environment hands the separation straight back.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-pgboss-roles.md`
  summary: The migrator assumes DATABASE_URL names a superuser and neither states nor checks it.
  evidence: Confirmed by reading the script: it issues SET ROLE momo_migrator with nothing granting the connecting role membership, and runs the grants outside that SET ROLE window against a schema the migrator owns. Both work today only because momo is the superuser. A production deployment using a dedicated non-superuser migration role would get raw Postgres permission errors instead of a named precondition. The fix — GRANT the migrator role TO CURRENT_USER and move the grants inside the window — is small but changes the role model, so it belongs with story 1.2's grants work.
  resolved: NO, and re-confirmed on 2026-09-20 during `spec-1-2-rls-and-withtenant.md`. The new `scripts/db-policies.ts` inherits the same assumption twice over: it applies `ALTER TABLE … ENABLE/FORCE ROW LEVEL SECURITY`, `CREATE POLICY` and `CREATE TRIGGER` as the connecting role and expects it to own the tables `drizzle-kit push` created, and it creates `momo_maintenance` with `CREATE ROLE`. Both hold today because `momo` is the superuser in CI and locally. Not fixed here because the fix is one decision about the deployment role model — which role owns the tables, which one may create roles, and how the migration step acquires membership — applied to both scripts at once, and this slice's own isolation argument does not depend on it. It becomes blocking at the first deployment to an environment where the migration credential is not a superuser.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-pgboss-roles.md`
  summary: Excluding TRUNCATE from the app role's grants removes part of pg-boss's public API without recording which part.
  evidence: Confirmed in pg-boss's sources: deleteAllJobs() with no queue name issues TRUNCATE, and deleteAllJobs(name) on a partitioned queue truncates that partition. The new test passes only because its probe queue is unpartitioned. The exclusion is correct — TRUNCATE is not DML — but the consequence is undocumented and the worker meets it the first time it wants a partitioned queue.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-pgboss-roles.md`
  summary: Two concurrent migrator runs race on CREATE ROLE.
  evidence: Real but narrow: the step runs serially in CI and locally, so nothing triggers it today. A pg_advisory_lock around the whole step closes it. Recorded rather than patched because the failure mode is a duplicate_object error on a step that is safe to re-run.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-pgboss-roles.md`
  summary: The migration branch's post-COMMIT statements have never executed, and a failure there leaves the schema version already stamped.
  evidence: Confirmed by reading the script. The branch is only reachable on a future pg-boss upgrade, so it is untestable without a fixture dump of an older schema. The risk is specific: a failed CREATE INDEX CONCURRENTLY after the version row is written makes every later run short-circuit as 'nothing to migrate' while the index is missing. Worth a fixture-based test before the first real pg-boss upgrade, not before.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-pgboss-roles.md`
  summary: PGBOSS_SCHEMA is declared twice, in apps/worker/src/boss.ts and scripts/pgboss-migrate.ts.
  evidence: Confirmed, and it is the same duplication the slice's own 'one config key, not two' decision rejects for the role name and password. Layering forbids scripts/ importing from apps/, but a shared constant in a package both may import, or a config key, would not. Left because moving it now would touch the layering question story 1.2 settles.

- source_spec: none
  summary: "CLOSED 2026-09-21 by `spec-1-2-cross-tenant-harness.md`. Story 1.2 slice — the cross-tenant harness that enumerates every read use case (AC 4 and 5, discharging NFR-S1)."
  evidence: Split from story 1.2 on 2026-09-20 at the Build multi-goal gate. AC 4 requires the harness to enumerate the read use cases mechanically rather than list them by hand, so a new one is covered the day it is written — which means it needs the use cases to exist as an enumerable surface, i.e. it follows the apps/web rewiring rather than preceding it. AC 5 states that this harness IS the automated test NFR-S1 demands, so NFR-S1 is not discharged until this lands, however green the RLS machinery looks before it. CLOSED — and the sequencing argument above was reversed at approval on 2026-09-21. The harness landed BEFORE the apps/web rewiring, against `packages/db/src/repo.ts` as the read surface, because all eight apps/web files and `scripts/peek-db.ts` already reach data through exactly two functions there, so the surface was already mechanically enumerable; and because a harness that exists before the rewiring is what guards it. `packages/db/src/read-use-cases.ts` holds the registry and is one import away from pointing at `packages/app`. NFR-S1 is discharged: 21 assertions in `packages/db/src/cross-tenant.test.ts`, fifteen sabotages watched to fail.
  resolved: YES, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). The entry's own summary already said CLOSED but it carried no `resolved:` field, so it counted as open. The harness is live (`tests/read-use-cases.ts`, `tests/cross-tenant.test.ts`). Ledger hygiene, not work.

- source_spec: none
  summary: Story 1.2 slice — rewire the eight apps/web files onto packages/app use cases, then switch dependency-cruiser on (AC 6).
  evidence: Split from story 1.2 on 2026-09-20. epics.md is explicit that the gate is turned on AFTER the rewiring in the same slice, never before, because switching it on first turns CI red on day one for a reason nobody can clear that day. Independently shippable once withTenant exists: the eight files currently call into @momo/db directly, and moving them onto use cases is a layering change that does not depend on which database role the connection uses.
  resolved: YES, 2026-09-21. Reads in `spec-1-2-web-read-use-cases.md`, writes and the gate in `spec-1-2-web-write-use-cases.md`: no `apps/web` file but the composition root imports `@momo/db`, none imports `drizzle-orm`, and `pnpm depcruise` (rule `apps-not-to-db`) fails CI on a regression — watched to fail.

- source_spec: none
  summary: Story 1.2 slice — the arithmetic and codec discipline (AC 9): bigint milli-hours, integer JPY, unreduced {num,den} ratios, a single compareRatio site, rounding only in domain/present, and one jsonb codec so JSON.stringify never meets a bigint.
  evidence: Split from story 1.2 on 2026-09-20, and genuinely independent of tenancy — it is about how packages/domain represents numbers, not about who may read them. Measured: 13 domain modules, 20 references to number/Mh in types.ts, and 32 pinned assertions in demo-golden.test.ts. The spike uses number where the architecture decided bigint, so this is a representation rewrite across the domain core with its own risk profile, and the pinned golden values are the thing that must not move while it happens. Doing it early means later stories are written against the right representation; doing it late means rewriting them.
  resolved: YES, 2026-09-21 in `spec-1-2-arithmetic-and-codec.md`. `Mh`/`Jpy` are `bigint` from the row (`bigint({ mode: 'bigint' })` on the five `*_mh` columns; the `integer` yen columns read into `bigint`) to `domain/present`; every ratio is an unreduced `Ratio`; `compareRatio` in `health.ts` is the one comparison site; rounding lives only in `domain/present` (half-even, from the exact value); `domain/present/codec.ts` carries every `audit_log.payload`. Two lint fences (rounding outside `present/`, `JSON.stringify` outside the codec) were each watched to fail. The six routes render HTML identical to the baseline commit.

- source_spec: none
  summary: Story 1.2 slice — watermark advisory locks (part of AC 7): pg_advisory_xact_lock in its two-argument form, namespace 1 for a Project key and 2 for a Tenant key, taken before allocating any seq, with ComputationInputs captured under the shared form.
  evidence: Split from story 1.2 on 2026-09-20. It needs watermarked tables with seq allocation actually being written, which is Epic 2's schedule_run and Epic 5's ledger rather than anything in Epic 1. The bare-db-handle ban from the same acceptance criterion stays with the withTenant slice, where it belongs.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-rls-and-withtenant.md`
  summary: The `tenant` table is `global`, so it carries no isolation policy and the application role can read every Tenant's id and name.
  evidence: Verified — `SELECT * FROM tenant` as `momo_app` inside any `withTenant` returns every row, because the only protection on a `global` table is the grant (SELECT, and nothing else). It is not a defect of this slice: `tenant_id` points at this table, so it cannot be discriminated by one, and the epic already classes the identity tables and the membership bridge the same way for the same reason. But "the application role may enumerate your customers' organisation names" is a real disclosure, and the fix is not a policy — it is that nothing should read `tenant` except through a membership join in `resolveRequestContext` (story 1.4), with everything else taking the Tenant from the RequestContext. `repo.ts` reads it today only to put a display name in `bundle.meta`. Pick this up with the cross-tenant harness, which is where it becomes a use-case-level question rather than a table-level one.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-rls-and-withtenant.md`
  summary: `withTenant` is not re-entrant and nothing detects a nested call, which would take a second pooled connection with no tenant set on it.
  evidence: Read from the implementation. `withTenant(db, …)` calls `db.transaction(…)`, which acquires a connection from the pool; a `withTenant(db, …)` called from *inside* another one's callback acquires a DIFFERENT connection, opens an independent transaction on it, and sets the tenant there — so the two are not one unit of work, an error in the inner one does not roll back the outer, and under a small pool they can deadlock waiting on each other. No code does this today (every caller wraps once, at the top), which is why it is recorded rather than patched. The cheap guard is an AsyncLocalStorage depth check that throws naming the outer call, or accepting a `Tx` as well as a `Db` so a nested call joins the transaction it is already in via a savepoint. Do it before the app layer starts composing use cases out of other use cases, which is story 1.3's shape.
  resolved: PARTIAL, 2026-09-21 in `spec-1-3-audit-mechanism.md`. Every write use case now opens exactly ONE transaction through `packages/app`'s `TenantTransaction` port (`packages/db`'s `inTenantTransaction`, one `withTenant`), and the scope it hands the use case — the project write repository and the audit sink — is bound to that `tx`; no member opens its own. The audit gate asserts one transaction per audited use case against a fake, and the write harness proves the audit row rolls back with the change against Postgres. Still open: nothing DETECTS a nested `withTenant` in code (the AsyncLocalStorage guard or `Tx`-accepting overload), which matters when a use case first composes another.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-rls-and-withtenant.md`
  summary: The bare-handle ban is a naming convention — it flags queries on a variable literally called `db`, so the same query on a handle called anything else walks past both the lint rule and the test.
  evidence: Verified by probe: `const h = getDb(url); h.select()` is reported by neither gate. This is the honest limit of a non-type-aware ESLint config (deliberately non-type-aware, so the typecheck's cost stays out of the lint gate) plus a text scan. What would actually close it is a type-level distinction — `getDb` returning a branded handle whose query methods are not callable, with `withTenant` widening it — which is a change to every signature in `packages/db` and wants doing once, when the app layer's ports are being written rather than after. Until then the convention plus code review is the control, and the lint rule's value is that it makes the *common* mistake (copying an existing `db.select`) impossible.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-rls-and-withtenant.md`
  summary: `loadProjectBundle` now holds one transaction open across 15 sequential round trips, so a page render keeps a connection and a snapshot for the whole read.
  evidence: Read from `packages/db/src/repo.ts` — the 15 selects were already sequential; what changed is that they are now inside one transaction, which is what `withTenant` requires. Correctness improves (the reads are a consistent snapshot, which they were not before) and hold time gets worse: with `max: 8` in the pool, eight concurrent renders exhaust it. Not measurable today — one demo Project, one user — and the fixture story 1.8 builds is the shape to measure it against. Two independent fixes when it matters: run the independent selects concurrently inside the one transaction, and stop reading whole tables (`baseline_wp` and `rate_entry` are fetched unfiltered and filtered in JS).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-rls-and-withtenant.md`
  summary: `seed.ts`'s `TRUNCATE_ORDER` is a second hand-maintained list of all 17 table names, and nothing ties it to the registry.
  evidence: Verified — `packages/db/src/seed.ts` hardcodes the 17 names in dependency order while `table-classes.ts` holds the same 17. A table added to the registry and not to `TRUNCATE_ORDER` leaves rows behind across a re-seed, which reads as a stale fixture rather than as a missing line. Deriving it from the registry needs dependency ordering the registry does not carry (`CASCADE` makes order mostly irrelevant, but not the `RESTART IDENTITY` semantics), so it is a small design question rather than a rename. The cheap half — a test asserting the two lists hold the same set — is worth doing on its own.
  resolved: YES, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). `packages/db/src/registry.test.ts` asserts `TRUNCATE_ORDER` set-equals `REGISTERED_TABLES` with no duplicate. Order is cosmetic: `CASCADE` covers it and `RESTART IDENTITY` is gone.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-rls-and-withtenant.md`
  summary: The checked-in `packages/db/sql/grants.sql` renders the canonical role names, while `pnpm db:policies` renders the name parsed out of APP_DATABASE_URL — so with a differently-named application role the checked-in file is not what is applied.
  evidence: By construction: `scripts/db-policies.ts` calls `generateAll(appRole.name, …)` for the apply and `generateAll(CANONICAL_APP_ROLE, …)` for `--write`. Harmless today (both are `momo_app`, in CI and locally) and correct in spirit — the applied grants must name the role that actually logs in, and the checked-in file is documentation of the generator's output. The gap is that the file reads as though it were the applied SQL. Either render the file with a placeholder the apply substitutes, or have the drift test assert the parsed name matches the canonical one and fail naming both. The second is two lines and worth taking with the next grants change.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-rls-and-withtenant.md`
  summary: `apps/web` has no automated test at all, so its move to the restricted role and to `withTenant` is covered only by a hand-run check.
  evidence: Verified — `vitest.config.ts` includes `apps/**/*.test.ts` and no file under `apps/web` matches. This slice's web changes were checked by running `next dev`, curling all six routes, reading the golden figures out of the rendered HTML and confirming `momo_app` in `pg_stat_activity`; the write path was exercised by a throwaway script rather than through a server action, because a server action needs its generated action id to invoke over HTTP. Every one of those is a thing a person did once. The next slice rewires these files onto use cases, which is the moment they become testable without a browser — so the honest sequencing is to add the coverage there rather than to build a Playwright harness against code that is about to be replaced. Until then, a regression in `apps/web` ships green.
  resolved: PARTIAL, 2026-09-21. `apps/web/src/server/result.test.ts` (slice 3) and `forms.test.ts` (slice 4, `spec-1-2-web-write-use-cases.md`) now pin the error-arm handling and the five form parsers, and the write bodies moved out of `apps/web` into `packages/db`, where `tests/cross-tenant-writes.test.ts` asserts the exact rows each lands. What is still hand-run is the thin action itself — parse, call, revalidate — and the pages rendering; slice 4 checked the five actions by POSTing each form to `next dev` and diffing the rows against the baseline commit (identical). A Playwright pass remains the real fix.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-rls-and-withtenant.md`
  summary: withTenant is not re-entrant and nothing detects a nested call.
  evidence: No caller nests today, so it is unreachable. It stops being unreachable in story 1.3, which composes use cases — a use case calling another that opens its own withTenant would either nest transactions or silently reuse the outer tenant. Cheap to guard when there is a second caller to guard against.
  resolved: PARTIAL, 2026-09-21 — the same resolution as the entry above: story 1.3 slice 1 does not compose use cases; it gives them one transaction boundary through the port. The guard is still owed before the first composed use case.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-rls-and-withtenant.md`
  summary: loadProjectBundle now holds one transaction open across 15 round trips.
  evidence: A real consequence of routing reads through withTenant, and a trade rather than a defect: better read consistency, longer lock and connection hold time. It matters at story 1.8's 5-projects-by-500-WP fixture, where NFR-P1's budgets are measured, not before. Worth re-measuring there rather than optimising blind now.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-rls-and-withtenant.md`
  summary: seed.ts's TRUNCATE_ORDER is a second hand-maintained list of tables beside the registry.
  evidence: Confirmed duplication. The registry already names all 17 tables with their classes, so the truncate order could be derived from it — or at least asserted against it, the way the registry is asserted against the catalog. Left because the ordering carries foreign-key knowledge the registry does not model yet.
  resolved: YES, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). Same assertion as the entry above closes this one (`registry.test.ts`).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-rls-and-withtenant.md`
  summary: The migration scripts still assume DATABASE_URL names a superuser, and neither states nor checks it.
  evidence: Unchanged from slice B2, where it was first recorded: SET ROLE with nothing granting membership, and grants issued outside that window. Still works only because momo is the superuser. Repeated here because this slice added a second script (db-policies.ts) on the same assumption, so the fix now touches two places.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-rls-and-withtenant.md`
  summary: The `tenant` table is class `global`, so the application role can read every Tenant's name.
  evidence: By design at this stage and recorded so it is not mistaken for a leak: the isolation boundary for the tenant list itself is the membership join that story 1.4 introduces with tenant_membership, not a row policy. Until then any authenticated application connection can enumerate tenant names — acceptable while there is one tenant and no auth.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-rls-and-withtenant.md`
  summary: apps/web has no automated test at all, so its move onto the restricted role rests on a hand-run check.
  evidence: Confirmed: vitest.config.ts collects nothing under apps/web, so none of the five server actions and none of the six routes are covered. The role move was verified by running the app and reading pg_stat_activity. The next slice's rewiring onto use cases is what makes this testable without a browser, which is why it waits.
  resolved: YES, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). `apps/web/src` now holds nine test files, and `tests/web-composition.test.ts` asserts `getDb(APP_URL)` on both the read and write paths — the restricted-role claim no longer rests on a hand-run check. (The thin-action and page-render half is its own entry and stays open.)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-rls-and-withtenant.md`
  summary: A percent-encoded role name in APP_DATABASE_URL would break the grants assertion's grantee comparison.
  evidence: Narrow: parseAppRoleIdentity decodes the name when creating the role, but the test compares against the raw URL username. Only bites if a role name ever needs encoding, which is unlikely for a name matching the role-name pattern the migrator enforces.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-rls-and-withtenant.md`
  summary: `mapping_event.seq` and `actuals_ledger_entry.seq` are allocated by a SECURITY DEFINER `MAX(seq) + 1` function, which is collision-free across Tenants but still races between two concurrent callers.
  evidence: By construction, and recorded in the function's own comment. Review round 1 replaced the application-side `MAX(seq) + 1` — which row-level security had turned into a cross-tenant primary-key collision — with `momo_next_<table>_seq()`, reading the true maximum as the table owner. That fixes the collision between Tenants and does nothing about the one between concurrent callers: two actions reading it in the same instant get the same value and the second INSERT fails on the primary key. Correct behaviour under the architecture is `pg_advisory_xact_lock` in its two-argument form taken BEFORE allocation, which is the watermark slice already recorded above. Harmless today (single user, one demo Project) and it becomes real the first time two PMs disposition Tickets at once. The allocators are the right place to put the lock when that slice lands.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-rls-and-withtenant.md`
  summary: `seed.ts` refuses to run against a database holding any other Tenant, rather than deleting only its own rows.
  evidence: Deliberate, and the reasoning is in the code. The seed TRUNCATEs, TRUNCATE is exempt from row-level security, so the alternative — leaving it able to empty every Tenant's tables — was the defect review round 1 raised. A tenant-scoped DELETE was rejected because the truncate carries `RESTART IDENTITY`, and those counters are what make a re-seed reproduce the same `baseline_version.seq` the fixture's ledger entries were recorded against; a DELETE would leave them advanced and the second seed would stamp a different active Baseline sequence, silently reclassifying the Actuals. The cost is that a database with two Tenants cannot be re-seeded at all, which `packages/db/src/rls.test.ts` works around by removing its probe Tenant in `afterAll` — so an interrupted test run leaves the seed refusing until that row is deleted. The real fix is a seed that writes fixture-relative sequence values rather than depending on identity restart, which is the load-fixture generator story 1.8 owns.
  resolved: YES, 2026-09-22 in `spec-1-8-a-load-fixture-worth-measuring-against.md` — fixture-relative identity seqs via OVERRIDING SYSTEM VALUE; truncate no longer uses RESTART IDENTITY. Single-Tenant refuse guard remains.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-rls-and-withtenant.md`
  summary: The `maintenance_bypass` policy is `USING (true)` on every tenant-owned table, so a maintenance session sees all Tenants at once.
  evidence: Deliberate — a hatch that could not reach a row was the defect review round 1 raised, and the tenant policy applies to PUBLIC, so without a permissive policy scoped `TO momo_maintenance` a maintenance session matched nothing unless it also set `app.tenant_id`. The residual risk is that the hatch is all-or-nothing: the protections that remain are that `momo_maintenance` is NOLOGIN (reached only by `SET ROLE` from an owning connection), holds grants on append-only tables alone, and still needs `app.maintenance = 'on'` for the trigger to let a statement through. A narrower design would scope the bypass to the tenant in force and require the operator to name it, which trades the ability to fix a cross-Tenant problem in one statement. Revisit if a second person ever holds the database.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-cross-tenant-harness.md`
  summary: Three of the relabeller's twenty-three preserved-vocabulary entries are load-bearing for the current read surface; the other twenty are defensive, and breaking one of them fails nothing.
  evidence: Measured on 2026-09-21 by removing entries one at a time and running the harness. `'opening_balance'` and `'rule'` move numbers the harness compares (`openingBalanceMh`, `rules[].currentlyMapped`); `'hours'` fails the label census. `'delta'`, `'category'` and `'manual'` change nothing, because the current read surface never re-derives a Ledger entry or re-evaluates a Mapping Rule — `buildDemoState()` does that BEFORE the relabelling, so the stored events already carry their outcome. The entries are still correct and still needed: the moment a use case ingests a Snapshot or re-runs rules against stored rows (Epic 2 and Epic 5), rewriting one of them changes the meaning of the data rather than its names. The gap is that the harness cannot tell today which of them matter, so a wrong one could be added or removed unnoticed. The fix is a write use case in the harness, which arrives with the story that adds one.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-cross-tenant-harness.md`
  summary: The harness reaches 14 of the 16 tenant-owned tables; `app_user` and `audit_log` have no read use case at all, so nothing in the product proves their isolation at use-case level.
  evidence: Measured with a Drizzle query logger over every registry entry, and asserted both ways in `packages/db/src/read-use-cases.ts` so a change is a decision. `rls.test.ts` still covers both at TABLE level (FORCE, the policy predicate, the grants, the append-only triggers), so they are not unprotected — they are unexercised by a use case. Both close on their own schedule: story 1.4 replaces `app_user` with the identity tables plus the membership bridge and gives `resolveRequestContext` the one read of it, and story 1.7 gives the Tenant Admin the audit-log viewer. When either lands, the entry must come out of `UNREACHED_TENANT_OWNED_TABLES` or the reach assertion fails — which is the point.
  resolved: YES — `app_user` closed with story 1.4 (identity tables + membership bridge). `audit_log` closed 2026-09-22 in `spec-1-7-the-tenant-admin-can-read-the-audit-log.md`: `listAuditLog` registered as `kind: 'read'`, `audit_log` removed from `UNREACHED_TENANT_OWNED_TABLES`.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-cross-tenant-harness.md`
  summary: The harness proves isolation for READS only. No write use case is enumerated, so a cross-Tenant write is covered by the policy's WITH CHECK and by one hand-written probe in `rls.test.ts`, not by an enumeration.
  evidence: Deliberate and in scope as written — NFR-S1 and AC 5 are about what a read returns, and `apps/web`'s five writes live in `actions.ts` rather than in an enumerable use-case surface. `rls.test.ts` does assert that an INSERT naming another Tenant is refused with 42501, so the quiet direction is not unguarded. The registry already carries a `kind` field so a write entry can be added beside the reads; what it needs is a matching assertion shape (write under A, assert nothing landed under B, roll back) and a write surface to enumerate. Pick it up with the story that moves the writes into `packages/app` use cases.
  resolved: YES, 2026-09-21 in `spec-1-2-web-write-use-cases.md`. The five writes are on the enumerated surface (`packages/app/src/use-cases/index.ts`), registered as `kind: 'write'`, so the no-database gate names an unregistered write. `tests/cross-tenant-writes.test.ts` drives each: a foreign-Tenant write answers `not_found` and leaves the row count of every tenant-owned table unchanged for both Tenants; an own-Tenant write lands exactly the expected rows on a dedicated probe Tenant.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-cross-tenant-harness.md`
  summary: A probe Tenant left behind by an interrupted harness run makes `pnpm seed` refuse until it is deleted by hand.
  evidence: Same shape as the entry already recorded for `rls.test.ts`'s probe, and the same root cause: the seed refuses to run beside a second Tenant because it TRUNCATEs. The harness removes both probes in `afterAll` and then VERIFIES they are gone, throwing if they are not, so an ordinary failure — including a `beforeAll` that dies part-way through writing a probe — still cleans up; measured on 2026-09-21 across nine sabotage runs, two of which failed inside `beforeAll`. A hard kill (SIGKILL, a crashed container) still leaves rows. The ids are deterministic, so `createProbeTenant` deletes before it writes and a re-run recovers on its own; the residual cost is only that `pnpm seed` refuses in between. The real fix is the seed writing fixture-relative sequence values instead of depending on identity restart, which story 1.8's load-fixture generator owns.
  resolved: PARTIAL, 2026-09-22 in `spec-1-8` — fixture-relative seqs land; seed still refuses beside a second Tenant (TRUNCATE is all-Tenant).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-cross-tenant-harness.md`
  summary: The harness's symmetry comparison normalises `seq`, `activeBaselineSeq` and `activeBaselineVersionSeq` by KEY NAME, so a wrong value in a future field with one of those names would be normalised away.
  evidence: Necessary, because the database allocates those values and two Tenants therefore cannot agree on them: `baseline_version.seq` is `generatedAlwaysAsIdentity` and the two probes get 2 and 3, while `actuals_ledger_entry.seq` and `mapping_event.seq` are caller-allocated global primary keys drawn from deliberately disjoint bands. Normalising by value was rejected — the probes' baseline seqs are 2 and 3, and `mapping_rule.priority` is also 1 and 2, so a value-based rule would corrupt the comparison. Normalising by path was rejected as per-use-case knowledge. The residual risk is narrow: it is only the SYMMETRY assertion that is blinded, and the numeric-census assertion (every number equal to the demo Tenant's, same exclusion) plus the fixture-value floor still cover those fields' data. Revisit if a future result type gives a non-sequence field one of those three names.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-cross-tenant-harness.md`
  summary: `repo.ts` selects `baseline_wp` and `rate_entry` with no WHERE and re-filters them in memory, so an over-permissive policy on either pulls every Tenant's rows into the process while the caller's result stays clean.
  evidence: Found at the Tasks & Acceptance check on 2026-09-21 by sabotaging each of the four unfiltered reads separately rather than one of them. `USING (true)` on `actuals_ledger_entry` and on `tracker_snapshot` failed 6 and 9 assertions; on `baseline_wp` and `rate_entry` it failed NONE, because `loadBundleInTenant` discards the foreign rows in JavaScript afterwards — by `baselineVersionSeq` (repo.ts:117) and by `resourceId` (repo.ts:136), both of which differ per Tenant. The harness now asserts table-level isolation over the MEASURED reach set, which closes the gate; what is NOT closed is the read surface itself. Reading whole tables and filtering in memory is already recorded as a performance entry against story 1.8's fixture; this is the security half of the same line. The rows crossing the boundary is not a leak to the caller today, but it is one connection-reuse or one added `console.log` away from being one, and it is the difference between "the policy is the control" and "the policy plus a JS filter nobody wrote for that purpose are the control". Give both selects a `WHERE` when the reads move onto `packages/app` use cases.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-cross-tenant-harness.md`
  summary: `loadProjectBundle` and `loadReview` still default `projectId` to the demo Project, so a forgotten Project id silently reads `prj-ec2`.
  evidence: Read from `repo.ts:62` and `repo.ts:281`. Story 1.2 slice 1's review round 1 removed exactly this default from `tenantId`, for exactly this reason — "a default meant a forgotten Tenant silently read `ten-momo`" — and left the neighbouring `projectId` default in place. Under a Tenant that does not own `prj-ec2` the read now throws rather than returning another Tenant's data, so it is not a leak; it is the same class of bug one argument to the left, and it makes `loadReview(db, tenantId)` type-check. One caller relies on it: `scripts/peek-db.ts`. Left here rather than patched because this slice's Never list forbids changing the read surface, and the next slice rewrites both signatures onto use cases anyway. UPDATE 2026-09-21 (story 1.2 slice 3): the use cases do NOT carry the default forward — `getProjectHeader`/`getProjectReview` answer `invalid_input` for an empty or absent `projectId` and never call the repository — so no page can reach it. The repository's own default is still there, because that slice could not change `packages/db`'s public behaviour, and `scripts/peek-db.ts` still relies on it.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-cross-tenant-harness.md`
  summary: The mechanical coverage gate enumerates one module, so a read added anywhere but the read surface ships with no isolation cover and no red build — and two such reads already exist in `apps/web/src/app/actions.ts`.
  evidence: Found by the verification-gap review on 2026-09-21 and confirmed at the lines. `anchorOf` issues `tx.select().from(s.project)` (actions.ts:115) and `planTickets` issues `tx.select().from(s.workPackage)` (actions.ts:151), both reached through the barrel's `schema`/`withTenant` exports rather than through `repo.ts`. They are helpers inside WRITE actions, so the read-use-case surface really is the two functions in `repo.ts` and the acceptance criterion holds — but `readSurfaceFunctionNames()` cannot see them, `source-discipline.test.ts`'s bare-handle regex does not match `webDb()`/`tx`, there is no dependency-cruiser, and `apps/web` has no test at all. Demonstrated: adding a third read to `actions.ts` leaves every assertion in `cross-tenant.test.ts` green. The real fix is a second, structural gate — enumerate the modules that import `schema`/`withTenant` from `@momo/db` outside the read surface and require each to be declared with a reason, the way `UNREACHED_TENANT_OWNED_TABLES` declares what is not reached (`source-discipline.test.ts` already walks `git ls-files`, so the scan mechanism exists). It belongs with the slice that moves `actions.ts` onto `packages/app` use cases, because that slice is what makes those two reads enumerable rather than incidental. Until then the claim in `read-use-cases.ts` is narrowed to say so.
  resolved: YES, superseding the earlier partial — 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). Both named reads moved into `packages/db/src/repo-writes.ts` (`anchorOf`, `workPackageInProject`); `apps/web/src/app/actions.ts` imports no `@momo/db`, and `pnpm depcruise` is green over 234 modules. The barrel-escape residue is its own entry and stays open. EARLIER: MOSTLY, 2026-09-21 in `spec-1-2-web-write-use-cases.md`. The two reads named here (`anchorOf`, `planTickets`'s Work Package select) moved into `packages/db/src/repo-writes.ts`, inside write use cases the harness now enumerates and drives. And the class of bug — an `apps/*` file reaching `schema`/`withTenant` directly — is now a red build: `pnpm depcruise` forbids any `apps/*` import of `packages/db` outside the composition root. What remains open is the neighbouring gap from the slice-3 review: a use case exported from the `@momo/app` barrel rather than `use-cases/index.ts` still escapes the enumeration.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-cross-tenant-harness.md`
  summary: `PRESERVED_VOCABULARY` has no staleness gate, so a typo'd entry or one for a value the fixture no longer holds is undetectable.
  evidence: The implementation measured that only three of the twenty-three entries fail anything when removed, which is the same fact from the other side: twenty entries are believed rather than verified. Asserting that each entry occurs in `collectStrings(buildDemoState())` would catch a typo, but roughly twelve entries legitimately never appear in the demo fixture — `'請負'`, `'jira'`, `'backlog'`, `'cr_candidate'`, `'explain'`, `'map'`, `'plan'`, `'disposition'`, `'milestone'`, `'issueType'`, `'keyPrefix'`, `'count'` — so the gate needs a forward-looking flag per entry saying which code will read it and when. That is a small design rather than a correction, and it is worth doing when the first write use case joins the harness, because that is when the currently-inert entries become load-bearing.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-cross-tenant-harness.md`
  summary: A registry entry's `name` can name one export while its `invoke` calls another, and both name gates pass.
  evidence: By construction: the two gates compare `READ_USE_CASES[].name` against the module namespace's exported function names, while `invoke` is a hand-written closure nobody ties back to that name. An entry named `loadProjectBundle` whose `invoke` calls `loadReview` would report full coverage while driving one function twice. Harmless today with two entries a reader can check by eye, and progressively less so as the registry grows. The fix is to have the entry carry the function reference — `fn: readSurface.loadProjectBundle` plus an argument adapter — and assert `entry.fn === (readSurface as Record<string, unknown>)[entry.name]`, which changes the registry's public shape and is best done when the surface moves to `packages/app` and every entry is rewritten anyway.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-cross-tenant-harness.md`
  summary: The row writer re-points every non-null ledger `activeBaselineVersionSeq` at the single allocated Baseline sequence, which stops being correct the moment a fixture carries more than one Baseline version.
  evidence: `baseline_version.seq` is `generatedAlwaysAsIdentity`, so the writer reads back the value Postgres allocated and stamps it on every ledger row — correct while `buildDemoState()` yields exactly one version (verified: all 144 demo ledger rows carry `1` against `baselineVersions: [1]`), and silently wrong for any older reference once a re-baselining fixture exists, because `attribution.ts` looks the version up by seq and a miss reclassifies every mapped hour as Unplanned Work. This slice makes the mismatch LOUD (the writer throws naming the distinct values), which is the right guard but not the fix. The fix is a `fixtureSeq -> allocatedSeq` map built as the versions are inserted, and it wants doing with story 1.8's load-fixture generator, which is the first thing that will write more than one Baseline version.
  resolved: YES, 2026-09-22 in `spec-1-8-a-load-fixture-worth-measuring-against.md` — `fixtureSeq → allocatedSeq` map in `writeTenantRows`.

- source_spec: none
  summary: Story 1.2 slice — move `actions.ts`'s five write actions onto `packages/app` use cases, switch dependency-cruiser on, and register the writes in the cross-tenant harness.
  evidence: Split from the read-rewiring slice on 2026-09-21 at the Build multi-goal gate, with the founder choosing reads first. The two halves are separable because the seven read call sites and the five writes share no code: the reads go through `loadProjectBundle`/`loadReview`, while `actions.ts` imports `drizzle-orm` directly and issues its own `tx.insert`/`tx.select`. They are not separable from the GATE, though — `epics.md:529` requires dependency-cruiser to go on after the rewiring, and `actions.ts` is the file that still imports Drizzle, so the gate cannot go on until the writes move. Hence the split is reads-then-(writes + gate), not (reads + writes)-then-gate. Measured for that slice: 12 violating imports across 11 files today, of which `apps/web/src/app/actions.ts` carries two classes (`@momo/db` at :5, `drizzle-orm` at :4). The gate's breadth was decided at the same gate: AC-6's wording (`apps/*` may not import a repository or Drizzle), NOT full AD-1 — which would also flag `apps/worker`'s `pg-boss` (boss.ts:8) and `pg` (worker-round-trip.test.ts:3) and drag the queue-adapter move into `packages/adapters` along with it. `dependency-cruiser` is pinned at 18.3.1 by ARCHITECTURE-SPINE.md:598 with config at `.dependency-cruiser.cjs`; note latest is 18.4.0 as of 2026-09-20, so the pin is one release stale. The harness already reserves `UseCaseKind` for a write entry, and six preserved-vocabulary entries stay unexercised until one exists.
  resolved: YES, 2026-09-21 in `spec-1-2-web-write-use-cases.md`. Five write use cases (`mapTickets`, `planTicketsAsWorkPackage`, `explainTickets`, `markChangeRequestCandidates`, `mapTicket`) behind `ProjectWritePort`, satisfied structurally by `packages/db/src/repo-writes.ts`; `actions.ts` parses and calls; dependency-cruiser 18.3.1 on in CI; the writes registered in the harness. Rows landed by the five forms on `prj-ec2` diffed identical against the baseline commit.

- source_spec: none
  summary: The `apps/worker` side of AD-1 is not covered by the dependency-cruiser gate as scoped: `pg-boss` and the `pg` driver are imported from `apps/worker` directly.
  evidence: AD-1 (ARCHITECTURE-SPINE.md:79) says `apps/web` and `apps/worker` call only `packages/app` use cases and `packages/i18n`. Measured 2026-09-21: `apps/worker/src/boss.ts:8` imports `pg-boss` and `apps/worker/src/worker-round-trip.test.ts:3` imports `pg`. The spine's own structural seed puts the queue adapter in `packages/adapters`, so the honest fix is to move the pg-boss binding there behind a port and leave `apps/worker` with a start command and a use-case call. Deliberately out of the gate's first scope — AC-6 names only repositories and Drizzle, and pulling the adapter move in would be exactly the day-one-red the epic warns about. Revisit when `packages/adapters` gains its first real adapter, or when the scheduler stories (Epic 2's AD-26/27/28 gates) need the port anyway.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-web-read-use-cases.md`
  summary: A SECOND import carve-out now exists beside `packages/db/auth`: `apps/web/src/server/composition.ts` is the one file under `apps/web` permitted to import `@momo/db`.
  evidence: Decided at approval on 2026-09-21 and recorded here as the spec requires. ARCHITECTURE-SPINE.md calls `packages/db/auth` "the single carve-out"; that sentence is now wrong and should be amended when the spine is next touched. The composition root builds the restricted-role handle, hands `loadProjectBundle`/`loadReview` to `packages/app`'s `ProjectReadPort` (structural match checked by a `satisfies` at that line — watched to fail with TS2322 when the port and the repository drift), and constructs `{ tenantId }`. The next slice's dependency-cruiser rule should allow this exact path and nothing matching a pattern. The harness (`tests/cross-tenant.test.ts`) is a composition root of its own for the same reason, and lives outside every package so the rule set needs no second ignore.
  resolved: YES, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). AD-1 records the carve-out as a named path and `apps-not-to-db`'s `pathNot` is that exact path.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-web-read-use-cases.md`
  summary: Two `apps/web` files still import `@momo/db`, not one — `actions.ts` is out of scope and keeps its `@momo/db` and `drizzle-orm` imports until the writes move.
  evidence: The spec's second acceptance criterion ("exactly one file imports `@momo/db`") and its verification grep ("exactly one hit") cannot both hold while its own Code Map and Never list keep `actions.ts` — which imports `drizzle-orm` at :4 and `@momo/db` at :5 — out of scope. Measured after this slice: `grep -rln "@momo/db\|drizzle-orm" apps/web/src` lists `composition.ts` and `actions.ts` (plus a comment line in `actions.ts`). All seven READ call sites import neither, which is the first criterion. Re-routing `actions.ts`'s `@momo/db` import through a re-export in `composition.ts` would have made the grep read one hit while `actions.ts` still reached the repository — laundering the violation past the very rule the next slice writes — so it was not done. `actions.ts`'s only change is its `@/server/db` import becoming `@/server/composition`. Closes with the writes slice. UPDATE 2026-09-21 (after PR #16): the spec's AC-2 was reworded to name `actions.ts` as the one remaining importer; the gap itself still closes with the writes slice. Its twin: `composition.ts` exports `webDb()` and `WEB_TENANT_ID` for `actions.ts` alone, which AD-1 (as amended 2026-09-21) forbids — the composition root exports use-case bindings only. Both close with the writes slice.
  resolved: YES, 2026-09-21 in `spec-1-2-web-write-use-cases.md`. `actions.ts` imports neither `@momo/db` nor `drizzle-orm`; `composition.ts` is the only `apps/web` source file importing `@momo/db` and no longer exports `webDb()` or `WEB_TENANT_ID` (both module-private; it exports use-case bindings only). `drizzle-orm` and `pg` were dropped from `apps/web/package.json` — typecheck, `next build` and `next start` all still work.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-web-read-use-cases.md`
  summary: The use cases recognise an invisible Project by the repository's error MESSAGE (`project <id> not found`), because `packages/db`'s public behaviour could not change in this slice.
  evidence: `repo.ts` throws a plain `Error` for a Project the Tenant cannot see; `packages/app` cannot import a class from `packages/db`, and the spec forbids changing `packages/db`'s behaviour. So `isProjectNotFound` in `packages/app/src/ports/project-read.ts` matches the message prefix on the caller's own `projectId`, and everything else propagates. The coupling is pinned from both sides: `packages/app/src/use-cases/project-reads.test.ts` asserts the exact wording, and the harness's cross-Tenant probe fails (the use case then THROWS instead of answering `not_found`) if `repo.ts` rewords it — watched to fail by removing the mapping. The durable fix is a typed failure the port declares — the repository resolving `null`, or rejecting with an object carrying a `code` — and it belongs with whichever slice is next allowed to change `repo.ts`'s signatures (the `projectId` default below wants the same change).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-web-read-use-cases.md`
  summary: `ProjectBundle` is declared twice — in `packages/db/src/repo.ts` and in `packages/app/src/ports/project-read.ts` — because neither package may import the other.
  evidence: The port restates the repository's shape so the pages can type against `packages/app`. The two are held in step by the typecheck in both directions: the composition root fails if the repository returns less than the port promises, and the pages fail if the port promises less than they read. What the typecheck does NOT catch is the repository growing a field the port never learns about — the field is then invisible to the pages rather than wrong. Harmless while the only change process is "edit both"; the clean fix is for `repo.ts` to stop declaring the type and return `packages/domain`'s, which needs a domain change this slice's Never list forbids.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-web-read-use-cases.md`
  summary: Pointing a page back at `@momo/db` directly is caught by nothing automated until the dependency-cruiser gate lands.
  evidence: Sabotaged on 2026-09-21: `import { loadReview } from '@momo/db'` added to `baselines/page.tsx` left `pnpm lint` and the web typecheck at exit 0; only the verification grep shows it. Expected — the gate is the next slice's, deliberately — but it means this slice's first acceptance criterion is held by review and grep alone until then.
  resolved: YES, 2026-09-21 in `spec-1-2-web-write-use-cases.md`. The same sabotage now fails `pnpm depcruise`: `error apps-not-to-db: apps/web/src/app/p/[projectId]/baselines/page.tsx → packages/db/src/index.ts` — and so does a type-only import, a relative path into `packages/db`, and `drizzle-orm` from `actions.ts`.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-web-read-use-cases.md`
  summary: The harness registry still lets an entry's `name` and its `invoke` disagree; the earlier entry said to fix it "when the surface moves to `packages/app`", and this slice did not.
  evidence: This slice rewrote both registry entries (they now call `getProjectHeader`/`getProjectReview` with a `ProjectReadDeps` and a context), but kept the registry's shape — a hand-written `invoke` closure — because the spec's task list scoped the change to the pointer and the `invoke` signature. The fix recorded above (carry the function reference, assert it equals the namespace's export) is unchanged and now has no reason left to wait.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-web-read-use-cases.md`
  summary: Review round 1 (B1/V2) confirms the registry name/invoke gap above is real at use-case level — an entry named `getProjectHeader` whose `invoke` calls `getProjectReview` passes every assertion and leaves the layout's use case with no RLS cover.
  evidence: The gate compares registry names with the namespace only; both use cases take the same deps, context and input, and both declare `mustSurface: projectBundleLabels`, whose labels `getProjectReview`'s result also carries. Fix as recorded above: entries carry the function reference and the gate asserts it equals the namespace export.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-web-read-use-cases.md`
  summary: A use case exported from the `@momo/app` barrel (`packages/app/src/index.ts`) rather than from `use-cases/index.ts` reaches `apps/web` and escapes the coverage gate.
  evidence: `readSurfaceFunctionNames()` reads only `packages/app/src/use-cases/index.ts`, while `apps/web/src/server/composition.ts` imports from the barrel; only a comment in `use-cases/index.ts` prevents it. Same class as the "enumerates one module" entry. Fix: assert every function the barrel exports is on the use-case surface or on a named non-use-case list (the barrel now exports only `config` and the use cases at runtime, so the list is short).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-web-read-use-cases.md`
  summary: Every project page loads the Project bundle twice — the layout through `getProjectHeader`, the page through `getProjectReview` — about 30 selects per request instead of 15.
  evidence: Pre-existing (the layout and pages called `loadProjectBundle` and `loadReview` separately before this slice). The composition root is now the single place to fix it: wrap the two exported functions in React's `cache()` keyed on `projectId`, or have the layout read the header from the Review.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-web-read-use-cases.md`
  summary: ARCHITECTURE-SPINE.md:81 still says AD-1 has "One carve-out" (`packages/db/auth`); `apps/web/src/server/composition.ts` is now a second.
  evidence: Measured 2026-09-21. It is a planning document: amending it invalidates the cached epic-1 context and is a planning decision, so it waits for the human rather than being edited by a build run. The carve-out itself is recorded in the entry above. RESOLVED 2026-09-21 (after PR #16): AD-1 now names two carve-outs, the second being `apps/web/src/server/composition.ts`, one named file; the human approved recording it at walkthrough, and the wording was narrowed after adversarial review (`reviews/review-adversarial-ad1-carve-out.md`).
  resolved: YES, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). The spine no longer says "One carve-out". This entry already carried its own resolution in prose; it lacked the machine-readable field, which is the ledger-hygiene problem the retrospective raised separately (F16).

- source_spec: `spec-1-2-web-write-use-cases.md`
  summary: The Plan Disposition's Work Package id is `wp-new-<anchor ms>`, a GLOBAL primary key — so a second Plan on the same Project fails, and a Plan whose id collides with another Tenant's row is an existence oracle across Tenants.
  evidence: Pre-existing and preserved on purpose — the spec requires the same ids. Measured reasoning: `work_package.id` is the table's primary key across all Tenants, and `at` is the Project's fixed `demoAnchor`, so every Plan on a Project computes the same id; the second one raises a unique violation (a 500 on the page). The relabelled probe Tenants share the demo anchor, so a probe Plan and a demo Plan compute the SAME id — a primary-key violation raised for a row the caller cannot see under row-level security, which tells it that row exists. `tests/cross-tenant-writes.test.ts` runs exactly one Plan, on its own probe Tenant, for this reason. The fix is the architecture's app-generated UUIDv7 ids (and the Clock port for `at`), which is not a rewiring; do it with the first story that writes Work Packages for real (Epic 2).

- source_spec: `spec-1-2-web-write-use-cases.md`
  summary: `mapping_event.id` and `disposition_event.id` (`map-<ticket>-<ms>`, `disp-<kind>-<ms>`) repeat for every submission at the same anchor — they are not identifiers.
  evidence: Pre-existing, preserved (the spec requires the same ids). Neither column is a key (`seq` is), so nothing fails; but two Explains on one Project carry the same `id`, and anything that ever keys on it will merge them. Measured in slice 4's baseline diff: every row landed by the five forms shares the suffix `1789549200000`. Same fix as the entry above (UUIDv7).

- source_spec: `spec-1-2-web-write-use-cases.md`
  summary: A write against a Project that does not exist used to land rows; it now answers `not_found` and lands nothing. Behaviour change, intended.
  evidence: Measured 2026-09-21 on a worktree of the baseline commit: POSTing the Map form with `projectId=prj-nope` wrote a `disposition_event` and `audit_log` row for a Project that does not exist, stamped with the WALL-CLOCK time (`anchorOf`'s `new Date()` fallback). The same POST on this slice writes nothing. The spec asked for exactly this (an invisible Project answers `not_found`); recorded so nobody reads the diff as a regression. The web action treats `not_found` as the early return it always used for an unusable form — no error is shown to the user.
  resolved: OBSOLETE, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). This is a changelog note ("behaviour change, intended"), not deferred work — there is nothing to do. The behaviour it records is now pinned by `tests/cross-tenant-writes.test.ts`.

- source_spec: `spec-1-2-web-write-use-cases.md`
  summary: `apps/web` no longer declares `pg`, while `next.config.ts` still lists it in `serverExternalPackages`; at runtime it resolves through `@momo/db`'s own dependency.
  evidence: Measured: `pnpm --filter @momo/web typecheck`, `next build` and `next start` (all six routes 200, golden figures rendered, `momo_app` in `pg_stat_activity`) pass with `drizzle-orm` and `pg` dropped from `apps/web/package.json`, as the spec allowed. What was not measured is a standalone/Docker build (`output: 'standalone'`), which traces externals differently; revisit with Epic 8's image, and put `pg` back in `apps/web` if the trace misses it there — a runtime dependency is not an import, so dependency-cruiser does not care either way.

- source_spec: `spec-1-2-web-write-use-cases.md`
  summary: The harness registry keeps its read-era names (`READ_USE_CASES`, `ReadUseCase`, `readSurfaceFunctionNames`, `tests/read-use-cases.ts`) though it now registers writes too.
  evidence: Deliberate, to keep this slice's diff to the harness small and the spec's file references valid; each name carries a comment saying it predates the writes. Rename when the next kind of use case joins (story 1.3's audited org writes are the likely moment).

- source_spec: `spec-1-2-web-write-use-cases.md`
  summary: `.dependency-cruiser.cjs` resolves every module under `apps/` and `packages/` through `apps/web/tsconfig.json`.
  evidence: One `tsConfig` per run is what dependency-cruiser takes. `apps/web`'s tsconfig extends the base, so it resolves every `@momo/*` path the base does plus `@/…`; `apps/worker` uses the base's paths and no alias of its own, so today nothing resolves wrongly (measured: 103 modules, the composition root's edge lands on `packages/db/src/index.ts`, `drizzle-orm` lands in `node_modules/.pnpm/…`). If `apps/worker` ever gains a `@/` alias pointing elsewhere, give it its own depcruise run or a root tsconfig that states both. Note also that a RELATIVE `tsConfig.fileName` makes dependency-cruiser resolve `extends` against the wrong directory (measured: it looked for `apps/web/tsconfig.base.json`), hence the absolute path. UPDATE 2026-09-21 (review round 1 of spec-1-2-web-write-use-cases): no longer true — resolution now goes through a root `tsconfig.depcruise.json`, because `apps/web/tsconfig.json`'s `@/*` path, having no `baseUrl`, resolved against the repo root and no `@/…` import had ever resolved; `not-to-unresolvable` now fails on that class.
  resolved: OBSOLETE, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). Resolution no longer runs through `apps/web/tsconfig.json`: dependency-cruiser resolves via the root `tsconfig.depcruise.json`, and `not-to-unresolvable` is green across all 234 modules.

- source_spec: `spec-1-2-web-write-use-cases.md`
  summary: ARCHITECTURE-SPINE.md AD-1's "Until story 1.2's writes slice lands …" bullet is now stale: both tracked violations it lists are gone and the dependency-cruiser rule it promises is on.
  evidence: Measured 2026-09-21 against this slice. It is a planning document, and editing it invalidates the cached epic-1 context, so it waits for the human rather than being edited by a build — same treatment as the earlier "One carve-out" entry. RESOLVED 2026-09-21 (docs PR after #18): the bullet is replaced by what the gate enforces and what it does not, reviewed adversarially (`reviews/review-adversarial-ad1-gate-on.md`); the same change narrowed `.dependency-cruiser.cjs` to the carve-outs as written (Drizzle forbidden to the composition root too; `packages/db/auth` for `apps/web` only).
  resolved: YES, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). AD-1's stale bullet was replaced by the enumerated "what the gate enforces today" list, which matches the config rule for rule. Prose resolution was already recorded here; the field was missing.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-web-write-use-cases.md`
  summary: The dependency-cruiser gate enforces only `apps/*` → `packages/db`/Drizzle and the scheduling edges; the package-level directions AD-1 draws (`packages/db` ↛ `packages/app`, `packages/app` ↛ `packages/db`, `packages/domain` → `zod` only) are unenforced.
  evidence: Review round 1 (B2). The structural-port design depends on `packages/db` never importing `@momo/app`; one such import would pass CI today. Green to add now; kept out because the approved intent scoped the gate to AC-6's wording. Add with the next change to `.dependency-cruiser.cjs`. UPDATE 2026-09-21 (story 1.3 slice 2): partly resolved — `packages/app`, `packages/domain` and `packages/db` importing `packages/adapters` is now gated (`inner-packages-not-to-adapters`); `db` ↔ `app` and `domain` → anything-but-`zod` remain.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-web-write-use-cases.md`
  summary: `apps-not-to-db` does not forbid the raw `pg` driver in `apps/web`, which is a worse bypass than Drizzle.
  evidence: Review round 1 (B3). Kept out of `apps/web` today only by its `package.json` no longer declaring `pg`; the standalone-build entry may put it back. Add `pg` to the rule's `to` for `^apps/web/` (not `apps/worker`, out of scope as decided).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-web-write-use-cases.md`
  summary: A write to a Tenant's OWN Project may name another Tenant's Ticket or Work Package ids, and lands a cross-Tenant reference (`mapping_event.wp_id`, `disposition_event.wp_id`/`ticket_ids`).
  evidence: Review round 1 (B5). No foreign keys on those columns and no ownership check, as before this slice; the spec's Never excludes the validation. Nothing is disclosed (the insert does not read the foreign row), but stored data then points across Tenants. Close with composite FKs including `tenant_id`, or the ownership check, in the story that validates Disposition inputs.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-web-write-use-cases.md`
  summary: The harness's own-Tenant Plan case fails with a primary-key violation on any local database where the demo Tenant has had a Plan submitted, because probe Tenants share the demo anchor and so the `wp-new-<anchor ms>` id.
  evidence: Review round 1 (B6/E1). Same root cause as the `wp-new-<anchor>` entry above; the failure message then points at the write rather than at local state. Resolves with that entry's id change; until then reseed before running the suite.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-web-write-use-cases.md`
  summary: CI never runs `next build`/`next start`, so removing `pg`/`drizzle-orm` from `apps/web/package.json` is verified by a hand run only.
  evidence: Review round 1 (V2). Vitest resolves `@momo/db` through an alias, not Next's server-external resolution, so a later hoisting or standalone-trace change that leaves `pg` unresolvable ships green. Close with a `next build` CI step or the Epic 8 image.
  resolved: YES, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). CI runs `pnpm --filter @momo/web build`, which is the closure condition this entry stated.

- source_spec: `_bmad-output/planning-artifacts/architecture/architecture-momo-keikaku-2026-09-20/ARCHITECTURE-SPINE.md`
  summary: Eight `apps/web` files import `packages/domain` directly (`hours`, `hoursSigned`, `share`, `yen`, `present`, `Metric`, `clientProjection`, `DEFAULT_VISIBILITY`, `mappingHead`), an edge AD-1's diagram does not draw, and the dependency-cruiser gate does not forbid it.
  evidence: Found by the adversarial review of the AD-1 gate-on amendment, 2026-09-21. AD-1 says apps call only `packages/app` use cases and `packages/i18n`. Most imports are presentation formatters; `clientProjection` and `mappingHead` are domain logic run in a page. Open decision for the founder: add a `web → domain` arrow scoped to presentation (and move the two functions behind use cases), or forbid the edge and move the formatters to `packages/app`/presentation. Whichever is chosen, the gate gains the matching rule when that fix lands — forbidding the edge first would be red on day one.
  resolved: YES, 2026-09-21 in `spec-web-present-edge.md`. The founder allowed the edge for `domain/present` only. Every `apps/web` import of the domain is now `@momo/domain/present` (formatters plus the `Mh`/`Ratio`/`Metric`/`Jpy` types it re-exports); `clientProjection` + `DEFAULT_VISIBILITY` moved behind the `getClientView` use case and `mappingHead` + the Ticket sort behind `getProjectMapping`, both registered in the cross-tenant harness. `.dependency-cruiser.cjs` rule `web-to-domain-present-only` forbids `apps/web` → `packages/domain` except `packages/domain/src/present/index.ts` — the codec in `present/codec.ts` included, which `present/index.ts` no longer re-exports — watched to fail on the barrel, a `review` subpath, the codec subpath and a relative path. The ARCHITECTURE-SPINE AD-1 amendment follows separately.

- source_spec: `_bmad-output/planning-artifacts/architecture/architecture-momo-keikaku-2026-09-20/ARCHITECTURE-SPINE.md`
  summary: "Nothing outside `tests/` imports from it" (AD-1) is unenforced: `pnpm depcruise` cruises `apps/` and `packages/` only.
  evidence: Found by the same review. Nothing violates it today. Add a rule forbidding `^(apps|packages)/` → `^tests/`, which needs no change to the cruise scope because the edge's origin is cruised.
  resolved: YES, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). The rule exists and is wider than asked: `no-test-or-tooling-in-source` bans `^(apps|packages)/` → `^(tests|scripts)/`, probed by `tests/depcruise-fences.test.ts`. Its two deliberate carve-outs (in-package `*.test.ts`, `scripts/` as an origin) are stated in the rule.

- source_spec: `_bmad-output/planning-artifacts/architecture/architecture-momo-keikaku-2026-09-20/ARCHITECTURE-SPINE.md`
  summary: The remaining edges of AD-1's diagram have no dependency-cruiser rule: nothing imports `apps/*`, `packages/i18n` imports nothing from the workspace, `apps/*` do not import `packages/adapters`, `packages/adapters` does not import `packages/db`.
  evidence: Found by round 2 of the adversarial review of the AD-1 gate-on amendment, 2026-09-21. None has code to flag today (`packages/i18n` and most of `packages/adapters` do not exist yet), so each is green to add; write them with the next change to `.dependency-cruiser.cjs`, alongside the package-direction and raw-`pg` entries above. UPDATE 2026-09-21 (story 1.3 slice 2): `apps/*` → `packages/adapters` is now gated (`apps-adapters-only-from-composition-root`, only the composition root may).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-arithmetic-and-codec.md`
  summary: The Review page now calls non-presentation domain helpers (`costOf`, `ratio`, `isBehindPlan`, `compareBigint`, `sum`) where it used to do the same arithmetic inline, which widens what the open `apps/web → packages/domain` edge carries.
  evidence: Found while replacing the pages' inline rounding and comparisons (slice 5). No new importing file — the gantt component takes an already-presented `earned` prop instead — but PV/EV money on the Review (`yen(costOf(pvMh, defaultRate))`), a share of the Unplanned total, and the "behind plan" wording are still derived in a page. They belong in the Review's result (or a presentation layer) whichever way the web → domain decision goes; moving them is a new field on `ReviewResult`, which this slice's Never excluded.
  resolved: YES, 2026-09-21 in `spec-web-present-edge.md`. `ReviewResult` gained `money: { pvJpy, evJpy }` (`costOf` at the Project default Rate), `behindPlan` (`isBehindPlan`) and each Unplanned component's `share` (null while cumulative Unplanned is zero); the Review page reads them and imports nothing that computes. `demo-golden.test.ts` pins all three at the baseline commit's rendered values.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-arithmetic-and-codec.md`
  summary: `audit_log.payload` is decoded through the codec only by the write harness; no product code reads it yet, so its decode schema lives in `tests/cross-tenant-writes.test.ts`.
  evidence: Slice 5. The payload shapes (the two write payloads and the seed's) are restated there as zod schemas; story 1.7's audit-log reader should own them, next to the audited-action enum, and the harness should import them from there.
  note: 2026-09-21 — the audited-action enum now exists (`packages/app/src/audit/index.ts`, `AUDIT_ACTIONS`), and the payloads are built by the use cases (`project-writes.ts`), so that module is where 1.7 should put the decode schemas. Still restated in the harness.
  resolved: YES, 2026-09-22 in `spec-1-7-the-tenant-admin-can-read-the-audit-log.md`. Schemas + `AUDIT_PAYLOAD_BY_ACTION` + `decodeAuditPayload` live in `packages/app/src/audit/payloads.ts`; `tests/write-harness.ts` imports `auditPayloadSchema` from there.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-arithmetic-and-codec.md`
  summary: AD-4's rounding fence covers `packages/domain` only; `Math.round`/`.toFixed` can come back into `apps/web` pages.
  evidence: Review round 1 (B4). This slice moved every page's inline rounding into `domain/present`; nothing keeps it there. Extend the arithmetic fence to `apps/**` (with a narrow exception for layout geometry if one is needed) when `.dependency-cruiser.cjs`/lint next change; `formatAge` in `shell.tsx` is minutes, check it first.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-arithmetic-and-codec.md`
  summary: Nothing enforces that `compareRatio` is the only ratio-vs-threshold site, or that `geometryFraction` is the only place a Ratio becomes a float.
  evidence: Review round 1 (B5). A `Number(r.num) / Number(r.den)` or a relational operator on a ratio's parts outside `health.ts`/`present/` passes every gate. A `no-restricted-syntax` selector on `Number(<member>.num)` / `.den` outside those files, or a source-scan test like `source-discipline.test.ts`, would hold it.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-arithmetic-and-codec.md`
  summary: The Review page's own derivations — PV/EV yen, the Unplanned component share, % complete, Gantt progress — are covered only by the manual identical-HTML diff.
  evidence: Review round 1 (V3). `apps/web` has no render test; moving these into `ReviewResult` (already recorded) would put them under `demo-golden.test.ts`.
  resolved: PARTIAL, 2026-09-21 in `spec-web-present-edge.md`. PV/EV yen and the component shares are now `ReviewResult` fields pinned by `demo-golden.test.ts`. % complete and Gantt progress are still presented in the page (`wholePercent`, `earnedProgress`) and covered by the identical-HTML diff only. UPDATE 2026-09-23 in `spec-2-2-the-demo-spike-is-disposed-of-file-by-file.md`: the Gantt half is discharged — the Plan page's Gantt, `gantt.tsx` and `earnedProgress` were removed, so Gantt progress no longer exists. % complete (`wholePercent`) is still presented in the page and remains open.

- source_spec: `_bmad-output/implementation-artifacts/spec-web-present-edge.md`
  summary: The ARCHITECTURE-SPINE's AD-1 (and epic-1-context.md's "open decision" paragraph) still describe the `apps/web → packages/domain` edge as undrawn and undecided, though the code, the rule and this log now say `domain/present` only.
  evidence: The spec's Never list forbade the spine edit in this build ("the AD-1 amendment follows separately"). The amendment should draw the arrow to `domain/present` alone, name the codec as excluded, and add `web-to-domain-present-only` to "what the dependency-cruiser gate enforces now".
  resolved: YES, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). AD-1 carries the decision, the diagram has the dotted presentation arrow, the gate enforces present-only, and `epic-1-context.md` was regenerated. Nothing still calls the edge undecided.

- source_spec: `_bmad-output/implementation-artifacts/spec-web-present-edge.md`
  summary: The cross-tenant harness sanctions one float by KEY NAME: a non-integer number under any key called `fraction` is canonicalised as text instead of being refused by the codec.
  evidence: Found when `getClientView` joined the harness: the client projection carries `earnedProgress`'s layout-geometry `fraction` (slice 5's one sanctioned float), and `canonicalise` serialises through the codec, which refuses floats. The exemption is keyed on the field name, so a float figure that happened to be named `fraction` would pass the harness's multiset comparison. Tightening needs the harness to know the path of the one geometry field, or the projection to carry geometry as an exact Ratio turned into a float only in the component — the latter changes a domain type this spec's Never list held still.
  resolved: YES, 2026-09-23 in `spec-2-2-the-demo-spike-is-disposed-of-file-by-file.md`. The Client View and `earnedProgress` were removed, and with them the `GEOMETRY_KEY = 'fraction'` carve-out in `tests/cross-tenant.test.ts`: no float is sanctioned in any result, so the codec now refuses every one.

- source_spec: `_bmad-output/implementation-artifacts/spec-web-present-edge.md`
  summary: Pages still do plain `bigint` arithmetic of their own — the Plan page's parent roll-up (`rollUp`), the Review page's planned-scope AC (`mappedBaselinedMh + catchAllMh`), the Baselines page's per-version BAC (now a native `reduce`).
  evidence: None of it imports the domain, so the new rule and the intent's "a page imports nothing that computes" both hold; but it is still arithmetic in an inbound adapter. The Baselines total was kept native, as the spec allowed. Moving the Plan roll-up and the planned-scope AC into a use case or `ReviewResult` would finish the job; nothing gates it today. UPDATE 2026-09-21 (AD-1 web → domain/present review): the Plan page also decides two Divergence-style flags itself — `slipped` (current finish after the Baseline's) and milestone overdue — which belong in a use-case result with the rest.

- source_spec: `_bmad-output/implementation-artifacts/spec-web-present-edge.md`
  summary: No dependency-cruiser rule has an automated test that it still fires; every rule (`apps-not-to-drizzle`, `apps-not-to-db`, `other-apps-not-to-db`, `web-to-domain-present-only`, the scheduling rules, `not-to-unresolvable`) was watched to fail by hand once.
  evidence: Review round 1 (V2/B1). `pnpm depcruise` passing shows only that the code is clean today; a loosened `pathNot` or a typo in `to.path` leaves CI green. `tests/lint-fences.test.ts` is the pattern: run dependency-cruiser's API on planted in-memory or temp-dir imports and assert each rule's name appears. Do it for all rules at once.

- source_spec: `_bmad-output/planning-artifacts/architecture/architecture-momo-keikaku-2026-09-20/ARCHITECTURE-SPINE.md`
  summary: No rule stops `apps/worker` importing `packages/domain`; `web-to-domain-present-only` starts from `^apps/web/` only, and AD-1 says the worker has no such edge.
  evidence: Found by the adversarial review of the AD-1 web → domain/present amendment, 2026-09-21. Nothing violates it today (the worker imports only `@momo/app` and `pg-boss`/`pg`). Green to add: `from ^apps/(?!web/)`, `to ^packages/domain/`, with the next change to `.dependency-cruiser.cjs`.

- source_spec: `_bmad-output/planning-artifacts/architecture/architecture-momo-keikaku-2026-09-20/ARCHITECTURE-SPINE.md`
  summary: The Review's SV note says "Ahead of plan" at SV = 0 while the SPI note, from `behindPlan`, says "on or ahead of plan".
  evidence: Pre-existing wording (`svMh < 0n`, `review/page.tsx`), rejected at the slice 5 code review as pre-existing; recorded by the AD-1 web → domain/present review so it is tracked. Fix with the rest of the page's own decisions: an "On plan" case driven from the Review result.

- source_spec: none
  summary: Story 1.3 slice 2 — the organisation hierarchy: the `program` table (`mutable_audited`), and use cases to create, rename and reassign Departments, Programs and Projects (Program only within the Project's owning Department; moving a Project between Programs changes only roll-up), each audited with the previous value through slice 1's mechanism.
  evidence: Split from story 1.3 at the Build multi-goal gate on 2026-09-21, the founder choosing the audit mechanism first so the hierarchy is written on it rather than beside it. No Organisation UI in 1.3 either (decided the same day): the admin surface waits for sign-in and roles (1.4/1.5).
  resolved: YES, 2026-09-21 in `spec-1-3-organisation-hierarchy.md`. `program` (`mutable-audited`) and `project.program_id` exist; the eight organisation writes (create/rename Department, Program, Project; reassign a Project's Program or owning Department) are audited use cases on slice 1's mechanism, each recording the previous value, with the Program-within-Department rule checked inside the transaction. Still not done, as decided: PM assignment (entry below) and any Organisation UI.

- source_spec: none
  summary: FR-1's "assign PMs to Projects" is not done in story 1.3; it belongs with `tenant_membership` (story 1.4's table, `project_ids`) and role reach (1.5).
  evidence: Decided by the founder on 2026-09-21: identity and membership do not exist before 1.4, and an interim `project_pm` table on the legacy `app_user` would be rewritten when 1.4 replaces it. The assignment is audited (NFR-A1 "role changes") when it lands.
  resolved: YES, 2026-09-21 in `spec-1-4-revocation-and-membership.md` — `assignMemberProject` / `unassignMemberProject` write `tenant_membership.project_ids`, audited. What a PM can then REACH through those Projects is still story 1.5's.
  resolved: YES, 2026-09-22 in `spec-1-5-roles-decide-what-each-person-can-reach.md` — Project reach for PM/`tenant_admin` via `authorize` / `reachesProject`.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-audit-mechanism.md`
  summary: The audit gate drives each audited use case with ONE input (its registry entry's `invokeWrite`), so an action chosen on a branch is covered by the gate only on that branch — `mapTicket`'s unmap (`mapping.unmap`) is proved by the unit test and the write harness's unmap case, not by the gate.
  evidence: Found building the gate. The gate asserts "exactly one record, of a declared action" per invocation, which a branch that skips `audit.record` would pass unless the gate drives that branch. Fix when a second branching write lands: let a registry entry carry several write inputs and drive each, requiring every declared action to be seen at least once.
  resolved: YES, 2026-09-21 in `spec-1-3-organisation-hierarchy.md`. A registry entry may carry `moreWrites` beside `invokeWrite`; the gate drives every input and requires each declared action to be recorded by at least one of them. `mapTicket`'s unmap is now driven by the gate.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-audit-mechanism.md`
  summary: The gate proves the audit contract against a FAKE transaction; only the five writes' DB-level rollback tests (`tests/cross-tenant-writes.test.ts`) prove Postgres really rolls the record back — and those loop over the registry's writes, so a new write gets them automatically only if it is driven through the same `inTenantTransaction`.
  evidence: Watched: moving the db audit sink onto its own `withTenant` passed the pure gate and the own-Tenant row tests and was caught only by the DB rollback tests. A write whose `packages/db` side ever returns a scope not built by `inTenantTransaction` would need the same wrapping; the harness's `wrappedDeps` is the place.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-audit-mechanism.md`
  summary: `audit.record`'s payload is `unknown`: nothing ties an action to its payload shape.
  evidence: Review round 1 (B2). A `mapping.map` record could carry a Disposition payload and typecheck. A type map from `AuditAction` to its payload schema, used by `record` and by story 1.7's reader, would give both one source of truth; the schemas live only in `tests/cross-tenant-writes.test.ts` today.
  resolved: PARTIAL, 2026-09-22 in `spec-1-7-the-tenant-admin-can-read-the-audit-log.md`. `AUDIT_PAYLOAD_BY_ACTION` + union schema land beside the enum; the reader decodes through them. Typed `record` overloads (forcing the map at write time) still wait.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-audit-mechanism.md`
  summary: The transaction port and the audited-use-case gate are built around the project write scope; story 1.3 slice 2's organisation writes need a different scope and a matching fake.
  evidence: Review round 1 (B5). `inTenantTransaction` builds only a `ProjectWriteScope`, and the gate's `drive()` fakes only that. Generalise both when slice 2 adds its first write: a scope per repository family, composed, and a registry entry that supplies its own fake.
  resolved: YES, 2026-09-21 in `spec-1-3-organisation-hierarchy.md`. `packages/app` has a generic `AuditedWriteDeps<Handle, Scope>` and `runAuditedWrite` (the project writes' `runProjectWrite` is a thin wrapper, rows unchanged); `WriteDeps`/`WriteScope` compose every repository family. `packages/db`'s `inTenantTransaction` (now `tenant-transaction.ts`) builds one scope carrying the project write repository, the org repository and the audit sink on one `withTenant`. The gate fakes each repository family (`FAKE_FAMILIES`) over the whole scope rather than one project-shaped fake — a per-family fake in the gate rather than a per-entry one, since every write of a family shares it.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-audit-mechanism.md`
  summary: The audited-use-case gate drives each use case with one input, so `mapTicket`'s unmap branch (`mapping.unmap`) is not driven by the gate.
  evidence: Review round 1 (E2), and recorded by the implementation. Covered by the unit test and the harness's unmap test. Fix: a registry entry may supply several inputs, and the gate requires every declared action to be seen at least once.
  resolved: YES, 2026-09-21 in `spec-1-3-organisation-hierarchy.md` — the same change as the entry above (`moreWrites`).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-organisation-hierarchy.md`
  summary: ARCHITECTURE-SPINE.md's AD-1 does not yet draw the `apps/web/src/server/composition.ts → packages/adapters` edge the code, the `apps-adapters-only-from-composition-root` rule and this slice now rely on.
  evidence: The founder's 2026-09-21 decision recorded in the spec says AD-1 "is amended (separately, reviewed)" to let the composition root import `packages/adapters` for the Clock and the id port. This build did not edit the spine; the amendment should add the edge to the composition-root carve-out paragraph and the new rule to "what the dependency-cruiser gate enforces now", and go through the adversarial review the earlier AD-1 amendments had. RESOLVED 2026-09-21: AD-1 amended in the same branch, two rounds of adversarial review (`reviews/review-adversarial-ad1-adapters.md`).
  resolved: YES, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). The diagram has the `composition root only` arrow to `packages/adapters` and AD-1 names it; the adversarial review this entry promised exists. Prose resolution was already recorded; the field was missing.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-organisation-hierarchy.md`
  summary: The Program-within-Department rule and "a Program never changes Department" are held by the use cases alone; the database would accept a `project.program_id` naming another Department's Program, or no Program at all.
  evidence: The spec's Never list keeps foreign keys out (the schema's recorded demo deviation). The org writes check the rule inside the transaction and lock the Project row (`FOR UPDATE`) so two reassignments cannot both pass a stale check, and nothing else writes `program_id` — but the seed and probe writers insert it directly. A composite FK `(tenant_id, department_id, program_id)` → `program(tenant_id, department_id, id)` is the database-level form, with the FK work that lifts the deviation.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-organisation-hierarchy.md`
  summary: A new Project's `default_rate_jpy` is 0 and its `demo_anchor` is the wall clock, both placeholders for later stories.
  evidence: Documented in `NEW_PROJECT_DEFAULTS` (`packages/app/src/use-cases/org-writes.ts`). Story 1.6 creates the Project default Rate (its own table, audited), which should replace the column's 0; the anchor comes from the composition root's `systemClock` until story 1.8's fixture-mode clock exists, so a Project created in the demo today is anchored at real time, not the fixture's.
  resolved: YES, 2026-09-22 — Rate half in `spec-1-6-resources-and-the-dated-rates-behind-every-money-figure.md` (`createProject` dual-writes the first `project_default_rate_entry` at yen 0; `appendProjectDefaultRate` updates both and keeps `default_rate_jpy` as the live head cache). Clock / `demo_anchor` half in `spec-1-8` — seed stamps `demo_anchor` from the injected Clock; org writes use the composition Clock (fixture under local).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-organisation-hierarchy.md`
  summary: The write harness's own-Tenant row check compares only the tables a write is expected to touch (`landedRows`: mapping, disposition, audit, work package, department, program, project); a write that also changed another table passes it.
  evidence: Watched in the sabotage run: a Program move that also updated `connector` passed `tests/cross-tenant-writes.test.ts` and was caught only by `tests/org-writes.test.ts`'s whole-Tenant comparison (`allRows`). The foreign-Tenant probe counts every tenant-owned table, but counts cannot see an UPDATE. Comparing `allRows` before and after every own-Tenant write in the harness would close it for all writes at once.
  resolved: YES, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). `tests/cross-tenant-writes.test.ts` now diffs `allRows` before and after EVERY own-Tenant write and asserts every table the write must leave alone is byte-identical — which is exactly what this entry proposed, and it closes the whole class rather than one case.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-organisation-hierarchy.md`
  summary: The org writes have no read side: nothing lists Departments or Programs, and `program` is declared unreached in the read harness.
  evidence: The spec's Never list: no UI and no read use case for the org in 1.3. The first read (the Organisation admin surface, after 1.4/1.5, or a Program roll-up) must remove `program` from `UNREACHED_TENANT_OWNED_TABLES` or the reach assertion fails.
  resolved: YES, 2026-09-27 in `spec-2-17-the-tenant-admin-can-see-and-run-the-organisation.md`. `listDepartments` / `listPrograms` / `listProjects` are ADMIN_ONLY reads on `repo-org-list`, registered in the harness; `program` is removed from `UNREACHED_TENANT_OWNED_TABLES`.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-organisation-hierarchy.md`
  summary: `findProject`'s row lock — the only concurrent guard of the Program-within-Department rule — has no test.
  evidence: Review round 1 (B3/V1). Removing `.for('update')` leaves every suite green; the interleaving reassign-Program-then-move-Department can commit a Project in one Department carrying another's Program. Needs a two-connection test with a barrier, which the write harness lacks; or a composite foreign key (the recorded demo deviation) that makes the database enforce it.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-organisation-hierarchy.md`
  summary: `audit_log.at` mixes two time bases in one Tenant: project writes stamp the Project's fixture `demoAnchor`, org writes stamp wall time from the Clock.
  evidence: Review round 1 (B8). Ordering or reading the log by `at` interleaves the two timelines; `seq` still gives true insertion order. Resolves when story 1.8's fixture-mode Clock drives both, or when project writes move off `demoAnchor`.
  resolved: PARTIAL, 2026-09-22 in `spec-1-8` — org writes and seed use the product Clock; project writes still stamp `demoAnchor` (Epic 2).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-organisation-hierarchy.md`
  summary: The web app now bundles `@momo/adapters` (and its `uuid`) through `transpilePackages`, verified by typecheck only.
  evidence: Review round 1 (V2). Same gap as the "CI never runs `next build`" entries: dropping `@momo/adapters` from `transpilePackages`, or `uuid` failing to resolve for Next, stays green in every gate. Covered by the eventual `next build` step or the Epic 8 image.
  resolved: YES, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). CI runs `pnpm --filter @momo/web build`, and the step's own header names this entry's failure mode verbatim.

- source_spec: `_bmad-output/planning-artifacts/architecture/architecture-momo-keikaku-2026-09-20/ARCHITECTURE-SPINE.md`
  summary: `apps/worker` cannot reach the `Clock` (or any adapter): AD-15 needs the fixture clock in both roles, and the gate allows `packages/adapters` only from `apps/web`'s composition root.
  evidence: Found by the adversarial review of the AD-1 adapters amendment, 2026-09-21. AD-1 now says the worker gets its own named composition root the day it first needs an adapter; name it in the spine and in `apps-adapters-only-from-composition-root` together — likely with story 1.8's fixture clock or the pg-boss adapter move.
  resolved: YES, 2026-09-22 in `spec-1-8` — `apps/worker/src/index.ts` is a named composition root; depcruise allows it; wires product Clock.

- source_spec: `_bmad-output/planning-artifacts/architecture/architecture-momo-keikaku-2026-09-20/ARCHITECTURE-SPINE.md`
  summary: `db/seed` has no way to receive the `Clock` AD-15 says it creates records through: `packages/db` may not import `packages/adapters`.
  evidence: Found by the same review. The seed's operator entry point (`scripts/seed.ts`) is outside the graph and can inject a clock; wire it there when story 1.8 introduces the fixture-mode clock the seed must share.
  resolved: YES, 2026-09-22 in `spec-1-8` — `scripts/seed.ts` injects the Clock; `packages/db` never imports adapters.

## Deferred from: code review of spec-1-3-organisation-hierarchy (2026-09-21)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-organisation-hierarchy.md`
  summary: `findDepartment` and `findProgram`'s row locks (added for correct rename `before` values) are untested, like `findProject`'s.
  evidence: Code review of story 1.3. Removing `.for('update')` from either leaves every suite green; two concurrent renames would record the same stale `before`. Same two-connection barrier harness as the `findProject` entry above.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-organisation-hierarchy.md`
  summary: Story 1.3 AC3's "Published Snapshots unchanged" and "only the Program roll-up changes" cannot be tested yet.
  evidence: Code review of story 1.3. No published-snapshot table and no Program roll-up read exist; `allRows` covers every tenant-owned table, so the snapshot half becomes covered automatically when Epic 5 adds the table. The roll-up half needs the first read that aggregates by Program.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-organisation-hierarchy.md`
  summary: The audited-use-case gate checks each use case's own declaration, not NFR-A1's list; a write on the list declared `{ unaudited: '<reason>' }` would pass.
  evidence: Code review of story 1.3 (AC4). Safe today because nothing is declared unaudited. Fix: map NFR-A1's action groups to the use cases that implement them, and refuse an `unaudited` declaration for any of them.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-organisation-hierarchy.md`
  summary: `epic-1-context.md` and story 1.3's AC state `audit.record(ctx, action, target, payload)`; the code's signature is `record(scope, stamp, action, target, payload)`.
  evidence: Code review of story 1.3. Slice 1's spec records the extra `scope` and the `{ actor, at }` stamp as deliberate (the transaction must be explicit); the planning wording should follow when AD-14 is next touched, and the compiled epic context regenerates from it.

- source_spec: none
  summary: Story 1.4 slice 2 — revocation and membership changes (including PM assignment into `tenant_membership.project_ids`) as audited `app` use cases, refused on the revoked user's next request.
  evidence: Split from story 1.4 at Build's multi-goal gate (founder, 2026-09-21); independently shippable once slice 1's session and `RequestContext` exist.
  resolved: YES, 2026-09-21 in `spec-1-4-revocation-and-membership.md`. `revokeMembership`, `changeMemberRole`, `assignMemberProject` and `unassignMemberProject` are audited use cases (`membership.revoke` / `change_role` / `assign_project` / `unassign_project`, target = the member's user id, previous value in the payload), each gated on `tenant_admin` in the context and re-checked against the bridge under one ordered lock; the last Tenant Admin cannot be revoked or demoted. Written through `packages/db`'s one bridge writer (`repo-membership-write.ts`), every statement filtered by `tenant_id`. The app role holds SELECT, UPDATE, DELETE on `tenant_membership` (no INSERT). Revocation deletes the row; the resolver signs the user out on their next request and deletes that session (`tests/membership.test.ts`) — except a session that has not yet reached a first page (no `activeTenantId`), which resolves `no_access` and is kept (spec matrix row "Revoke before first page"). No screen, by decision.

- source_spec: none
  summary: Story 1.4 slice 3 — Google sign-in.
  evidence: Split from story 1.4 at Build's multi-goal gate (founder, 2026-09-21); needs a decision on Google OAuth credentials for local and CI (test double or real client ids).
  resolved: YES, 2026-09-22 in `spec-1-4-google-sign-in.md` (founder decision 2026-09-21, option (a): a fake OIDC provider locally and in CI). Google is one `genericOAuth` provider (`providerId: 'google'`) in `packages/db/auth/src/google.ts`, discovered from `GOOGLE_ISSUER_URL`, off unless `AUTH_GOOGLE=on`. Link by verified email to an existing user only; provider tokens stored as null; every refusal lands on `/sign-in?google=refused`; the middleware refreshes sessions on a Google-less instance. The fake is `tests/support/fake-oidc.ts` (`pnpm fake-oidc` for local dev); the matrix is `tests/google-sign-in.test.ts`.

- source_spec: none
  summary: Story 1.4 slice 4 — password reset through `MailerPort` (`mailer-console` in development, `mailer-ses` in production; AWS account and sender domain are Epic 8's).
  evidence: Split from story 1.4 at Build's multi-goal gate (founder, 2026-09-21); independently shippable once slice 1's email + password sign-in exists.
  resolved: YES, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). Landed as commit `d0343b6`: the `MailerPort`, `mailer-console`, the reset hooks, the two server actions and `tests/password-reset.test.ts`. `mailer-ses` is Epic 8's by this entry's own parenthetical.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-identity-and-request-context.md`
  summary: The email + password sign-in server action has no rate limit; Better Auth's limiter runs only in its HTTP router, which the action bypasses.
  evidence: Spec review of story 1.4 slice 1 (finding 6); deferred on purpose by the founder 2026-09-21 because slice 1 runs locally only. Needs a per-email + per-IP throttle before any deployment (Epic 8) — or route sign-in through the HTTP endpoint.

## Deferred from: implementation of spec-1-4-identity-and-request-context (2026-09-21)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-identity-and-request-context.md`
  summary: The Node-runtime middleware, Better Auth and `pg` in the Next bundles are verified on `next dev` only; CI never runs `next build`.
  evidence: Checked by hand on `next dev` (port 3101): the middleware compiled with `pg` (already in `serverExternalPackages`), redirected signed-out requests, slid a session and forwarded its `Set-Cookie`. Dropping `@momo/db-auth` from `transpilePackages` or a bundling regression stays green in every gate. Same fix as the other "CI never runs `next build`" entries.
  resolved: YES, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). CI runs `next build` (`.github/workflows/ci.yml`), added by commit `23157bc`. The residual — that the step inherits the job env — is tracked by its own entry.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-identity-and-request-context.md`
  summary: The sign-in FORM (the `useActionState` client component and its generic error) is exercised by no automated test; the flow underneath is.
  evidence: `tests/identity.test.ts` drives sign-in, refusal, sliding, idle expiry, tampering and sign-out through `auth.api` and the bindings; the manual check signed in through `/api/auth/sign-in/email` with curl and posted the mapping and sign-out forms without JavaScript. Typing a password into the browser form was not done by the implementing agent. A Playwright pass is the real fix (same entry as the web-layer coverage one above).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-identity-and-request-context.md`
  summary: The top bar shows only the signed-in user's role; `RequestContext` carries no name, and the `{ userId, email, locale }` identity lookup is deferred to story 1.7.
  evidence: The hard-coded "Linh · PM" chip was replaced by the role from the context (it was wrong for `hoang`). Showing the name needs the IdentityPort lookup AD-23 now assigns to its first reader.
  resolved: YES, 2026-09-22 in `spec-1-7-the-tenant-admin-can-read-the-audit-log.md`. `IdentityPort.lookupUser` / `lookupUserOn` return `{ userId, email, locale, name }`; top-bar chip shows name (or email) · role; audit-log actors resolve the same way.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-identity-and-request-context.md`
  summary: The idle timeout has up to five minutes of slack, and a fixture-mode Clock does not move it.
  evidence: `updateAge` is 5 minutes, so the expiry is pushed forward at most every 5 minutes; a session is refused 8 h after its last refresh, which can be up to 5 minutes before its last request. Session times are Better Auth's own `Date` (the AD-15 exception), so story 1.8's fixture clock will not affect them.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-identity-and-request-context.md`
  summary: A local database created before this story needs `DROP TABLE app_user` before `drizzle-kit push`, which otherwise stops on an interactive rename prompt.
  evidence: Measured locally: push asks whether `auth_user` is `app_user` renamed and fails with no TTY. CI starts from an empty database and is unaffected. README-DEMO.md also still says "No authentication"; it predates this story and needs the sign-in steps (SEED_DEMO_PASSWORD, the four new env keys).
  resolved: YES, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). `README-DEMO.md` now documents the `DROP TABLE IF EXISTS app_user` step and the sign-in flow with `SEED_DEMO_PASSWORD`; the "No authentication" text is gone.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-identity-and-request-context.md`
  summary: `/` still redirects every signed-in user to the demo Project (`/p/prj-ec2/review`) instead of a Project from their membership.
  evidence: `apps/web/src/app/page.tsx` predates sign-in; harmless while the demo Tenant is the only one, wrong as soon as a second Tenant or a PM of other Projects exists.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-identity-and-request-context.md`
  summary: The middleware redirects an expired session's server-action POST with 307 (unverified, medium if real).
  evidence: A 307 replays the POST against `/sign-in`; a 303 may be correct for non-GET. Settle it by posting a Mapping form in `next dev` with an expired session, with and without JS, and seeing where the browser lands.
  resolved: YES, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). `apps/web/src/server/session-gate.ts` redirects with 303 for anything but GET, with the reasoning written beside it. The experiment this entry asked for was run and the answer landed in commit `23157bc`.

## Deferred from: implementation of spec-1-4-revocation-and-membership (2026-09-21)

- source_spec: `_bmad-output/planning-artifacts/architecture/architecture-momo-keikaku-2026-09-20/ARCHITECTURE-SPINE.md`
  summary: The spine (AD-21's per-entry exceptions, AD-23's bridge) and the compiled `epic-1-context.md` still say `tenant_membership` is SELECT-only for the application role and read "by nothing else" than `resolveRequestContext`; since slice 2 the role holds SELECT, UPDATE, DELETE and the bridge has one writer (`membershipWriterOn`, pinned by `source-discipline.test.ts`).
  evidence: The spec scoped the change to code, registry and SQL; the planning wording was left alone on purpose, because an amended planning doc gets an adversarial review first (up to two rounds). Amend AD-21 and AD-23 ("one reader for request resolution, one writer; no INSERT — invitation"), review, then regenerate the epic context.
  resolved: YES, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). AD-21 now states `tenant_membership`'s SELECT/UPDATE/DELETE-no-INSERT grant and AD-23 names `membershipWriterOn` as the one writer; `epic-1-context.md` matches.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-revocation-and-membership.md`
  summary: Revocation ends only the session that makes the next request; a revoked user's OTHER sessions (another browser) each end on their own next request, and until then the rows stay in `session`.
  evidence: By design (the use cases never touch sessions; the resolver ends a session whose active Tenant has no membership). Nothing is reachable through such a row — every request re-validates — but an operator reading `session` sees them. Sweep them with the session-expiry job when one exists, or have the resolver end all of the user's sessions for that Tenant.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-revocation-and-membership.md`
  summary: The membership writes' `tenant_admin` check is local to them; no other use case checks a role, and a PM can still call every organisation write.
  evidence: Decided by the founder for this slice (a local check ahead of story 1.5). Story 1.5 replaces it with the declared-roles mechanism and must keep the in-transaction re-check against the bridge (a server action's context can be stale).
  resolved: YES, 2026-09-22 in `spec-1-5-roles-decide-what-each-person-can-reach.md`. `authorize` in `packages/app/src/authz/authorize.ts`; every use-case export declares roles; membership lock re-check kept.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-revocation-and-membership.md`
  summary: `tests/cross-tenant-writes.test.ts`'s "ids that exist in neither Tenant" run is made as the OWN probe Tenant (where the same caller's writes succeed), not as the foreign one.
  evidence: The spec asked the foreign test to also run each entry with a target absent from both Tenants, "so the refusal is shown to come from the target lookup". Running it as WA — where the harness user is a Tenant Admin and every own-Tenant write succeeds — is what isolates the target as the cause; run as WB it would repeat the foreign replay. Every non-creating write is driven this way, not only the membership ones.


## Deferred from: code review of spec-1-4-revocation-and-membership (2026-09-21)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-revocation-and-membership.md`
  summary: `epic-1-context.md` still says the app role holds SELECT only on `tenant_membership` and that the bridge has a single reader.
  evidence: Code review (B1). The context is compiled from the spine, whose AD-21/AD-23 wording is deferred until an adversarial review of the amendment; regenerate the context after the spine changes.
  resolved: YES, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). `epic-1-context.md` was regenerated after the AD-21/AD-23 amendment and now says the bridge is "written on the app role only by `membershipWriterOn`".

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-revocation-and-membership.md`
  summary: A Tenant Admin's membership may carry `projectIds` (kept on promotion, assignable); story 1.5 must not read them as a limit on a Tenant Admin's reach.
  evidence: Code review (B6). Kept on purpose so a demotion restores the PM's Projects; only a schema comment says so today.
  resolved: YES, 2026-09-22 in `spec-1-5-roles-decide-what-each-person-can-reach.md`. `reachesProject` returns true for any `tenant_admin` regardless of `projectIds`.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-revocation-and-membership.md`
  summary: A user revoked from their only Tenant keeps `auth_user` and credential rows and can still sign in, landing on `no_access`.
  evidence: Code review (B9). Revocation removes access, not the person; deactivating or deleting accounts needs an account-lifecycle decision (with invitation work).

## Deferred from: implementation of spec-1-4-google-sign-in (2026-09-22)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-google-sign-in.md`
  summary: The spine's AD-1 carve-out still describes `createAuth({ db, secret, baseURL, idleHours, generateId })` and the four web-edge bindings; slice 3 added the optional `google` argument, the Google bindings (`googleSignIn`, `googleRegistered`, the provider-aware allowlist) and a second, Google-less instance for the middleware. `table-classes.ts:134`'s "why" for `verification` does not yet mention the OAuth state it now holds.
  evidence: Deferred by the spec on purpose: an amended planning doc gets its own adversarial review (up to two rounds) before it lands. Amend AD-1 (and the `verification` note), review, then regenerate `epic-1-context.md`.
  resolved: YES, 2026-09-22. AD-1, AD-15, AD-16, AD-17 and AD-23 amended after rubric, tech-currency and two adversarial rounds (`reviews/review-*-ad1-google*.md`); `table-classes.ts`'s `account`/`verification` notes updated; `epic-1-context.md` regenerated.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-google-sign-in.md`
  summary: Epic 8 must check Google sign-in against REAL Google — the issuer's spelling (`https://accounts.google.com` in discovery vs the bare `accounts.google.com` Google puts in some tokens' `iss`), discovery retried after a failure (today a fast failure skips the provider for the life of the instance, i.e. until the process restarts), and a timeout for a discovery request that hangs (Better Auth's `betterFetch` has none, and every call on the page instance waits for it).
  evidence: The fake always issues `iss` equal to its discovered issuer, so the first cannot be seen in CI. Only the middleware's instance is isolated from discovery (`tests/web-google-discovery.test.ts`); the page instance's first use waits on it.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-google-sign-in.md`
  summary: Every started Google sign-in writes a `verification` row; an abandoned one is removed only by Better Auth's opportunistic sweep of expired rows (on a later `findVerificationValue`), and nothing limits how often `signInWithGoogle` can be posted.
  evidence: Same gap as the password sign-in rate-limit entry above: Better Auth's limiter runs only in its HTTP router, and the server action calls `auth.api.signInSocial` directly. Needs the sign-in throttle (Epic 8) and, ideally, a scheduled sweep.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-google-sign-in.md`
  summary: Better Auth 1.7.5 decides an OAuth state's expiry from the `expiresAt` inside the `verification` row's VALUE, not from its `expires_at` column: a row whose column alone is in the past is still accepted (the lookup returns the row it found before sweeping expired ones).
  evidence: Measured while writing the expired-state row of `tests/google-sign-in.test.ts`: moving only the column let the sign-in through; the test therefore moves both. Both are set ten minutes ahead at creation, so they agree unless someone edits the row. Harmless today; re-check on a Better Auth upgrade.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-google-sign-in.md`
  summary: The "Sign in with Google" button and the refusal message are exercised by no browser test; the action, the refusal parser and the whole OAuth flow underneath are.
  evidence: `actions.test.ts` pins the redirect to the provider and the fallback refusal; `tests/google-sign-in.test.ts` runs the flow through the route handler with the state cookie forwarded. A Playwright pass is the real fix (same entry as the other web-layer coverage ones).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-google-sign-in.md`
  summary: A discovery request that HANGS on the page instance blocks every request that instance serves — page renders (the resolver's `identityOn(webAuth())`), `/sign-in`, `/get-session` and password sign-in — not only Google.
  evidence: Code review (B1, E1, E2), verified: every `auth.api` call and `serveAllowlisted` awaits `auth.$context`, which awaits the plugin's discovery fetch (no timeout). The spec defers a hang to Epic 8 on purpose; this entry records that the blast radius is the whole app, not Google. Cheapest fix when it is picked up: keep identity, password sign-in and the non-Google endpoints on the Google-less instance (as the middleware already is) and await registration only for the button, the start action and `/callback/google`; or bound discovery with a timeout.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-google-sign-in.md`
  summary: Linking a Google account to an existing user writes no audit row, is invisible to a Tenant Admin, and has no unlink path; revoking a membership leaves the link in place.
  evidence: Code review (B6). A first Google sign-in adds a `google` `account` row through Better Auth's callback, outside any audited use case. By the founder's decision a link needs a verified email on both sides, and the link grants no Tenant access by itself (membership still decides), so it is not an access change — but it is a new way into an identity. Belongs with the account-lifecycle decision (see the B9 entry above) and invitation work.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-google-sign-in.md`
  summary: `googleSignIn`'s refusal paths on a REGISTERED instance (an `APIError` from `signInSocial`, or a response without a URL) are run by no test.
  evidence: Verification-gap review. Every `null` in the tests comes from the not-registered guard before the `try`; removing the `catch` would leave CI green and turn such a refusal into an error page. No clean way to make the real fake trigger it; revisit if the start path gains refusal conditions.

## Deferred from: implementation of spec-1-4-password-reset (2026-09-22)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-password-reset.md`
  summary: `mailer-ses` (the production mail transport) is Epic 8's — the AWS account and sender
  domain that would let it be tested against don't exist yet. `MAILER=ses` is accepted by config
  today (AD-17/AD-18) but the composition root's `webMailer()` throws naming the missing adapter.
  evidence: By the spec's own decision, recorded 2026-09-22. When Epic 8 adds `mailer-ses`, wire it
  into `webMailer()`'s `switch` beside `console` and drop the throw.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-password-reset.md`
  summary: The sign-in rate limit stays deferred to Epic 8 (as already recorded from story 1.4
  slice 1), and now covers a SECOND unauthenticated, enumerable endpoint: `requestPasswordReset`
  calls `auth.api.requestPasswordReset` directly from a server action, bypassing Better Auth's own
  HTTP-router rate limiter exactly as `signInWithEmail` and `googleSignIn` already do.
  evidence: By the spec's own decision ("R0 runs locally"). Nothing here throttles repeated reset
  requests for the same or different emails; only Better Auth's own generic-response shape and the
  lack of any observable difference between outcomes limit what an unthrottled caller learns.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-password-reset.md`
  summary: The spine (`ARCHITECTURE-SPINE.md`) and the compiled `epic-1-context.md` do not yet
  describe `CreateAuthOptions`'s new `mailer`/`now`/`identityEvents` arguments, the `identity_event`
  table's AD-21 entry, or the four founder decisions this slice made (identity events in one
  global insert-only table, a completed reset sets `email_verified`, the sign-in throttle stays
  deferred, `mailer-console` only for R0).
  evidence: Deferred by the spec on purpose, mirroring how slice 3's AD-1 amendment for Google was
  handled: an amended planning doc gets its own adversarial review (up to two rounds) before it
  lands. Amend the spine, review, then regenerate `epic-1-context.md`.
  resolved: YES, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). The spine carries `createAuth`'s full signature, `identity_event`'s AD-21 registry entry and all four founder decisions from slice 4; `epic-1-context.md` was regenerated to match.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-password-reset.md`
  summary: The credential-account check in `sendResetPassword` (`packages/db/auth/src/auth.ts`'s
  `hasCredentialAccount`) reads the `account` table directly through `options.db`, rather than
  through a declared port. It is the one place this package queries a table beyond what
  `authSchema`'s Drizzle adapter already touches for Better Auth's own bookkeeping.
  evidence: Judgment call made during implementation, not reviewed. It stays inside the same
  carve-out (`packages/db/auth` may read the four Better Auth tables directly; `account` is one of
  them) and needs no new port, but a reviewer should confirm that reading and not just writing
  those tables directly is intended, since every other read in this package goes through
  `internalAdapter` or `auth.api` instead.
  resolved: YES, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). AD-1 now sanctions `packages/db/auth` reading and writing the four Better Auth tables directly, and pins the storage formats such a statement may depend on. The code is unchanged — it is reviewed now rather than unreviewed.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-password-reset.md`
  summary: `identity_event` rows written for a probe Tenant's members during a test are not swept
  by `removeProbeTenant` (it skips every table with a null `tenantColumn`, `identity_event`
  included) — `tests/password-reset.test.ts` cleans up its own dedicated extra users' rows by hand,
  but a probe Tenant's SEEDED members (created with a credential account) would leave any
  `identity_event` rows they earned behind if a later test ever reset one of their passwords.
  evidence: Not exercised today — no test resets a seeded probe member's password, only a
  dedicated extra user's. Small rows in the dev/CI database either way, the same shape as B8's
  `verification`-row growth from the Google slice.
  resolved: YES, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). `packages/db/src/probe-tenants.ts` deletes each member's `identity_event` rows and their `reset-password:` verification rows (commit `dd6ba94`), naming this scenario in its comment.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-password-reset.md`
  summary: The `/forgot-password` and `/reset-password` pages were not clicked through in a real
  browser under `pnpm dev` in this implementation session (no browser available in the sandbox).
  `next build` succeeds and both routes compile as dynamic routes; the full flow (request a reset,
  copy the link from the console mailer's stdout line, set a new password, sign in with it) is
  otherwise verified end-to-end against real Postgres in `tests/password-reset.test.ts`, which
  drives the same `createAuth` options the composition root builds, but not through Next's own
  request/response cycle or a browser's form submission.
  evidence: CI never runs `next build`; the spec says the two pages are "confirmed here or not at
  all" (the manual check). Owed before story 1.4's whole-story review closes it out.

## Deferred from: review of spec-1-4-password-reset (2026-09-22)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-password-reset.md`
  summary: `sendResetPassword`'s early return for a user with no credential account may be a response-timing oracle once `mailer-ses` lands.
  evidence: Edge-case and blind layers, graded `maybe-false` at triage. A user with no credential account skips the transport entirely; a credential user awaits it inline. With `mailer-console` the difference is noise. What would settle it: measuring request duration against a real SES call, both branches, on the same unthrottled and enumerable endpoint the deferred sign-in throttle already covers. If measurable, it belongs with that throttle in Epic 8 — send on a queue, or pad both branches.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-password-reset.md`
  summary: `tests/password-reset.test.ts`'s consume matrix is order-dependent shared state — each case mutates the same user's password and the next assumes the previous value.
  evidence: Blind layer, graded `low` and rejected at triage because a developer meets it only when isolating a case with `.only`, and the fix is a restructure rather than a direct correction. Real nonetheless: the first case also asserts exactly one `identity_event` for that user, so any reordering breaks the suite for reasons unrelated to the code. Fix by carrying the current password in a variable, or by giving each case its own user.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-password-reset.md`
  summary: `identity_event.action` is a closed list in TypeScript only — the column is `text` with no `pgEnum` and no CHECK constraint.
  evidence: Blind layer, graded `low` and rejected at triage because the fix is a migration plus regenerated SQL. `repo-identity-event.ts` states the column does not accept an arbitrary string; that holds only for callers going through its one writer, which `source-discipline.test.ts` fences. Worth closing when the next story adds a second action to the list, since that is when the enum has more than one member to name.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-password-reset.md`
  summary: The app role holds an unused `SELECT` on `identity_event`, and every row's `payload` is null, so an operator investigating a takeover learns only "user X reset at T".
  evidence: Blind layer, graded `low` and rejected at triage: `['SELECT', 'INSERT']` is what the approved Code Map specifies, and no application code reads the table today (only the owner role does, in tests). Both are decisions for whoever first reads the table — story 1.7's audit-log reader is the natural owner. Tightening to `['INSERT']` and choosing forensic fields (request ip, user agent) belong together, not piecemeal.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-password-reset.md`
  summary: An oversized hidden token field may break the refusal redirect rather than landing on the generic refusal.
  evidence: Edge-case layer, graded `low` and `maybe-false` at triage, then rejected per the rule for a `maybe-false` that would only be `low`. The claim is that an arbitrarily long token yields a `Location` header Next.js refuses to set; nothing in the diff or the surrounding code settles what happens at that size. What would settle it: posting the reset form with a multi-kilobyte token against `next dev` and watching whether the redirect lands or throws.

## Deferred from: code review of spec-1-4-password-reset (2026-09-22)

Whole-story review of story 1.4, `packages/db` group (Better Auth carve-out and data layer).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-password-reset.md`
  summary: `packages/db/auth/src/bindings.ts`'s routing logic has no unit test, although every part of it is pure and needs no database.
  evidence: Blind layer, graded `low` at triage and deferred rather than patched. Untested and Postgres-free: `endpointOf`'s trailing-slash normalisation and its `null` for a path outside the base path, the method-and-path allowlist match, `notFound()`'s body and its `cache-control: no-store`, and the `if (!isAPIError(error)) throw error` re-throw branch in all five wrappers. `auth.test.ts` calls itself the gate that runs without Postgres, but it stops at `auth.ts`, `google.ts` and `reset.ts`. `identity.ts` (`textOrNull`, the `locale ?? 'en'` fallback, the session-vanished throw) and `password.ts`'s empty-password guard are in the same position. A suite for all of them is substantial new work, and the `tests` group of this story has not been reviewed yet — fold it into that pass.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-password-reset.md`
  summary: `minPasswordLength` and `maxPasswordLength` are inherited from Better Auth while the same file pins every other reset-relevant setting, and `hashPassword` accepts any non-empty string.
  evidence: Blind layer, graded `low` at triage. `auth.ts` pins `resetPasswordTokenExpiresIn` (which only restates a default) and `revokeSessionsOnPasswordReset` precisely so they read as decisions, yet the two length bounds the reset flow actually enforces are silent — and `bindings.ts`'s `resetPassword` comment names "a password Better Auth's `minPasswordLength` refuses" as a refusal it handles. Meanwhile `packages/db/auth/src/password.ts` rejects only the empty string, so `SEED_DEMO_PASSWORD` may be shorter than what reset will accept. Choosing the password policy is a product decision rather than a correction, which is why it is deferred rather than patched. Note that `auth.test.ts` now pins `emailAndPassword` with an exact `toEqual`, so adding the keys later is a deliberate, visible test change.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-password-reset.md`
  summary: Expired `verification` rows have no owned sweep, and when one lands it will want an index the table does not have.
  evidence: Founder decision 2026-09-22 at the code review's decision gate — deferred to Epic 8, to land with the sign-in throttle. Correcting the finding as two review layers filed it: Better Auth DOES delete expired rows. `findVerificationValue` issues an unscoped `DELETE … WHERE expires_at < now()` unless `verification.disableCleanup` is set, which this project does not set, and it is called from `password.mjs:66` — the unknown-email branch of `requestPasswordReset`, which `/forgot-password` reaches every time a visitor mistypes an address. Do not re-derive this. What is actually wrong is narrower: that sweep is a side effect of an unrelated branch, not an owned maintenance step, so nothing guarantees it ever runs. The growth that can outpace it comes from two unthrottled, enumerable endpoints — a Google sign-in start and a reset request, each writing one row — and the throttle covering both is already an Epic 8 deployment blocker recorded above. Same root cause, same owner. Where the sweep runs is an AD-19 decision: `apps/worker` has no composition root yet, and the maintenance role belongs to the operations envelope. The index is deferred deliberately with it: `invalidateOtherResetTokens` runs once per completed reset, so a sequential scan costs nothing today, and the query that will want an index is the sweep's own `expires_at < now()`, not `value` — indexing `value` now would pin the wrong column.

## Deferred from: code review of spec-1-4-password-reset (2026-09-22)

Whole-story review of story 1.4, fifth and final pass — the four Postgres auth suites and the
fences and tooling that gate them. Seventeen findings were patched; these ten were not.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-password-reset.md`
  summary: `cookieFrom` is written four times across the auth suites, and only one copy drops cleared cookies.
  evidence: Blind layer, graded `medium` at triage. `tests/google-sign-in.test.ts:101`, `tests/identity.test.ts:79` and `tests/membership.test.ts:150` each declare it, and `tests/password-reset.test.ts` inlines a fourth copy inside its `signIn`. Only the Google copy carries `.filter((pair) => !pair.endsWith('='))`, so the other three would replay a `Set-Cookie: …=; Max-Age=0` as a live cookie — which matters most in exactly the sign-out and revocation rows those files exercise. `tests/` already holds shared modules (`write-harness.ts`, `request-context.ts`, `support/`); one of them is where this belongs, with the filter. Deferred because moving it touches all four suites at once and none of them is currently wrong.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-password-reset.md`
  summary: The `createAuth(...)` option block and the `NOOP_RESET_DEPS` literal are copy-pasted across all four auth suites.
  evidence: Blind layer, graded `medium` at triage. Each suite repeats `db`/`secret`/`baseURL`/`idleHours`/`generateId`, and slice 4's `NOOP_RESET_DEPS` appears verbatim, comment included, in `google-sign-in.test.ts:86` and `identity.test.ts:76` and inlined again in `membership.test.ts`. This story is itself the evidence of the cost: slice 4's three new fields had to be retro-fitted into slices 1-3's files. A `tests/support/auth.ts` factory makes the fifth field a one-line change. Deferred as a refactor of four green suites rather than a correction.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-password-reset.md`
  summary: `hashPassword` is deep-imported past its own barrel in five files, and no `@momo/db-auth/*` subpath mapping exists to make the barrel reachable.
  evidence: Blind layer, graded `low` at triage. `packages/db/auth/src/index.ts` exports it, yet `scripts/seed.ts` and all four auth suites import `.../packages/db/auth/src/password` directly — three of them in the very import block where they already import from `.../packages/db/auth/src`. `scripts/seed.ts`'s header describes this as hashing "through `@momo/db-auth`", which is not what the import says. The cause is that neither `tsconfig.base.json` nor `vitest.config.ts` maps a `@momo/db-auth/*` subpath beside the bare one, so consumers fall back to relative deep paths. Note this pass ADDED a sixth such import (`verifyPassword` in `tests/identity.test.ts`), deliberately matching the existing shape rather than mixing two. Deferred: adding the subpath mapping is a build-config change that wants its own check.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-password-reset.md`
  summary: The fake OIDC provider's `interactive: true` branch — the local Google sign-in the README walks a developer through — is executed by no test and no CI step.
  evidence: Verification-gap layer, measured. `grep -rn interactive tests/*.ts scripts/*.ts` outside `tests/support/` returns one hit, `scripts/fake-oidc.ts:35`; every suite starts the fake with `interactive` unset and drives it over `GET /authorize`, so the POST branch and the `signInAsPage` form builder (`tests/support/fake-oidc.ts:140-155`, `:243-255`) never run. `signInAsPage` re-emits every authorize parameter as a hidden input and posts to `action="/authorize"`, dropping the original query string, so the whole branch depends on that round trip being complete: omit one field (`code_challenge`, say) and `authorizeProblem` answers `400 S256 PKCE required` while every gate stays green. What would close it: one case in `tests/google-sign-in.test.ts` that starts a second fake with `interactive: true`, GETs the authorize URL, scrapes the hidden inputs from the HTML, POSTs them with an `email`, and runs the result through the existing `callback()` + `expectLandedHome` — roughly fifteen lines on machinery that file already has. Deferred: it is developer tooling, not shipped product.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-password-reset.md`
  summary: The Google refusal matrix has no row for a wrong `iss`, nor for a mismatched (rather than absent) `nonce`.
  evidence: Acceptance-auditor and blind layers, agreeing. `tests/google-sign-in.test.ts` drives every knob `FakeScript` exposes — no id token, foreign signing key, wrong `aud`, no `nonce`, expired, refused exchange, `access_denied`, discovery without `jwks_uri` — but `tests/support/fake-oidc.ts` has no knob for an id token whose `iss` is not the configured issuer (it always signs `iss: issuer`, `:176`) and none for a `nonce` that is present but wrong (only `dropNonce`, `:50`). AD-23 states the guarantee as "plugin verifies, iss exact, exp when present", which makes issuer confusion the one named guarantee this otherwise exhaustive matrix does not exercise. Deferred: both need new knobs in the fake, which is shared by four suites.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-password-reset.md`
  summary: The `Build (apps/web)` CI step inherits the job's `env`, so it cannot check the promise it was added for.
  evidence: Blind and verification-gap layers. The step's own comment concedes it: "This step inherits the job's `env`, so it does NOT check that promise — a build needing configuration would still pass here." The regression it was created for is precisely a build that reads configuration at import time, which is what made `next build` fail on `/_not-found` and falsified the composition root's "importing it reads no configuration". Giving the step its own `env:` with `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and `SEED_DEMO_PASSWORD` blanked turns the admission into the gate. Deferred rather than patched because the blanked-env build was verified BY HAND in this pass (clean `.next`, all five keys unset, exit 0, every route still `ƒ (Dynamic)`) and wiring it into CI is a workflow change that wants its own watched-to-fail run.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-password-reset.md`
  summary: `scripts/seed.ts` hashes before it reads `DATABASE_URL`, so with both keys unset only `SEED_DEMO_PASSWORD` is named.
  evidence: Edge-case layer, graded `low`, `kind: deletion`. `const demoPasswordHash = await hashPassword(config.SEED_DEMO_PASSWORD)` runs before `getDb(config.DATABASE_URL)`, and each getter throws on its own key, so the first missing key wins. The file's header states the opposite rule — "A missing DATABASE_URL fails here, naming the key, which is the whole point of the removal". Reading the handle first restores it. Deferred: an operator still gets a named key, just not the one the header promises, and `pnpm demo`'s pre-flight (patched in this pass) now names ALL five missing keys at once before either is reached.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-password-reset.md`
  summary: `scripts/fake-oidc.ts` has no test, though `scripts/pgboss-migrate.test.ts` sets the precedent for testing a script's pure guards.
  evidence: Edge-case and blind layers. The two guards this pass ADDED — `digitsOnly` for `FAKE_OIDC_PORT` and `httpOrigin` for `BETTER_AUTH_URL` — are pure, exported from nothing, and verified only by hand (`FAKE_OIDC_PORT=4a5` and `BETTER_AUTH_URL=ftp://nope` each fail naming the key; the default path listens on 4455). `scripts/pgboss-migrate.test.ts` does exactly this for the migrator's guards, so the shape exists. What would close it: lift both helpers into a module the script imports and the test can call. Deferred: it is tooling, and the guards are three lines each.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-password-reset.md`
  summary: The four-table round trip only READS `auth_user` and `account` back, and checks neither id against the UUIDv7 regex.
  evidence: Acceptance-auditor layer, against slice 1's task "each of the four Better Auth tables round-trips through the adapter, with UUIDv7 ids". `tests/identity.test.ts:445-470`: `session` (created by `signIn`, read by `findSession`) and `verification` (create → find → delete) are genuine round trips with their ids matched against the regex; `auth_user` and `account` are reached only by `findUserByEmail(PM.email, { includeAccounts: true })` on rows `createProbeTenant` inserted directly through Drizzle. Their ids are prefixed probe strings (`xtprobe-idn-019b…`) and so cannot match the regex by construction. An adapter-side write defect on either table would not fail this test. Closing it means creating a user and a credential account THROUGH the adapter, with ids the adapter mints — which collides with the probe-Tenant id discipline every other row in the file depends on. Deferred as a design question, not a correction.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-password-reset.md`
  summary: "Keeps the session cookie cache off — every request reaches the session table" asserts two option flags, not the behaviour its name claims.
  evidence: Acceptance-auditor layer, graded as a naming nit. `tests/identity.test.ts:170` asserts `auth.options.session?.cookieCache?.enabled === false` and `disableSignUp === true`. The behavioural half is carried implicitly by the four mutate-then-resolve rows elsewhere in the file (which would read a stale cached session if the cache were on), but no assertion ties the name to them. Either the name narrows to what it checks, or one of those rows gains a comment pointing back here. Deferred as prose upkeep.

## Deferred from: spine amendment for story 1.4 slice 4 (2026-09-22)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-password-reset.md`
  summary: `identity_event` is insert-only by grant only; the spine (AD-5, AD-21) now requires AD-21's per-entry `appendOnlyGuard` on it — the `BEFORE UPDATE OR DELETE` trigger, the `TRUNCATE` guard and the append-only class's maintenance grant (`SELECT, UPDATE, DELETE`) — while its class stays `global`.
  evidence: Founder decision 2026-09-22 during the spine amendment ("keep the grant, add the trigger"); round 1 of its review found the registry cannot express it today (one class per table; the trigger generator, `rls.test.ts`'s trigger test and the empty maintenance grant on `global` all key off class). What closes it: add `appendOnlyGuard` to `TableEntry`, implied by `append-only`, set on `identity_event`; make `packages/db/src/sql/generate.ts`, the trigger test and the maintenance grant key off it; regenerate `packages/db/sql/*`; extend the append-only DB test to UPDATE, DELETE and TRUNCATE `identity_event` as the owner role outside the `maintenance` setting. `tests/password-reset.test.ts`'s `removeExtras` deletes `identity_event` rows and will then need the `maintenance` setting. Correct in the same change three code comments the spine's AD-14 now contradicts: `table-classes.ts`'s "TWO PER-ENTRY EXCEPTIONS", `identity_event`'s `why` ("happen before any Tenant exists", "an invitation acceptance later") and `repo-identity-event.ts:6-9` ("invitation acceptance records here too, never in `audit_log`") — identity events are defined by subject, and invitation acceptance's membership change writes `audit_log`. Land it before any second identity action.
  resolved: YES, 2026-09-22. `appendOnlyGuard` / `appendOnlyGuardOf` / `APPEND_ONLY_GUARDED` / `maintenancePrivilegesOf` land in `table-classes.ts`; `generate.ts` keys triggers and the maintenance grant off them; `packages/db/sql/*` regenerated; `rls.test.ts` asserts UPDATE/DELETE/TRUNCATE on `identity_event` refuse then succeed under the hatch; `removeExtras` opens `app.maintenance`; the three comments corrected.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-password-reset.md`
  summary: A required `DEPLOYMENT=local|staging|production` key (AD-17, founder 2026-09-22), read by both roles; outside `local`, `MAILER=console`, `CLOCK_MODE=fixture` and `TRACKER_ADAPTER_OVERRIDE=fixture` are refused at first read naming the key. Today `console` is the default everywhere and nothing tells a deployment from local dev.
  evidence: Spine amendment round 1 (rubric F1, adversarial F3) chose a loopback test on `BETTER_AUTH_URL`; round 2 (adversarial r2 F6) showed it blocks LAN/container dev and cannot reach the worker, and the founder switched to an explicit profile. A deployment that forgets `MAILER` otherwise boots, prints live reset tokens and recipient addresses to CloudWatch, and sends nothing. `local` has one supplier per runner (spine AD-17, round 3): `apps/web/.env.development` (covers `pnpm dev` and `pnpm demo`, which spawns `next dev` directly), the worker's dev start, and `vitest.config.ts`'s `test.env` — never a script prefix or `ci.yml`'s job env. `scripts/seed.ts` reads it too and applies the `CLOCK_MODE` refusal. Pin each refusal in `config.test.ts`. Must land before Epic 8's first staging deploy.
  resolved: YES, 2026-09-22 in `spec-1-8-a-load-fixture-worth-measuring-against.md` — required DEPLOYMENT; refusals for console mail / fixture clock / fixture tracker; suppliers: `.env.development`, worker `--env-file`, vitest `test.env`.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-password-reset.md`
  summary: A completed password reset keeps the user's provider links, so a reset does not end access through a linked Google identity; there is no unlink path and the link itself is not recorded as an identity event.
  evidence: Founder decision 2026-09-22 (spine amendment round 1, AD-23: "a reset keeps the user's provider links"). Unlinking and recording a link land with account lifecycle — a deployment blocker for Epic 8's first deployment with real users, like the sign-in throttle.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-password-reset.md`
  summary: `onPasswordReset`'s three steps share one `try`, so a failed `identity_event` write skips invalidating the user's other reset tokens and marking the email verified; and `sendResetPassword`'s `hasCredentialAccount` sits outside its `try`.
  evidence: Spine amendment round 1 (rubric F2, tech-currency F4). AD-1 and AD-14 now require each step to be best-effort on its own and no hook to throw. `packages/db/auth/src/auth.ts:205-243`. Fix: one `try` per step in `onPasswordReset`; move the credential check inside `sendResetPassword`'s `try`. Extend the failing-writer case in `tests/password-reset.test.ts` to assert that an earlier outstanding link is refused.
  resolved: YES, 2026-09-22. One `try` per post-reset step; `hasCredentialAccount` inside `sendResetPassword`'s `try`; the failing-writer case asserts email verified and the earlier outstanding link refused.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-password-reset.md`
  summary: Mail-send failures and hook failures are logged with `console.warn`, not through `pino` with the Logging convention's keys.
  evidence: Spine amendment round 1 (rubric F8). AD-19 now names it; fold into Epic 8's `mailer-ses` work together with the mail-failure metric, alarm and SES bounce/complaint handling.

## Deferred from: review of spec-1-5-roles-decide-what-each-person-can-reach (2026-09-22)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-roles-decide-what-each-person-can-reach.md`
  summary: AD-23 still says membership use cases check `tenant_admin` in the context "Until story 1.5's role model"; that pre-parse sentence is now false in code.
  evidence: Spec Intent/Never excluded a spine amendment this slice. Amend AD-23 (drop or reword the "until 1.5" clause; keep the permanent lock re-check), adversarial-review, then regenerate `epic-1-context.md`.
  resolved: YES, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). "Until story 1.5's role model" is gone from AD-23, which now points at AD-12's declared-roles helper and leaves the locked-row re-check with the writer.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-roles-decide-what-each-person-can-reach.md`
  summary: Compiled `epic-1-context.md` Cross-Story Dependencies still says "until 1.5 lands, membership use cases check `tenant_admin` themselves".
  evidence: Stale after the declared-roles helper landed; regenerate only after the AD-23 spine amendment above, so the next compile does not reintroduce the old sentence.
  resolved: YES, 2026-09-23 by the Epic 1 retrospective's deferred-work audit (retro action item 6). `epic-1-context.md` was regenerated and no longer says "until 1.5".

## Deferred from: code review of spec-1-5-roles-decide-what-each-person-can-reach (2026-09-22)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-roles-decide-what-each-person-can-reach.md`
  summary: Project writes authorise `command.projectId` but never check that `ticketIds` and `wpId` belong to that Project, so a PM who reaches Project A can append `mapping_event` / `disposition_event` rows in A that name Project B's Tickets or Work Packages.
  evidence: Edge-case layer, verified at `packages/app/src/use-cases/project-write-input.ts:98-111` and `packages/db/src/repo-writes.ts` (`appendMappings`, `recordManualMapping`): `mapping_event` has no foreign key or check tying `ticket_id`/`wp_id` to `project_id`. B's figures are unaffected — `loadProjectBundle` reads mappings `WHERE project_id = …` and `mappingHead` keys by Ticket within that set — but the rows are append-only, so the junk in A is permanent, and the audit log shows the PM mapping another Project's Ticket. Pre-existing (before 1.5 any PM could write any Project). The `wpId` half is a `work_package.project_id = projectId` check inside the repository; the Ticket half needs a Ticket → Project ownership read (Connector scope, FR-42), which Epic 5's `ticket` table provides. UPDATE 2026-09-22: the spine now requires it (AD-12, "a project-scoped call's other ids belong to its Project", founder decision) — repository-checked inside the tenant transaction, `not_found` on mismatch; the `wpId` half was owed then (landed 2026-09-22, see `resolved`), the Ticket half with Epic 5.
  resolved: PARTIAL, 2026-09-22 in `spec-1-5-followup-scoped-ids-and-reach-gate.md`. The `wpId` half: `ProjectWriteRepository.workPackageInProject`, and `mapTickets` / `mapTicket` refuse `not_found` before any write (an unmap exempt), proved against Postgres with a Work Package of a second Project of the same Tenant (`tests/project-scoped-ids.test.ts`). The Ticket half stays open for Epic 5.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-roles-decide-what-each-person-can-reach.md`
  summary: `/` still redirects every user to `/p/prj-ec2/review`; since story 1.5 a PM not assigned `prj-ec2` lands on `not_found` at the home route.
  evidence: Edge-case layer, verified at `apps/web/src/app/page.tsx:4`. Already deferred from story 1.4 slice 1; 1.5's Project reach is what makes it bite. The seeded demo PM carries `prj-ec2`, so the demo is unaffected. Fix: redirect to the caller's first reachable Project (a Tenant Admin needs a Project list use case) or to a Project picker.

## Deferred from: spine amendment AD-12/AD-23 for story 1.5 (2026-09-22)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-roles-decide-what-each-person-can-reach.md`
  summary: The role gate proves the role half only; Project reach is proved per runner by hand-written cases, and the pinned `projectScoped` flag is read by nothing.
  evidence: Spine AD-12 amendment review (F1). A new `pm`-declared project-scoped runner that skips the reach `authorize` passes `tests/role-declarations.test.ts`. What closes it: a third loop that, for every `projectScoped: true` entry, calls the export as a PM whose `projectIds` omit the named Project, with well-formed input per use case (a small fixture map keyed by export name) and throwing deps, requiring `not_found` and no port touched. Add it before story 1.6 adds project-scoped use cases.
  resolved: YES, 2026-09-22 in `spec-1-5-followup-scoped-ids-and-reach-gate.md`: a reach loop over every `projectScoped` entry with a per-export `WELL_FORMED_INPUT` map whose completeness it asserts; watched to fail with the reach check removed from `runProjectWrite` and from `runProjectRead`.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-roles-decide-what-each-person-can-reach.md`
  summary: The ownership check (AD-12) needs a typed failure from the port so the use case can map a mismatch to `not_found`; today `isNotFound` matches only the Project-not-found message.
  evidence: Spine AD-12 amendment review (F8). Land with the `wpId` ownership slice: the lookup resolves `null` and the use case calls `refuse('not_found')`, or the repository rejects with a typed `{ code: 'not_found' }` — either replaces the message match in `packages/app/src/ports/project-read.ts`'s `isProjectNotFound`, which the earlier deferred entry on that coupling already asks for.
  resolved: PARTIAL, 2026-09-22 in `spec-1-5-followup-scoped-ids-and-reach-gate.md`: the ownership check is a boolean lookup plus `refuse('not_found')` — no message match. `isProjectNotFound`'s message match for an invisible Project is unchanged and still open (its own entry above).

## Deferred from: spec-1-5-followup-scoped-ids-and-reach-gate (2026-09-22)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-followup-scoped-ids-and-reach-gate.md`
  summary: A Mapping or a Map Disposition may still name a summary, milestone or soft-deleted Work Package of its own Project; the new check proves ownership only.
  evidence: Blind layer, verified: `workPackageInProject` filters `id` and `project_id`; the UI offers only leaf, non-milestone targets (`get-project-mapping.ts`, `review/page.tsx`), but the server accepts any Work Package of the Project, and `work_package.deleted_at` is not filtered. Pre-existing (before this slice any Work Package id was accepted). Hours mapped to a summary node or a milestone are likely to fall out of attribution. Fix with a "valid mapping target" rule (leaf, not a milestone, not deleted) decided alongside FR-21's mapping semantics — a product rule, not only an ownership one.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-followup-scoped-ids-and-reach-gate.md`
  summary: The ownership rule lives in the two use cases only; nothing in the database backs it, and other writers of `mapping_event` (rule-driven mappings, the seed) do not apply it.
  evidence: Blind layer, verified: `mapping_event` / `disposition_event` have no composite `(project_id, wp_id)` reference to `work_package`, and `appendMappings`'s future rule-driven callers and `packages/db/src/seed.ts` write without the check. Rows are append-only, so one missed writer leaves permanent bad data. A composite foreign key needs `work_package(project_id, id)` unique and a migration (AD-30's single scheduling migration is the natural place); rule evaluation (Epic 5, FR-22) must apply the same rule when it lands.

## Deferred from: spec-1-7-the-tenant-admin-can-read-the-audit-log (2026-09-22)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-7-the-tenant-admin-can-read-the-audit-log.md`
  summary: `listAuditLog` / `repo-audit` returns every matching Tenant row with no limit or cursor.
  evidence: Review round 1 (blind + edge). R0 seed is small; a long-lived Tenant could make one Admin request and N `lookupUser` calls unbounded. Spec did not require pagination. Add a default page size + cursor when an Admin surface needs it.

## Deferred from: review of spec-1-8-a-load-fixture-worth-measuring-against (2026-09-22)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-8-a-load-fixture-worth-measuring-against.md`
  summary: Under an injected seed Clock, DB Rate rows briefly used `isoDateUtc(stamp)` while in-memory `DemoState` / domain `rates[].effectiveFrom` stayed `2026-01-01`.
  evidence: Blind review of story 1.8. CI then showed Rate dates must stay on the fixture timeline start or Review numbers diverge from probes.
  resolved: YES, 2026-09-22 (PR #42 follow-up) — `writeTenantRows` keeps Rate `effectiveFrom` at `2026-01-01`; Clock stamps `demo_anchor` / Baseline `recordedAt` / audit `at` only.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-8-a-load-fixture-worth-measuring-against.md`
  summary: Resolved deferred entries for the Clock port still carry pre-resolution `evidence:` text (e.g. "no import of `@momo/adapters` exists anywhere").
  evidence: Docs-only. Updating or striking stale evidence on resolved rows is housekeeping, not a runtime defect.

## Deferred from: spec-1-9-every-string-is-externalised-and-the-currency-is-fixed (2026-09-22 split)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-9-every-string-is-externalised-and-the-currency-is-fixed.md`
  summary: Automated Japanese +30% layout gate for Project and Client demo surfaces (Review, Plan, Mapping, Connectors, Baselines, `/c/...`).
  evidence: Split from story 1.9 to keep the Epic 1 close under the Build scope budget. Founder chose automated gate (4-A); 1.9 applies that gate to the durable shell only. Those Project/Client pages are the demo spike Epic 2.2 rewrites file-by-file — re-run the gate when their strings land in the final surfaces.
  resolved: PARTIAL, 2026-09-23 in `spec-2-2-the-demo-spike-is-disposed-of-file-by-file.md`. The `/c/...` surface no longer exists (the route, its page and the Client View use case were removed). The Project surfaces' half is carried by the 2.2 follow-up row at the end of this file.

## Deferred from: review of spec-1-9-every-string-is-externalised-and-the-currency-is-fixed (2026-09-23)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-9-every-string-is-externalised-and-the-currency-is-fixed.md`
  summary: `changeTenantCurrency` checks `hasAnyRate` then `setCurrency` without a single-transaction re-check — a Rate inserted between the two calls could leave currency updated after a Rate exists.
  evidence: Edge-case review. Everyday window is only before the first Project (createProject always inserts a default rate). Settle with a single txn that re-reads rates under a Tenant lock before UPDATE.

## Deferred from: Epic 1 retrospective action item 5 — the +30% layout gate (2026-09-23)

- source_spec: `_bmad-output/implementation-artifacts/epic-1-retro-2026-09-23.md`
  summary: Eight shell strings do not fit their width budget once the Japanese is stressed to 130% of the English, and are carried in `KNOWN_OVERFLOW` in `packages/i18n/src/shell-layout-gate.test.ts` rather than fixed.
  evidence: Measured when retrospective F23 corrected the gate, which until then asserted `ja.length <= ceil(en.length * 1.3)` over a byte-identical `ja` catalog and therefore could not fail. With the gate inflating instead of capping, 8 of 98 shell keys exceed their budget: `shell.surfaces.mapping.title` (304px / 240), `errors.invalid_input` (408 / 360), `shell.snapshotPinTitle` and `shell.the_tracker_snapshot_this_view_is_pinned_to` (448 / 360), `auth.forgotPassword.sent.manyHours` and `.oneHour` (968 / 960), `auth.noAccess.you_are_signed_in_but_no_workspace_can_be_opened` (984 / 960), `auth.resetPassword.that_did_not_work_the_link_may_have_been_used_al` (1120 / 960). Each is copy to shorten or a surface to widen — a product decision, not a mechanical one, which is why they are recorded rather than changed here. The list is exact in both directions: a key not on it must fit, and a listed key that starts fitting fails the gate until it is removed, so it can only shrink. Natural place to settle them is story 2.2, with the Project/Client half of the gate.

- source_spec: `_bmad-output/implementation-artifacts/epic-1-retro-2026-09-23.md`
  summary: The layout gate is character arithmetic, not rendering, and charges a full-width kana the same 8px as a Latin character.
  evidence: `PX_PER_CHAR = 8` is calibrated for Latin at 14px; a full-width Japanese glyph is nearer a full em, so the gate understates real Japanese width by roughly half. It also models no font, no wrapping and no line breaks, so a long paragraph is measured as one line. Correcting the width model would move every budget at once and needs the real surfaces to calibrate against — the visual check belongs with story 2.2's Project/Client gate, where actual rendering is available.


## Scheduled into Epic 2 by founder decision (2026-09-23)

Three of the Epic 1 retrospective's recommendations were taken, and the rows behind them now have
a story rather than a place in this ledger. Recorded here so a reader who arrives at an open row
above can see where it went.

- **Composite foreign keys → story 2.1.** Story 1.2's criterion ("every foreign key between
  tenant-owned tables is composite and includes `tenant_id`") was never implemented and the schema
  carries none at all. The founder decided the criterion stands and that 2.1 pays it, because AD-30
  makes 2.1 the single pre-production migration: afterwards, adding a foreign key is a change to
  the migration policy rather than a migration. Story 2.1's acceptance now names the relationships
  the audit found unprotected, including `mapping_event → work_package`, which `seed.ts` writes
  with no ownership check.
- **The demo-spike rows → story 2.2.** The Plan and Review pages' inline `bigint` arithmetic and
  date comparisons, the Baselines page's per-version BAC, the Review page's Schedule Variance note
  contradicting its own SPI note at SV = 0, and the Japanese +30% layout gate for the Project and
  Client surfaces are all in files 2.2 rewrites file by file. They are discharged in 2.2's
  acceptance rather than carried: a debt row against code that is about to be deleted is noise. *Discharged 2026-09-23 by story 2.2 (`spec-2-2-the-demo-spike-is-disposed-of-file-by-file.md`): the spike's Gantt, Client View and `c/[projectId]` page are gone, and all 46 spike files have a recorded disposition. By founder decision the page arithmetic (with the SV note) and the Project-surface layout gate were split out rather than done, and are the two follow-up rows at the end of this file.*
- **The Organisation UI → story 2.17 (new).** Epic 1's narrative claimed it and Epic 1 shipped no
  Organisation screen. The deferral was conditioned on sign-in and roles existing; stories 1.4 and
  1.5 met that condition and nothing revisited it. It sits in Epic 2 because 2.2 rewrites the shell
  and 2.13 … 2.16 build the grid it reuses. Its acceptance also carries retrospective finding F21 —
  `loadProjectBundle` returns every Resource's Rate history for the whole Tenant, which is bounded
  today only because no page renders Rates, and stops being bounded the moment these screens exist.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-the-scheduling-schema-lands-in-one-migration.md`
  summary: `actuals_ledger_entry_baseline_version_fk` is scoped to the Tenant only, so a ledger row can pin another Project's Baseline in the same Tenant.
  evidence: The ledger row has no `project_id`, so the FK is `(tenant_id, active_baseline_version_seq) → baseline_version(tenant_id, seq)`. The gap predates story 2.1, which added the first FK here. Closing it needs a `project_id` on the ledger, which is an expand/contract migration (review pass 1, #15).
- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-the-scheduling-schema-lands-in-one-migration.md`
  summary: No tenant-owned table has an FK to `tenant(id)`, and `tenant_membership`, `session` and `account` have no FKs at all.
  evidence: Story 2.1 scoped its FKs to "between tenant-owned tables" (AD-3). A row set can hang off a Tenant id that does not exist. Decide this before Epic 8's tenant deletion (review pass 1, #16).
- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-the-scheduling-schema-lands-in-one-migration.md`
  summary: CI and `pnpm demo` run `drizzle-kit migrate` as the owner role, not AD-19's `migrator` role, and `db:migrate` runs before `pgboss:migrate` creates that role.
  evidence: This predates story 2.1: `push` also ran as the owner. The AD-19 ownership model has never been exercised (review pass 1, #17).
- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-the-scheduling-schema-lands-in-one-migration.md`
  summary: Decide whether soft-deleted children count toward `work_package.child_count`, and what happens to a soft-deleted leaf's `wp_dependency` edges.
  evidence: Unverified; severity would be medium. The writer (story 2.10, WP delete and re-parent through the fence) settles it. The `is_leaf` FKs and the leaf-only CHECK both depend on it (review pass 1, #18).
- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-the-scheduling-schema-lands-in-one-migration.md`
  summary: Story 2.2 must add a DB test for the head selection of `wp_status_event` in the reshaped `WorkPackage` reader: the highest `seq` per WP wins, and a non-milestone gets no milestone date.
  evidence: Verification-gap finding, review pass 1, #3. 2.1 only asserts the seeded values, because 2.2 rewrites the reader (`repo.ts` loadBundleInTenant).
  resolved: YES, 2026-09-23 in `spec-2-2-the-demo-spike-is-disposed-of-file-by-file.md`. `packages/db/src/wp-status-head.test.ts` writes two events for one milestone whose `seq` order disagrees with both insertion order and `at`, plus a head event on a non-milestone leaf, and reads them back through `loadProjectBundle` as the application role: the higher `seq` wins, and the leaf is "marked complete" and never a milestone row. Reversing the reader's `ORDER BY` fails it.
- source_spec: none
  summary: Story 2.2 follow-up. The Plan, Baselines and Review pages still do the parent roll-up, the `slipped` and milestone-overdue flags, per-version BAC and planned-scope AC themselves, with `bigint` arithmetic and date comparisons. They should take these computed figures from a use case (AD-1's "tolerated for now" bullet). The Review page's Schedule Variance note should also stop contradicting its SPI note at SV = 0.
  evidence: Split from story 2.2 by founder decision on 2026-09-23 (scope "1+2 first"), so that the shared 2.1+2.2 PR can go green and merge. This goal is an epics.md AC of story 2.2 and can ship on its own.
- source_spec: none
  summary: Story 2.2 follow-up. Extend the Japanese +30% layout gate from the shell to the Project and Client surfaces, with `KNOWN_OVERFLOW` in `packages/i18n/src/shell-layout-gate.test.ts` only shrinking. This includes the visual check that the gate's header comment defers to 2.2.
  evidence: Split from story 2.2 by founder decision on 2026-09-23 (scope "1+2 first"). This goal is an epics.md AC of story 2.2, it is independent of the schema work, and it can ship on its own.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-the-demo-spike-is-disposed-of-file-by-file.md`
  summary: The Plan, Review and Baselines pages have no render test. Their no-Baseline states, the `late` flag and the empty-state rows are checked only by typecheck and `next build`.
  evidence: The gap predates story 2.2; no page ever had a render test. Found in 2.2's review pass 1 (#21). It fits 2.13 (the real Plan surface) or a first Playwright pass.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-the-demo-spike-is-disposed-of-file-by-file.md`
  summary: The full `pnpm test` is flaky against a shared database. The captured failure is `mapping_event_pkey` 23505, from the client-allocated `seq` with no `pg_advisory_xact_lock` (`packages/db/src/repo-writes.ts:107`). Story 1.2's watermark slice owns the fix, and it should land before, or right after, the shared 2.1+2.2 PR merges.
  evidence: Observed in 2 of 17 full runs on a fresh `momo_verify` on 2026-09-23. The failing suites were `project-scoped-ids` (23505, captured), and `membership`, `org-writes` and `seed-sequences` (their error text was not captured). Story 2.2 added two probe suites (`wp-status-head`, `baseline-read`), which may raise the concurrency the race needs. Until the fix lands, CI can go red at random; re-run it. Founder decision on 2026-09-23: finish 2.2 and defer this.
  resolved: PARTIAL, 2026-09-23 in `spec-1-2-watermark-advisory-locks.md`. The 23505 half is closed: `mapping_event.seq` and `actuals_ledger_entry.seq` are identity columns (migration 0001), the `momo_next_*_seq()` allocators are gone, and every production append takes `lockWatermark` first (`packages/db/src/watermark-lock.ts`); `tests/watermark-concurrency.test.ts` runs twenty parallel map Dispositions with no 23505. 22 full `pnpm test` runs against one database (`momo_wm_verify`) showed no `_pkey` error. Two of them failed on the OTHER two suites this entry names, for reasons unrelated to `seq` allocation — see the `seed-sequences` entry below. Those remain open.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-the-demo-spike-is-disposed-of-file-by-file.md`
  summary: Map database constraint violations (23503/23514, including a deferred FK failing at COMMIT) in `runAuditedWrite` (`packages/app/src/use-cases/audited-write.ts:103`) to `invalid_input` with a named rule code, rather than rethrowing them as a 500. Add a test proving that a COMMIT-time violation leaves no audit row. Stories 2.4, 2.10 and 2.14 must check graph rules app-side before writing; the composite and leaf FKs are only the backstop.
  evidence: Advanced elicitation on 2026-09-23 (Failure Mode Analysis and Cascading Failure Simulation, P2). A 23503 raised at COMMIT on `wp_dependency_*_fk` travels `tenant-transaction` → `runAuditedWrite` (not a Refusal, not a not-found) → rethrow → Next's default error page. The user would get that page instead of 2.14's under-the-cell rejection naming the offence. Nothing reaches this path today, because no writer of `wp_dependency` exists yet.
  re-pointed: 2026-09-23 by `spec-2-4-the-four-graph-rules-are-invariants-not-entry-checks.md` (founder decision Q2 → A). Still deferred; it now belongs to the first writer of `wp_dependency` / `work_package` (story 2.9's fence or 2.10's WP writes), which should map a 23503/23514 to `invalid_input` reusing the guard's rule codes (`packages/app/src/schedule/plan-invariants.ts`: `CROSS_PROJECT_LINK`, `SUMMARY_ENDPOINT`, …). Story 2.4 added the app-side check and proved the backstops in `packages/db/src/schema-catalog.test.ts` (a cross-project edge refused at COMMIT with 23503 on a `wp_dependency_*_fk`; `SS`/`FF`/`SF` refused with 23514 on `wp_dependency_type_check`).
  resolved: PARTIAL, 2026-09-24 in `spec-2-9-one-path-writes-dates-and-the-run-is-the-record.md`. The fence maps 23503/23514 from plan-input writes to `invalid_input` via `mapSchedulingConstraint` (`packages/app/src/schedule/pg-errors.ts`) inside and around `applyPlanChange`'s `runAuditedWrite`. Story 2.10 keeps that mapping for the widened union (WP create/delete/re-parent/actuals/pct/CF). The generic `runAuditedWrite` mapper and a COMMIT-time deferred-FK probe that proves no audit row remain open for a later shared-write-path story.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-the-demo-spike-is-disposed-of-file-by-file.md`
  summary: `apps/web` has no `error.tsx` or `global-error.tsx`. Any error thrown from a server component or action (a DB error, the 23505 seq race, a dangling Baseline seq) renders Next's default error page with no product copy and no route back.
  evidence: Advanced elicitation on 2026-09-23 (P3). `find apps/web/src/app -name error.tsx` finds nothing. This predates 2.2; it fits the shell rework or 2.13.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-watermark-advisory-locks.md`
  summary: Every append-only writer that Epics 2 and 5 add (stories 2.9, 2.10, 5.5 — `wp_status_event`, `schedule_run`, `holiday_calendar_version`, `baseline_version`/`baseline_wp`, `tracker_snapshot`, `ticket_observation`, `actuals_ledger_entry`) must call `lockWatermark(bound, scope)` from `packages/db/src/watermark-lock.ts` immediately before its first INSERT, on the scope's `tx` — Project key for Project-scoped tables, Tenant key for Tenant-scoped ones, Project before Tenant when it needs both. The future `ComputationInputs` capture (Review/export/publish) takes `lockWatermarkShared` before it pins `seq_max`.
  evidence: The watermark slice (story 1.2) built the helper and wired every production append that exists today (`mapping_event`, `disposition_event`, `project_default_rate_entry`, `rate_entry`, and `audit_log` riding on the held key). It deliberately built no Epic 2/5 writer (spec "Never"). Nothing enforces the call mechanically: the only guard is `grep -rn pg_advisory_xact_lock packages/` finding a single non-test hit, which a writer that forgets the lock does not change. A writer that forgets it reintroduces the AD-20 hazard — a reader pinning "latest row at or below `seq`" can miss a row that commits later with a lower `seq`.
  resolved: PARTIAL, 2026-09-24 in `spec-2-9-one-path-writes-dates-and-the-run-is-the-record.md` and closed for Epic 2's fence writers in `spec-2-10-work-packages-actual-dates-and-custom-fields-edited-through.md`. `schedule_run`, `wp_status_event` and `pct_override_event` appends call `lockWatermark` on the Project key (no-op when the fence already holds it). Remaining Epic 5 append-only writers (`holiday_calendar_version` publish path beyond the synthetic seed, baselines, tracker_snapshot, ticket_observation, later `actuals_ledger_entry`) still owe the call when their stories land.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-watermark-advisory-locks.md`
  summary: Two remaining `pnpm test` flakes, neither a 23505. (1) `seed-sequences.test.ts` sets the shared `audit_log` counter to an ABSOLUTE 960_000_500 and reads it back with `toBe`; any audit insert from a parallel suite in between fails the read (seen: 960000501). (2) On a database reused across runs, that same absolute `setval` moves the counter BACKWARDS below audit rows the previous run left, so a suite that filters "audit rows above the seq floor at test start" (`tests/membership.test.ts` `membershipAudits`) sees none (seen: two `role and Project changes` tests answering `[]`).
  evidence: Found in the watermark slice's 17-run check on 2026-09-23 (runs 8 and 11 of 17, both on `momo_wm_verify`, which is reused across runs). A fresh CI database runs the suite once, so (2) should not occur in CI; (1) can. The fix is test-local: advance with `GREATEST(high, current position)` and assert `>=`, or set the counter from a value above the current position rather than a constant.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-watermark-advisory-locks.md`
  summary: `audit_log` rides on whatever watermark key the transaction already holds (D2) — a Project key for a Mapping or default-Rate write, the Tenant key otherwise — so two audited writes on different Projects of one Tenant do not serialise, and a Tenant's `audit_log` seq order is not its commit order. Revisit if a reader ever pins `audit_log` at a watermark; the fix is the sink always taking the Tenant key, after any Project key (the lock order allows it).
  evidence: Harmless today: `packages/db/src/repo-audit.ts` orders the admin audit list by `seq` and has no cursor, so no reader depends on "every row at or below `seq` has committed". Keyset pagination over `audit_log`, or any export pinned at a `seq`, would. Found in the coordinator's review of the watermark slice on 2026-09-23.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-watermark-advisory-locks.md`
  summary: The H4 half of the TODO this slice deleted from `repo-writes.ts`: rule evaluation must re-read the Ticket's head inside the Project watermark lock. Relatedly, `recordPlanDisposition` reads the Project's `9.` Work Packages to compute the next WBS code BEFORE `appendMappings` takes the Project key, so two concurrent Plans on one Project can compute the same `9.<n>`. Fix by taking the Project key before those reads.
  evidence: No rule evaluator exists yet (Epic 5), so only the Plan race is live, and only under concurrent Plans on one Project. The watermark slice placed the lock "last thing before the first append" per its spec; moving it earlier for `recordPlanDisposition` is a deliberate widening of the locked region. Found in the coordinator's review on 2026-09-23.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-watermark-advisory-locks.md`
  summary: A contract migration must `DROP FUNCTION IF EXISTS public.momo_next_mapping_event_seq()` and `public.momo_next_actuals_ledger_entry_seq()`. On a database upgraded through 0001 they remain, still EXECUTE-able by `momo_app` (the regenerated grants no longer mention them, so nothing revokes the old grant), and as SECURITY DEFINER they return the cross-Tenant `MAX(seq)`.
  evidence: Migration 0001 is expand-only by founder decision D1 ("A database that already has the functions keeps them harmlessly until a later contract step drops them"). What they disclose is a row count across Tenants, nothing else. A fresh database never has them.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-watermark-advisory-locks.md`
  summary: No automated test applies migration 0000, writes rows, then applies 0001 and checks that `nextval` exceeds `MAX(seq)`, that a non-empty table leaves the counter `is_called = true`, and that `relforcerowsecurity` is restored. There is no upgrade-path migration harness yet.
  evidence: Verified by hand twice in this slice on 2026-09-23 (a scratch database migrated to 0000, a row written at `seq` 5000 with FORCE RLS on, then `db:migrate`): `mapping_event` last value 5000 and next 5001, the empty `actuals_ledger_entry` next 1, FORCE still set on both. CI only ever migrates an empty database.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-one-canonical-order-for-everything-the-scheduler-reports.md`
  summary: Close story 2.3's AC 4 at engine level. Point `expectShuffleInvariant(fn, input, n)` (`tests/support/shuffle-invariant.ts`) at `domain/schedule.recalculate` in story 2.5, so `outputs` are identical in codec-canonical form (`stringify(encode(…))`) over N ≥ 50 seeded shuffles of the WP and edge lists; and at the stored run in story 2.9, re-reading `schedule_run.inputs`/`outputs` through the codec rather than comparing `jsonb` text.
  evidence: Founder decision Q1-A, 2026-09-23. Story 2.3 has no engine to shuffle, so its AC 4 closes as "the ordering stage is shuffle-invariant": the helper is applied to `canonicalWps` in `packages/domain/src/schedule/order.test.ts`. AD-28's shuffled-input determinism gate is about the engine's reported lists, which only exist from 2.5 (critical path, driving chains from 2.6 and 2.7) and are only stored from 2.9.
  resolved: YES, superseding the earlier partial — 2026-09-24 in `spec-2-9-one-path-writes-dates-and-the-run-is-the-record.md`. The stored-run half is closed: `tests/schedule/fence.test.ts` and `tests/schedule/stored-run.test.ts` re-read encoded inputs/outputs through `stringify(encode(…))` and `expectShuffleInvariant` over seeded shuffles of the WP/edge lists. EARLIER: PARTIAL, 2026-09-24 in `spec-2-5-the-forward-pass-a-slip-moves-the-tasks-that-depend-on-it.md` (engine half only).
- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-the-four-graph-rules-are-invariants-not-entry-checks.md`
  summary: Story 2.9's `app/schedule.applyPlanChange` must call `checkPlanInvariants(plan, edges)` (`packages/app/src/schedule/plan-invariants.ts`) on EVERY mutation — dependency add/remove/re-lag, WP create/delete/move/re-parent, and `confirmImport` — over the proposed post-mutation plan (the Project's whole WP tree, with leafness from its parent links), before the write, and return its `invalid_input` unchanged. Caller contract: `plan.wps` must include every WP any edge names, foreign-Project endpoints too, each with its own `projectId` (otherwise a cross-project edge throws instead of being reported in `crossProject`); a deleted WP's edges are removed from the proposed edge list; and `validate` throws on an unknown endpoint, a duplicate WP id or a parent-link loop — caller defects, not `invalid_input`. A re-parent that touches no edge must still be checked: it can turn a legal edge into an ancestor/descendant or summary-endpoint one.
  evidence: Founder decisions Q1 → B and Q3 → pure guard, 2026-09-23. Story 2.4 builds the guard but no fence (spec "Never": no `applyPlanChange`, no writer of `wp_dependency`). Nothing enforces the call mechanically; the DB FKs catch only summary endpoints and cross-project links, and only as a 500 until the 23503/23514 mapping entry above lands.
  resolved: PARTIAL, 2026-09-24 — fence call closed for all 2.10 mutation shapes (create/delete/re-parent included) in `spec-2-10-work-packages-actual-dates-and-custom-fields-edited-through.md`. `confirmImport` remains for its own story.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-the-four-graph-rules-are-invariants-not-entry-checks.md`
  summary: Story 2.5's `domain/schedule.recalculate` must call `validate(plan, edges)` (`packages/domain/src/schedule/validate.ts`) before the forward pass and halt when `hasOffences` is true, naming the offending edges and cycles from its four lists (FR-6a: the four rules hold "before every pass", and the scheduler must never guess around a cycle).
  evidence: Founder decision Q4 → defer, 2026-09-23. Story 2.4 creates nothing named `recalculate` (AD-25). How a halted run is recorded (a `halted_reason` like the calendar-range halt, and `wp_schedule` marked `stale`) is 2.5's and 2.9's to settle.
  resolved: YES, 2026-09-24 in `_bmad-output/implementation-artifacts/spec-2-5-the-forward-pass-a-slip-moves-the-tasks-that-depend-on-it.md`. `recalculate` (`packages/domain/src/schedule/recalculate.ts`) calls `validate` before its pass and, when `hasOffences` is true, returns `{ kind: 'halted', reason: 'graph_invalid', offences }` with the four lists unchanged and no outputs. `recalculate.test.ts` asserts the halt equals `validate`'s output. How 2.9 records that halt is in the entry below.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-5-the-forward-pass-a-slip-moves-the-tasks-that-depend-on-it.md`
  summary: Story 2.9 computes the per-WP cause (the seven What-moved causes) from `prevInputs`, and records both of `recalculate`'s halts. `recalculate(inputs, prevInputs)` keeps `prevInputs` in its signature (AD-25) but does not read it. A `graph_invalid` halt carries `validate`'s four lists and a `calendar_range` halt carries `{ anchors: [{ anchor, side }], wps: [{ wpId, side }] }` (WPs in `compareWp` order; WPs downstream of one that left the range are not evaluated, so not named); 2.9 must append a run with `halted_reason` and no outputs for either, and mark `wp_schedule` `stale`.
  evidence: Founder decision Q5 → A, 2026-09-24. Story 2.5 is pure and has no `schedule_run` writer (spec "Never": no table, use case or repository). The outputs 2.5 returns are keyed by `wpId`; AD-26's index-referenced stored encoding is 2.9's too, decoded before the call.
  resolved: YES, 2026-09-24 in `spec-2-9-one-path-writes-dates-and-the-run-is-the-record.md`, with the 2.9 founder split Q2 → A: per-WP FR-28 causes from `diff(prevInputs, inputs)` (`packages/domain/src/schedule/cause.ts` + `recalculate` overlay); `graph_invalid` full rollback/refuse (nothing persisted); `calendar_range` appends a halted run (`halted_reason`, null outputs) and stale-marks `wp_schedule`. Index encode/decode in `packages/domain/src/schedule/stored-run.ts`.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-5-the-forward-pass-a-slip-moves-the-tasks-that-depend-on-it.md`
  summary: Story 2.12 must resolve a `holiday_calendar_version` row into the pure `CalendarVersion { nonWorkingDays, rangeStart, rangeEnd }` (`packages/domain/src/calendar.ts`) with an EXHAUSTIVE `nonWorkingDays`: every weekend day in range as well as every JP/VN national holiday and Project day. The domain applies no weekend rule of its own, and `workingDayIndex` throws on a non-working day outside the range. The 2026–2028 dataset, the table and `publishCalendarVersion` stay 2.12's.
  evidence: Founder decision Q1 → A, 2026-09-24. Story 2.5 tests only hand-built fixtures (`calendar.test.ts`, `recalculate.test.ts`), which list weekends explicitly. The unbounded `HolidayCalendar` helpers that `evm.ts` and `forecast.ts` use are unchanged and still apply a weekend rule; retiring or bridging them is not scheduled.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-6-the-backward-pass-float-and-the-critical-path.md`
  summary: Story 2.9 stores the backward pass's outputs. `recalculate` returns, keyed by `wpId`, per WP `lateStart`, `lateFinish`, `floatDays`, `isCritical` and `drivingPredecessors` (ids, in `compareWp` order), and per Project `anchor` (`{ kind: 'project_finish' | 'computed_finish', date } | null`, the date as the PM set it), `computedFinish` and `criticalPath` (ids, early start ascending then `compareWp`). 2.9 must encode `drivingPredecessors` and `criticalPath` as integer indices into `inputs.wps` (AD-26), write `anchor` and `computed_finish` to their `schedule_run` columns, mirror the per-WP fields into `wp_schedule.late_start/late_finish/float_days/is_critical`, and record the backward pass's two `calendar_range` halts as halted runs like the others: a Project finish outside the calendar's range halts with the new anchor `project_finish`, and a late date before `rangeStart` halts naming the WPs with side `before` and `anchors` empty.
  evidence: Story 2.6 is pure (spec "Never": no migration, table, port, use case or UI). The columns already exist in `packages/db/drizzle/0000_scheduling_schema.sql` and were mirrored in names only. Comparing the critical path as an ordered set (Baselines, Published Snapshots) depends on that index encoding.
  resolved: YES, 2026-09-24 in `spec-2-9-one-path-writes-dates-and-the-run-is-the-record.md`. AD-26 index encoding covers `drivingPredecessors` and `criticalPath`; `appendScheduleRun` writes `anchor` / `computed_finish` / `engine_version`; success rebuilds `wp_schedule` including `late_*` / `float_days` / `is_critical` (never null); `calendar_range` halts append + stale as in the 2.5 entry above.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-6-the-backward-pass-float-and-the-critical-path.md`
  summary: Story 2.8's golden corpus must pin the two backward-pass choices story 2.6 made that the founder decisions did not state outright. (1) No late finish is later than the anchor: with a lag of −2 or less (−1 or less out of a milestone), Q1's literal min-over-successors rule would put a predecessor's late finish past the anchor. (2) The computed finish is the latest early finish of a remaining or in-progress WP, so a Plan whose leaves are all complete has no computed finish. Hand-compute at least one case of each, plus negative Float against a PM-set finish.
  evidence: Choice (1) resolves a conflict inside the story 2.6 spec: without the cap, W (5 d) →(−3) S (1 d) with no Project finish gives both WPs Float 2 and no WP Float 0, which contradicts AC 1 ("the minimum Float is 0") and the Design Notes. It changes nothing for lag ≥ −1. Pinned in `packages/domain/src/schedule/recalculate.backward.test.ts` ("finishes no WP after the anchor"). The founder confirmed both on 2026-09-24 (spec decisions Q6 → A and Q7 → A).
  resolved: YES, 2026-09-24 in `spec-2-8-the-golden-scheduler-corpus.md`. Corpus cases `anchor-cap` (Q6) and `all-complete` (Q7), plus `negative-float`, live under `packages/domain/src/schedule/corpus/` and are codec-compared in `corpus.test.ts`.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-7-constraints-are-soft-reported-and-stay-on-their-own-work-pac.md`
  summary: Story 2.9 must index-encode soft-constraint violation chains in the stored run. `recalculate` returns `ScheduleOutputs.violations` keyed by `wpId`, each with `askedDate`, `derivedDate`, `daysLate` and `chain` (ids from the first-driver walk). AD-26's stored encoding writes every other reference as an integer index into `inputs.wps`; 2.9 must encode each violation's `wpId` and every id in `chain` the same way when writing `schedule_run.outputs` jsonb.
  evidence: Story 2.7 is pure (spec "Never": no migration, table, port, use case or UI). Violations live in outputs jsonb (2.9), not columns — confirmed against `packages/db/drizzle/0000_scheduling_schema.sql`. The 2.6 entry above already covers `drivingPredecessors` / `criticalPath`; violation chains are the 2.7 half of the same index-encoding contract.
  resolved: YES, 2026-09-24 in `spec-2-9-one-path-writes-dates-and-the-run-is-the-record.md`. `stored-run.ts` index-encodes violation `wpId` and every `chain` id; round-trip covered in `tests/schedule/stored-run.test.ts`.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-7-constraints-are-soft-reported-and-stay-on-their-own-work-pac.md`
  summary: Epic 6 Health (FR-31) may compare constraint dates to actuals for complete and in-progress WPs. Story 2.7's `recalculate` ignores a constraint on a complete or in-progress leaf for both dates and the violation list (founder decision Q5 → A); misses after actuals are left to Health, not this pass.
  evidence: Founder decision Q5 → A, 2026-09-24. Pinned in `packages/domain/src/schedule/recalculate.constraints.test.ts`. FR-31's milestone / constraint Health rules read the same outputs; judging a finished or started WP against its `must_*` is deliberately out of the scheduling pass.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-8-the-golden-scheduler-corpus.md`
  summary: Keep corpus cases off the unratified 2.5 implementer edges until the founder ratifies them: actual finish on a non-working day; complete WP with null duration; actual finish without actual start; milestone remaining-duration edge cases from the 2.5 Implementation Notes.
  evidence: Founder decision Q2 → B, 2026-09-24 (story 2.8). The golden corpus pins only ratified 2.5 date conventions; locking the four edges early would freeze arithmetic the founder has not signed.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-11-the-three-project-schedule-settings.md`
  summary: Localize Story 2.11 Project settings and Plan no-start product copy (NO_PROJECT_START_YET, PROJECT_FINISH_TEACHING, dataDateAdvancePreview month labels, settings form labels) into packages/i18n so a Japanese session is not English-only on those surfaces.
  evidence: Review BH8 (2026-09-24): ja.json only gained shell nav strings for settings; teaching/preview/no-start band remain English constants. Fence and schedule behavior are correct; this is the i18n product-copy backlog, not a 2.11 correctness defect. Natural pickup with the broader i18n/layout gate work or when 2.15 polishes strip chrome that reuses the same strings.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-12-the-holiday-calendar-and-its-dated-versions.md`
  summary: Create the non-tenant `operator_audit` table and writer, and have `app/calendar.publishCalendarVersion` record one operator_audit row on national-table fan-out (AR-57 / AD-29), in addition to each Project's `audit_log`.
  evidence: Founder decision Q1 → B, 2026-09-25 at Build Checkpoint gates. Story 2.12 ships per-Project `audit_log` only so Epic 8's operator surface is not pulled into the scheduling epic; the AR-57 AC gap is accepted until Epic 8 lands the table.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-12-the-holiday-calendar-and-its-dated-versions.md`
  summary: Generate `packages/db/drizzle/meta/0003_snapshot.json` so drizzle-kit meta history matches journal entry `0003_calendar_day_event`.
  evidence: Review BH1 (2026-09-25): journal lists 0003 but only 0000–0002 snapshots exist. Runtime migration applies; kit history is incomplete. Defer regenerating the snapshot with drizzle-kit.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-12-the-holiday-calendar-and-its-dated-versions.md`
  summary: Localize Story 2.12 Holiday Calendar settings copy (section title, JP/VN labels, Project non-working-day controls) into packages/i18n.
  evidence: Review BH6 (2026-09-25): calendar settings strings are hardcoded English, parallel to 2.11 BH8 i18n backlog. Fence behaviour is correct.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-13-the-plan-tree-grid-and-its-schedule-preset.md`
  summary: Formal NFR-P1 Plan grid load harness (p75 under 2 s / p95 under 4 s on the Epic 1 500-WP fixture). Story 2.13 ships structural + smoke coverage (row render / ARIA treegrid / compareWp order); the timed harness is deferred.
  evidence: Spec Verification and Design Notes — fixture load smoke where practical; formal p75 harness deferred unless requested.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-13-the-plan-tree-grid-and-its-schedule-preset.md`
  summary: Schedule-strip sticky chrome, Float-anchor sentence, and What-moved band behaviour after recalculation (story 2.15). 2.13 ships empty structural slots only (Q1→A).
  evidence: Founder decision Q1→A, 2026-09-25. Slots exist in UX-DR2 order; strip/What-moved behaviour is deliberately out of 2.13.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-13-the-plan-tree-grid-and-its-schedule-preset.md`
  summary: Schedule-exceptions rail + three explainer popovers (constraint violation / out-of-sequence / not-schedulable) — story 2.16. 2.13 ships the Exception cell (glyph+word+number) and an empty rail slot.
  evidence: Spec Boundaries Never / Design Notes. Cell is required by UX-DR12; rail walk and explainers stay 2.16.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-13-the-plan-tree-grid-and-its-schedule-preset.md`
  summary: Baseline-compare and Comfort All column presets, plus Observed % / Gap / Evidence Progress columns (Epics 4–6). 2.13 ships Schedule + Progress only (Q4→A); keys 3/4 are no-op/disabled.
  evidence: Founder decision Q4→A, 2026-09-25.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-13-the-plan-tree-grid-and-its-schedule-preset.md`
  summary: Localize Story 2.13 Plan treegrid product copy (preset labels, column headers, Critical, Exception strings, stale/halt banners) into packages/i18n.
  evidence: Review BH1 (2026-09-25): Schedule/Progress surface is hardcoded English, parallel to 2.11 BH8 / 2.12 BH6.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-13-the-plan-tree-grid-and-its-schedule-preset.md`
  summary: Collapse duplicated Plan grid display helpers (`packages/app/.../plan-grid.ts` vs `apps/web/.../plan-grid-format.ts`) into one shared module so EN formatting and SUMMARY_NA_LABEL cannot drift.
  evidence: Review BH8 (2026-09-25): web mirrors app formatters by hand; extracting a shared package is more than a trivial patch.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-13-the-plan-tree-grid-and-its-schedule-preset.md`
  summary: Complete ARIA treegrid keyboard contract beyond expand/collapse and preset keys (e.g. Left on a leaf moves to parent; full gridcell navigation).
  evidence: Review BH15 (2026-09-25): Manual Verification promised fuller treegrid keyboard behaviour than the partial delivery; not a one-line fix.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-14-dependencies-and-constraints-are-created-and-explained-on-th.md`
  summary: Comfort Links panel (`l`) listing the selected WP's predecessors and successors with picker/lag/remove, same FR-6a checks, sharing the exceptions-rail slot (UX-DR11).
  evidence: Split at story 2.14 Open Questions gate — founder chose Q1→A (Core predecessor + constraint cells only). Cutting costs discoverability, not FR-6a/FR-7 access; panel would compete with the empty 2.16 rail slot.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-14-dependencies-and-constraints-are-created-and-explained-on-th.md`
  summary: Polite live-region announce after a successful recalculation (UX-DR26 full sentence with moved count, computed finish, minimum Float).
  evidence: Split at story 2.14 Open Questions gate — founder chose Q2→C (assertive FR-6a refuse only). Polite success belongs with the What-moved band in story 2.15 so the PM can inspect what moved.
  resolved: YES, 2026-09-26 in `spec-2-15-the-schedule-strip-and-the-what-moved-band.md` — polite `aria-live` on Plan beside assertive FR-6a, fired from the What-moved band after each successful recalc.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-14-dependencies-and-constraints-are-created-and-explained-on-th.md`
  summary: Full keyboard combobox for predecessor autocomplete (ArrowUp/Down, aria-activedescendant, Enter accepts highlight).
  evidence: Review BH4 (2026-09-25): mouse autocomplete ships; fuller combobox keyboard is beyond Core typing AC.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-14-dependencies-and-constraints-are-created-and-explained-on-th.md`
  summary: Atomic all-or-nothing apply of multi-edge predecessor fan-out (single transaction / compensate mid-fail across sequential applyPlanChange calls).
  evidence: Review BH7/EC1/EC7 (2026-09-25): pre-validate blocks FR-6a before writes; mid-fail after partial success is a rare concurrency/DB path and needs fence redesign, not a trivial patch.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-14-dependencies-and-constraints-are-created-and-explained-on-th.md`
  summary: Unrelated flaky WAL budget assert in tests/schedule/fence.test.ts (AR-50).
  evidence: Review BH13 (2026-09-25): noted during 2.14 verification; not introduced by predecessor/constraint editors.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-14-dependencies-and-constraints-are-created-and-explained-on-th.md`
  summary: RTL/component harness proving predecessor keep-typed-text + assertive aria-live wiring end-to-end.
  evidence: Review VG3 UI half (2026-09-25): repo has no testing-library/jsdom; pure refuse mapping is unit-tested; UI keep-text remains structural.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-15-the-schedule-strip-and-the-what-moved-band.md`
  summary: Comfort *Undo this edit* on the What-moved band for the current user's last recalculation.
  evidence: Split at story 2.15 Open Questions gate — founder chose Q1→A (Core band without Undo). Cutting costs recovery speed, not schedule correctness.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-15-the-schedule-strip-and-the-what-moved-band.md`
  summary: Advance Data Date to the Reporting Period boundary CTA on the Plan schedule strip (EXPERIENCE Data Date panel).
  evidence: Split at story 2.15 Open Questions gate — founder chose Q2→A (strip fence date edit only). Advance-to-period remains on Project settings / Review.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-16-the-schedule-exceptions-rail-and-its-three-explainers.md`
  summary: Persisted illegal-edge "This plan cannot be scheduled…" band with named offending edges and last-good schedule marked stale (UX-DR23 / Story 2.16 AC).
  evidence: Split at story 2.16 Open Questions gate — founder chose Q1→A. Fence 2.9 refuses graph_invalid at write time (FR-6a); only calendar_range halt banner chrome ships in 2.16.
  resolved: RECONCILED, 2026-09-27 in Epic 2 retrospective — `epics.md` story 2.16 AC amended from Core to Deferred (Q1→A). Band remains out of R0 unless a durable illegal-edge write path is later allowed; row kept so the deferral stays discoverable.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-9-one-path-writes-dates-and-the-run-is-the-record.md`
  summary: NFR-P1 300 ms p95 full recalculation under the per-Project fence lock on the Epic 1 500-WP fixture (story 2.9 / AR-53 risk gate).
  evidence: Epic 2 retrospective F13 (2026-09-27) — domain suite only had a single-sample 2,500-leaf wall-clock; fence.test timed lock_timeout contention only.
  resolved: YES, 2026-09-27 in `tests/schedule/fence-nfr-p1.test.ts` — seeds the load-fixture 500-WP shape into a probe Project, samples 20 post-warmup `applyPlanChange` timings under the Project watermark, asserts empirical p95 < 300 ms.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-16-the-schedule-exceptions-rail-and-its-three-explainers.md`
  summary: Collapse duplicated calendar-range halt banner formatters (`packages/app` calendarRangeHaltBanner vs `apps/web` calendarRangeHaltBannerCopy) into one shared module.
  evidence: Review BH5 (2026-09-27): two formatters can drift; same helper-dedupe backlog as 2.13 BH8 / 2.15 BH10.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-16-the-schedule-exceptions-rail-and-its-three-explainers.md`
  summary: Show Holiday Calendar national provenance (JP/VN / dataset id) on the violation explainer when cheap from stored inputs.
  evidence: Review BH11 (2026-09-27): Design Notes optional polish; Always only requires versionSeq.

## Deferred from: code review of spec-2-16-the-schedule-exceptions-rail-and-its-three-explainers.md (2026-09-27)

- source_spec: `_bmad-output/implementation-artifacts/spec-2-16-the-schedule-exceptions-rail-and-its-three-explainers.md`
  summary: Confirm whether `chainFocusActive` stays true after a recalc rebind unmounts the violation explainer, leaving grid `j` / `k` dead because `onGridKeyDown` returns early.
  evidence: Code review (2026-09-27), maybe-false. `plan-tree-grid.tsx` rebind does not clear `chainFocusActive`. The chain list `onBlur` usually clears it on unmount. Settle with a runtime repro: recalc while the chain list is focused and see whether grid `j` / `k` stay dead.

- source_spec: none
  summary: Story 2.17 follow-up — Resources & Rates screens (list Rate history in effective-date order; append via `appendResourceRate` / `appendProjectDefaultRate`) plus Epic 1 retrospective F21 narrowing `loadProjectBundle` resource/rate_entry reads to the Project before any screen renders Rates.
  evidence: Split from story 2.17 at the Build multi-goal gate (2026-09-27). Founder chose hierarchy screens (Department / Program / Project) first; Resources & Rates and F21 are independently shippable and stay Comfort for a later PR.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-17-the-tenant-admin-can-see-and-run-the-organisation.md`
  summary: Story 2.17 follow-up — PM assignment UI (assign/unassign a member's Project via existing `assignMemberProject` / `unassignMemberProject`).
  evidence: Split at story 2.17 Open Questions gate — founder chose Q2→B (hierarchy screens only). EXPERIENCE lists PM assignment under Admin: Organisation; epics ACs for 2.17 name create/rename/reassign. Natural home is Admin: Users or a later Organisation follow-up.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-17-the-tenant-admin-can-see-and-run-the-organisation.md`
  summary: Rename `UserChip` / layout prop `showAuditLog` to something that means "show Admin menu" now that it also gates Departments / Programs / Projects.
  evidence: Review BH8 (2026-09-27): flag semantics widened; rename touches multiple call sites and tests — more than a trivial patch.


## Deferred from: code review of spec-2-17-the-tenant-admin-can-see-and-run-the-organisation.md (2026-09-27)

- source_spec: `_bmad-output/implementation-artifacts/spec-2-17-the-tenant-admin-can-see-and-run-the-organisation.md`
  summary: Admin org pages’ `valueOrNotFound` → `notFound()` path is not exercised by a page/route test.
  evidence: Build review `4d6707a..a43517e` (2026-09-27). Use-case PM→`not_found` and `result.test.ts` cover the helper; per-page tests would be a new convention shared with other admin pages.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-17-the-tenant-admin-can-see-and-run-the-organisation.md`
  summary: Japanese Admin chrome still leaves `admin.administration` and `admin.audit.*` in English while `admin.org.*` is localized.
  evidence: Build review `4d6707a..a43517e` (2026-09-27). Pre-existing mixed chrome; this slice only shipped Japanese `admin.org.*` copy.

- source_spec: `_bmad-output/implementation-artifacts/spec-f21-milestone-duration-pairing.md`
  summary: Non-milestone Work Packages can still carry durationDays === 0 via create_wp / patch_duration, so the engine treats them as milestones while the UI does not show ◆ (reverse of F21 pairing).
  evidence: F21 review 2026-09-27 (BH/EC). Approach and matrix only enforce milestone ⇒ duration 0 and Q1→C on clear; refusing duration 0 on non-milestones was not decided and remains pre-existing.

- source_spec: `_bmad-output/implementation-artifacts/spec-f10-schedule-role-audit-gates.md`
  summary: applyPredecessorSet authorizes and opens a transaction before calling applyPlanChange but stays outside both the use-cases barrel and the F10 second schedule/calendar module list.
  evidence: F10 review 2026-09-28 (BH). Spec Design Notes preferred registering fence + calendar publish only; thin wrappers inherit. Closing the predecessor-set escape needs an explicit follow-up if product wants every package-barrel write enumerated.

- source_spec: `_bmad-output/implementation-artifacts/spec-f6-fence-test-harness.md`
  summary: Shared fence afterAll still swallows removeProbeTenant failures with `.catch(() => {})`, hiding probe cleanup errors across all nine suites.
  evidence: F6 review 2026-09-30 (BH). Pre-existing silence pattern copied into `fence-harness.ts`; not introduced as a new policy by the extract.

- source_spec: `_bmad-output/implementation-artifacts/spec-f6-fence-test-harness.md`
  summary: Fence/write harness `reachableAs` can hang forever if `getPool(url).connect()` never resolves (no timeout).
  evidence: F6 review 2026-09-30 (EC). Identical pre-existing pattern in `tests/write-harness.ts`; extract did not add a timeout.

- source_spec: `_bmad-output/implementation-artifacts/spec-f6-fence-test-harness.md`
  summary: REQUIRE_DB=1 unreachable path throws without an explicit `closeAllPools()` after a failed reachability probe may have opened pools.
  evidence: F6 review 2026-09-30 (EC). Pre-existing; `reachableAs` releases the client on failure, same as write suites.

- source_spec: `_bmad-output/implementation-artifacts/spec-f2-f5-collapse-plan-display-helpers.md`
  summary: Plan EN display helpers (`inkTone` / `formatMinFloat` / `formatFloatDisplay`) still treat empty-string dates and non-finite float numbers as ordinary values rather than NA.
  evidence: F2/F5 review 2026-10-03 (EC). Byte-identical move from plan-grid / web mirrors; schedule/use-case callers supply null or finite integers today — hardening would be a separate guard change.
