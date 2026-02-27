CREATE TABLE "cold_queue" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cold_queue_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"lead_email" text NOT NULL,
	"campaign_id" text,
	"campaign_name" text,
	"payload" jsonb NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_contact_map" ADD COLUMN "tier" text DEFAULT 'cold' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_cold_queue_email" ON "cold_queue" USING btree ("lead_email");