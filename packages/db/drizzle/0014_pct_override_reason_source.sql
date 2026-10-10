-- Story 6.4 — expand pct_override_event with nullable reason + optional source (AD-19 expand).
-- CHECK allows NULL (legacy rows) and R0 writers only — expand-safe.
ALTER TABLE "pct_override_event" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "pct_override_event" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "pct_override_event" ADD CONSTRAINT "pct_override_event_source_check" CHECK ("source" IS NULL OR "source" IN ('pm_override', 'plan_edit'));
