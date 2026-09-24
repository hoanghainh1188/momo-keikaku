-- Row-level security: ENABLE + FORCE and the tenant isolation policy
--
-- GENERATED from packages/db/src/table-classes.ts by packages/db/src/sql/generate.ts.
-- Do not edit: `pnpm db:sql` rewrites this file and a test fails when it has drifted.
-- Applied by `pnpm db:policies`, which regenerates rather than reading this file, so a
-- hand edit cannot reach a database either.
-- department (mutable-audited): Org shape. Renamed and re-parented by Tenant Admins; every change is audited (story 1.3).
ALTER TABLE public."department" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."department" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON public."department";
CREATE POLICY "tenant_isolation" ON public."department"
  FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''));
DROP POLICY IF EXISTS "maintenance_bypass" ON public."department";
CREATE POLICY "maintenance_bypass" ON public."department"
  FOR ALL TO "momo_maintenance"
  USING (true)
  WITH CHECK (true);

-- program (mutable-audited): Org shape between Department and Project (FR-1). Created and renamed by Tenant Admins; every change is audited (story 1.3 slice 2).
ALTER TABLE public."program" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."program" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON public."program";
CREATE POLICY "tenant_isolation" ON public."program"
  FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''));
DROP POLICY IF EXISTS "maintenance_bypass" ON public."program";
CREATE POLICY "maintenance_bypass" ON public."program"
  FOR ALL TO "momo_maintenance"
  USING (true)
  WITH CHECK (true);

-- project (mutable-audited): Project configuration is edited in place; moving a Project between Programs changes roll-up only.
ALTER TABLE public."project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON public."project";
CREATE POLICY "tenant_isolation" ON public."project"
  FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''));
DROP POLICY IF EXISTS "maintenance_bypass" ON public."project";
CREATE POLICY "maintenance_bypass" ON public."project"
  FOR ALL TO "momo_maintenance"
  USING (true)
  WITH CHECK (true);

-- resource (mutable-audited): Resources are renamed and re-linked to Tracker Accounts. The dated Rates behind them are not (see rate_entry).
ALTER TABLE public."resource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."resource" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON public."resource";
CREATE POLICY "tenant_isolation" ON public."resource"
  FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''));
DROP POLICY IF EXISTS "maintenance_bypass" ON public."resource";
CREATE POLICY "maintenance_bypass" ON public."resource"
  FOR ALL TO "momo_maintenance"
  USING (true)
  WITH CHECK (true);

-- rate_entry (append-only): Rates are bitemporal: a retroactive correction appends a row. Rewriting one would change an already-published figure.
ALTER TABLE public."rate_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."rate_entry" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON public."rate_entry";
CREATE POLICY "tenant_isolation" ON public."rate_entry"
  FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''));
DROP POLICY IF EXISTS "maintenance_bypass" ON public."rate_entry";
CREATE POLICY "maintenance_bypass" ON public."rate_entry"
  FOR ALL TO "momo_maintenance"
  USING (true)
  WITH CHECK (true);

-- project_default_rate_entry (append-only): The Project default Rate is bitemporal like rate_entry (FR-12, story 1.6). A live cache sits on project.default_rate_jpy; history and pins read this table.
ALTER TABLE public."project_default_rate_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_default_rate_entry" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON public."project_default_rate_entry";
CREATE POLICY "tenant_isolation" ON public."project_default_rate_entry"
  FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''));
DROP POLICY IF EXISTS "maintenance_bypass" ON public."project_default_rate_entry";
CREATE POLICY "maintenance_bypass" ON public."project_default_rate_entry"
  FOR ALL TO "momo_maintenance"
  USING (true)
  WITH CHECK (true);

-- work_package (mutable-audited): The Current Plan is edited. Deletion is soft (`deleted_at`) so the Baseline still resolves it.
ALTER TABLE public."work_package" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."work_package" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON public."work_package";
CREATE POLICY "tenant_isolation" ON public."work_package"
  FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''));
DROP POLICY IF EXISTS "maintenance_bypass" ON public."work_package";
CREATE POLICY "maintenance_bypass" ON public."work_package"
  FOR ALL TO "momo_maintenance"
  USING (true)
  WITH CHECK (true);

-- wp_dependency (mutable-audited): FS dependency edges with lag (AD-25): a scheduling input, edited through app/schedule's fence and audited. Edges are removed explicitly by the writer (2.10/2.14); the FKs never cascade.
ALTER TABLE public."wp_dependency" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."wp_dependency" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON public."wp_dependency";
CREATE POLICY "tenant_isolation" ON public."wp_dependency"
  FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''));
DROP POLICY IF EXISTS "maintenance_bypass" ON public."wp_dependency";
CREATE POLICY "maintenance_bypass" ON public."wp_dependency"
  FOR ALL TO "momo_maintenance"
  USING (true)
  WITH CHECK (true);

-- wp_status_event (append-only): The single home of a WP's actual start and actual finish (AD-25). Each row restates the full actual state; the head is the latest seq. A correction is a new row.
ALTER TABLE public."wp_status_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."wp_status_event" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON public."wp_status_event";
CREATE POLICY "tenant_isolation" ON public."wp_status_event"
  FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''));
DROP POLICY IF EXISTS "maintenance_bypass" ON public."wp_status_event";
CREATE POLICY "maintenance_bypass" ON public."wp_status_event"
  FOR ALL TO "momo_maintenance"
  USING (true)
  WITH CHECK (true);

-- pct_override_event (append-only): Recorded Percent Complete for Plan-grid edits (story 2.10, AD-25). Append-only; the head feeds schedule_run.inputs. FR-30's audited override ceremony is Epic 6.
ALTER TABLE public."pct_override_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pct_override_event" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON public."pct_override_event";
CREATE POLICY "tenant_isolation" ON public."pct_override_event"
  FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''));
DROP POLICY IF EXISTS "maintenance_bypass" ON public."pct_override_event";
CREATE POLICY "maintenance_bypass" ON public."pct_override_event"
  FOR ALL TO "momo_maintenance"
  USING (true)
  WITH CHECK (true);

-- custom_field_definition (mutable-audited): Custom Field schema per Project (FR-8). Edited through the fence; NFR-P1 tested bound is 100 definitions.
ALTER TABLE public."custom_field_definition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."custom_field_definition" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON public."custom_field_definition";
CREATE POLICY "tenant_isolation" ON public."custom_field_definition"
  FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''));
DROP POLICY IF EXISTS "maintenance_bypass" ON public."custom_field_definition";
CREATE POLICY "maintenance_bypass" ON public."custom_field_definition"
  FOR ALL TO "momo_maintenance"
  USING (true)
  WITH CHECK (true);

-- custom_field_value (mutable-audited): Custom Field values on Work Packages (FR-8). Plan inputs, not scheduling inputs; still written only through the fence.
ALTER TABLE public."custom_field_value" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."custom_field_value" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON public."custom_field_value";
CREATE POLICY "tenant_isolation" ON public."custom_field_value"
  FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''));
DROP POLICY IF EXISTS "maintenance_bypass" ON public."custom_field_value";
CREATE POLICY "maintenance_bypass" ON public."custom_field_value"
  FOR ALL TO "momo_maintenance"
  USING (true)
  WITH CHECK (true);

-- holiday_calendar_version (append-only): A resolved non-working-day set over a range (AD-29). A Baseline re-derives against the version it pinned, so a version is never edited.
ALTER TABLE public."holiday_calendar_version" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."holiday_calendar_version" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON public."holiday_calendar_version";
CREATE POLICY "tenant_isolation" ON public."holiday_calendar_version"
  FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''));
DROP POLICY IF EXISTS "maintenance_bypass" ON public."holiday_calendar_version";
CREATE POLICY "maintenance_bypass" ON public."holiday_calendar_version"
  FOR ALL TO "momo_maintenance"
  USING (true)
  WITH CHECK (true);

-- schedule_run (append-only): One recalculation: fully resolved inputs, outputs, cause and engine version (AD-26). Baselines and Published Snapshots pin it by reference.
ALTER TABLE public."schedule_run" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."schedule_run" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON public."schedule_run";
CREATE POLICY "tenant_isolation" ON public."schedule_run"
  FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''));
DROP POLICY IF EXISTS "maintenance_bypass" ON public."schedule_run";
CREATE POLICY "maintenance_bypass" ON public."schedule_run"
  FOR ALL TO "momo_maintenance"
  USING (true)
  WITH CHECK (true);

-- wp_schedule (derived): The tree grid's projection of the latest schedule_run (AD-26), rebuilt from it by app/schedule and never pinned by anything.
ALTER TABLE public."wp_schedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."wp_schedule" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON public."wp_schedule";
CREATE POLICY "tenant_isolation" ON public."wp_schedule"
  FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''));
DROP POLICY IF EXISTS "maintenance_bypass" ON public."wp_schedule";
CREATE POLICY "maintenance_bypass" ON public."wp_schedule"
  FOR ALL TO "momo_maintenance"
  USING (true)
  WITH CHECK (true);

-- baseline_version (append-only): A Baseline is a pinned historical fact. Re-baselining appends a version; it never edits one.
ALTER TABLE public."baseline_version" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."baseline_version" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON public."baseline_version";
CREATE POLICY "tenant_isolation" ON public."baseline_version"
  FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''));
DROP POLICY IF EXISTS "maintenance_bypass" ON public."baseline_version";
CREATE POLICY "maintenance_bypass" ON public."baseline_version"
  FOR ALL TO "momo_maintenance"
  USING (true)
  WITH CHECK (true);

-- baseline_wp (append-only): The per-WP rows of a pinned Baseline version. Immutable for the same reason the version is.
ALTER TABLE public."baseline_wp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."baseline_wp" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON public."baseline_wp";
CREATE POLICY "tenant_isolation" ON public."baseline_wp"
  FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''));
DROP POLICY IF EXISTS "maintenance_bypass" ON public."baseline_wp";
CREATE POLICY "maintenance_bypass" ON public."baseline_wp"
  FOR ALL TO "momo_maintenance"
  USING (true)
  WITH CHECK (true);

-- connector (mutable-audited): Scope and credentials are re-pointed by a PM. The Snapshots it produced are not (see tracker_snapshot).
ALTER TABLE public."connector" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."connector" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON public."connector";
CREATE POLICY "tenant_isolation" ON public."connector"
  FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''));
DROP POLICY IF EXISTS "maintenance_bypass" ON public."connector";
CREATE POLICY "maintenance_bypass" ON public."connector"
  FOR ALL TO "momo_maintenance"
  USING (true)
  WITH CHECK (true);

-- tracker_snapshot (append-only): An observation of the tracker at one instant. Editing it would rewrite what was observed.
ALTER TABLE public."tracker_snapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tracker_snapshot" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON public."tracker_snapshot";
CREATE POLICY "tenant_isolation" ON public."tracker_snapshot"
  FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''));
DROP POLICY IF EXISTS "maintenance_bypass" ON public."tracker_snapshot";
CREATE POLICY "maintenance_bypass" ON public."tracker_snapshot"
  FOR ALL TO "momo_maintenance"
  USING (true)
  WITH CHECK (true);

-- ticket_observation (append-only): The Tickets inside one Snapshot. Same argument as the Snapshot that carries them.
ALTER TABLE public."ticket_observation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ticket_observation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON public."ticket_observation";
CREATE POLICY "tenant_isolation" ON public."ticket_observation"
  FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''));
DROP POLICY IF EXISTS "maintenance_bypass" ON public."ticket_observation";
CREATE POLICY "maintenance_bypass" ON public."ticket_observation"
  FOR ALL TO "momo_maintenance"
  USING (true)
  WITH CHECK (true);

-- actuals_ledger_entry (append-only): The Actuals Ledger. A correction is a compensating delta, never an edit — that is what makes AC reproducible.
ALTER TABLE public."actuals_ledger_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."actuals_ledger_entry" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON public."actuals_ledger_entry";
CREATE POLICY "tenant_isolation" ON public."actuals_ledger_entry"
  FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''));
DROP POLICY IF EXISTS "maintenance_bypass" ON public."actuals_ledger_entry";
CREATE POLICY "maintenance_bypass" ON public."actuals_ledger_entry"
  FOR ALL TO "momo_maintenance"
  USING (true)
  WITH CHECK (true);

-- mapping_rule (mutable-audited): Rules are edited and re-prioritised. The events they produced are append-only.
ALTER TABLE public."mapping_rule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."mapping_rule" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON public."mapping_rule";
CREATE POLICY "tenant_isolation" ON public."mapping_rule"
  FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''));
DROP POLICY IF EXISTS "maintenance_bypass" ON public."mapping_rule";
CREATE POLICY "maintenance_bypass" ON public."mapping_rule"
  FOR ALL TO "momo_maintenance"
  USING (true)
  WITH CHECK (true);

-- mapping_event (append-only): Mapping is an event log; the current Mapping is its head. Editing history would move hours retroactively.
ALTER TABLE public."mapping_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."mapping_event" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON public."mapping_event";
CREATE POLICY "tenant_isolation" ON public."mapping_event"
  FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''));
DROP POLICY IF EXISTS "maintenance_bypass" ON public."mapping_event";
CREATE POLICY "maintenance_bypass" ON public."mapping_event"
  FOR ALL TO "momo_maintenance"
  USING (true)
  WITH CHECK (true);

-- disposition_event (append-only): A PM decision at a point in time (FR-29). The record of a decision is not editable.
ALTER TABLE public."disposition_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."disposition_event" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON public."disposition_event";
CREATE POLICY "tenant_isolation" ON public."disposition_event"
  FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''));
DROP POLICY IF EXISTS "maintenance_bypass" ON public."disposition_event";
CREATE POLICY "maintenance_bypass" ON public."disposition_event"
  FOR ALL TO "momo_maintenance"
  USING (true)
  WITH CHECK (true);

-- audit_log (append-only): The audit trail. An editable audit log is not one.
ALTER TABLE public."audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."audit_log" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON public."audit_log";
CREATE POLICY "tenant_isolation" ON public."audit_log"
  FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), ''));
DROP POLICY IF EXISTS "maintenance_bypass" ON public."audit_log";
CREATE POLICY "maintenance_bypass" ON public."audit_log"
  FOR ALL TO "momo_maintenance"
  USING (true)
  WITH CHECK (true);
