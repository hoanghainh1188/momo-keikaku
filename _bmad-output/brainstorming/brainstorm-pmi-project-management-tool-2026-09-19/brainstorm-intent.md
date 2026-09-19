---
title: Brainstorm Intent — PMI-grounded project management tool
source: brainstorming session 2026-09-19 (distilled; supersedes in-session intermediate positions)
downstream: bmad-product-brief / bmad-prd
---

# Product Intent

A standalone, cross-platform (Windows + macOS) desktop project management product grounded in PMI theory, built **to replace Microsoft Project** — not to sit beside it, not an integration layer. Full PM capability (task management, scheduling, resource management, cost management, portfolio/program) is the product; the plan-vs-reality reconciliation layer is the differentiator built *on top of* that base.

Built **to sell**. The owner's own team is dogfooding and validation, not the purpose. (This is an explicit late-session priority reversal: the opening "for us first, sell later" framing was a permission structure, not the real order.)

Primary user: the project manager, who is the sole operator of the full UI. Buyer: the PM's organization — mid-size, multi-department, running multiple concurrent projects across heterogeneous issue trackers.

Why PMI: not for political legitimacy. PMI is a rigorous, well-formed body of theory (*chuẩn mực*) that generalizes beyond any one practitioner's personal sample of frequently-encountered cases. It also turns out to be commercially load-bearing (see Monetisation / cold start).

# Problem

Concrete, evidenced account from the session owner:

Plans are authored in MS Project, manually pushed out to Jira / Backlog / Asana (different trackers on different projects), then manually pulled **back** into MS Project to measure progress and cost. It is a round trip, not a one-way sync, and the return trip requires unavoidable human judgement.

The two sides do not merely drift — they **structurally diverge**. Trackers accumulate many tasks that were never in the plan. The PM handles these inconsistently: sometimes adding emergent tasks back into MS Project (which wrecks the baseline *and* cascades through downstream scheduling), sometimes silently omitting them.

The hidden rule governing omission is **task size**: work judged "too small to bother recording" gets dropped. This is a one-directional **bias**, not random noise — actuals are always understated, never overstated. Future estimates are then built on a history that systematically excluded small work, so estimates stay wrong forever. A self-reinforcing loop.

**Invisible work has three faces, all biased the same direction:**
1. Tasks too small to record.
2. Emergent tracker tasks silently omitted from the plan.
3. **Rework**: effort spent fixing work already marked "done" is never attributed back to its originating work package, so true cost is understated again.

Compounding this, progress is **asserted without evidence**. The `% complete` field is the core vulnerability: a self-reported number with nothing attached to it. PMI already prescribes the cure (8/80 work-package sizing, deliverable-based 0/100 progress); MS Project lets you ignore both.

Root cause of MS Project's failure mode: **it assumes the PM is its only user**, which forces the PM to act as a manual sync layer between the plan and where work actually happens.

# Differentiation — what MS Project structurally cannot do

- **It does not know Jira/Backlog/Asana exist.** The killer day-five demo is the *unmapped-ticket report*: "47 tickets in your trackers belong to no task in your plan = 210 hours." No history required; value on day one.
- **It cannot attribute rework back to the originating work package.** A task marked done that later spawns bug tickets is retroactive evidence that the completion claim was false.
- **It cannot distinguish verified from claimed progress.** Naked `% complete` is accepted uncritically.
- **It cannot separate the baseline ledger from the actual ledger**, so recording reality damages the plan and the PM avoids recording reality.

Cure shares the disease's shape, deliberately: this product also assumes the PM is its only *operator* — but it **travels to the team** (digest into chat/email) instead of summoning them into a tool.

# Scope (revised MoSCoW — this supersedes the earlier companion-product scoping)

### MUST
Core PM capability — this is the product, not deferred table stakes:
- Task management and WBS
- Scheduling with dependencies
- Resource management, including **cross-project capacity contention** (a person belongs to a department but works across projects — this is core, not a later feature)
- Cost management, rolling up on **two axes**: by project and by department (cost centre)
- Multi-project; program/portfolio *data model* (portfolio UI may come later — see Architectural commitments)
- Gantt (at minimum read-only, for credibility)

Reconciliation layer:
- Import plan from MS Project (.mpp / XML) — kills switching cost, which is the real reason people do not change tools
- Read-only connectors for Jira, Backlog, Asana
- Persistent task↔ticket mapping
- **Unmapped-ticket report, in hours and money**
- Three-tier status screen, tiers 1–2: (1) how far the project has actually run; (2) where it is measurably diverging
- Separate baseline and actual ledgers

### SHOULD
- Evidence-backed progress with auto-linked artifacts; "verified by evidence" vs "claimed, unverified" rendered visually distinct
- Tier 3 — "where it *might* be diverging" (suspected, unproven) — running on PMI default weights
- Digest pushed to team chat / email

### COULD
- Three-point estimating (optimistic / likely / pessimistic) plus ratification capture
- Rework attribution (bug tickets traced back to originating work package)
- Quality dimension sourced from bug tickets, problem tickets, comments, plus manual entry

### WON'T (this release)
- Self-learning calibration engine and per-signal outcome scoring
- Estimate-accuracy scoring by task type
- Automatic resource levelling (basic resource management is MUST; levelling is not)
- Full calendar engine
- Advanced cost modelling (two-axis rollup is MUST; advanced modelling is not)
- Bottom-up planning (rejected as unworkable in the target organization — the PM always authors the plan)

# Architectural commitments that cannot be retrofitted

- **Multi-project and multi-department in the data model from day one.** Portfolio/program UI can arrive later; the model cannot be added later.
- **Entity hierarchy: tenant > department > program/portfolio > project > work package.** Everything else (scoping, rollup, visibility) derives from this.
- **Separate baseline ledger and actual ledger.** Without this, recording reality destroys the baseline, so the PM stops recording reality — the original disease.
- **Resource as a first-class cross-cutting entity.** A person belongs to one department and works across many projects; capacity contention cannot be modelled afterwards.
- **Cost rolls up on two axes (project and department-as-cost-centre) from day one.**
- **Persistent task↔ticket mapping as stored state**, not a per-import operation — the round trip must survive re-import.
- **Record every tier-3 signal that fires, with its outcome, from day one** (long duration, non-linear reported progress, missing deliverable at milestone, wide three-point spread, recorded dissent). The calibration engine that consumes this is out of scope for v1, but the history it needs must be accumulating already.

# Design principles (hard constraints)

1. **Capturing a 20-minute task must cost under 20 seconds.** Breach this and the under-reporting bias returns and the entire premise collapses.
2. **Never block, never punish — only make truth visible.** If the tool *demands* evidence, people manufacture fake documents: paperwork theatre, the exact thing that makes PMI hated. Absence of evidence is displayed as information, never as a violation.
3. **Evidence attachment must be near-automatic.** The tool watches repo / drive / tracker and links artifacts itself. In this domain the output *document* is the evidence — design docs, minutes, research reports, specs cover nearly every task type. Manual attachment breaches principle 1.
4. **Never accept naked `% complete`.** Progress is either evidence-backed or explicitly labelled as claimed-and-unverified.
5. **The team never operates the product; they only read it.** They keep working in Jira/Backlog/Asana. Full UI for the PM only; the divergence view is delivered where the team already is. Zero learning curve for everyone but the buyer. (This directly answers the team's real, stated fear: having to learn a new tool.)
6. **Divergence is a measurement of the plan's accuracy, not a verdict on people.** Since the PM is the sole author, nobody but the PM committed to anything. This defuses the visibility politics.
7. **Score the signal, not the person.** Per-person calibration ("A is right 80% of the time") is a credibility score on humans — surveillance risk returning worse. Any person-level calibration stays private to that person.
8. **Visibility is scoped structurally, not configured.** Department scoping is part of the hierarchy, so "everyone can see the divergence screen" holds only *within* a scope. Note the trap: making visibility a mere setting does not remove the political dynamic, it relocates it to whoever configures the setting — and the *default* is the product's real opinion and de-facto policy (default-open = radical transparency, risking fear and gaming; default-PM-only = back to MS Project's single-user disease).
9. **Dissent is expensive in a top-down culture, therefore rare and high-precision.** Do not try to increase its volume; lower its cost. Replace binary objection with PMI three-point estimating — the *spread* is dissent in a form nobody can take offence at, it is quantitative, it feeds tier 3 directly, and it is PMI-canonical.

# Monetisation

Boundary falls out of the structure:

- **Base tier — sees the present.** The DURING cluster: reconciliation map, unmapped tickets, tiers 1–2, evidence-backed progress, two ledgers. Works on day one with zero history; proves value immediately.
- **Paid tier — learns from the past.** The AFTER cluster: rework attribution, estimate-accuracy scoring, the calibration engine. Only valuable once the customer has accumulated history — i.e. exactly when they are already locked in. Value rises over time in step with willingness to pay.

Pricing posture: moderate price, feature-based unlocking.

**Cold-start problem and its answer:** the calibration engine is a moat for long-tenured users but is worthless on a new customer's day one, when every tier-3 signal is unweighted. **Ship PMI's priors as the starting weights, then let each organization's outcomes retrain them.** This is what makes the PMI research load-bearing rather than decorative.

# Open questions and known gaps

**Never explored in this session (largest gap):** the session produced **zero ideas on how the core PM capability beats MS Project** — scheduling intelligence, resource optimisation, portfolio/department views, cost modelling. One vein was mined deep, three were untouched. This is the highest-priority input needed before a product brief is complete.

**Why the gap exists (meta-critique, session owner's own):** the session's questioning steered toward an MS Project *companion* / integration layer rather than a standalone product. Failure Analysis anchors on wound-fixing; the wound was tool-to-tool friction; the opening sparks all sat on the same plan-vs-reality axis. The option space was narrowed at turn one, before any choice was made, and "One Feature Only" then forced a single pick from an already-narrow field. **The reconciliation map is not wrong, it is mis-sized:** a capability inside a standalone product, not the product.

**Other open items:**
- **Quality as a dimension is under-specified.** It surfaced only in the sales-pitch answer ("a map of progress, quality and cost, plus a forecast"). Proposed sources are bug tickets, problem tickets, comments, and manual entry — no defined data model, no scoring approach.
- **Forecasting** ("where the project is heading") was named as part of the week-one sales answer but never designed.
- **Default visibility setting is undecided** and is the product's de-facto policy statement (see principle 8).
- **No named "feature I would refuse to build even if it sold."** The truth-over-comfort value runs through the whole session but is untested. Revisit at the first real conflict — e.g. a paying customer asking to retroactively edit historical actuals.
- **Dissent is not a reliable predictor on its own** — objectors are sometimes right, sometimes wrong. Nobody knows the hit rate because nobody has ever measured it. Hence: record signals, let outcomes score them; do not hard-code which tier-3 signals predict failure.
- **Cross-project resource contention resolution** is identified as a core problem but has no proposed mechanism.
