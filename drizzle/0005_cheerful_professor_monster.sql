ALTER TABLE "enriched_leads" ADD COLUMN "bilingual_support_mentioned" boolean;--> statement-breakpoint
ALTER TABLE "enriched_leads" ADD COLUMN "response_time_promise" text;--> statement-breakpoint
ALTER TABLE "enriched_leads" ADD COLUMN "is_hiring" boolean;--> statement-breakpoint
ALTER TABLE "enriched_leads" ADD COLUMN "target_market" text;--> statement-breakpoint
ALTER TABLE "enriched_leads" ADD COLUMN "manufacturer_certifications_json" text;--> statement-breakpoint
ALTER TABLE "enriched_leads" ADD COLUMN "high_ticket_materials_json" text;--> statement-breakpoint
ALTER TABLE "enriched_leads" ADD COLUMN "has_project_gallery" boolean;--> statement-breakpoint
ALTER TABLE "enriched_leads" ADD COLUMN "website_outdated_signals" text;