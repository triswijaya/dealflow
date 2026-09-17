CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"company_name" text NOT NULL,
	"contact_person" text NOT NULL,
	"phone_raw" text NOT NULL,
	"phone_normalized" text NOT NULL,
	"email" text,
	"address" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by_id" text NOT NULL,
	"updated_by_id" text
);
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_organizationId_id_uidx" ON "customers" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "customers_organizationId_idx" ON "customers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "customers_companyName_idx" ON "customers" USING btree ("company_name");--> statement-breakpoint
CREATE INDEX "customers_phoneNormalized_idx" ON "customers" USING btree ("phone_normalized");