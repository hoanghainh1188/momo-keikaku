-- Story 5.12 — wp_flag_event (append_only).
-- Hand edits beyond drizzle-kit generate (MATCH FULL on composite FKs whose columns are all NOT NULL).
CREATE TABLE "wp_flag_event" (
	"seq" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wp_flag_event_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" text NOT NULL,
	"project_id" text NOT NULL,
	"wp_id" text NOT NULL,
	"is_catch_all" boolean NOT NULL,
	"actor" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "wp_flag_event_tenant_seq_key" UNIQUE("tenant_id","seq")
);
--> statement-breakpoint
ALTER TABLE "wp_flag_event" ADD CONSTRAINT "wp_flag_event_work_package_fk" FOREIGN KEY ("tenant_id","project_id","wp_id") REFERENCES "public"."work_package"("tenant_id","project_id","id") MATCH FULL ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wp_flag_event_wp_idx" ON "wp_flag_event" USING btree ("tenant_id","project_id","wp_id","seq");
