CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"customer_id" uuid,
	"amount" bigint NOT NULL,
	"received_on" date NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"note" text,
	"identified_at" timestamp with time zone,
	"identified_by_id" text,
	"identification_note" text,
	"reversed_at" timestamp with time zone,
	"reversed_by_id" text,
	"reversal_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" text NOT NULL,
	CONSTRAINT "receipts_amount_range_chk" CHECK ("receipts"."amount" > 0 AND "receipts"."amount" <= 1000000000000000),
	CONSTRAINT "receipts_method_chk" CHECK ("receipts"."method" IN ('BANK_TRANSFER', 'CASH', 'OTHER')),
	CONSTRAINT "receipts_reversal_chk" CHECK (("receipts"."reversed_at" IS NULL) = ("receipts"."reversed_by_id" IS NULL) AND ("receipts"."reversed_at" IS NULL) = ("receipts"."reversal_reason" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"receipt_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"refunded_on" date NOT NULL,
	"reference" text,
	"note" text,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" text NOT NULL,
	CONSTRAINT "refunds_amount_range_chk" CHECK ("refunds"."amount" > 0 AND "refunds"."amount" <= 1000000000000000)
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"invoice_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"receipt_id" uuid,
	"amount" bigint NOT NULL,
	"settled_on" date NOT NULL,
	"reference" text,
	"note" text,
	"reversed_at" timestamp with time zone,
	"reversed_by_id" text,
	"reversal_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" text NOT NULL,
	CONSTRAINT "settlements_amount_range_chk" CHECK ("settlements"."amount" > 0 AND "settlements"."amount" <= 1000000000000000),
	CONSTRAINT "settlements_kind_chk" CHECK ("settlements"."kind" IN ('RECEIPT', 'WITHHOLDING', 'WRITE_OFF')),
	CONSTRAINT "settlements_receipt_chk" CHECK (("settlements"."kind" = 'RECEIPT') = ("settlements"."receipt_id" IS NOT NULL)),
	CONSTRAINT "settlements_withholding_ref_chk" CHECK ("settlements"."kind" <> 'WITHHOLDING' OR "settlements"."reference" IS NOT NULL),
	CONSTRAINT "settlements_writeoff_note_chk" CHECK ("settlements"."kind" <> 'WRITE_OFF' OR "settlements"."note" IS NOT NULL),
	CONSTRAINT "settlements_reversal_chk" CHECK (("settlements"."reversed_at" IS NULL) = ("settlements"."reversed_by_id" IS NULL) AND ("settlements"."reversed_at" IS NULL) = ("settlements"."reversal_reason" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_organizationId_id_uidx" ON "receipts" USING btree ("organization_id","id");--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN "write_off_limit" bigint DEFAULT 50000 NOT NULL;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_identified_by_id_user_id_fk" FOREIGN KEY ("identified_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_reversed_by_id_user_id_fk" FOREIGN KEY ("reversed_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_customer_tenant_fk" FOREIGN KEY ("organization_id","customer_id") REFERENCES "public"."customers"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_receipt_tenant_fk" FOREIGN KEY ("organization_id","receipt_id") REFERENCES "public"."receipts"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_reversed_by_id_user_id_fk" FOREIGN KEY ("reversed_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_invoice_tenant_fk" FOREIGN KEY ("organization_id","invoice_id") REFERENCES "public"."invoices"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_receipt_tenant_fk" FOREIGN KEY ("organization_id","receipt_id") REFERENCES "public"."receipts"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receipts_organizationId_customerId_idx" ON "receipts" USING btree ("organization_id","customer_id");--> statement-breakpoint
CREATE INDEX "receipts_organizationId_receivedOn_idx" ON "receipts" USING btree ("organization_id","received_on");--> statement-breakpoint
CREATE INDEX "refunds_organizationId_receiptId_idx" ON "refunds" USING btree ("organization_id","receipt_id");--> statement-breakpoint
CREATE INDEX "settlements_organizationId_invoiceId_idx" ON "settlements" USING btree ("organization_id","invoice_id");--> statement-breakpoint
CREATE INDEX "settlements_organizationId_receiptId_idx" ON "settlements" USING btree ("organization_id","receipt_id");
--> statement-breakpoint
-- ADR-0003 / migration of existing data: every payment becomes one receipt (same id, date, method and author, the
-- invoice's customer) and one RECEIPT settlement on its invoice. Nothing is lost: the sum of settlements per invoice
-- equals the sum of its payments, so the receivable does not move.
INSERT INTO "receipts" ("id", "organization_id", "customer_id", "amount", "received_on", "method", "reference", "note", "created_at", "created_by_id")
SELECT p."id", p."organization_id", i."customer_id", p."amount", p."payment_date", p."payment_method", p."reference", p."note", p."created_at", p."created_by_id"
FROM "payments" p JOIN "invoices" i ON i."id" = p."invoice_id" AND i."organization_id" = p."organization_id";--> statement-breakpoint
INSERT INTO "settlements" ("organization_id", "invoice_id", "kind", "receipt_id", "amount", "settled_on", "created_at", "created_by_id")
SELECT p."organization_id", p."invoice_id", 'RECEIPT', p."id", p."amount", p."payment_date", p."created_at", p."created_by_id"
FROM "payments" p;
