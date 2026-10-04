-- Story 5.3 — Backlog Get Rate Limit Search-bucket limit stored at Connector set-up.
-- Nullable: fixture Connectors (and rows set up before 5.3) have no live limit.
ALTER TABLE "connector" ADD COLUMN "search_limit" integer;
