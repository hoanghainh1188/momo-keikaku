# momo-keikaku — R0 demo

A runnable demo of the R0 wedge: **Unplanned Work is measured, not dropped.**

A PM's Excel plan and the team's Backlog tickets are reconciled into one report, in
effort hours, with the work that fell outside the baselined plan shown rather than
quietly absorbed.

---

## Run it

```bash
pnpm install
pnpm demo
```

That one command starts Postgres 18 in docker compose, applies the schema, seeds the
demo project, replays the `fixture` Connector's six weekly Tracker Snapshots into the
Actuals Ledger, and starts the web app.

| | |
|---|---|
| **Reconciliation Review** (the wedge) | http://localhost:3101/p/prj-ec2/review |
| **Client View preview** | http://localhost:3101/c/prj-ec2 |

> **Port note.** The web app runs on **3101**, not 3100: on this machine 3100 is held
> by an unrelated service (`packages/server/dist/index.js`). Override with
> `PORT=3xxx pnpm demo`. Postgres is published on host port **55433**, also to avoid a
> Postgres container that is already running here.

Other commands:

```bash
pnpm test                # 46 vitest cases over the pure domain core
pnpm seed                # re-seed, restoring the demo to its as-shipped state
pnpm db:down             # stop Postgres and delete its volume
pnpm fixtures:generate   # regenerate the fixture dataset (changes the golden numbers)
```

---

## What to click

The demo opens on the **Reconciliation Review** for the week of 2026-09-11 – 2026-09-17,
pinned to a Tracker Snapshot taken two hours earlier. It is Wednesday evening; Linh is
preparing Thursday's teirei (UJ-3).

1. **Status.** Three Health Indicators, each carrying the rule that produced its colour.
   Schedule ▲ amber (SPI 0.91), Effort/Cost ◆ red (TCPI 1.26 > 1.1), Unplanned Work
   ▲ amber (16.8% of this period's hours). Overall is the worst of the three.

2. **Read the two CPIs side by side.** All-in **0.80**, planned-scope **0.92**. The gap
   between them *is* the Unplanned Work — the planned scope is close to plan, the
   overrun is the work outside it. This is the thing no other tool shows.

3. **Unplanned Work → the Scope Ledger Bar.** Every hour the Connector can see, in one
   bar, in four mutually exclusive buckets that sum to the total: mapped to baselined
   WPs (indigo), Catch-all within its Baseline (grey), Catch-all overflow and Unmapped
   Work (violet, hatched). Nothing in scope is silently excluded.

4. **The three components of Unplanned Work.** 166.0h Unmapped, 0.0h on non-baselined
   WPs, 50.8h of Catch-all overflow. Opening Balances (900.2h — hours the Tickets
   already carried before momo-keikaku could see them) sit outside the bar and are
   excluded from period metrics.

5. **Drill down.** Expand a group in *Unmapped Work by Tracker attribute* to see the
   individual Tickets and their hours. "Bug" is the UJ-3 story: 11 bug tickets, 86.7h,
   on a feature the client added verbally.

6. **Work the Disposition rail** (right-hand column). This is the demo's centrepiece:

   - **Map** the *Bug* group to `3.2 Checkout flow (guest)` → Unplanned Work drops from
     **216.8h to 130.1h** and the period share from **16.8% to 12.2%** *immediately*,
     because attribution follows the current Mapping and the ledger is never rewritten
     (FR-21).
   - **Plan** the *Feature-Request* group as a new WP "Coupon rule changes" → WP **9.1**
     appears in the Current Plan tagged *non-baselined*, and its 46.7h move from the
     "Unmapped" component to the "non-baselined WPs" component — the **total Unplanned
     Work does not change**. That is FR-29: planning work does not un-spend it; only a
     Re-baseline does.
   - **Explain** the *Infrastructure* group with a note. The rail empties: "All Unmapped
     Work has a Disposition."

7. **Plan tab.** The 48-WP WBS with Baseline vs Current Plan effort and dates, and a
   Gantt-lite: hollow Baseline outline above the solid Current Plan bar, earned progress
   filling it in ink from the left, milestones as diamonds, the slipped one hollow red.

8. **Mapping tab.** Coverage, the two live Mapping Rules, and per-Ticket map/remap/unmap.
   Note the rule showing 0 Tickets — those Tickets already carry a manual Mapping, and a
   rule never overrides one.

9. **Client View** (sidebar, or *Preview client view*). Effort only. No money, no rates,
   no names, no ticket content — that is enforced by the type the projection returns, not
   by discipline. The Health Indicators include Unplanned Work, the Explain note appears
   beneath it, and the page states that the effort carries no earned value.

`pnpm seed` puts everything back if you want to run through it again.

---

## Are the numbers right?

`pnpm test` runs 46 vitest cases over the pure domain core. Two groups matter:

- **Hand-computed golden EVM cases** (`packages/domain/src/evm.test.ts`) — a two-WP
  scenario whose PV, EV, SV, SPI, CV, both CPIs, EAC, ETC, VAC and TCPI can be checked
  on paper against the PMI formulas.
- **Demo-dataset golden figures** (`packages/db/src/demo-golden.test.ts`) — the exact
  figures the Review renders, computed straight from the fixture files through the
  domain core with no database involved. If the screen and this file disagree, the
  persistence layer has introduced a difference.

Verified in the browser against the seeded state:

| Figure | Screen | Test |
|---|---|---|
| BAC / PV / EV / AC | 2936.0 / 1459.8 / 1330.8 / 1661.5 h | same |
| SPI | 0.91 | same |
| CPI all-in / planned scope | 0.80 / 0.92 | same |
| TCPI | 1.26 | same |
| EAC / ETC / VAC | 3665.6 / 2004.1 / −729.6 h | same |
| Unplanned Work, period | 29.1 h · 16.8% | same |
| Unplanned Work, cumulative | 216.8 h · 13.0% | same |
| Components (unmapped / non-baselined / catch-all overflow) | 166.0 / 0.0 / 50.8 h | same |
| Opening Balance | 900.2 h | same |
| Health (schedule, effort, unplanned → overall) | amber, red, amber → red | same |

Screenshots: `_bmad-output/demo-screenshots/`.

---

## The demo data

`fixtures/` holds a deterministic dataset, regenerable with `pnpm fixtures:generate`:

- Tenant **Momo Digital KK** › Department **Delivery** › Project **EC phase 2** for a
  Japanese client (大阪リテール株式会社), 準委任 contract, JST, teirei on Thursday.
- Six Resources with hourly Rates, plus one deliberately **unlinked** Tracker Account so
  Unattributed hours appear and are costed at the Project default Rate.
- A Holiday Calendar with JP and VN national holidays (2026).
- A **48-Work-Package plan** (7 phases, 38 leaves, 4 milestones, 1 Catch-all WP) with a
  Baseline of 2936h, and three Current-Plan edits that diverge from it.
- A **`fixture` Connector** replaying six weekly Backlog-shaped Tracker Snapshots over
  210 Tickets, producing 144 ledger entries — including the first snapshot's Opening
  Balances and the bug tickets outside the plan that drive the UJ-3 story.

---

## Known gaps

Deliberately out of scope for this demo (from the build brief):

- **No authentication.** A single seeded PM session; no sign-in, no roles enforced.
- **No multi-tenant isolation.** `tenant_id` is on every table, but Row Level Security,
  composite foreign keys and the non-owner application role are not set up (AD-3).
- **No pg-boss worker.** Snapshots are replayed once at seed time, not on a schedule.
  There is no on-demand *Refresh snapshot*.
- **No publishing persistence.** The Client View is a live preview; `published_snapshot`,
  the Visibility Policy UI, supersede/retract and viewer tracking are R1.
- **No Excel import** (FR-9–11) and **no xlsx export** (FR-38/39). These were the stretch
  items and were not reached.
- **No i18n.** Strings are English and inline, not yet in `messages/{en,ja}.json`.
- **No Jira, no AI import, no Department roll-up.**
- **Re-baseline is not wired.** The Baselines tab is read-only, so the "hours stay
  Unplanned until a Re-baseline" rule can be demonstrated but not completed.
- **Append-only is a convention here, not an enforcement.** The `BEFORE UPDATE OR DELETE`
  triggers and the revoked UPDATE/DELETE grants from AD-5 are not installed.
- **Concurrency is unhandled.** The per-project advisory lock that the adversarial review
  requires (H1/H4) is not taken; `seq` allocation and rule evaluation are safe only
  because the demo is single-user. Marked with `TODO(review-adversarial …)` in the code.

---

## Deviations from the architecture spine

Each of these is a deliberate, noted choice, not an oversight.

| Spine says | Demo does | Why |
|---|---|---|
| pnpm 12.4.2, Node 24.21, TypeScript 6, Next 16.3.5, Postgres 18.6 | pnpm **9.15**, Node 24.13, TypeScript 5.7, Next **15.5**, Postgres **18.6** | The versions available on this machine and in the registry. Postgres matches. |
| Effort as `bigint` milli-hours | integer `number` milli-hours | Exact to 2^53 mh; avoids `bigint` friction through Drizzle and JSON for a demo. Integer milli-hours, and the single rounding site in `domain/present`, are unchanged. |
| `apps/worker` with pg-boss schedules | ingest runs inside the seed | The build brief defers the scheduler. The ingest use case itself is unchanged and would move to the worker as-is. |
| RLS, `withTenant`, composite FKs, non-owner role | `tenant_id` columns only | Single-user local run. No code reads across tenants, so this can be added without a data migration. |
| Append-only enforced by triggers and grants | enforced by convention | Same reason. |
| Wall time from a `Clock` port | a **fixed demo clock** stored on the project row | Review G-5: with a real clock the fixture snapshots are permanently stale, the 24-hour warning always fires and the "current" Reporting Period is empty. The anchor is `2026-09-16T09:00Z` — Wednesday 18:00 JST, exactly Linh's UJ-3 moment. |
| Fixture `observedAt` is the recorded time | recorded times are **rebased onto the anchor** | Same review item, fix (a). Fixture files store an offset in hours, not an absolute instant. |
| The active Baseline is "the version active at `observedAt`" | chosen **by sequence** | Adversarial review H3. A timestamp comparison would leave every fixture entry with no active Baseline and make 100% of the hours Unplanned — the demo would show a red indicator that no amount of mapping could clear. |
| Project time zone resolved with a tz database | fixed +09:00 offset | The demo project is JST only. `domain/calendar` takes the offset as a parameter. |
| Excel import behind `WorkbookPort` | not built | Stretch item, not reached. |
| `next-intl`, `messages/{en,ja}.json` | English strings inline | i18n was a stated non-goal; strings are not yet externalised, which is the honest gap. |
| `dependency-cruiser` enforcing the import graph | not installed | The graph is respected by hand: `packages/domain` imports nothing from the workspace and does no I/O. |

## Design decisions applied

The UI follows "**Ledger Paper, lighter**" as directed during the build, which overrides
DESIGN.md where they differ:

- One sans family (IBM Plex Sans JP, covering EN and JA) — **no Shippori Mincho**.
- A neutral near-white ground, with the sheet distinguished by hairline rules rather
  than by warmth — **no warm paper**.
- A **left sidebar**, collapsible so the Gantt and wide tables can reclaim the width,
  instead of the horizontal Excel-style tab strip. The top bar keeps the project
  switcher and the snapshot pin.
- Kept from DESIGN.md: the single indigo action colour, Unplanned Work in 藤 violet with
  a diagonal hatch and never red or amber, square corners, right-aligned tabular figures
  with the unit in muted ink, a formula caption under every metric, charts drawn in the
  same inks as the tables, and the Scope Ledger Bar as the signature element.

Applied to every screen built here: Review, Plan, Mapping, Baselines, Connectors and the
Client View preview.
