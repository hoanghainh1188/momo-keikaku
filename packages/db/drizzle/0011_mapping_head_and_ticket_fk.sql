-- Story 5.9 — mapping_head (derived), ticket project+tracker_issue unique, mapping_event ticket FK + release source.
-- Hand edits beyond drizzle-kit generate (MATCH FULL on composite FKs whose columns are all NOT NULL;
-- nullable wp_id / rule_id FKs stay MATCH SIMPLE per FK_MATCH_SIMPLE).
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_project_tracker_issue_key" UNIQUE("tenant_id","project_id","tracker_issue_id");
--> statement-breakpoint
ALTER TABLE "mapping_event" ADD CONSTRAINT "mapping_event_source_check" CHECK ("source" IN ('manual', 'rule', 'disposition', 'release'));
--> statement-breakpoint
ALTER TABLE "mapping_event" ADD CONSTRAINT "mapping_event_ticket_fk" FOREIGN KEY ("tenant_id","project_id","ticket_id") REFERENCES "public"."ticket"("tenant_id","project_id","tracker_issue_id") MATCH FULL ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "mapping_event_project_ticket_seq_idx" ON "mapping_event" USING btree ("tenant_id","project_id","ticket_id","seq");
--> statement-breakpoint
CREATE TABLE "mapping_head" (
	"tenant_id" text NOT NULL,
	"project_id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"wp_id" text,
	"source" text NOT NULL,
	"rule_id" text,
	"seq" bigint NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"actor" text NOT NULL,
	CONSTRAINT "mapping_head_pkey" PRIMARY KEY("tenant_id","project_id","ticket_id"),
	CONSTRAINT "mapping_head_source_check" CHECK ("source" IN ('manual', 'rule', 'disposition', 'release'))
);
--> statement-breakpoint
ALTER TABLE "mapping_head" ADD CONSTRAINT "mapping_head_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."project"("tenant_id","id") MATCH FULL ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapping_head" ADD CONSTRAINT "mapping_head_ticket_fk" FOREIGN KEY ("tenant_id","project_id","ticket_id") REFERENCES "public"."ticket"("tenant_id","project_id","tracker_issue_id") MATCH FULL ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapping_head" ADD CONSTRAINT "mapping_head_work_package_fk" FOREIGN KEY ("tenant_id","project_id","wp_id") REFERENCES "public"."work_package"("tenant_id","project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapping_head" ADD CONSTRAINT "mapping_head_mapping_rule_fk" FOREIGN KEY ("tenant_id","project_id","rule_id") REFERENCES "public"."mapping_rule"("tenant_id","project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mapping_head_wp_idx" ON "mapping_head" USING btree ("tenant_id","project_id","wp_id");
--> statement-breakpoint
-- Rebuild derived heads from existing events (latest seq per ticket wins).
INSERT INTO "mapping_head" ("tenant_id", "project_id", "ticket_id", "wp_id", "source", "rule_id", "seq", "at", "actor")
SELECT DISTINCT ON ("tenant_id", "project_id", "ticket_id")
  "tenant_id", "project_id", "ticket_id", "wp_id", "source", "rule_id", "seq", "at", "actor"
FROM "mapping_event"
ORDER BY "tenant_id", "project_id", "ticket_id", "seq" DESC;
