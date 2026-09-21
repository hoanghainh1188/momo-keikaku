# Adversarial review — AD-1's `apps/web → domain/present` edge (2026-09-21)

**Target:** the amendment recording the founder's 2026-09-21 decision on the open
`apps/web → packages/domain` edge — allowed for `domain/present`'s entry module only — made together
with the code that makes it true (`spec-web-present-edge.md`: two read use cases, three Review
fields, pages importing `@momo/domain/present`, rule `web-to-domain-present-only`).
**Method:** one context-free reviewer read the whole AD-1 section, the previous AD-1 reviews and the
code on disk, and probed the rule with planted imports. Two rounds.

## Round 1 — findings and resolution

| # | Finding | Resolution |
|---|---|---|
| F1 | "A page computes nothing" was false: pages still do `bigint` arithmetic of their own | Now "a page imports nothing from the domain that computes"; the remaining page arithmetic listed as tolerated and tracked |
| F2 | "The behind-plan flag" overstated: the SV note still decides behind/ahead in the page | Now "the SPI behind-plan flag"; the SV = 0 wording recorded in deferred-work (pre-existing) |
| F3 | AD-12 put `clientProjection` in `domain/present`, which the gate now lets pages import | AD-12 and the FR table place it in `domain/client-view`; `present/index.ts` never re-exports computation, pinned by a test |
| F4 | "The Client View projection" arrives from a use case that computes it live | Described as the internal Client View preview; R1's Client View still reads the stored `outputs_client` |
| F5 | "…or a relative path" was wrong: a relative path to `present/index.ts` passes | "any other module, by any specifier" — confirmed by probe |
| F6 | "`apps/worker` has no such edge" enforced by nothing | Listed as not enforced, with a deferred-work entry |
| F7 | The formatter list left out the layout-geometry helpers and their float | Named explicitly |

## Round 2

Residuals, all fixed: the Plan page's `slipped` and milestone-overdue flags added to the tolerated
item and its deferred entry; the geometry float was attributed to AD-4, which sanctioned no float —
AD-4 now states the layout-only exception (never compared, stored, summed or shown) and notes the
Client View preview's projection carries one (tracked).
