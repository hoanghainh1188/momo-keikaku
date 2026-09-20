# Deferred work

Goals split out of a Build intent. Each entry is a goal that was in scope when the
work started and was deliberately deferred, with the evidence for the split.

- source_spec: none
  summary: Story 1.1 slice B — the one-command local run and the workspace substrate: the five missing workspace units (apps/worker, packages/app, packages/db/auth, packages/adapters, packages/i18n), packages/app/config's zod fail-boot schema, the Clock port with the ESLint bans on Date.now()/new Date()/process.env, pg-boss installed and migrated by the migrator role with the app role on DML grants and auto-migration disabled, and `pnpm dev` bringing Postgres, migrations, RLS/grants/triggers, the seed, web and worker up in one command.
  evidence: Split from story 1.1 on 2026-09-20 at the Build multi-goal gate. Slice A (four major version upgrades — pnpm 9.15.0 to 12.4.2, TypeScript 5.7 to 6.0.3, vitest 2 to 5.0.1, drizzle-orm 0.38 to 0.45.2, plus pinning the Postgres image to 18.6) is independently shippable against the current 43-file codebase and is gated by the CI added in PR #6, so upgrade breakage surfaces on code that already exists rather than on top of five new packages. Founder chose the split. Note the one honest cost: story 1.1's final acceptance criterion spans both slices — its first half (a fresh install and typecheck succeed under pnpm 12 and TypeScript 6) is accepted in slice A, while its second half (apps/worker, packages/db and packages/adapters declaring "types": ["node"]) cannot be accepted until those packages exist in slice B. Slice A therefore closes with that criterion deliberately partial.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-version-upgrades.md`
  summary: Move apps/web from the Next 15 line (currently resolving 15.5.25) to the decided Next 16.3.5. React needs nothing: ^19.0.0 already resolves 19.3.0, which is the decided version.
  evidence: Deferred 2026-09-20 at the spec's Open Questions gate. The decided stack names Next 16.3.5, but slice A was scoped as a toolchain move and Next 15 to 16 is a framework major. (An earlier draft of this entry said React was also behind at 19.0.0; that was the caret range read as a resolved version — React is already at 19.3.0.) Its breakage would land in the eight apps/web files that reach @momo/db directly — exactly the files Epic 2's story 2.2 rewires onto use cases and then deletes or rewrites. Upgrading them first means debugging code that is already scheduled to change. The cost of deferring is a real divergence: after slice A the whole repo is on the decided stack except apps/web, which nothing enforces and nobody is reminded of, which is why it is written down here. Natural place to pick it up is with or after story 2.2, or sooner if a security advisory lands on Next 15.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-version-upgrades.md`
  summary: Nothing in the verification path ever executes a database query, so the drizzle-orm 0.38→0.45 and pg 8.13→8.23 majors plus the Postgres 18.6 pin are covered only by tsc.
  evidence: Real and verified. All three test files compute from JSON fixtures through the pure domain core; a repo-wide grep of test files for drizzle, pg, getDb, loadReview and @momo/db returns nothing, and CI has no services: postgres block. A row-mapping or DDL difference would ship with all three gates green and surface as wrong money figures on the Review page. Not a defect today — drizzle-kit 0.31.10 was hand-run and still emits all four CREATE INDEX statements from schema.ts, and peek-db.ts reads figures correctly through repo.ts. The fix is a Postgres service in CI plus a round-trip test that seeds and reads back the golden figures, which is the first DB test this repo would have; CI's own header says to add the service when the first test needs one.
  
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-version-upgrades.md`
  summary: packages/db still owes a per-package "types": ["node"] declaration, and neither slice A nor the recorded slice B deferral names it.
  evidence: epics.md:494 names apps/worker, packages/db AND packages/adapters in story 1.1's final criterion; the spec's closing AC and the slice B entry above both name only apps/worker and packages/adapters. packages/db exists today and has no tsconfig.json. Nothing fails right now because the root tsconfig's include covers packages/**/*.ts with types: ["node"], so the gap is invisible until slice B gives each package its own tsconfig — at which point packages/db can be missed. Verified by ls.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-version-upgrades.md`
  summary: Node 24.21.0 is pinned only inside CI — no engines field, no .nvmrc, no .node-version — so local runs use whatever Node the developer has.
  evidence: Verified absent. This box runs 24.13.0 while CI now pins 24.21.0, which is exactly the drift class this slice exists to close. Deliberately not patched: adding engines.node: "24.21.0" would break installs on the founder's current Node, so the choice between an exact pin, a range, and an .nvmrc-only convention is a decision rather than a one-line fix. Pair it with the pnpm engines pin at the same time.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-version-upgrades.md`
  summary: vitest went 2→5 with no coverage configuration, so the project's 80% coverage floor is neither measurable nor gated.
  evidence: vitest.config.ts carries only resolve.alias, test.include and environment — no coverage block, provider or threshold. The project's testing rules mandate 80% minimum. A vitest major is the cheapest moment to add it, but adding a provider and thresholds is new capability and would fail immediately at current coverage, so it needs its own slice.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-version-upgrades.md`
  summary: apps/web is typechecked but never built, and @types/node just crossed a major under it.
  evidence: CI runs tsc --noEmit for apps/web and never next build. The lockfile now resolves next@15.5.25(@types/node@24.13.6), so Next's typings sit on Node 24 types rather than Node 22. The typecheck gate covers types, not a production build, and this gap became load-bearing with this change. Adding next build to CI is new scope.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-version-upgrades.md`
  summary: Root tsconfig.json duplicates tsconfig.base.json instead of extending it, and apps/web/tsconfig.json redeclares paths and loses the base's @momo/domain/* and @momo/db/* wildcards.
  evidence: Both verified by comparing the files. The duplication is why baseUrl had to be deleted in three places instead of one, and TS 7 has further deprecations queued that will each need applying twice with nothing detecting drift. The lost wildcards bite the first @momo subpath import from apps/web; none exists today. Both are pre-existing structure — this change removed only baseUrl.

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
