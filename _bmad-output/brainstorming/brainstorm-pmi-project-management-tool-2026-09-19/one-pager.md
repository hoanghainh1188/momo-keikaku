# A PMI-Grounded Project Management Tool

*Proposal — 2026-09-19. Pre-code. One founder.*

## The problem, as it actually happens

A plan is built in Microsoft Project. It is then pushed by hand into Jira, Backlog or Asana — a different tracker per project — and later pulled back by hand to measure progress and cost. That return trip requires judgement every time, because the trackers have filled up with work that was never in the plan. So the PM does both things inconsistently: sometimes the emergent task is added back to the plan, wrecking the baseline and cascading into every downstream date; sometimes it is silently dropped. The hidden rule deciding which is **size** — anything judged too small to bother recording disappears.

That omission is not noise, it is a one-directional bias. Actuals are always understated, never overstated. The next project is estimated from a history that systematically excluded small work, so the estimates stay wrong permanently. Rework is the same bias wearing a second face: effort spent fixing a task marked "done" is never attributed back to the task that caused it, so true cost is understated again.

## Why the incumbent cannot fix this

Microsoft Project assumes the PM is its only user. Everything follows from that: it does not know Jira exists, so it can never see the work that only exists there; it accepts a self-reported `% complete` with nothing attached to it; and it has no place to attribute rework back to its origin. These are not features that were left out — they are consequences of the single-user model. No amount of price or weight reduction changes them.

## The product

A standalone, cross-platform project management product grounded in PMI — the classic capability set (task management, scheduling, resource management, cost, program/portfolio) is the product, not an optional layer. Built on top of it, and the reason to switch, is a **reconciliation layer**: a persistent mapping between plan work packages and real tracker tickets, separate baseline and actual ledgers, and a screen that shows where the plan and reality have measurably diverged and where they are suspected of diverging. The team never learns the tool; they keep working in their tracker and receive the divergence view in chat or email. Full UI is for the PM.

**Week one, before any history exists:** import the existing plan, connect the tracker, and the product reports *"47 tickets in Jira belong to no task in your plan — 210 hours."* Microsoft Project structurally cannot produce that number.

## v1 scope

- The core PM set: tasks, scheduling, resources, cost — sufficient to run a project without Microsoft Project.
- Import from Microsoft Project (.mpp/XML), which removes the switching cost that actually stops people changing tools.
- Read-only connectors for Jira / Backlog / Asana, persistent task↔ticket mapping, and the unmapped-ticket report in hours and money.
- Divergence screen: actual elapsed progress, and measured divergence.
- Separate baseline and actual ledgers; a minimal read-only Gantt for credibility.

Deferred: evidence-backed progress with auto-linked artifacts, suspicion signals on PMI default weights, digests, three-point estimating and ratification capture, rework attribution, quality from bug tickets. Explicitly not now: the self-learning calibration engine, estimate-accuracy scoring, resource levelling, full calendar, advanced cost.

## Commitments that cannot be retrofitted

The data model supports multi-project and multi-department from day one — `tenant > department > program/portfolio > project > work package` — even though the portfolio UI comes later. Resource is the hard centre: a person belongs to a department but works across projects, so cross-project capacity contention is a core problem, not a later feature. Cost rolls up on two axes (project and department-as-cost-centre). Baseline and actual are separate ledgers, never one mutable set of numbers. Each of these is a schema decision; none can be added afterwards without a rewrite.

## How it makes money

The boundary falls out of the structure rather than being drawn across it. The free/base tier **sees the present** — reconciliation, divergence, unmapped work. It works on day one with zero history, which is exactly what makes it a credible free tier. The paid tier **learns from the past** — rework attribution, estimate accuracy by task type, signal calibration. That capability is worthless without accumulated history and increasingly valuable with it, so willingness to pay rises on the same curve as the value, and it arrives precisely when the customer is already invested.

## Risks, named

1. **Gaming.** Demanding evidence produces manufactured evidence — paperwork theatre, the reason PMI is disliked. Mitigation is a principle, not a feature: the tool never blocks and never punishes; absence of evidence is displayed as information. Attaching evidence must be near-automatic, because capturing a 20-minute task has to cost under 20 seconds or the original bias returns.
2. **Surveillance.** A divergence screen visible to a team is political. The defence is that the PM authors the plan alone, so divergence measures the *plan's* accuracy, not people's honesty. But the default visibility setting is the product's real opinion and its de-facto policy, and department scoping makes visibility structural rather than optional. This is not fully settled.
3. **Cold start.** The calibration engine is a moat for long-term users and empty for every new customer. PMI's priors are what fill the gap until an org's own outcomes retrain them — which is why the theory has to be load-bearing rather than decorative.
4. **Scope.** Replacing a thirty-year-old product, not sitting beside it, is a multi-year build for one person. The brainstorming that produced this proposal mined one vein deep — reconciliation — and left scheduling intelligence, resource optimisation, portfolio views and cost modelling untouched. There is currently no answer to how the *core* PM capability beats Microsoft Project, only how the layer above it does.
5. **Untested conviction.** There is not yet a feature the founder would refuse to build even if it sold. The first real test will be a paying customer asking to retroactively edit historical actuals.
