-- Story 5.10 — Mapping Rules authored by the PM: soft delete, one condition per rule over
-- milestone | category | issueType | parent | keyPattern, and a strictly ordered live list.
-- Hand edits beyond drizzle-kit generate:
--   * the keyPrefix → keyPattern rewrite (Harry Q2: a prefix P is the glob `P*`), BEFORE the
--     match_field CHECK, which would refuse the old value;
--   * the duplicate-priority preflight: live rules are renumbered 1..n per Project (old priority,
--     then id) BEFORE the partial unique index, which would refuse an existing duplicate. Before
--     5.10 a priority tie was broken by load (heap) order under a stable sort on priority alone,
--     which no query pinned; (priority, id) is the deterministic order 5.10's `evaluateRules`
--     uses, so a tied pair may evaluate in a different order than it did before.
ALTER TABLE "mapping_rule" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
UPDATE "mapping_rule" SET "match_field" = 'keyPattern', "match_value" = "match_value" || '*' WHERE "match_field" = 'keyPrefix';--> statement-breakpoint
UPDATE "mapping_rule" AS r SET "priority" = n."rn"
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "tenant_id", "project_id" ORDER BY "priority", "id") AS "rn"
  FROM "mapping_rule"
  WHERE "deleted_at" IS NULL
) AS n
WHERE r."id" = n."id" AND r."priority" <> n."rn";--> statement-breakpoint
CREATE UNIQUE INDEX "mapping_rule_live_priority_key" ON "mapping_rule" USING btree ("tenant_id","project_id","priority") WHERE "mapping_rule"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "mapping_rule" ADD CONSTRAINT "mapping_rule_match_field_check" CHECK ("mapping_rule"."match_field" IN ('milestone', 'category', 'issueType', 'parent', 'keyPattern'));
