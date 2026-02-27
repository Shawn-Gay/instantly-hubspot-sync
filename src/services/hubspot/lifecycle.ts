import { asc, eq, sql } from "drizzle-orm";
import { db } from "../../db/client.ts";
import { coldQueue, leadContactMap } from "../../db/schema.ts";
import { logger } from "../../lib/logger.ts";
import { batchUpsertContacts, deleteContact } from "./client.ts";

// ─── Cold Pool Count ─────────────────────────────────────

/**
 * Count contacts currently in the cold tier within lead_contact_map.
 */
export async function getColdPoolCount(): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leadContactMap)
    .where(eq(leadContactMap.tier, "cold"));
  return result[0]?.count ?? 0;
}

// ─── Cold Queue ──────────────────────────────────────────

/**
 * Add a lead to the cold_queue (upsert by email — no-op if already queued).
 */
export async function addToColdQueue(
  email: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await db
    .insert(coldQueue)
    .values({
      leadEmail: email,
      campaignId: (payload.campaign_id as string | undefined) ?? null,
      campaignName: (payload.campaign_name as string | undefined) ?? null,
      payload,
    })
    .onConflictDoNothing();

  logger.info("Lead added to cold queue", { email });
}

/**
 * Promote the oldest queued lead into HubSpot as a cold-tier contact.
 * Removes the row from cold_queue on success.
 */
export async function promoteColdQueue(): Promise<void> {
  const [entry] = await db
    .select()
    .from(coldQueue)
    .orderBy(asc(coldQueue.queuedAt))
    .limit(1);

  if (!entry) return;

  // Build minimal properties for a cold contact
  const now = new Date().toISOString();
  const stored = entry.payload as Record<string, unknown>;
  const properties: Record<string, string> = {
    instantly_last_activity_date: (stored.timestamp as string | undefined) ?? now,
    instantly_last_email_sent_date: (stored.timestamp as string | undefined) ?? now,
    instantly_lead_tier: "cold",
  };
  if (stored.campaign_id) properties.instantly_campaign_id = String(stored.campaign_id);
  if (stored.campaign_name) properties.instantly_campaign_name = String(stored.campaign_name);

  const response = await batchUpsertContacts({
    inputs: [{ idProperty: "email", id: entry.leadEmail, properties }],
  });

  const result = response.results[0];
  if (result) {
    const existing = await db
      .select()
      .from(leadContactMap)
      .where(eq(leadContactMap.leadEmail, entry.leadEmail))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(leadContactMap)
        .set({ hubspotContactId: result.id, tier: "cold", updatedAt: new Date() })
        .where(eq(leadContactMap.leadEmail, entry.leadEmail));
    } else {
      await db.insert(leadContactMap).values({
        leadEmail: entry.leadEmail,
        hubspotContactId: result.id,
        tier: "cold",
      });
    }
  }

  await db.delete(coldQueue).where(eq(coldQueue.id, entry.id));

  logger.info("Promoted lead from cold queue to HubSpot", { email: entry.leadEmail });
}

// ─── Deletion ────────────────────────────────────────────

/**
 * Delete a contact from HubSpot and remove them from lead_contact_map.
 * Returns whether the deleted contact was in the cold tier.
 */
export async function deleteContactIfExists(
  email: string,
): Promise<{ wasCold: boolean }> {
  const [existing] = await db
    .select()
    .from(leadContactMap)
    .where(eq(leadContactMap.leadEmail, email))
    .limit(1);

  if (!existing) return { wasCold: false };

  const wasCold = existing.tier === "cold";

  await deleteContact(existing.hubspotContactId);
  await db.delete(leadContactMap).where(eq(leadContactMap.leadEmail, email));

  logger.info("Deleted contact from HubSpot", { email, wasCold });
  return { wasCold };
}
