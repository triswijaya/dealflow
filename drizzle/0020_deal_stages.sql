ALTER TABLE "deals" ALTER COLUMN "status" SET DEFAULT 'PROSPECT';--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "stage_entered_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- DEAL-03/ADR-0001: NEW, CONTACTED and QUALIFIED become PROSPECT, QUOTATION becomes PROPOSAL.
-- Activity rows keep the old stage names: they describe what happened then.
UPDATE "deals" SET "status" = 'PROSPECT' WHERE "status" IN ('NEW', 'CONTACTED', 'QUALIFIED');--> statement-breakpoint
UPDATE "deals" SET "status" = 'PROPOSAL' WHERE "status" = 'QUOTATION';--> statement-breakpoint
-- §7.3 "Data wajib": a stage after PROSPECT needs a positive value, so an open deal without one goes back to PROSPECT.
UPDATE "deals" SET "status" = 'PROSPECT' WHERE "status" IN ('PROPOSAL', 'NEGOTIATION', 'COMMITMENT') AND "estimated_value" <= 0;--> statement-breakpoint
-- The age of the current stage: the last status event of the deal, else its creation.
UPDATE "deals" SET "stage_entered_at" = COALESCE(
  (SELECT max("a"."created_at") FROM "activities" "a"
    WHERE "a"."deal_id" = "deals"."id" AND "a"."entity_type" = 'deal' AND "a"."event_type" IN ('stage_changed', 'won', 'lost')),
  "deals"."created_at"
);--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_status_chk" CHECK ("deals"."status" IN ('PROSPECT', 'PROPOSAL', 'NEGOTIATION', 'COMMITMENT', 'WON', 'LOST'));--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_lostReason_chk" CHECK ("deals"."lost_reason" IS NULL OR "deals"."lost_reason" IN ('PRICE_TOO_HIGH', 'LOST_TO_COMPETITOR', 'BUDGET_UNAVAILABLE', 'NO_NEED', 'NO_RESPONSE', 'PROJECT_CANCELLED', 'OTHER'));--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_stageValue_chk" CHECK ("deals"."status" NOT IN ('PROPOSAL', 'NEGOTIATION', 'COMMITMENT') OR "deals"."estimated_value" > 0);