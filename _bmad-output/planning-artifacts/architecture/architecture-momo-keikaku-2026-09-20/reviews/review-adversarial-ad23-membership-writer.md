# Adversarial review — AD-21/AD-23: the membership bridge's one writer, its grant, its lock discipline, the last-admin and `project_ids` rules (2026-09-21)

**Target:** the uncommitted spine amendment for story 1.4 slice 2 (`spec-1-4-revocation-and-membership.md`,
built on main in PR #29): AD-21's `global` row and per-entry-exceptions bullet; AD-23's bridge
bullet, grants sentence, revocation/role bullet and the new `project_ids` bullet
(`ARCHITECTURE-SPINE.md` lines 420, 422, 455, 457, 460, 461). The decisions are the founder's and
settled; this review attacks whether the text is correct, complete, enforceable and consistent.
**Method:** one context-free reviewer read `git diff main` of the spine, the spec, and the code on
disk (`packages/db/src/repo-membership-write.ts`, `schema-membership.ts`, `tenant-transaction.ts`,
`table-classes.ts`, `source-discipline.test.ts`, `seed.ts`, `probe-tenants.ts`;
`packages/app/src/use-cases/membership-writes.ts`, `ports/membership-write.ts`, `ports/write-deps.ts`,
`authz/resolve-request-context.ts`, `authz/request-context.ts`), grepped the whole spine for
`tenant_membership`, `membership`, `revocation`, `project_ids`/`projectIds`, `tenant_admin`, AD-3,
AD-12, AD-14 and AD-1's carve-outs, and checked the PRD's FR-2/FR-3. Lens: build two units one level
down (story 1.5's role model, a future invitation use case, story 1.7's audit-log reader, the
worker, the R1 tenant switcher) that each obey every AD to the letter and still clash.

## Round 1 — findings

### F1 — high — Narrowing "read by nothing else" to "read *to resolve a Tenant*" leaves every other bridge read unowned, and not bound by the `tenant_id` discipline

**Evidence.** Before the amendment AD-23 said the bridge "is read by `resolveRequestContext` … and
by nothing else". The amended text (spine:455) says it "is read *to resolve a Tenant* by
`resolveRequestContext` … and by nothing else", and AD-21's row (spine:420) says "read *for request
resolution* only through `MembershipReader`". The explicit-`tenant_id` rule is stated for "every
*writer* statement" only (spine:455). But several planned units must read the bridge for something
other than resolution:
- story 1.5's members screen (who is in this Tenant, as what role, over which Projects) — the admin
  needs it to pick a target for the four use cases just built;
- FR-2 "The Tenant Admin is notified of every Client Viewer invitation" (prd.md:269) — the Tenant's
  admins, read from the bridge;
- the R1 tenant switcher — the user's Tenants (spine:456 already expects a Client Viewer in several);
- FR-36 notification recipients in the worker — a Project's Client Viewers;
- story 1.7's audit-log view if it shows the actor's role.

Two units obeying the letter clash: 1.5 adds `membersOf(tenantId)` to `repo-membership.ts` (the
reader module; the gate allows it to import the table, `source-discipline.test.ts:131-136`), while the
FR-36 worker adds `recipientsOf` to `repo-membership-write.ts` (the module composed into the tenant
transaction). Neither reads "to resolve a Tenant", so neither is forbidden; neither is told to
filter by `tenant_id` itself, because that rule speaks of writer statements. On a table with no RLS,
a reader that forgets the filter returns every Tenant's members. Worse, AD-3's system path "may read
only tables of class `global` or `operational`" (spine:125), and the bridge is `global`, so a worker
fan-out may read it with no rule at all — contradicting "by nothing else".

**Fix (spec text).** Replace the reading sentence in spine:455 with: "Every read of the bridge is in
one of its two modules: resolution reads through `membershipsOf` (`repo-membership.ts`), called by
`resolveRequestContext` only; every other read — a Tenant's members, its admins, a user's Tenants —
is a named function of `repo-membership.ts`, added by the story that needs it and pinned in
`source-discipline.test.ts` like `membershipsOf`; the writer reads only the rows it locks. **Every
statement on the bridge, read or write, names `tenant_id` itself** unless it is `membershipsOf`
(which is keyed by user) or a user's-Tenants read for the switcher (keyed by the signed-in user)."
Mirror it in the AD-21 row (spine:420: "`tenant_membership` read only in `repo-membership.ts` …"), and
add to AD-3's system-path bullet (spine:125): "except the tenant-membership bridge, which only its
own modules read (AD-23)".

### F2 — high — "`project_ids` limits a PM's reach only" contradicts AD-12 and FR-2 for Client Viewers, and leaves "empty" open to meaning "all"

**Evidence.** spine:461 says `project_ids` "limits a PM's reach only". AD-12 (spine:274) says Client
Viewer use cases read `outputs_client` "for their invited Projects", and FR-2 (prd.md:268): "a
Client Viewer reaches only the Published Snapshots of the Projects they were invited to". The only
per-membership Project list in the model is `project_ids`; read to the letter, the new bullet says it
does not limit a Client Viewer, so R1's `client-view` and 1.5's role model can build two
incompatible answers. Separately, the code's comments give emptiness a meaning the spine does not:
`schema-membership.ts:33` "Empty for a seeded Tenant Admin, who reaches every Project" and
`request-context.ts:14-15` "A seeded Tenant Admin's membership names no Projects (they reach every
one)". A 1.5 author reading "empty ⇒ every Project" would give a PM with no assignments every
Project. `project_ids` also has no foreign key (`schema-membership.ts:23`, "No foreign keys") and
`unassignMemberProject` deliberately removes stale ids (`membership-writes.ts:164-167`), so stale
ids are a normal state the reach rule must tolerate.

**Fix (spec text).** Replace spine:461 with: "Reach is decided by role, never by whether
`project_ids` is empty. A `tenant_admin` reaches every Project of the Tenant whatever its
`project_ids` hold (they are kept across a promotion so a demotion restores them). A `pm` reaches
exactly the Projects in `project_ids` — empty means none. A `client_viewer` (R1) reaches exactly its
invited Projects, which are its `project_ids` (AD-12). An `internal_viewer`'s reach is FR-2/FR-33's.
An id in `project_ids` that names no Project visible under `withTenant` grants nothing; readers
intersect, and nothing cleans ids up eagerly."

### F3 — medium — "One writer" and "reached only by the membership use cases" are stated as enforced, but the gate has holes and the scope reach is held by review only

**Evidence.** spine:455 lists the gate: `source-discipline.test.ts` "fails when any shipped module
but that reader, that writer, the seed and the probe Tenants imports it, or names it in a
`FROM`/`JOIN`". Checked on disk:
- The FROM/JOIN ban is satisfied by the writer (it is in `ALLOWED_IMPORTERS`,
  `source-discipline.test.ts:131-136`, and is excluded at `:165`) — the claim is true. But the
  regex is `/\b(FROM|JOIN)\s+"?tenant_membership\b/i` (`:166`): a raw
  `sql\`UPDATE tenant_membership SET role = …\`` or `INSERT INTO tenant_membership` in any other
  module passes it. The app role holds UPDATE (`table-classes.ts:144`), so a second writer via raw
  SQL is both permitted by the database and invisible to the gate.
- A second `pgTable('tenant_membership', …)` declaration in another module never names the symbol
  `tenantMembership` or `schema-membership`, so it passes the import check (`:151-160`), and Drizzle
  emits its `FROM` at runtime, not in source.
- `applicationSources()` (`:146-149`) covers `.ts/.js` only; a `.sql` file is not scanned.
- Both identifiers are pinned as claimed (`:171-196`; `membershipWriterOn` to
  `repo-membership-write.ts` and `tenant-transaction.ts`). But "reached only by `packages/app`'s
  audited membership use cases" has no gate: `writeScopeOn` hands **every** family to **every** write
  (`tenant-transaction.ts:36-42`), and `WriteScope = ProjectWriteScope & OrgWriteScope &
  MembershipWriteScope` (`write-deps.ts:20`), so any write use case that widens its port to include
  `membership` receives the writer at runtime. The spine is careful elsewhere to say "held by review,
  not by a gate" (spine:457); here it is not.

**Fix (spec text).** In spine:455, after "…names it in a `FROM`/`JOIN`": "(the ban also matches
`UPDATE`, `INSERT INTO` and `DELETE FROM`, and a second `pgTable('tenant_membership'` declaration
anywhere but `schema-membership.ts`)" — and extend `source-discipline.test.ts` to match, or else say
those forms are held by review. Replace "reached only by `packages/app`'s audited membership use
cases" with "reached, by review, only by `packages/app`'s audited membership use cases: the tenant
transaction hands every family to every write, so which use cases name `membership` in their port is
not gated".

### F4 — medium — "It is written by one module" is false as a statement about the table; `purgeTenant` and user deletion are unaccounted for

**Evidence.** spine:455 "It is written by one module, `packages/db`'s `repo-membership-write.ts`".
The seed inserts memberships (`seed.ts:475`) and the probe Tenants delete theirs
(`probe-tenants.ts:443`), both on the **owner** handle (`probe-tenants.ts:373-377`) — which is why
the app role can lack INSERT. `purgeTenant` (NFR-D1; spine:151, spine:298) must delete a purged
Tenant's bridge rows, through the maintenance role — a third writer the spine does not mention. And
the app role holds DELETE on `auth_user` (spine:457, `table-classes.ts:115`); with no foreign keys, a
Better Auth user deletion leaves that user's membership rows behind, including a `tenant_admin` row
that still counts toward the last-admin rule while nobody can sign in as it.

**Fix (spec text).** spine:455: "It is written **on the application role** by one module …; the
owner-role seed and the probe Tenants (test-only) write it too, and `purgeTenant` deletes a purged
Tenant's rows through the maintenance role (AD-5), recording them in `operator_audit`." Add to the
revocation bullet (spine:460): "Deleting a user is not a revocation path: a story that exposes user
deletion must revoke each membership through the membership use cases first, so the last-admin rule
holds."

### F5 — medium — "Until story 1.5 …" scopes the in-transaction re-check too, so 1.5 may drop it to the letter

**Evidence.** spine:460: "Until story 1.5's role model, the membership use cases check `tenant_admin`
themselves — before parsing, answering `not_found` — **and** re-check it against the caller's locked
row, because a context resolved once per server action may be stale." Grammatically "until 1.5"
governs both clauses. The deferred log says the opposite about the second: story 1.5 "must keep the
in-transaction re-check against the bridge (a server action's context can be stale)"
(`deferred-work.md:619`). The re-check is also what the lock design exists for: the caller's row is
in the lock set (`repo-membership-write.ts:67-91`) precisely so `membership-writes.ts:92` can refuse a
caller demoted or revoked since the context was resolved. A 1.5 that replaces the local role check
with its declared-roles mechanism and deletes the re-check obeys the text and reopens the stale-
context hole; a 1.5 that keeps both leaves two owners of the membership writes' authorisation.

**Fix (spec text).** Split the sentence: "Until story 1.5's role model, the membership use cases
check `tenant_admin` in the context themselves, before parsing, answering `not_found`; 1.5's
declared roles replace that check. **Independently of 1.5, and permanently**, every membership write
re-checks the caller's authority against the caller's row in its one lock statement, because a
context resolved once per server action may be stale."

### F6 — medium — "(a session with no active Tenant yet answers `no_access`)" is not what the resolver does

**Evidence.** `resolve-request-context.ts:87-95`: with no active Tenant the resolver answers
`no_access` only for **zero** or **several** usable memberships; with exactly one it **chooses it,
persists it** (`setActiveTenant`) and answers `signed_in`. So a user revoked from Tenant A before
their first page, who still belongs to Tenant B, is signed in to B — correct behaviour, but the
parenthetical says `no_access`. Also, "any request whose active Tenant has no membership" understates
the rule: a row whose role this release does not know is filtered out as unusable
(`resolve-request-context.ts:54-56`) and ends the session the same way (`:79-83`), so a role change
to an unknown string would also sign the user out. And the session that answers `no_access` is kept,
not ended (`deferred-work.md:563`) — the parenthetical does not say so.

**Fix (spec text).** Replace the parenthetical in spine:460 with: "(a session with no active Tenant
yet is resolved afresh: it is signed in to the user's one remaining usable membership, or answers
`no_access` — and is kept — when none or several remain; a membership whose role this release does
not know counts as none)".

### F7 — medium — Invitation is deferred as "decides its own grant", but the unresolved question is its shape, and the amendment's own rules constrain it

**Evidence.** spine:422 and spine:457 defer INSERT to "invitation work, which decides its own grant".
Build the two units FR-2 requires (prd.md:265: a Tenant Admin invites PMs; a PM invites Client
Viewers to their own Projects) to the letter:
- The **inviting** half fits: an audited use case under `ctx.tenantId`, inserting through
  `membershipWriterOn` (the "one module", spine:455). But the lock rule names "the caller's and the
  target's" rows, and the local `tenant_admin` gate (spine:460) forbids the PM inviter FR-2 requires
  — so R1's PM-invites-CV cannot use the membership use-case shape as stated.
- The **accepting** half does not fit at all: the invitee has no membership, so
  `resolveRequestContext` yields `no_access` and there is no `ctx.tenantId` to bind
  `inTenantTransaction`; the Tenant must come from the invitation, and finding an invitation by token
  before any Tenant is known is a pre-Tenant read — i.e. a second non-RLS table carrying `tenant_id`,
  which AD-23 ("Exactly one non-RLS bridge", spine:455) and AD-3's registry test ("fails the flag on
  any second table", spine:122) forbid. Two invitation stories will each invent an answer.

**Fix (spec text).** Add to AD-23 an open-question bullet: "Invitation (after slice 4's mailer) must
decide, beside its grant: (a) where acceptance takes its Tenant from before the invitee has a
membership — a hashed-token invitation row read before any Tenant is known is a second bridge and
needs its own AD-3/AD-23 exception; (b) that the INSERT is a method of `membershipWriterOn`, not a
new module; (c) its lock set when the target has no row; (d) that a PM inviter (FR-2) is authorised
by 1.5's roles over that Project, not by the membership writes' `tenant_admin` check."

### F8 — medium — The bridge's key is not stated, while `RequestContext.roles` is plural

**Evidence.** spine:455 gives `tenant_membership(user_id, tenant_id, role, project_ids)` with no key.
The code has `primaryKey(user_id, tenant_id)` (`schema-membership.ts:38`), so one role per user per
Tenant; `exactlyOne` (`repo-membership-write.ts:48-54`), the resolver's `find`
(`resolve-request-context.ts:78`) and `contextOf`'s single-element `roles` (`:62`) all rely on it.
But AD-12's `RequestContext { … roles … }` (spine:273; `request-context.ts:30`) is plural. Story 1.5,
obeying AD-12, can model "a PM who is also a Client Viewer of another Project" as a second row, which
the key refuses and `exactlyOne` would turn into a thrown bug; or an invitation of an existing member
as a new row, which conflicts. `role` is also unconstrained text (`schema-membership.ts:31`), which
the use cases rely on (unknown roles may be re-roled), and the spine does not say so.

**Fix (spec text).** spine:455: "`tenant_membership(user_id, tenant_id, role, project_ids)`, keyed by
`(user_id, tenant_id)`: one role per user per Tenant, so `RequestContext.roles` holds at most one.
`role` is stored as text; a value this release does not know grants nothing (the resolver treats it
as no membership) and may be re-roled. `project_ids` is a text array with no foreign key (F2)."

### F9 — medium — AD-3 is not reconciled with an application-filtered writer

**Evidence.** AD-3's **Prevents** is "one repository filtering by `tenant_id` while another forgets
to" and its title "Tenant isolation lives in the data layer (RLS) and nowhere else is trusted"
(spine:115-118). Its one named exception (spine:122) justifies the bridge by "read before any Tenant
is known". The new writer runs under a *known* Tenant, inside `withTenant`, yet its isolation is
exactly the trusted application `WHERE` AD-3 prevents (`repo-membership-write.ts:15-19`, `:58-59`,
`:83`). The amendment states the discipline in AD-23 but leaves AD-3 claiming nothing but RLS is
trusted.

**Fix (spec text).** Append to spine:122: "Because the bridge has no policy, its writer (and every
other statement on it, AD-23) filters by `tenant_id` itself — the one place isolation rests on an
application filter; `tests/membership.test.ts` and the cross-tenant write harness fail when any such
filter is dropped."

### F10 — low — The last-admin refusal's code is not in the spine, though the rule binds "whichever use case changes the role"

**Evidence.** spine:460 binds every role-changing use case to the rule but not to its answer. The
code answers `invalid_input` with `details.userId = ['last_tenant_admin']`
(`membership-writes.ts:57`, `:100`). 1.5's role screen and invitation's role-at-acceptance will each
pick a code, and the UI will map two.

**Fix (spec text).** spine:460: "… can be neither revoked nor demoted, whichever use case changes the
role; the refusal is `invalid_input` with rule code `last_tenant_admin`, counted over the Tenant's
`tenant_admin` rows locked by the one lock statement."

### F11 — low — The lock set can under-count admins under a concurrent promotion; the code comment over-claims

**Evidence.** Under READ COMMITTED, `SELECT … WHERE role = 'tenant_admin' OR user_id IN (…) ORDER BY
user_id FOR UPDATE` (`repo-membership-write.ts:74-91`) re-checks only the rows its snapshot found. A
member promoted by a transaction that commits while this statement waits on the shared caller row is
not in the set, so the admin count can be one low and a legitimate demotion is refused as
`last_tenant_admin`. It never over-counts (locked rows are re-checked), so the rule is safe and there
is no deadlock — the spine's claim (spine:455, "queue instead of deadlocking") holds. The comment's
"the admin count … is over rows nobody else can change" (`repo-membership-write.ts:24-26`) is the
over-claim; the spine should not inherit it if it is ever tightened.

**Fix (spec text).** None required for the spine; if it states the count's property, say "never
over-counts: a concurrent promotion may cause a spurious `last_tenant_admin`, retried by the user".

### F12 — low — Cross-references and bookkeeping the amendment should have touched

**Evidence.**
- spine:457 lost a conjunction: "(a per-entry grant override in the registry) SELECT only on
  `tenant`, and …" — read as the Better Auth tables holding "DML … SELECT only".
- AD-23's **Binds** (spine:452) omits NFR-A1, which the new revocation/role bullet implements; the
  memlog says the decision "Binds … AD-14", but AD-14 (spine:298) is untouched and still states the
  stale `audit.record(ctx, …)` signature (`deferred-work.md:557`).
- The frontmatter `reviews_applied` (spine:33) and the intro (spine:40) cite this review as applied
  before its round 1 is resolved.
- `epic-1-context.md` still says SELECT-only and a single reader (`deferred-work.md:610`, `:629`);
  it is compiled from the spine and should be regenerated in the same change.

**Fix (spec text).** spine:457: "(a per-entry grant override in the registry), SELECT only on
`tenant`, and SELECT, UPDATE and DELETE — no INSERT — on `tenant_membership` (AD-21)". Add NFR-A1 to
AD-23's Binds. Either amend AD-14's signature or drop "AD-14" from the memlog line. Add
`reviews_applied` only once round 1 is resolved. Regenerate `epic-1-context.md`.

## Round 1 — resolution


Resolved 2026-09-21, together with `review-rubric-ad23-membership-writer.md` (R) and `review-tech-currency-ad23-membership-writer.md` (T):

| Finding | Resolution |
|---|---|
| F1 other readers unowned | AD-23: any tenant-scoped use of the bridge other than Tenant resolution lives in `packages/db`'s membership modules, filters `tenant_id` itself, and never decides a request's Tenant; AD-3's system path reads the bridge only through them |
| F2 `project_ids` vs Client Viewers | Rewritten: never limits a `tenant_admin`; for every other role exactly the Projects reached, empty reaching none; AD-12 cross-references it (empty = none logged as an assumption for 1.5 to ratify) |
| F3, R2 gate holes | AD-23 now states what `source-discipline.test.ts` enforces and what is review-held (raw `UPDATE`/`INSERT INTO`, callers of the writer), and names the tests that prove filter, lock and audit |
| F4, R1 "one writer" false | "On the application role"; seed, probes and maintenance purge named as owner/maintenance writers. Better Auth user deletion is not a path the product exposes (none is allowlisted) |
| F5, R4 re-check "until 1.5" | Split: the locked-row re-check is permanent; only the context pre-check is until 1.5 |
| F6, R7 `no_access` inaccurate | Parenthetical removed |
| F7, R5 invitation shape | New AD-23 bullet: invitation is open — INSERT joins the one writer; acceptance before a Tenant is known and PM inviters decided with that story (memlog question) |
| F8 key and role cardinality | Stated: one row per `(user_id, tenant_id)`, one `role` |
| F9 AD-3 not reconciled | The explicit filter is named as AD-3's exception in AD-23 |
| F10 refusal code | Not adopted: a code is a use-case detail, the rule binds every role-changing use case |
| F11 false refusal under concurrency | Recorded: the count can only err low |
| F12, R8, R9 bookkeeping | "and" restored by rewriting the grant sentence (AD-21 is the grant's authority); NFR-A1 added to Binds; this file now exists; `epic-1-context.md` regenerates on the next Build |
| R3 Prevents | Five Prevents added |
| R6 AD-12 | Cross-reference added |
| T1 lock order is plan behaviour | Stated, the locking clause is required top-level, and the race test is named |
| T2 READ COMMITTED | Stated, with the err-low consequence |
| T3 UPDATE needed by `FOR UPDATE` | Added to AD-21's grant clause |
| T4 comma | Sentence rewritten |

## Round 2 — findings

**Method.** One context-free reviewer re-read `git diff main` of the spine against round 1's
resolution table and checked each resolution's factual claims on disk: `source-discipline.test.ts`
(`:117-203`), `repo-membership-write.ts`, `repo-membership.ts`, `repo-org.ts`, `table-classes.ts`,
`sql/grants.sql`, `packages/db/auth/src/{auth,bindings}.ts`, `membership-writes.ts`,
`resolve-request-context.ts`, `request-context.ts`, `tests/membership.test.ts`,
`tests/cross-tenant-writes.test.ts`, `tests/audited-use-cases.test.ts`; grepped the spine for
`membership`, `project_ids`/`projectIds`, `tenant_admin`, `purge`, `maintenance`, `Viewer`, and the
PRD for FR-2, FR-3, FR-33, NFR-D1.

**Verified true, not re-raised:** the gate enforces exactly what spine:455 says it does — importers
pinned to reader, writer, seed and probes (`source-discipline.test.ts:131-161`), `FROM`/`JOIN`
banned elsewhere (`:163-169`, which also catches `DELETE FROM`), `membershipsOf` and
`membershipWriterOn` pinned (`:171-196`), barrel clean (`:198-202`); raw `UPDATE`/`INSERT INTO` are
indeed not matched. The lock is one ordered top-level `SELECT … FOR UPDATE` over admins + caller +
target (`repo-membership-write.ts:74-91`); every statement names `tenant_id` (`:58-59`, `:83`).
`tests/membership.test.ts:461-500` races overlapping writes; the cross-tenant write harness and the
audit gate cover the four writes (`cross-tenant-writes.test.ts:59-61`,
`audited-use-cases.test.ts:8,76`). The resolver ends a session whose active Tenant has no usable
membership (`resolve-request-context.ts:77-83`). The app role holds SELECT, UPDATE, DELETE, no
INSERT (`grants.sql:27-28`). "Better Auth user deletion … none is allowlisted" is true: the HTTP
allowlist is `get-session`, `sign-out`, `sign-in/email` (`bindings.ts:15-19`) and `auth.ts:99-104`
does not enable `user.deleteUser`. The "err low, never lost admin" analysis holds (EvalPlanQual
re-checks the `WHERE` on a row changed while waiting, so a demoted or deleted row drops out; only a
row promoted after the snapshot can be missed).

### G1 — high — The "permanent" caller re-check, and "whether a PM may invite", contradict FR-2

**Evidence.** spine:460 makes permanent that "Every membership write re-checks that its caller is
still `tenant_admin` against the caller's own locked row". spine:461 makes invitation's INSERT
"join the one writer", i.e. a membership write, and leaves open "whether a PM may invite". But FR-2
already decided it: "A PM can invite Client Viewers to their own Projects" (prd.md:265), with its
own consequence (prd.md:269, invitation only at domains the PM allowed). Built to the letter, R1's
PM-invites-Client-Viewer is a membership write whose caller is a `pm`, so the permanent rule refuses
it (`membership-writes.ts:78`, `:92` is exactly that check); the invitation story must then either
break a "permanent" AD rule or route the INSERT outside the one writer — the two things the
amendment exists to prevent. The spine cannot leave open a question the PRD has closed.

**Fix (spec text).** spine:460: replace "re-checks that its caller is still `tenant_admin` against
the caller's own locked row" with "re-checks, against the caller's own row in its one lock
statement, that the caller still holds the role that use case requires — `tenant_admin` for the
four story 1.4 writes — a permanent rule, because the context of a server action is resolved
once". spine:461: replace "and whether a PM may invite, are decided with that story" with "and how
a PM inviter is authorised over its own Projects (FR-2 lets a PM invite Client Viewers, R1; the
role re-check above then requires `pm` with that Project in the caller's locked `project_ids`) are
decided with that story".

### G2 — medium — "No second lock statement" holds for the writer module, not for the membership writes; no cross-table lock order is stated

**Evidence.** spine:455: "The writer takes all its row locks in one top-level `SELECT … FOR UPDATE`
… and no second lock statement". But `assignMemberProject` takes the membership lock and then
`scope.org.findProject` (`membership-writes.ts:152-153`), and every `find*` in the org repository is
`FOR UPDATE` (`repo-org.ts:18`, `:105`) — a second lock, on `project`, after the bridge. Today no
transaction locks in the opposite order, so there is no deadlock. One level down, two units that
obey every AD create one: (a) story 1.5 generalises the stale-context re-check G1 describes to the
project writes — `findProject` first (the existing project-write shape), then the caller's
membership row; (b) any Project archive/delete that removes the id from members' `project_ids`
through the writer. Either locks `project` → `tenant_membership` while `assignMemberProject` locks
`tenant_membership` → `project`: a deadlock the **Prevents** line promises away.

**Fix (spec text).** Append to the lock sentence in spine:455: "A transaction that locks bridge rows
takes that one statement **before any other row lock** (a membership write then locks the Project
it checks, never the reverse); a use case that must lock another row first does not lock bridge
rows in the same transaction."

### G3 — medium — AD-3's new sentence lets the system path read the bridge across Tenants, which AD-23's rule cannot govern

**Evidence.** spine:125 (new): the system path "may read only tables of class `global` or
`operational` … Of those, the tenant-membership bridge is read only through `packages/db`'s
membership modules". The system path spans Tenants before it "enters `withTenant` for each Tenant"
— there is no bound Tenant. AD-23 (spine:455) allows non-resolution uses of the bridge only as
tenant-scoped statements that name "`tenant_id = <the bound Tenant>`". So a worker adding
`adminsOfEveryTenant()` (FR-2's "the Tenant Admin is notified of every Client Viewer invitation",
FR-36 recipients) to `repo-membership.ts` is licensed by AD-3 and forbidden by AD-23; another
author reads AD-3 as the stronger, later text and writes an unfiltered cross-Tenant read that
decides which Tenants the job then enters — the bridge deciding a Tenant outside
`resolveRequestContext`.

**Fix (spec text).** spine:125, replace the added sentence with: "The tenant-membership bridge is not
read on the system path: work that needs a Tenant's members reads them after entering
`withTenant(tenant_id)`, through `packages/db`'s membership modules with that Tenant bound (AD-23)."

### G4 — medium — A user's own Tenants (R1 switcher; R0's several-memberships refusal) have no lawful read

**Evidence.** spine:455 allows exactly two kinds of bridge read: resolution, "by
`resolveRequestContext` … and by nothing else", through `membershipsOf` (pinned to its one caller,
`source-discipline.test.ts:171-186`); and tenant-scoped uses that name the bound Tenant. A list of
the signed-in user's Tenants is neither: it is keyed by user and has no bound Tenant. It is needed
by the R1 switcher (spine:456 expects a Client Viewer in several Tenants) and already by R0: a user
with several memberships and no active Tenant answers `no_access` (`resolve-request-context.ts:97-102`)
with no way to choose. Unit A extends the resolver's answer with the list; unit B adds
`tenantsOf(userId)` to `repo-membership.ts` (allowed importer, no `tenant_id` filter possible);
unit C calls `membershipsOf` from a second site and edits the pin. All three can cite the text.

**Fix (spec text).** Add to spine:455 after "and by nothing else": "The signed-in user's own usable
memberships — what a Tenant chooser shows — are part of `resolveRequestContext`'s answer, from the
same `membershipsOf` read; there is no second user-keyed read of the bridge."

### G5 — medium — "For every other role … exactly the Projects the member reaches" is wrong for the Internal Viewer

**Evidence.** spine:462: "For every other role they are exactly the Projects the member reaches, an
empty list reaching none". `ROLES` already includes `internal_viewer`
(`request-context.ts:17`). FR-2/FR-33 give the Internal Viewer Program and Department roll-ups
across the Tenant ("Internal Viewers see aggregates only", prd.md:270; prd.md:834), and nothing
invites an Internal Viewer to Projects. Read to the letter, a Post-Q1 Internal Viewer with empty
`project_ids` reaches nothing, while `app/rollup` (spine:774) built from FR-33 gives them the
Tenant's aggregates — the spine's stated purpose is fixing invariants Post-Q1 must not break
(frontmatter `scope`). Round 1's F2 fix named this case; the adopted text dropped it.

**Fix (spec text).** spine:462: replace "For every other role" with "For a `pm` and a
`client_viewer` (R1)"; add "An `internal_viewer`'s reach (Post-Q1, FR-33: aggregates only) is
decided with that role, not by `project_ids`."

### G6 — medium — The maintenance purge as a bridge writer: wrong AD, no grant, and no rule for the users it orphans

**Evidence.** spine:455: "the owner-role seed, the probe Tenants and **AD-3's** maintenance purge
write it outside the application role". `purgeTenant` is AD-5's (spine:151) and NFR-D1's, not
AD-3's; AD-3 has no purge. `momo_maintenance` holds grants only on append-only tables
(`grants.sql:44-85`) and none on `tenant_membership` or the Better Auth tables, and AD-21's `global`
row (spine:420, writer column "`db/auth` (Better Auth), the seed; membership writes are `app` use
cases") names neither the probes nor the purge. NFR-D1 (prd.md:964) deletes "Tenant data": a user
whose only membership was the purged Tenant keeps `auth_user`/`account` rows (email, password hash)
with no Tenant — the purge author and the identity author will each assume the other deletes them.

**Fix (spec text).** spine:455: "…and `purgeTenant` (AD-5, NFR-D1) deletes a purged Tenant's rows
through the `maintenance` role, which AD-21 grants DELETE on `tenant_membership` for that purpose
alone; a user left with no membership keeps their identity rows unless the purge procedure deletes
them too — decided with the NFR-D1 procedure." AD-21 `global` row writer column: "`db/auth` (Better
Auth), the seed, the probe Tenants (test-only); membership writes are `app` use cases on the
application role; `purgeTenant` on the maintenance role".

### G7 — low — The last-admin rule silently depends on no user deletion; the spine does not say so

**Evidence.** Round 1's F4/R1 resolution answers "Better Auth user deletion is not a path the
product exposes (none is allowlisted)" — true on disk (`bindings.ts:15-19`, `auth.ts:99-104`) but
not written into the spine. The app role holds DELETE on `auth_user` (`grants.sql:15-16`) and the
bridge has no foreign key (`schema-membership.ts`, "No foreign keys"), so a later "delete my
account" story that obeys AD-23 (it goes through Better Auth, not a membership use case) leaves a
`tenant_admin` row that still counts toward the last-admin rule while nobody can sign in as it.

**Fix (spec text).** Add to spine:460: "No product path deletes a user; one that does must first
revoke each membership through the membership use cases, so the last-admin rule holds."

### G8 — low — "Runs at READ COMMITTED" is stated as a decision but is only Postgres's default

**Evidence.** spine:455 "the transaction runs at READ COMMITTED". Nothing in `packages/db` sets an
isolation level (grep for `isolationLevel`/`READ COMMITTED` finds none); `withTenant` inherits the
server default. A later change to `withTenant`'s isolation (or `default_transaction_isolation`) for
an unrelated reason turns the documented wait-and-re-read into serialization failures on every
concurrent membership write, and nothing fails.

**Fix (spec text).** spine:455: "the transaction runs at the default READ COMMITTED (nothing sets it;
raising `withTenant`'s isolation level is a change to this AD) …".

### G9 — low — The gate paragraph still omits two holes round 1 listed

**Evidence.** spine:455 names raw `UPDATE`/`INSERT INTO` text as review-held, but not the two other
holes F3 found and the gate still has: a second `pgTable('tenant_membership', …)` declaration
elsewhere passes (`source-discipline.test.ts:151-160` matches the symbol and the module name only),
and non-TypeScript sources are not scanned (`:146-149`).

**Fix (spec text).** spine:455: "raw `UPDATE`/`INSERT INTO` text, a second Drizzle declaration of the
table, SQL outside TypeScript, and 'only the membership use cases call the writer' … are held by
review."

### G10 — low — A job enqueued by a user runs after that user's revocation

**Evidence.** AD-23 **Prevents** "a revoked user whose next request still succeeds" and guards only
requests; AD-3 (spine:126) makes handlers re-verify their target row, not their actor. A worker job
carrying a PM's user id as its audit actor (an import confirmation, a publish, R1 client mail) runs
after that PM is revoked, and its audit row names someone with no membership. Two workers will
differ on whether to re-check.

**Fix (spec text).** Add to AD-23's worker sentence (spine:459): "A handler that acts for a user
named in its payload re-checks that user's membership in the payload's Tenant through the
membership modules, under `withTenant`, and drops the job when it is gone."

**Verdict.** Round 1's resolutions are true to the code on disk. The patch introduced one
contradiction with the PRD (G1). It left three gaps one level down where units obeying every AD
still diverge (G2 lock order, G3 system path, G4 user's Tenants) and two wrong or incomplete
statements (G5, G6). The rest are low. The amendment needs G1–G6 before it lands.

## Round 2 — resolution

Resolved 2026-09-21:

| Finding | Resolution |
|---|---|
| G1 PM inviters vs permanent `tenant_admin` re-check | The re-check is of "the role that use case requires"; who may invite follows FR-2 |
| G2 cross-table lock order | Membership locks before any other row lock; `assignMemberProject` named |
| G3 system path reading the bridge | The bridge is off the system path; a job reads it only inside `withTenant`, through the membership modules |
| G4 a user's own Tenants | Named as Tenant resolution, `membershipsOf`'s (several-memberships refusal, R1 switcher) |
| G5 Internal Viewer reach | `project_ids` are the reach of a PM or Client Viewer; an Internal Viewer's is FR-33's |
| G6 purge attribution and grant | The purge is AD-5's and must remove the Tenant's memberships and decide users left with none (Epic 8) |
| G7 user deletion | Stated: no product path deletes a user; one that does must apply the last-admin rule |
| G8 READ COMMITTED | Stated as PostgreSQL's default, nothing overrides it, a change must revisit |
| G9 more review-held holes | A second Drizzle declaration and SQL outside TypeScript added |
| G10 queued work of a revoked user | New AD-23 bullet: a job acting for a user re-checks membership and role under `withTenant` when it runs |

Two rounds were budgeted and run; the amendment lands with these fixes.
