---
title: "Tech-Currency Review: the scheduling slice (AD-25 … AD-30)"
created: 2026-09-20
reviewer: tech-currency & reality-check reviewer
scope: >-
  The new and amended scheduling material only — AD-25 through AD-30 and the
  sentences the scheduler added to AD-5, AD-10, AD-20, AD-21 and the CI gate
  list. Every PostgreSQL mechanic those ADs lean on was checked against the
  PostgreSQL 18 documentation source and executed against a live server;
  Drizzle claims were checked against the published 0.45.2 and drizzle-kit
  0.31.10 tarballs. The Stack table versions were verified this morning in
  reviews/review-tech-currency.md and are deliberately not re-checked here.
verdict: PASS WITH FIXES (one CRITICAL, three HIGH)
---

# Tech-Currency Review: the scheduling slice (AD-25 … AD-30)

## Verdict

**PASS WITH FIXES.** The core construction of AD-25 is real: PostgreSQL accepts
the whole thing — the four-column `UNIQUE (tenant_id, project_id, id, is_leaf)`,
two composite foreign keys into it from `wp_dependency`, the
`pred_is_leaf boolean NOT NULL DEFAULT true CHECK (pred_is_leaf)` trick and the
table-level leaf-only-inputs CHECK. I created all of it and exercised it. Drizzle
0.45.2 can express the composite FK and the table CHECK, and drizzle-kit 0.31.10
emits CHECK constraints. AD-27's choice of `pg_advisory_xact_lock` over a
session-level lock is the right one and the database side of a synchronous run is
genuinely cheap (1.4–2.0 ms to append a run, 4.6 ms to write 500 `wp_schedule`
rows).

What was asserted rather than checked is everything *around* those facts. Four
things do not hold as written:

1. AD-26's "about 25 KB per run" is wrong by roughly a factor of six. Measured.
2. AD-25's leaf→summary transition does **not** survive a multi-row restructure
   in one transaction, because the foreign keys are not declared deferrable and
   the spine never says they should be.
3. AD-25's "Giving a leaf WP a child therefore fails at the database" is false.
   Nothing ties `is_leaf` to parentage, and PostgreSQL 18 cannot be made to
   derive it.
4. The deferrable declaration that fixes (2) cannot be written in Drizzle 0.45.2
   at all.

None of these require an AD to be rewritten from scratch. (1) needs a new number
and a note about identifier encoding; (2) and (4) need one clause in the DDL and
a sentence saying the migration hand-writes it; (3) needs the claim softened or a
maintained counter column added.

## How this was checked

`postgresql.org` is blocked by this environment's egress proxy, so documentation
quotes come from the **PostgreSQL 18 documentation source** on
`raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/doc/src/sgml/…`, which
is the same text the website renders. Behavioural claims were executed against a
live server. No PostgreSQL 18 binary or Docker daemon was reachable here, so
execution ran on **PostgreSQL 16.13**; foreign-key, CHECK, deferrability,
generated-column, TOAST and jsonb semantics are unchanged between 16 and 18, and
each result below is cross-checked against the PG18 documentation source. The one
PG18-specific difference that matters (generated columns now defaulting to
VIRTUAL) is taken from the PG18 docs directly and is called out in H2.

Drizzle claims were checked against the actual published artifacts
(`npm pack drizzle-orm@0.45.2`, `npm pack drizzle-kit@0.31.10`), not the docs
site.

---

## Findings

### C1 (CRITICAL) — AD-26's `schedule_run` size is wrong by ~6×, and it is load-bearing

**Claim (AD-26):** "about 25 KB per run for a 500-WP Project after TOAST
compression, so an editing day costs a few hundred KB per Project.
[ASSUMPTION: measured in the first scheduler story…]"

**Measured.** I built a `schedule_run` carrying exactly the fields AD-26
enumerates — per leaf WP `wp_id`, `wbs_code`, `parent_id`, `duration_days`,
`constraint_type`, `constraint_date`, `is_milestone`, `actual_start`,
`actual_finish`, `recorded_pct`; per Project the 500 dependency edges with lags
and `seq`, the three Project settings and `holiday_calendar_version_seq`; and an
`outputs` with the per-WP result, driving predecessors, violations with driving
chains, out-of-sequence rows, the critical path and the computed finish — for 500
leaf WPs and 500 edges:

| | raw JSON text | stored after TOAST |
| --- | --- | --- |
| `inputs` | 233 kB | 89,719 B (pglz) |
| `outputs` | 152 kB | 54,663 B (pglz) |
| **per run** | **385 kB** | **~141 kB** |

That is **5.6× the stated figure**, and the WAL cost is 152 kB per appended run.

The number does not depend on my guesses about field widths. I ran a **floor**
test containing nothing but the identifiers AD-26 requires — 500 `wp_id`, 500
`parent_id`, 500 edges × 2 endpoint UUIDs, 500 output `wp_id` — and nothing else:

- raw: 101,049 bytes
- stored: **104,080 bytes**, and `pg_column_compression()` returned **NULL** —
  pglz declined to compress it at all and PostgreSQL stored it uncompressed
  out-of-line.

So the identifiers alone are **four times the whole 25 KB budget**, before a
single date, duration or float value. UUID text is high-entropy; there is no
compression setting that rescues it (see M5).

**Why the `[ASSUMPTION]` tag does not cover this.** Two committed sentences were
sized off the wrong number. AD-26's "an editing day costs a few hundred KB per
Project" is off by the same factor: AD-27 writes one run per triggering edit, so
a PM making 200 edits in a day produces **~28 MB per Project per day** and ~30 MB
of WAL, not "a few hundred KB". And AD-5's retention rule ("no reference, and not
among the Project's last two") was chosen against that budget. The assumption is
**not safe**; it is the input to a retention decision that is already written
down as settled.

**Fix:**
1. Replace the figure with the measured one: ~385 kB raw / ~141 kB stored per run
   at 500 leaf WPs, ~150 kB WAL per append.
2. The lever is not compression, it is identifier encoding. Assign each WP a
   per-run small-integer index in `inputs` and use that index in `edges`,
   `outputs`, the driving chains and the critical path, with one `wp_id` ↔ index
   table at the head of `inputs`. That removes roughly 2,000 of the 2,500 UUIDs
   and should take a run well under 40 kB stored. It costs nothing in
   re-derivability — the mapping is inside the pinned run.
3. Re-check AD-5's "last two runs" window against the corrected number before it
   is treated as settled.

*Sources:* measured on PostgreSQL 16.13 (`pg_column_size`,
`pg_column_compression`, `pg_total_relation_size`, `pg_current_wal_lsn`);
TOAST behaviour per
https://raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/doc/src/sgml/storage.sgml

---

### H1 (HIGH) — the leaf→summary transition does not work in one transaction, because the FKs are not deferrable

**Claim (AD-25):** "Turning a leaf that has edges into a summary then fails the
foreign key by itself — no trigger, and no invariant that only runs when someone
remembers to call it."

**Verified true, and that part works.** Flipping `is_leaf` on a WP that is a
predecessor raises:

```
ERROR:  update or delete on table "work_package" violates foreign key constraint "fk_pred" on table "wp_dependency"
DETAIL:  Key (tenant_id, project_id, id, is_leaf)=(…, t) is still referenced from table "wp_dependency".
```

**But the legitimate transition is order-dependent, and the spine does not say
so.** With the default `NOT DEFERRABLE` FK, the check fires at the end of each
*statement*, not at commit. I ran the same one-transaction restructure twice:

- **Edges repointed to the new child first, then `is_leaf` flipped** → commits.
- **`is_leaf` flipped first, then edges repointed** → fails mid-transaction with
  the error above, and the transaction aborts. This is the natural order for any
  diff applier, importer or re-parent use case that writes `work_package` rows
  before `wp_dependency` rows.

Declaring the FK `DEFERRABLE INITIALLY DEFERRED` makes both orders commit; I
verified this too. Three related facts the AD should carry, all confirmed:

- The FK may be deferrable **even though the referenced UNIQUE is not** — I added
  `fk_succ … DEFERRABLE INITIALLY DEFERRED` against the plain
  `UNIQUE (tenant_id, project_id, id, is_leaf)` and it was accepted.
- The referenced UNIQUE must **not** be deferrable. Making it so gives
  `ERROR: cannot use a deferrable unique constraint for referenced table`,
  matching the docs: *"the refcolumn list must refer to the columns of a
  non-deferrable unique or primary key constraint or be the columns of a
  non-partial unique index."*
- **CHECK constraints cannot be deferred at all** —
  `ERROR: CHECK constraints cannot be marked DEFERRABLE`, matching *"Currently,
  only UNIQUE, PRIMARY KEY, EXCLUDE, and REFERENCES (foreign key) constraints
  accept this clause. NOT NULL and CHECK constraints are not deferrable."*
  So AD-25's `leaf_only_inputs` CHECK and `CHECK (pred_is_leaf)` are always
  immediate: the scheduling inputs must be nulled **in the same UPDATE statement**
  that flips `is_leaf`. That asymmetry (FK deferrable, CHECK never) is exactly
  the kind of thing a builder discovers at 2 a.m.

**Interaction with AD-27 worth stating.** With deferred FKs the violation
surfaces at `COMMIT`, i.e. *after* `recalculate` has run inside the same
transaction. AD-27 promises "a rejected cycle, an ancestor/descendant link or a
summary endpoint rolls the edit back with its reason". That reason must come from
`domain/schedule/validate`, which AD-25 already puts on every structural edit —
the FK is the backstop, and the backstop's message is a raw 23503 with UUIDs in
it. Say so, so nobody wires the Postgres error text to the UI.

**Fix:** declare both composite FKs `DEFERRABLE INITIALLY DEFERRED` in AD-25 and
in AD-30's migration; add the sentence that the CHECK constraints are *not*
deferrable and so the input columns clear in the same statement as the flip.

*Sources:*
https://raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/doc/src/sgml/ref/create_table.sgml ;
executed on PostgreSQL 16.13.

---

### H2 (HIGH) — "Giving a leaf WP a child therefore fails at the database" is false, and PostgreSQL 18 cannot make it true

**Claim (AD-25):** the leaf-only-inputs CHECK means "Giving a leaf WP a child
therefore fails at the database unless the same edit resolves where its inputs
go", and the leaf-only endpoint enforcement is "structural rather than a
convention".

**Verified false.** I inserted a child row under a leaf WP that carried
`duration_days = 2`. The insert succeeded. The parent's `is_leaf` stayed `true`,
its `duration_days` stayed `2`, and no constraint fired. Listing every constraint
on the table confirms why — there is nothing there that mentions parentage:

```
leaf_only_inputs   c  CHECK (is_leaf OR (duration_days IS NULL AND …))
work_package_pkey  p  PRIMARY KEY (tenant_id, project_id, id)
wp_leaf_key        u  UNIQUE (tenant_id, project_id, id, is_leaf)
```

The CHECK only fires on the row being written, and the row being written is the
child. The whole declarative edifice — the CHECK, the four-column unique key,
both composite FKs — is downstream of `is_leaf` being *correct*, and `is_leaf` is
a plain application-written boolean (`packages/db/src/schema.ts:93`:
`isLeaf: boolean('is_leaf').notNull()`). If the app forgets to flip it, every
constraint in AD-25 is satisfied and the plan is wrong. That is precisely the
"invariant that only runs when someone remembers to call it" the AD says it has
removed.

**And it cannot be derived declaratively.** PG18: *"The generation expression can
only use immutable functions and cannot use subqueries or reference anything
other than the current row in any way."* I confirmed:
`ERROR: cannot use subquery in column generation expression`.

**Fix — one of:**
- **Make it structural for real.** Add `child_count integer NOT NULL DEFAULT 0`
  maintained by an AFTER INSERT/UPDATE/DELETE trigger on `work_package.parent_id`,
  and define `is_leaf boolean GENERATED ALWAYS AS (child_count = 0) STORED`. I
  verified that a STORED generated column *can* be part of a UNIQUE constraint and
  *can* be a composite FK target, so the rest of AD-25 keeps working unchanged.
  **PG18 gotcha:** generated columns are *"by default of the virtual kind"* as of
  18, and a virtual column cannot back an index — `STORED` must be written
  explicitly or the migration silently produces something unindexable.
- **Or soften the claim** to what is true: the FK catches a *stale* `is_leaf`
  against existing edges; the application is still what sets `is_leaf`, and a test
  asserts `is_leaf = (child_count = 0)` for every row.

*Sources:*
https://raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/doc/src/sgml/ddl.sgml
(Generated Columns) ; executed on PostgreSQL 16.13.

---

### H3 (HIGH) — Drizzle 0.45.2 cannot express a deferrable foreign key; the H1 fix must be hand-written SQL

Checked against the published `drizzle-orm@0.45.2` tarball rather than the docs
site.

| AD-25 needs | drizzle-orm 0.45.2 | verdict |
| --- | --- | --- |
| composite FK into a 4-column unique key | `foreignKey({name?, columns, foreignColumns})`, `TColumns` is a non-empty tuple; emits plain `REFERENCES tbl(cols)` and PostgreSQL resolves it against any non-deferrable unique constraint | **yes** |
| table-level CHECK | `check(name, sql)` exported from `drizzle-orm/pg-core/checks`; drizzle-kit 0.31.10 carries `checkConstraints` / `checkConstraintRow` and emits `CONSTRAINT … CHECK (…)` | **yes** |
| `pred_is_leaf boolean NOT NULL DEFAULT true` used inside an FK | an ordinary `boolean().notNull().default(true)` column; nothing special needed | **yes** |
| `DEFERRABLE INITIALLY DEFERRED` on the FK | **not available.** `ForeignKeyBuilder` exposes exactly two methods: `onUpdate(action)` and `onDelete(action)`, with `UpdateDeleteAction = 'cascade' \| 'restrict' \| 'no action' \| 'set null' \| 'set default'`. No deferrability anywhere in the builder or in `ForeignKey`. | **no** |

**A trap worth naming in the AD.** Grepping the 0.45.2 package for "deferrable"
*does* hit — `pg-core/session.d.ts:34: deferrable?: boolean`. That is the
transaction-level `SET TRANSACTION … [NOT] DEFERRABLE` option for serializable
read-only transactions. It has nothing to do with constraint deferral, and it
will mislead whoever goes looking.

**Consequence for AD-30.** The migration is generated by drizzle-kit from the
schema, so the deferrable clause has to be appended by hand in the migration SQL —
and it is invisible to the schema file afterwards, which means a later
`drizzle-kit generate`/`push` diff will not see it and may propose dropping and
recreating the FK without it. AD-30 should say: the two composite FKs are
hand-written in the migration with `DEFERRABLE INITIALLY DEFERRED`, and a CI
assertion over `pg_constraint.condeferrable` for those two constraint names keeps
a later round-trip from quietly removing it. That assertion belongs in AD-19's
CI gate list next to the FORCE-RLS assertion, which exists for the same reason.

*Sources:* `npm pack drizzle-orm@0.45.2` →
`package/pg-core/foreign-keys.d.ts`, `package/pg-core/checks.d.ts`,
`package/pg-core/session.d.ts` ; `npm pack drizzle-kit@0.31.10` →
`package/bin.cjs` ; https://registry.npmjs.org/drizzle-orm/0.45.2 (confirms the
`./pg-core/checks` export is present in this exact version).

---

### M1 (MEDIUM) — no `ON DELETE` is specified, and AD-27 lists "a WP deleted" as a trigger

AD-25 gives the composite FKs no `ON DELETE` clause, so they default to
`NO ACTION`. Verified: deleting a leaf WP that is an endpoint of an edge fails
with the same 23503 as the `is_leaf` flip. AD-27's trigger set explicitly
includes "a WP created, deleted, moved or re-parented", so the delete use case
must remove the WP's edges in the same transaction, in that order — or the FKs
need `ON DELETE CASCADE`. The spine says neither. Pick one and write it down;
cascading is defensible here (an edge with no endpoint is meaningless) but it
should be a decision, not a default nobody looked at.

Two smaller notes in the same place:
- The FK error `DETAIL` prints the full key, including `tenant_id` and
  `project_id` UUIDs. Those must not reach a UI surface.
- Verified positive: because `tenant_id` and `project_id` are inside the FK
  column list, a cross-Project or cross-Tenant edge is structurally impossible,
  which is what AD-25 claims for FR-6a. That part holds.

*Source:* executed on PostgreSQL 16.13.

---

### M2 (MEDIUM) — `jsonb` is not byte-preserving, and AD-26/AD-28 say "byte-identical"

AD-26 stores `inputs`/`outputs` as `jsonb` and asserts
`recalculate(run.inputs) === run.outputs`; AD-28's determinism test "asserts
byte-identical `outputs` through the AD-4 codec". `jsonb` does not round-trip
bytes. Verified:

| written | read back |
| --- | --- |
| `{"zz":1,"a":2,"bbb":3,"a":9}` | `{"a": 9, "zz": 1, "bbb": 3}` |
| `{"y":1e2}` | `{"y": 100}` |
| `{"s":"テスト"}` | `{"s": "テスト"}` |

Keys are reordered (length, then bytewise), duplicate keys are dropped last-wins,
exponent notation is normalised, `\uXXXX` escapes are decoded, and a space is
inserted after every `:`. So `outputs::text` is **not** what the AD-4 codec
emitted, and any test that compares the codec's string against the column's text
will either fail spuriously or — worse — be written to compare something weaker
so that it passes.

**Fix:** state that the comparison is on the *decoded* value re-canonicalised
through the AD-4 codec, never on `::text`. If byte-identity of the stored form
genuinely matters (for a hash, a signature, an export digest), the column has to
be `text` or `json`, not `jsonb`.

**Verified safe, worth recording:** `jsonb` stores numbers as `numeric`, not
IEEE-754 double. `0.1`, `1.0` and trailing zeros survive exactly. The Ratio /
integer-arithmetic discipline of line 113 and AD-27's remaining-duration rule is
not at risk from a jsonb round-trip.

*Source:* executed on PostgreSQL 16.13 (`jsonb` normalisation is unchanged in 18).

---

### M3 (MEDIUM) — AD-20's `hashtext()` is an undocumented internal function, and the scheduling slice makes it load-bearing

This is AD-20's mechanism, but AD-26 and AD-29 extend it to *every* `schedule_run`
and `holiday_calendar_version` append, and AD-27 now holds it across a synchronous
compute — so it is in scope for this review.

- `hashtext` is not in the documented function set. On the server it carries the
  comment `hash` and returns `integer` (int4). The PostgreSQL lists are explicit
  that it is internal, that its output has changed between major versions, and
  that applications must not depend on it being stable.
- The int4 space is small enough to collide at realistic scale. Hashing 200,000
  synthetic `tenant:project` keys produced **199,996 distinct values** — four
  collisions. A collision is not a correctness bug (two unrelated Projects
  serialise against each other) but it is a throughput surprise that will be
  impossible to diagnose from the application side, and AD-27 now makes that
  collision block an ingest behind an unrelated Project's PM edit.

**Fix:** use the two-argument `pg_advisory_xact_lock(int4, int4)` with an
application-computed, documented key (for example a stable per-Tenant and
per-Project integer), or `hashtextextended(text, 0)` for a bigint. Either way,
write down that the key derivation is the application's, not the server's.

*Sources:*
https://www.postgresql.org/message-id/CAMSP2L6WTCqKm9SbEdJCV4xxGjTqB5do=M0O7eTQU+s7gNf46g@mail.gmail.com
("documentation for hashtext?") ; executed on PostgreSQL 16.13.

---

### M4 (MEDIUM) — AD-27's synchronous-under-lock design is sound, but the unbounded wait is not stated

Three things verified in AD-27's favour, and they should be recorded as verified
rather than left to be re-argued:

- **`pg_advisory_xact_lock` is the right choice with a pooler.** The docs:
  transaction-level advisory locks *"are automatically released at the end of the
  transaction, and there is no explicit unlock operation"*, whereas a session-level
  lock *"is held until explicitly released or the session ends"*. With a `pg` Pool
  or a transaction-mode pooler a session-level lock would leak onto whichever
  request got the connection next. AD-20 picked correctly.
- **The database is not the cost.** Appending a pre-built ~144 kB run took
  **1.4–2.0 ms**; writing the 500-row `wp_schedule` projection took **4.6 ms**;
  reading a run back (detoast + decompress, ~385 kB) took **3.7 ms**. Against
  NFR-P1's 300 ms p95 the storage layer has ~10 ms of it. Whatever risk exists in
  AD-27's budget is in the JS passes and the AD-4 codec over a payload six times
  larger than AD-26 thinks it is (C1) — not in the lock or the write.
- The forward/backward passes being `max`/`min` reductions really are traversal-
  order independent; AD-28 is right that the tie-break only surfaces in what is
  *reported*.

**What is missing:** an advisory-lock wait is unbounded. There is no default
timeout, so an ingest that AD-27 says "waits behind a PM edit for up to NFR-P1's
budget" will in fact wait forever behind a stalled Node event loop, a long GC
pause or a transaction the app failed to end. I verified that `lock_timeout` does
cancel an advisory-lock wait:

```
SET lock_timeout = '500ms'; BEGIN; SELECT pg_advisory_xact_lock(42);
ERROR:  canceling statement due to lock timeout
```

**Fix:** AD-27 should say the ingest path sets `lock_timeout` and retries the
snapshot rather than blocking, and that the pool sets
`idle_in_transaction_session_timeout` so a wedged transaction cannot hold the
Project's lock indefinitely. That is the honest version of "waits behind a PM
edit", and it costs one line.

*Sources:*
https://raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/doc/src/sgml/mvcc.sgml
(Advisory Locks) ; executed on PostgreSQL 16.13.

---

### M5 (MEDIUM) — "after TOAST compression" assumes a compression outcome that this payload does not deliver

AD-26 says "about 25 KB per run … after TOAST compression", treating compression
as a given multiplier. Three checks:

- **It does toast.** *"The TOAST management code is triggered only when a row
  value to be stored in a table is wider than TOAST_TUPLE_THRESHOLD bytes
  (normally 2 kB)"*, and it *"will compress and/or move field values out-of-line
  until the row value is shorter than TOAST_TUPLE_TARGET bytes"*. A ~385 kB run is
  far past that, so yes.
- **PostgreSQL 18 still defaults to pglz, not lz4.** `REL_18_STABLE`'s
  `postgresql.conf.sample` carries `#default_toast_compression = 'pglz'  # 'pglz'
  or 'lz4'`. (A change of this default to lz4 is in flight on `master`, i.e. for a
  later release — not 18. Anyone reading a 2026 blog post about the lz4 default
  will be reading about PostgreSQL 19.) The AD should not assume lz4 unless the
  column or the cluster sets it.
- **And lz4 would not help here anyway.** On the same `inputs` payload: pglz
  89,719 bytes vs lz4 91,454 bytes — lz4 was *worse*. On the identifier-only floor
  payload pglz refused to compress at all and stored it raw. UUID text is the
  reason, which is why C1's fix is identifier encoding and not a compression
  setting.

*Sources:*
https://raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/src/backend/utils/misc/postgresql.conf.sample ;
https://raw.githubusercontent.com/postgres/postgres/master/src/backend/utils/misc/postgresql.conf.sample ;
https://raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/doc/src/sgml/storage.sgml ;
measured on PostgreSQL 16.13.

---

### L1 (LOW) — AD-28's `compareNfkc` is safe for the "years later" claim, but only if it is not `localeCompare`

AD-28 says a re-derivation "years later orders by the codes that were in force
then", with non-numeric WBS segments compared "through `domain/text.compareNfkc`
(NFR-I1)". `compareNfkc` does not exist in the repository yet, so this is a claim
about a function nobody has written.

- **NFKC itself is safe.** Unicode's normalization stability policy fixes the
  decomposition of already-assigned characters, so `String.prototype.normalize('NFKC')`
  gives the same answer on a future Node. Node 24 here reports ICU 78.2 /
  Unicode 17.0, and `'ＷＢＳ1.２.③'.normalize('NFKC')` → `'WBS1.2.3'`, folding
  full-width digits and circled numerals as a Japanese WBS code needs.
- **The trap is the comparison, not the normalization.** If `compareNfkc` reaches
  for `localeCompare` or `Intl.Collator('ja')`, the result depends on the bundled
  ICU collation data, which *does* change across Node upgrades — and AD-28's
  byte-identical determinism test would start failing on a Node bump with no
  change to the data. Say explicitly that `compareNfkc` is a **code-point
  comparison of the NFKC-normalized strings**, and that `localeCompare` and
  `Intl.Collator` are forbidden in `domain/`. That is a one-line ESLint rule
  alongside the existing clock/env rules.

*Source:* Node v22/24 `String.prototype.normalize` behaviour verified locally
(ICU 78.2, Unicode 17.0); Unicode normalization stability policy.

---

### L2 (LOW) — the four-column unique key is a second full btree, and that is a real if small cost

`UNIQUE (tenant_id, project_id, id, is_leaf)` produces a complete second index
that duplicates the primary key plus one boolean:

```
work_package_pkey  CREATE UNIQUE INDEX … USING btree (tenant_id, project_id, id)
wp_leaf_key        CREATE UNIQUE INDEX … USING btree (tenant_id, project_id, id, is_leaf)
```

At 500 WPs per Project this is nothing. It is worth one clause in AD-25 so it
reads as a priced trade rather than an oversight, and so nobody later "optimises"
by dropping the primary key — which would break the FKs, since the referenced
columns must be a non-deferrable unique constraint or non-partial unique index.

*Source:* `pg_index` on PostgreSQL 16.13.

---

### L3 (LOW) — verified positive: FK checks bypass row security, so AD-3's FORCE RLS does not break AD-25

Worth recording because the opposite would have been fatal and nobody checked.
Referential-integrity checks run with row security disabled. I created a parent
table with `FORCE ROW LEVEL SECURITY` and a policy hiding a row, then as a
non-owner role inserted a child referencing the hidden row: the insert
**succeeded**, while a reference to a genuinely absent row failed normally.

So the `wp_dependency` → `work_package` FKs will not spuriously fail when
`app.tenant_id` is set to a different value, and AD-3's FORCE RLS and AD-25's
declarative enforcement coexist. Combined with M1's note that `tenant_id` and
`project_id` are inside the FK column list, the tenant boundary is preserved by
the column list rather than by RLS — which is the stronger of the two mechanisms
and is what AD-25 intends.

*Source:* executed on PostgreSQL 16.13.

---

### L4 (LOW) — AD-27's "300 ms p95 at 500 WPs" is an assumption, and it is the one the whole synchronous design rests on

AD-27 states "At 500 WPs and 300 ms p95 that is acceptable" and then commits to a
consequence — an ingest blocking behind a PM edit — and to a remediation order
("the first lever is the granularity of the ingest lock, never moving the
recalculation into a job"). Nothing has been measured. From M4 the database side
is ~10 ms; the unmeasured part is the CPM passes, the validation pass and the
AD-4 codec over a payload that C1 shows is ~385 kB rather than ~25 kB. The
assumption is plausible but it is doing more work than an assumption should: it is
the premise of a decision that AD-27 also says will not be revisited. Tag it as
the first thing the first scheduler story measures, alongside the run size, and
say what happens if it misses — because "never move it into a job" is a commitment
made against a number nobody has.

---

## What the scheduling slice got right

- The `UNIQUE (…, is_leaf)` + `pred_is_leaf CHECK` + composite-FK construction is
  a real PostgreSQL pattern and PostgreSQL accepts all of it. I built and
  exercised the exact DDL.
- `pg_advisory_xact_lock` rather than a session-level lock. Correct under a pool,
  and the docs back it.
- Storing the pinned inputs by reference (`baseline_version.schedule_run_seq`)
  rather than a second copy, and withdrawing AD-11's duplicate working-day set.
  One representation, no drift.
- Integer/Ratio arithmetic for remaining duration survives a `jsonb` round-trip
  intact, because `jsonb` numbers are `numeric`.
- The forward/backward passes genuinely are order-independent; AD-28 correctly
  identifies reporting, not computation, as where the tie-break matters.
- AD-25's inclusion of `tenant_id` and `project_id` in the FK column list makes
  FR-6a's cross-project rejection structural, exactly as claimed.

The pattern of the gap is the same one the morning's review found one level up:
the *shape* of each mechanism was reasoned out well, and the *behaviour* of the
mechanism under a second statement, a second transaction or a real payload was
written down as though it had been run. Four of those five behaviours do not hold.

## Not re-checked here

Stack table versions and the AD-1 … AD-24 technology claims covered by
`reviews/review-tech-currency.md` this morning. Its F3 (Drizzle 1.0 at RC) remains
relevant to H3: if the build moves to Drizzle 1.x after R0, re-check whether
`foreignKey` gains deferrability, because the hand-written SQL in AD-30 would then
be replaceable.

## Sources

- https://raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/doc/src/sgml/ref/create_table.sgml — FK must reference a non-deferrable unique/PK constraint; which constraint types accept DEFERRABLE; NO ACTION vs RESTRICT timing
- https://raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/doc/src/sgml/ddl.sgml — generated columns: virtual by default in 18, no subqueries, current row only
- https://raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/doc/src/sgml/storage.sgml — TOAST_TUPLE_THRESHOLD / TOAST_TUPLE_TARGET, ~2 kB
- https://raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/doc/src/sgml/mvcc.sgml — advisory locks, session vs transaction release
- https://raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/src/backend/utils/misc/postgresql.conf.sample — `#default_toast_compression = 'pglz'` in PostgreSQL 18
- https://raw.githubusercontent.com/postgres/postgres/master/src/backend/utils/misc/postgresql.conf.sample — the lz4 default change is on master, not 18
- https://www.postgresql.org/message-id/CAMSP2L6WTCqKm9SbEdJCV4xxGjTqB5do=M0O7eTQU+s7gNf46g@mail.gmail.com — hashtext is internal, undocumented, not stable across versions
- https://registry.npmjs.org/drizzle-orm/0.45.2 — confirms the `./pg-core/checks` export in the pinned version
- `npm pack drizzle-orm@0.45.2` → `pg-core/foreign-keys.d.ts` (builder has only `onUpdate`/`onDelete`), `pg-core/checks.d.ts` (`check(name, value)`), `pg-core/session.d.ts` (`deferrable?: boolean` is the transaction option)
- `npm pack drizzle-kit@0.31.10` → `bin.cjs` (`checkConstraints`, `CONSTRAINT … CHECK (…)` emission)
- Live execution against PostgreSQL 16.13 for every behavioural claim above; `postgresql.org` is blocked by this environment's egress proxy and no PostgreSQL 18 server was reachable, so PG18-specific statements come from the REL_18_STABLE documentation source listed above
