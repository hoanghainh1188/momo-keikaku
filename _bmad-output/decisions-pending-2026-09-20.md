# Open decisions awaiting the founder — 2026-09-20

Every open question across the PRD, the architecture spine, the UX spines and the overnight research, with a recommendation. Fill in the **Answer** column, or answer the interactive prompts in the session; both end up in the same place.

Legend for **Blocks**: what cannot move until this is answered.

## A. Architecture — raised by the reviewer gate (5)

| # | Question | Options | Recommendation | Why | Blocks | Answer |
|---|---|---|---|---|---|---|
| A1 | Health threshold scope | (a) per Tenant only, as FR-31 says · (b) Tenant defaults + per-Project override | **(a) per Tenant only in R0** | One founder, five projects. Per-Project overrides add a settings surface and a pinned event per Project, and they let a project be quietly graded on an easier curve. | Nothing in R0; changes `tenant_setting_event` if (b) | |
| A2 | Retroactive Rate corrections | (a) append adjusting entries, as FR-12 says · (b) keep the ledger untouched and recompute against a pinned `rate_seq_max`, as the spine does | **(b), and amend FR-12's wording** | (b) keeps one rule — everything is derived from pinned inputs — and still reproduces old Published Snapshots exactly. (a) means two mechanisms for the same job. | Ledger/costing implementation | |
| A3 | Measurement basis flip (hours ↔ Ticket-Count Mode) | (a) auto-latch after 3 agreeing snapshots, both directions · (b) auto-latch into count mode, PM confirms the return to hours | **(a) in R0** | (b) needs a new PM screen for a case that should happen once per Connector. A banner plus the audit entry is enough while the founder is the only user. Revisit at R1. | A new screen if (b) | |
| A4 | "Pinned Unmapped" as a PM action | (a) R0 has `release` only — unmapping hands the Ticket back to the rules · (b) also expose "keep this Unmapped" | **(a) in R0** | Two ways to unmap is a concept the founder would have to explain to every later user. Add (b) when a real Ticket needs it. | Mapping UI | |
| A5 | Tenant deletion (`purgeTenant`) | (a) R1, as the spine has it · (b) R0 | **(b) R0** | NFR-D1 and NFR-S6 promise deletion within 30 days from the moment client data exists, and the security check sheet asks about it. A documented script is enough; it does not need a UI. | The security check sheet answer, and the first client | |

## B. UX

| # | Question | Options | Recommendation | Why | Blocks | Answer |
|---|---|---|---|---|---|---|
| B1 | Department view in the project sidebar | (a) keep it out, reached from Home · (b) put it in the sidebar | **(a)** | It is cross-project, by Department. A project sidebar is the wrong parent. | Post-Q1 only | |
| B2 | Print / A4 landscape stylesheet for Review and Client View | (a) keep, as specified · (b) drop from R0 | **(a) keep** | Upward reporting is still document-based, and it is cheap CSS. | Nothing | |
| B3 | PM editing below 1024px | (a) unsupported, read-only with a notice · (b) support it | **(a)** | The Review and Gantt need width. Phone support is a Post-Q1 question. | Nothing | |

## C. PRD open questions

| # | Question | Status after the overnight research | Recommendation | Blocks | Answer |
|---|---|---|---|---|---|
| OQ-1 | Crowd Log / Lychee Redmine | **Largely answered.** Crowd Log has no Backlog or Jira connector; hours are typed into its own timesheet; since 2025-11 it compares planned vs actual on the Gantt but shows nothing outside the plan. Lychee's EVM reads Redmine only, but it does have real baselines. | Close OQ-1, keep both on the quarterly watch | Public positioning | |
| OQ-2 | Do the five target Backlog spaces expose actual hours? | **Only you can answer.** Public part done: the 2027 plans (Economy/Business/Professional) have no hours row in Nulab's matrix, API is on all paid plans, and hours probably survive on all of them — but Nulab does not say so. | Check the 5 spaces this week. Design already handles both answers. | Architecture sign-off | |
| OQ-3 | First client and Contract Type for showing Unplanned Work | Unanswered — your call | Pick a 準委任/labo client first: a billing conversation is easier to recover from than a 請負 scope dispute | First publish (R1) | |
| OQ-4 | Pricing: seat price and free-tier limits | Unanswered | Defer until after the first external PM uses it; R0/R1 have no billing | Nothing before R1 | |
| OQ-5 | AI provider and data terms for Excel import | Moot for now — AI import is Post-Q1 | Park it | Post-Q1 | |
| OQ-6 | Reporting cadence: weekly only? | Unanswered — you know your clients | If any client reports biweekly or monthly, say so now: Reporting Period boundaries are baked into the ledger queries | Period handling in R0 | |
| OQ-7 | Competitive watch | **Partly answered.** Tempo still has no out-of-scope worklog report (its nearest feature is the "No Account" row). Jira Plans still has no baselines (suggestion open, 323 votes). BigPicture's baselines by edition are now unverified after the Aug-2026 Standard/Advanced change. Swarmia is the rising threat: FTE cost in currency since 2026-06 and a Planned/Unplanned breakdown — one "planned FTE" field away from the wedge. | Put a calendar reminder: re-check 2026-12-01, then after 2027-01-01, then quarterly. Owner: you. | Positioning | |
| OQ-8 | Client sign-in: magic link vs Microsoft-only | Unanswered — depends on your clients' IT | Ask the OQ-3 client when you pick them | R1 | |
| OQ-9 | Market movement | **Partly answered.** VN offshore postings name Redmine, Jira and Backlog together (tiny sample). No public tracker-share data. Backlog leavers are hesitating rather than moving; Redmine is the most-named destination, Jira mostly appears in listicles. | Consider whether Redmine should come before Jira after R0 — the research supports R4 | Connector order after R0 | |
| OQ-10 | Your build capacity | Unanswered | Give me hours per week and any hard dates; R0 is scoped at 2026-12-15 with no estimate behind it yet | Sprint planning | |

## D. Process decisions

| # | Question | Recommendation | Answer |
|---|---|---|---|
| D1 | Branch `feat/r0-demo`: merge to main after the demo, or keep separate? | Merge the planning artifacts (research, UX, architecture) to main once you have reviewed them; keep the demo code on the branch until it is more than a demo | |
| D2 | The 30 UX assumptions and the architecture `[ASSUMPTION]` tags | Review them after seeing the demo; I will list the ones the demo actually exercises | |
| D3 | Demo scope: stop at the Review + Mapping slice, or keep building toward R0? | Stop after the slice, look at it, then re-plan R0 with real estimates (OQ-10) | |

## Answers recorded 2026-09-20

- A1: Tenant defaults **plus per-Project override** (founder chose flexibility over the recommendation; PRD FR-31 updated, spine needs a project_setting_event).
- A2: recompute against pinned Rate history. PRD FR-12 amended.
- A3: automatic flip both ways, no new screen.
- A5: Tenant deletion path ships in R0. NFR-D1 amended.
- OQ-3: 準委任/labo client first. Which client is still open.
- OQ-6: Reporting Period length is per Project. Glossary amended, OQ-6 closed.
- D1: merge planning artifacts to main after review; demo code stays on the branch.
- D3: stop after the demo slice, then re-plan R0 with real estimates.
- Connector order after R0: **Jira stays first**, Redmine after (founder overrode the research lean toward Redmine; revisit after 2027-01-01 when real Backlog churn is visible).
- OQ-2 does not block architecture: the founder checks the 5 Backlog spaces this week; both modes stay supported.
- A4: release-only in R0, no "pinned Unmapped".
- OQ-10: **more than 20 h/week** of build capacity. R0 as scoped is plausible with AI import and Jira staying out.

## Still open after 2026-09-20

- B1/B2/B3 (UX): defaults stand unless the founder objects after seeing the demo.
- OQ-3: which client specifically.
- OQ-4 pricing; OQ-5 AI provider (Post-Q1); OQ-8 client sign-in.
- OQ-7 competitive watch: whether to fund a Tempo trial and a Jellyfish demo, the Crowd Log trigger, and re-rating the eng-intelligence watch to Swarmia-weighted monthly.
- R6 battlecard wording: Tempo does have a "No Account" view, and no BigPicture edition can be named for baselines after 2026-08-04.
- D2: reviewing the 30 UX assumptions and the architecture assumption tags.
