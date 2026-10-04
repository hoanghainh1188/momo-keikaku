CREATE TABLE "ticket" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"tracker_kind" text NOT NULL,
	"tracker_site" text NOT NULL,
	"tracker_issue_id" text NOT NULL,
	"owner_connector_id" text NOT NULL,
	"project_id" text NOT NULL,
	"key" text NOT NULL,
	CONSTRAINT "ticket_tracker_identity_key" UNIQUE("tenant_id","tracker_kind","tracker_site","tracker_issue_id"),
	CONSTRAINT "ticket_tenant_id_key" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "tracker_account" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"tracker_kind" text NOT NULL,
	"tracker_site" text NOT NULL,
	"account_id" text NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	CONSTRAINT "tracker_account_identity_key" UNIQUE("tenant_id","tracker_kind","tracker_site","account_id"),
	CONSTRAINT "tracker_account_tenant_id_key" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "fixture_cursor" (
	"tenant_id" text NOT NULL,
	"connector_id" text NOT NULL,
	"next_page_index" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "fixture_cursor_pk" PRIMARY KEY("tenant_id","connector_id")
);
--> statement-breakpoint
-- Temporary DEFAULT only for the expand step against existing rows; drop it so
-- later inserts must name the adapter kind in effect (AD-6).
ALTER TABLE "tracker_snapshot" ADD COLUMN "adapter_kind" text DEFAULT 'fixture' NOT NULL;--> statement-breakpoint
ALTER TABLE "tracker_snapshot" ALTER COLUMN "adapter_kind" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "ticket_observation" ADD COLUMN "parent_issue_id" text;--> statement-breakpoint
ALTER TABLE "ticket_observation" ADD COLUMN "tracker_project_id" text;--> statement-breakpoint
ALTER TABLE "ticket_observation" ADD COLUMN "attributes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- Story 5.1 reshape: fold Backlog-shaped arrays into AD-6 attributes, then drop legacy columns.
UPDATE "ticket_observation" SET "attributes" = COALESCE(
  (
    SELECT jsonb_agg(elem ORDER BY ord)
    FROM (
      SELECT jsonb_build_object('kind', 'category', 'id', cat) AS elem, 1 AS ord
      FROM unnest(COALESCE("category_ids", ARRAY[]::text[])) AS cat
      UNION ALL
      SELECT jsonb_build_object('kind', 'milestone', 'id', ms) AS elem, 2 AS ord
      FROM unnest(COALESCE("milestone_ids", ARRAY[]::text[])) AS ms
    ) folded
  ),
  '[]'::jsonb
);--> statement-breakpoint
ALTER TABLE "ticket_observation" DROP COLUMN "resolved";--> statement-breakpoint
ALTER TABLE "ticket_observation" DROP COLUMN "category_ids";--> statement-breakpoint
ALTER TABLE "ticket_observation" DROP COLUMN "milestone_ids";--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_owner_connector_fk" FOREIGN KEY ("tenant_id","owner_connector_id") REFERENCES "public"."connector"("tenant_id","id") MATCH FULL ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."project"("tenant_id","id") MATCH FULL ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixture_cursor" ADD CONSTRAINT "fixture_cursor_connector_fk" FOREIGN KEY ("tenant_id","connector_id") REFERENCES "public"."connector"("tenant_id","id") MATCH FULL ON DELETE no action ON UPDATE no action;
