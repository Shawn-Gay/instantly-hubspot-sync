import { eq } from "drizzle-orm";
import { db } from "../../db/client.ts";
import { processedEvents, syncJobs, pollState } from "../../db/schema.ts";
import { logger } from "../../lib/logger.ts";
import { config } from "../../config.ts";
import { getCampaigns, getLeads } from "./client.ts";

const POLL_TYPE = "lead_status";

let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Generates a dedup hash for polled lead data.
 */
function generatePollEventId(email: string, campaignId: string, status: number | string): string {
  const raw = `poll:${email}:${campaignId}:${status}`;
  return new Bun.CryptoHasher("sha256").update(raw).digest("hex");
}

/**
 * Polls all campaigns for lead updates.
 */
async function pollLeads(): Promise<void> {
  logger.info("Starting poll cycle...");

  try {
    const campaignsResponse = await getCampaigns();
    const campaigns = campaignsResponse.items;
    logger.info("Polling leads for campaigns", { count: campaigns.length });

    for (const campaign of campaigns) {
      let cursor: string | undefined;

      // Get stored cursor for this campaign
      const stored = await db
        .select()
        .from(pollState)
        .where(eq(pollState.pollType, `${POLL_TYPE}:${campaign.id}`))
        .limit(1);

      if (stored.length > 0 && stored[0]!.cursor) {
        cursor = stored[0]!.cursor;
      }

      let hasMore = true;
      let newCursor: string | undefined;
      let processedCount = 0;

      while (hasMore) {
        const response = await getLeads(campaign.id, 100, cursor);

        for (const lead of response.items) {
          if (!lead.email) {
            // Instantly API v2 omits email from list responses — cannot process without it
            logger.warn("Lead missing email, skipping (v2 API limitation)", { leadId: lead.id });
            continue;
          }

          const eventId = generatePollEventId(lead.email, campaign.id, lead.status);

          // Dedup + enqueue in transaction
          await db.transaction(async (tx) => {
            const existing = await tx
              .select({ id: processedEvents.id })
              .from(processedEvents)
              .where(eq(processedEvents.eventId, eventId))
              .limit(1);

            if (existing.length > 0) return;

            await tx.insert(processedEvents).values({
              eventId,
              eventType: "lead_status_change",
              leadEmail: lead.email,
              campaignId: campaign.id,
            });

            await tx.insert(syncJobs).values({
              leadEmail: lead.email,
              eventType: "lead_status_change",
              payload: {
                event_type: "lead_status_change",
                lead_email: lead.email,
                campaign_id: campaign.id,
                campaign_name: campaign.name || lead.campaign_name,
                status: lead.status,
                timestamp: lead.timestamp || new Date().toISOString(),
              },
            });

            processedCount++;
          });
        }

        newCursor = response.next_starting_after;
        hasMore = !!newCursor;
        cursor = newCursor;
      }

      // Update cursor state
      const pollKey = `${POLL_TYPE}:${campaign.id}`;
      const existingState = await db
        .select()
        .from(pollState)
        .where(eq(pollState.pollType, pollKey))
        .limit(1);

      if (existingState.length > 0) {
        await db
          .update(pollState)
          .set({
            cursor: newCursor || null,
            lastPollAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(pollState.pollType, pollKey));
      } else {
        await db.insert(pollState).values({
          pollType: pollKey,
          cursor: newCursor || null,
          lastPollAt: new Date(),
        });
      }

      if (processedCount > 0) {
        logger.info("Poll found new lead events", {
          campaignId: campaign.id,
          campaignName: campaign.name,
          newEvents: processedCount,
        });
      }
    }

    logger.info("Poll cycle completed");
  } catch (error) {
    logger.error("Poll cycle error", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function startPoller(): void {
  if (!config.pollEnabled) return;

  intervalId = setInterval(pollLeads, config.pollIntervalMs);
  // Run first poll after a short delay to let boot complete
  setTimeout(pollLeads, 5_000);
}

export function stopPoller(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info("Poller stopped");
  }
}
