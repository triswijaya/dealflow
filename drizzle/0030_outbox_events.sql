CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" text,
	CONSTRAINT "outbox_events_status_chk" CHECK ("outbox_events"."status" IN ('PENDING', 'SENT', 'FAILED', 'DEAD'))
);
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_organizationId_dedupeKey_uidx" ON "outbox_events" USING btree ("organization_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "outbox_events_due_idx" ON "outbox_events" USING btree ("next_attempt_at") WHERE "outbox_events"."status" IN ('PENDING', 'FAILED');--> statement-breakpoint
CREATE INDEX "outbox_events_organizationId_status_idx" ON "outbox_events" USING btree ("organization_id","status");