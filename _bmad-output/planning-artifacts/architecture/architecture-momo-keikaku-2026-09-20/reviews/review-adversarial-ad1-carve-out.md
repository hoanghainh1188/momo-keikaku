# Adversarial review — AD-1's second carve-out (2026-09-21)

**Target:** the amendment to ARCHITECTURE-SPINE.md AD-1 recording `apps/web`'s composition root as
a carve-out beside `packages/db/auth`, decided in `spec-1-2-web-read-use-cases.md` and approved by
the founder at the walkthrough of PR #16.
**Method:** one context-free reviewer read the whole spine, the amendment diff, the spec and the
code on disk (`apps/web/src/server/composition.ts`, `apps/worker/src/`, `packages/app/src/`,
`tests/`).

## Findings and resolution

| # | Finding | Resolution |
|---|---|---|
| F1 | AD-1 still said the import graph is "exactly the one in the diagram", which has no `web → db` edge, so the rule contradicted its own carve-outs | Now "the diagram plus the two carve-outs below" |
| F2 | The first draft defined the carve-out as "each app's composition root — `composition.ts` today": a category, not a path, and wider than the approved "one named file in `apps/web`". `apps/worker/src/index.ts` already calls itself a composition root and could have claimed it | Narrowed to the one path; any other app must name its file in the spine first; `apps/worker` has none |
| F3 | "dependency-cruiser allows exactly those paths" read as present fact; no rule exists yet, and `actions.ts` imports `@momo/db` today | Stated as landing with the writes slice; `actions.ts` recorded as a tracked violation, not a third carve-out |
| F4 | "It never queries" left re-export laundering open — `composition.ts` exports `webDb()`/`WEB_TENANT_ID` today | Exports restricted to use-case bindings; the two current exports named as temporary, ending with the writes slice; AD-27's schedule/plan-input edges excluded explicitly |
| F5 | The rule was keyed on the `@momo/db` specifier; `tests/` imports `packages/db` by relative path and its status under AD-1 was unstated | "`packages/db` by any specifier"; `tests/` stated to sit outside the AD-1 graph |
| F6 | "hands the repository to the ports" overstated the code: two functions, one port | Reworded |
| F7 | "builds the restricted-role handle" rests on `config.APP_DATABASE_URL` naming the restricted role | Checked; no change |
| F8 | History, frontmatter and structural seed did not record the amendment | Intro sentence, `reviews_applied` entry, and `composition.ts` and `tests/` added to the seed |

**Pre-existing, not introduced here:** AD-1 says `apps/worker` calls only use cases, yet it imports
`pg-boss` directly. Already recorded in `deferred-work.md` (the gate is deliberately scoped to
AC-6's wording).

## Round 2

The same reviewer re-read the revised spine. Four residuals, all fixed:

- F1 was half-fixed — AD-1's second sentence still said "never repositories or Drizzle directly"
  with no exception. It now ends "except through the carve-outs below", and the diagram caption
  says the arrows show allowed imports plus the two carve-outs.
- The spine said both temporary violations were tracked in `deferred-work.md`; only `actions.ts`
  was. The `composition.ts` exports (`webDb()`, `WEB_TENANT_ID`) are now recorded beside it.
- `deferred-work.md` still described the first draft's category wording as the approved one.
  Reworded to the one named file.
- The `tests/` exemption ran one way only. AD-1 now also says nothing outside `tests/` imports
  from it, which closes the laundering route F4 closed for `composition.ts`.
