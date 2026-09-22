# Adversarial review: AD-12 / AD-23 roles amendment (story 1.5 ratification)

- **Target:** uncommitted diff on `docs/spine-ad23-roles-landed` — `ARCHITECTURE-SPINE.md` AD-12 (three new bullets: declared-roles helper, role gate, "a project-scoped call's other ids belong to its Project") and AD-23 (retires "until story 1.5 … check `tenant_admin` themselves"); one line of `epic-1-context.md`; one note in `deferred-work.md`; `.memlog.md` tail.
- **Source checked:** merged story 1.5 (PR #37, `3a2a1f5`): `packages/app/src/authz/authorize.ts`, `use-cases/role-declarations.ts`, `org-writes.ts`, `membership-writes.ts`, `project-input.ts`, `project-write-input.ts`, `audited-write.ts`, `index.ts`, `tests/role-declarations.test.ts`, `project-reads.test.ts`, `project-writes.test.ts`, the story 1.5 spec; epics.md stories 1.5–1.7; PRD FR-2, FR-42.
- **Method:** (1) every factual claim checked against the code; (2) construction attack — two units one level down that obey every AD word and still diverge; (3) contradiction sweep across AD-1, AD-14, AD-23, AD-25, Consistency Conventions (Errors), the capability map, Deferred and Open Questions.
- **Verdict:** **Not ready.** The ratified facts are accurate, but the amendment presents the role gate as stronger than it is (it never checks Project reach), and its "one helper, no second shape" rule cannot express two roles the PRD already requires in the next stories (PM Rate visibility, PM invitation); the new ownership rule also answers differently from AD-25 and the org writes for the same kind of mismatch. Two HIGH, four MEDIUM, five LOW.

## Factual check (what is true)

- `authorize(ctx, { roles, projectId? })` and `reachesProject` exist as described; `tenant_admin` always reaches; a non-admin reaches only `ctx.projectIds`; refusal is `not_found`. True.
- Order of checks: org and membership runners call `authorize` with `TENANT_ADMIN_ROLES` before `runAuditedWrite` parses; `runProjectRead` checks roles, parses, checks reach, then loads; `runProjectWrite` checks roles, then `runAuditedWrite` parses and runs `plan.authorize` (reach) before opening the transaction. True.
- `USE_CASE_ROLES` covers every export of `use-cases/index.ts`, pinned by an inline snapshot; the test checks undeclared/stale entries, calls every export as each viewer role and every non-`pm` export as a PM, with throwing deps and `{}` input, requiring `not_found` and no deps touched. True.
- Viewer roles are in `ROLES`, not in `ASSIGNABLE_ROLES`, and no declaration lists them. True.
- AD-23: membership runner's pre-parse check is now `authorize`; `lockCallerAndTarget` still re-checks the caller's locked row. True.

## Findings

### F1 — HIGH — The role gate does not check Project reach, yet the spine and memlog read as if it did

The gate snapshots `projectScoped`, but nothing reads it. The viewer loop and the PM loop both refuse on **role**; neither calls a `pm`-declared export with a PM who lacks the Project. A new `projectScoped: true` runner that forgets the reach check (or calls `authorize` without `projectId`) passes CI. Reach is covered only by hand-listed `CASES` in `project-reads.test.ts` / `project-writes.test.ts`, which a new module (story 1.6, AD-25's `applyPlanChange`) does not join automatically. The gate also proves "refuses before deps", not "calls `authorize`". The memlog's "Prevents a table entry that no runner enforces" is therefore overstated for every `pm`-declared entry, which is exactly the FR-2 case ("only that Project's PMs").
**Fix:** Add a third loop to the gate — every `projectScoped: true` export called as a `pm` whose `projectIds` omit the Project, with well-formed input and throwing deps, must answer `not_found` with no deps touched — and until it lands, say in AD-12 that the gate proves role refusal only and reach is held by per-module tests.

### F2 — HIGH — PM Rate visibility (story 1.6, FR-2) cannot be expressed by the helper without a "second shape" the amendment forbids

FR-2 and story 1.6: Rates are visible "only to Tenant Admins and to the PMs of the Projects that use them". That reach is data-dependent (Rate → Projects that use it), not a single `projectId`. Construction:
- **Unit A** exposes Rates only through a project-scoped read (`projectId` reached via the helper; the repository returns the Rates that Project uses). Obeys every word.
- **Unit B** exposes a tenant-scoped Rate list declared `tenant_admin | pm`, and the repository filters by `ctx.projectIds` or by a join to Projects the caller reaches. It also obeys the words (no *role* test in the repository — it is a reach filter) but is a second authorisation shape. And a `pm` asking for a Rate id directly gets a row or `not_found` depending on repository logic the gate never sees.

The two units disclose different sets to the same PM. The ownership rule does not help: a Rate (and a Resource) is Tenant-wide and used by many Projects, so it is not "owned by a Project", and the rule is silent. Separately, the epic-context line "1.6 applies this to Project default Rates" is nearly empty: a Project default Rate write is `tenant_admin`-only and keyed by the call's own `projectId`.
**Fix:** State in AD-12 that a Tenant-wide object read by a non-admin is reached **only through a project-scoped call** (Unit A), and that the repository scopes such reads to the reached Project. Otherwise name a second, declared reach kind (for example `reach: 'via-project-use'`) in the helper and the snapshot.

### F3 — MEDIUM — "Role before parse" cannot express a role that depends on the input (FR-2 invitation)

FR-2: a Tenant Admin invites PMs, Internal Viewers or Client Viewers; a PM invites Client Viewers **only to their own Projects**, and only at domains allowed for that Project. Before parse, the runner can only check the union `tenant_admin | pm`. The rule "a `pm` may grant only `client_viewer`, only on reached Projects" needs the parsed input, so it is a post-parse role test. That is either a second authorisation shape (forbidden) or nowhere. The gate's PM loop skips every export declared for `pm`, so a PM inviting a PM, or inviting to an unreached Project, is invisible to CI. Also, `projectId?` is one id, while an invitation may name several Projects, and `projectScoped: boolean` cannot say "project-scoped only when the invited role is `client_viewer`". Two conforming units: split `invitePm` (admin) and `inviteClientViewer` (admin | pm, project-scoped), versus one `invite` with an in-body role test. They diverge in what the gate protects.
**Fix:** Add to AD-12: when the required role depends on the input, the use case is split so that each export has one fixed role set and at most one reached Project per call (a multi-Project action is one call per Project, or the helper takes `projectIds` and requires all of them).

### F4 — MEDIUM — The ownership rule gives a different answer from AD-25 and the org writes for the same mismatch

The new rule says any mismatch answers `not_found`, checked by the repository. But:
- **AD-25 / FR-6a:** a dependency edge across Projects is rejected by `domain/schedule/validate` ("cross-project links" as a named offence) and by composite `MATCH FULL` foreign keys. A key violation is an exception, which `runAuditedWrite` rethrows (not `not_found`), and a named cross-project error discloses that B's WP exists to a PM who only reaches A.
- **Org writes (story 1.3):** "a Program that does not belong to the Project's owning Department" answers `invalid_input`.

So a WP-from-another-Project id can yield `not_found`, `invalid_input` with a named offender, or a 500, depending on which AD the implementer reads first. The rule also applies to a `tenant_admin` who reaches both Projects, for whom `not_found` is a rule break, not an authorisation failure (Errors row: "Authorisation failures surface as `not_found`").
**Fix:** State the precedence in AD-12: the ownership check runs before any validation that could name the foreign object, and answers `not_found` whatever the caller's reach. Amend AD-25's "cross-project links" to be reported only for ids that passed that check (in R0 there are none). Leave the org writes' `invalid_input` as the Tenant-scoped exception, and say so.

### F5 — MEDIUM — The gate is pinned to one file, but the spine places use cases in other modules

The gate enumerates `packages/app/src/use-cases/index.ts` only. AD-12 itself puts R1 Client Viewer use cases in `packages/app/client-view`. The capability map and AD-25 name `app/schedule.applyPlanChange`, `app/resources`, `app/plan`, `app/export`, `app/calendar`. Either they are all re-exported from that one index, or they escape the gate. And R1 client-view use cases **cannot** pass the gate as written, which requires every export to refuse a `client_viewer`.
**Fix:** Say in AD-12 that every `app` use case of any module is re-exported from the one surface the gate enumerates (or name the enumerated set as a list of modules). Also say that the viewer loop becomes "every export not declared for that viewer role", matching the PM loop, when R1 adds the first viewer declaration.

### F6 — MEDIUM — A worker job acting for a user re-checks membership and role, not Project reach, and has no `RequestContext`

AD-23 (unchanged): "A job acting for a user … re-checks that user's membership and role under `withTenant`". A PM removed from Project A but still a Tenant member keeps their queued export of A. The epic-context line now says "every later use case … calls `authorize`", but `authorize` takes a `RequestContext`, and the spine never says how a job builds one, or that it rebuilds `projectIds` from the bridge when it runs.
**Fix:** Amend AD-23's job sentence to "re-checks membership, role and Project reach by rebuilding the context from the bridge under `withTenant` and calling `authorize` with the job's `projectId`".

### F7 — LOW — The staleness window for Project reach is decided but not written

AD-23 keeps a locked-row re-check for membership writes *because* the context is resolved once per server action. Project writes check reach only from that context. The story 1.5 spec accepts the window (Design Notes), but the spine does not. A PM unassigned mid-action still completes that one write.
**Fix:** Add one sentence to the helper bullet: reach is checked from the context only; a Project write in flight when the PM is unassigned may commit; only membership writes re-check against the locked row.

### F8 — LOW — "No role test inside a repository" and "repository checks ownership, answers `not_found`" read as a second shape

"There is no second authorisation shape" sits beside a repository check that refuses with `not_found`. They are compatible (ownership is not a role), but a reader can take either sentence as overriding the other. And the mechanism is unstated: `runAuditedWrite` maps a thrown error to `not_found` only through `isNotFound`, which today matches the Project's own "not found" message; `refuse` is a use-case helper.
**Fix:** Reword to "no role or reach test inside a repository; an ownership check is a data check, not authorisation". Say how a repository mismatch reaches `not_found`: a typed not-found error that `isNotFound` recognises, or a boolean the work turns into `refuse('not_found')`.

### F9 — LOW — Ticket ownership is derived and can move, and an empty `wpId` is an unmap

`ticket.project_id` is derived from the owning Connector (AD-7), and FR-42 lets scope change and ownership conflicts arise. The rule does not say whether ownership is checked at write time against the current owner, or what happens to a Review that dispositions a "left scope" Ticket now owned elsewhere. `mapTicket` accepts `wpId: ''` as an unmap, which names no WP.
**Fix:** Say "checked at write time against the current owner; an absent or empty id names nothing", and defer the moved-owner case to Epic 5's amendment in so many words.

### F10 — LOW — Tenant-scoped reads are not covered by the order rule

The helper bullet orders checks for "Tenant-scoped writes" and "project-scoped use cases". Story 1.7's audit-log reader is a Tenant-scoped read, and the text is silent on it.
**Fix:** Change "Tenant-scoped writes" to "Tenant-scoped use cases".

### F11 — LOW — The owed `wpId` check has no owner

`deferred-work.md` says "the `wpId` half is owed now" and the spine says "Code owed (`deferred-work.md`)", but no story or gate carries it. Append-only junk rows keep accruing until someone picks it up.
**Fix:** Name the story or patch that lands the `wpId` check (for example a 1.5 follow-up, or story 1.6's first slice), and add it to `sprint-status.yaml`, or list it under the spine's Deferred with a trigger.

## Constructions that yielded nothing

- **Story 1.6 Resource creation** (`tenant_admin | pm`, no Project): it is an `adminOnly`-shaped declaration with a wider role set. The helper and snapshot express it, as the spine's own example says.
- **Story 1.6 Rate and Project default Rate writes** (`tenant_admin` only): expressible as `adminOnly`, and the gate's PM loop covers them.
- **Story 1.7 audit-log reader** (`tenant_admin` only): expressible. Rows that name Projects are fine because a `tenant_admin` reaches every Project, so no ownership or reach check applies.
- **AD-14:** refusals happen before the transaction, so there is no audit row; an ownership mismatch inside the transaction rolls back with its audit record. No conflict.
- **AD-23 retirement:** accurate. The permanent locked-row re-check is kept in the text and in `lockCallerAndTarget`.
- **AD-1:** `authorize` lives in `packages/app/authz` and is called only from `app` runners; the UI does not import it. No fence issue.
- **Errors row:** role and reach refusals are `not_found`, which matches. The only conflict is F4's ownership case.
