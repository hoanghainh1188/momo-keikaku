# Input Reconciliation: PMI References vs PRD (EVM and related indicators)

- **Date:** 2026-09-19
- **Inputs:** `docs/references/pmi-techniques-v1.md`, `docs/references/pmi-techniques-v2.md`, `docs/references/20260914-smart-pm-suite-srs-v1.md`, `docs/README.md`
- **Target:** `prd.md` (Glossary §3, FR-27, FR-30–FR-33) and `addendum.md`
- **Scope:** every EVM / EAC / ETC / TCPI formula and interpretation in the PRD, checked against the references exactly. Also checks related indicators that matter for v1 (effort-based EVM in hours, percent complete from Ticket completion) and whether the heuristics are applied correctly.
- **Reading rule (docs/README.md):** the references are input, not decisions. v2 does not supersede v1. TCPI and its > 1.1 heuristic appear only in v1 (heuristic) and the SRS (formula). The `EAC = AC + (BAC − EV)/(CPI × SPI)` variant appears only in v2.

---

## 1. Formula-by-formula verification

| Metric | PRD (FR-30) | v1 | v2 | SRS §5 | Verdict |
|---|---|---|---|---|---|
| CV | EV − AC | EV − AC | EV − AC | EV − AC | Match |
| SV | EV − PV | EV − PV | EV − PV | EV − PV | Match |
| CPI | EV / AC | EV / AC | EV / AC | EV / AC | Match |
| SPI | EV / PV | EV / PV | EV / PV | EV / PV | Match |
| TCPI | (BAC − EV) / (BAC − AC) | formula not given (heuristic only) | absent | (BAC − EV) / (BAC − AC), "performance needed to finish on the Baseline budget" | Match (SRS). BAC-based variant only, which is correct for "hit the Baseline budget" |
| EAC Typical | BAC / CPI (default) | BAC / CPI | — | BAC / CPI | Match. Choosing it as the default is a PRD decision; no reference sets a default |
| EAC Atypical | AC + (BAC − EV) | AC + BAC − EV | — | AC + BAC − EV | Match |
| EAC Schedule-constrained | AC + (BAC − EV) / (CPI × SPI); "typical variance, and the date is the binding constraint" | — | AC + [(BAC − EV)/(CPI × SPI)]; "variance is typical and schedule is the main constraint" | — | Match (formula and condition). The 請負 example is the PRD's own inference and is reasonable |
| EAC Flawed | AC + bottom-up ETC, PM enters ETC per leaf WP | AC + ETC_new (re-estimate bottom-up) | — | AC + bottom-up ETC; workflow for "PM and Junior Engineers" | Match. The SRS also lets engineers enter ETC, while the PRD allows only the PM. That is a legitimate scope choice (see G-10) |
| ETC | EAC − AC | only as a bottom-up input | only mentioned (sunk-cost decisions use ETC) | only as bottom-up input | Not in references as a derived formula. Standard PMBOK and consistent. See G-9 |
| VAC | BAC − EAC | — | — | — | Not in any reference. Standard PMBOK. See G-9 |
| BAC | used, **never defined** | used | used | used | **Gap G-5** |

**Interpretations**

| Item | PRD | References | Verdict |
|---|---|---|---|
| Sign of CV/SV | Not stated (FR-30 shows only formulas) | v1/v2/SRS: > 0 good, < 0 bad (over budget / behind) | Minor gap (G-11) |
| CPI/SPI < 1 | Handled through FR-31 thresholds | < 1 = over budget / late | Consistent |
| TCPI meaning | "efficiency the remaining work needs to hit the Baseline budget" | SRS: same; SRS adds "TCPI > 1 → team must be more efficient than normal" | Match |
| TCPI > 1.1 red | "Needing more than 10% better efficiency **than current performance**" (v1) | v1 says the same words. But the threshold is absolute, i.e. 10% better than **planned** efficiency (1.0), not better than current CPI | **Misapplied rationale** (G-4) |
| CPI > 1 but SPI < 1 still at risk | "overall health never green while Schedule indicator is red" (v2) | v2: CPI > 1 and **SPI < 1** is still dangerous | Partly applied (G-6) |

**Conclusion on the formulas themselves:** every formula in FR-30 transcribes the references correctly. The gaps are in (a) definitions the formulas depend on (BAC, PV spread, percent complete edge cases), (b) other FRs that contradict FR-30 (FR-27, FR-32, FR-33), and (c) how the heuristics are worded and when they fire.

---

## 2. Gaps and errors

### G-1 — HIGH — FR-27 Ticket-Count Mode redefines SV/SPI on a basis that does not exist and that contradicts FR-30
- FR-27: "SV/SPI use counts of completed versus planned Tickets."
- The Baseline comes from the Excel WBS: WPs with hours and dates. It has **no planned Ticket count over time**, so "planned Tickets" (a count-based PV) is undefined. Tickets are created in the Tracker after baselining, often by the offshore team.
- FR-30 already covers this case. Percent complete falls back to "share of Tickets resolved when there are no estimates", and PV/EV/BAC are in **Baseline hours**, which come from the WBS rather than the Tracker. So in Ticket-Count Mode, **PV, EV, SV, and SPI stay computable in Baseline hours**. Only metrics that need AC (AC, CV, CPI, EAC, ETC, VAC, TCPI) become unavailable. This follows the references exactly: SPI = EV / PV needs no actual hours.
- **Fix:** rewrite FR-27 so that in Ticket-Count Mode, PV, EV, SV, and SPI are computed in Baseline hours with percent complete from resolved-Ticket share (FR-30). Mark as unavailable only the metrics that need AC. Drop "planned Tickets". Also say that the Unmapped Work health threshold (FR-31, "share of total hours") uses a Ticket-count share in this mode.

### G-2 — HIGH — FR-32 forecast bypasses the FR-30 EAC method and adds an unsourced date formula
- FR-32: "forecast finish date and cost at completion from the current SPI and CPI trend."
- **Cost:** FR-30 lets the PM pick an EAC method (Typical / Atypical / Schedule-constrained / Flawed) and shows the method next to every EAC. A cost at completion taken from the "CPI trend" amounts to BAC / CPI, the Typical method. It silently overrides the PM's choice and can show a second, different EAC for the same Project and date.
- **Date:** none of the three references gives a forecast finish-date formula. The usual heuristic is planned duration / SPI, or Earned Schedule. In an hours basis, SPI tends toward 1.0 as EV → BAC and PV → BAC at the planned finish, so a late project looks on schedule near its end. The references do not cover this, but it directly affects a v1 feature.
- **Fix:** FR-32 cost at completion **is** the FR-30 EAC under the selected method, and states which method it uses. Specify the date formula explicitly and tag it `[ASSUMPTION: not from docs/references]`. Note the SPI end-of-project degradation, and either accept it for v1 or name Earned Schedule as next wave.

### G-3 — HIGH — Roll-up rules (FR-30, FR-33) are incomplete, and Department EVM mixes two axes
- FR-30: "EVM Metrics roll up from leaf WPs to summary WPs, the Project, the Program, and the Department."
- FR-33: "Department roll-up allocates actual cost by each Resource's home Department, across all Projects."
- AC by Resource home Department and PV/EV/BAC by the Department that owns the Project are different axes. A Department CPI that divides EV from one axis by AC from the other has no meaning in PMI terms. The references roll EV/AC up the **WBS** (SRS §4: Work Package → Control Account), not across organisational cost pools.
- Also undefined: ratio metrics (CPI, SPI, TCPI) must be **recomputed from summed EV/AC/PV/BAC** and never averaged. Project-level AC includes Unmapped Work, which belongs to no WP, so "roll up from leaf WPs" does not yield Project AC by itself. FR-30 does say AC at Project level includes Unmapped Work, but the roll-up statement should say the same.
- **Fix:** (a) State that absolute values (PV, EV, AC, BAC, EAC, ETC) are summed and ratios are recomputed from the sums at each level. (b) Program and Department **EVM** use the Project-ownership axis. (c) The FR-33 Department view by Resource home Department is a **cost** roll-up (planned, actual, Unmapped). It does not produce CPI/SPI, or it shows them only on the ownership axis. Resolve the contradiction between FR-30 and FR-33 wording.

### G-4 — MEDIUM — TCPI > 1.1 heuristic: wrong rationale, and a blind spot when the budget is exhausted
- **Rationale:** FR-31 (and v1's wording) explains TCPI > 1.1 as "10% better efficiency than current performance". The rule tests TCPI against a fixed 1.1, which is 10% better than the **planned** efficiency (1.0). With CPI = 0.84 (UJ-3), TCPI = 1.1 means about 31% better than current performance. The rule is right but its explanation is not. Either keep the absolute test and correct the text ("more than 10% above planned efficiency"), or add a relative test (TCPI − CPI > 0.1, or TCPI / CPI > 1.1) and say which one applies. The UI shows the rule behind each colour (FR-31), so a wrong explanation will be visible to the PM.
- **Undefined zone:** when BAC − AC ≤ 0 (Baseline hours already used up, which is likely at Project level because AC includes Unmapped Work while BAC does not), TCPI is undefined (division by zero) or negative. A literal "TCPI > 1.1" test then never fires, and the worst case shows no TCPI red. **Fix:** define TCPI as "not achievable — Baseline budget exhausted" when BAC ≤ AC, and treat it as red.
- **Provenance:** v1 gives the > 1.1 threshold as a practitioner tip ("Lời khuyên từ Mentor"), not a PMBOK definition, and the SRS gives no threshold. FR-31 treats the other thresholds as configurable `[ASSUMPTION]`s; the TCPI threshold should be configurable per Tenant too, with 1.1 as the default.

### G-5 — MEDIUM — BAC and other EVM base quantities are undefined (Glossary, FR-30)
- BAC appears in TCPI, all four EAC methods, and VAC, but the PRD never defines it. The Glossary "EVM Metrics" entry lists 11 metrics and leaves out BAC.
- For the effort basis it should read: **BAC = total Baseline planned hours of the WP (leaf) or sum over descendants; Project BAC = sum over the active Baseline's WPs**. Also say explicitly that Unmapped Work has no BAC or PV (so it lowers CPI; this is intended), and say how a Catch-all WP gets BAC (only if it has planned hours in the Baseline, otherwise BAC = 0 and its hours count as AC only).
- Also add to the Glossary: *Percent Complete* (source and override), *EAC Method*, *BAC*, and *ETC* (derived vs bottom-up entered).
- The PV spread is also unspecified: "spread over working days up to the date" does not say linear or front-loaded. State **linear across the WP's Baseline working days (Holiday Calendar applied)** or mark it as an assumption.

### G-6 — MEDIUM — The v2 "CPI > 1 but SPI < 1 is still at risk" heuristic is only partly applied, and the overall-health rule is undefined
- v2's point is that SPI < 1 is dangerous even when CPI > 1. FR-31 only blocks overall green when the Schedule indicator is **red** (SPI < 0.85). With SPI = 0.90 (amber) and CPI = 1.10, the overall colour is undefined, and a naive "best of" or average would make it green.
- **Fix:** define the overall aggregation: worst-of the three indicators, or "never green if any indicator is amber or red". Then the v2 citation holds for the amber band too.

### G-7 — MEDIUM — Percent complete from Ticket completion (FR-30) has edge cases that make EV unstable
The source chosen (resolved share of mapped estimate, else resolved share of Tickets) is sound and avoids the rejected EV ≈ AC trap (addendum §D). But:
- **Leaf WP with no Mapped Tickets:** percent complete is undefined. It should be 0% (EV = 0), or "no progress signal" with PM override, but it must not be excluded from PV and BAC.
- **Mixed estimates:** some mapped Tickets have estimates and some do not. The rule switches only when "there are no estimates". Define it: for example, give unestimated Tickets the average estimate, or fall back to count share as soon as any estimate is missing.
- **EV can go down:** mapping new Tickets to a WP (Disposition *Map* or *Plan*, a new Mapping Rule match) enlarges the denominator, so percent complete and EV drop retroactively. Decide whether this is accepted (and show it in Divergence) or whether EV is frozen per Reporting Period in Published Snapshots.
- **Reopened Tickets:** say that a Ticket resolved and then reopened stops counting as resolved.
- **Tracker estimate vs Baseline hours:** Tracker estimates only weight Tickets inside a WP. EV always uses Baseline hours × percent complete. Keep this explicit so nobody computes EV from Tracker estimates.

### G-8 — LOW — Money layer: CPI in money and CPI in hours will differ, and this is unexplained
- Currency EV uses Baseline cost; currency AC uses the actual Rate at ledger time (FR-12). Hours-CPI and money-CPI therefore differ by rate variance, and a Tracker Account without a linked Resource or Rate has hours but no cost. State that the two layers can disagree and why, and how unrated hours show in money AC (for example "n hours unrated").
- The SRS §3 uses a **Billing Rate** to compute budget; the PRD Rate is a **cost** rate. That is fine for EVM cost control, but under 準委任 the client may read "cost" as billable amount. The Client View should state which one is shown. Noted only.

### G-9 — LOW — Provenance statement overreaches
- FR-30 says "Formulas follow the PMI references in `docs/references/`". VAC = BAC − EAC and derived ETC = EAC − AC are standard PMBOK but are **not in any of the three references**. Reword to say "the references, plus standard PMBOK definitions for VAC and ETC", or cite them separately.

### G-10 — LOW — Who enters the bottom-up ETC (Flawed method)
- The SRS gives PM **and engineers** a workflow for entering a bottom-up ETC. The PRD restricts it to the PM, per leaf WP. This is a valid choice under the "nothing asked of the offshore team" stance. Record it as an intentional divergence, not an omission.

### G-11 — LOW — Sign and interpretation text
- FR-30 requires the formula to be visible for each metric. Also show the interpretation from v1/v2: CV/SV > 0 = under budget / ahead, < 0 = over / behind; CPI/SPI < 1 = over budget / behind; TCPI > 1 = remaining work must be more efficient than planned (SRS). This is cheap and matches the references' "diễn giải" column.

---

## 3. Checked and consistent (no action)

- CV, SV, CPI, SPI formulas (all three references).
- TCPI BAC-based formula (SRS §5).
- All four EAC formulas and their selection conditions (v1, v2, SRS).
- Rejecting percent complete derived from burned effort (addendum §D). This matches the EVM principle in v1 §2: EV ties cost to work actually completed, not to money spent.
- Separate Baseline and actuals (SRS §7: Baseline changes only through controlled change; PRD FR-15/16 re-baseline with mandatory reason).
- Actual cost from time data, not accounting (SRS §2 "So what?": timesheet → AC → CV). The PRD uses Tracker snapshot deltas instead of approved timesheets. That is a deliberate v1 difference (R3), and FR-26 discloses it.

---

## 4. Noted, out of scope for this reconciliation

These are in the references but are not v1 EVM concerns. They are listed so nobody reads their absence as an oversight:

- **Scheduling:** PERT three-point estimate and project SD (v1, v2, SRS §4), CPM forward/backward pass, `Duration = LF − LS + 1`, Total Float vs Free Float (v1 only), path-convergence alerts (SRS), schedule crashing trade-offs (v1; the next-wave "Recovery options" in addendum §C cover crashing).
- **Dependencies:** FS/SS/FF/SF and lead/lag (SRS §2). The PRD has dependency lag only; the scheduling engine is next wave.
- **Resources:** resource levelling and resource histogram (v2; related to the next-wave load heatmap), skills matrix and smart assignment (SRS §3), RACI (v2), Work Authorization System (v2, SRS §2; it conflicts with the read-only Connector stance).
- **Risk and quality:** EMV and decision trees, control charts and sigma bands, UCL/LCL vs USL/LSL, Pareto.
- **Procurement and finance:** PTA / FPIF and share ratio, NPV, IRR, BCR, payback, opportunity cost, sunk cost exclusion (SRS §8), depreciation (straight-line, DDB, SYD).
- **Change control:** the CCB approval workflow (SRS §7). The PRD collects Change Request candidates only.
- **Agile and Lean:** MoSCoW, Kano, WSJF, Muda/cycle time.
- **People:** Tuckman, communication channels n(n−1)/2, conflict-resolution techniques.
- **Integration:** timesheet approval and ERP-fed AC (SRS §2, §9).

---

## 5. Suggested edit list (for the PRD owner)

1. FR-27: replace "counts of completed versus planned Tickets" with Baseline-hours PV/EV plus resolved-Ticket percent complete. Unavailable = only metrics that need AC. (G-1)
2. FR-32: cost at completion = FR-30 EAC under the selected method. Specify the date formula as an `[ASSUMPTION]` and note SPI → 1 near finish. (G-2)
3. FR-30/FR-33: sum absolutes and recompute ratios. Department/Program EVM uses the ownership axis. The home-Department view is cost only. (G-3)
4. FR-31: correct the TCPI > 1.1 rationale or add a relative test. Treat BAC ≤ AC as red. Make the threshold configurable. (G-4)
5. Glossary and FR-30: define BAC, Percent Complete, EAC Method, and ETC. Define the PV spread. (G-5)
6. FR-31: define the overall-health aggregation. (G-6)
7. FR-30: add the percent-complete edge-case rules (no Tickets, mixed estimates, EV decrease on new mappings, reopen). (G-7)
8. Low items: money vs hours CPI note, provenance wording, ETC entry role, interpretation text. (G-8 to G-11)
