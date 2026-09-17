CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"notes" text,
	"estimated_value" bigint NOT NULL,
	"status" text DEFAULT 'NEW' NOT NULL,
	"assigned_to_id" text NOT NULL,
	"expected_close_date" date,
	"lost_reason" text,
	"lost_note" text,
	"won_at" timestamp,
	"won_value" bigint,
	"lost_at" timestamp,
	"last_activity_at" timestamp DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by_id" text NOT NULL,
	"updated_by_id" text
);
--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_assigned_to_id_user_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_customer_tenant_fk" FOREIGN KEY ("organization_id","customer_id") REFERENCES "public"."customers"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deals_organizationId_status_idx" ON "deals" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "deals_organizationId_assignedToId_idx" ON "deals" USING btree ("organization_id","assigned_to_id");--> statement-breakpoint
CREATE INDEX "deals_organizationId_customerId_idx" ON "deals" USING btree ("organization_id","customer_id");--> statement-breakpoint
CREATE INDEX "deals_organizationId_createdAt_idx" ON "deals" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "deals_organizationId_wonAt_idx" ON "deals" USING btree ("organization_id","won_at");