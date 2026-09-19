# Reconciliation: PRD vs competitive research

- **Input:** `research/competitive-plan-tracker-reconciliation-landscape-jp-2026-09-19/research.md` (R1–R7 binding)
- **Target:** `prds/prd-momo-keikaku-2026-09-19/prd.md` + `addendum.md`
- **Date:** 2026-09-19
- **Excluded by instruction:** the .mpp/XML part of R2 (deliberately overridden by the user; PRD §8.2, §10, addendum D record it correctly).

## Summary

| # | Gap | Severity |
|---|---|---|
| G1 | Backlog tier gating written against the "Standard" plan, which disappears on 2027-01-01 | High |
| G2 | R1's pending hands-on checks (Tempo trial, Jellyfish demo) dropped; only Crowd Log carried into Open Questions | High |
| G3 | "Wedge window closes ~2026-12-01" misreads a staleness re-check date as a market deadline | Medium |
| G4 | Research caveat "demand for the wedge is inferred, not observed" is missing | Medium |
| G5 | "Backlog teams are actively looking for workarounds" overstates the research; switcher-destination question dropped | Medium |
| G6 | Framing guidance attributed to R1; it comes from cross-dimension insight 5 | Low |
| G7 | Claims in §1.1 / §2.2 not supported by this research (Jooto, Flagxs, 2.3× generalisation) | Low |
| G8 | R6 battlecard facts: Jira Plans "no baseline" claim is stale per research; BigPicture Enterprise has baselines | Low |
| G9 | Research open question on which tracker dominates in VN offshore (affects R4) is dropped | Low |
| G10 | R7 is only an open question, not an owned risk-register entry | Low |

R1–R7 compliance: R1 honoured (with G2/G4 caveats), R2 honoured for the Backlog + timing half, R3 honoured (FR-19, FR-25–FR-27, addendum A.2) except G1, R4 honoured (§8.2, FR-20 out-of-scope), R5 honoured (FR-40, §7), R6 honoured at the requirement level (FR-15/16, FR-20, FR-24; GTM out of scope), R7 only partly (G10).

---

## G1. Backlog hours-tier detection references a plan that will not exist — High

- **Source:** "Backlog stores one estimated-hours and one actual-hours value per issue. Actual hours need the Standard plan or above [44]." and "Backlog repricing (announced 2026-06-17, effective 2027-01-01): The four plans become three: Economy ¥21,000, Business ¥36,300 (unlimited users) and Professional ¥100,000 per month [45]." Also insight 3: "the hours field is gated to paid tiers [44][45]."
- **PRD location:** UJ-2 edge case ("a plan below Standard"); OQ-2 ("Are they on Standard or above"); addendum A.2 ("Backlog shows hours only on the Standard plan and above").
- **Problem:** [44] is the *current* pricing page. v1 success is measured in Q1 2027, after the repricing, when "Standard" no longer exists. The research does not say which of Economy/Business/Professional exposes actual hours. The PRD hard-codes a pre-2027 tier name into the edge case and the architecture note.
- **Suggested fix:** Rewrite A.2 and UJ-2 to detect hours availability by capability (field present/populated via API), not by plan name. Extend OQ-2: "Which post-2027-01-01 Backlog plan exposes actual hours, and which plan will each of the five target spaces be on after repricing?" Add to the research re-check after 2027-01-01.

## G2. R1's overturn checks are dropped — High

- **Source:** "The claim 'nobody does this' rests on evidence of absence... medium confidence... A one-hour Tempo trial and a Jellyfish demo are the cheapest ways to overturn it." Open questions "Could overturn R1": #2 Tempo unplanned-worklog view, #3 Jellyfish Scenario Planner / planned-effort baseline. R1 confidence: "Medium... hands-on checks still pending."
- **PRD location:** §11 carries only #1 (OQ-1 Crowd Log). §10 R1 row gives no confidence level. OQ-7 covers the later re-check but not these pre-positioning checks.
- **Suggested fix:** Add OQ-9 "Tempo Cloud trial with deliberately out-of-scope worklogs (Financial Manager + Capacity Planner)" and OQ-10 "Jellyfish demo/docs: does Scenario Planner hold a planned-effort baseline?", both marked "before public positioning", alongside OQ-1. Note in §10 that R1 is medium confidence pending these.

## G3. Staleness date presented as the wedge window — Medium

- **Source:** "It is medium confidence and should be treated as valid until **2026-12-01** (see Staleness map)." Staleness map: "Earliest non-historical re-check: 2026-12-01... Run a Refresh then."
- **PRD location:** §1.1 "The wedge window is short. The research finding that nobody owns the Unmapped Work ledger holds only until about 2026-12-01."
- **Problem:** 2026-12-01 is when the evidence should be re-verified, not a date by which a competitor is predicted to ship. The PRD turns a data-freshness window into an urgency claim the research does not make.
- **Suggested fix:** "The finding that nobody owns the Unmapped Work ledger is medium confidence and due for re-verification on 2026-12-01. Engineering-intelligence vendors could add it cheaply (R7), so execution speed matters."

## G4. Inferred-demand caveat missing — Medium

- **Source:** "No competitor's customer asked for 'unmapped work in hours'. The voiced pain is one level up: missing baselines and 'I can't compare the plan with what happened' (§6). The demand for the wedge itself is therefore inferred, not observed." §6: "The strongest first-party signal is **not** the wedge itself."
- **PRD location:** missing. Vision and §1.1 present Unmapped Work as the headline without this caveat; no assumption or OQ covers external demand.
- **Suggested fix:** Add an `[ASSUMPTION]` in §1 / §12: "Demand for Unmapped Work quantification is inferred; the observed pain is missing baselines and plan-vs-actual comparison." Tie to SM-3 / OQ-3 so the first client conversation explicitly tests whether the Unmapped Work line is valued, not just read. Consider leading client-facing messaging with baseline-vs-actual and positioning Unmapped Work as what makes it honest.

## G5. Backlog repricing reaction overstated; switcher risk dropped — Medium

- **Source:** "users are reacting publicly [46]"; "ITmedia reports a public backlash." Open question 5: "Where are Backlog price-hike switchers going? ITmedia names no destinations [46]." R2: "medium for the size of demand."
- **PRD location:** §1.1 "Backlog teams are actively looking for workarounds (R2)."
- **Problem:** The research shows backlash, not observed workaround-seeking. It also leaves open whether teams leave Backlog, which would erode a Backlog-first beachhead.
- **Suggested fix:** Reword to "Backlog's repricing has drawn public backlash [research §5]." Add OQ: "Where are Backlog price-hike switchers going, and does churn off Backlog shrink the beachhead?" (research OQ-5), to re-check after 2027-01-01.

## G6. Framing attributed to the wrong source — Low

- **Source:** Cross-dimension insight 5: "This supports framing plan-vs-actual divergence as a measure of the *plan's* accuracy, and unplanned work as information rather than a judgement of team members." R1 itself covers positioning (ledger + baseline; sync not headline).
- **PRD location:** §4.9 description "(R1 framing)"; §6.1 heading "Framing (from research R1)".
- **Suggested fix:** Cite "research insight 5 (surveillance stigma [60], agile pushback [23])" for the plan-accuracy framing; keep R1 for the "never lead with sync" bullet. Content is correct; only traceability is off.

## G7. Claims not supported by this research — Low

- **§1.1 "Jooto shuts down in July 2027... Backlog user base keeps growing."** Not in research. If sourced from the brief, cite it; otherwise tag `[ASSUMPTION]`.
- **§2.2 "Flagxs"** as a Project Online migration vendor. Not in research (research names SRI's five paths and Planner Premium). Cite the brief or remove.
- **§1.1 "a team with unlimited users pays about 2.3× more (¥16,000 → ¥36,300)."** Research: the ¥16,000→¥36,300 move is for the cheapest unlimited-user plan; "about 2.3×" is "one firm's annual cost" per ITmedia [46]. The ratio (≈2.27×) is arithmetically consistent, so this is minor. Suggested wording: "the cheapest unlimited-user plan goes from ¥16,000 to ¥36,300 per month (about 2.3×)."
- **Dates/prices that match:** Project Online 2026-09-30; Backlog repricing 2027-01-01; cross-project Gantt to Business; 2026-12-01 re-check (see G3 for meaning).

## G8. R6 battlecard facts carry staleness flags — Low

- **Source:** Staleness map: "[23] Jira Plans has no baselines | 2023-01 | **yes** [stale]. Re-check JSWCLOUD-20495 status." Also "BigPicture has schedule baselines in its Enterprise edition [19]."
- **PRD location:** §4.5 "the 'missing baseline' that the research identifies as the loudest complaint about Jira Plans and Planner (R6)."
- **Suggested fix:** Add a note (or to OQ-7) that the Jira Plans baseline claim must be re-verified before it appears in battlecards, and that BigPicture Enterprise does have baselines, so battlecards should not generalise "Jira-side tools have no baseline".

## G9. VN offshore tracker question dropped — Low

- **Source:** Open question 6: "Which tracker dominates in Vietnamese offshore firms serving Japan? Only job-post evidence exists [56]." Insight 6: Redmine appears in VN BrSE postings where Asana does not.
- **PRD location:** missing from §11. §2.2 excludes Redmine teams from v1 users.
- **Suggested fix:** Add OQ: "Which trackers do the founder's offshore teams and target clients actually use (Backlog/Jira/Redmine)?" This validates both the v1 Backlog+Jira scope and the R4 Redmine-next order.

## G10. R7 has no owner or cadence in the PRD — Low

- **Source:** R7: "Re-check their changelogs quarterly." Feeds "Risk register." Staleness map: refresh at 2026-12-01 and after 2027-01-01.
- **PRD location:** §10 R7 → OQ-7 (a question about who the owner is).
- **Suggested fix:** Resolve OQ-7 with a named owner (default: founder) and dated checkpoints (2026-12-01, 2027-01-15, then quarterly), or add a short Risks section listing "eng-intelligence vendor ships unmapped-cost report" with trigger and response.
