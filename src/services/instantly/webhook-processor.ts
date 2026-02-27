import { eq } from "drizzle-orm";
import { db } from "../../db/client.ts";
import { processedEvents, syncJobs } from "../../db/schema.ts";
import { logger } from "../../lib/logger.ts";
import type { InstantlyWebhookPayload } from "./types.ts";

/**
 * Generates a SHA-256 dedup hash for a webhook event.
 */
async function generateEventId(payload: InstantlyWebhookPayload): Promise<string> {
  const email = payload.data.lead_email || payload.data.email || "";
  const campaignId = payload.data.campaign_id || "";
  const timestamp = payload.timestamp || "";
  const raw = `${payload.event_type}:${email}:${campaignId}:${timestamp}`;

  const hash = new Bun.CryptoHasher("sha256").update(raw).digest("hex");
  return hash;
}

/**
 * Processes an incoming webhook event:
 * 1. Generates a dedup hash
 * 2. Checks if already processed
 * 3. Inserts into processed_events + sync_jobs in a transaction
 */
export async function processWebhookEvent(
  payload: InstantlyWebhookPayload,
): Promise<{ duplicate: boolean; jobId?: number }> {
  const eventId = await generateEventId(payload);
  const email = payload.data.lead_email || payload.data.email || "";

  if (!email) {
    logger.warn("Webhook event missing email, skipping", {
      eventType: payload.event_type,
    });
    return { duplicate: false };
  }

  // Use a transaction to dedup + enqueue atomically
  const result = await db.transaction(async (tx) => {
    // Check for duplicate
    const existing = await tx
      .select({ id: processedEvents.id })
      .from(processedEvents)
      .where(eq(processedEvents.eventId, eventId))
      .limit(1);

    if (existing.length > 0) {
      return { duplicate: true };
    }

    // Insert processed event
    await tx.insert(processedEvents).values({
      eventId,
      eventType: payload.event_type,
      leadEmail: email,
      campaignId: payload.data.campaign_id || null,
    });

    // Enqueue sync job
    const [job] = await tx
      .insert(syncJobs)
      .values({
        leadEmail: email,
        eventType: payload.event_type,
        payload: {
          event_type: payload.event_type,
          lead_email: email,
          campaign_id: payload.data.campaign_id,
          campaign_name: payload.data.campaign_name,
          status: payload.data.status,
          lt_interest_status: payload.data.lt_interest_status,
          open_count: payload.data.open_count,
          click_count: payload.data.click_count,
          reply_text: payload.data.reply_text,
          timestamp: payload.timestamp,
        },
      })
      .returning({ id: syncJobs.id });

    return { duplicate: false, jobId: job?.id };
  });

  if (result.duplicate) {
    logger.debug("Duplicate webhook event, skipped", { eventId });
  } else {
    logger.info("Webhook event processed", {
      eventId,
      eventType: payload.event_type,
      email,
      jobId: result.jobId,
    });
  }

  return result;
}
