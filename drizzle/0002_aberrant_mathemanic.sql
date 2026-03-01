CREATE TABLE "enriched_leads" (
	"email" text PRIMARY KEY NOT NULL,
	"company_summary" text,
	"target_audience" text,
	"contacts_json" text,
	"recent_news_json" text,
	"processed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_scraped_websites" (
	"email" text PRIMARY KEY NOT NULL,
	"markdown_content" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"scraped_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "enriched_leads" ADD CONSTRAINT "enriched_leads_email_synced_leads_email_fk" FOREIGN KEY ("email") REFERENCES "public"."synced_leads"("email") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_scraped_websites" ADD CONSTRAINT "raw_scraped_websites_email_synced_leads_email_fk" FOREIGN KEY ("email") REFERENCES "public"."synced_leads"("email") ON DELETE no action ON UPDATE no action;