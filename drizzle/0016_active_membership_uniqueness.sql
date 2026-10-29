DROP INDEX "member_userId_uidx";--> statement-breakpoint
CREATE UNIQUE INDEX "member_userId_active_uidx" ON "member" USING btree ("user_id") WHERE "member"."deactivated_at" IS NULL;