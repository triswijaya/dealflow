CREATE TABLE "document_counters" (
	"organization_id" text NOT NULL,
	"document_type" text NOT NULL,
	"year" integer NOT NULL,
	"next_sequence" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "document_counters_organization_id_document_type_year_pk" PRIMARY KEY("organization_id","document_type","year")
);
--> statement-breakpoint
CREATE TABLE "quotation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"quotation_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit" text NOT NULL,
	"unit_price" bigint NOT NULL,
	"subtotal" bigint NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"deal_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"quotation_number" text NOT NULL,
	"family_id" uuid NOT NULL,
	"revision_number" integer DEFAULT 1 NOT NULL,
	"previous_revision_id" uuid,
	"is_latest" boolean DEFAULT true NOT NULL,
	"issue_date" date NOT NULL,
	"valid_until" date NOT NULL,
	"subtotal" bigint NOT NULL,
	"discount" bigint DEFAULT 0 NOT NULL,
	"tax" bigint DEFAULT 0 NOT NULL,
	"total" bigint NOT NULL,
	"calculation_version" integer NOT NULL,
	"notes" text,
	"terms" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"sent_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"frozen_at" timestamp with time zone,
	"seller_snapshot" jsonb,
	"customer_snapshot" jsonb,
	"edit_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" text NOT NULL,
	"updated_by_id" text
);
--> statement-breakpoint
-- Moved ahead of the FK constraints below (drizzle-kit generated it last,
-- but quotation_items_quotation_tenant_fk and
-- quotations_previous_revision_tenant_fk both reference
-- quotations(organization_id, id), which requires this exact-match unique
-- constraint to exist first; same reordering M1 needed for
-- deals_organizationId_id_uidx ahead of activities' FK.
CREATE UNIQUE INDEX "quotations_organizationId_id_uidx" ON "quotations" USING btree ("organization_id","id");--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "has_quotation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "document_counters" ADD CONSTRAINT "document_counters_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotation_tenant_fk" FOREIGN KEY ("organization_id","quotation_id") REFERENCES "public"."quotations"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_deal_tenant_fk" FOREIGN KEY ("organization_id","deal_id") REFERENCES "public"."deals"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customer_tenant_fk" FOREIGN KEY ("organization_id","customer_id") REFERENCES "public"."customers"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_previous_revision_tenant_fk" FOREIGN KEY ("organization_id","previous_revision_id") REFERENCES "public"."quotations"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quotation_items_organizationId_quotationId_idx" ON "quotation_items" USING btree ("organization_id","quotation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotation_items_quotationId_sortOrder_uidx" ON "quotation_items" USING btree ("quotation_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_organizationId_number_uidx" ON "quotations" USING btree ("organization_id","quotation_number");--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_organizationId_familyId_revisionNumber_uidx" ON "quotations" USING btree ("organization_id","family_id","revision_number");--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_familyId_latest_uidx" ON "quotations" USING btree ("family_id") WHERE "quotations"."is_latest" = true;--> statement-breakpoint
CREATE INDEX "quotations_organizationId_dealId_idx" ON "quotations" USING btree ("organization_id","deal_id");