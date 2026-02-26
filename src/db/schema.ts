import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";

// ─── Enums ───────────────────────────────────────────────

export const syncJobStatusEnum = pgEnum("sync_job_status", [
  "pending",
  "processing",
  "completed",
  "failed",
  "dead_letter",
]);

// ─── 1. processed_events ─────────────────────────────────

export const processedEvents = pgTable(
  "processed_events",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    leadEmail: text("lead_email").notNull(),
    campaignId: text("campaign_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("idx_processed_events_event_id").on(table.eventId)],
);

// ─── 2. sync_jobs ────────────────────────────────────────

export const syncJobs = pgTable(
  "sync_jobs",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    leadEmail: text("lead_email").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    status: syncJobStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_sync_jobs_status_retry").on(table.status, table.nextRetryAt),
  ],
);

// ─── 3. lead_contact_map ─────────────────────────────────

export const leadContactMap = pgTable(
  "lead_contact_map",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    leadEmail: text("lead_email").notNull(),
    hubspotContactId: text("hubspot_contact_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("idx_lead_contact_map_email").on(table.leadEmail)],
);

// ─── 4. poll_state ───────────────────────────────────────

export const pollState = pgTable("poll_state", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  pollType: text("poll_type").notNull().unique(),
  cursor: text("cursor"),
  lastPollAt: timestamp("last_poll_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── 5. sync_errors ──────────────────────────────────────

export const syncErrors = pgTable("sync_errors", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  syncJobId: integer("sync_job_id").references(() => syncJobs.id),
  errorMessage: text("error_message").notNull(),
  requestPayload: jsonb("request_payload"),
  responsePayload: jsonb("response_payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
