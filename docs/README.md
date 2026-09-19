# Project knowledge

BMAD reads this directory as `project_knowledge` (see `_bmad/bmm/config.yaml`), so every skill treats what it finds here as grounding context. Keep the distinction below intact, or downstream skills will mistake input material for settled decisions.

## `references/`

External and comparable material gathered as **input**. Nothing here is a decision about this product, a commitment, or an agreed requirement. Treat it as evidence to reason from and argue with.

| File | What it is |
|---|---|
| `20260914-smart-pm-suite-srs-v1.md` | SRS for *Smart PM Suite*, a separate PMBOK-grounded PM system. Reference only — a worked example of how PMI theory (EVM, CPM/PERT, EMV, portfolio economics) turns into software requirements. |

## Where decisions actually live

- `_bmad-output/planning-artifacts/` — briefs, PRD, UX, architecture: the decided requirements for this product
- `_bmad-output/brainstorming/` — discovery sessions, including the reasoning and the rejected options behind those decisions
