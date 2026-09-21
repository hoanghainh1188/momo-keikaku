# Adversarial review — AD-1's composition root may import `packages/adapters` (2026-09-21)

**Target:** the amendment recording the founder's 2026-09-21 decision (story 1.3 slice 2) that
`apps/web/src/server/composition.ts` may also import `packages/adapters`, to wire the `Clock`
(AD-15) and a UUIDv7 id generator into use cases; made with the code that uses it
(`spec-1-3-organisation-hierarchy.md`) and gated by `apps-adapters-only-from-composition-root` and
`inner-packages-not-to-adapters`.
**Method:** one context-free reviewer read AD-1, AD-15, the structural seed, the prior AD-1 reviews
and the code on disk, and probed the rules with planted imports. Two rounds.

## Round 1 — findings and resolution

| # | Finding | Resolution |
|---|---|---|
| F1 | The worker could never reach the Clock AD-15 requires in both roles | AD-1: the worker gets its own named, reviewed composition root the day it first needs an adapter; tracked |
| F2 | `uuid`'s v7 reads `Date.now()` itself, bypassing the Clock | **Code fixed:** `uuidV7IdsOn(clock)` takes the millisecond from the Clock; tested |
| F3 | The id generator missing from the adapters lists and the IDs convention | Added to the paradigm bullet, diagram node, structural seed and IDs row |
| F4 | The structural seed's composition-root comment stale | Names `packages/adapters` |
| F5 | Diagram drew the adapters edge but not the `packages/db` one; prose explained neither | Both drawn and explained |
| F6 | Not-enforced list partly enforced now; re-exports/clock reads by the composition root unlisted | Qualified; the "not an import rule" bullet covers them |
| F7 | `deferred-work.md` not updated | Amendment entry resolved; two entries marked partly resolved naming the new rules |
| F8 | History sentence omitted the founder | Reworded |
| F9 | `db/seed` cannot receive the Clock | Tracked: `scripts/seed.ts` injects it with story 1.8 |

## Round 2

All nine resolved. Two leftovers, fixed: the diagram prose now names `packages/db/auth` (carve-out 1,
open to any `apps/web` file) beside the composition root; the spec's stale `uuidV7Ids` reference
renamed.
