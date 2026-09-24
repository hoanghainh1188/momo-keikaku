CREATE TABLE "custom_field_definition" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"field_type" text NOT NULL,
	"options" text[] DEFAULT '{}' NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "custom_field_definition_tenant_project_id_key" UNIQUE("tenant_id","project_id","id"),
	CONSTRAINT "custom_field_definition_name_key" UNIQUE("tenant_id","project_id","name"),
	CONSTRAINT "custom_field_definition_type_check" CHECK ("custom_field_definition"."field_type" IN ('text', 'number', 'date', 'single_select'))
);
--> statement-breakpoint
CREATE TABLE "custom_field_value" (
	"tenant_id" text NOT NULL,
	"project_id" text NOT NULL,
	"wp_id" text NOT NULL,
	"definition_id" text NOT NULL,
	"text_value" text,
	"number_value" bigint,
	"date_value" date,
	"select_value" text,
	CONSTRAINT "custom_field_value_pk" PRIMARY KEY("tenant_id","project_id","wp_id","definition_id")
);
--> statement-breakpoint
CREATE TABLE "pct_override_event" (
	"seq" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pct_override_event_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" text NOT NULL,
	"project_id" text NOT NULL,
	"wp_id" text NOT NULL,
	"recorded_pct_num" bigint NOT NULL,
	"recorded_pct_den" bigint NOT NULL,
	"actor" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "pct_override_event_den_check" CHECK ("pct_override_event"."recorded_pct_den" <> 0)
);
--> statement-breakpoint
ALTER TABLE "custom_field_definition" ADD CONSTRAINT "custom_field_definition_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."project"("tenant_id","id") MATCH FULL ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_value" ADD CONSTRAINT "custom_field_value_work_package_fk" FOREIGN KEY ("tenant_id","project_id","wp_id") REFERENCES "public"."work_package"("tenant_id","project_id","id") MATCH FULL ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_value" ADD CONSTRAINT "custom_field_value_definition_fk" FOREIGN KEY ("tenant_id","project_id","definition_id") REFERENCES "public"."custom_field_definition"("tenant_id","project_id","id") MATCH FULL ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pct_override_event" ADD CONSTRAINT "pct_override_event_work_package_fk" FOREIGN KEY ("tenant_id","project_id","wp_id") REFERENCES "public"."work_package"("tenant_id","project_id","id") MATCH FULL ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pct_override_event_wp_idx" ON "pct_override_event" USING btree ("tenant_id","project_id","wp_id","seq");
