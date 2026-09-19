# Polish Pass Log: prd.md

- **Date:** 2026-09-19
- **Review:** bmad-review, lenses `structure` then `prose` (reader: humans; style baseline: Microsoft Writing Style Guide, with the document's British spelling and no-Oxford-comma conventions kept)
- **Purpose read:** helps the founder (PM) and the downstream UX, architecture and epic/story workflows build v1 of momo-keikaku without reopening decisions.
- **Structure model:** top-down decision/requirements document (PRD).
- **Rule applied:** no change to substance (requirements, numbers, thresholds, formulas, release tags, decisions, IDs, glossary definitions).
- **Word count** (word_metrics.py): 11,887 before, 11,957 after (+70, mostly from the "research Rn" disambiguation).

## Structure (9 changes)

1. §0: noted that research recommendations are cited as "research R1"–"research R7", to separate them from the R0/R1 release tags.
2. §0: noted that FR IDs are stable and not always sequential within a section (FR-41 sits in §4.3, FR-42 in §4.6).
3. §0: split the run-on "Features are grouped… and FRs have…" sentence.
4. UJ-3: added the missing **Persona + context** line so it matches the other journeys.
5. OQ-7: moved *Owner* to the first sub-bullet, as in the other OQs.
6. OQ-5: made the bold title consistent with the other OQs.
7. FR-41: added the **Opt-in:** label so every consequence in the list is labelled.
8. FR-35: changed "**Immutable and reproducible.**" to use a colon, like the other consequence labels.
9. §11: renamed the table column "Rec" to "Research rec".

## Prose (32 changes)

- **Research-reference disambiguation (14 places):** changed bare (Rn) to "research Rn" in §1.1 (×3), §4.5, §4.6 (×2), FR-20, §4.8, FR-40, §7.1, §8.3 (×2), §9 and OQ-7 (×3). This matters most in OQ-7, where "overturn R1" (research) sat next to "(R1)" (release).
- **Glossary terms used verbatim:** UJ-3 "stay Unplanned" became "stay Unplanned Work"; SM-C4 "percent-complete overrides" became "Percent Complete overrides".
- **Spelling consistency:** "Realizes" became "Realises" (9 places), to match the document's British spelling.
- **Serial-comma consistency:** fixed FR-10 counts, FR-33 and §0 release list.
- **Tightened wording:** §0 opening comma; §1 Vision money/effort sentence; §1.2 "complement" sentence; §2.2 LinearB clause; FR-3 magic-link parallelism and Out of Scope; FR-14 "combines … or both" became "uses … or both"; §4.6 description (two sentences merged); FR-24 "never twice" became "so they are never counted twice"; FR-30 *Formulas* intro (removed the parenthetical); §6 subject-verb agreement ("The pains … are"); §13 lead-in.

## Not applied

- §8.3 `[NOTE FOR PM]` on pulling the Tết warning forward: left as is, because removing or resolving it is a scope decision.
- §3 Glossary: definitions were not reworded, even where they are long (BAC).
- Duplicate statements that serve different roles (UJ edge case vs FR-35 stale-data warning; §7.2 vs §13; glossary vs FR-13 Unattributed hours): kept, because journeys, requirements and the decision log each need them.
