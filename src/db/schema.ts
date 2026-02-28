import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const syncedLeads = pgTable("synced_leads", {
  email: text("email").primaryKey(),
  instantlyId: text("instantly_id"),
  zohoId: text("zoho_id"),
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
});
