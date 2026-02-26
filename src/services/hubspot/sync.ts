import { eq } from "drizzle-orm";
import { db } from "../../db/client.ts";
import { leadContactMap } from "../../db/schema.ts";
import { logger } from "../../lib/logger.ts";
import { batchUpsertContacts } from "./client.ts";
import type { HubSpotBatchUpsertRequest } from "./types.ts";

export interface SyncJobPayload {
  event_type: string;
  lead_email: string;
  campaign_id?: string;
  campaign_name?: string;
  status?: string;
  reply_text?: string;
  timestamp?: string;
  [key: string]: unknown;
}

/**
 * Maps an event payload to HubSpot contact properties.
 */
function buildProperties(payload: SyncJobPayload): Record<string, string> {
  const props: Record<string, string> = {};
  const now = new Date().toISOString();

  // Always set last activity
  props.instantly_last_activity_date = payload.timestamp || now;

  // Campaign info
  if (payload.campaign_id) {
    props.instantly_campaign_id = payload.campaign_id;
  }
  if (payload.campaign_name) {
    props.instantly_campaign_name = payload.campaign_name;
  }

  switch (payload.event_type) {
    case "email_sent":
      props.instantly_last_email_sent_date = payload.timestamp || now;
      break;

    case "email_opened":
      // Increment is not directly supported in batch upsert;
      // we set a count value. The sync engine aggregates before calling this.
      if (payload.open_count !== undefined) {
        props.instantly_email_open_count = String(payload.open_count);
      }
      break;

    case "email_clicked":
      if (payload.click_count !== undefined) {
        props.instantly_email_click_count = String(payload.click_count);
      }
      break;

    case "email_bounced":
      props.instantly_email_bounced = "true";
      break;

    case "email_replied":
      props.instantly_reply_received = "true";
      if (payload.reply_text) {
        // Truncate to 500 chars for HubSpot single-line limit
        props.instantly_reply_snippet = payload.reply_text.slice(0, 500);
      }
      break;

    case "lead_status_change":
      if (payload.status) {
        props.instantly_lead_status = payload.status;
      }
      break;

    case "email_unsubscribed":
      props.instantly_unsubscribed = "true";
      break;
  }

  return props;
}

/**
 * Batch upserts contacts in HubSpot and updates the lead-contact map.
 * Accepts up to 10 jobs at a time (HubSpot batch limit).
 */
export async function syncToHubSpot(
  jobs: Array<{ id: number; leadEmail: string; payload: SyncJobPayload }>,
): Promise<void> {
  if (jobs.length === 0) return;

  // Group jobs by email, merge properties (last write wins)
  const byEmail = new Map<string, Record<string, string>>();
  for (const job of jobs) {
    const existing = byEmail.get(job.leadEmail) || {};
    const newProps = buildProperties(job.payload);
    byEmail.set(job.leadEmail, { ...existing, ...newProps });
  }

  const inputs = Array.from(byEmail.entries()).map(([email, properties]) => ({
    idProperty: "email" as const,
    id: email,
    properties,
  }));

  const request: HubSpotBatchUpsertRequest = { inputs };

  logger.info("Batch upserting contacts to HubSpot", {
    count: inputs.length,
    contacts: inputs.map((i) => ({ email: i.id, properties: Object.keys(i.properties) })),
  });
  const response = await batchUpsertContacts(request);

  // Update lead_contact_map with returned contact IDs
  for (const result of response.results) {
    const email = result.properties.email;
    if (!email) continue;

    const existing = await db
      .select()
      .from(leadContactMap)
      .where(eq(leadContactMap.leadEmail, email))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(leadContactMap)
        .set({
          hubspotContactId: result.id,
          updatedAt: new Date(),
        })
        .where(eq(leadContactMap.leadEmail, email));
    } else {
      await db.insert(leadContactMap).values({
        leadEmail: email,
        hubspotContactId: result.id,
      });
    }
  }

  logger.info("HubSpot batch upsert completed", {
    upserted: response.results.length,
  });
}
