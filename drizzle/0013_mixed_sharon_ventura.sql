CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"invoice_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit" text NOT NULL,
	"unit_price" bigint NOT NULL,
	"subtotal" bigint NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "invoice_items_quantity_range_chk" CHECK ("invoice_items"."quantity" > 0 AND "invoice_items"."quantity" <= 1000000.000),
	CONSTRAINT "invoice_items_unitPrice_range_chk" CHECK ("invoice_items"."unit_price" >= 0 AND "invoice_items"."unit_price" <= 1000000000000000),
	CONSTRAINT "invoice_items_subtotal_range_chk" CHECK ("invoice_items"."subtotal" >= 0 AND "invoice_items"."subtotal" <= 1000000000000000)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"deal_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"invoice_number" text NOT NULL,
	"quotation_id" uuid,
	"issue_date" date NOT NULL,
	"due_date" date NOT NULL,
	"subtotal" bigint NOT NULL,
	"discount" bigint DEFAULT 0 NOT NULL,
	"tax" bigint DEFAULT 0 NOT NULL,
	"total" bigint NOT NULL,
	"calculation_version" integer NOT NULL,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"notes" text,
	"terms" text,
	"seller_snapshot" jsonb,
	"customer_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" text NOT NULL,
	CONSTRAINT "invoices_dueDate_after_issueDate_chk" CHECK ("invoices"."due_date" >= "invoices"."issue_date"),
	CONSTRAINT "invoices_subtotal_range_chk" CHECK ("invoices"."subtotal" >= 0 AND "invoices"."subtotal" <= 1000000000000000),
	CONSTRAINT "invoices_discount_range_chk" CHECK ("invoices"."discount" >= 0 AND "invoices"."discount" <= "invoices"."subtotal"),
	CONSTRAINT "invoices_tax_nonneg_chk" CHECK ("invoices"."tax" >= 0),
	CONSTRAINT "invoices_total_range_chk" CHECK ("invoices"."total" > 0 AND "invoices"."total" <= 1000000000000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_organizationId_id_uidx" ON "invoices" USING btree ("organization_id","id");--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_tenant_fk" FOREIGN KEY ("organization_id","invoice_id") REFERENCES "public"."invoices"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_deal_tenant_fk" FOREIGN KEY ("organization_id","deal_id") REFERENCES "public"."deals"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_tenant_fk" FOREIGN KEY ("organization_id","customer_id") REFERENCES "public"."customers"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_quotation_tenant_fk" FOREIGN KEY ("organization_id","quotation_id") REFERENCES "public"."quotations"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_items_organizationId_invoiceId_idx" ON "invoice_items" USING btree ("organization_id","invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_items_invoiceId_sortOrder_uidx" ON "invoice_items" USING btree ("invoice_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_organizationId_dealId_uidx" ON "invoices" USING btree ("organization_id","deal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_organizationId_number_uidx" ON "invoices" USING btree ("organization_id","invoice_number");--> statement-breakpoint
CREATE INDEX "invoices_organizationId_customerId_idx" ON "invoices" USING btree ("organization_id","customer_id");--> statement-breakpoint
CREATE INDEX "invoices_organizationId_dueDate_idx" ON "invoices" USING btree ("organization_id","due_date");
