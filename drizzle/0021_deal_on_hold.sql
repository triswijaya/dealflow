ALTER TABLE "deals" ADD COLUMN "on_hold_until" date;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "on_hold_reason" text;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_onHold_pair_chk" CHECK (("deals"."on_hold_until" IS NULL) = ("deals"."on_hold_reason" IS NULL));--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_onHold_open_chk" CHECK ("deals"."on_hold_until" IS NULL OR "deals"."status" NOT IN ('WON', 'LOST'));