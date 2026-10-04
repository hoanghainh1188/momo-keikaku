-- Story 5.2 — connector credentials, client approval, scope events, failed attempts, scope_seq.
-- Hand edits beyond drizzle-kit generate (pinned by schema-catalog / MATCH lists):
--   1. `site` expand: ADD nullable → backfill from space_label → SET NOT NULL (existing rows).
--   2. MATCH FULL on composite FKs whose columns are all NOT NULL.
--   3. MATCH SIMPLE on tracker_snapshot_scope_seq_fk (nullable scope_seq).
--   4. bytea without drizzle's quoted `"bytea"` type name.
ALTER TABLE "connector" ADD COLUMN "site" text;--> statement-breakpoint
UPDATE "connector" SET "site" = split_part("space_label", ' ', 1);--> statement-breakpoint
ALTER TABLE "connector" ALTER COLUMN "site" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "connector" ADD COLUMN "approval_recorded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "connector" ADD COLUMN "approval_name" text;--> statement-breakpoint
ALTER TABLE "connector" ADD COLUMN "credentials_ciphertext" bytea;--> statement-breakpoint
ALTER TABLE "connector" ADD COLUMN "credentials_nonce" bytea;--> statement-breakpoint
ALTER TABLE "connector" ADD COLUMN "credentials_key_id" text;--> statement-breakpoint
ALTER TABLE "connector" ADD COLUMN "last_error_code" text;--> statement-breakpoint
ALTER TABLE "connector" ADD COLUMN "last_error_message" text;--> statement-breakpoint
ALTER TABLE "connector" ADD COLUMN "last_error_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE "connector_scope_event" (
	"seq" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "connector_scope_event_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" text NOT NULL,
	"connector_id" text NOT NULL,
	"project_id" text NOT NULL,
	"scope" text NOT NULL,
	"actor" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "connector_scope_event_tenant_seq_key" UNIQUE("tenant_id","seq")
);
--> statement-breakpoint
CREATE TABLE "tracker_snapshot_attempt" (
	"seq" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tracker_snapshot_attempt_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" text NOT NULL,
	"connector_id" text NOT NULL,
	"reason_code" text NOT NULL,
	"message" text NOT NULL,
	"attempted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tracker_snapshot" ADD COLUMN "scope_seq" bigint;--> statement-breakpoint
ALTER TABLE "connector_scope_event" ADD CONSTRAINT "connector_scope_event_connector_fk" FOREIGN KEY ("tenant_id","connector_id") REFERENCES "public"."connector"("tenant_id","id") MATCH FULL ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_scope_event" ADD CONSTRAINT "connector_scope_event_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."project"("tenant_id","id") MATCH FULL ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_snapshot_attempt" ADD CONSTRAINT "tracker_snapshot_attempt_connector_fk" FOREIGN KEY ("tenant_id","connector_id") REFERENCES "public"."connector"("tenant_id","id") MATCH FULL ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connector_scope_event_connector_idx" ON "connector_scope_event" USING btree ("tenant_id","connector_id","seq");--> statement-breakpoint
CREATE INDEX "tracker_snapshot_attempt_connector_idx" ON "tracker_snapshot_attempt" USING btree ("tenant_id","connector_id","seq");--> statement-breakpoint
ALTER TABLE "tracker_snapshot" ADD CONSTRAINT "tracker_snapshot_scope_seq_fk" FOREIGN KEY ("tenant_id","scope_seq") REFERENCES "public"."connector_scope_event"("tenant_id","seq") MATCH SIMPLE ON DELETE no action ON UPDATE no action;
