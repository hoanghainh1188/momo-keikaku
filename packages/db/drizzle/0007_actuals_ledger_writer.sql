-- Story 5.5 — Actuals Ledger writer: hours_cleared, prev_snapshot_id, idempotent observed_at,
-- project_setting_event. Hand edits beyond drizzle-kit generate (pinned by schema-catalog):
--   1. MATCH FULL on project_setting_event_project_fk (all NOT NULL).
--   2. MATCH SIMPLE on actuals_ledger_entry_prev_snapshot_fk (nullable prev_snapshot_id).
CREATE TABLE "project_setting_event" (
	"seq" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "project_setting_event_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" text NOT NULL,
	"project_id" text NOT NULL,
	"tz_offset_minutes" integer NOT NULL,
	"teirei_weekday" integer NOT NULL,
	"actor" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "project_setting_event_tenant_seq_key" UNIQUE("tenant_id","seq")
);
--> statement-breakpoint
ALTER TABLE "project_setting_event" ADD CONSTRAINT "project_setting_event_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."project"("tenant_id","id") MATCH FULL ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_setting_event_project_idx" ON "project_setting_event" USING btree ("tenant_id","project_id","seq");--> statement-breakpoint
ALTER TABLE "ticket_observation" ADD COLUMN "hours_cleared" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "actuals_ledger_entry" ADD COLUMN "prev_snapshot_id" text;--> statement-breakpoint
ALTER TABLE "actuals_ledger_entry" ADD CONSTRAINT "actuals_ledger_entry_prev_snapshot_fk" FOREIGN KEY ("tenant_id","prev_snapshot_id") REFERENCES "public"."tracker_snapshot"("tenant_id","id") MATCH SIMPLE ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_snapshot" ADD CONSTRAINT "tracker_snapshot_connector_observed_at_key" UNIQUE("tenant_id","connector_id","observed_at");
