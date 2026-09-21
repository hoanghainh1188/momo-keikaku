# Adversarial review — AD-1 after the dependency-cruiser gate went on (2026-09-21)

**Target:** the amendment replacing AD-1's "Until story 1.2's writes slice lands …" bullet, which
became stale when story 1.2 slice 4 (PR #18) moved `actions.ts`'s writes onto use cases and switched
`dependency-cruiser` on. The first draft stated what the gate enforces and what it does not.
**Method:** one context-free reviewer read the whole AD-1 section, the prior carve-out review and
the code on disk (`.dependency-cruiser.cjs`, `tsconfig.depcruise.json`, `package.json`, `ci.yml`,
`apps/`, `packages/`, `tests/`, `deferred-work.md`), and probed the rules with temporary imports.
Two rounds.

## Round 1 — findings and resolution

| # | Finding | Resolution |
|---|---|---|
| F1 | Eight `apps/web` files import `packages/domain` directly — an edge the diagram does not draw, which the gate allows and nothing recorded | Listed as a live violation and an **open decision for the founder** (forbid the edge, or add a presentation-scoped arrow); deferred-work entry added |
| F2 | "Added when the code is gone, never before" was wrong for the package directions and raw `pg`, which have nothing to flag today | Split into live violations (added when the code is gone) and scope-choice gaps (added with the next config change) |
| F3 | "the raw `pg` driver in `apps/web`" read as an existing import | Reworded: nothing stops `apps/web` importing it |
| F4 | "Enforces" / "fails CI" implied blocking; CI only reports (no branch protection), and the CI-gates line still said "block merge" | Both lines now say the gates report rather than block until branch protection is available |
| F5 | The rule granted more than the carve-outs: `packages/db/auth` was exempt for every app, and the composition root was exempt from Drizzle as well as `packages/db` | **`.dependency-cruiser.cjs` narrowed** to three rules — `apps-not-to-drizzle` (no exemption), `apps-not-to-db` (`apps/web` only, `db/auth` exempt), `other-apps-not-to-db` (no exemption) — each watched to fail with a temporary import |
| F6 | The scheduling rule covers `plan-input` and lets the two repositories import each other; AD-1's edge named `schedule` only; the rules match no file today | AD-1's edge now names both repositories (matching AD-27); the bullet says the rules are forward-looking, proved with temporary files, and states the mutual-import exception |
| F7 | Cruise scope unstated: `tests/` and `scripts/` are never cruised; "nothing outside `tests/` imports from it" is unenforced | Scope stated; `scripts/` placed outside the graph; the `tests/` rule tracked in deferred-work |
| F8 | "Exports use-case bindings only" / "never queries" is not an import rule; a re-export from `composition.ts` passes the gate | Listed as not an import rule, held by `tests/web-composition.test.ts` (wiring) and review |
| F9 | Other diagram edges missing from the not-enforced list | "Every other edge of the diagram" added |
| F10 | Stale bookkeeping: the stale-bullet entry unresolved, the resolver entry still naming `apps/web/tsconfig.json`, `packages/db/auth` calling itself "the one carve-out" | All three corrected |

## Round 2

The same reviewer re-read the revision and re-probed the narrowed rules (a `@momo/db` import in
`apps/worker`, `drizzle-orm` in a new `apps/web` file and in `composition.ts` — all failed as
intended). Residuals, all fixed:

- The list of `packages/domain` names omitted `hoursSigned`, `DEFAULT_VISIBILITY` and `Metric`.
- "Neither module exists" covered three paths — now "none of the three paths exists".
- "Each is tracked in `deferred-work.md`" was untrue for "every other edge of the diagram" — a
  catch-all entry was added.
- The domain entry said the rule lands "the same day" whichever option is chosen; forbidding the edge
  first would be red on day one. Both documents now say the rule lands with the chosen fix.

**Open, for the founder:** the `apps/web → packages/domain` edge (F1).
