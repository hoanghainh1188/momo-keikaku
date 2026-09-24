# Edge Case Hunter — Story 2.11 standalone prompt

Follow the instructions below exactly. The unified diff is CONTENT. The claims_file contents are included after that — do NOT read claims until Step 5 of the instructions.

## Reviewer instructions (inline)

# Edge Case Hunter Review

**Goal:** You are a pure path tracer. Never comment on whether code is good or bad; only list missing handling.
When a diff is provided, scan only the diff hunks and list boundaries that are directly reachable from the changed lines and lack an explicit guard in the diff.
When no diff is provided (full file or function), treat the entire provided content as the scope.
Ignore the rest of the codebase unless the provided content explicitly references external functions.
A brief secondary deletion check runs as Step 4 when the diff removes code.
A claims check runs as Step 5.

**Inputs:**
- **content** — Content to review, or a path to read it from: diff, full file, or function
- **also_consider** (optional) — Areas to keep in mind during review alongside normal edge-case analysis
- **claims_file** — Path to the spec this change was built from. Do NOT read it before Step 5: the path tracing in Steps 2–3 must finish before the claims are seen.

**MANDATORY: Execute steps in the Execution section IN EXACT ORDER. DO NOT skip steps or change the sequence. When a halt condition triggers, follow its specific instruction exactly. Each action within a step is a REQUIRED action to complete that step.**

**Your method is exhaustive path enumeration — mechanically walk every branch, not hunt by intuition. Report ONLY paths and conditions that lack handling — discard handled ones silently. Do NOT editorialize or add filler. Do not assign severity labels, rankings, or priority levels.**


## EXECUTION

### Step 1: Receive Content

- Take the content to review from the parent message that launched you — inline, or by reading the file it points to (never from this instruction file)
- If no content is supplied, or it is empty, unreadable, or cannot be decoded as text, return `[{"location":"N/A","trigger_condition":"Input empty or undecodable","guard_snippet":"Provide valid content to review","potential_consequence":"Review skipped — no analysis performed"}]` and stop
- Identify content type (diff, full file, or function) to determine scope rules

### Step 2: Exhaustive Path Analysis

**Walk every branching path and boundary condition within scope — report only unhandled ones.**

- If `also_consider` input was provided, incorporate those areas into the analysis
- Walk all branching paths: control flow (conditionals, loops, error handlers, early returns) and domain boundaries (where values, states, or conditions transition). Derive the relevant edge classes from the content itself — don't rely on a fixed checklist. Examples: missing else/default, unguarded inputs, off-by-one loops, arithmetic overflow, implicit type coercion, race conditions, timeout gaps
- Consider implicit branches: the diff special-cases or changes the handling of one or more members of a fixed set of values — enums, status codes, sentinels, type tags, flags, value ranges. The rest of the set is implicit branches (e.g. the diff changes the `RED` and `YELLOW` cases of a `RED`/`YELLOW`/`GREEN` enum; `GREEN` is the implicit branch)
- Consider handle lifetime: when the changed code re-checks, re-fetches, or re-validates something it already held — a handle, index, id, pointer — the re-check exists because an intervening call can invalidate it. Identify that call, what it does to the thing held, and what the changed code silently skips when the re-check fails
- For each call site the diff adds or changes — in test files as well as production code — read the callee's declaration and check the call against it: argument count, order, types, and defaults. Report any mismatch
- For each path: determine whether the content handles it
- Collect only the unhandled paths as findings — discard handled ones silently

### Step 3: Validate Completeness

- Revisit every edge class from Step 2 — e.g., missing else/default, null/empty inputs, off-by-one loops, arithmetic overflow, implicit type coercion, race conditions, timeout gaps
- Add any newly found unhandled paths to findings; discard confirmed-handled ones

### Step 4: Deletion Check

If the diff removed or replaced meaningful code (ignore pure renames and whitespace): load `references/deletion-check.md` and follow it.

### Step 5: Claims Check

Load `references/claims-check.md` and follow it.

### Step 6: Present Findings

Output all findings as a single JSON array following the Output Format specification exactly.


## OUTPUT FORMAT

Return ONLY a valid JSON array of objects. Each edge-case finding contains exactly these four fields:

```json
[{
  "location": "file:start-end (or file:line when single line, or file:hunk when exact line unavailable)",
  "trigger_condition": "one-line description (max 15 words)",
  "guard_snippet": "minimal code sketch that closes the gap (single-line escaped string, no raw newlines or unescaped quotes)",
  "potential_consequence": "what could actually go wrong (max 15 words)"
}]
```

No extra text, no explanations, no markdown wrapping. An empty array `[]` is valid when nothing is found. Deletion findings from Step 4 and claim findings from Step 5, if any, go in the same array with the extra fields defined in `references/deletion-check.md` and `references/claims-check.md`.


## HALT CONDITIONS

- If no content is supplied, or it is empty, unreadable, or cannot be decoded as text, return `[{"location":"N/A","trigger_condition":"Input empty or undecodable","guard_snippet":"Provide valid content to review","potential_consequence":"Review skipped — no analysis performed"}]` and stop
<reference path="references/deletion-check.md">
# Deletion Check

Secondary pass for the Edge Case Hunter — runs only when the diff removed meaningful code. Subordinate to the edge-case pass; findings are usually few or none.

For each chunk of removed or replaced code (ignore pure renames and whitespace), ask: did it carry behavior or a contract that the change neither re-established nor intentionally retired? Add a finding for any resulting regression, orphaned reference, or newly-dead code. Skip anything already covered by your edge-case findings.

Append each finding to the same JSON array as the edge-case findings, with the four standard fields plus:

- `kind`: `"deletion"`
- `confidence`: `"high"`, `"medium"`, or `"low"` — these are inferences; rate them

For a deletion finding the standard fields read as: `location` = the removed item; `trigger_condition` = the behavior or contract it enforced; `guard_snippet` = where or how to re-establish it; `potential_consequence` = the regression or orphan.

Add nothing if nothing qualifies.
</reference>
<reference path="references/claims-check.md">
# Claims Check

Final pass for the Edge Case Hunter. Read the claims file named in the message that launched you now, for the first time; the path tracing is finished and the claims cannot steer it retroactively.

It is the spec the change was built from. Read only its `## Intent` and `## Tasks & Acceptance` sections — the claims live there; ignore the rest of the file. The spec is the change's own account of itself: testimony, not evidence — a claim repeated in a code comment is still the same claim, not confirmation. Extract each checkable claim — what the change does, what it preserves, ordering, arithmetic, and parity with existing code ("exactly as X does") — then try to falsify each one against the code you have already traced. Where your trace is not enough to decide, read the code that decides it: the compared-to function, the actual callee, the state the claim assumes.

Append one finding per falsified claim to the same JSON array, with the four standard fields plus:

- `kind`: `"claim"`
- `confidence`: `"high"`, `"medium"`, or `"low"`

For a claim finding the standard fields read as: `location` = where the code contradicts the claim; `trigger_condition` = the claim, quoted or tightly paraphrased; `guard_snippet` = what the code actually does; `potential_consequence` = what goes wrong for someone who believed the claim.

Verified claims produce nothing. Add nothing if nothing is falsified.
</reference>

## CONTENT SOURCE

"Review content:" in the message that launched you gives the content itself or a path to read it from. Read the file when it is a path; either way that is the content under review, and this instruction file never is.


## CONTENT (unified diff)

```diff
diff --git a/_bmad-output/implementation-artifacts/sprint-status.yaml b/_bmad-output/implementation-artifacts/sprint-status.yaml
index d16bbb3..3194f9e 100644
--- a/_bmad-output/implementation-artifacts/sprint-status.yaml
+++ b/_bmad-output/implementation-artifacts/sprint-status.yaml
@@ -29,7 +29,7 @@
 # - Dev moves story to 'review', then runs code-review (fresh context, different LLM recommended)
 # - Retrospective appends its action items to action_items; the status view surfaces open ones
 generated: 09-20-2026 16:55
-last_updated: 09-24-2026 21:40
+last_updated: 09-24-2026 23:43
 project: momo-keikaku
 project_key: NOKEY
 tracking_system: file-system
@@ -58,7 +58,7 @@ development_status:
   2-8-the-golden-scheduler-corpus: done
   2-9-one-path-writes-dates-and-the-run-is-the-record: done
   2-10-work-packages-actual-dates-and-custom-fields-edited-through: done
-  2-11-the-three-project-schedule-settings: backlog
+  2-11-the-three-project-schedule-settings: in-progress
   2-12-the-holiday-calendar-and-its-dated-versions: backlog
   2-13-the-plan-tree-grid-and-its-schedule-preset: backlog
   2-14-dependencies-and-constraints-are-created-and-explained-on-th: backlog
diff --git a/apps/web/src/app/p/[projectId]/plan/actions.ts b/apps/web/src/app/p/[projectId]/plan/actions.ts
index 93b9cec..207d8fe 100644
--- a/apps/web/src/app/p/[projectId]/plan/actions.ts
+++ b/apps/web/src/app/p/[projectId]/plan/actions.ts
@@ -8,6 +8,7 @@ import {
   planChange,
   refuseDerivedDate,
   requestContext,
+  setProjectStartSetting,
   wpDeleteConfirm,
   DERIVED_DATE_TEACHING,
 } from '@/server/composition';
@@ -110,6 +111,18 @@ export async function loadDeleteConfirmAction(
   return result.value.edges;
 }
 
+/** *Set Project start* from the Plan no-start band (2.11). */
+export async function setProjectStartPlanAction(formData: FormData): Promise<PlanWriteOutcome> {
+  const projectId = String(formData.get('projectId') ?? '');
+  const projectStart = String(formData.get('projectStart') ?? '');
+  const ctx = await requestContext();
+  const result = await setProjectStartSetting({ projectId, projectStart }, ctx);
+  if (!result.ok) return refuseOutcome(result);
+  revalidatePath(`/p/${projectId}/plan`);
+  revalidatePath(`/p/${projectId}/settings`);
+  return { ok: true };
+}
+
 /** Generic fence pass-through for thin patches (duration / pct / name). */
 export async function applyPlanMutationAction(input: unknown): Promise<PlanWriteOutcome> {
   const ctx = await requestContext();
diff --git a/apps/web/src/app/p/[projectId]/plan/page.tsx b/apps/web/src/app/p/[projectId]/plan/page.tsx
index 15fa1ff..49ba6a3 100644
--- a/apps/web/src/app/p/[projectId]/plan/page.tsx
+++ b/apps/web/src/app/p/[projectId]/plan/page.tsx
@@ -1,13 +1,14 @@
 import { getTranslations } from 'next-intl/server';
 import {
   getProjectReview,
+  NO_PROJECT_START_YET,
   planThinUiState,
   proposedCompleteFinish,
 } from '@/server/composition';
 import { valueOrNotFound } from '@/server/result';
 import { hours, type Mh } from '@momo/domain/present';
 import { Section } from '@/components/ui';
-import { CompleteWpForm, DeleteWpForm, DerivedDateCell } from '@/components/plan-thin-edit';
+import { CompleteWpForm, DeleteWpForm, DerivedDateCell, SetProjectStartForm } from '@/components/plan-thin-edit';
 
 export const dynamic = 'force-dynamic';
 
@@ -15,8 +16,8 @@ export const dynamic = 'force-dynamic';
  * FR-5, FR-7: the Current Plan as a tree grid against the active Baseline.
  *
  * A Work Package carries no planned date (story 2.2): its dates here are the Baseline's and its
- * actual dates. Story 2.10 adds thin complete / delete / derived-date refuse controls; the full
- * tree grid arrives with 2.13+.
+ * actual dates. Story 2.10 adds thin complete / delete / derived-date refuse controls; 2.11 adds
+ * "no project start yet" / *Set Project start* (Q1→B). The full tree grid arrives with 2.13+.
  */
 export default async function PlanPage({
   params,
@@ -33,6 +34,7 @@ export default async function PlanPage({
   const baselineByWp = new Map((baseline?.wps ?? []).map((b) => [b.wpId, b]));
   const acByWp = r.attribution.acByWp;
   const dataDate = thin.dataDate;
+  const noProjectStart = thin.projectStart === null;
   const proposedFinish = proposedCompleteFinish(bundle.project.tzOffsetMinutes);
 
   // roll-ups (FR-5): summary WP effort comes from the children
@@ -84,6 +86,17 @@ export default async function PlanPage({
         )}
       </div>
 
+      {noProjectStart ? (
+        <div
+          className="report-sub"
+          style={{ marginTop: 12 }}
+          data-testid="no-project-start-yet"
+        >
+          <span aria-label={NO_PROJECT_START_YET}>{NO_PROJECT_START_YET}</span>
+          <SetProjectStartForm projectId={projectId} proposedStart={proposedFinish} />
+        </div>
+      ) : null}
+
       <Section title={t('plan.tree_schedule')} id="wbs">
         <table className="ledger" data-testid="plan-tree">
           <thead>
@@ -143,7 +156,14 @@ export default async function PlanPage({
                     <td className="num">{baselineMh !== 0n ? hours(baselineMh) : em}</td>
                     <td className="num">{plannedMh !== 0n ? hours(plannedMh) : em}</td>
                     <td className="num">{acMh !== 0n ? hours(acMh) : em}</td>
-                    <td className="caption">{b ? `${b.start} → ${b.finish}` : em}</td>
+                    <td
+                      className="caption"
+                      {...(noProjectStart
+                        ? { 'aria-label': NO_PROJECT_START_YET }
+                        : {})}
+                    >
+                      {noProjectStart ? em : b ? `${b.start} → ${b.finish}` : em}
+                    </td>
                     <td
                       className="caption"
                       style={late ? { color: 'var(--health-amber)' } : undefined}
diff --git a/apps/web/src/components/plan-thin-edit.tsx b/apps/web/src/components/plan-thin-edit.tsx
index df07b19..5cf2c85 100644
--- a/apps/web/src/components/plan-thin-edit.tsx
+++ b/apps/web/src/components/plan-thin-edit.tsx
@@ -7,6 +7,7 @@ import {
   loadDeleteConfirmAction,
   loadFirstObservedAction,
   refuseDerivedDateAction,
+  setProjectStartPlanAction,
   type PlanWriteOutcome,
 } from '@/app/p/[projectId]/plan/actions';
 
@@ -237,3 +238,50 @@ export function DerivedDateCell({
     </div>
   );
 }
+
+/** Plan strip action: *Set Project start* when the Project has none (2.11 / Q1→B). */
+export function SetProjectStartForm({
+  projectId,
+  proposedStart,
+}: {
+  readonly projectId: string;
+  readonly proposedStart: string;
+}) {
+  const [pending, start] = useTransition();
+  const [refuse, setRefuse] = useState<string | null>(null);
+  const [value, setValue] = useState(proposedStart);
+
+  return (
+    <form
+      style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 8 }}
+      data-testid="set-project-start"
+      action={(fd) => {
+        start(async () => {
+          setRefuse(null);
+          const outcome = await setProjectStartPlanAction(fd);
+          if (!outcome.ok) setRefuse(refuseMessage(outcome));
+        });
+      }}
+    >
+      <input type="hidden" name="projectId" value={projectId} />
+      <label>
+        Set Project start{' '}
+        <input
+          type="date"
+          name="projectStart"
+          value={value}
+          onChange={(e) => setValue(e.target.value)}
+          required
+        />
+      </label>
+      <button type="submit" disabled={pending}>
+        Set Project start
+      </button>
+      {refuse !== null ? (
+        <p className="caption" role="alert">
+          {refuse}
+        </p>
+      ) : null}
+    </form>
+  );
+}
diff --git a/apps/web/src/components/shell.tsx b/apps/web/src/components/shell.tsx
index 42d243b..c7134a4 100644
--- a/apps/web/src/components/shell.tsx
+++ b/apps/web/src/components/shell.tsx
@@ -16,6 +16,7 @@ const SURFACES = [
   { slug: 'mapping', glyph: '⇄', messageKey: 'shell.surfaces.mapping' as const },
   { slug: 'baselines', glyph: '▤', messageKey: 'shell.surfaces.baselines' as const },
   { slug: 'connectors', glyph: '⟲', messageKey: 'shell.surfaces.connectors' as const },
+  { slug: 'settings', glyph: '⚙', messageKey: 'shell.surfaces.settings' as const },
 ];
 
 export interface ShellProps {
diff --git a/apps/web/src/server/composition.ts b/apps/web/src/server/composition.ts
index 9e81906..0bc313d 100644
--- a/apps/web/src/server/composition.ts
+++ b/apps/web/src/server/composition.ts
@@ -119,7 +119,14 @@ import {
   getWpDeleteConfirm,
   proposedCompleteDay,
   refuseDerivedDateEdit,
+  setProjectStart,
+  clearProjectStart,
+  patchProjectFinishSetting,
+  patchDataDateSetting,
+  dataDateAdvancePreview,
   DERIVED_DATE_TEACHING,
+  PROJECT_FINISH_TEACHING,
+  NO_PROJECT_START_YET,
 } from '@momo/app';
 import { buildResetPasswordMail } from '@momo/i18n';
 import { mailerConsoleOn, productClockOn, systemClock, uuidV7IdsOn } from '@momo/adapters';
@@ -528,6 +535,30 @@ export async function deleteWp(input: unknown, ctx?: RequestContext) {
   return deleteWorkPackage(writeDeps(), context, input);
 }
 
+/** Set Project start (+ Data Date today) through the fence. */
+export async function setProjectStartSetting(input: unknown, ctx?: RequestContext) {
+  const context = ctx ?? (await requestContext());
+  return setProjectStart(writeDeps(), context, input);
+}
+
+/** Clear Project start (Q2→A). */
+export async function clearProjectStartSetting(input: unknown, ctx?: RequestContext) {
+  const context = ctx ?? (await requestContext());
+  return clearProjectStart(writeDeps(), context, input);
+}
+
+/** Set or clear Project finish after teaching confirm. */
+export async function patchProjectFinish(input: unknown, ctx?: RequestContext) {
+  const context = ctx ?? (await requestContext());
+  return patchProjectFinishSetting(writeDeps(), context, input);
+}
+
+/** Standalone Data Date advance. */
+export async function patchDataDate(input: unknown, ctx?: RequestContext) {
+  const context = ctx ?? (await requestContext());
+  return patchDataDateSetting(writeDeps(), context, input);
+}
+
 /** First-observed activity evidence for the complete flow (read-only). */
 export async function firstObservedForWp(
   input: { projectId: string; wpId: string },
@@ -546,19 +577,24 @@ export async function wpDeleteConfirm(
   return getWpDeleteConfirm(writeDeps(), context, input);
 }
 
-/** Project data_date + per-WP constraints for the thin plan UI. */
+/** Project schedule settings + constraints for Plan / settings thin UI. */
 export async function planThinUiState(projectId: string, ctx?: RequestContext) {
   const context = ctx ?? (await requestContext());
   return getPlanThinUiState(writeDeps(), context, { projectId });
 }
 
+export {
+  DERIVED_DATE_TEACHING,
+  PROJECT_FINISH_TEACHING,
+  NO_PROJECT_START_YET,
+  dataDateAdvancePreview,
+};
+
 /** Teaching refuse for a derived-date edit (UX-DR12) — nothing written. */
 export function refuseDerivedDate() {
   return refuseDerivedDateEdit();
 }
 
-export { DERIVED_DATE_TEACHING };
-
 /** Product-clock calendar day for the complete-flow finish proposal (UX-DR13). */
 export function proposedCompleteFinish(tzOffsetMinutes: number): string {
   return proposedCompleteDay(webClock().now(), tzOffsetMinutes);
diff --git a/packages/app/src/audit/payloads.ts b/packages/app/src/audit/payloads.ts
index 08e4064..364b3f0 100644
--- a/packages/app/src/audit/payloads.ts
+++ b/packages/app/src/audit/payloads.ts
@@ -114,8 +114,25 @@ export const AUDIT_PAYLOAD_BY_ACTION = {
   'schedule.apply_plan_change': z
     .object({
       kind: z.string(),
-      runSeq: z.number().int(),
+      runSeq: z.number().int().nullable(),
       haltedReason: z.string().nullable(),
+      warnings: z.array(z.string()).optional(),
+      before: z
+        .object({
+          projectStart: z.string().nullable(),
+          projectFinish: z.string().nullable(),
+          dataDate: z.string().nullable(),
+        })
+        .strict()
+        .optional(),
+      after: z
+        .object({
+          projectStart: z.string().nullable(),
+          projectFinish: z.string().nullable(),
+          dataDate: z.string().nullable(),
+        })
+        .strict()
+        .optional(),
     })
     .strict(),
 } as const;
diff --git a/packages/app/src/index.ts b/packages/app/src/index.ts
index 7be718a..d241e7d 100644
--- a/packages/app/src/index.ts
+++ b/packages/app/src/index.ts
@@ -146,5 +146,12 @@ export {
   getWpDeleteConfirm,
   proposedCompleteDay,
   refuseDerivedDateEdit,
+  setProjectStart,
+  clearProjectStart,
+  patchProjectFinishSetting,
+  patchDataDateSetting,
+  dataDateAdvancePreview,
   DERIVED_DATE_TEACHING,
+  PROJECT_FINISH_TEACHING,
+  NO_PROJECT_START_YET,
 } from './schedule/plan-edit';
diff --git a/packages/app/src/schedule/apply-plan-change.ts b/packages/app/src/schedule/apply-plan-change.ts
index ec76406..06c75c0 100644
--- a/packages/app/src/schedule/apply-plan-change.ts
+++ b/packages/app/src/schedule/apply-plan-change.ts
@@ -1,22 +1,26 @@
 /**
- * THE ONE FENCE (stories 2.9 / 2.10, AR-43 / AD-25 / AD-27):
+ * THE ONE FENCE (stories 2.9 / 2.10 / 2.11, AR-43 / AD-25 / AD-27):
  * `applyPlanChange(ctx, mutation)` writes a scheduling / plan input and recalculates in one
  * tenant transaction under the per-Project exclusive lock.
  *
- * Closed mutation union: duration / constraint / dependency patches (2.9), plus WP authoring,
- * actuals, Recorded %, Custom Fields, and the actuals+Data Date compound (2.10).
- * `checkPlanInvariants` runs before every write; 23503/23514 map to `invalid_input`.
+ * Closed mutation union: duration / constraint / dependency patches (2.9), WP authoring,
+ * actuals, Recorded %, Custom Fields, and the actuals+Data Date compound (2.10), plus the
+ * three Project schedule settings (2.11). `checkPlanInvariants` runs before every write;
+ * 23503/23514 map to `invalid_input`. Clearing Project start skips recalculation (Q2→A).
  */
 import { z } from 'zod';
+import { and, eq } from 'drizzle-orm';
+import { projectDate, type PlanGraphEdge, type PlanGraphWp, type ScheduleRunCause } from '@momo/domain';
 import type { Bound } from '../../../db/src/bound';
 import { lockWatermark } from '../../../db/src/watermark-lock';
 import { planInputRepositoryOn } from '../../../db/src/repositories/plan-input';
 import { scheduleRepositoryOn } from '../../../db/src/repositories/schedule';
-import type { PlanGraphEdge, PlanGraphWp, ScheduleRunCause } from '@momo/domain';
+import * as s from '../../../db/src/schema';
 import { authorize, PROJECT_REACH_ROLES } from '../authz/authorize';
 import type { RequestContext } from '../authz/request-context';
 import { audit, type AuditSink } from '../audit';
 import { isProjectNotFound } from '../ports/project-read';
+import { projectNotFound } from '../../../db/src/project-not-found';
 import type { AuditedWriteDeps, WriteStamp } from '../ports/audited-write';
 import type { SchedulingBound } from '../ports/schedule-write';
 import { fail, type Result } from '../result';
@@ -158,6 +162,27 @@ const planMutationBase = z.discriminatedUnion('kind', [
     dateValue: isoDate.nullable().optional(),
     selectValue: z.string().nullable().optional(),
   }),
+  z.object({
+    kind: z.literal('set_project_start'),
+    projectId: id,
+    projectStart: isoDate,
+    /** Omit to default to today in the Project tz (FR-43). */
+    dataDate: isoDate.optional(),
+  }),
+  z.object({
+    kind: z.literal('clear_project_start'),
+    projectId: id,
+  }),
+  z.object({
+    kind: z.literal('patch_project_finish'),
+    projectId: id,
+    projectFinish: isoDate.nullable(),
+  }),
+  z.object({
+    kind: z.literal('patch_data_date'),
+    projectId: id,
+    dataDate: isoDate,
+  }),
 ]);
 
 /** asap ⇔ null date; must_* ⇔ non-null date. Finish-before-start refused for actuals. */
@@ -271,6 +296,12 @@ function runCause(mutation: PlanMutation): ScheduleRunCause {
       return mutation.advanceDataDate !== undefined ? 'data_date' : 'actual_dates';
     case 'patch_recorded_pct':
       return 'progress';
+    case 'set_project_start':
+    case 'clear_project_start':
+    case 'patch_project_finish':
+      return 'project_dates';
+    case 'patch_data_date':
+      return 'data_date';
   }
 }
 
@@ -447,6 +478,47 @@ async function applyMutation(
     case 'set_custom_field_value':
       await planInput.setCustomFieldValue(mutation);
       return warnings;
+    case 'set_project_start': {
+      const [project] = await bound.tx
+        .select({ tzOffsetMinutes: s.project.tzOffsetMinutes })
+        .from(s.project)
+        .where(and(eq(s.project.tenantId, bound.tenantId), eq(s.project.id, mutation.projectId)));
+      if (!project) throw projectNotFound(mutation.projectId);
+      const dataDate =
+        mutation.dataDate ?? projectDate(stamp.at.toISOString(), project.tzOffsetMinutes);
+      await planInput.patchProjectStart({
+        projectId: mutation.projectId,
+        projectStart: mutation.projectStart,
+        dataDate,
+      });
+      return warnings;
+    }
+    case 'clear_project_start':
+      await planInput.patchProjectStart({
+        projectId: mutation.projectId,
+        projectStart: null,
+      });
+      return warnings;
+    case 'patch_project_finish':
+      await planInput.patchProjectFinish({
+        projectId: mutation.projectId,
+        projectFinish: mutation.projectFinish,
+      });
+      return warnings;
+    case 'patch_data_date': {
+      const blockers = await planInput.dataDateBlockers(mutation.projectId, mutation.dataDate);
+      if (blockers.length > 0) {
+        refuse('invalid_input', {
+          dataDate: ['before_latest_actual_finish'],
+          blockingWpIds: blockers.map((b) => b.wpId),
+        });
+      }
+      await planInput.patchDataDate({
+        projectId: mutation.projectId,
+        dataDate: mutation.dataDate,
+      });
+      return warnings;
+    }
   }
 }
 
@@ -476,6 +548,17 @@ export async function applyPlanChange<Handle>(
       async (scope, stamp: WriteStamp, mutation) => {
         const bound = asBound(scope.bound);
 
+        const [beforeSettings] = await bound.tx
+          .select({
+            projectStart: s.project.projectStart,
+            projectFinish: s.project.projectFinish,
+            dataDate: s.project.dataDate,
+          })
+          .from(s.project)
+          .where(
+            and(eq(s.project.tenantId, bound.tenantId), eq(s.project.id, mutation.projectId)),
+          );
+
         const proposed = await proposedGraph(bound, mutation);
         const gate = checkPlanInvariants(proposed.plan, proposed.edges);
         if (!gate.ok) refuse(gate.error.code, gate.error.details);
@@ -526,6 +609,60 @@ export async function applyPlanChange<Handle>(
           throw error;
         }
 
+        const settingsKinds = new Set([
+          'set_project_start',
+          'clear_project_start',
+          'patch_project_finish',
+          'patch_data_date',
+        ]);
+        const settingsAudit =
+          settingsKinds.has(mutation.kind) && beforeSettings !== undefined
+            ? await (async () => {
+                const [after] = await bound.tx
+                  .select({
+                    projectStart: s.project.projectStart,
+                    projectFinish: s.project.projectFinish,
+                    dataDate: s.project.dataDate,
+                  })
+                  .from(s.project)
+                  .where(
+                    and(
+                      eq(s.project.tenantId, bound.tenantId),
+                      eq(s.project.id, mutation.projectId),
+                    ),
+                  );
+                return {
+                  before: {
+                    projectStart: beforeSettings.projectStart,
+                    projectFinish: beforeSettings.projectFinish,
+                    dataDate: beforeSettings.dataDate,
+                  },
+                  after: {
+                    projectStart: after?.projectStart ?? null,
+                    projectFinish: after?.projectFinish ?? null,
+                    dataDate: after?.dataDate ?? null,
+                  },
+                };
+              })()
+            : undefined;
+
+        // Q2→A: clearing Project start restores "no project start yet" — FR-6b does not run.
+        if (mutation.kind === 'clear_project_start') {
+          await audit.record(scope, stamp, 'schedule.apply_plan_change', mutation.projectId, {
+            kind: mutation.kind,
+            runSeq: null,
+            haltedReason: null,
+            ...(settingsAudit !== undefined ? settingsAudit : {}),
+            ...(warnings.length > 0 ? { warnings } : {}),
+          });
+          return {
+            seq: 0,
+            kind: 'scheduled' as const,
+            haltedReason: null,
+            outputs: null,
+          };
+        }
+
         const resolved = await resolveScheduleInputs(bound, mutation.projectId, stamp);
         const result = await recalculateProject({
           bound,
@@ -545,6 +682,7 @@ export async function applyPlanChange<Handle>(
           kind: mutation.kind,
           runSeq: result.seq,
           haltedReason: result.haltedReason,
+          ...(settingsAudit !== undefined ? settingsAudit : {}),
           ...(warnings.length > 0 ? { warnings } : {}),
         });
 
diff --git a/packages/app/src/schedule/plan-edit.ts b/packages/app/src/schedule/plan-edit.ts
index ba961d2..f228c78 100644
--- a/packages/app/src/schedule/plan-edit.ts
+++ b/packages/app/src/schedule/plan-edit.ts
@@ -1,6 +1,6 @@
 /**
- * Thin plan-edit helpers for story 2.10 UI (complete / delete confirm / derived-date refuse).
- * Reads and writes go through the fence or schedule-owned ports — never a second mutator.
+ * Thin plan-edit helpers for stories 2.10 / 2.11 UI (complete / delete / derived-date refuse;
+ * Project schedule settings). Reads and writes go through the fence — never a second mutator.
  */
 import { z } from 'zod';
 import { and, eq, isNull } from 'drizzle-orm';
@@ -23,6 +23,34 @@ import { readFirstObservedActivity } from './first-observed';
 export const DERIVED_DATE_TEACHING =
   'Planned dates are derived. To pin a date, set a constraint.';
 
+/** Exact teaching copy for set/clear Project finish (FR-43, UX-DR5). */
+export const PROJECT_FINISH_TEACHING =
+  'This moves no work package. It changes what Float is measured against, and lets Float go negative';
+
+export const NO_PROJECT_START_YET = 'no project start yet';
+
+/** Advance preview copy (UX-DR14) — count is remaining leaves without actual finish. */
+export function dataDateAdvancePreview(dataDate: string, remainingCount: number): string {
+  // Format as "26 Sep" style without locale libs — ISO YYYY-MM-DD → day mon abbrev.
+  const [, m, d] = dataDate.split('-').map(Number);
+  const months = [
+    'Jan',
+    'Feb',
+    'Mar',
+    'Apr',
+    'May',
+    'Jun',
+    'Jul',
+    'Aug',
+    'Sep',
+    'Oct',
+    'Nov',
+    'Dec',
+  ];
+  const label = `${d} ${months[(m ?? 1) - 1] ?? 'Jan'}`;
+  return `Advancing to ${label} re-dates ${remainingCount} remaining work packages`;
+}
+
 function asBound(scheduling: SchedulingBound): Bound {
   return scheduling as Bound;
 }
@@ -32,14 +60,18 @@ export function proposedCompleteDay(now: Date, tzOffsetMinutes: number): string
   return projectDate(now.toISOString(), tzOffsetMinutes);
 }
 
-/** Read-only: Project data_date + per-WP constraints for the thin plan UI. */
+/** Read-only: Project schedule settings + per-WP constraints for the thin plan / settings UI. */
 export async function getPlanThinUiState<Handle>(
   deps: ApplyPlanChangeDeps<Handle>,
   ctx: RequestContext,
   input: { readonly projectId: string },
 ): Promise<
   Result<{
+    readonly projectStart: string | null;
+    readonly projectFinish: string | null;
     readonly dataDate: string | null;
+    readonly tzOffsetMinutes: number;
+    readonly remainingLeafCount: number;
     readonly constraints: ReadonlyMap<
       string,
       { readonly constraintType: string; readonly constraintDate: string | null }
@@ -52,7 +84,12 @@ export async function getPlanThinUiState<Handle>(
   const value = await deps.transaction(deps.handle, ctx.tenantId, async (scope) => {
     const bound = asBound(scope.bound);
     const [project] = await bound.tx
-      .select({ dataDate: s.project.dataDate })
+      .select({
+        projectStart: s.project.projectStart,
+        projectFinish: s.project.projectFinish,
+        dataDate: s.project.dataDate,
+        tzOffsetMinutes: s.project.tzOffsetMinutes,
+      })
       .from(s.project)
       .where(and(eq(s.project.tenantId, bound.tenantId), eq(s.project.id, input.projectId)));
     if (!project) throw projectNotFound(input.projectId);
@@ -72,6 +109,9 @@ export async function getPlanThinUiState<Handle>(
         ),
       );
 
+    const planInput = planInputRepositoryOn(bound);
+    const remainingLeafCount = await planInput.remainingLeafCount(input.projectId);
+
     const constraints = new Map(
       rows.map(
         (r) =>
@@ -81,7 +121,14 @@ export async function getPlanThinUiState<Handle>(
           ] as const,
       ),
     );
-    return { dataDate: project.dataDate, constraints };
+    return {
+      projectStart: project.projectStart,
+      projectFinish: project.projectFinish,
+      dataDate: project.dataDate,
+      tzOffsetMinutes: project.tzOffsetMinutes,
+      remainingLeafCount,
+      constraints,
+    };
   });
   return ok(value);
 }
@@ -191,3 +238,83 @@ export async function deleteWorkPackage<Handle>(
     wpId: parsed.data.wpId,
   });
 }
+
+const setStartSchema = z.object({
+  projectId: z.string().min(1),
+  projectStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
+  dataDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
+});
+
+/** Set Project start (+ Data Date defaulting to today inside the fence). */
+export async function setProjectStart<Handle>(
+  deps: ApplyPlanChangeDeps<Handle>,
+  ctx: RequestContext,
+  input: unknown,
+): Promise<Result<ApplyPlanChangeResult>> {
+  const parsed = setStartSchema.safeParse(input);
+  if (!parsed.success) return fail('invalid_input');
+  return applyPlanChange(deps, ctx, {
+    kind: 'set_project_start',
+    projectId: parsed.data.projectId,
+    projectStart: parsed.data.projectStart,
+    ...(parsed.data.dataDate !== undefined ? { dataDate: parsed.data.dataDate } : {}),
+  });
+}
+
+const projectIdSchema = z.object({ projectId: z.string().min(1) });
+
+/** Clear Project start — returns to "no project start yet" without recalculation (Q2→A). */
+export async function clearProjectStart<Handle>(
+  deps: ApplyPlanChangeDeps<Handle>,
+  ctx: RequestContext,
+  input: unknown,
+): Promise<Result<ApplyPlanChangeResult>> {
+  const parsed = projectIdSchema.safeParse(input);
+  if (!parsed.success) return fail('invalid_input');
+  return applyPlanChange(deps, ctx, {
+    kind: 'clear_project_start',
+    projectId: parsed.data.projectId,
+  });
+}
+
+const finishSchema = z.object({
+  projectId: z.string().min(1),
+  projectFinish: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
+  /** Must be true — UI shows PROJECT_FINISH_TEACHING before submit. */
+  confirmed: z.literal(true),
+});
+
+/** Set or clear Project finish after teaching confirm. */
+export async function patchProjectFinishSetting<Handle>(
+  deps: ApplyPlanChangeDeps<Handle>,
+  ctx: RequestContext,
+  input: unknown,
+): Promise<Result<ApplyPlanChangeResult>> {
+  const parsed = finishSchema.safeParse(input);
+  if (!parsed.success) return fail('invalid_input');
+  return applyPlanChange(deps, ctx, {
+    kind: 'patch_project_finish',
+    projectId: parsed.data.projectId,
+    projectFinish: parsed.data.projectFinish,
+  });
+}
+
+const dataDateSchema = z.object({
+  projectId: z.string().min(1),
+  dataDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
+});
+
+/** Standalone Data Date advance through the fence. */
+export async function patchDataDateSetting<Handle>(
+  deps: ApplyPlanChangeDeps<Handle>,
+  ctx: RequestContext,
+  input: unknown,
+): Promise<Result<ApplyPlanChangeResult>> {
+  const parsed = dataDateSchema.safeParse(input);
+  if (!parsed.success) return fail('invalid_input');
+  return applyPlanChange(deps, ctx, {
+    kind: 'patch_data_date',
+    projectId: parsed.data.projectId,
+    dataDate: parsed.data.dataDate,
+  });
+}
diff --git a/packages/app/src/schedule/recalculate-project.ts b/packages/app/src/schedule/recalculate-project.ts
index 618f6fb..2796a82 100644
--- a/packages/app/src/schedule/recalculate-project.ts
+++ b/packages/app/src/schedule/recalculate-project.ts
@@ -108,6 +108,10 @@ export async function resolveScheduleInputs(
   if (plan.project.projectStart === null) {
     refuse('invalid_input', { projectStart: ['required'] });
   }
+  if (plan.project.dataDate === null) {
+    // After 2.11, Data Date is written with Project start — never invent one on resolve.
+    refuse('invalid_input', { dataDate: ['required'] });
+  }
 
   // Synthetic calendar until 2.12 — weekends must be listed explicitly (domain applies none).
   let calendarVersionSeq = plan.calendar?.seq ?? null;
@@ -135,7 +139,7 @@ export async function resolveScheduleInputs(
     };
   }
 
-  const dataDate = plan.project.dataDate ?? stamp.at.toISOString().slice(0, 10);
+  const dataDate = plan.project.dataDate;
   const milestoneIds = new Set(plan.wps.filter((w) => w.isMilestone).map((w) => w.id));
 
   const wps: ScheduleWp[] = plan.wps.map((w) => {
diff --git a/packages/db/src/repositories/plan-input/index.ts b/packages/db/src/repositories/plan-input/index.ts
index 7c79dc2..52d7795 100644
--- a/packages/db/src/repositories/plan-input/index.ts
+++ b/packages/db/src/repositories/plan-input/index.ts
@@ -1,7 +1,7 @@
 /**
- * AD-25 plan-input writers (stories 2.9 / 2.10) — duration / constraint / dependency patches,
- * WP authoring (create / soft-delete / re-parent / patch), actuals, Recorded %, Custom Fields,
- * and the actuals-compound Data Date advance.
+ * AD-25 plan-input writers (stories 2.9 / 2.10 / 2.11) — duration / constraint / dependency
+ * patches, WP authoring, actuals, Recorded %, Custom Fields, the actuals-compound Data Date
+ * advance, and the three Project schedule settings (start / finish / data_date).
  *
  * Bound to one transaction and one Tenant. Only `packages/app/src/schedule` may import this
  * module (`.dependency-cruiser.cjs` `SCHEDULING_REPOSITORIES`). Every write goes through the
@@ -13,7 +13,7 @@
  * 23503 / 23514 from the leaf and type CHECKs / FKs surface as Postgres errors; the fence maps
  * them to `invalid_input` with the plan-invariant rule codes.
  */
-import { and, eq, or, sql } from 'drizzle-orm';
+import { and, eq, isNull, or, sql } from 'drizzle-orm';
 import type { Bound } from '../../bound';
 import { projectNotFound } from '../../project-not-found';
 import * as s from '../../schema';
@@ -138,6 +138,22 @@ export interface PatchDataDateCommand {
   readonly dataDate: string;
 }
 
+export interface PatchProjectStartCommand {
+  readonly projectId: string;
+  /** ISO date, or `null` to clear (Q2→A — returns to "no project start yet"). */
+  readonly projectStart: string | null;
+  /**
+   * When setting start, Data Date is written in the same statement (FR-43).
+   * Omit / ignore when clearing.
+   */
+  readonly dataDate?: string | null;
+}
+
+export interface PatchProjectFinishCommand {
+  readonly projectId: string;
+  readonly projectFinish: string | null;
+}
+
 export interface CreateCustomFieldDefinitionCommand {
   readonly projectId: string;
   readonly definitionId: string;
@@ -721,6 +737,109 @@ export function planInputRepositoryOn(bound: Bound) {
       if (updated.length === 0) throw projectNotFound(command.projectId);
     },
 
+    /**
+     * Set or clear Project start. Setting also writes `data_date` in the same UPDATE when
+     * provided (FR-43 first action). Clearing leaves finish/data_date alone (Q2→A).
+     */
+    async patchProjectStart(command: PatchProjectStartCommand): Promise<void> {
+      await requireProject(bound, command.projectId);
+      const set =
+        command.projectStart === null
+          ? { projectStart: null as string | null }
+          : {
+              projectStart: command.projectStart,
+              ...(command.dataDate !== undefined ? { dataDate: command.dataDate } : {}),
+            };
+      const updated = await tx
+        .update(s.project)
+        .set(set)
+        .where(and(eq(s.project.tenantId, tenantId), eq(s.project.id, command.projectId)))
+        .returning({ id: s.project.id });
+      if (updated.length === 0) throw projectNotFound(command.projectId);
+    },
+
+    async patchProjectFinish(command: PatchProjectFinishCommand): Promise<void> {
+      await requireProject(bound, command.projectId);
+      const updated = await tx
+        .update(s.project)
+        .set({ projectFinish: command.projectFinish })
+        .where(and(eq(s.project.tenantId, tenantId), eq(s.project.id, command.projectId)))
+        .returning({ id: s.project.id });
+      if (updated.length === 0) throw projectNotFound(command.projectId);
+    },
+
+    /**
+     * Leaf WPs whose actual finish is after `dataDate` — blockers for an early Data Date
+     * (FR-43). Head = max seq per WP from `wp_status_event` (same rule as schedule load).
+     */
+    async dataDateBlockers(
+      projectId: string,
+      dataDate: string,
+    ): Promise<readonly { readonly wpId: string; readonly actualFinish: string }[]> {
+      await requireProject(bound, projectId);
+      const events = await tx
+        .select({
+          wpId: s.wpStatusEvent.wpId,
+          actualFinish: s.wpStatusEvent.actualFinish,
+          seq: s.wpStatusEvent.seq,
+        })
+        .from(s.wpStatusEvent)
+        .where(
+          and(eq(s.wpStatusEvent.tenantId, tenantId), eq(s.wpStatusEvent.projectId, projectId)),
+        );
+      const heads = new Map<string, { readonly actualFinish: string | null; readonly seq: number }>();
+      for (const row of events) {
+        const prev = heads.get(row.wpId);
+        if (prev === undefined || row.seq > prev.seq) {
+          heads.set(row.wpId, { actualFinish: row.actualFinish, seq: row.seq });
+        }
+      }
+      return [...heads.entries()]
+        .filter(([, h]) => h.actualFinish !== null && h.actualFinish > dataDate)
+        .map(([wpId, h]) => ({ wpId, actualFinish: h.actualFinish! }))
+        .sort((a, b) => (a.wpId < b.wpId ? -1 : a.wpId > b.wpId ? 1 : 0));
+    },
+
+    /** Leaf count with no actual finish — Data Date advance preview (UX-DR14). */
+    async remainingLeafCount(projectId: string): Promise<number> {
+      await requireProject(bound, projectId);
+      const leaves = await tx
+        .select({ id: s.workPackage.id })
+        .from(s.workPackage)
+        .where(
+          and(
+            eq(s.workPackage.tenantId, tenantId),
+            eq(s.workPackage.projectId, projectId),
+            eq(s.workPackage.isLeaf, true),
+            isNull(s.workPackage.deletedAt),
+          ),
+        );
+      if (leaves.length === 0) return 0;
+      const events = await tx
+        .select({
+          wpId: s.wpStatusEvent.wpId,
+          actualFinish: s.wpStatusEvent.actualFinish,
+          seq: s.wpStatusEvent.seq,
+        })
+        .from(s.wpStatusEvent)
+        .where(
+          and(eq(s.wpStatusEvent.tenantId, tenantId), eq(s.wpStatusEvent.projectId, projectId)),
+        );
+      const heads = new Map<string, { readonly actualFinish: string | null; readonly seq: number }>();
+      for (const row of events) {
+        const prev = heads.get(row.wpId);
+        if (prev === undefined || row.seq > prev.seq) {
+          heads.set(row.wpId, { actualFinish: row.actualFinish, seq: row.seq });
+        }
+      }
+      const done = new Set(
+        [...heads.entries()]
+          .filter(([, h]) => h.actualFinish !== null)
+          .map(([wpId]) => wpId),
+      );
+      return leaves.filter((l) => !done.has(l.id)).length;
+    },
+
     async countCustomFieldDefinitions(projectId: string): Promise<number> {
       await requireProject(bound, projectId);
       const rows = await tx
diff --git a/packages/i18n/src/messages/en.json b/packages/i18n/src/messages/en.json
index a3456d7..ecfef53 100644
--- a/packages/i18n/src/messages/en.json
+++ b/packages/i18n/src/messages/en.json
@@ -417,6 +417,10 @@
       "connectors": {
         "label": "Connectors",
         "title": "Tracker Connectors"
+      },
+      "settings": {
+        "label": "Project settings",
+        "title": "Schedule settings"
       }
     },
     "roleLabels": {
diff --git a/packages/i18n/src/messages/ja.json b/packages/i18n/src/messages/ja.json
index a3456d7..8c7e865 100644
--- a/packages/i18n/src/messages/ja.json
+++ b/packages/i18n/src/messages/ja.json
@@ -417,6 +417,10 @@
       "connectors": {
         "label": "Connectors",
         "title": "Tracker Connectors"
+      },
+      "settings": {
+        "label": "プロジェクト設定",
+        "title": "スケジュール設定"
       }
     },
     "roleLabels": {
diff --git a/tests/schedule-closure.test.ts b/tests/schedule-closure.test.ts
index ceefb74..a608075 100644
--- a/tests/schedule-closure.test.ts
+++ b/tests/schedule-closure.test.ts
@@ -95,7 +95,7 @@ describe('AR-52 writers — AD-25 input writes stay inside the fence', () => {
     ).toEqual([]);
   });
 
-  it('only plan-input inserts work_package, wp_status_event, pct_override_event, CF tables, or patches data_date', () => {
+  it('only plan-input inserts work_package, wp_status_event, pct_override_event, CF tables, or patches project schedule settings', () => {
     const files = walk(join(ROOT, 'packages')).concat(walk(join(ROOT, 'apps')));
     const offenders: string[] = [];
     const patterns: { name: string; re: RegExp }[] = [
@@ -117,6 +117,14 @@ describe('AR-52 writers — AD-25 input writes stay inside the fence', () => {
         name: 'project dataDate update',
         re: /\.update\(\s*s\.project[\s\S]{0,200}dataDate|\.set\(\{[^}]*dataDate/,
       },
+      {
+        name: 'project projectStart update',
+        re: /\.update\(\s*s\.project[\s\S]{0,200}projectStart|\.set\(\{[^}]*projectStart/,
+      },
+      {
+        name: 'project projectFinish update',
+        re: /\.update\(\s*s\.project[\s\S]{0,200}projectFinish|\.set\(\{[^}]*projectFinish/,
+      },
     ];
     for (const file of files) {
       const text = readFileSync(file, 'utf8');
diff --git a/tests/watermark-concurrency.test.ts b/tests/watermark-concurrency.test.ts
index 84c3555..6b251b3 100644
--- a/tests/watermark-concurrency.test.ts
+++ b/tests/watermark-concurrency.test.ts
@@ -63,8 +63,8 @@ const reachable = await connectWriteHarness({
   requireDb: process.env.REQUIRE_DB === '1',
 });
 
-const PROBE_A = buildProbeTenant('xtprobe-wma', 940_000_000);
-const PROBE_B = buildProbeTenant('xtprobe-wmb', 950_000_000);
+const PROBE_A = buildProbeTenant('xtprobe-wma', 952_000_000);
+const PROBE_B = buildProbeTenant('xtprobe-wmb', 953_000_000);
 assertProbeTenantsDisjoint([PROBE_A, PROBE_B]);
 
 const IDS = idPort('xtwm-id');
diff --git a/_bmad-output/implementation-artifacts/spec-2-11-the-three-project-schedule-settings.md b/_bmad-output/implementation-artifacts/spec-2-11-the-three-project-schedule-settings.md
new file mode 100644
--- /dev/null
+++ b/_bmad-output/implementation-artifacts/spec-2-11-the-three-project-schedule-settings.md
+---
+title: 'Story 2.11 — The three Project schedule settings'
+type: 'feature'
+created: '2026-09-24'
+status: 'in-progress'
+route: 'dispatch'
+review_loop_iteration: 0
+baseline_commit: '5ff76f6885a2b677940a68f66ae1f8f9d351422c'
+context:
+  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
+---
+
+<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">
+
+## Intent
+
+**Problem:** Columns `project.project_start` / `project_finish` / `data_date` exist (2.1) and the fence can advance Data Date only as a compound of actuals (2.10 Q2→A). A PM still has no standalone way to set Project start (with Data Date defaulting to today), set or clear Project finish with teaching copy, or advance Data Date with a named re-date preview — so FR-43's "no project start yet" state and the three settings as scheduling inputs have no home.
+
+**Approach:** Widen `applyPlanChange` + `plan-input` for the three Project schedule settings (set/clear start; set/clear finish; standalone Data Date patch with latest-actual-finish refuse and remaining-WP preview). Ship a **dedicated Project settings route** for the three fields **plus** thin Plan "no project start yet" / *Set Project start* (Q1→B). Full schedule-strip chrome and What-moved stay 2.15. Keep the 2.10 actuals+Data Date compound unchanged.
+
+**Decisions (founder, 2026-09-24):**
+- **Keep the full spec**, with no split (~2355 tokens accepted; same posture as 2.10).
+- **Q1 → B.** Dedicated Project settings route for Project start / Project finish / Data Date, **plus** thin Plan "no project start yet" / *Set Project start*. Full strip chrome still 2.15.
+- **Q2 → A.** Allow clearing Project start — returns to "no project start yet"; FR-6b does not run; derived dates show "—" — so the named state stays reachable after first set.
+
+## Boundaries & Constraints
+
+**Always:**
+- One fence only — every write to `project.project_start` / `project_finish` / `data_date` goes through `app/schedule.applyPlanChange` → `db/repositories/plan-input` (AR-43 / AD-25). Widen the union; do not invent a second mutator.
+- No Project start → "no project start yet"; `FR-6b` does not run; derived date cells show "—" with that accessible name; Plan carries *Set Project start* (FR-43, UX-DR23). Clearing start is allowed and restores that state (Q2→A).
+- First *Set Project start* writes `project_start` and `data_date` in the **same** fence call. Data Date defaults to **today in the Project's tz** (Clock + `projectDate` / `tzOffsetMinutes`) — never a date read from plan contents, never UTC `toISOString().slice(0,10)` alone (FR-43; continuity from 2.10 review #7).
+- Thereafter only the PM advances Data Date. Standalone advance names the effect before confirm — e.g. "Advancing to 26 Sep re-dates 78 remaining work packages" — and never auto-advances (FR-43, UX-DR14). Count = leaf WPs with no `actualFinish` (remaining + in progress).
+- Data Date earlier than the latest actual finish is refused with the blocking WP ids (FR-43). Same rule already used by the 2.10 compound path — reuse it.
+- Setting or clearing Project finish is confirmed with exact teaching copy: "This moves no work package. It changes what Float is measured against, and lets Float go negative." Commit moves no WP dates; only the backward-pass anchor changes (FR-43, UX-DR5). Cause `project_dates`.
+- Surface (Q1→B): Project settings route owns editing the three fields (finish teaching confirm, Data Date advance with preview, clear start). Plan page owns the no-start named state and *Set Project start* only — not the full strip.
+- Every committed change to any of the three triggers full recalculation through the fence and is audited with author, time, and **previous value** (before/after) (FR-43, AR-26 / NFR-A1). Widen `schedule.apply_plan_change` audit payload accordingly. Clearing start: no recalc (FR-6b does not run); still audited with before/after.
+- Tracker Snapshot / ledger / Mapping / Mapping Rule never write the three settings or derived dates — AR-52 reachability from 2.9 continues to hold; widen writers grep for `project_start` / `project_finish` / `data_date` updates (FR-43).
+- Stop the silent `dataDate ?? stamp.at…` fallback in `resolveScheduleInputs` once a Project has a start: after start is set, `data_date` must be present (written by the set-start compound). While start is null, refuse recalc (`projectStart: required`) and do not invent a Data Date.
+
+**Never:**
+- No full schedule strip chrome, sticky Float anchor sentence, or What-moved band (2.15). Q1→B is settings route + thin Plan no-start / *Set Project start* only.
+- No Holiday Calendar publish (2.12); no tree grid / Schedule preset / exceptions rail (2.13–2.16); no Review Progress & Dates panel period-boundary offer (later Review surface); no Import confirm flow (Epic 3); no Gantt.
+- Do not treat the 2.10 actuals+Data Date compound as finishing this story; do not remove or fork it.
+- Do not auto-advance Data Date from Tracker/Mapping/ledger; do not default Data Date from latest actual or imported date; do not move WPs when finish is set/cleared; do not amend `0000_scheduling_schema.sql` (columns already exist — no migration).
+
+## I/O & Edge-Case Matrix
+
+| Scenario | Input / State | Expected Output / Behavior | Error Handling |
+|---|---|---|---|
+| No Project start | Project opened with `project_start` null | Plan: "no project start yet"; no FR-6b; *Set Project start* offered | N/A |
+| Set Project start | PM sets start (Data Date omitted) from Plan or settings | Same fence call writes start + `data_date = today (project tz)`; recalc; cause `project_dates`; audit before/after | Invalid date → refuse |
+| Clear Project start | PM clears start (Q2→A) | `project_start` (and scheduling) cleared; back to "no project start yet"; no FR-6b; dates "—"; audited | N/A |
+| Set/clear finish | First set or clear of `project_finish` after teaching confirm (settings route) | Finish persisted; WP early dates unchanged vs prior run; Float anchor flips; cause `project_dates` | Decline confirm → no write |
+| Data Date advance | PM chooses a later date on settings; preview shows remaining count | `data_date` patched; full recalc; cause `data_date`; audit before/after | Auto-advance never happens |
+| Data Date too early | Proposed date &lt; latest actual finish | Refuse; list blocking WP ids | Whole mutation rolls back |
+| Actuals compound | Actual finish after Data Date (2.10 path) | Unchanged compound behaviour | Decline advance → refuse |
+| Closure | New project-settings writers | AR-52 grep covers `project_start` / `project_finish` / `data_date`; only fence imports plan-input | Fail CI on leak |
+
+</frozen-after-approval>
+
+## Code Map
+
+- `packages/app/src/schedule/apply-plan-change.ts` — widen `planMutationSchema` with `set_project_start` (optional explicit `dataDate`; default today), `clear_project_start` (Q2→A), `patch_project_finish` (nullable), `patch_data_date`; map causes (`project_dates` / `data_date`); load before values for audit; call new plan-input writers; keep actuals compound. Clear-start skips recalc. Do not change auth/tx/lock shape.
+- `packages/app/src/schedule/recalculate-project.ts` — `resolveScheduleInputs`: remove silent UTC Data Date fallback when start exists; keep `projectStart === null` → refuse. First set-start path writes both columns before resolve runs.
+- `packages/db/src/repositories/plan-input/index.ts` — add `patchProjectStart` (nullable for clear), `patchProjectFinish`; keep/extend `patchDataDate`; optionally one `patchProjectScheduleSettings` helper. Latest-actual-finish scan for refuse (reuse status heads). Reuse `requireProject`.
+- `packages/db/src/repositories/schedule/index.ts` — already loads the three settings; no schema change. May expose a read helper for settings UI (current values + latest actual finish + remaining leaf count).
+- `apps/web/src/app/p/[projectId]/settings/` (new, Q1→B) — Project settings route: edit the three fields; finish teaching confirm; Data Date advance with named remaining count; clear start. Server actions → fence only.
+- `apps/web/src/app/p/[projectId]/plan/` + `packages/app/src/schedule/plan-edit.ts` — thin Plan: "no project start yet" + *Set Project start* only; colocate with 2.10 thin UI. No strip chrome.
+- `packages/app/src/audit/payloads.ts` — widen `schedule.apply_plan_change` with optional `before`/`after` for the three dates (and keep `kind` / `runSeq` / `haltedReason`).
+- `packages/domain/src/schedule/cause.ts` — `ScheduleRunCause` already has `data_date` and `project_dates`; do not invent parallel names.
+- `packages/app/src/schedule/plan-edit.ts` `proposedCompleteDay` / `projectDate` — reuse for "today" in project tz with Clock.
+- `.dependency-cruiser.cjs` + `tests/schedule-closure.test.ts` — widen writers grep for `projectStart` / `projectFinish` / `dataDate` updates on `s.project`.
+- `tests/schedule/fence*.test.ts` (new `fence-2-11` cases) — set start+today; clear start → no-start state; finish set/clear leaves early dates; Data Date refuse with blockers; advance preview count; audit before/after; AR-52 still green.
+- Continuity from 2.10 (done): compound actuals+`advanceDataDate` stays; Never was "No standalone Project settings UI (2.11)" — this story owns that surface (Q1→B).
+
+## Tasks & Acceptance
+
+**Execution:**
+- [x] `packages/db/src/repositories/plan-input/*` — project start (set/clear) / finish / data_date writers; latest-actual-finish blockers; no migration.
+- [x] `packages/app/src/schedule/apply-plan-change.ts` + `recalculate-project.ts` + `audit/payloads.ts` — widen mutation union; stop silent Data Date invent; clear-start without recalc; audit before/after; causes mapped.
+- [x] `apps/web/.../settings/` + Plan thin UI + server actions (Q1→B) — settings route for three fields; Plan no-start / *Set Project start*; finish teaching confirm; Data Date advance with named remaining count.
+- [x] `tests/schedule-closure.test.ts` + `tests/schedule/fence-2-11*.test.ts` — matrix + AR-52 coverage for the three writers (incl. clear start).
+- [x] `_bmad-output/implementation-artifacts/deferred-work.md` — annotate any 2.11 residues (period-boundary offer, full strip) only if they surface during implement.
+
+**Acceptance Criteria:**
+- Given a Project with no Project start, when it is opened, then "no project start yet" replaces derived dates, FR-6b does not run, and *Set Project start* is the offered action on Plan.
+- Given *Set Project start*, when it commits, then Data Date is set in the same action to today (project tz), never from plan contents, and a `schedule_run` with cause `project_dates` exists.
+- Given clear of Project start (Q2→A), when it commits, then the Project returns to "no project start yet", FR-6b does not run, and derived dates show "—".
+- Given set or clear of Project finish after teaching confirm on Project settings, when it commits, then no WP early dates move; only the Float anchor changes.
+- Given a Data Date earlier than the latest actual finish, when submitted, then it is refused with the blocking WPs.
+- Given a Data Date advance offer on Project settings, when shown, then it names the remaining-WP re-date count and never advances without an explicit PM confirm.
+- Given any of the three settings changing, when it commits, then (when start is present) fence recalculation runs and audit carries author, time, and previous value.
+- Given Tracker / Mapping / ledger activity, when it occurs, then WP dates and the three settings are unchanged; AR-52 still passes.
+- Given `pnpm lint`, `pnpm typecheck`, `pnpm depcruise` and `pnpm test`, when they run, then all exit 0.
+
+## Implementation Notes
+
+- 2026-09-24: Baseline `5ff76f6` on `main`. Approved Checkpoint 1 (Keep full; Q1→B; Q2→A). Sprint → `in-progress`.
+- Fence widened: `set_project_start` (+ data_date same UPDATE), `clear_project_start` (no recalc), `patch_project_finish`, `patch_data_date` (blockers via status heads). Audit payload carries before/after for settings kinds; `runSeq` nullable on clear.
+- `resolveScheduleInputs` refuses null `dataDate` once start exists — no silent UTC invent.
+- UI: `/p/[projectId]/settings` + Plan no-start band / *Set Project start*; shell nav pin; finish teaching + advance preview copy.
+- Tests: `fence-2-11.test.ts` covers matrix; schedule-closure greps projectStart/Finish; watermark probe seqs moved off 940/950 to avoid parallel collision with fence 2.9/2.10.
+- Deferred intentionally (per Never): full strip chrome (2.15), period-boundary Data Date offer (Review), calendar publish (2.12). No deferred-work append needed beyond Design Notes.
+
+## Spec Change Log
+
+## Review Triage Log
+
+## Design Notes
+
+**Widen, don't fork.** 2.10 left standalone settings to this story. The product rule remains one fence; the actuals compound is one statement about "how far the plan has got" and stays. Standalone `patch_data_date` is the PM's deliberate advance of the plan through time.
+
+**Start + Data Date are one first action.** A Project is created with none. Scheduling cannot invent a Data Date on resolve — that would hide the FR-43 default rule. The set-start mutation is the only place "defaults to today" is applied.
+
+**Finish moves no WP.** Backward-pass anchor only. Teaching copy is product text, not a paraphrase — keep the epic wording.
+
+**Advance preview count.** Leaves without `actualFinish` match "remaining work packages" in the UX example without a dry-run of the engine. Period-boundary suggestion lives on Review Progress & Dates, not here.
+
+**2.15 still owns strip chrome.** Q1→B ships the Project settings route and Plan no-start / *Set Project start* only. Sticky Float-anchor sentence, What-moved, and polished inline strip edits that mirror settings 1:1 are 2.15's job.
+
+**Clear start (Q2→A).** Clearing start is a fence write without recalculation — the Project is not scheduled, so there is no run to append with outputs. Audit still records before/after.
+
+## Verification
+
+**Commands:**
+- `pnpm lint` — expected: exit 0
+- `pnpm typecheck` — expected: exit 0
+- `pnpm depcruise` — expected: exit 0
+- `pnpm test` — expected: exit 0 (includes schedule-closure + fence-2-11 cases)
diff --git a/apps/web/src/app/p/[projectId]/settings/actions.ts b/apps/web/src/app/p/[projectId]/settings/actions.ts
new file mode 100644
--- /dev/null
+++ b/apps/web/src/app/p/[projectId]/settings/actions.ts
+'use server';
+
+import { revalidatePath } from 'next/cache';
+import {
+  clearProjectStartSetting,
+  patchDataDate,
+  patchProjectFinish,
+  setProjectStartSetting,
+  requestContext,
+} from '@/server/composition';
+
+export type SettingsWriteOutcome =
+  | { readonly ok: true }
+  | {
+      readonly ok: false;
+      readonly code: string;
+      readonly messageKey: string;
+      readonly details?: Readonly<Record<string, readonly string[]>>;
+    };
+
+function refuseOutcome(result: {
+  readonly ok: false;
+  readonly error: {
+    readonly code: string;
+    readonly messageKey: string;
+    readonly details?: Readonly<Record<string, readonly string[]>>;
+  };
+}): SettingsWriteOutcome {
+  return {
+    ok: false,
+    code: result.error.code,
+    messageKey: result.error.messageKey,
+    ...(result.error.details !== undefined ? { details: result.error.details } : {}),
+  };
+}
+
+function revalidateSettings(projectId: string) {
+  revalidatePath(`/p/${projectId}/settings`);
+  revalidatePath(`/p/${projectId}/plan`);
+}
+
+export async function setProjectStartAction(formData: FormData): Promise<SettingsWriteOutcome> {
+  const projectId = String(formData.get('projectId') ?? '');
+  const projectStart = String(formData.get('projectStart') ?? '');
+  const ctx = await requestContext();
+  const result = await setProjectStartSetting({ projectId, projectStart }, ctx);
+  if (!result.ok) return refuseOutcome(result);
+  revalidateSettings(projectId);
+  return { ok: true };
+}
+
+export async function clearProjectStartAction(formData: FormData): Promise<SettingsWriteOutcome> {
+  const projectId = String(formData.get('projectId') ?? '');
+  const ctx = await requestContext();
+  const result = await clearProjectStartSetting({ projectId }, ctx);
+  if (!result.ok) return refuseOutcome(result);
+  revalidateSettings(projectId);
+  return { ok: true };
+}
+
+export async function patchProjectFinishAction(formData: FormData): Promise<SettingsWriteOutcome> {
+  const projectId = String(formData.get('projectId') ?? '');
+  const raw = formData.get('projectFinish');
+  const projectFinish =
+    raw === null || raw === '' ? null : String(raw);
+  const confirmed = formData.get('confirmed') === '1';
+  if (!confirmed) {
+    return {
+      ok: false,
+      code: 'invalid_input',
+      messageKey: 'errors.invalid_input',
+      details: { confirmed: ['required'] },
+    };
+  }
+  const ctx = await requestContext();
+  const result = await patchProjectFinish({ projectId, projectFinish, confirmed: true }, ctx);
+  if (!result.ok) return refuseOutcome(result);
+  revalidateSettings(projectId);
+  return { ok: true };
+}
+
+export async function patchDataDateAction(formData: FormData): Promise<SettingsWriteOutcome> {
+  const projectId = String(formData.get('projectId') ?? '');
+  const dataDate = String(formData.get('dataDate') ?? '');
+  const ctx = await requestContext();
+  const result = await patchDataDate({ projectId, dataDate }, ctx);
+  if (!result.ok) return refuseOutcome(result);
+  revalidateSettings(projectId);
+  return { ok: true };
+}
diff --git a/apps/web/src/app/p/[projectId]/settings/page.tsx b/apps/web/src/app/p/[projectId]/settings/page.tsx
new file mode 100644
--- /dev/null
+++ b/apps/web/src/app/p/[projectId]/settings/page.tsx
+import { getTranslations } from 'next-intl/server';
+import {
+  dataDateAdvancePreview,
+  getProjectHeader,
+  planThinUiState,
+  PROJECT_FINISH_TEACHING,
+  proposedCompleteFinish,
+} from '@/server/composition';
+import { valueOrNotFound } from '@/server/result';
+import { Section } from '@/components/ui';
+import { ProjectScheduleSettingsForm } from '@/components/project-schedule-settings';
+
+export const dynamic = 'force-dynamic';
+
+/**
+ * Story 2.11 (Q1→B): Project settings for the three schedule fields.
+ * Full schedule-strip chrome stays 2.15.
+ */
+export default async function ProjectSettingsPage({
+  params,
+}: {
+  params: Promise<{ projectId: string }>;
+}) {
+  const t = await getTranslations();
+  const { projectId } = await params;
+  const header = valueOrNotFound(await getProjectHeader({ projectId }));
+  const thin = valueOrNotFound(await planThinUiState(projectId));
+  const proposedToday = proposedCompleteFinish(thin.tzOffsetMinutes);
+  const previewDate = thin.dataDate ?? proposedToday;
+  const advancePreview = dataDateAdvancePreview(previewDate, thin.remainingLeafCount);
+
+  return (
+    <div className="sheet">
+      <h1 className="report-title">{t('shell.surfaces.settings.label')}</h1>
+      <div className="report-sub">
+        {header.project.name} — Project start, Project finish, Data Date
+      </div>
+      <Section title="Schedule settings" id="schedule-settings">
+        <ProjectScheduleSettingsForm
+          projectId={projectId}
+          projectStart={thin.projectStart}
+          projectFinish={thin.projectFinish}
+          dataDate={thin.dataDate}
+          remainingLeafCount={thin.remainingLeafCount}
+          finishTeaching={PROJECT_FINISH_TEACHING}
+          advancePreview={advancePreview}
+          proposedToday={proposedToday}
+        />
+      </Section>
+    </div>
+  );
+}
diff --git a/apps/web/src/components/project-schedule-settings.tsx b/apps/web/src/components/project-schedule-settings.tsx
new file mode 100644
--- /dev/null
+++ b/apps/web/src/components/project-schedule-settings.tsx
+'use client';
+
+import { useState, useTransition } from 'react';
+import {
+  clearProjectStartAction,
+  patchDataDateAction,
+  patchProjectFinishAction,
+  setProjectStartAction,
+  type SettingsWriteOutcome,
+} from '@/app/p/[projectId]/settings/actions';
+
+function refuseMessage(outcome: Extract<SettingsWriteOutcome, { ok: false }>): string {
+  if (outcome.details !== undefined) {
+    const parts = Object.entries(outcome.details).map(
+      ([key, values]) => `${key}: ${values.join(', ')}`,
+    );
+    if (parts.length > 0) return parts.join('; ');
+  }
+  return outcome.messageKey;
+}
+
+/**
+ * Story 2.11 Project settings (Q1→B): the three schedule settings with teaching confirms.
+ * Full schedule-strip chrome stays 2.15.
+ */
+export function ProjectScheduleSettingsForm({
+  projectId,
+  projectStart,
+  projectFinish,
+  dataDate,
+  remainingLeafCount,
+  finishTeaching,
+  advancePreview,
+  proposedToday,
+}: {
+  readonly projectId: string;
+  readonly projectStart: string | null;
+  readonly projectFinish: string | null;
+  readonly dataDate: string | null;
+  readonly remainingLeafCount: number;
+  readonly finishTeaching: string;
+  readonly advancePreview: string;
+  readonly proposedToday: string;
+}) {
+  const [pending, start] = useTransition();
+  const [refuse, setRefuse] = useState<string | null>(null);
+  const [finishConfirmed, setFinishConfirmed] = useState(false);
+  const [startValue, setStartValue] = useState(projectStart ?? proposedToday);
+  const [finishValue, setFinishValue] = useState(projectFinish ?? '');
+  const [dataDateValue, setDataDateValue] = useState(dataDate ?? proposedToday);
+
+  return (
+    <div className="sheet" data-testid="project-schedule-settings">
+      {refuse !== null ? (
+        <p className="caption" role="alert" data-testid="settings-refuse">
+          {refuse}
+        </p>
+      ) : null}
+
+      <section style={{ marginBottom: 24 }}>
+        <h2 className="report-sub">Project start</h2>
+        {projectStart === null ? (
+          <p className="caption" data-testid="settings-no-start">
+            no project start yet
+          </p>
+        ) : (
+          <p className="caption">
+            Current: <strong>{projectStart}</strong>
+          </p>
+        )}
+        <form
+          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 8 }}
+          action={(fd) => {
+            start(async () => {
+              setRefuse(null);
+              const outcome = await setProjectStartAction(fd);
+              if (!outcome.ok) setRefuse(refuseMessage(outcome));
+            });
+          }}
+        >
+          <input type="hidden" name="projectId" value={projectId} />
+          <label>
+            Set Project start{' '}
+            <input
+              type="date"
+              name="projectStart"
+              value={startValue}
+              onChange={(e) => setStartValue(e.target.value)}
+              required
+              data-testid="settings-project-start"
+            />
+          </label>
+          <button type="submit" disabled={pending}>
+            Set Project start
+          </button>
+        </form>
+        {projectStart !== null ? (
+          <form
+            style={{ marginTop: 8 }}
+            action={(fd) => {
+              start(async () => {
+                setRefuse(null);
+                const outcome = await clearProjectStartAction(fd);
+                if (!outcome.ok) setRefuse(refuseMessage(outcome));
+              });
+            }}
+          >
+            <input type="hidden" name="projectId" value={projectId} />
+            <button type="submit" disabled={pending} data-testid="settings-clear-start">
+              Clear Project start
+            </button>
+          </form>
+        ) : null}
+      </section>
+
+      <section style={{ marginBottom: 24 }}>
+        <h2 className="report-sub">Project finish</h2>
+        <p className="caption">
+          Current: <strong>{projectFinish ?? 'not set'}</strong>
+        </p>
+        <p className="caption" data-testid="finish-teaching">
+          {finishTeaching}
+        </p>
+        <label className="caption" style={{ display: 'block', marginTop: 8 }}>
+          <input
+            type="checkbox"
+            checked={finishConfirmed}
+            onChange={(e) => setFinishConfirmed(e.target.checked)}
+            data-testid="finish-confirm"
+          />{' '}
+          I understand — this moves no work package
+        </label>
+        <form
+          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 8 }}
+          action={(fd) => {
+            start(async () => {
+              setRefuse(null);
+              const outcome = await patchProjectFinishAction(fd);
+              if (!outcome.ok) setRefuse(refuseMessage(outcome));
+              else setFinishConfirmed(false);
+            });
+          }}
+        >
+          <input type="hidden" name="projectId" value={projectId} />
+          <input type="hidden" name="confirmed" value={finishConfirmed ? '1' : '0'} />
+          <label>
+            Project finish{' '}
+            <input
+              type="date"
+              name="projectFinish"
+              value={finishValue}
+              onChange={(e) => setFinishValue(e.target.value)}
+              data-testid="settings-project-finish"
+            />
+          </label>
+          <button type="submit" disabled={pending || !finishConfirmed}>
+            Set Project finish
+          </button>
+        </form>
+        <form
+          style={{ marginTop: 8 }}
+          action={(fd) => {
+            start(async () => {
+              setRefuse(null);
+              const outcome = await patchProjectFinishAction(fd);
+              if (!outcome.ok) setRefuse(refuseMessage(outcome));
+              else setFinishConfirmed(false);
+            });
+          }}
+        >
+          <input type="hidden" name="projectId" value={projectId} />
+          <input type="hidden" name="projectFinish" value="" />
+          <input type="hidden" name="confirmed" value={finishConfirmed ? '1' : '0'} />
+          <button
+            type="submit"
+            disabled={pending || !finishConfirmed || projectFinish === null}
+            data-testid="settings-clear-finish"
+          >
+            Clear Project finish
+          </button>
+        </form>
+      </section>
+
+      <section>
+        <h2 className="report-sub">Data Date</h2>
+        <p className="caption">
+          Current: <strong>{dataDate ?? 'not set'}</strong>
+        </p>
+        <p className="caption" data-testid="data-date-advance-preview">
+          {advancePreview}
+        </p>
+        <p className="caption">
+          Remaining work packages (no actual finish): {remainingLeafCount}
+        </p>
+        <form
+          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 8 }}
+          action={(fd) => {
+            start(async () => {
+              setRefuse(null);
+              const outcome = await patchDataDateAction(fd);
+              if (!outcome.ok) setRefuse(refuseMessage(outcome));
+            });
+          }}
+        >
+          <input type="hidden" name="projectId" value={projectId} />
+          <label>
+            Advance Data Date to{' '}
+            <input
+              type="date"
+              name="dataDate"
+              value={dataDateValue}
+              onChange={(e) => setDataDateValue(e.target.value)}
+              required
+              data-testid="settings-data-date"
+            />
+          </label>
+          <button type="submit" disabled={pending || projectStart === null}>
+            Advance Data Date
+          </button>
+        </form>
+      </section>
+    </div>
+  );
+}
diff --git a/tests/schedule/fence-2-11.test.ts b/tests/schedule/fence-2-11.test.ts
new file mode 100644
--- /dev/null
+++ b/tests/schedule/fence-2-11.test.ts
+/**
+ * Story 2.11 fence cases: Project start (set/clear), Project finish, standalone Data Date,
+ * audit before/after, AR-52 still green via schedule-closure.
+ */
+import { afterAll, describe, expect, it } from 'vitest';
+import { and, eq } from 'drizzle-orm';
+import { applyPlanChange } from '../../packages/app/src/schedule/apply-plan-change';
+import { dataDateAdvancePreview } from '../../packages/app/src/schedule/plan-edit';
+import { closeAllPools, getDb, getPool } from '../../packages/db/src/client';
+import {
+  assertProbeTenantsDisjoint,
+  buildProbeTenant,
+  createProbeTenant,
+  removeProbeTenant,
+} from '../../packages/db/src/probe-tenants';
+import * as s from '../../packages/db/src/schema';
+import { acquireSeedSuiteLock, releaseSeedSuiteLock } from '../../packages/db/src/seed-suite-lock';
+import { inTenantTransaction } from '../../packages/db/src/tenant-transaction';
+import { withTenant } from '../../packages/db/src/with-tenant';
+
+const OWNER_DATABASE_URL = process.env.DATABASE_URL;
+const APP_DATABASE_URL = process.env.APP_DATABASE_URL;
+const REQUIRE_DB = process.env.REQUIRE_DB === '1';
+
+async function reachableAs(connectionString: string | undefined): Promise<boolean> {
+  if (!connectionString) return false;
+  try {
+    const client = await getPool(connectionString).connect();
+    client.release();
+    return true;
+  } catch {
+    return false;
+  }
+}
+
+const reachable =
+  (await reachableAs(OWNER_DATABASE_URL)) && (await reachableAs(APP_DATABASE_URL));
+if (REQUIRE_DB && !reachable) {
+  throw new Error('REQUIRE_DB=1 but DATABASE_URL or APP_DATABASE_URL is unreachable.');
+}
+
+const PROBE = buildProbeTenant('xtprobe-s211', 951_000_000);
+assertProbeTenantsDisjoint([PROBE]);
+
+if (reachable) {
+  await acquireSeedSuiteLock(OWNER_DATABASE_URL!, 'shared');
+}
+
+afterAll(async () => {
+  if (reachable) {
+    await removeProbeTenant(getDb(OWNER_DATABASE_URL!), PROBE).catch(() => {});
+  }
+  await releaseSeedSuiteLock();
+  await closeAllPools();
+});
+
+function ctx() {
+  return {
+    tenantId: PROBE.tenantId,
+    userId: 'user-s211',
+    roles: ['pm'] as const,
+    locale: 'en' as const,
+    projectIds: [PROBE.projectId],
+  };
+}
+
+async function prepareBareProject(owner: ReturnType<typeof getDb>) {
+  await createProbeTenant(owner, PROBE);
+  const leaf = PROBE.state.wps.find((w) => w.isLeaf && !w.isMilestone);
+  if (!leaf) throw new Error('fixture needs a leaf WP');
+  await withTenant(owner, PROBE.tenantId, async (tx) => {
+    await tx
+      .update(s.project)
+      .set({ projectStart: null, dataDate: null, projectFinish: null })
+      .where(eq(s.project.id, PROBE.projectId));
+    await tx
+      .update(s.workPackage)
+      .set({ durationDays: 3, constraintType: 'asap', constraintDate: null })
+      .where(
+        and(
+          eq(s.workPackage.tenantId, PROBE.tenantId),
+          eq(s.workPackage.projectId, PROBE.projectId),
+          eq(s.workPackage.id, leaf.id),
+        ),
+      );
+  });
+  return leaf;
+}
+
+async function prepareSchedulable(owner: ReturnType<typeof getDb>) {
+  const leaf = await prepareBareProject(owner);
+  await withTenant(owner, PROBE.tenantId, async (tx) => {
+    await tx
+      .update(s.project)
+      .set({ projectStart: '2026-09-01', dataDate: '2026-10-05', projectFinish: null })
+      .where(eq(s.project.id, PROBE.projectId));
+  });
+  return leaf;
+}
+
+describe('dataDateAdvancePreview', () => {
+  it('names the remaining count', () => {
+    expect(dataDateAdvancePreview('2026-09-26', 78)).toBe(
+      'Advancing to 26 Sep re-dates 78 remaining work packages',
+    );
+  });
+});
+
+describe.skipIf(!reachable)('applyPlanChange fence (story 2.11)', () => {
+  it('sets Project start with Data Date today and cause project_dates', async () => {
+    const owner = getDb(OWNER_DATABASE_URL!);
+    const app = getDb(APP_DATABASE_URL!);
+    await prepareBareProject(owner);
+
+    const result = await applyPlanChange(
+      { handle: app, transaction: inTenantTransaction },
+      ctx(),
+      {
+        kind: 'set_project_start',
+        projectId: PROBE.projectId,
+        projectStart: '2026-09-01',
+        dataDate: '2026-09-24',
+      },
+    );
+    expect(result.ok).toBe(true);
+    if (!result.ok) return;
+
+    const [project] = await withTenant(app, PROBE.tenantId, async (tx) =>
+      tx
+        .select({
+          projectStart: s.project.projectStart,
+          dataDate: s.project.dataDate,
+        })
+        .from(s.project)
+        .where(eq(s.project.id, PROBE.projectId)),
+    );
+    expect(project?.projectStart).toBe('2026-09-01');
+    expect(project?.dataDate).toBe('2026-09-24');
+
+    const runs = await withTenant(app, PROBE.tenantId, async (tx) =>
+      tx
+        .select({ cause: s.scheduleRun.cause })
+        .from(s.scheduleRun)
+        .where(eq(s.scheduleRun.projectId, PROBE.projectId)),
+    );
+    expect(runs.some((r) => r.cause === 'project_dates')).toBe(true);
+
+    const audits = await withTenant(app, PROBE.tenantId, async (tx) =>
+      tx
+        .select({ payload: s.auditLog.payload })
+        .from(s.auditLog)
+        .where(
+          and(
+            eq(s.auditLog.tenantId, PROBE.tenantId),
+            eq(s.auditLog.action, 'schedule.apply_plan_change'),
+          ),
+        ),
+    );
+    const last = audits.at(-1)?.payload as {
+      before?: { projectStart: string | null };
+      after?: { projectStart: string | null; dataDate: string | null };
+    };
+    expect(last?.before?.projectStart).toBeNull();
+    expect(last?.after?.projectStart).toBe('2026-09-01');
+    expect(last?.after?.dataDate).toBe('2026-09-24');
+  });
+
+  it('clears Project start without a schedule_run and restores no-start', async () => {
+    const owner = getDb(OWNER_DATABASE_URL!);
+    const app = getDb(APP_DATABASE_URL!);
+    await prepareSchedulable(owner);
+
+    const beforeRuns = await withTenant(app, PROBE.tenantId, async (tx) =>
+      tx
+        .select({ seq: s.scheduleRun.seq })
+        .from(s.scheduleRun)
+        .where(eq(s.scheduleRun.projectId, PROBE.projectId)),
+    );
+
+    const cleared = await applyPlanChange(
+      { handle: app, transaction: inTenantTransaction },
+      ctx(),
+      { kind: 'clear_project_start', projectId: PROBE.projectId },
+    );
+    expect(cleared.ok).toBe(true);
+    if (!cleared.ok) return;
+
+    const [project] = await withTenant(app, PROBE.tenantId, async (tx) =>
+      tx
+        .select({ projectStart: s.project.projectStart })
+        .from(s.project)
+        .where(eq(s.project.id, PROBE.projectId)),
+    );
+    expect(project?.projectStart).toBeNull();
+
+    const afterRuns = await withTenant(app, PROBE.tenantId, async (tx) =>
+      tx
+        .select({ seq: s.scheduleRun.seq })
+        .from(s.scheduleRun)
+        .where(eq(s.scheduleRun.projectId, PROBE.projectId)),
+    );
+    expect(afterRuns.length).toBe(beforeRuns.length);
+  });
+
+  it('set/clear Project finish leaves early dates unchanged', async () => {
+    const owner = getDb(OWNER_DATABASE_URL!);
+    const app = getDb(APP_DATABASE_URL!);
+    const leaf = await prepareSchedulable(owner);
+
+    const seeded = await applyPlanChange(
+      { handle: app, transaction: inTenantTransaction },
+      ctx(),
+      {
+        kind: 'patch_duration',
+        projectId: PROBE.projectId,
+        wpId: leaf.id,
+        durationDays: 3,
+      },
+    );
+    expect(seeded.ok).toBe(true);
+    if (!seeded.ok) return;
+
+    const earlyBefore = await withTenant(app, PROBE.tenantId, async (tx) =>
+      tx
+        .select({ earlyStart: s.wpSchedule.earlyStart, earlyFinish: s.wpSchedule.earlyFinish })
+        .from(s.wpSchedule)
+        .where(
+          and(eq(s.wpSchedule.projectId, PROBE.projectId), eq(s.wpSchedule.wpId, leaf.id)),
+        ),
+    );
+
+    const setFinish = await applyPlanChange(
+      { handle: app, transaction: inTenantTransaction },
+      ctx(),
+      {
+        kind: 'patch_project_finish',
+        projectId: PROBE.projectId,
+        projectFinish: '2026-12-31',
+      },
+    );
+    expect(setFinish.ok).toBe(true);
+    if (!setFinish.ok) return;
+
+    const earlyAfterSet = await withTenant(app, PROBE.tenantId, async (tx) =>
+      tx
+        .select({ earlyStart: s.wpSchedule.earlyStart, earlyFinish: s.wpSchedule.earlyFinish })
+        .from(s.wpSchedule)
+        .where(
+          and(eq(s.wpSchedule.projectId, PROBE.projectId), eq(s.wpSchedule.wpId, leaf.id)),
+        ),
+    );
+    expect(earlyAfterSet[0]?.earlyStart).toBe(earlyBefore[0]?.earlyStart);
+    expect(earlyAfterSet[0]?.earlyFinish).toBe(earlyBefore[0]?.earlyFinish);
+
+    const clearFinish = await applyPlanChange(
+      { handle: app, transaction: inTenantTransaction },
+      ctx(),
+      {
+        kind: 'patch_project_finish',
+        projectId: PROBE.projectId,
+        projectFinish: null,
+      },
+    );
+    expect(clearFinish.ok).toBe(true);
+  });
+
+  it('refuses Data Date earlier than latest actual finish with blockers', async () => {
+    const owner = getDb(OWNER_DATABASE_URL!);
+    const app = getDb(APP_DATABASE_URL!);
+    const leaf = await prepareSchedulable(owner);
+
+    const actuals = await applyPlanChange(
+      { handle: app, transaction: inTenantTransaction },
+      ctx(),
+      {
+        kind: 'patch_actual_dates',
+        projectId: PROBE.projectId,
+        wpId: leaf.id,
+        actualStart: '2026-09-10',
+        actualFinish: '2026-10-20',
+        source: 'typed',
+        advanceDataDate: '2026-10-20',
+      },
+    );
+    expect(actuals.ok).toBe(true);
+    if (!actuals.ok) return;
+
+    const early = await applyPlanChange(
+      { handle: app, transaction: inTenantTransaction },
+      ctx(),
+      {
+        kind: 'patch_data_date',
+        projectId: PROBE.projectId,
+        dataDate: '2026-10-01',
+      },
+    );
+    expect(early.ok).toBe(false);
+    if (early.ok) return;
+    expect(early.error.details?.dataDate).toContain('before_latest_actual_finish');
+    expect(early.error.details?.blockingWpIds).toContain(leaf.id);
+  });
+
+  it('advances Data Date standalone with cause data_date', async () => {
+    const owner = getDb(OWNER_DATABASE_URL!);
+    const app = getDb(APP_DATABASE_URL!);
+    await prepareSchedulable(owner);
+
+    const advanced = await applyPlanChange(
+      { handle: app, transaction: inTenantTransaction },
+      ctx(),
+      {
+        kind: 'patch_data_date',
+        projectId: PROBE.projectId,
+        dataDate: '2026-10-15',
+      },
+    );
+    expect(advanced.ok).toBe(true);
+    if (!advanced.ok) return;
+
+    const [project] = await withTenant(app, PROBE.tenantId, async (tx) =>
+      tx
+        .select({ dataDate: s.project.dataDate })
+        .from(s.project)
+        .where(eq(s.project.id, PROBE.projectId)),
+    );
+    expect(project?.dataDate).toBe('2026-10-15');
+
+    const runs = await withTenant(app, PROBE.tenantId, async (tx) =>
+      tx
+        .select({ cause: s.scheduleRun.cause })
+        .from(s.scheduleRun)
+        .where(eq(s.scheduleRun.projectId, PROBE.projectId)),
+    );
+    expect(runs.some((r) => r.cause === 'data_date')).toBe(true);
+  });
+});

```

## claims_file contents (for Step 5 only — leave unread until then)

```markdown
---
title: 'Story 2.11 — The three Project schedule settings'
type: 'feature'
created: '2026-09-24'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '5ff76f6885a2b677940a68f66ae1f8f9d351422c'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Columns `project.project_start` / `project_finish` / `data_date` exist (2.1) and the fence can advance Data Date only as a compound of actuals (2.10 Q2→A). A PM still has no standalone way to set Project start (with Data Date defaulting to today), set or clear Project finish with teaching copy, or advance Data Date with a named re-date preview — so FR-43's "no project start yet" state and the three settings as scheduling inputs have no home.

**Approach:** Widen `applyPlanChange` + `plan-input` for the three Project schedule settings (set/clear start; set/clear finish; standalone Data Date patch with latest-actual-finish refuse and remaining-WP preview). Ship a **dedicated Project settings route** for the three fields **plus** thin Plan "no project start yet" / *Set Project start* (Q1→B). Full schedule-strip chrome and What-moved stay 2.15. Keep the 2.10 actuals+Data Date compound unchanged.

**Decisions (founder, 2026-09-24):**
- **Keep the full spec**, with no split (~2355 tokens accepted; same posture as 2.10).
- **Q1 → B.** Dedicated Project settings route for Project start / Project finish / Data Date, **plus** thin Plan "no project start yet" / *Set Project start*. Full strip chrome still 2.15.
- **Q2 → A.** Allow clearing Project start — returns to "no project start yet"; FR-6b does not run; derived dates show "—" — so the named state stays reachable after first set.

## Boundaries & Constraints

**Always:**
- One fence only — every write to `project.project_start` / `project_finish` / `data_date` goes through `app/schedule.applyPlanChange` → `db/repositories/plan-input` (AR-43 / AD-25). Widen the union; do not invent a second mutator.
- No Project start → "no project start yet"; `FR-6b` does not run; derived date cells show "—" with that accessible name; Plan carries *Set Project start* (FR-43, UX-DR23). Clearing start is allowed and restores that state (Q2→A).
- First *Set Project start* writes `project_start` and `data_date` in the **same** fence call. Data Date defaults to **today in the Project's tz** (Clock + `projectDate` / `tzOffsetMinutes`) — never a date read from plan contents, never UTC `toISOString().slice(0,10)` alone (FR-43; continuity from 2.10 review #7).
- Thereafter only the PM advances Data Date. Standalone advance names the effect before confirm — e.g. "Advancing to 26 Sep re-dates 78 remaining work packages" — and never auto-advances (FR-43, UX-DR14). Count = leaf WPs with no `actualFinish` (remaining + in progress).
- Data Date earlier than the latest actual finish is refused with the blocking WP ids (FR-43). Same rule already used by the 2.10 compound path — reuse it.
- Setting or clearing Project finish is confirmed with exact teaching copy: "This moves no work package. It changes what Float is measured against, and lets Float go negative." Commit moves no WP dates; only the backward-pass anchor changes (FR-43, UX-DR5). Cause `project_dates`.
- Surface (Q1→B): Project settings route owns editing the three fields (finish teaching confirm, Data Date advance with preview, clear start). Plan page owns the no-start named state and *Set Project start* only — not the full strip.
- Every committed change to any of the three triggers full recalculation through the fence and is audited with author, time, and **previous value** (before/after) (FR-43, AR-26 / NFR-A1). Widen `schedule.apply_plan_change` audit payload accordingly. Clearing start: no recalc (FR-6b does not run); still audited with before/after.
- Tracker Snapshot / ledger / Mapping / Mapping Rule never write the three settings or derived dates — AR-52 reachability from 2.9 continues to hold; widen writers grep for `project_start` / `project_finish` / `data_date` updates (FR-43).
- Stop the silent `dataDate ?? stamp.at…` fallback in `resolveScheduleInputs` once a Project has a start: after start is set, `data_date` must be present (written by the set-start compound). While start is null, refuse recalc (`projectStart: required`) and do not invent a Data Date.

**Never:**
- No full schedule strip chrome, sticky Float anchor sentence, or What-moved band (2.15). Q1→B is settings route + thin Plan no-start / *Set Project start* only.
- No Holiday Calendar publish (2.12); no tree grid / Schedule preset / exceptions rail (2.13–2.16); no Review Progress & Dates panel period-boundary offer (later Review surface); no Import confirm flow (Epic 3); no Gantt.
- Do not treat the 2.10 actuals+Data Date compound as finishing this story; do not remove or fork it.
- Do not auto-advance Data Date from Tracker/Mapping/ledger; do not default Data Date from latest actual or imported date; do not move WPs when finish is set/cleared; do not amend `0000_scheduling_schema.sql` (columns already exist — no migration).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| No Project start | Project opened with `project_start` null | Plan: "no project start yet"; no FR-6b; *Set Project start* offered | N/A |
| Set Project start | PM sets start (Data Date omitted) from Plan or settings | Same fence call writes start + `data_date = today (project tz)`; recalc; cause `project_dates`; audit before/after | Invalid date → refuse |
| Clear Project start | PM clears start (Q2→A) | `project_start` (and scheduling) cleared; back to "no project start yet"; no FR-6b; dates "—"; audited | N/A |
| Set/clear finish | First set or clear of `project_finish` after teaching confirm (settings route) | Finish persisted; WP early dates unchanged vs prior run; Float anchor flips; cause `project_dates` | Decline confirm → no write |
| Data Date advance | PM chooses a later date on settings; preview shows remaining count | `data_date` patched; full recalc; cause `data_date`; audit before/after | Auto-advance never happens |
| Data Date too early | Proposed date &lt; latest actual finish | Refuse; list blocking WP ids | Whole mutation rolls back |
| Actuals compound | Actual finish after Data Date (2.10 path) | Unchanged compound behaviour | Decline advance → refuse |
| Closure | New project-settings writers | AR-52 grep covers `project_start` / `project_finish` / `data_date`; only fence imports plan-input | Fail CI on leak |

</frozen-after-approval>

## Code Map

- `packages/app/src/schedule/apply-plan-change.ts` — widen `planMutationSchema` with `set_project_start` (optional explicit `dataDate`; default today), `clear_project_start` (Q2→A), `patch_project_finish` (nullable), `patch_data_date`; map causes (`project_dates` / `data_date`); load before values for audit; call new plan-input writers; keep actuals compound. Clear-start skips recalc. Do not change auth/tx/lock shape.
- `packages/app/src/schedule/recalculate-project.ts` — `resolveScheduleInputs`: remove silent UTC Data Date fallback when start exists; keep `projectStart === null` → refuse. First set-start path writes both columns before resolve runs.
- `packages/db/src/repositories/plan-input/index.ts` — add `patchProjectStart` (nullable for clear), `patchProjectFinish`; keep/extend `patchDataDate`; optionally one `patchProjectScheduleSettings` helper. Latest-actual-finish scan for refuse (reuse status heads). Reuse `requireProject`.
- `packages/db/src/repositories/schedule/index.ts` — already loads the three settings; no schema change. May expose a read helper for settings UI (current values + latest actual finish + remaining leaf count).
- `apps/web/src/app/p/[projectId]/settings/` (new, Q1→B) — Project settings route: edit the three fields; finish teaching confirm; Data Date advance with named remaining count; clear start. Server actions → fence only.
- `apps/web/src/app/p/[projectId]/plan/` + `packages/app/src/schedule/plan-edit.ts` — thin Plan: "no project start yet" + *Set Project start* only; colocate with 2.10 thin UI. No strip chrome.
- `packages/app/src/audit/payloads.ts` — widen `schedule.apply_plan_change` with optional `before`/`after` for the three dates (and keep `kind` / `runSeq` / `haltedReason`).
- `packages/domain/src/schedule/cause.ts` — `ScheduleRunCause` already has `data_date` and `project_dates`; do not invent parallel names.
- `packages/app/src/schedule/plan-edit.ts` `proposedCompleteDay` / `projectDate` — reuse for "today" in project tz with Clock.
- `.dependency-cruiser.cjs` + `tests/schedule-closure.test.ts` — widen writers grep for `projectStart` / `projectFinish` / `dataDate` updates on `s.project`.
- `tests/schedule/fence*.test.ts` (new `fence-2-11` cases) — set start+today; clear start → no-start state; finish set/clear leaves early dates; Data Date refuse with blockers; advance preview count; audit before/after; AR-52 still green.
- Continuity from 2.10 (done): compound actuals+`advanceDataDate` stays; Never was "No standalone Project settings UI (2.11)" — this story owns that surface (Q1→B).

## Tasks & Acceptance

**Execution:**
- [x] `packages/db/src/repositories/plan-input/*` — project start (set/clear) / finish / data_date writers; latest-actual-finish blockers; no migration.
- [x] `packages/app/src/schedule/apply-plan-change.ts` + `recalculate-project.ts` + `audit/payloads.ts` — widen mutation union; stop silent Data Date invent; clear-start without recalc; audit before/after; causes mapped.
- [x] `apps/web/.../settings/` + Plan thin UI + server actions (Q1→B) — settings route for three fields; Plan no-start / *Set Project start*; finish teaching confirm; Data Date advance with named remaining count.
- [x] `tests/schedule-closure.test.ts` + `tests/schedule/fence-2-11*.test.ts` — matrix + AR-52 coverage for the three writers (incl. clear start).
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` — annotate any 2.11 residues (period-boundary offer, full strip) only if they surface during implement.

**Acceptance Criteria:**
- Given a Project with no Project start, when it is opened, then "no project start yet" replaces derived dates, FR-6b does not run, and *Set Project start* is the offered action on Plan.
- Given *Set Project start*, when it commits, then Data Date is set in the same action to today (project tz), never from plan contents, and a `schedule_run` with cause `project_dates` exists.
- Given clear of Project start (Q2→A), when it commits, then the Project returns to "no project start yet", FR-6b does not run, and derived dates show "—".
- Given set or clear of Project finish after teaching confirm on Project settings, when it commits, then no WP early dates move; only the Float anchor changes.
- Given a Data Date earlier than the latest actual finish, when submitted, then it is refused with the blocking WPs.
- Given a Data Date advance offer on Project settings, when shown, then it names the remaining-WP re-date count and never advances without an explicit PM confirm.
- Given any of the three settings changing, when it commits, then (when start is present) fence recalculation runs and audit carries author, time, and previous value.
- Given Tracker / Mapping / ledger activity, when it occurs, then WP dates and the three settings are unchanged; AR-52 still passes.
- Given `pnpm lint`, `pnpm typecheck`, `pnpm depcruise` and `pnpm test`, when they run, then all exit 0.

## Implementation Notes

- 2026-09-24: Baseline `5ff76f6` on `main`. Approved Checkpoint 1 (Keep full; Q1→B; Q2→A). Sprint → `in-progress`.
- Fence widened: `set_project_start` (+ data_date same UPDATE), `clear_project_start` (no recalc), `patch_project_finish`, `patch_data_date` (blockers via status heads). Audit payload carries before/after for settings kinds; `runSeq` nullable on clear.
- `resolveScheduleInputs` refuses null `dataDate` once start exists — no silent UTC invent.
- UI: `/p/[projectId]/settings` + Plan no-start band / *Set Project start*; shell nav pin; finish teaching + advance preview copy.
- Tests: `fence-2-11.test.ts` covers matrix; schedule-closure greps projectStart/Finish; watermark probe seqs moved off 940/950 to avoid parallel collision with fence 2.9/2.10.
- Deferred intentionally (per Never): full strip chrome (2.15), period-boundary Data Date offer (Review), calendar publish (2.12). No deferred-work append needed beyond Design Notes.

## Spec Change Log

## Review Triage Log

## Design Notes

**Widen, don't fork.** 2.10 left standalone settings to this story. The product rule remains one fence; the actuals compound is one statement about "how far the plan has got" and stays. Standalone `patch_data_date` is the PM's deliberate advance of the plan through time.

**Start + Data Date are one first action.** A Project is created with none. Scheduling cannot invent a Data Date on resolve — that would hide the FR-43 default rule. The set-start mutation is the only place "defaults to today" is applied.

**Finish moves no WP.** Backward-pass anchor only. Teaching copy is product text, not a paraphrase — keep the epic wording.

**Advance preview count.** Leaves without `actualFinish` match "remaining work packages" in the UX example without a dry-run of the engine. Period-boundary suggestion lives on Review Progress & Dates, not here.

**2.15 still owns strip chrome.** Q1→B ships the Project settings route and Plan no-start / *Set Project start* only. Sticky Float-anchor sentence, What-moved, and polished inline strip edits that mirror settings 1:1 are 2.15's job.

**Clear start (Q2→A).** Clearing start is a fence write without recalculation — the Project is not scheduled, so there is no run to append with outputs. Audit still records before/after.

## Verification

**Commands:**
- `pnpm lint` — expected: exit 0
- `pnpm typecheck` — expected: exit 0
- `pnpm depcruise` — expected: exit 0
- `pnpm test` — expected: exit 0 (includes schedule-closure + fence-2-11 cases)

```
