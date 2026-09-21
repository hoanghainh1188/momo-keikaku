---
review: tech-currency
target: ARCHITECTURE-SPINE.md, uncommitted amendment to AD-21 and AD-23 (story 1.4 slice 2, the membership bridge's one writer)
date: 2026-09-21
reviewer: tech-currency lens (Claude, subagent)
verdict: PASS WITH CHANGES
---

# Tech-currency review: AD-21/AD-23 membership writer

## Verdict

**PASS WITH CHANGES.** Every PostgreSQL claim the amendment commits to is true on PostgreSQL 18.6, the version this repo pins. I checked each one against the PostgreSQL 18 documentation and ran it on a throwaway `postgres:18.6-alpine` container. None of the claims is wrong.

One claim goes further than the documentation. The spine says that one `ORDER BY … FOR UPDATE` statement locks rows in `user_id` order, so concurrent writers queue and do not deadlock. PostgreSQL 18.6 behaves this way: the plan puts the sort below the lock step. The documentation implies it but never states it as a guarantee. The spine should say this and name the test that holds it (finding 1).

The spine also relies on READ COMMITTED behaviour without saying so (finding 2). The other findings are wording only.

## Environment checked

| Item | Evidence |
|---|---|
| Postgres image | `infra/docker-compose.yml:3` and `.github/workflows/ci.yml:210`: `postgres:18.6-alpine`. `select version()` on the image: `PostgreSQL 18.6 on aarch64-unknown-linux-musl`. |
| Isolation level | `packages/db/src/with-tenant.ts` calls `db.transaction(async (tx) => …)` with no isolation config. `packages/db/src/client.ts` builds `new pg.Pool({ connectionString, max: 8 })` with no session options. Neither `packages`, `apps` (outside `.next` build output), `infra` nor `.github` sets `default_transaction_isolation` or `isolationLevel`. On the image, `show transaction_isolation` returns `read committed`. The writer therefore runs at **READ COMMITTED**, the server default. |
| Writer | `packages/db/src/repo-membership-write.ts`, `lockMembers`: `WHERE tenant_id = $t AND (role = 'tenant_admin' OR user_id IN (caller, target)) ORDER BY user_id FOR UPDATE`. There is no aggregate. `deleteMembership`, `setRole` and `setProjectIds` touch only `tenant_id = $t AND user_id = $u`, and only rows that `lockMembers` has already locked. |
| Grant | `packages/db/src/table-classes.ts:144`: `appPrivileges: ['SELECT', 'UPDATE', 'DELETE']` on `tenant_membership`. |
| Table shape | `packages/db/src/schema-membership.ts`: primary key `(user_id, tenant_id)`, no foreign keys. An UPDATE or DELETE therefore takes no `FOR KEY SHARE` lock on any parent row, so it adds no lock outside the ordered set. |

## Claims verified

| # | Claim in the amendment | Result | Evidence |
|---|---|---|---|
| C1 | Postgres refuses `FOR UPDATE` on an aggregate | **True** | Docs: the locking clauses "cannot be used with aggregation", and they cannot be combined with `GROUP BY`, `HAVING`, `WINDOW` or `DISTINCT` ([SELECT, The Locking Clause](https://www.postgresql.org/docs/18/sql-select.html#SQL-FOR-UPDATE-SHARE)). On 18.6: `ERROR: FOR UPDATE is not allowed with aggregate functions`, and with `GROUP BY`: `ERROR: FOR UPDATE is not allowed with GROUP BY clause`. |
| C2 | `SELECT … FOR UPDATE` needs the UPDATE privilege, and the recorded grant (SELECT, UPDATE, DELETE) is enough for the writer | **True** | Docs: "The use of FOR NO KEY UPDATE, FOR UPDATE, FOR SHARE or FOR KEY SHARE requires UPDATE privilege as well (for at least one column of each table so selected)" ([SELECT, Description](https://www.postgresql.org/docs/18/sql-select.html#id-1.9.3.172.7)). On 18.6, a role with only SELECT running the lock query gets `permission denied for table tenant_membership`. A role with SELECT, UPDATE and DELETE locks the 4 rows. The same role's `INSERT` is refused, which confirms the "no INSERT" rule. |
| C3 | Under READ COMMITTED, a waiting `FOR UPDATE` re-evaluates WHERE on the updated row version. Rows that stop matching drop out, and rows that newly match are not picked up | **True** (see finding 2: the spine relies on this but does not state it) | Docs: the updater "will only find target rows that were committed as of the command start time … The search condition of the command (the WHERE clause) is re-evaluated to see if the updated version of the row still matches … it is the updated version of the row that is locked and returned" ([Transaction Isolation, 13.2.1 Read Committed](https://www.postgresql.org/docs/18/transaction-iso.html#XACT-READ-COMMITTED)). Two-session test on 18.6: (a) session A demotes `u-q` and holds its transaction open; session B's lock query waits, then returns `u-p, u-y`, so the demoted admin has dropped out. (b) A locks the admin rows, promotes `u-x`, and commits; the waiting B returns `u-p, u-q, u-y` without `u-x`; a new statement afterwards returns all four. |
| C4 | One `ORDER BY user_id … FOR UPDATE` statement takes its locks in `user_id` order | **True in practice; not stated as a guarantee** (finding 1) | Docs: "ORDER BY is applied first. The command sorts the result, but might then block trying to obtain a lock on one or more of the rows" ([SELECT, Locking Clause, Caution](https://www.postgresql.org/docs/18/sql-select.html#SQL-FOR-UPDATE-SHARE)). `EXPLAIN` on 18.6 gives `LockRows → Sort (user_id) → scan`, both for a sequential scan and for a bitmap scan on the primary key. The Caution's out-of-order effect cannot happen here, because `user_id` is part of the primary key and no writer changes it. For locking in a consistent order as the defence against deadlock, see [Explicit Locking, 13.3.4 Deadlocks](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-DEADLOCKS). |
| C5 | No second lock statement | **True for the code as written** | The UPDATE and DELETE statements target only `(tenant_id, user_id)` rows that `lockMembers` returned, and the use case refuses a target that is not in the locked set (`packages/app/src/use-cases/membership-writes.ts:93`). There are no foreign keys, so no parent rows get locked. |

## Findings

### 1. [medium] The lock-order guarantee comes from the planner, not from the documentation, and the spine does not name the test that holds it

**Where:** AD-23, first rule bullet: "the writer takes all its row locks in **one** statement ordered by `user_id` … so concurrent membership writes queue instead of deadlocking."

**Issue:** The PostgreSQL 18 documentation says `ORDER BY` is applied before rows are locked, and it recommends taking locks in a consistent order to avoid deadlock. It does not promise that `LockRows` takes locks in the order the rows are emitted. That behaviour follows from how the executor is built: `LockRows` sits above `Sort`. I confirmed it on 18.6 for a sequential scan and for an index scan. The architecture depends on this in two places:

- the "queue, not deadlock" claim;
- the rule that forbids a second lock statement.

A planner change would break both without any error. So would a later edit that adds `LIMIT` or moves the `FOR UPDATE` into a subquery (`SELECT … FROM (SELECT … FOR UPDATE) ORDER BY` locks in scan order). A reviewer can catch neither.

**Proposed text fix (AD-23, after "…queue instead of deadlocking."):**

> That a single `ORDER BY … FOR UPDATE` locks its rows in sort order is how PostgreSQL executes it (`LockRows` above `Sort`; verified on 18.6). The documentation implies it but does not state it as a guarantee. A test pins it: two concurrent membership writes whose lock sets overlap, started in opposite natural orders, both complete without `40P01`. The locking clause stays at the top level of the statement, never inside a subquery and never under `LIMIT`.

If there is no such concurrency test yet, add it to deferred work for story 1.4 slice 2. It could also be an `EXPLAIN` assertion that `LockRows` is the top node above `Sort`.

### 2. [low] The spine depends on READ COMMITTED and on how it re-evaluates waiting locks, but does not say so

**Where:** AD-23, first rule bullet and the last-admin bullet.

**Issue:** The last-admin rule is safe because of READ COMMITTED's re-evaluation of waiting rows (C3):

- An admin who was demoted or revoked concurrently drops out of the locked set, so the count can never include a stale admin.
- An admin who was promoted concurrently is not picked up, so the count can only be too low. The result is a false "last admin" refusal, which is the safe direction and fixes itself on retry.

The use case already treats a missing caller row or a missing target row as `not_found` (`membership-writes.ts:92–93`), which covers the concurrent-delete case. None of this is written down. The whole analysis also depends on the isolation level. Today it is the server default: nothing in `with-tenant.ts` or `client.ts` sets it. If someone moves `withTenant` to REPEATABLE READ or SERIALIZABLE, the lock statement would fail with `40001` (could not serialize access due to concurrent update) where it now re-evaluates, and the membership use cases have no retry.

**Proposed text fix (AD-23, append to the first rule bullet):**

> The writer relies on READ COMMITTED, the server default that `withTenant` does not override. A lock that waits re-checks its row. An admin demoted or revoked meanwhile drops out of the answer, and one promoted meanwhile is not added. The admin count can therefore only be too low, never too high: at worst a revocation is refused and succeeds when retried. Raising `withTenant`'s isolation level is an architecture change, because the lock would then fail with a serialization error, and the membership use cases do not retry.

### 3. [low] The UPDATE grant does two jobs; the spine gives only one of them

**Where:** AD-21, the `appPrivileges` bullet ("`tenant_membership` holds SELECT, UPDATE and DELETE but no INSERT (story 1.4 slice 2: revocation, role and Project changes are writes …)").

**Issue:** The UPDATE privilege is justified here by role and Project changes. It is also what `FOR UPDATE` requires (C2), and revocation takes that lock too. If a later change trims UPDATE, for example because role changes move elsewhere, revocation breaks with `permission denied` even though revocation only uses DELETE.

**Proposed text fix:** after "revocation, role and Project changes are writes", insert: "; UPDATE is also what the writer's `SELECT … FOR UPDATE` needs, so revocation depends on it too".

### 4. [low] Wording: a missing separator in the AD-23 privilege sentence

**Where:** AD-23, third rule bullet: "The application role holds DML on the four Better Auth tables (a per-entry grant override in the registry) SELECT only on `tenant`, and SELECT, UPDATE and DELETE — no INSERT — on `tenant_membership` (AD-21)."

**Issue:** There is no separator after the parenthesis, so "(…) SELECT only on `tenant`" reads as one clause. Readers can misread which grant applies to which table, and grants are the claim this review checks.

**Proposed text fix:** "The application role holds DML on the four Better Auth tables (a per-entry grant override in the registry), SELECT only on `tenant`, and SELECT, UPDATE and DELETE — no INSERT — on `tenant_membership` (AD-21)."

## Not flagged, checked

- "Never `FOR UPDATE` on an aggregate (Postgres refuses it)" (the spine and the `repo-membership-write.ts` header): correct on 18.6, both for aggregates and for `GROUP BY`.
- `ROW SHARE` table lock: the locking clause also takes a `ROW SHARE` table-level lock. That does not conflict with the `ROW EXCLUSIVE` lock taken by the other writers' UPDATE and DELETE, or with the reader's `ACCESS SHARE`. No deadlock risk comes from it.
- `resolveRequestContext` reads `tenant_membership` without locking. A request that resolves while a revocation is in flight sees the pre-revocation row, and the next request ends the session. This matches the spine's "take effect on the next request" and is not a currency issue.
