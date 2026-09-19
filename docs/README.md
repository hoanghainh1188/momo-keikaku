# Project knowledge

BMAD reads this directory as `project_knowledge` (see `_bmad/bmm/config.yaml`), so every skill treats what it finds here as grounding context. Keep the distinction below intact, or downstream skills will mistake input material for settled decisions.

## `references/`

External and comparable material gathered as **input**. Nothing here is a decision about this product, a commitment, or an agreed requirement. Treat it as evidence to reason from and argue with.

| File | What it is |
|---|---|
| `20260914-smart-pm-suite-srs-v1.md` | SRS for *Smart PM Suite*, a separate PMBOK-grounded PM system. A worked example of how PMI theory becomes software requirements. |
| `pmi-techniques-v1.md` | Compendium of PMI/PMBOK techniques — the underlying theory, not a product spec. |
| `pmi-techniques-v2.md` | Second compendium. Broader in places, **but not a superset of v1** — see below. |

### Read both PMI compendiums, not just v2

Despite the version numbers, v2 does not supersede v1. Each covers material the other omits, and both halves matter here:

- **Only in v1:** Free Float vs Total Float, schedule crashing trade-offs, TCPI (including the "TCPI > 1.1 is a red flag" heuristic), sum-of-years-digits depreciation, the conflict-resolution technique comparison.
- **Only in v2:** WSJF, MoSCoW and Kano prioritisation, Lean waste (Muda), RACI, resource levelling and the resource histogram, the Work Authorization System, the `EAC = AC + (BAC - EV) / (CPI × SPI)` variant, and worked numeric examples throughout.

TCPI and Free Float appear only in v1 yet are directly relevant — TCPI is also a requirement in the Smart PM Suite SRS above.

## Where decisions actually live

- `_bmad-output/planning-artifacts/` — briefs, PRD, UX, architecture: the decided requirements for this product
- `_bmad-output/brainstorming/` — discovery sessions, including the reasoning and the rejected options behind those decisions
