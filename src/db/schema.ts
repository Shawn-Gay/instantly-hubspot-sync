import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const syncedLeads = pgTable("synced_leads", {
  email: text("email").primaryKey(),
  instantlyId: text("instantly_id"),
  zohoId: text("zoho_id"),
  website: text("website"),
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
});

export const rawScrapedWebsites = pgTable("raw_scraped_websites", {
  email: text("email").primaryKey().references(() => syncedLeads.email),
  markdownContent: text("markdown_content"),
  status: text("status").notNull().default("pending"), // pending | done | failed
  error: text("error"),
  scrapedAt: timestamp("scraped_at").defaultNow().notNull(),
});

export const enrichedLeads = pgTable("enriched_leads", {
  email: text("email").primaryKey().references(() => syncedLeads.email),
  // ── Company Profile ──
  companyName: text("company_name"),
  serviceAreasJson: text("service_areas_json"),
  servicesOfferedJson: text("services_offered_json"),
  // ── AI Receptionist Selling Angles ──
  emergencyServices: boolean("emergency_services"),
  freeEstimateOffered: boolean("free_estimate_offered"),
  currentLeadCapture: text("current_lead_capture"),
  // ── Premium Marketing Selling Angles ──
  financingOffered: boolean("financing_offered"),
  trustSignalsJson: text("trust_signals_json"),
  marketingGapsJson: text("marketing_gaps_json"),
  // ── News & Triggers ──
  stormMentionsJson: text("storm_mentions_json"),
  // ── Contact Data ──
  ownerOrLeadersJson: text("owner_or_leaders_json"),
  // ── Advanced AI Receptionist Angles ──
  bilingualSupportMentioned: boolean("bilingual_support_mentioned"),
  responseTimePromise: text("response_time_promise"),
  isHiring: boolean("is_hiring"),
  // ── Advanced Premium Marketing Angles ──
  targetMarket: text("target_market"),
  manufacturerCertificationsJson: text("manufacturer_certifications_json"),
  highTicketMaterialsJson: text("high_ticket_materials_json"),
  hasProjectGallery: boolean("has_project_gallery"),
  websiteOutdatedSignals: text("website_outdated_signals"),
  processedAt: timestamp("processed_at").defaultNow().notNull(),
});
