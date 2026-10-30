DROP INDEX "customers_phoneNormalized_idx";--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "contact_person";--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "phone_raw";--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "phone_normalized";--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "email";