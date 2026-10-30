ALTER TABLE "deals" ADD COLUMN "contact_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_organizationId_customerId_id_uidx" ON "contacts" USING btree ("organization_id","customer_id","id");--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_contact_customer_fk" FOREIGN KEY ("organization_id","customer_id","contact_id") REFERENCES "public"."contacts"("organization_id","customer_id","id") ON DELETE restrict ON UPDATE no action;
