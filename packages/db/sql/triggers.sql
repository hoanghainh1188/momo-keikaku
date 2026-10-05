-- Append-only enforcement: the UPDATE/DELETE and TRUNCATE triggers
--
-- GENERATED from packages/db/src/table-classes.ts by packages/db/src/sql/generate.ts.
-- Do not edit: `pnpm db:sql` rewrites this file and a test fails when it has drifted.
-- Applied by `pnpm db:policies`, which regenerates rather than reading this file, so a
-- hand edit cannot reach a database either.
CREATE OR REPLACE FUNCTION public."momo_append_only_guard"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF current_setting('app.maintenance', true) = 'on'
     AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'momo_maintenance')
     AND pg_catalog.pg_has_role(current_user, 'momo_maintenance', 'USAGE') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'table %.% is append-only: % is refused', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'MOMO1',
          HINT = 'Append a compensating row. The only exception is the momo_maintenance role with app.maintenance set to on.';
END $$;

CREATE OR REPLACE FUNCTION public."momo_append_only_truncate_guard"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF current_setting('app.maintenance', true) = 'on'
     AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'momo_maintenance')
     AND pg_catalog.pg_has_role(current_user, 'momo_maintenance', 'USAGE') THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'table %.% is append-only: % is refused', TG_TABLE_SCHEMA, TG_TABLE_NAME, 'TRUNCATE'
    USING ERRCODE = 'MOMO1',
          HINT = 'Append a compensating row. The only exception is the momo_maintenance role with app.maintenance set to on.';
END $$;

-- identity_event: Identity events: a change to a user's credentials or identity links (a password reset today; a link or unlink later), which carries no Tenant (story 1.4 slice 4, AD-14). A membership change — invitation acceptance included — is a tenant-scoped audited use case and writes audit_log, not here. Insert-only by grant plus appendOnlyGuard (trigger + maintenance hatch).
DROP TRIGGER IF EXISTS "append_only_guard" ON public."identity_event";
CREATE TRIGGER "append_only_guard"
  BEFORE UPDATE OR DELETE ON public."identity_event"
  FOR EACH ROW EXECUTE FUNCTION public."momo_append_only_guard"();
DROP TRIGGER IF EXISTS "append_only_truncate_guard" ON public."identity_event";
CREATE TRIGGER "append_only_truncate_guard"
  BEFORE TRUNCATE ON public."identity_event"
  FOR EACH STATEMENT EXECUTE FUNCTION public."momo_append_only_truncate_guard"();

-- project_setting_event: Project tz / teirei history (story 5.5 / FR-25). Period placement reads the head; editing history would move ledger entries across Reporting Periods.
DROP TRIGGER IF EXISTS "append_only_guard" ON public."project_setting_event";
CREATE TRIGGER "append_only_guard"
  BEFORE UPDATE OR DELETE ON public."project_setting_event"
  FOR EACH ROW EXECUTE FUNCTION public."momo_append_only_guard"();
DROP TRIGGER IF EXISTS "append_only_truncate_guard" ON public."project_setting_event";
CREATE TRIGGER "append_only_truncate_guard"
  BEFORE TRUNCATE ON public."project_setting_event"
  FOR EACH STATEMENT EXECUTE FUNCTION public."momo_append_only_truncate_guard"();

-- rate_entry: Rates are bitemporal: a retroactive correction appends a row. Rewriting one would change an already-published figure.
DROP TRIGGER IF EXISTS "append_only_guard" ON public."rate_entry";
CREATE TRIGGER "append_only_guard"
  BEFORE UPDATE OR DELETE ON public."rate_entry"
  FOR EACH ROW EXECUTE FUNCTION public."momo_append_only_guard"();
DROP TRIGGER IF EXISTS "append_only_truncate_guard" ON public."rate_entry";
CREATE TRIGGER "append_only_truncate_guard"
  BEFORE TRUNCATE ON public."rate_entry"
  FOR EACH STATEMENT EXECUTE FUNCTION public."momo_append_only_truncate_guard"();

-- project_default_rate_entry: The Project default Rate is bitemporal like rate_entry (FR-12, story 1.6). A live cache sits on project.default_rate_jpy; history and pins read this table.
DROP TRIGGER IF EXISTS "append_only_guard" ON public."project_default_rate_entry";
CREATE TRIGGER "append_only_guard"
  BEFORE UPDATE OR DELETE ON public."project_default_rate_entry"
  FOR EACH ROW EXECUTE FUNCTION public."momo_append_only_guard"();
DROP TRIGGER IF EXISTS "append_only_truncate_guard" ON public."project_default_rate_entry";
CREATE TRIGGER "append_only_truncate_guard"
  BEFORE TRUNCATE ON public."project_default_rate_entry"
  FOR EACH STATEMENT EXECUTE FUNCTION public."momo_append_only_truncate_guard"();

-- wp_status_event: The single home of a WP's actual start and actual finish (AD-25). Each row restates the full actual state; the head is the latest seq. A correction is a new row.
DROP TRIGGER IF EXISTS "append_only_guard" ON public."wp_status_event";
CREATE TRIGGER "append_only_guard"
  BEFORE UPDATE OR DELETE ON public."wp_status_event"
  FOR EACH ROW EXECUTE FUNCTION public."momo_append_only_guard"();
DROP TRIGGER IF EXISTS "append_only_truncate_guard" ON public."wp_status_event";
CREATE TRIGGER "append_only_truncate_guard"
  BEFORE TRUNCATE ON public."wp_status_event"
  FOR EACH STATEMENT EXECUTE FUNCTION public."momo_append_only_truncate_guard"();

-- pct_override_event: Recorded Percent Complete for Plan-grid edits (story 2.10, AD-25). Append-only; the head feeds schedule_run.inputs. FR-30's audited override ceremony is Epic 6.
DROP TRIGGER IF EXISTS "append_only_guard" ON public."pct_override_event";
CREATE TRIGGER "append_only_guard"
  BEFORE UPDATE OR DELETE ON public."pct_override_event"
  FOR EACH ROW EXECUTE FUNCTION public."momo_append_only_guard"();
DROP TRIGGER IF EXISTS "append_only_truncate_guard" ON public."pct_override_event";
CREATE TRIGGER "append_only_truncate_guard"
  BEFORE TRUNCATE ON public."pct_override_event"
  FOR EACH STATEMENT EXECUTE FUNCTION public."momo_append_only_truncate_guard"();

-- calendar_day_event: Project-specific non-working days (FR-14, story 2.12). Append-only; the head per day feeds publishCalendarVersion. A remove is a tombstone row.
DROP TRIGGER IF EXISTS "append_only_guard" ON public."calendar_day_event";
CREATE TRIGGER "append_only_guard"
  BEFORE UPDATE OR DELETE ON public."calendar_day_event"
  FOR EACH ROW EXECUTE FUNCTION public."momo_append_only_guard"();
DROP TRIGGER IF EXISTS "append_only_truncate_guard" ON public."calendar_day_event";
CREATE TRIGGER "append_only_truncate_guard"
  BEFORE TRUNCATE ON public."calendar_day_event"
  FOR EACH STATEMENT EXECUTE FUNCTION public."momo_append_only_truncate_guard"();

-- holiday_calendar_version: A resolved non-working-day set over a range (AD-29). A Baseline re-derives against the version it pinned, so a version is never edited.
DROP TRIGGER IF EXISTS "append_only_guard" ON public."holiday_calendar_version";
CREATE TRIGGER "append_only_guard"
  BEFORE UPDATE OR DELETE ON public."holiday_calendar_version"
  FOR EACH ROW EXECUTE FUNCTION public."momo_append_only_guard"();
DROP TRIGGER IF EXISTS "append_only_truncate_guard" ON public."holiday_calendar_version";
CREATE TRIGGER "append_only_truncate_guard"
  BEFORE TRUNCATE ON public."holiday_calendar_version"
  FOR EACH STATEMENT EXECUTE FUNCTION public."momo_append_only_truncate_guard"();

-- schedule_run: One recalculation: fully resolved inputs, outputs, cause and engine version (AD-26). Baselines and Published Snapshots pin it by reference.
DROP TRIGGER IF EXISTS "append_only_guard" ON public."schedule_run";
CREATE TRIGGER "append_only_guard"
  BEFORE UPDATE OR DELETE ON public."schedule_run"
  FOR EACH ROW EXECUTE FUNCTION public."momo_append_only_guard"();
DROP TRIGGER IF EXISTS "append_only_truncate_guard" ON public."schedule_run";
CREATE TRIGGER "append_only_truncate_guard"
  BEFORE TRUNCATE ON public."schedule_run"
  FOR EACH STATEMENT EXECUTE FUNCTION public."momo_append_only_truncate_guard"();

-- baseline_version: A Baseline is a pinned historical fact. Re-baselining appends a version; it never edits one.
DROP TRIGGER IF EXISTS "append_only_guard" ON public."baseline_version";
CREATE TRIGGER "append_only_guard"
  BEFORE UPDATE OR DELETE ON public."baseline_version"
  FOR EACH ROW EXECUTE FUNCTION public."momo_append_only_guard"();
DROP TRIGGER IF EXISTS "append_only_truncate_guard" ON public."baseline_version";
CREATE TRIGGER "append_only_truncate_guard"
  BEFORE TRUNCATE ON public."baseline_version"
  FOR EACH STATEMENT EXECUTE FUNCTION public."momo_append_only_truncate_guard"();

-- baseline_wp: The per-WP rows of a pinned Baseline version. Immutable for the same reason the version is.
DROP TRIGGER IF EXISTS "append_only_guard" ON public."baseline_wp";
CREATE TRIGGER "append_only_guard"
  BEFORE UPDATE OR DELETE ON public."baseline_wp"
  FOR EACH ROW EXECUTE FUNCTION public."momo_append_only_guard"();
DROP TRIGGER IF EXISTS "append_only_truncate_guard" ON public."baseline_wp";
CREATE TRIGGER "append_only_truncate_guard"
  BEFORE TRUNCATE ON public."baseline_wp"
  FOR EACH STATEMENT EXECUTE FUNCTION public."momo_append_only_truncate_guard"();

-- connector_scope_event: Connector scope history (story 5.2 / AR-19). Snapshots record the scope_seq they read under; editing history would rewrite which scope a figure came from.
DROP TRIGGER IF EXISTS "append_only_guard" ON public."connector_scope_event";
CREATE TRIGGER "append_only_guard"
  BEFORE UPDATE OR DELETE ON public."connector_scope_event"
  FOR EACH ROW EXECUTE FUNCTION public."momo_append_only_guard"();
DROP TRIGGER IF EXISTS "append_only_truncate_guard" ON public."connector_scope_event";
CREATE TRIGGER "append_only_truncate_guard"
  BEFORE TRUNCATE ON public."connector_scope_event"
  FOR EACH STATEMENT EXECUTE FUNCTION public."momo_append_only_truncate_guard"();

-- measurement_basis_event: Latched measurement basis per Connector (story 5.7 / AD-8). Metrics read the head at basis_seq_max; editing history would flip Ticket-Count Mode retroactively.
DROP TRIGGER IF EXISTS "append_only_guard" ON public."measurement_basis_event";
CREATE TRIGGER "append_only_guard"
  BEFORE UPDATE OR DELETE ON public."measurement_basis_event"
  FOR EACH ROW EXECUTE FUNCTION public."momo_append_only_guard"();
DROP TRIGGER IF EXISTS "append_only_truncate_guard" ON public."measurement_basis_event";
CREATE TRIGGER "append_only_truncate_guard"
  BEFORE TRUNCATE ON public."measurement_basis_event"
  FOR EACH STATEMENT EXECUTE FUNCTION public."momo_append_only_truncate_guard"();

-- connector_setting_event: Connector Resolved status set (story 5.7 / AR-38). Percent Complete and Unplanned count read the head at connector_setting_seq_max; editing would rewrite who was Resolved.
DROP TRIGGER IF EXISTS "append_only_guard" ON public."connector_setting_event";
CREATE TRIGGER "append_only_guard"
  BEFORE UPDATE OR DELETE ON public."connector_setting_event"
  FOR EACH ROW EXECUTE FUNCTION public."momo_append_only_guard"();
DROP TRIGGER IF EXISTS "append_only_truncate_guard" ON public."connector_setting_event";
CREATE TRIGGER "append_only_truncate_guard"
  BEFORE TRUNCATE ON public."connector_setting_event"
  FOR EACH STATEMENT EXECUTE FUNCTION public."momo_append_only_truncate_guard"();

-- tracker_snapshot_attempt: Failed snapshot attempts (story 5.2 / AR-16). Approval refuse and credential auth failures; a correction is a later successful snapshot, never an edit of a failed attempt.
DROP TRIGGER IF EXISTS "append_only_guard" ON public."tracker_snapshot_attempt";
CREATE TRIGGER "append_only_guard"
  BEFORE UPDATE OR DELETE ON public."tracker_snapshot_attempt"
  FOR EACH ROW EXECUTE FUNCTION public."momo_append_only_guard"();
DROP TRIGGER IF EXISTS "append_only_truncate_guard" ON public."tracker_snapshot_attempt";
CREATE TRIGGER "append_only_truncate_guard"
  BEFORE TRUNCATE ON public."tracker_snapshot_attempt"
  FOR EACH STATEMENT EXECUTE FUNCTION public."momo_append_only_truncate_guard"();

-- tracker_snapshot: An observation of the tracker at one instant. Editing it would rewrite what was observed.
DROP TRIGGER IF EXISTS "append_only_guard" ON public."tracker_snapshot";
CREATE TRIGGER "append_only_guard"
  BEFORE UPDATE OR DELETE ON public."tracker_snapshot"
  FOR EACH ROW EXECUTE FUNCTION public."momo_append_only_guard"();
DROP TRIGGER IF EXISTS "append_only_truncate_guard" ON public."tracker_snapshot";
CREATE TRIGGER "append_only_truncate_guard"
  BEFORE TRUNCATE ON public."tracker_snapshot"
  FOR EACH STATEMENT EXECUTE FUNCTION public."momo_append_only_truncate_guard"();

-- ticket_observation: The Tickets inside one Snapshot. Same argument as the Snapshot that carries them.
DROP TRIGGER IF EXISTS "append_only_guard" ON public."ticket_observation";
CREATE TRIGGER "append_only_guard"
  BEFORE UPDATE OR DELETE ON public."ticket_observation"
  FOR EACH ROW EXECUTE FUNCTION public."momo_append_only_guard"();
DROP TRIGGER IF EXISTS "append_only_truncate_guard" ON public."ticket_observation";
CREATE TRIGGER "append_only_truncate_guard"
  BEFORE TRUNCATE ON public."ticket_observation"
  FOR EACH STATEMENT EXECUTE FUNCTION public."momo_append_only_truncate_guard"();

-- connector_ownership_event: PM-confirmed ownership Keep/Transfer (story 5.6 / FR-42). owner_connector_id moves only through this event; editing history would rewrite who owned past hours.
DROP TRIGGER IF EXISTS "append_only_guard" ON public."connector_ownership_event";
CREATE TRIGGER "append_only_guard"
  BEFORE UPDATE OR DELETE ON public."connector_ownership_event"
  FOR EACH ROW EXECUTE FUNCTION public."momo_append_only_guard"();
DROP TRIGGER IF EXISTS "append_only_truncate_guard" ON public."connector_ownership_event";
CREATE TRIGGER "append_only_truncate_guard"
  BEFORE TRUNCATE ON public."connector_ownership_event"
  FOR EACH STATEMENT EXECUTE FUNCTION public."momo_append_only_truncate_guard"();

-- actuals_ledger_entry: The Actuals Ledger. A correction is a compensating delta, never an edit — that is what makes AC reproducible.
DROP TRIGGER IF EXISTS "append_only_guard" ON public."actuals_ledger_entry";
CREATE TRIGGER "append_only_guard"
  BEFORE UPDATE OR DELETE ON public."actuals_ledger_entry"
  FOR EACH ROW EXECUTE FUNCTION public."momo_append_only_guard"();
DROP TRIGGER IF EXISTS "append_only_truncate_guard" ON public."actuals_ledger_entry";
CREATE TRIGGER "append_only_truncate_guard"
  BEFORE TRUNCATE ON public."actuals_ledger_entry"
  FOR EACH STATEMENT EXECUTE FUNCTION public."momo_append_only_truncate_guard"();

-- mapping_event: Mapping is an event log; the current Mapping is its head. Editing history would move hours retroactively.
DROP TRIGGER IF EXISTS "append_only_guard" ON public."mapping_event";
CREATE TRIGGER "append_only_guard"
  BEFORE UPDATE OR DELETE ON public."mapping_event"
  FOR EACH ROW EXECUTE FUNCTION public."momo_append_only_guard"();
DROP TRIGGER IF EXISTS "append_only_truncate_guard" ON public."mapping_event";
CREATE TRIGGER "append_only_truncate_guard"
  BEFORE TRUNCATE ON public."mapping_event"
  FOR EACH STATEMENT EXECUTE FUNCTION public."momo_append_only_truncate_guard"();

-- disposition_event: A PM decision at a point in time (FR-29). The record of a decision is not editable.
DROP TRIGGER IF EXISTS "append_only_guard" ON public."disposition_event";
CREATE TRIGGER "append_only_guard"
  BEFORE UPDATE OR DELETE ON public."disposition_event"
  FOR EACH ROW EXECUTE FUNCTION public."momo_append_only_guard"();
DROP TRIGGER IF EXISTS "append_only_truncate_guard" ON public."disposition_event";
CREATE TRIGGER "append_only_truncate_guard"
  BEFORE TRUNCATE ON public."disposition_event"
  FOR EACH STATEMENT EXECUTE FUNCTION public."momo_append_only_truncate_guard"();

-- audit_log: The audit trail. An editable audit log is not one.
DROP TRIGGER IF EXISTS "append_only_guard" ON public."audit_log";
CREATE TRIGGER "append_only_guard"
  BEFORE UPDATE OR DELETE ON public."audit_log"
  FOR EACH ROW EXECUTE FUNCTION public."momo_append_only_guard"();
DROP TRIGGER IF EXISTS "append_only_truncate_guard" ON public."audit_log";
CREATE TRIGGER "append_only_truncate_guard"
  BEFORE TRUNCATE ON public."audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION public."momo_append_only_truncate_guard"();
