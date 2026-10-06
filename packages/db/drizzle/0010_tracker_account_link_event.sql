-- Story 5.8 — tracker_account_link_event (append_only).
-- Hand edits beyond drizzle-kit generate (MATCH FULL on composite FKs whose columns are all NOT NULL;
-- resource_id is nullable so its FK stays MATCH SIMPLE).
CREATE TABLE "tracker_account_link_event" (
	"seq" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tracker_account_link_event_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" text NOT NULL,
	"tracker_account_id" text NOT NULL,
	"resource_id" text,
	"actor" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "tracker_account_link_event_tenant_seq_key" UNIQUE("tenant_id","seq")
);
--> statement-breakpoint
ALTER TABLE "tracker_account_link_event" ADD CONSTRAINT "tracker_account_link_event_account_fk" FOREIGN KEY ("tenant_id","tracker_account_id") REFERENCES "public"."tracker_account"("tenant_id","id") MATCH FULL ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_account_link_event" ADD CONSTRAINT "tracker_account_link_event_resource_fk" FOREIGN KEY ("tenant_id","resource_id") REFERENCES "public"."resource"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tracker_account_link_event_account_idx" ON "tracker_account_link_event" USING btree ("tenant_id","tracker_account_id","seq");
