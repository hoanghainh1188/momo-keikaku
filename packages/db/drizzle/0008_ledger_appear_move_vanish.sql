-- Story 5.6 — left_scope state, connector_ownership_event (append_only), connector_overlap (derived).
-- Hand edits beyond drizzle-kit generate (pinned by schema-catalog / MATCH lists):
--   1. MATCH FULL on composite FKs whose columns are all NOT NULL.
--   2. MATCH FULL on connector_overlap_snapshot_fk (snapshot_id NOT NULL).
CREATE TABLE "connector_ownership_event" (
	"seq" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "connector_ownership_event_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" text NOT NULL,
	"project_id" text NOT NULL,
	"tracker_issue_id" text NOT NULL,
	"from_connector_id" text NOT NULL,
	"to_connector_id" text NOT NULL,
	"resolution" text NOT NULL,
	"actor" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "connector_ownership_event_tenant_seq_key" UNIQUE("tenant_id","seq")
);
--> statement-breakpoint
CREATE TABLE "connector_overlap" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"project_id" text NOT NULL,
	"tracker_issue_id" text NOT NULL,
	"ticket_key" text NOT NULL,
	"owner_connector_id" text NOT NULL,
	"claimer_connector_id" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"snapshot_id" text NOT NULL,
	CONSTRAINT "connector_overlap_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "connector_overlap_open_claim_key" UNIQUE("tenant_id","tracker_issue_id","claimer_connector_id")
);
--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "left_scope" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "absent_complete_streak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "connector_ownership_event" ADD CONSTRAINT "connector_ownership_event_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."project"("tenant_id","id") MATCH FULL ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_ownership_event" ADD CONSTRAINT "connector_ownership_event_from_connector_fk" FOREIGN KEY ("tenant_id","from_connector_id") REFERENCES "public"."connector"("tenant_id","id") MATCH FULL ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_ownership_event" ADD CONSTRAINT "connector_ownership_event_to_connector_fk" FOREIGN KEY ("tenant_id","to_connector_id") REFERENCES "public"."connector"("tenant_id","id") MATCH FULL ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_overlap" ADD CONSTRAINT "connector_overlap_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."project"("tenant_id","id") MATCH FULL ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_overlap" ADD CONSTRAINT "connector_overlap_owner_connector_fk" FOREIGN KEY ("tenant_id","owner_connector_id") REFERENCES "public"."connector"("tenant_id","id") MATCH FULL ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_overlap" ADD CONSTRAINT "connector_overlap_claimer_connector_fk" FOREIGN KEY ("tenant_id","claimer_connector_id") REFERENCES "public"."connector"("tenant_id","id") MATCH FULL ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_overlap" ADD CONSTRAINT "connector_overlap_snapshot_fk" FOREIGN KEY ("tenant_id","snapshot_id") REFERENCES "public"."tracker_snapshot"("tenant_id","id") MATCH FULL ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connector_ownership_event_ticket_idx" ON "connector_ownership_event" USING btree ("tenant_id","tracker_issue_id","seq");--> statement-breakpoint
CREATE INDEX "connector_overlap_project_idx" ON "connector_overlap" USING btree ("tenant_id","project_id");
