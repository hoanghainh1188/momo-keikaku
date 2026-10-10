# Epic 6 Context: Thursday's teirei report in twenty minutes

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

A PM opens the Reconciliation Review for any Reporting Period, pinned to one Tracker Snapshot, and reads the weekly report pages they used to rebuild by hand: honest EVM in effort hours with Unplanned Work carrying actual effort and no earned value, both CPIs side by side, three Health Indicators (and overall status) each showing the rule behind its colour, the forecast with computed and trend finish dates and the gap named when they disagree, every WP whose dates moved under one of seven causes, and Observed vs Recorded Percent Complete made to face each other. They then disposition every Unmapped Ticket and advance the Data Date deliberately — so Thursday's teirei takes minutes, not an evening in Excel.

## Stories

- Story 6.1: Every figure comes from pinned inputs, and a test proves it
- Story 6.2: EVM in hours, with Unplanned Work carrying no earned value
- Story 6.3: The formulas, and the one EAC method R0 ships
- Story 6.4: The evidence and the plan are made to face each other
- Story 6.5: Three Health Indicators, each showing its rule
- Story 6.6: The forecast, and both finish dates
- Story 6.7: The Reconciliation Review, pinned and in one fixed order
- Story 6.8: Every date that moved carries its cause
- Story 6.9: Disposition every Unmapped Ticket before anything leaves

## Requirements & Constraints

- **Review surface.** One Reporting Period, pinned to a Tracker Snapshot (time shown). Fixed order: Header → Status → Unplanned Work → Ahead/Behind → Progress & Dates → Effort & Cost → Forecast, plus Disposition rail. Covers EVM, Health, Divergence by WP, mapping coverage, Unplanned Work's three components; Contract Type beside Unplanned. Every number drills to Tickets/WPs. Load: under 2 s p75 / 4 s p95 on the shared fixture.
- **EVM in hours.** PV = Baseline hours of baselined leaf WPs, linear over baseline working days (integer milli-hours, largest remainder). AC from Actuals Ledger at Mapping watermark. Observed % Complete never from burned effort (estimate basis if every Mapped Ticket has an estimate; else count basis; 0%/"no evidence" with none; cap 99% until actual finish; "low evidence" under three Tickets). EV = Baseline hours × Observed %; falls flagged. Unplanned Work = actual effort with Project-level PV = EV = 0 so roll-ups sum. Baselined-ness judged against the Baseline active when the entry was recorded. Always both CPIs: all-in (EV/total AC — headline, Effort/Cost, EAC) and planned-scope (EV/baselined AC). Ratios from summed PV/EV/AC, never averaged. Money = hours × Rate, Internal-only; UI notes CPI-in-money can differ. R0: Typical EAC only (BAC / all-in CPI), method named beside every EAC. CV/SV/CPI/SPI/TCPI/ETC/VAC; TCPI shows "BAC exhausted" when BAC − AC ≤ 0.
- **Observed vs Recorded.** Observed drives EVM/Review, never dates. Recorded (import or audited override) drives remaining duration; absent → scheduled 0%. Gap list (default >10 pts, worst first); Accept needs a non-empty reason and states date consequences; audited, "PM-adjusted" (unhideable), cause *progress changed*.
- **Health.** Schedule / Effort/Cost / Unplanned Work; overall = worst (never green while Schedule is red). Defaults: SPI/CPI ≥0.95 green, ≥0.85 amber, else red; TCPI >1.1 or BAC exhausted → Effort/Cost red regardless of CPI; Unplanned Period share (ex Opening Balances) <10% / 10–20% / >20%, cumulative beside. Schedule extras: slipped Milestone (past Baseline, no actual finish) ≥amber; derived date past Baseline ≥amber (name which rule); negative Float vs Project finish → red (say when Float is relative); unmet *must finish on* ≥amber, red on Milestone. Glyph + word + rule. Thresholds: Project override else Tenant default; resolved value + source stored in inputs.
- **Forecast.** Effort = selected EAC (includes Unplanned). Both finishes labelled: computed (scheduler / Schedule indicator) and trend (Baseline start + duration ÷ SPI, whole working days up; ≥ next working day after as-of while EV < BAC; hidden if SPI 0/unavailable). Show the gap when they disagree. Late project: SV and both finishes beside Schedule.
- **Seven causes, closed.** Exactly one of: *edited*, *moved by a predecessor*, *calendar changed*, *data date advanced*, *actual dates recorded*, *progress changed*, *project dates changed*. No mapping cause. Data Date advance is explicit and names what it re-dates. Runs between Reviews retained for this list.
- **Dispositions.** *Map* (hours leave Unplanned immediately); *Plan* (leaf WP, no deps, ASAP; hours Unplanned until Re-baseline; proposes actual start/duration from first observed activity — PM accepts or clears; graph linking is a later Plan-surface act); *Change Request candidate*; *Explain* (clients see note only if published). Non-*Map* dispositions do not change Unplanned colour without Re-baseline. Group covers Tickets present at record time only. New hours → "new hours since disposition", back to queue.

## Technical Decisions

- **Pinned compute.** Every figure is `compute(inputs, formulaVersion)` from append-only sources `ComputationInputs` pins (schedule: that run's inputs only). Closure CI fails if any exported domain input type is unreachable. Ledger filter = `snapshot_id ≤ pinned snapshot` per Connector; `ledger_seq_max` is assertion only. Capture under shared advisory lock. New `formulaVersion` keeps old versions executable; golden Published Snapshots recompute for every version.
- **Split Review pin.** Tracker-side snapshot/ledger frozen for the Review's life. PM watermarks **and `schedule_run_seq`** re-capture after each successful write here — freezing the run while re-capturing override/status/setting watermarks would show new EVM against a superseded schedule.
- **Arithmetic & presentation.** Exact `{num, den}` ratios; one `compareRatio` via cross-multiplication. Rounding only in `domain/present` (ratios 2 dp, hours 1, yen integer).
- **Disposition writer.** `recordDisposition` is the only writer: locked transaction, `plan.createWp` for *Plan*, `mapping.map` with `source = 'disposition'` for *Map*/*Plan*, one `disposition_event` with the explicit Ticket list and each `ledger_seq_at`/`cum_mh_at` (never group criteria). "New hours" = ledger sum with `seq > ledger_seq_at` at the watermark.
- **Table / modules.** Creates `tenant_setting_event` (Tenant Health defaults; Project overrides use project settings events). Causes from per-WP `cause` across retained runs (`prevInputs` / `prev_run_seq`). Compute in `domain/{evm,health,forecast,review}`; attribution owned by Epic 5 and read here; evidence must not import schedule.

## UX & Interaction Patterns

- **Review as report.** Project landing surface; section title + 1px ink rule is required markup. Disposition rail 360px sunk; drawer when narrow. Snapshot pin: age live; >24h amber + *Refresh now*; newer than pin → "Re-pin", never silent change. Print stylesheet is Comfort.
- **Metric & Health.** Click/`Enter` → non-modal formula popover (formula, inputs, interpretation, Period change, drill-down); `Esc` returns focus. Health: glyph + word + rule; hover/focus shows threshold and driver.
- **Progress & Disposition.** Observed/Recorded rows with basis, source, gap, EV each would produce, *Accept*. Data Date panel names consequences before advance. Queue by hours desc; `j`/`k`/`x`/`m`/`p`/`c`/`e`; undo until next publish/export. *Map* updates Unplanned + Scope Ledger Bar in place with a one-line note.

## Cross-Story Dependencies

- **Needs:** Epics 1, 2, 4, 5 (Tenant/fixture, schedule + Data Date, Baseline/`schedule_run`, Actuals + Mapping + Unplanned buckets). Not 7 or 8.
- **Inside:** 6.1 underpins 6.2–6.8; 6.2–6.3 feed 6.5–6.6; 6.4's override feeds *progress changed* in 6.8; 6.7 assembles the page; 6.9 re-captures PM watermarks per the split pin.
- **Downstream:** Epic 7 exports the PM view and raw recompute inputs. Publish/Client View (R1) reuse pin + formulaVersion; this epic owns Review + compute, not publish UI.
- **Upstream invariant:** Epic 5's "mapping never moves a date" must hold, or the closed cause list is false.

