CREATE TABLE "calendar_day_event" (
	"seq" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "calendar_day_event_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" text NOT NULL,
	"project_id" text NOT NULL,
	"day" date NOT NULL,
	"effect" text NOT NULL,
	"actor" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "calendar_day_event_effect_check" CHECK ("calendar_day_event"."effect" IN ('add', 'remove'))
);
--> statement-breakpoint
ALTER TABLE "calendar_day_event" ADD CONSTRAINT "calendar_day_event_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."project"("tenant_id","id") MATCH FULL ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_day_event_day_idx" ON "calendar_day_event" USING btree ("tenant_id","project_id","day","seq");
