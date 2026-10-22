-- Invoices are now presented as customer Orders: number them ORD/<fy>/<n> instead of INV/<fy>/<n>.
UPDATE "invoices" SET "invoice_no" = 'ORD/' || substring("invoice_no" from 5) WHERE "invoice_no" LIKE 'INV/%';--> statement-breakpoint
INSERT INTO "doc_counters" ("prefix", "fy", "last_value")
  SELECT 'ORD', "fy", "last_value" FROM "doc_counters" WHERE "prefix" = 'INV'
  ON CONFLICT ("prefix", "fy") DO UPDATE SET "last_value" = GREATEST("doc_counters"."last_value", EXCLUDED."last_value");--> statement-breakpoint
DELETE FROM "doc_counters" WHERE "prefix" = 'INV';
