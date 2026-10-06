---
title: 'Story 5.10 — Rules keep new Tickets mapped, and still never move the plan'
type: 'feature'
created: '2026-10-06'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'c1a26ebdbc35a91777e2d377d4487da74cca1e3e'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Mapping Rules exist only as seeded rows: there is no way for a PM to create, edit, delete or reorder them, priorities are not unique, rule-driven events never record which rule fired, the `parent` condition is missing, and deleting a rule would break the `mapping_event.rule_id` FK — so new Tickets cannot stay mapped without hand work (FR-22, AR-18, UX-DR22/23).

**Approach:** Make rules a PM-authored, strictly-ordered list (unique priority, soft-delete) with a pure `evaluateRules` that also returns the firing rule; thread `rule_id` into every rule append (ingest and rule saves) under the per-Project lock; give the Rules section create/edit/delete with a Save-gated move preview and drag-handle / `Alt+↑/↓` reorder; flag rule-driven moves to Unmapped on Review. No path writes a date or recalculates.

**Decisions (agent, recorded — not user-visible):**
- Soft-delete: `mapping_rule.deleted_at`; deleted rules never evaluate but stay referenceable by events. `disableRulesTargeting` (5.9) becomes a soft-delete.
- Uniqueness: partial unique index `(tenant_id, project_id, priority) WHERE deleted_at IS NULL`, DEFERRABLE-equivalent via in-txn renumber (reorder rewrites priorities 1..n inside the lock).
- `rule_id` on a rule event = the rule that matched; on a rule event with `wp_id = null` = the rule that previously held the Ticket (the rule it "left").
- Every rule save (create / edit / delete / reorder) re-evaluates in the same locked txn over each in-scope Ticket's latest observation, skipping heads `manual`/`disposition`; appends only on change; audit `mapping.rule_create|rule_update|rule_delete|rule_reorder`.
- Preview = same pure evaluation, current vs proposed rules, read-only; hours = that Ticket's cumulative ledger hours (hours Connectors only; Ticket-Count Connectors contribute counts, never hours).
- Rule target: leaf, non-milestone WP of the same Project (reuse 5.9 leaf guard).
- `parent` condition value = parent Ticket key typed by PM, resolved to `tracker_issue_id` from `ticket` at save; unknown key → `invalid_input`.
- Reorder applies immediately (no preview) and reports "N Tickets moved".

**Decisions (Harry, 2026-10-06):**
- Q1: **one condition per rule** (`match_field` = `match_value`); OR = several rules; no AND.
- Q2: **key pattern = glob** with `*` and `?` only, anchored, case-sensitive; field `keyPattern` replaces `keyPrefix` (migration rewrites existing `keyPrefix` rows to `value || '*'`).
- Q3: Review flag **persists while unmapped**: any Ticket whose head at the pin is a `rule` event with `wp_id = null` shows "moved to Unmapped by rule '…'" until it is mapped again.
- Spec size ~2,400 tokens accepted (keep full scope).
- Review intent_gap (Harry, 2026-10-06): a rule evaluation's "result" is the pair **(wpId, ruleId)**. When a different rule now holds a Ticket at the SAME WP, append a `rule` event (same `wp_id`, new `rule_id`) so the head always names the rule holding it; attribution/EVM are unaffected (same WP).

## Boundaries & Constraints

**Always:** manual/disposition heads never touched by rules (head re-read inside lock); appends only on change; `mapping_event` stays the only Mapping store, `mapping_head` dual-written; no WP date write, no `recalculate`, no `applyPlanChange` from any rule path; `domain/schedule` never imports attribution; keyboard path for every pointer action.

**Never:** a second DnD surface beyond Mapping (Tickets board 5.9 + Rules reorder handle); coverage / catch-all / exclusion / approximate / fixture-ticket work (5.11–5.15); durable Review Re-pin; Jira attribute kinds; rules targeting summary WPs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ingest re-eval | New Ticket matches rule P2 | One `rule` event, `rule_id`=P2 rule, head→WP | N/A |
| Unchanged | Result equals head | No event | N/A |
| Manual wins | Manual map commits during ingest | Ingest skips that Ticket (head read in lock) | CI concurrency test |
| Rule no longer matches | Rule-mapped Ticket, no match now | `rule` event `wp_id=null`, `rule_id`=prior rule; Review flags it | N/A |
| Duplicate priority | Save with taken priority | Refused | `invalid_input` |
| Delete rule | Rule mapped 5 Tickets | Soft-delete; 5 re-evaluated vs remaining rules | Rollback on failure |
| Preview | Edit rule's WP | "+N Tickets / +Xh → WP; M leave WP"; Save disabled until loaded | Preview error → Save stays disabled |
| Reorder | Alt+↑ on rule | Priorities renumbered; re-eval; count shown | N/A |
| Non-leaf target | Rule → summary WP | Refused | `invalid_input` |

</frozen-after-approval>

## Code Map

- `packages/db/src/schema.ts:1368` `mappingRule` — add `deletedAt`, `matchField` allows `parent` + `keyPattern` (rewrite `keyPrefix` rows); partial unique priority index. New migration `packages/db/drizzle/0012_mapping_rule_authoring.sql` (hand-check: preflight duplicates by renumbering per project before the index). `pnpm db:sql` regen; `registry.test.ts` must pass.
- `packages/domain/src/types.ts:96` `MappingRule.match` += `{ field: 'parent'; value: string }` (tracker issue id); replace `keyPrefix` with `{ field: 'keyPattern'; value: string }` (glob).
- `packages/domain/src/mapping.ts:31` `evaluateRules` → return `{ wpId, ruleId } | null` (keep a thin `wpId` wrapper if callers need it); `applyRules:57` sets `ruleId` (prior head's rule for null result); add pure `previewRuleChange(current, proposed, tickets, head, hoursByTicket)`. Tests beside `attribution.test.ts:452`.
- `packages/db/src/repositories/ingest/index.ts:187,656` — load only non-deleted rules; pass `m.ruleId`. Already inside `lockWatermark` (:444).
- `packages/db/src/repo-writes.ts:139,414` — `appendMappingEvents` keeps head dual-write; `disableRulesTargeting` → soft-delete; new `createRule/updateRule/softDeleteRule/reorderRules` + `reevaluateRulesForProject` (latest observation per ticket, lock first).
- `packages/db/src/repo.ts:427` — fix `currentlyMapped` = heads whose `rule_id` = rule; exclude deleted rules; add preview read (latest observations + ledger hours per ticket + heads).
- `packages/app/src/use-cases/` — new `mapping-rules.ts` (create/update/delete/reorder/preview) with `MAPPING_RULE_ROLES`/`_AUDIT`; register in `role-declarations.ts`, `audit-declarations.ts`, barrel; audit actions in `packages/app/src/audit/index.ts:35` + `payloads.ts:139`. Reuse leaf guard from 5.9 `workPackageInProject`.
- `packages/domain/src/review.ts:290` + `apps/web/.../review/page.tsx:291` — "moved to Unmapped by rule '…'" rows linking `/p/[id]/mapping#rule-<id>`.
- `apps/web/src/app/p/[projectId]/mapping/page.tsx` Rules section + new `components/mapping-rules-editor.tsx` (form, preview, Save gated, drag handle + `Alt+↑/↓`, model on `mapping-ticket-board.tsx`); actions in `apps/web/src/app/actions.ts`.
- `packages/i18n/src/messages/{en,ja}.json` `mapping.*` — rule form, preview sentence, reorder, review flag.
- Tests: `tests/watermark-concurrency.test.ts` (ingest vs manual map, REQUIRE_DB); `tests/write-expectations.ts` for rule writes; `packages/app/src/use-cases/mapping-schedule-fence.test.ts` extend to rule writers; `probe-tenants.ts:61` add `parent`.
- Do not change: 5.9 Tickets DnD, attribution query semantics, schedule engine.

## Tasks & Acceptance

**Execution:**
- [x] `packages/db` schema + 0012 migration + `db:sql` — soft-delete, `parent`, unique live priority.
- [x] `packages/domain` mapping/types/review (+tests) — ruleId-returning evaluate, applyRules ruleId, preview, review flag; I/O matrix unit tests.
- [x] `packages/db` repo-writes/repo/ingest — rule CRUD + reorder + re-eval under lock; ruleId threading; currentlyMapped fix.
- [x] `packages/app` mapping-rules use cases + roles/audit registration + schedule-fence test.
- [x] `apps/web` + `packages/i18n` — Rules editor, preview-gated Save, reorder handle + Alt+↑/↓, Review flag.
- [x] `tests/` — concurrency (manual wins vs ingest), write expectations; `sprint-status.yaml` 5-10 → in-progress/review; `deferred-work.md` notes.

**Acceptance Criteria:**
- Given a PM, when defining rules, then each targets a leaf WP on milestone / category / issue type / parent / key pattern, in strict unique priority (FR-22).
- Given each snapshot, when ingest runs, then non-manual Tickets are re-evaluated by pure `evaluateRules` and events append only on change, with the firing rule recorded (FR-22, AR-18, NFR-A1).
- Given any rule path, when it commits, then no actual date is written and no recalculation runs (FR-22, AR-52).
- Given a manual Mapping committed during ingest, then manual wins and a CI concurrency test proves it (AR-18, AR-37).
- Given rule create/edit/delete, when saving, then the move preview shows first and Save is disabled until it loads (UX-DR22).
- Given a rule moves a Ticket to Unmapped, then Review shows "moved to Unmapped by rule '…'" linking the rule (UX-DR23).
- Given the rule list, when reordered by handle or `Alt+↑/↓`, then priorities stay unique and Tickets re-evaluate (UX-DR22).

## Implementation Notes

- **Migration 0012** (`packages/db/drizzle/0012_mapping_rule_authoring.sql`): generated by drizzle-kit, then hand-edited — `keyPrefix` rows rewritten to `keyPattern` / `value || '*'` before the `match_field` CHECK, and live priorities renumbered 1..n per Project (old priority, then id — the order `evaluateRules` already used) before the partial unique index. Journal `when` set after 0011's hand-set value, or `drizzle-kit migrate` silently skips it on an already-migrated DB.
- **One evaluation, two callers.** `packages/db/src/repo-mapping-rules.ts` `loadRuleEvaluationOn` reads live rules, the latest observation of every not-left-scope Ticket (owner Connector, highest snapshot `seq`), heads from `mapping_event` (never the derived head), and cumulative ledger hours from hours-basis Connectors only. The preview read (`loadRuleEvaluation`, a new `ProjectReadPort` member) and every rule save's `reevaluate` (after `lockProject`) both run domain `applyRules` over it, so the preview is exactly the save. `previewRuleChange(proposed, tickets, head, hoursByTicket)` drops the spec's `current` argument: the current rules are already expressed in the heads, and diffing heads (not `evaluate(current)`) is what keeps preview == save.
- **Rule writes** are a new write family (`MappingRuleWriteScope.mappingRules`) on the use-case barrel, registered in role/audit declarations and the cross-tenant harness (read + four writes, `write-expectations` incl. `mapping_rule` rows). Each answers `{ id, moved }`; the audit gate now allows exactly one extra `moved` count beside `{ id }` for rule writes. Rule events are stamped with the PM's actor (ingest keeps `system:rules`); `rule_id` = firing rule, or the rule left for `wp_id = null`.
- **Refusals**: target not a live WP of the Project → `not_found`; summary/milestone → `invalid_input {wpId:[not_leaf]}`; taken live priority → `{priority:[priority_taken]}`; unknown parent key → `{matchValue:[unknown_parent]}`; reorder not naming every live rule once → `{orderedRuleIds:[order_mismatch]}` (a foreign id → `not_found`). The preview refuses the same way, so Save never enables on a draft the save would refuse.
- **Guards**: `disableRulesTargeting` is a soft delete (now takes the stamp's `at`); `assertMappedLeafMayBecomeSummary` also refuses (`rule_target_leaf`) turning a live rule's target leaf into a summary. `currentlyMapped` = heads whose `rule_id` is the rule.
- **Review flag** (`ReviewResult.ruleUnmapped`, names from `ReviewInput.ruleNamesById` incl. soft-deleted rules) persists while the pinned head is `rule` + `wp_id = null`; hours hidden in Ticket-Count Mode. Links to `/p/<id>/mapping#rule-<id>` (a deleted rule has no row to land on).
- **Web**: `components/mapping-rules-editor.tsx` (create/edit/delete with debounced preview, Save gated on the preview for the exact current draft; drag handle + `Alt+↑/↓` reorder with focus kept; `role=status` "N Tickets moved"). Server actions return plain DTOs (hours formatted server-side). Fixed a pre-existing 5.4 bug on the way: `snapshot-actions.ts` ("use server") exported a const, which makes Next refuse every server action on project pages at run time; moved to `snapshot-refresh-state.ts`.
- **Tests**: domain I/O matrix (`mapping-rules.test.ts`, `review.test.ts`), DB matrix (`tests/mapping-rules.test.ts`), manual-wins concurrency for ingest and for a rule save (`tests/watermark-concurrency.test.ts`, mutation-checked: loading heads before the lock fails it), fence/reachability extended to the rule modules.
- 2026-10-06 (parent verify): lint / typecheck / depcruise exit 0. Full `pnpm test` with `REQUIRE_DB=1` on a fresh migrated+policied+seeded DB: 1886/1888; the two failures (`tests/schedule/fence.test.ts` WAL budget, `packages/db/src/seed-sequences.test.ts` shared-counter) are cross-suite interference on one cluster and pass in isolation together with `tests/mapping-rules.test.ts`, `tests/watermark-concurrency.test.ts`, `packages/domain/src/mapping-rules.test.ts` (57/57). Matrix rows all covered by running tests except the UI half of Preview (Save disabled until loaded / on preview error), which is browser-verified only — repo has no component test runtime (same disposition as 5.9).
- 2026-10-06 (review patches, verified by parent): same-WP rule switch appends a `rule` event with the new `rule_id` (Harry decision) and is excluded from preview flows; Review links only live rules; editor preview keyed on draft + live-rules fingerprint, action failures caught, focus cleared once, unique line keys, count-only lines when `hoursAvailable` is false; preview/save resolve `parent` keys to the lowest tracker id; `parentKey` from Ticket identities for `displayValue`; 0012 comment corrected; new DB cases (retarget/fall-through with ledger `mh`, Ticket-Count no hours, same-WP switch, delete-then-ingest) and `apps/web/src/app/actions.test.ts`. Re-verify: lint / typecheck / depcruise exit 0; `db:sql` and drizzle-kit drift clean; full `pnpm test` with `REQUIRE_DB=1` on a fresh DB 1898/1900 — the two failures are pre-existing flakes (`fence.test.ts` WAL budget, also failing in isolation 1/3; `ingest-nfr.test.ts` 2000-ticket test at the 5 s default timeout, deferred), unrelated to 5.10.

## Spec Change Log

## Review Triage Log

- `medium` → intent_gap (resolved by Harry, patched in place) — different rule now fires for the same WP: no event, head keeps stale `rule_id` (`packages/domain/src/mapping.ts` applyRules); `currentlyMapped` / Review flag name the wrong (possibly deleted) rule. Decision recorded in frozen block: result = (wpId, ruleId).
- `false` — rule event id `map-rule-<ticket>-<anchor ms>` collides → 23505: `mapping_event` PK is `seq` (identity) and `id` has no unique constraint/index (0000 schema, 0011 index is non-unique); `at` = Project `demoAnchor` is the existing project-write convention (`repo-writes.ts:30`).
- `medium` → patch — Review "moved to Unmapped by rule" links `#rule-<id>` but soft-deleted rules are not rendered on Mapping, so the anchor is dead for the commonest case (delete).
- `medium` → patch — rule editor `changeKey` covers only the draft; a reorder/refresh of `rules` while the form is open leaves a stale `ready` preview and Save enabled.
- `medium` → patch — `parent` key resolution differs: preview `ticketIdsByKey` = last row wins, save `ticketIdForKey` = lowest id; `ticket.key` not unique per Project.
- `medium` → patch — `displayValue` for `parent` resolves only via pinned snapshot tickets; a parent outside it pre-fills the raw tracker id and every edit-save is refused `unknown_parent`. Untested (VG).
- `medium` → patch — `submit()` / `reorder()` await server actions in `startTransition` without try/catch; a rejected action leaves the form silent.
- `medium` → patch — Ticket-Count Mode preview renders `+0h` (hours shown as zero; epic forbids rendering unavailable as 0).
- `low` → patch — `focusRuleId` never cleared; later `rules` refreshes yank focus back to an old handle.
- `low` → patch — duplicate React keys when two preview lines have identical text.
- `low` → patch — migration 0012 comment claims prior tie order was `(priority, id)`; it was heap order (stable sort on priority only). Direct comment correction.
- `medium` → patch (VG) — no integration test creates/updates a rule that actually moves Tickets / retargets / falls through by priority.
- `medium` → patch (VG) — preview `mh` never asserted against `actuals_ledger_entry` (and Ticket-Count Connector → no hours).
- `medium` → patch (VG) — ingest using live rules only is unverified (delete rule then ingest; no event names the deleted rule).
- `medium` → patch (VG) — new server actions (`saveMappingRule`, `previewMappingRule`, `removeMappingRule`, `reorderMappingRuleList`) lack an action test (repo pattern: `connectors/actions.test.ts`).
- `low` → defer — `rule_target_leaf` plan refusal has no UI message; same pre-existing gap as 5.9's `mapped_leaf` (no plan refusal code → copy mapping).
- `medium` → defer (VG, pre-verified) — `assertMappedLeafMayBecomeSummary` rule-target query tested only with a mocked chain; add a DB case to `fence-2-10` (same disposition as 5.9 guard tests).
- `medium` → defer — other `'use server'` modules still export objects (`admin/actions.ts:28`, `connectors/actions.ts:30-31`); pre-existing.
- `low` — legacy rule heads with `rule_id = null` read `currentlyMapped = 0`: no deployed DB predates 0012 (production is Epic 8; seed regenerates); rejected.
- `low` — rule types duplicated across app ports and db repo (drift risk): no named failing caller; `satisfies` checks hold; rejected.
- `low` — `hoursByTicket` per-Connector query chain + re-taking the (idempotent) watermark lock: few Connectors per Project; rejected.
- `low` — default priority 100001 when top is 100000: unlikely; rejected.
- `low` — `keyPrefix` values containing `*`/`?` become wildcards in 0012: unlikely in Backlog keys; rejected.
- `low` — migration 0012 data steps untested: seed-only data pre-production; rejected.
- `low` — reorder handle `disabled` while pending drops focus: covered enough by clearing `focusRuleId` + refocus after rules change; rejected.

## Verification

**Commands:**
- `pnpm lint` -- exit 0
- `pnpm typecheck` -- exit 0
- `pnpm depcruise` -- exit 0
- `pnpm test` -- exit 0
- `pnpm db:sql && git diff --exit-code packages/db/sql` -- no drift
