ALTER TABLE "enriched_leads" DROP COLUMN "company_summary";--> statement-breakpoint
ALTER TABLE "enriched_leads" DROP COLUMN "value_proposition";--> statement-breakpoint
ALTER TABLE "enriched_leads" DROP COLUMN "business_type";--> statement-breakpoint
ALTER TABLE "enriched_leads" DROP COLUMN "target_audience";--> statement-breakpoint
ALTER TABLE "enriched_leads" DROP COLUMN "primary_cta";--> statement-breakpoint
ALTER TABLE "enriched_leads" DROP COLUMN "contacts_json";--> statement-breakpoint
ALTER TABLE "enriched_leads" DROP COLUMN "social_links_json";--> statement-breakpoint
ALTER TABLE "enriched_leads" DROP COLUMN "booking_links_json";--> statement-breakpoint
ALTER TABLE "enriched_leads" DROP COLUMN "hiring_signals_json";--> statement-breakpoint
ALTER TABLE "enriched_leads" DROP COLUMN "recent_news_json";--> statement-breakpoint
ALTER TABLE "enriched_leads" ADD COLUMN "company_name" text;--> statement-breakpoint
ALTER TABLE "enriched_leads" ADD COLUMN "service_areas_json" text;--> statement-breakpoint
ALTER TABLE "enriched_leads" ADD COLUMN "services_offered_json" text;--> statement-breakpoint
ALTER TABLE "enriched_leads" ADD COLUMN "emergency_services" boolean;--> statement-breakpoint
ALTER TABLE "enriched_leads" ADD COLUMN "free_estimate_offered" boolean;--> statement-breakpoint
ALTER TABLE "enriched_leads" ADD COLUMN "current_lead_capture" text;--> statement-breakpoint
ALTER TABLE "enriched_leads" ADD COLUMN "financing_offered" boolean;--> statement-breakpoint
ALTER TABLE "enriched_leads" ADD COLUMN "trust_signals_json" text;--> statement-breakpoint
ALTER TABLE "enriched_leads" ADD COLUMN "marketing_gaps_json" text;--> statement-breakpoint
ALTER TABLE "enriched_leads" ADD COLUMN "storm_mentions_json" text;--> statement-breakpoint
ALTER TABLE "enriched_leads" ADD COLUMN "owner_or_leaders_json" text;
