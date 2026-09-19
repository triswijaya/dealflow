CREATE TABLE "idempotency_records" (
	"organization_id" text NOT NULL,
	"operation_type" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload_fingerprint" text NOT NULL,
	"result_entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_records_pk" PRIMARY KEY("organization_id","operation_type","idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;