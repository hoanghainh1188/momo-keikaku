---
title: 'Story 5.14 — Approximate figures say they are approximate'
type: 'feature'
created: '2026-10-09'
status: 'done'
route: 'dispatch'
review_loop_iteration: 2
baseline_commit: '7cc39c99aec5a34b64bf4499231f9bb56f8848b7'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** FR-26 and the ARCHITECTURE-SPINE "Approximation label" rule (`ARCHITECTURE-SPINE.md:634`) require every person- or day-level actuals output to carry `approximate: true` + a domain `reasonCode`, rendered as a non-dismissible inline caption **above** the chart/table: "Approximate — hours are spread between snapshots, not taken from worklogs." (`EXPERIENCE.md:116,146`). No such contract exists, so a later story (Epic 6, R1 Client View) could ship a silent person/day breakdown or name people in Unplanned Work. Meanwhile the Review footer (`review/page.tsx:722`) labels exact figures "Approximate".

**Approach:** Land the contract and guards only: a domain `Approximated<T>` envelope in its own module; a web `ApproximateBreakdown` render-prop wrapper that is the only place `data` is unwrapped and always puts the caption first; fitness tests and a depcruise rule for FR-26's three consequences; remove the misleading Review footer.

**Decisions (Harry, 2026-10-09):**
- Q1→**A**: contract + caption component + guards only. No person- or day-level view in R0.
- Q2→**C**: remove the Review footer caption (Review figures are exact: Addendum A.2 books the whole delta to the later snapshot's Period). Delete key `review.approximate_hours_are_derived_from_the_differenc` (en+ja). "No view ranks people" is enforced by tests, not displayed.
- Envelope: `Approximated<T> = Readonly<{ approximate: true; reasonCode: ApproximateReason; data: T }>`.
- Loop 1 / 1→**B**: `ApproximateBreakdown<T>({ label: Approximated<T>; children: (data: T) => ReactNode })` — render-prop; the notice is module-private (not exported). The wrapper module must **not** carry `'use client'` (a function child cannot cross the server→client boundary); a test pins this. The structural guard (any web view importing `Approximated` must render through `ApproximateBreakdown`) strips comments (or uses the TS AST) before matching, so a mention in a comment does not satisfy it. The remaining gap — a view reading `r.data` from an inferred envelope without importing the type name — is recorded in `deferred-work.md` for the story that adds the first producer.
- Loop 1 / 2→**A**: placement + reachability. Types and `approximate()` live in `packages/domain/src/approximate.ts`, **not** re-exported by the `present` barrel. Web gets a dedicated entry `packages/domain/src/present/approximate.ts` (alias `@momo/domain/present/approximate`), allowed by widening `pathNot` of depcruise rule `web-to-domain-present-only`. Wrapper lives only in `apps/web/src/components/approximate-notice.tsx` (never `components/ui.tsx`). A new depcruise rule forbids anything reachable from the Client View route (`apps/web/src/app/**/c/**`, ignoring `(group)` segments) from reaching `approximate-notice` or either approximate domain module. A negative test proves a fake `app/(client)/c` file importing the wrapper is reported.
- Loop 1 / 3→**A**: domain regression test — `computeReview` on a ledger with assignees, using distinct sentinels for account id, Resource id and person name; `JSON.stringify(output)` (bigint replacer) contains none, and the test first asserts the sentinels are present in the input. Expected green without code change (`ReviewResult` takes `resources` as input only).
- Unplanned groups: two Tickets that differ only in assignee share group key and label.

**Decisions (agent, recorded — not user-visible):**
- `ApproximateReason = 'hours_spread_between_snapshots'` (closed union); helper `approximate(reason, data)` returns a frozen envelope.
- i18n key per reason: `actuals.approximate.hours_spread_between_snapshots` (exact en copy; ja in です・ます).
- `departmentEffortRollup` (Department-level, test-only) is out of scope.

## Boundaries & Constraints

**Always:** Label on the domain output; caption text from i18n; caption static (no close control) and rendered before the render-prop output; reason code is a domain code; wrapper module has no `'use client'`; approximate modules stay out of the `present` barrel.

**Never:** Build any person/day view; touch attribution math, Mapping, ledger, or 5.11–5.13 Coverage/Review chrome beyond the footer removal; Client View; schedule motion; migrations; edit `epics.md`; put the wrapper in `components/ui.tsx`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Envelope | `approximate('hours_spread_between_snapshots', rows)` | `{ approximate: true, reasonCode, data: rows }`, frozen | Unknown reason → type error |
| Wrapper order | `<ApproximateBreakdown label={x}>{(d) => <table/>}</ApproximateBreakdown>` | Notice precedes render-prop output; exact en copy; ja in ja locale; no dismiss control; render-prop receives `x.data` | Missing key → i18n test fails |
| Server-only wrapper | `approximate-notice.tsx` source | No `'use client'` directive | Guard test fails |
| Unwrapped use | Web view imports `Approximated` without `ApproximateBreakdown` (or only in a comment) | Guard test fails naming the file | N/A |
| Client View reach | Fake `app/(client)/c/page.tsx` imports the wrapper | depcruise reports the new rule | Negative test fails if not reported |
| present barrel | `present/index.ts` | Does not reach `approximate.ts` | depcruise / guard test |
| Unplanned naming | Two Tickets identical except assignee | Same group key + label | N/A |
| Review DTO | Ledger with sentinel account/Resource/name | Sentinels present in input, absent from `JSON.stringify(output)` | N/A |
| Review footer | Review renders | No footer caption; old key absent in en/ja | N/A |

</frozen-after-approval>

## Code Map

- `packages/domain/src/approximate.ts` (new) -- `APPROXIMATE_REASONS`, `ApproximateReason`, `Approximated<T>`, `approximate()`; no imports from `units.ts` needed. Export from **neither** `packages/domain/src/index.ts` nor `present/index.ts`: the Client View will reach the domain barrel through `packages/app`, so a barrel export would make `client-view-not-to-approximate` fire on every real Client View. Domain producers import `./approximate` directly. A guard test cruises `packages/domain/src/index.ts` and asserts it reaches neither approximate module. Doc comments say what is guaranteed: the freeze is shallow (envelope only), and the label survives reshaping only when the result is typed `Approximated<T>`.
- `packages/domain/src/present/approximate.ts` (new) -- type-only re-export of `Approximated`, `ApproximateReason` for web. `packages/domain/src/present/present.test.ts:107` -- add a sibling gate: `Object.keys(await import('./approximate'))` is `[]` (no runtime export crosses).
- `.dependency-cruiser.cjs:139-152` -- widen `web-to-domain-present-only` `pathNot` to also allow `present/approximate.ts`; add rule `client-view-not-to-approximate` (`reachable: true`, to approximate-notice / `domain/src/approximate.ts` / `present/approximate.ts`). depcruise refuses nested regex repeats, so `from` lists one pattern per depth 0–3, where each segment is a route group `(name)` **or a parallel-route slot `@name`** (both are absent from the URL). The guard test fails loudly if any folder under `app/` has a `c/` segment behind more than three such segments, so the depth cap cannot be passed silently. Config has `tsPreCompilationDeps: true`, so type-only imports count. `tests/depcruise-fences.test.ts` -- add deny probes for `web-to-domain-present-only`: a web file importing `packages/domain/src/present/codec.ts` and one importing `packages/domain/src/approximate.ts` each fire the rule.
- `apps/web/tsconfig.json:27` + `vitest.config.ts:19-23` -- add alias `@momo/domain/present/approximate` **before** `@momo/domain/present` (aliases prefix-match).
- `apps/web/src/components/approximate-notice.tsx` (new) -- private `ApproximateNotice` + exported `ApproximateBreakdown` render-prop; `createElement` (web compiles `jsx: preserve`); no `'use client'`. Render a `<figure>` whose first child is the caption as `<figcaption class="caption" data-testid="approximate-notice">`, then the render-prop output, so assistive tech associates the caption with the breakdown.
- `apps/web/src/app/p/[projectId]/review/page.tsx:722` -- delete footer `<p>`.
- `packages/i18n/src/messages/{en,ja}.json:510` -- delete old key; add `actuals.approximate.hours_spread_between_snapshots`.
- `packages/domain/src/review.ts:420-457` -- no change expected; tests only.
- `apps/web/src/app/p/[projectId]/connectors/{linking-panel,page}.tsx` -- allow-list for the secondary assignee/Tracker Account field scan.
- Probe hygiene in `approximate-guards.test.ts`: write the Client View probe under a group nothing real uses, `app/(__probe-approximate)/c/`; refuse to run if that path already exists; remove only that directory. `callsCreateElement` matches the callee `createElement` or `React.createElement` exactly (not `document.createElement`). `tests/support/tree-probe-lock.ts` header -- `apps/web/src/app/` is now a probe target; walkers of `apps/web/src` hold the lock.
- START FROM `/private/tmp/claude-501/-Users-hoanghainh-privatespace-harry-forge-momo-keikaku--claude-worktrees-practical-burnell-9c4243/789f1780-be1a-4c34-aa9f-336ab39b305b/scratchpad/diff-5-14-loop1-KEEP.patch` (loop 1, all green: 1470 tests) -- apply it with `git apply`, then make only the amendments above. Loop-0 KEEP (superseded) (`/private/tmp/claude-501/-Users-hoanghainh-privatespace-harry-forge-momo-keikaku--claude-worktrees-practical-burnell-9c4243/789f1780-be1a-4c34-aa9f-336ab39b305b/scratchpad/diff-5-14-loop0-KEEP.patch`): units tests (envelope/freeze/reshape/type errors), two-assignee review test, i18n copy, component test shape, guard file skeleton + allow-list, Review footer guard. Re-home domain code into `approximate.ts` first, then rework the guard.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/approximate.ts` + `approximate.test.ts` + `present/approximate.ts` + `present/present.test.ts` -- envelope in its own module, not in any barrel; runtime-export gate.
- [x] `.dependency-cruiser.cjs` + `apps/web/tsconfig.json` + `vitest.config.ts` + `tests/depcruise-fences.test.ts` -- web entry allowed (with deny probes); Client View reachability rule incl. `@slot`; alias.
- [x] `packages/domain/src/review.test.ts` -- two-assignee group test; sentinel whole-DTO test with input-presence assertion.
- [x] `packages/i18n/src/messages/{en,ja}.json` -- add caption key; remove footer key.
- [x] `apps/web/src/components/approximate-notice.tsx` + `.test.ts` -- render-prop wrapper in `figure`/`figcaption`, private notice; order/copy/ja/no-dismiss/receives-data tests.
- [x] `apps/web/src/app/p/[projectId]/review/page.tsx` -- remove footer.
- [x] `apps/web/src/app/approximate-guards.test.ts` + `tests/support/tree-probe-lock.ts` -- AST structural guard; domain barrel reaches no approximate module; depth-cap tripwire; probe hygiene; no `'use client'` in wrapper; `present/index.ts` does not reach approximate modules; depcruise negative test on a temp `app/(__probe-approximate)/c` file; secondary field scan with allow-list; Review footer guard.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- entries: inferred-envelope `r.data` bypass (also per-file co-presence and alias re-export of the type); and: once a domain producer of `Approximated<T>` is exported through the barrel, the Client View rule must be re-targeted (the barrel will reach `approximate.ts`).
- [x] `sprint-status.yaml` -- 5.14 stays in-progress; review at step 4.

**Acceptance Criteria:**
- Given any person- or day-level actuals breakdown, when typed, then it is an `Approximated<T>` carrying `approximate: true` and a domain `reasonCode` (FR-26).
- Given such a breakdown in the UI, when rendered, then its data is reachable only through `ApproximateBreakdown`'s render-prop, below the non-dismissible i18n caption (FR-26, EXPERIENCE.md).
- Given the Client View route, when dependencies are cruised, then nothing it reaches touches approximate (person/day) modules; and no Review output or Unplanned group carries a person identity (FR-26, FR-34, UX-DR29, §7.1).

## Implementation Notes

- Citation errata (do not fix `epics.md` here): Story 5.14 AC cites **UX-DR17**, which is the Disposition rail (`epics.md:236`), and **AR-18**, which is query-time attribution (`epics.md:168`). The correct sources are `ARCHITECTURE-SPINE.md:634` (Approximation label) and `EXPERIENCE.md:116,146`.
- Estimate note for retro: sprint planning sized 5.14 at 8 points (`oq12-sprint-planning-2026-09-20.md:384`), assuming a person/day view. Q1→A (contract + guards only) is much smaller; the gap is scope choice, not velocity.
- (Loop 0, reverted) Deviations from the Code Map (implementation): `Approximated`/`ApproximateReason` are also type-re-exported from `@momo/domain/present`, because depcruise rule `web-to-domain-present-only` bars web from the `@momo/domain` barrel. `approximate-notice.tsx` uses `createElement` (web compiles `jsx: preserve`; unit gate cannot load JSX), following `user-chip-menu.ts`. The structural guard also scans `.ts` files that call `createElement`. The person-field allow-list has two entries: `connectors/linking-panel.tsx` and `connectors/page.tsx` (builds the linking rows; no hours).
- (Loop 0, reverted) Matrix "Review footer" row pinned by an added guard in `approximate-guards.test.ts` (page no longer references the old key; key absent from en/ja).
- (Loop 0, reverted) Verified: `pnpm lint`, `typecheck`, `depcruise` exit 0; `pnpm test` 1460 passed.
- ja caption is agent wording; needs native-speaker check.
- (Loop 1) depcruise refuses a nested-repeat regex (safe-regex), so `client-view-not-to-approximate` lists four `from` patterns for zero to three `(group)/` segments before `c/`; four or more nested groups would escape the rule (the folder scan in the guard test still uses the unbounded pattern).
- (Loop 1) The Client View probe writes temporary files under `apps/web/src/app/(client)/c/` (repo pattern from `tests/depcruise-fences.test.ts`), so suites that walk the web tree now hold `tests/support/tree-probe-lock.ts`: `removed-routes.test.ts`, `packages/i18n/src/key-usage.test.ts`, `tests/web-composition.test.ts` source scan, and the clean cruise in `tests/depcruise-fences.test.ts`.
- (Loop 1) Structural guard reads the TypeScript AST (comments and strings ignored; named, renamed and namespace imports of the entry covered) with self-tests; `.ts` files that call `createElement` count as views. Allow-list: `connectors/linking-panel.tsx`, `connectors/page.tsx`.
- (Loop 1) Verified: `pnpm lint`, root + `@momo/web` typecheck, `pnpm depcruise` exit 0; `pnpm test` 1470 passed; no probe left in the tree. ja caption is agent wording — native-speaker check pending.
- (Loop 2) Applied the loop-1 KEEP patch, then the loop-2 amendments: `approximate.ts` in no barrel (barrel-reach tests for both `index.ts` and `present/index.ts`); runtime-export gate on `present/approximate.ts`; deny probes in `tests/depcruise-fences.test.ts`; `@slot` + depth-cap tripwire; probe under `app/(__probe-approximate)/c/` with pre-existence refusal; exact `createElement` callee; `figure`/`figcaption`; lock header; two more deferred entries.
- (Loop 2) Verified: `pnpm lint`, root + `@momo/web` typecheck, `pnpm depcruise` exit 0; `pnpm test` 1477 passed / 509 skipped (DB suites); no probe left in the tree. Implementer mutation-checked the barrel-reach and depth-cap guards (re-added barrel export / 4-deep `c/` → exactly those tests failed).

## Spec Change Log

- Loop 1 (intent_gap, human-renegotiated 2026-10-09): review found the frozen structural guard (named-import scan + per-file `<ApproximateBreakdown` token) bypassable by comments, inference and a detached `label`/`children` wrapper; the folder-only Client View guard blind to imports and route groups; and "no ranking" unpinned beyond Unmapped groups. Amended: render-prop wrapper with private notice and no `'use client'`; comment-stripped guard; `approximate.ts` own module + `present/approximate.ts` web entry + depcruise reachability rule with a negative test; sentinel whole-Review-DTO test. Known-bad state avoided: a guard that passes while a caption-less person/day view ships. KEEP: loop-0 units tests, two-assignee review test, i18n copy (en + ja), component test shape, guard allow-list, Review footer removal + guard.

- Loop 2 (bad_spec, 2026-10-09): Code Map told the implementation to export `approximate` from the domain barrel; with `reachable: true`, every real Client View (which reaches `@momo/domain` through `packages/app`) would trip `client-view-not-to-approximate`. Amended Code Map: no barrel export + a barrel-reach test; runtime-export gate on `present/approximate.ts`; deny probes for the widened `web-to-domain-present-only`; `@slot` segments + depth-cap tripwire; unique probe group and safe cleanup; exact `createElement` callee; `figure`/`figcaption`; honest doc wording; lock-header update; extra deferred entries. Known-bad state avoided: a Client View rule that blocks every legitimate Client View, so the next author deletes it. KEEP: everything in the loop-1 patch not named above (AST guard + self-tests, render-prop wrapper with private notice and no `'use client'`, sentinel and two-assignee review tests, i18n en/ja, footer removal + guard, tree-probe locking of web walkers, aliases).

## Review Triage Log

- (Loop 2 review) `medium` → patch — VG: real `client-view-not-to-approximate` `from` patterns only probed at depth 1 behind a `(group)`; depth 0, `@slot` and depth 3 unexercised against the config.
- (Loop 2 review) `medium` → patch — VG: `reachable: true` never exercised; both probes import the approximate modules directly.
- (Loop 2 review) `low` → patch — `removed-routes.test.ts:16` comment names `app/(client)/c/`; probe is `app/(__probe-approximate)/c/`.
- (Loop 2 review) `medium` → defer — structural guard name-matching gaps beyond the deferred inference case: `import('…/approximate').Approximated` inline type imports, `createElement as h` / namespace React callees, local component named `ApproximateBreakdown`. Same root (needs a type-aware guard once a producer exists).
- (Loop 2 review) `low` → defer — intercepting-route Client View (`(.)c/`, `(..)c/`) not matched by the rule or tripwire; enumerating markers in a safe-regex-compatible pattern belongs with the R1 Client View story.
- (Loop 2 review) `low` → defer — ja caption is agent wording; native-speaker check not tracked.
- (Loop 2 review) `false` — diff omits story paperwork: `_bmad-output` is excluded from the review diff by construction; `deferred-work.md` entries and the spec exist on disk.
- (Loop 2 review) `false` — lock held for the whole guard file risks waiter timeouts: the file runs in ~1.3 s with all three cruises (measured, 20 tests).
- (Loop 2 review) `low` → reject — Client View person-field check non-transitive and raw-text: secondary layer; transitive fence is the depcruise rule; a comment hit fails loudly.
- (Loop 2 review) `low` → reject — Review footer guard pins only the old key / `actuals.approximate.` prefix: pinning arbitrary copy is not feasible; unlikely regression.
- carried `false` — "no ranking" untested for anonymous ordering (3→A tests).
- carried `low` → reject — `PERSON_FIELD` misses Resource vocabulary.
- carried `low` → reject — reshape drops the freeze / no `mapApproximated`.
- carried `low` → reject — runtime unknown `reasonCode` renders empty caption.
- carried `low` → reject — alias `ApproximateBreakdown as AB` wrongly flagged.

- `medium` → bad_spec — Loop 1: `packages/domain/src/index.ts` `export * from './approximate'` (per Code Map) makes the domain barrel reach `approximate.ts`; a Client View page reaching `packages/app` → `@momo/domain` would trip `client-view-not-to-approximate` (`reachable: true`).
- `medium` → patch (folded into loop-2 Code Map) — probe cleanup `rmSync(app/(client))` deletes a whole real route group once the Client View exists, and never checks the path first.
- `medium` → patch (folded) — VG: widened `web-to-domain-present-only` `pathNot` has no deny probe (codec / domain `approximate.ts`).
- `medium` → patch (folded) — VG: `present/approximate.ts` "types only" has no runtime-export gate, unlike `present.test.ts:107` for the barrel.
- `medium` → patch (folded) — Client View rule covers 0–3 `(group)` segments and no `@slot` segments; test regex unbounded; no tripwire at the cap.
- `medium` → defer — `rendersBreakdown` is per file (one wrapper use passes a file that also renders another envelope's `.data`) and a local `export type { Approximated as Rows }` hides the name from views: same root as the deferred inferred-envelope gap; needs a type-aware guard once a producer exists.
- `medium` → patch (folded) — caption `<p role="note">` is not associated with the breakdown for screen readers; use `figure`/`figcaption`.
- `low` → patch (folded) — `tests/support/tree-probe-lock.ts` header still says walkers of `apps/web/src` need no lock.
- `low` → patch (folded) — `approximate.ts` docs claim reshaping "cannot drop the label" and imply a deep freeze; the freeze is shallow and an untyped spread drops it.
- `low` → patch (folded) — `callsCreateElement` uses `.endsWith('createElement')`, so `document.createElement` helpers count as views.
- `low` → reject — no negative probe proving a non-Client-View page importing the wrapper does not fire the rule: `from` is anchored to `app/…c/` shapes; adding probe files for an unlikely regex broadening is more machinery than harm.
- `low` → reject — alias `import { ApproximateBreakdown as AB }` wrongly flagged: fails loudly on valid code, author renames; resolving bindings adds complexity.
- carried `low` → reject — `PERSON_FIELD` misses Resource vocabulary (secondary layer by frozen decision).
- carried `low` → reject — runtime unknown `reasonCode` renders empty caption (closed union, no deserialisation path).
- `false` — "no ranking" untested for anonymous per-assignee ordering: the two-assignee test pins that Unmapped groups do not split by assignee, and the sentinel test pins no identity anywhere in the Review output (3→A).
- `false` — caption says "snapshots" not "Tracker Snapshots": the copy is the exact `EXPERIENCE.md:116,146` string the frozen intent mandates.
- `false` — lock held for the whole guard file starves waiters past ~180 s: the file runs in ~1 s (measured `vitest run` 1.0 s, 16 tests).
- `low` → reject — json-reporter exit-code branch (`status === 2`) possibly dead: harmless either way; unverified.

- `medium` → intent_gap — structural guard keys on a named `import { Approximated }` (`approximate-guards.test.ts` IMPORTS_APPROXIMATED): a view that gets the envelope by inference (`const r = await byPerson(); r.data.map…`) or a namespace import never matches, and `RENDERS_BREAKDOWN` is a per-file token test (a comment satisfies it). Frozen decision fixes this rule; strengthening needs a human choice.
- `medium` → intent_gap (same root) — `ApproximateBreakdown` takes `label` and `children` separately, so the caption is not tied to the data it sits above; labelled data can render elsewhere uncaptioned.
- `medium` → intent_gap (same root) — `ApproximateNotice` is exported and can be rendered below a table; the Review guard's `actuals.approximate.` check cannot see it (key lives in the component file).
- `medium` → intent_gap — Client View guard reads only files physically under `app/c/**`: a Client View page importing a shared person-level component passes, and a rebuild under a route group (`app/(client)/c`) passes vacuously. Frozen decision scopes the guard to the folder.
- `medium` → intent_gap — "no view ranks or scores people" is claimed as test-enforced (Q2→C) but only Unmapped groups are tested for person identity; nothing pins the rest of the Review DTO.
- `low` → reject — `PERSON_FIELD` misses Resource vocabulary (`resourceId`, `resourceName`): secondary layer by frozen decision; adding it would allow-list most resource-management pages (added complexity, little everyday harm).
- `low` → reject — envelope freeze lost on hand-spread reshape / no `mapApproximated`: label survives (type-checked); freeze is defence in depth, a helper adds public surface.
- `false` — "nothing produces `Approximated<T>`, AC claimed met": Q1→A deliberately ships contract only; first producer is a later story (Implementation Notes).
- `low` → patch (moot on loopback) — `approximate-notice.tsx` comment says "same convention as `user-chip-menu.ts`" though that file is `.ts`.
- `false` — i18n path built by relative `join`: a layout change makes `readFileSync` throw, failing loudly, not silently.
- `low` → reject — `data-reason` attribute untested: cosmetic.
- `low` → reject — runtime unknown `reasonCode` renders empty caption: closed union, no deserialisation path exists; a fallback adds a branch for an unreachable state.
- `medium` (VG, pre-verified) → intent_gap (same root as structural guard) — VG filed `defer` (no producer yet); routed with its root cause.

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm depcruise` -- expected: exit 0
- `pnpm test` -- expected: new domain, component and guard tests green; i18n parity green
