ALTER TABLE "enriched_leads" ADD COLUMN "primary_city" text;--> statement-breakpoint
ALTER TABLE "enriched_leads" ADD COLUMN "has_web_chat" boolean;--> statement-breakpoint
ALTER TABLE "enriched_leads" ADD COLUMN "has_online_booking" boolean;--> statement-breakpoint
ALTER TABLE "enriched_leads" ADD COLUMN "years_in_business" integer;--> statement-breakpoint
ALTER TABLE "enriched_leads" ADD COLUMN "pain_point_angle" text;--> statement-breakpoint
ALTER TABLE "enriched_leads" ADD COLUMN "generated_icebreaker" text;