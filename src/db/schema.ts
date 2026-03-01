import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
  companySummary: text("company_summary"),
  valueProposition: text("value_proposition"),
  businessType: text("business_type"),
  targetAudience: text("target_audience"),
  primaryCta: text("primary_cta"),
  contactsJson: text("contacts_json"),
  socialLinksJson: text("social_links_json"),
  bookingLinksJson: text("booking_links_json"),
  hiringSignalsJson: text("hiring_signals_json"),
  recentNewsJson: text("recent_news_json"),
  processedAt: timestamp("processed_at").defaultNow().notNull(),
});
