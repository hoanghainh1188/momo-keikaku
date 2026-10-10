-- Story 6.4 — expand pct_override_event with nullable reason + optional source (AD-19 expand).
-- Hand edits beyond drizzle-kit generate: none (nullable text columns only).
ALTER TABLE "pct_override_event" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "pct_override_event" ADD COLUMN "source" text;
