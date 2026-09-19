ALTER TABLE "quotations" ADD COLUMN "accepted_by_id" text;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "rejected_by_id" text;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_accepted_by_id_user_id_fk" FOREIGN KEY ("accepted_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_rejected_by_id_user_id_fk" FOREIGN KEY ("rejected_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;