CREATE TABLE "synced_leads" (
	"email" text PRIMARY KEY NOT NULL,
	"instantly_id" text,
	"zoho_id" text,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
