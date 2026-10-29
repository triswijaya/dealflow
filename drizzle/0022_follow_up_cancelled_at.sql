DROP INDEX "follow_ups_organizationId_followUpAt_idx";--> statement-breakpoint
ALTER TABLE "follow_ups" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
-- FUP-04: tasks still open on a closed deal are cancelled, at the moment the deal closed.
UPDATE "follow_ups" SET "cancelled_at" = COALESCE("deals"."won_at", "deals"."lost_at", now())
  FROM "deals"
  WHERE "follow_ups"."deal_id" = "deals"."id" AND "follow_ups"."organization_id" = "deals"."organization_id"
    AND "deals"."status" IN ('WON', 'LOST') AND "follow_ups"."completed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "follow_ups_organizationId_followUpAt_idx" ON "follow_ups" USING btree ("organization_id","follow_up_at") WHERE "follow_ups"."completed_at" IS NULL AND "follow_ups"."cancelled_at" IS NULL;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_not_done_and_cancelled_chk" CHECK ("follow_ups"."completed_at" IS NULL OR "follow_ups"."cancelled_at" IS NULL);