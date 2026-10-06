-- Story 5.7 — measurement_basis_event + connector_setting_event (append_only).
-- Hand edits beyond drizzle-kit generate (MATCH FULL on composite FKs whose columns are all NOT NULL).
CREATE TABLE "connector_setting_event" (
	"seq" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "connector_setting_event_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" text NOT NULL,
	"connector_id" text NOT NULL,
	"project_id" text NOT NULL,
	"resolved_status_ids" jsonb NOT NULL,
	"actor" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "connector_setting_event_tenant_seq_key" UNIQUE("tenant_id","seq")
);
--> statement-breakpoint
CREATE TABLE "measurement_basis_event" (
	"seq" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "measurement_basis_event_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" text NOT NULL,
	"connector_id" text NOT NULL,
	"project_id" text NOT NULL,
	"basis" text NOT NULL,
	"actor" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "measurement_basis_event_tenant_seq_key" UNIQUE("tenant_id","seq")
);
--> statement-breakpoint
ALTER TABLE "connector_setting_event" ADD CONSTRAINT "connector_setting_event_connector_fk" FOREIGN KEY ("tenant_id","connector_id") REFERENCES "public"."connector"("tenant_id","id") MATCH FULL ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_setting_event" ADD CONSTRAINT "connector_setting_event_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."project"("tenant_id","id") MATCH FULL ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_basis_event" ADD CONSTRAINT "measurement_basis_event_connector_fk" FOREIGN KEY ("tenant_id","connector_id") REFERENCES "public"."connector"("tenant_id","id") MATCH FULL ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_basis_event" ADD CONSTRAINT "measurement_basis_event_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."project"("tenant_id","id") MATCH FULL ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connector_setting_event_connector_idx" ON "connector_setting_event" USING btree ("tenant_id","connector_id","seq");--> statement-breakpoint
CREATE INDEX "measurement_basis_event_connector_idx" ON "measurement_basis_event" USING btree ("tenant_id","connector_id","seq");
