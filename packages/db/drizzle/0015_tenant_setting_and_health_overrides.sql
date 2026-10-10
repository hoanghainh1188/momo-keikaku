CREATE TABLE "tenant_setting_event" (
	"seq" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tenant_setting_event_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" text NOT NULL,
	"ratio_green_num" bigint NOT NULL,
	"ratio_green_den" bigint NOT NULL,
	"ratio_amber_num" bigint NOT NULL,
	"ratio_amber_den" bigint NOT NULL,
	"tcpi_red_num" bigint NOT NULL,
	"tcpi_red_den" bigint NOT NULL,
	"unplanned_green_below_num" bigint NOT NULL,
	"unplanned_green_below_den" bigint NOT NULL,
	"unplanned_amber_max_num" bigint NOT NULL,
	"unplanned_amber_max_den" bigint NOT NULL,
	"actor" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "tenant_setting_event_tenant_seq_key" UNIQUE("tenant_id","seq"),
	CONSTRAINT "tenant_setting_event_ratio_green_den" CHECK ("tenant_setting_event"."ratio_green_den" <> 0),
	CONSTRAINT "tenant_setting_event_ratio_amber_den" CHECK ("tenant_setting_event"."ratio_amber_den" <> 0),
	CONSTRAINT "tenant_setting_event_tcpi_red_den" CHECK ("tenant_setting_event"."tcpi_red_den" <> 0),
	CONSTRAINT "tenant_setting_event_unplanned_green_den" CHECK ("tenant_setting_event"."unplanned_green_below_den" <> 0),
	CONSTRAINT "tenant_setting_event_unplanned_amber_den" CHECK ("tenant_setting_event"."unplanned_amber_max_den" <> 0)
);
--> statement-breakpoint
ALTER TABLE "pct_override_event" DROP CONSTRAINT "pct_override_event_source_check";--> statement-breakpoint
ALTER TABLE "project_setting_event" ADD COLUMN "ratio_green_num" bigint;--> statement-breakpoint
ALTER TABLE "project_setting_event" ADD COLUMN "ratio_green_den" bigint;--> statement-breakpoint
ALTER TABLE "project_setting_event" ADD COLUMN "ratio_amber_num" bigint;--> statement-breakpoint
ALTER TABLE "project_setting_event" ADD COLUMN "ratio_amber_den" bigint;--> statement-breakpoint
ALTER TABLE "project_setting_event" ADD COLUMN "tcpi_red_num" bigint;--> statement-breakpoint
ALTER TABLE "project_setting_event" ADD COLUMN "tcpi_red_den" bigint;--> statement-breakpoint
ALTER TABLE "project_setting_event" ADD COLUMN "unplanned_green_below_num" bigint;--> statement-breakpoint
ALTER TABLE "project_setting_event" ADD COLUMN "unplanned_green_below_den" bigint;--> statement-breakpoint
ALTER TABLE "project_setting_event" ADD COLUMN "unplanned_amber_max_num" bigint;--> statement-breakpoint
ALTER TABLE "project_setting_event" ADD COLUMN "unplanned_amber_max_den" bigint;--> statement-breakpoint
ALTER TABLE "tenant_setting_event" ADD CONSTRAINT "tenant_setting_event_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tenant_setting_event_tenant_idx" ON "tenant_setting_event" USING btree ("tenant_id","seq");--> statement-breakpoint
ALTER TABLE "pct_override_event" ADD CONSTRAINT "pct_override_event_source_check" CHECK ("pct_override_event"."source" IS NULL OR "pct_override_event"."source" IN ('pm_override', 'plan_edit'));--> statement-breakpoint
ALTER TABLE "project_setting_event" ADD CONSTRAINT "project_setting_event_ratio_green_pair" CHECK (("project_setting_event"."ratio_green_num" IS NULL) = ("project_setting_event"."ratio_green_den" IS NULL));--> statement-breakpoint
ALTER TABLE "project_setting_event" ADD CONSTRAINT "project_setting_event_ratio_amber_pair" CHECK (("project_setting_event"."ratio_amber_num" IS NULL) = ("project_setting_event"."ratio_amber_den" IS NULL));--> statement-breakpoint
ALTER TABLE "project_setting_event" ADD CONSTRAINT "project_setting_event_tcpi_red_pair" CHECK (("project_setting_event"."tcpi_red_num" IS NULL) = ("project_setting_event"."tcpi_red_den" IS NULL));--> statement-breakpoint
ALTER TABLE "project_setting_event" ADD CONSTRAINT "project_setting_event_unplanned_green_pair" CHECK (("project_setting_event"."unplanned_green_below_num" IS NULL) = ("project_setting_event"."unplanned_green_below_den" IS NULL));--> statement-breakpoint
ALTER TABLE "project_setting_event" ADD CONSTRAINT "project_setting_event_unplanned_amber_pair" CHECK (("project_setting_event"."unplanned_amber_max_num" IS NULL) = ("project_setting_event"."unplanned_amber_max_den" IS NULL));--> statement-breakpoint
ALTER TABLE "project_setting_event" ADD CONSTRAINT "project_setting_event_ratio_green_den" CHECK ("project_setting_event"."ratio_green_den" IS NULL OR "project_setting_event"."ratio_green_den" <> 0);--> statement-breakpoint
ALTER TABLE "project_setting_event" ADD CONSTRAINT "project_setting_event_ratio_amber_den" CHECK ("project_setting_event"."ratio_amber_den" IS NULL OR "project_setting_event"."ratio_amber_den" <> 0);--> statement-breakpoint
ALTER TABLE "project_setting_event" ADD CONSTRAINT "project_setting_event_tcpi_red_den" CHECK ("project_setting_event"."tcpi_red_den" IS NULL OR "project_setting_event"."tcpi_red_den" <> 0);--> statement-breakpoint
ALTER TABLE "project_setting_event" ADD CONSTRAINT "project_setting_event_unplanned_green_den" CHECK ("project_setting_event"."unplanned_green_below_den" IS NULL OR "project_setting_event"."unplanned_green_below_den" <> 0);--> statement-breakpoint
ALTER TABLE "project_setting_event" ADD CONSTRAINT "project_setting_event_unplanned_amber_den" CHECK ("project_setting_event"."unplanned_amber_max_den" IS NULL OR "project_setting_event"."unplanned_amber_max_den" <> 0);