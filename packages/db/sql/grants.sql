-- Grants: what each role holds, by table class, and nothing more
--
-- GENERATED from packages/db/src/table-classes.ts by packages/db/src/sql/generate.ts.
-- Do not edit: `pnpm db:sql` rewrites this file and a test fails when it has drifted.
-- Applied by `pnpm db:policies`, which regenerates rather than reading this file, so a
-- hand edit cannot reach a database either.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM "momo_app", "momo_maintenance";
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM "momo_app", "momo_maintenance";

GRANT USAGE ON SCHEMA public TO "momo_app", "momo_maintenance";

-- tenant (global)
GRANT SELECT, UPDATE ON public."tenant" TO "momo_app";

-- auth_user (global)
GRANT SELECT, INSERT, UPDATE, DELETE ON public."auth_user" TO "momo_app";

-- session (global)
GRANT SELECT, INSERT, UPDATE, DELETE ON public."session" TO "momo_app";

-- account (global)
GRANT SELECT, INSERT, UPDATE, DELETE ON public."account" TO "momo_app";

-- verification (global)
GRANT SELECT, INSERT, UPDATE, DELETE ON public."verification" TO "momo_app";

-- tenant_membership (global)
GRANT SELECT, UPDATE, DELETE ON public."tenant_membership" TO "momo_app";

-- identity_event (global)
GRANT SELECT, INSERT ON public."identity_event" TO "momo_app";
GRANT SELECT, UPDATE, DELETE ON public."identity_event" TO "momo_maintenance";

-- department (mutable-audited)
GRANT SELECT, INSERT, UPDATE, DELETE ON public."department" TO "momo_app";

-- program (mutable-audited)
GRANT SELECT, INSERT, UPDATE, DELETE ON public."program" TO "momo_app";

-- project (mutable-audited)
GRANT SELECT, INSERT, UPDATE, DELETE ON public."project" TO "momo_app";

-- project_setting_event (append-only)
GRANT SELECT, INSERT ON public."project_setting_event" TO "momo_app";
GRANT SELECT, UPDATE, DELETE ON public."project_setting_event" TO "momo_maintenance";

-- resource (mutable-audited)
GRANT SELECT, INSERT, UPDATE, DELETE ON public."resource" TO "momo_app";

-- rate_entry (append-only)
GRANT SELECT, INSERT ON public."rate_entry" TO "momo_app";
GRANT SELECT, UPDATE, DELETE ON public."rate_entry" TO "momo_maintenance";

-- project_default_rate_entry (append-only)
GRANT SELECT, INSERT ON public."project_default_rate_entry" TO "momo_app";
GRANT SELECT, UPDATE, DELETE ON public."project_default_rate_entry" TO "momo_maintenance";

-- work_package (mutable-audited)
GRANT SELECT, INSERT, UPDATE, DELETE ON public."work_package" TO "momo_app";

-- wp_dependency (mutable-audited)
GRANT SELECT, INSERT, UPDATE, DELETE ON public."wp_dependency" TO "momo_app";

-- wp_status_event (append-only)
GRANT SELECT, INSERT ON public."wp_status_event" TO "momo_app";
GRANT SELECT, UPDATE, DELETE ON public."wp_status_event" TO "momo_maintenance";

-- pct_override_event (append-only)
GRANT SELECT, INSERT ON public."pct_override_event" TO "momo_app";
GRANT SELECT, UPDATE, DELETE ON public."pct_override_event" TO "momo_maintenance";

-- custom_field_definition (mutable-audited)
GRANT SELECT, INSERT, UPDATE, DELETE ON public."custom_field_definition" TO "momo_app";

-- custom_field_value (mutable-audited)
GRANT SELECT, INSERT, UPDATE, DELETE ON public."custom_field_value" TO "momo_app";

-- calendar_day_event (append-only)
GRANT SELECT, INSERT ON public."calendar_day_event" TO "momo_app";
GRANT SELECT, UPDATE, DELETE ON public."calendar_day_event" TO "momo_maintenance";

-- holiday_calendar_version (append-only)
GRANT SELECT, INSERT ON public."holiday_calendar_version" TO "momo_app";
GRANT SELECT, UPDATE, DELETE ON public."holiday_calendar_version" TO "momo_maintenance";

-- schedule_run (append-only)
GRANT SELECT, INSERT ON public."schedule_run" TO "momo_app";
GRANT SELECT, UPDATE, DELETE ON public."schedule_run" TO "momo_maintenance";

-- wp_schedule (derived)
GRANT SELECT, INSERT, UPDATE, DELETE ON public."wp_schedule" TO "momo_app";

-- baseline_version (append-only)
GRANT SELECT, INSERT ON public."baseline_version" TO "momo_app";
GRANT SELECT, UPDATE, DELETE ON public."baseline_version" TO "momo_maintenance";

-- baseline_wp (append-only)
GRANT SELECT, INSERT ON public."baseline_wp" TO "momo_app";
GRANT SELECT, UPDATE, DELETE ON public."baseline_wp" TO "momo_maintenance";

-- connector (mutable-audited)
GRANT SELECT, INSERT, UPDATE, DELETE ON public."connector" TO "momo_app";

-- connector_scope_event (append-only)
GRANT SELECT, INSERT ON public."connector_scope_event" TO "momo_app";
GRANT SELECT, UPDATE, DELETE ON public."connector_scope_event" TO "momo_maintenance";

-- measurement_basis_event (append-only)
GRANT SELECT, INSERT ON public."measurement_basis_event" TO "momo_app";
GRANT SELECT, UPDATE, DELETE ON public."measurement_basis_event" TO "momo_maintenance";

-- connector_setting_event (append-only)
GRANT SELECT, INSERT ON public."connector_setting_event" TO "momo_app";
GRANT SELECT, UPDATE, DELETE ON public."connector_setting_event" TO "momo_maintenance";

-- tracker_snapshot_attempt (append-only)
GRANT SELECT, INSERT ON public."tracker_snapshot_attempt" TO "momo_app";
GRANT SELECT, UPDATE, DELETE ON public."tracker_snapshot_attempt" TO "momo_maintenance";

-- ticket (derived)
GRANT SELECT, INSERT, UPDATE, DELETE ON public."ticket" TO "momo_app";

-- tracker_account (mutable-audited)
GRANT SELECT, INSERT, UPDATE, DELETE ON public."tracker_account" TO "momo_app";

-- tracker_account_link_event (append-only)
GRANT SELECT, INSERT ON public."tracker_account_link_event" TO "momo_app";
GRANT SELECT, UPDATE, DELETE ON public."tracker_account_link_event" TO "momo_maintenance";

-- fixture_cursor (operational)
GRANT SELECT, INSERT, UPDATE, DELETE ON public."fixture_cursor" TO "momo_app";

-- tracker_snapshot (append-only)
GRANT SELECT, INSERT ON public."tracker_snapshot" TO "momo_app";
GRANT SELECT, UPDATE, DELETE ON public."tracker_snapshot" TO "momo_maintenance";

-- ticket_observation (append-only)
GRANT SELECT, INSERT ON public."ticket_observation" TO "momo_app";
GRANT SELECT, UPDATE, DELETE ON public."ticket_observation" TO "momo_maintenance";

-- connector_ownership_event (append-only)
GRANT SELECT, INSERT ON public."connector_ownership_event" TO "momo_app";
GRANT SELECT, UPDATE, DELETE ON public."connector_ownership_event" TO "momo_maintenance";

-- connector_overlap (derived)
GRANT SELECT, INSERT, UPDATE, DELETE ON public."connector_overlap" TO "momo_app";

-- actuals_ledger_entry (append-only)
GRANT SELECT, INSERT ON public."actuals_ledger_entry" TO "momo_app";
GRANT SELECT, UPDATE, DELETE ON public."actuals_ledger_entry" TO "momo_maintenance";

-- mapping_rule (mutable-audited)
GRANT SELECT, INSERT, UPDATE, DELETE ON public."mapping_rule" TO "momo_app";

-- mapping_event (append-only)
GRANT SELECT, INSERT ON public."mapping_event" TO "momo_app";
GRANT SELECT, UPDATE, DELETE ON public."mapping_event" TO "momo_maintenance";

-- disposition_event (append-only)
GRANT SELECT, INSERT ON public."disposition_event" TO "momo_app";
GRANT SELECT, UPDATE, DELETE ON public."disposition_event" TO "momo_maintenance";

-- audit_log (append-only)
GRANT SELECT, INSERT ON public."audit_log" TO "momo_app";
GRANT SELECT, UPDATE, DELETE ON public."audit_log" TO "momo_maintenance";

-- Identity columns need their sequence. USAGE only: no SELECT-and-setval, and no
-- ownership, so the application role can allocate a value and nothing else.
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO "momo_app";
