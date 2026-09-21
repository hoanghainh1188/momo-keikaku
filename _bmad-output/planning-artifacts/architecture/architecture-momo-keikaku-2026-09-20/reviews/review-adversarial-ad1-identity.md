# Adversarial review — identity: `packages/db/auth` from the composition root only, the auth bindings, and the AD-15 Better Auth exception (2026-09-21)

**Target:** the spine amendment for story 1.4 slice 1 (`spec-1-4-identity-and-request-context.md`):
AD-1 carve-out 1 narrowed to the composition root, which builds the one Better Auth instance lazily
and exports auth bindings and the request-context resolution beside the use-case bindings; two new
dependency-cruiser rules; AD-15's named exception for Better Auth's own `Date`; AD-21's `auth_user`
and per-entry registry exceptions; AD-23's port for this slice. Made with the code that implements it.
**Method:** one context-free reviewer read the amended spine, the spec and the code on disk, and ran
read-only probes (`pnpm depcruise` JSON). Two rounds.

## Round 1 — findings and resolution

| # | Finding | Severity | Resolution |
|---|---|---|---|
| F1 | `better-auth-only-in-db-auth` could never fire: depcruise's `exclude` dropped every edge into `node_modules/**/dist/`, where better-auth ships its code; the sabotage had passed only through `not-to-unresolvable` | high | **Code fixed:** `exclude` narrowed to our own build output; the JSON now records the better-auth edges, and the rule was watched to fire on resolved edges (temporary `pathNot` narrowing) |
| F2 | AD-3's FORCE-RLS assertion was false for `tenant_membership`; the registry's `appPrivileges`/`tenantBridge` unrecorded | medium | AD-3 names the one exception; AD-21 states both per-entry fields |
| F3 | "Reached only through `IdentityPort`" false (bridge via `membershipsOf`, tables via auth bindings and the seed, barrel exports the auth tables) | medium | AD-21 row and AD-23 reworded; the barrel export is listed as review-held |
| F4 | Stack pins Next 16.3.5; code and spec are on 15.5 with `middleware.ts` | medium | Stack row, structural seed and AD-17 bullets record 15.5 until the upgrade story |
| F5 | `user` vs `auth_user` naming inconsistent | low | `auth_user` everywhere, with the reason once |
| F6 | Carve-out function list included `hashPassword` as an instance function; other importers unnamed | low | Split out; `scripts/seed.ts` and `tests/` named |
| F7 | db/auth's "imports neither app nor adapters" only half gated | low | Listed under the unenforced edges |
| F8 | AD-15 claimed identity ids come from "the Clock"; the session-time fence ungated | low | "id port, wired to `systemClock`"; both fences marked review-held |
| F9 | AD-12 said "once per request"; the code resolves once per render / per action, plus the middleware's fast path | low | AD-12 aligned |
| F10 | The cited review file did not exist | low | This file |
| F11 | The deferred sign-in rate limit absent from the spine's Deferred | low | Deferred bullet added |

## Round 2

F1–F9 and F11 confirmed resolved (F1 checked against the depcruise JSON). One new low finding:
`probe-tenants.ts` also touches the Better Auth tables — added, as test-only, beside the seed in AD-21
and AD-23. F10 closed by this file.
