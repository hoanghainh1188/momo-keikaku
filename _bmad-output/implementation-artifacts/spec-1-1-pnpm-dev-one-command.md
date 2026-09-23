---
title: 'Story 1.1 slice B3 — `pnpm dev` brings the whole system up in one command'
type: 'feature'
created: '2026-09-23'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'd251e6474fdd28668976bc24d4d42f907107e46f'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 1.1's first criterion wants `pnpm dev` on a clean clone to start Postgres, migrate, apply the RLS/grants/trigger SQL, seed a demo Tenant, and run `web` **and** `worker` together, with no credentials or hand steps. Today `pnpm dev` starts only the web app. `pnpm demo` does the preparation but never starts the worker, and it refuses to run until five keys have been exported by hand.

**Approach:** Turn `scripts/demo.ts` into the one orchestrator behind `pnpm dev`. It keeps the preparation sequence and then supervises `web` and `worker` as two child processes: their output is prefixed, one Ctrl-C stops both, and if either child dies the other is stopped too. `pnpm demo` stays as an alias.

**Decisions (founder, 2026-09-23):**
- **Q1 → A, a generated local file.** On the first run with no root `.env.local`, `pnpm dev` writes a gitignored root `.env.local` containing: the two compose URLs (`postgres://momo:momo@localhost:55433/momo_keikaku` and `postgres://momo_app:momo_app@localhost:55433/momo_keikaku`), a random 48-character `BETTER_AUTH_SECRET` from `node:crypto`, a random `SEED_DEMO_PASSWORD`, and `BETTER_AUTH_URL=http://localhost:<port>`. Later runs read that file. A key already set in the shell wins over the file. Every run prints the sign-in line: the two demo emails and the password. The file is never overwritten; to regenerate it, delete it.
- **Q2 → A, seed only an empty database.** `pnpm dev` seeds only when the owning role finds no `tenant` row. Otherwise it prints that the seed was skipped and names `pnpm seed` as the way to reset. `pnpm seed` keeps its current behaviour (TRUNCATE and reseed).

## Boundaries & Constraints

**Always:**
- Preparation order stays as it is: compose `up --wait` → `db:migrate` → `pgboss:migrate` → `db:policies` → seed → both children. Each step fails the run and names the failed step.
- `packages/app/src/config.ts` remains the only reader of configuration inside the process. The orchestrator lives in `scripts/`, outside the fence, and passes keys to its children only through their environment.
- `packages/app/src/config.ts` keeps "required, never defaulted" for `BETTER_AUTH_SECRET`. Any local value is supplied by the orchestrator, never by the schema.
- The web-port check stays in place, and so does the missing-key check before compose starts.
- No new runtime dependency. The supervisor is written on `node:child_process`; `concurrently` is not added.
- All existing gates stay green.

**Never:**
- No change to the compose file. The `/var/lib/postgresql` mount is already correct, so this slice only proves it.
- No job handlers in the worker (Epic 5). No production or ECS wiring (Epic 8).
- Migrations are not moved to the `migrator` role. That is a separate deferred entry.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error handling |
|---|---|---|---|
| Happy path | Clean clone, no containers | Postgres healthy; migrate, policies and seed applied; the web page answers; the worker logs `started with migration disabled` | — |
| Restart | `docker compose down`, then `pnpm dev` | Migrations report nothing to apply; the volume still holds the data | — |
| Child dies | Worker exits non-zero | Web is stopped too; `pnpm dev` exits non-zero naming `worker` | Prefixed stderr |
| Ctrl-C | SIGINT during run | Both children receive SIGINT; the process exits after both have exited | A second SIGINT kills both |
| Busy port | 3101 in use | Refused before compose starts | Existing message |

</frozen-after-approval>

## Code Map

- `scripts/demo.ts` -- today's orchestrator (key check, port check, `run()` steps, web spawn). Rename it to `scripts/dev.ts` and reuse its steps verbatim.
- `package.json` -- `dev` currently runs `pnpm --filter @momo/web dev`. `demo` and `seed` are here too; `seed` uses `--env-file=apps/web/.env.development`.
- `apps/worker/package.json` `start:dev` -- `tsx --env-file=.env.development src/index.ts`. Spawn the worker through this script. It already handles SIGINT/SIGTERM gracefully (`apps/worker/src/index.ts` `shutdown`).
- `apps/web/.env.development`, `apps/worker/.env.development` -- committed, non-secret profile (DEPLOYMENT=local, fixture clock). Leave them unchanged.
- `infra/docker-compose.yml` -- PG 18.6, mounted at `/var/lib/postgresql`, port 55433. Do not touch.
- `scripts/db-migrate.ts` refuses a database that was built with `push` (the guard stays). `scripts/pgboss-migrate.ts` and `scripts/db-policies.ts` are already idempotent.
- `README-DEMO.md` "Run it" -- the export block and `pnpm demo`. Update both.
- `vitest.config.ts` -- `scripts/**` is already collected.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/dev/supervise.ts` -- a pure supervisor: `supervise(children, {onExit})` spawns each child with a prefixed line stream, forwards SIGINT/SIGTERM, stops its siblings when one child exits, and escalates to SIGKILL on a second signal -- this is the testable core
- [x] `scripts/dev/supervise.test.ts` -- drives the I/O matrix rows "child dies" and "Ctrl-C" using real `node -e` children
- [x] `scripts/dev/env.ts` (+ test) -- resolves the keys by Q1-A as a pure function: `(processEnv, existingFileText | null, randomBytes) → {env, fileToWrite | null}`. Test: shell wins over file; a missing file generates one; an existing file is never rewritten; the secret is at least 32 characters
- [x] `scripts/dev.ts` -- replaces `scripts/demo.ts` (moved with `git mv`); the prep steps, then `supervise([web, worker])`; applies Q2-A's rule (`select 1 from tenant limit 1` as the owner, via `pg`)
- [x] `package.json` -- `dev` and `demo` both run `tsx scripts/dev.ts`; add `dev:web` for the old web-only command
- [x] `README-DEMO.md` -- one command; say where the keys come from; the reset path (`pnpm seed` / `docker compose down -v`)

**Acceptance Criteria:**
- Given a clean clone and no containers, when `pnpm dev` runs, then it reaches a state where `GET /sign-in` answers 200 and the worker has logged its start line, with no key exported by hand, and `.env.local` has been created and is ignored by git.
- Given a database that already holds data created through the UI, when `pnpm dev` runs again, then the seed is skipped and the data is still there.
- Given a running `pnpm dev`, when it is stopped, `docker compose -f infra/docker-compose.yml down` runs, and `pnpm dev` runs again, then `db:migrate` applies nothing and the demo Tenant is still present.
- Given the repository, when `pnpm lint`, the three typechecks, `pnpm depcruise` and `pnpm test` run, then all pass.

## Implementation Notes

- Children are spawned `detached` and every signal goes to the child's whole process group (`pnpm → tsx → node`), so the terminal never reaches them directly and a Ctrl-C arrives once, through the supervisor.
- One Ctrl-C reaches `scripts/dev.ts` more than once (the terminal's group signal plus the relays by `pnpm` and `tsx`). Measured on the first manual run: the repeat was treated as the "second SIGINT" and SIGKILLed web. The supervisor now treats a repeat within 1 s of the first as the same signal (`repeatGraceMs`); a later one still escalates. Covered by a test.
- A stopped child that outlives 10 s is SIGKILLed (`killAfterMs`). A child that exits on its own fails the run even with code 0.
- `BETTER_AUTH_URL` is written once with the first run's port. A later run on another `PORT` prints a warning naming the mismatch rather than rewriting the file.
- Manual verification ran against a scratch database (`momo_b3_verify`, shell overrides for the two URLs, `PORT=3111`) because a live `pnpm demo` was holding port 3101 and the shared compose volume; `down -v` on that volume was not run.
- Matrix audit follow-up: "Busy port" is covered by `scripts/dev/port.test.ts` (ephemeral listener → true, closed → false). Q2-A's seed-skip rule is covered by `scripts/dev/tenant.test.ts` (empty `tenant` → false, one row → true, unreachable URL → rejects; `databaseHoldsATenant` throws and `dev.ts` names the failed step). "Restart" is covered by a new case in `scripts/db-migrate.test.ts`: the real script run twice leaves the same journal rows and tables (the existing file tested only the push guard). Both DB tests follow the REQUIRE_DB/skip convention and work in throwaway databases (`scripts/throwaway-database.ts`, `CREATE DATABASE … / DROP … WITH (FORCE)`), never the shared `momo_keikaku` data.
- Review follow-up: the supervisor settles on `'close'` (stdio drained), not `'exit'`, so a crashing child's last lines print before `process.exit`; it forwards SIGHUP and SIGKILLs any still-running child group from a `process.on('exit')` fallback. The step list and the child specs moved to `scripts/dev/plan.ts` (`preparationSteps({ holdsTenant })`, `childSpecs`) and are tested for the seed-skip and for handing on the resolved env. `seed`, `db:migrate`, `db:policies` and `pgboss:migrate` load `--env-file-if-exists=.env.local`. A freshly generated `.env.local` with the seed skipped prints a warning to run `pnpm seed`. `projectNotFound` now points to `pnpm seed`.

## Spec Change Log

## Review Triage Log

Review pass 1 (2026-09-23). Blind Hunter (BH), Edge Case Hunter (EC) and Verification Gap (VG) were all run.

| # | Source | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | BH, EC | `supervise` settles on `'exit'`, before stdio drains, so a crashing child's last lines are lost | medium | Node emits `'exit'` before the stdio streams close. `onExit` calls `process.exit` straight away, and the prefix test itself has to wait for output after `done` | patch |
| 2 | BH, EC, VG | Detached children are orphaned on SIGHUP (terminal closed) or when the supervisor dies, and they keep holding 3101 | medium | `detached: true` gives each child its own session. `FORWARDED` is only SIGINT/SIGTERM, and there is no `exit` fallback | patch |
| 3 | BH, VG | `pnpm seed` (the README's reset path) and the standalone db scripts cannot see the generated root `.env.local` | medium | The `seed` script loads only `apps/web/.env.development`, which carries no URLs or password. `config.ts` has no defaults | patch |
| 4 | VG, BH | The seed-skip decision and the env hand-off inside `dev.ts` are untested. Inverting the skip would TRUNCATE user data with every gate still green | medium | Pre-verified gap. The probe and env are tested only as isolated functions | patch |
| 5 | EC | A regenerated `.env.local` against a seeded volume prints a password that does not sign in, and the file header tells users to delete the file to regenerate it | medium | The seed is skipped when a Tenant exists, but the printed password is the new file's | patch |
| 6 | EC | `project-not-found` tells users to "run `pnpm demo` to seed", which no longer reseeds a database that already holds a Tenant | low | `packages/db/src/project-not-found.ts:11`, plus 3 tests that mirror it. A direct correction | patch |
| 7 | EC | `ROOT` built from `URL.pathname` is percent-encoded, so it breaks in a path containing spaces | low | Carried over from `demo.ts`. The fix is a direct correction (`fileURLToPath`) | patch |
| 8 | BH, EC | A malformed `PORT` (abc / 0 / 99999) crashes with a raw stack trace | low | Real, but unlikely, and the fix adds a guard | reject |
| 9 | BH, EC | The port probe is IPv4-only, and a timeout reads as "free" | low | Carried over unchanged from `demo.ts`, and unlikely. The fix adds a second probe | reject |
| 10 | BH | A `BETTER_AUTH_URL` that disagrees with the port only warns | low | The designed behaviour, documented in the README's port note. An override would add branches | reject |
| 11 | BH, EC | The `wx` write throws on EEXIST, EISDIR or permission errors | low | Needs two concurrent first runs. It fails loudly, which is correct | reject |
| 12 | BH | The generated file reintroduces a silent localhost fallback | false | This is decision Q1-A's explicit content (the compose URLs in the file). Changing it would edit the frozen intent | reject |
| 13 | BH | The password is printed in the clear on every run | false | Required by Q1-A ("every run prints … the password") | reject |
| 14 | BH | The README's "46 vitest cases" is stale | low | Stale before this change. Cosmetic | reject |
| 15 | BH, EC | `supervise([])` hangs, and duplicate names overwrite a child | false | The only caller passes two distinct fixed names. Not reachable | reject |
| 16 | BH | The restart test does not prove `pgboss:migrate`/`db:policies` idempotent | low | The implementer's second manual run re-applied both without error. Both are idempotent by design (`ensureRole`, generated SQL) | reject |
| 17 | EC | `'error'` on a live child (a failed kill) marks it exited | low | Rare in practice. The fix adds a branch | reject |
| 18 | EC | The tenant probe has no connect or statement timeout, so it hangs on a lock | low | Needs a concurrent TRUNCATE. The fix adds options | reject |
| 19 | EC | `spawnSync` in `db-migrate.test.ts` has no timeout | low | Hangs only if the child hangs. Test-only | reject |
| 20 | EC | `parseEnvFile` keeps inline `# comments` and escapes | low | The generated file has neither | reject |
| 21 | EC | Two SIGINTs within 1 s do not escalate, which deviates from "second signal kills" | low | Deliberate: one Ctrl-C arrives 2–3 times (measured, Implementation Notes). The fix would edit the spec | reject |

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm --filter @momo/web typecheck && pnpm --filter @momo/worker typecheck && pnpm depcruise` -- expected: exit 0
- `REQUIRE_DB=1 pnpm test` -- expected: all pass, including the new `scripts/dev/*.test.ts`

**Manual checks:**
- Run `docker compose -f infra/docker-compose.yml down -v`, then `pnpm dev`: check the `[web]` and `[worker]` prefixed lines and that `curl -s -o /dev/null -w '%{http_code}' localhost:3101/sign-in` returns 200. Ctrl-C, run `compose down` (without `-v`), run `pnpm dev` again, and confirm the Tenant row is still there and `db:migrate` reports nothing pending.
