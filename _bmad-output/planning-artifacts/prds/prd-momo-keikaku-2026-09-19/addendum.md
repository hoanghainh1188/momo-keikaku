# PRD Addendum: momo-keikaku

This addendum collects material that supports the PRD but belongs downstream: technical approach for architecture, design notes for UX, and next-wave design detail. The PRD (`prd.md`) is the source of truth for scope and requirements.

## A. Architecture Notes

### A.1 Commitments that cannot be retrofitted (from the brief)
- A multi-tenant data model: Tenant > Department > Program > Project > Work Package.
- Resources have a home Department and work across Projects. Cost rolls up on both the Project axis and the Department axis.
- The Baseline Ledger and the Actuals Ledger are separate stores. Both are append-only.
- **Planned dates are derived from pinned scheduling inputs and are owned by the scheduler.** No other module writes a WP's derived start or finish — not the importer, not the re-importer, not a Disposition, not the Mapping layer, not the snapshot service (PRD FR-6b, FR-9, FR-11, FR-29, FR-21, FR-22). **Actual dates are separate**: they are inputs with exactly two writers, the PM and a PM-confirmed import or re-import (PRD FR-5, FR-9, FR-11). Nothing derived from Tracker evidence — including the Observed Percent Complete — is ever a scheduling input (PRD FR-6b).
- **Actual dates are inputs with exactly two writers: the PM and the confirmed Excel import** (PRD FR-5, FR-9). Ledger activity is surfaced as *first observed activity* — a display-only proposal — and is never persisted as an actual date. This is what keeps the hourly snapshot pipeline out of the schedule entirely, so no background job can re-date a plan.
- A Baseline pins the inputs, the actual dates and Percent Complete in force, the Holiday Calendar version and the Data Date, not only the dates it produced (PRD FR-15).

### A.2 Snapshot service
- **Always-on polling.** The snapshot service must run continuously, because Backlog has no worklog API and only one `actualHours` value per issue. The Actuals Ledger therefore has to be built from time-series deltas (research R3).
- **Hours detection.** Today Backlog exposes hours only on the Standard plan and above. The 2027-01-01 plans (Economy, Business, Professional) replace Standard, and it is unverified which of them expose hours. Detect hours from the data (is the field present and populated?), never from the plan name, and switch to Ticket-Count Mode when hours are unavailable (PRD FR-17).
- **Rate limits.** Rate limits for Backlog and Jira Cloud must be sized for about 5 Projects × 2,000 Tickets at an hourly interval. Consider incremental reads (only Tickets updated since the last Tracker Snapshot) plus a periodic full reconciliation read, so that deleted or moved Tickets are also caught.
- **Ticket identity.** Identify each Ticket by the Tracker's internal `id`, not its key. Deduplicate Tickets within a Tenant: one Connector owns each Ticket.
- **Opening Balance.** Hours a Ticket already has in the Connector's first Tracker Snapshot, or when the PM widens the Connector's scope, become an Opening Balance entry. Any other first sighting is a normal delta (PRD FR-42).
- **Attribution.**
  - Attribute hours to WPs at query time, from the append-only Actuals Ledger and the Mapping history (PRD FR-21).
  - Each delta goes to the assignee as of the later Tracker Snapshot. The whole delta belongs to the Reporting Period that contains the later Tracker Snapshot's timestamp (PRD FR-25).
  - Spreading a delta across the window between the two Tracker Snapshots is used only for the approximate person-level and day-level displays, and the UI must say those displays are approximate (PRD FR-26).
- **Reproducibility.** Each Published Snapshot stores its computed values together with the input references it was computed from, so it can be reproduced (PRD FR-35).
- **Jira (Post-Q1).**
  - Use OAuth 2.0 (3LO) with read-only scopes.
  - Read each issue's own `timespent`, not `aggregatetimespent`, and treat it like Backlog `actualHours`, so one ledger model serves both Trackers.
  - Attributing hours per worklog is a later refinement.

### A.3 Excel import
- **R0 is deterministic.** The PM maps columns with header-based suggestions in both languages, the hierarchy comes from WBS codes or indentation, merged cells are unmerged, and dates are parsed in common Western and Japanese formats. No AI is involved.
- **Acceptance corpus.** Build a test corpus from at least 10 of the founder's real WBS files (PRD FR-9). The corpus must include mid-flight files carrying actual dates and a percent-complete column, because progress import is what makes the Data Date work on day one (PRD FR-9, FR-10).
- **Progress columns.** Actual start, actual finish and percent complete are imported fields like any other: suggested by header, shown in the preview, confirmed by the PM. Actual dates are written to the WP; percent complete is written as an audited Percent Complete override (PRD FR-30). A milestone row is the single case where an imported date becomes a constraint — duration 0 plus a *must finish on* — and the preview lists every one it created.
- **Post-Q1 adds AI interpretation (PRD FR-41).** It runs server-side. The pipeline: detect tables, classify columns, infer hierarchy (indentation, WBS codes, merged cells), normalise dates (Western calendar, Japanese era dates such as 令和, and 月日 formats), match assignees to Resources, then build the preview.
  - Produce a confidence score per cell and per row to drive the highlighting in the preview.
  - No commit happens without PM confirmation. There is no auto-apply path.
  - The provider must not train on customer data and must offer a data location compatible with Japan residency (PRD OQ-5).

### A.4 Security and procurement
- Host in a Japan region, including backups.
- Prepare a pre-filled Japanese security check sheet (セキュリティチェックシート) answer document before inviting the first client.

### A.5 Scheduling engine

- **One write path.** `domain/schedule.recalculate(project)` owns every write to a WP's start and finish, and a test greps for assignments outside it (sprint change proposal A-3).
- **Progress awareness.** The forward pass reads each leaf WP's actual start, actual finish and Percent Complete alongside its duration, plus the Project's Data Date, and schedules only remaining work (PRD FR-6b, FR-43). Remaining duration is `duration × (1 − Percent Complete)`, rounded up and clamped to ≥ 1 working day; it is *derived*, never stored, so it cannot drift from the inputs it is computed from.
- **Recalculation triggers are a closed set** (PRD FR-6b). Actual-date and Percent-Complete changes are in it; Tracker Snapshots, ledger writes, Mappings and background rule evaluation are deliberately not. The snapshot pipeline therefore causes no schedule writes and no write amplification, and NFR-P1's 300 ms budget covers interactive edits only. Enforce this the same way as the single write path: a test that no snapshot or mapping code path reaches `schedule.recalculate`.
- **Project-level inputs.** `project` gains a start, an optional finish and a data date (PRD FR-43). The backward pass anchors on the Project finish or, where none is set, the computed finish — and on nothing else; constraints are never anchors (PRD FR-6b). The origin used must be recorded with the result, because Float means different things under the two. An unmet *must finish on* is recorded as a violation row against its own WP, with the days late and the driving chain, and must not be modelled as negative Float on that WP or upstream of it.
- **Tie-break.** The ordering rule for equally valid choices in the passes is an architecture deliverable, not an assumption (PRD NFR-C1, OQ-13). FR-15's re-derivation test and FR-35's reproduction test compare the critical path exactly, so write the rule down and assert against it.
- **Migration.** `packages/db/src/schema.ts` currently has no duration, dependency, constraint, actual-start, Percent-Complete, Project start/finish or Data Date column; `baseline_wp` stores outputs only; and `work_package.start`/`.finish` are nullable and writable by anything. Migrations are pre-production (PRD §13), so this is cost to size rather than risk to manage — but the one-write-path rule above has to be enforced against the schema, not only against the code.
- **Pinning.** `baseline_wp` must store scheduling inputs and the actual dates in force, and the Baseline must reference the dependency-graph state and the Holiday Calendar version it was taken against (PRD FR-15). Storing outputs only is the doctrine breach this change exists to close. Published Snapshots pin the same set (PRD FR-35).
- **Calendar versioning.** The Holiday Calendar gains a dated, append-only history like Rates (PRD FR-14), and every schedule is re-derived against the version pinned with it.
- **Leaf-only graph.** Dependencies and constraints attach to leaf WPs only, and links between ancestors and descendants are rejected at entry — a check the cycle detector cannot cover, because it is a cycle only once roll-up edges are considered (PRD FR-6a).
- **Recalculation is whole-Project and serialised per Project** (PRD FR-6b), inside NFR-P1's 300 ms p95 budget for 500 WPs. The write amplification of restamping up to 500 date rows per edit is an architecture concern to size, not a requirement to renegotiate.

## B. UX Notes (from brief Addendum E and research)

- **Practice facts.**
  - Directors default to demanding overtime.
  - A fixed delivery date is the constraint that rules out the other options, which is why the Schedule-constrained EAC method exists (Post-Q1).
  - Tool switches stall on data migration, user training, and custom fields that cannot match the real process. The PM's onboarding must therefore be a single session: import, connect, map. The offshore team needs no training, and a Client Viewer needs no instructions. This is also why the Import Preview quality and unlimited Custom Fields matter.
- **Report pages to mirror.** Upward reports are mostly Excel and PowerPoint. The most painful pages are ahead/behind, cost, forecast, and risk, so the Reconciliation Review and the Client View should mirror those four pages.
- **Drill-down.** Clients accept probabilistic forecasts but want to see which work makes up the number. In PM views, every metric should drill down to its Tickets and WPs. Client drill-down stops at WPs, because the Client View never shows Ticket content (PRD FR-34).
- **Unplanned Work framing.** Show Unplanned Work as information about how accurate the plan is, never as a judgement of people. Avoid person-level red flags.
- **Client View language.**
  - The Client View shows effort (工数) only, never money. Its wording should read naturally to a Japanese client-side PM.
  - The client-facing Japanese wording for Unplanned Work needs care. The draft label is 計画外作業 ("unplanned work"). Validate it with a real client and avoid wording that sounds like blame.
- **Template binding.** The xlsx template binding flow (PRD FR-38) needs its own UX design.
- ~~**The plan surface is the open design problem.**~~ **Designed and costed 2026-09-20; PRD OQ-11 is closed.** `EXPERIENCE.md` now specifies the whole surface — the predecessor and constraint cells, the Float and critical-path columns, the schedule strip, the What-moved band, the exceptions rail and its three explainers — and tiers every element Core or Comfort. Sizing followed: **engine 92 h, plan surface 98 h**, a ratio of 1.07 (PRD OQ-11, OQ-12). *The passage below is retained as the brief `bmad-ux` was actually given.*

  At the time of writing, `DESIGN.md` and `EXPERIENCE.md` mentioned dependencies nowhere, and the PRD declined to invent the design (PRD OQ-11). **R0 has one surface: the tree grid** (PRD FR-7). The Gantt is R1, and the build-versus-buy question for a Gantt component goes with it, so UX designs one surface rather than two. What the PRD hands to `bmad-ux`: dependency and constraint editing in the tree grid; rejection feedback that names the cycle or the ancestor/descendant pair; constraint-violation explanation for three constraint types, with days late and the driving chain; out-of-sequence links; negative Float; the Data Date as the boundary between done and remaining; Baseline comparison as columns rather than bars; and what the PM sees when one edit moves a hundred dates. All of it under NFR-U1's keyboard-access bar.
- **Designing that surface is not a scope addition** (PRD §7.3). Resolving an open question R0 already owns is the owner's job; adding a requirement no FR states is what needs a correct-course pass. `bmad-ux` states which of the two its output is, in one line, at the top.

## C. Next-Wave Design Detail (from brief Addendum D, not v1)

- **Scheduling — partly pulled into R0 on 2026-09-20.** Dependency-driven recalculation is now FR-6a and FR-6b in R0: finish-to-start links, forward and backward pass, Float (which may be negative against a PM-set Project finish), the critical path as the minimum-Float chain to the finish the backward pass anchored on, and JP/VN working-day arithmetic. The same day's adversarial review added progress-aware scheduling with a Data Date (FR-43) and calendar versioning (FR-14), because every target project is mid-flight. What remains next-wave is **effort-driven** recalculation (duration derived from effort ÷ assignment), the SS/FF/SF link types with lead, cross-project scheduling, and constraint types beyond ASAP / must-start-on / must-finish-on. Hard deadline constraints for fixed-date contracts are served by must-finish-on in R0, which reports a violation on its own WP — the days late and the chain that drove it — without pushing negative Float across the Project; **the recovery behaviour when one is violated — crash, fast-track, re-plan — is still next-wave** and belongs with the recovery options below.
- **What-if sandbox:** changes only the current schedule and never the Baseline. Every reallocation is logged with a reason.
- **Load statement:** a person × week heatmap of planned load against real load, including Unplanned Work (for example, "80% on plan, 130% real").
- **Probabilistic forecast:** built from Baseline slip history, for example, "70% by 15/03". A drivers block shows the certain share, the top slipping items, and Unplanned Work by team. On fixed-date contracts, it also shows the probability of hitting the date.
- **Recovery options:** crash, fast-track, borrow from the shared pool, or cut scope. Each option shows the new date, the extra cost, and flags. It includes the 36-kyotei overtime check (45h/month, 360h/year).
- **Layered calendars:** national (JP + VN) > client company > department > person. Warn when the VN team is off for Tết during a JP deadline run-up.
- **Portfolio health one-pager:** computed traffic lights.
- **No lock-in:** full export to Excel or .mpp at any time.
- **Connectors:** Redmine, then Asana (R4).
- **.mpp import:** opportunistic.
- **Custom Fields mappable to Tracker fields:** a Custom Field can be filled from a Tracker attribute.
- **Lead magnet (GTM):** a free Japanese-language export and migration guide.

## D. Rejected or Overridden Alternatives

- **The research R2 beachhead (.mpp/XML import + Backlog).** Overridden by the brief's locked beachhead (Excel WBS + Backlog). Reason: most of the founder's clients use Excel WBS + Backlog, and enterprise PMOs migrating off Project Online are already served by SRI Project+, Flagxs, and Planner Premium. Confirmed by the user on 2026-09-19.
- **Project Online as the beachhead market (facts behind the override, from the brief).** The 2026-09-30 retirement does not affect Project desktop or local .mpp files. Only PWA, timesheets, OData, and desktop sync to Project Online stop working. SRI Project+ offers hosted Project Server for about ¥100k–200k per month, supported until 2031. Flagxs ran a migration campaign (30% off) until 2026-10-31. This is why .mpp import stays opportunistic and messaging must not overclaim a Project Online exodus.
- **Cross-platform desktop** (from the earlier one-pager). Replaced by web/cloud-first. Three reasons: always-on Tracker Snapshots, clients reading Published Snapshots on the web, and server-side AI import.
- **"Planner charges every member" as a pitch.** False. A user with a plain M365 licence can view the plan and make basic edits; only premium fields need Plan 1 or Plan 3. Do not use it in positioning.
- **Percent Complete derived from burned effort** (EV = min(actual/planned, 1) × BAC), and the variant burn / (burn + remaining). Both were rejected on 2026-09-19. Under the first, EV ≈ AC, so CPI is always about 1 and cost overruns can never show. The second has the same problem whenever the Backlog single estimate field is not re-estimated. The founder's intent, "compute by effort burned", is kept as effort-based EVM (工数): AC = hours burned from the Actuals Ledger, PV and EV in Baseline hours, money as a derived layer.
- **Money in the Client View.** Rejected on 2026-09-19. When money is shown next to hours, the client can divide one by the other and derive the vendor's blended internal cost rate, and from that its margin. Cost rates are also the wrong figure for 準委任 billing. Client Views therefore show effort (工数) only. Bill rates and a client money layer are deferred to Post-Q1.
- **One v1 release that includes AI import, Jira, and roll-ups.** Replaced on 2026-09-19 by the R0/R1 split. The adversarial review estimated about 18 weeks of solo work before production use had to start in order to meet SM-1 and SM-2. The split proves the wedge on the founder's projects first. AI import is deferred, which also removes the question of sending client-confidential WBS files to a third-party model from v1.
