# Polish Pass: addendum.md

Date: 2026-09-19. Lenses: bmad-review `structure`, then `prose`. Reader: humans. Style guide: Microsoft Writing Style Guide (the document's British spelling is kept). Structure model: Reference. `prd.md` was not changed.

Purpose read: this addendum gives downstream architecture and UX work the technical and design notes that sit behind the PRD, plus the record of rejected alternatives.

Word count (word_metrics.py): 1,566 before, 1,603 after (+37, all from the new bold lead-in labels).

## Structure (5 changes)

| # | Location | Tag | Change |
|---|----------|-----|--------|
| S1 | §A.2 | CONDENSE | Grouped the flat list of 11 bullets under bold lead-ins (Always-on polling, Hours detection, Rate limits, Ticket identity, Opening Balance, Attribution, Reproducibility, Jira (Post-Q1)). |
| S2 | §A.2 | MOVE/MERGE | Put the query-time attribution rule and the assignee/Reporting Period rule together under **Attribution**. Merged the two Ticket-identity bullets. Moved the Post-Q1 Jira block to the end so the R0 Backlog content comes first. |
| S3 | §A.3 | MOVE | Nested the confidence-score, no-auto-apply and provider bullets under the Post-Q1 AI interpretation bullet, which they describe. |
| S4 | §B | CONDENSE | Removed the stray blank line that split the list in two. Gave every bullet a bold label, as the first two already had. Grouped the two Client View wording bullets under **Client View language**. |
| S5 | §D | MOVE | Moved the Project Online facts so they sit right after the R2 beachhead override they support. |

PRESERVE: §C and the rationale in each §D entry stay unchanged. They are reference material and are not redundant.

## Prose (12 changes)

| # | Location | Change |
|---|----------|--------|
| P1 | §A.2 | Used glossary terms: "the ledger" / "append-only ledger" → "Actuals Ledger". |
| P2 | §A.2, §D | Used glossary terms: lowercase "snapshot" meaning a Tracker read → "Tracker Snapshot". "published snapshots" → "Published Snapshots". |
| P3 | §A.2, §C | Capitalised glossary terms: "tracker(s)" → "Tracker(s)", "baseline" → "Baseline", "Percent complete" → "Percent Complete". |
| P4 | §A.2 | "run all the time" → "run continuously". |
| P5 | §A.2 | "across the snapshot window" → "across the window between the two Tracker Snapshots". "say those are approximate" → "say those displays are approximate" (clearer antecedent). |
| P6 | §A.3, §B | Made FR references consistent: "(FR-41)" and "(FR-38)" → "(PRD FR-41)" and "(PRD FR-38)". |
| P7 | §A.3 | "A confidence score is needed" → "Produce a confidence score" (imperative, to match the sibling bullets). |
| P8 | §B | "shows effort only (工数), with no money" → "shows effort (工数) only, never money". |
| P9 | §C | "Includes the 36-kyotei…" (sentence fragment) → "It includes the 36-kyotei…". |
| P10 | §C | Added a comma after "for example" in two places. |
| P11 | §D | Added the serial comma in "OData, and desktop sync" and "AI import, Jira, and roll-ups". |
| P12 | §D | "A plain M365 licence can view" → "A user with a plain M365 licence can view". |

## Not applied

- §B, "rules out the other options": it is unclear what "the other options" refers to. Fixing this needs the author's intent.
- §D, "about 18 weeks of solo work before production use had to start…": the sentence is ambiguous. Any rewrite risks changing the finding.
- §C, "filled from a Tracker attribute": a Ticket attribute may be meant. This is a substance question, so it was left as written.
