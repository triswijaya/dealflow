CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"phone_raw" text,
	"phone_normalized" text,
	"email" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" text NOT NULL,
	"updated_by_id" text,
	CONSTRAINT "contacts_phone_or_email_chk" CHECK ("contacts"."phone_normalized" IS NOT NULL OR "contacts"."email" IS NOT NULL),
	CONSTRAINT "contacts_phone_pair_chk" CHECK (("contacts"."phone_raw" IS NULL) = ("contacts"."phone_normalized" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "tax_id" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_customer_tenant_fk" FOREIGN KEY ("organization_id","customer_id") REFERENCES "public"."customers"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_organizationId_id_uidx" ON "contacts" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_customerId_primary_uidx" ON "contacts" USING btree ("customer_id") WHERE "contacts"."is_primary";--> statement-breakpoint
CREATE INDEX "contacts_organizationId_customerId_idx" ON "contacts" USING btree ("organization_id","customer_id");--> statement-breakpoint
CREATE INDEX "contacts_organizationId_phoneNormalized_idx" ON "contacts" USING btree ("organization_id","phone_normalized");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_taxId_format_chk" CHECK ("customers"."tax_id" IS NULL OR "customers"."tax_id" ~ '^[0-9]{15,16}$');--> statement-breakpoint
-- CUS-04: the contact details a customer already has become its primary contact, with the customer's own creation data.
INSERT INTO "contacts" ("organization_id", "customer_id", "name", "phone_raw", "phone_normalized", "email", "is_primary", "created_at", "updated_at", "created_by_id", "updated_by_id")
SELECT "organization_id", "id", "contact_person", "phone_raw", "phone_normalized", "email", true, "created_at", "updated_at", "created_by_id", "updated_by_id"
FROM "customers";
