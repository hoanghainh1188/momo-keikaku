# PRD Addendum: momo-keikaku

This addendum collects material that supports the PRD but belongs downstream: technical approach for architecture, design notes for UX, and next-wave design detail. The PRD (`prd.md`) is the source of truth for scope and requirements.

## A. Architecture Notes

### A.1 Commitments that cannot be retrofitted (from the brief)
- A multi-tenant data model: Tenant > Department > Program > Project > Work Package.
- Resources have a home Department and work across Projects. Cost rolls up on both the Project axis and the Department axis.
- The Baseline Ledger and the Actuals Ledger are separate stores. Both are append-only.

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
- **Acceptance corpus.** Build a test corpus from at least 10 of the founder's real WBS files (PRD FR-9).
- **Post-Q1 adds AI interpretation (PRD FR-41).** It runs server-side. The pipeline: detect tables, classify columns, infer hierarchy (indentation, WBS codes, merged cells), normalise dates (Western calendar, Japanese era dates such as 令和, and 月日 formats), match assignees to Resources, then build the preview.
  - Produce a confidence score per cell and per row to drive the highlighting in the preview.
  - No commit happens without PM confirmation. There is no auto-apply path.
  - The provider must not train on customer data and must offer a data location compatible with Japan residency (PRD OQ-5).

### A.4 Security and procurement
- Host in a Japan region, including backups.
- Prepare a pre-filled Japanese security check sheet (セキュリティチェックシート) answer document before inviting the first client.

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

## C. Next-Wave Design Detail (from brief Addendum D, not v1)

- **Scheduling:** dependency-driven, effort-driven recalculation, with hard deadline constraints for fixed-date contracts.
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
