CREATE TABLE "billing_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"order_id" uuid NOT NULL,
	"label" text NOT NULL,
	"amount" bigint NOT NULL,
	"trigger" text NOT NULL,
	"due_on" date,
	"is_retention" boolean DEFAULT false NOT NULL,
	"milestone_done_at" timestamp with time zone,
	"milestone_ref" text,
	"cancelled_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" text NOT NULL,
	CONSTRAINT "billing_items_trigger_chk" CHECK ("billing_items"."trigger" IN ('ON_ORDER', 'ON_DATE', 'ON_MILESTONE')),
	CONSTRAINT "billing_items_dueOn_chk" CHECK (("billing_items"."trigger" = 'ON_DATE') = ("billing_items"."due_on" IS NOT NULL)),
	CONSTRAINT "billing_items_amount_range_chk" CHECK ("billing_items"."amount" > 0 AND "billing_items"."amount" <= 1000000000000000)
);
--> statement-breakpoint
CREATE TABLE "order_amendments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"order_id" uuid NOT NULL,
	"delta" bigint NOT NULL,
	"reason" text NOT NULL,
	"reference" text,
	"effective_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" text NOT NULL,
	CONSTRAINT "order_amendments_delta_chk" CHECK ("order_amendments"."delta" <> 0 AND abs("order_amendments"."delta") <= 1000000000000000)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"deal_id" uuid,
	"contact_id" uuid,
	"order_number" text NOT NULL,
	"title" text NOT NULL,
	"scope" text,
	"commitment_type" text NOT NULL,
	"commitment_ref" text,
	"commitment_date" date NOT NULL,
	"original_value" bigint NOT NULL,
	"source_quotation_id" uuid,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" text NOT NULL,
	CONSTRAINT "orders_commitmentType_chk" CHECK ("orders"."commitment_type" IN ('PURCHASE_ORDER', 'CONTRACT', 'WRITTEN_CONFIRMATION', 'PAYMENT', 'LEGACY')),
	CONSTRAINT "orders_originalValue_range_chk" CHECK ("orders"."original_value" > 0 AND "orders"."original_value" <= 1000000000000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "orders_organizationId_id_uidx" ON "orders" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_items_organizationId_id_uidx" ON "billing_items" USING btree ("organization_id","id");--> statement-breakpoint
DROP INDEX "invoices_organizationId_dealId_uidx";--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "deal_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "deal_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "order_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "order_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "billing_item_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "voided_by_id" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "replaces_invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "billing_items" ADD CONSTRAINT "billing_items_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_items" ADD CONSTRAINT "billing_items_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_items" ADD CONSTRAINT "billing_items_order_tenant_fk" FOREIGN KEY ("organization_id","order_id") REFERENCES "public"."orders"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_amendments" ADD CONSTRAINT "order_amendments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_amendments" ADD CONSTRAINT "order_amendments_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_amendments" ADD CONSTRAINT "order_amendments_order_tenant_fk" FOREIGN KEY ("organization_id","order_id") REFERENCES "public"."orders"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_tenant_fk" FOREIGN KEY ("organization_id","customer_id") REFERENCES "public"."customers"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_deal_tenant_fk" FOREIGN KEY ("organization_id","deal_id") REFERENCES "public"."deals"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_contact_customer_fk" FOREIGN KEY ("organization_id","customer_id","contact_id") REFERENCES "public"."contacts"("organization_id","customer_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_quotation_tenant_fk" FOREIGN KEY ("organization_id","source_quotation_id") REFERENCES "public"."quotations"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_items_organizationId_orderId_idx" ON "billing_items" USING btree ("organization_id","order_id");--> statement-breakpoint
CREATE INDEX "order_amendments_organizationId_orderId_idx" ON "order_amendments" USING btree ("organization_id","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_organizationId_number_uidx" ON "orders" USING btree ("organization_id","order_number");--> statement-breakpoint
CREATE INDEX "orders_organizationId_dealId_idx" ON "orders" USING btree ("organization_id","deal_id");--> statement-breakpoint
CREATE INDEX "orders_organizationId_customerId_idx" ON "orders" USING btree ("organization_id","customer_id");--> statement-breakpoint
CREATE INDEX "orders_organizationId_commitmentDate_idx" ON "orders" USING btree ("organization_id","commitment_date");--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_order_tenant_fk" FOREIGN KEY ("organization_id","order_id") REFERENCES "public"."orders"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_voided_by_id_user_id_fk" FOREIGN KEY ("voided_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_tenant_fk" FOREIGN KEY ("organization_id","order_id") REFERENCES "public"."orders"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billing_item_tenant_fk" FOREIGN KEY ("organization_id","billing_item_id") REFERENCES "public"."billing_items"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_replaces_tenant_fk" FOREIGN KEY ("organization_id","replaces_invoice_id") REFERENCES "public"."invoices"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_organizationId_orderId_createdAt_idx" ON "activities" USING btree ("organization_id","order_id","created_at");--> statement-breakpoint
-- ADR-0002 / migration of existing data: every WON deal becomes one LEGACY order with one ON_ORDER billing item,
-- and its invoice is linked to that item. When the invoice total differs from the won value, the billing item follows
-- the invoice and the difference is recorded as a LEGACY amendment. Nothing is guessed.
CREATE TEMP TABLE "_legacy_orders" AS
SELECT
  gen_random_uuid() AS "order_id",
  gen_random_uuid() AS "item_id",
  d."id" AS "deal_id",
  d."organization_id",
  d."customer_id",
  d."title",
  d."won_at",
  d."created_by_id",
  CASE WHEN d."won_value" > 0 THEN d."won_value" ELSE COALESCE(inv."total", 1) END AS "base_value",
  inv."total" AS "invoice_total",
  (d."won_at" AT TIME ZONE COALESCE(s."timezone", 'Asia/Jakarta'))::date AS "commitment_date",
  EXTRACT(YEAR FROM (d."won_at" AT TIME ZONE COALESCE(s."timezone", 'Asia/Jakarta')))::int AS "year",
  row_number() OVER (
    PARTITION BY d."organization_id", EXTRACT(YEAR FROM (d."won_at" AT TIME ZONE COALESCE(s."timezone", 'Asia/Jakarta')))
    ORDER BY d."won_at", d."id"
  ) AS "seq"
FROM "deals" d
LEFT JOIN "organization_settings" s ON s."organization_id" = d."organization_id"
LEFT JOIN "invoices" inv ON inv."deal_id" = d."id" AND inv."organization_id" = d."organization_id"
WHERE d."status" = 'WON' AND d."won_at" IS NOT NULL;--> statement-breakpoint
INSERT INTO "orders" ("id", "organization_id", "customer_id", "deal_id", "order_number", "title", "commitment_type", "commitment_date", "original_value", "created_at", "created_by_id")
SELECT "order_id", "organization_id", "customer_id", "deal_id", 'SO-' || "year" || '-' || lpad("seq"::text, 5, '0'), "title", 'LEGACY', "commitment_date", "base_value", "won_at", "created_by_id"
FROM "_legacy_orders";--> statement-breakpoint
INSERT INTO "order_amendments" ("organization_id", "order_id", "delta", "reason", "effective_date", "created_at", "created_by_id")
SELECT "organization_id", "order_id", "invoice_total" - "base_value", 'LEGACY', "commitment_date", "won_at", "created_by_id"
FROM "_legacy_orders" WHERE "invoice_total" IS NOT NULL AND "invoice_total" <> "base_value";--> statement-breakpoint
INSERT INTO "billing_items" ("id", "organization_id", "order_id", "label", "amount", "trigger", "created_at", "created_by_id")
SELECT "item_id", "organization_id", "order_id", 'Tagihan 100%', COALESCE("invoice_total", "base_value"), 'ON_ORDER', "won_at", "created_by_id"
FROM "_legacy_orders";--> statement-breakpoint
INSERT INTO "document_counters" ("organization_id", "document_type", "year", "next_sequence")
SELECT "organization_id", 'SO', "year", max("seq") + 1 FROM "_legacy_orders" GROUP BY "organization_id", "year";--> statement-breakpoint
UPDATE "invoices" SET "order_id" = l."order_id", "billing_item_id" = l."item_id"
FROM "_legacy_orders" l WHERE "invoices"."deal_id" = l."deal_id" AND "invoices"."organization_id" = l."organization_id";--> statement-breakpoint
DROP TABLE "_legacy_orders";--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "order_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "billing_item_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_billingItemId_live_uidx" ON "invoices" USING btree ("billing_item_id") WHERE "invoices"."voided_at" IS NULL;--> statement-breakpoint
CREATE INDEX "invoices_organizationId_orderId_idx" ON "invoices" USING btree ("organization_id","order_id");--> statement-breakpoint
CREATE INDEX "invoices_organizationId_dealId_idx" ON "invoices" USING btree ("organization_id","deal_id");--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_subject_chk" CHECK ("activities"."deal_id" IS NOT NULL OR "activities"."order_id" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_void_pair_chk" CHECK (("invoices"."voided_at" IS NULL) = ("invoices"."void_reason" IS NULL));