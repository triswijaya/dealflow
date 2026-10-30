ALTER TABLE "follow_ups" ALTER COLUMN "deal_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD COLUMN "invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_invoice_tenant_fk" FOREIGN KEY ("organization_id","invoice_id") REFERENCES "public"."invoices"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "follow_ups_organizationId_invoiceId_idx" ON "follow_ups" USING btree ("organization_id","invoice_id");--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_one_subject_chk" CHECK (("follow_ups"."deal_id" IS NULL) <> ("follow_ups"."invoice_id" IS NULL));--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_promise_invoice_chk" CHECK ("follow_ups"."type" <> 'PROMISE_TO_PAY' OR "follow_ups"."invoice_id" IS NOT NULL);