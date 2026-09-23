# Adversarial review — AD-1's third carve-out, `apps/worker`'s adapter entry point (2026-09-23)

**Target:** the amendment naming `apps/worker/src/index.ts` in AD-1, drafted while closing Epic 1
retrospective action item 14 / open question 5.
**Method:** one context-free reviewer read the draft diff, the whole of AD-1 around it, and the
code the draft makes claims about — `.dependency-cruiser.cjs`, `apps/worker/src/`,
`apps/web/src/server/composition.ts`, `tests/depcruise-fences.test.ts`, `.github/workflows/ci.yml`
— and ran `pnpm depcruise` rather than reasoning from the prose.
**Weighting requested:** whether the amendment states anything the code does not actually do.

## What the review confirmed

`pnpm depcruise` is green (234 modules, 717 dependencies, exit 0). `apps/worker/src/index.ts:15`
imports `productClockOn` from `@momo/adapters` and nothing from `packages/db`. The rule is named
`no-test-or-tooling-in-source` with `to: '^(tests|scripts)/'`. The
`WRK -. composition root only .-> ADP` edge matches `apps-adapters-only-from-composition-root`.

## What it found, and what was done

| # | Finding | Resolution |
|---|---|---|
| F1 | Carve-out (2) still read "the one file in **any app** permitted to import `packages/adapters`", which (3) revokes ~1,500 words later in the same bullet | (2) now says "the one file in `apps/web`", and points at (3) |
| F2 | The draft described the widened test/tooling rule as absolute; the rule carries `pathNot: '[.]test[.]tsx?$'`, so in-package `*.test.ts` files are exempt — **an overstatement of the gate, the exact failure this document exists to prevent** | The exemption is now stated, and listed among what is unenforced |
| F3 | "Three probe files pin each direction" mis-describes them: two pin banned directions, the third is a negative control for the `*.test.ts` exemption. Separately, `apps-adapters-only-from-composition-root` — the rule this amendment exists to record — had **no probe at all** | Wording corrected; a fourth probe added at a second `apps/worker` path, so the exemption is proved to be the one named file rather than the whole app |
| F4 | Calling the worker file a "composition root" borrows (2)'s term while meeting none of its obligations: it reads configuration and the clock at boot, exports nothing, and starts a process on import | Renamed "named adapter-wiring entry point"; the difference from (2) is stated, and the obligations it *does* carry are written down |
| F5 | "permitted to import `packages/adapters` and nothing else this AD otherwise forbids" is contradicted by the AD's own live-violations bullet: `index.ts` → `./boss.ts` → `pg-boss` | The reachability is stated in (3), pointing at the live violation |
| F6 | The draft framed the widening as "the step story 1.8 missed" — laundering, by the very document meant to detect it, a config change that outran both `reviews/review-adversarial-ad1-carve-out.md` F2 and `.dependency-cruiser.cjs`'s own header ("A third needs the spine amended first"). No founder decision was cited, where every other carve-out has one | Recorded as it happened: the 2026-09-21 standing decision pre-authorised it conditionally, story 1.8 met the condition but widened the gate first, and the founder ratified on 2026-09-23 |
| F7 | (2)'s provenance sentence ended up trailing after (3), so "decided by the founder" read as (3)'s | Provenance returned to (2); (3) carries its own |
| F8 | `updated:`, the history paragraph and `reviews_applied` were not touched — the same omission `review-adversarial-ad1-carve-out.md` F8 raised about the previous AD-1 amendment | All three updated; this file added to `reviews_applied` |
| F9 | The Structural Seed still granted `packages/adapters` to `apps/web` alone, named no worker file, and carried pre-widening wording for `tests/` and `scripts/` | Seed amended in the same change |
| F10 | Two other ADs still describe the worker's composition root as future, and one (the worker identity path) carries an obligation this amendment causes to fall due | Both reworded; the identity obligation restated against a condition that has not yet fired, rather than one that silently has |
| F11 | `.dependency-cruiser.cjs`'s header and CI's header both still said two carve-outs, while the config granted three | Both headers reconciled in the same change |
| F12 | "the worker reaches `packages/db` by no arrow at all" is true of imports and misleading about the database: the worker opens `APP_DATABASE_URL` through pg-boss | Caption now says it imports nothing from `packages/db` and reaches Postgres only through pg-boss on the restricted role |
| F13 | Tying the carve-out to "story 1.8's fixture `Clock`" misdescribes a permanent production edge: the code imports `productClockOn`, the mode-agnostic selector, and `CLOCK_MODE=fixture` is refused outside `local` | Restated as the `Clock` in every mode |
| F14 | The live-violations bullet said "`apps/worker` imports `pg-boss` and `pg`"; `pg` appears only in `worker-round-trip.test.ts`, which the same rule's `*.test.ts` exemption carves out | Narrowed to `boss.ts`'s `pg-boss`, with the test-only `pg` noted |
| F15 | Deleting the `tests/` clause from the unenforced list dropped two things still unenforced: `scripts/` → `tests/` (the rule's `from` is `apps/` and `packages/` only) and the `*.test.ts` exemption | Replaced rather than deleted |
| F16 | (3) granted an edge with no discipline and no successor condition, where (2) carries several | Obligations and the successor condition written into (3) |

## Standing note

F2, F5, F13 and F14 were all the same class: a sentence that claims more enforcement than the
config delivers. Three of the four were introduced by the draft itself. An amendment to this
document is worth reviewing against the code precisely because prose about a gate is cheaper to
write than the gate.
