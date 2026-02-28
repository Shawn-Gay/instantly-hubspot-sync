import { eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.ts";
import { leadContactMap } from "../../db/schema.ts";
import { config } from "../../config.ts";
import { logger } from "../../lib/logger.ts";
import { batchUpsertContacts } from "./client.ts";
import {
  getColdPoolCount,
  addToColdQueue,
  promoteColdQueue,
  deleteContactIfExists,
} from "./lifecycle.ts";

export interface SyncJobPayload {
  event_type: string;
  lead_email: string;
  campaign_id?: string;
  campaign_name?: string;
  status?: string | number;
  lt_interest_status?: number;
  open_count?: number;
  click_count?: number;
  reply_text?: string;
  timestamp?: string;
  [key: string]: unknown;
}

// ─── Classification ──────────────────────────────────────

type JobAction = "upsert-cold" | "upsert-warm" | "upsert-hot" | "delete" | "queue" | "skip";

function classifyJob(
  job: { payload: SyncJobPayload },
  existingTier: string | undefined,
  coldPoolCount: number,
  coldPoolMax: number,
): JobAction {
  const { event_type, status, lt_interest_status } = job.payload;

  switch (event_type) {
    case "email_sent":
      if (existingTier !== undefined) return "skip"; // already in HubSpot, never downgrade
      if (coldPoolCount < coldPoolMax) return "upsert-cold";
      return "queue";

    case "email_opened":
    case "email_link_clicked":
      return "upsert-warm";

    case "reply_received":
      return "upsert-hot";

    case "email_bounced":
    case "lead_unsubscribed":
      return "delete";

    case "lead_status_change": {
      const statusNum =
        typeof status === "string" ? parseInt(status, 10) : (status as number | undefined);
      if (statusNum === -1 || statusNum === -2) return "delete";
      if (lt_interest_status !== undefined && [-1, -2, -3, 4].includes(lt_interest_status)) {
        return "delete";
      }
      return "upsert-warm";
    }

    default:
      return "skip";
  }
}

function determineTier(action: JobAction, existingTier: string | undefined): string {
  switch (action) {
    case "upsert-cold":
      return "cold";
    case "upsert-hot":
      return "hot";
    case "upsert-warm":
      // Contacts can only move up: hot stays hot, warm stays warm, cold graduates to warm
      return existingTier === "hot" ? "hot" : "warm";
    default:
      return existingTier ?? "cold";
  }
}

// ─── Property Builder ────────────────────────────────────

/**
 * Maps an event payload to HubSpot contact properties.
 * Pass `tier` to set the instantly_lead_tier property.
 */
function buildProperties(payload: SyncJobPayload, tier?: string): Record<string, string> {
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

  // Tier
  if (tier) {
    props.instantly_lead_tier = tier;
  }

  switch (payload.event_type) {
    case "email_sent":
      props.instantly_last_email_sent_date = payload.timestamp || now;
      break;

    case "email_opened":
      if (payload.open_count !== undefined) {
        props.instantly_email_open_count = String(payload.open_count);
      }
      break;

    case "email_link_clicked":
      if (payload.click_count !== undefined) {
        props.instantly_email_click_count = String(payload.click_count);
      }
      break;

    case "email_bounced":
      props.instantly_email_bounced = "true";
      break;

    case "reply_received":
      props.instantly_reply_received = "true";
      if (payload.reply_text) {
        props.instantly_reply_snippet = payload.reply_text.slice(0, 500);
      }
      break;

    case "lead_status_change":
      if (payload.status !== undefined) {
        props.instantly_lead_status = String(payload.status);
      }
      break;

    case "lead_unsubscribed":
      props.instantly_unsubscribed = "true";
      break;
  }

  return props;
}

// ─── Main Sync ───────────────────────────────────────────

/**
 * Processes a batch of sync jobs:
 * - Classifies each by event type into upsert-cold/warm/hot, delete, queue, or skip
 * - Deletes disqualified contacts from HubSpot and frees cold pool slots
 * - Queues overflow cold leads in cold_queue
 * - Promotes queued leads when slots are freed
 * - Batch-upserts remaining contacts and updates lead_contact_map
 */
export async function syncToHubSpot(
  jobs: Array<{ id: number; leadEmail: string; payload: SyncJobPayload }>,
): Promise<void> {
  if (jobs.length === 0) return;

  // 1. Fetch existing contact records for all emails in this batch
  const emails = [...new Set(jobs.map((j) => j.leadEmail))];
  const existingContacts = await db
    .select()
    .from(leadContactMap)
    .where(inArray(leadContactMap.leadEmail, emails));

  const contactMap = new Map(
    existingContacts.map((c) => [c.leadEmail, { hubspotId: c.hubspotContactId, tier: c.tier }]),
  );

  // 2. Get current cold pool count (DB query once)
  let localColdPoolCount = await getColdPoolCount();
  const coldPoolMax = config.coldPoolMax;

  // 3. Classify each job (localColdPoolCount tracks cold slots reserved in this batch)
  const classified = jobs.map((job) => {
    const existingTier = contactMap.get(job.leadEmail)?.tier;
    const action = classifyJob(job, existingTier, localColdPoolCount, coldPoolMax);
    if (action === "upsert-cold") localColdPoolCount++;
    return { ...job, action, existingTier };
  });

  // 4. Process deletions — track how many cold slots are freed
  let freedColdSlots = 0;
  const deleteJobs = classified.filter((j) => j.action === "delete");
  for (const job of deleteJobs) {
    const { wasCold } = await deleteContactIfExists(job.leadEmail);
    if (wasCold) freedColdSlots++;
  }

  // 5. Add overflow cold leads to the waiting queue
  const queueJobs = classified.filter((j) => j.action === "queue");
  for (const job of queueJobs) {
    await addToColdQueue(job.leadEmail, job.payload);
  }

  // 6. Promote queued leads — one per freed cold slot from deletions
  for (let i = 0; i < freedColdSlots; i++) {
    await promoteColdQueue();
  }

  // 7. Batch-upsert remaining contacts
  const upsertJobs = classified.filter(
    (j) => j.action === "upsert-cold" || j.action === "upsert-warm" || j.action === "upsert-hot",
  );

  if (upsertJobs.length === 0) {
    logger.info("Sync batch complete (no upserts)", {
      deleted: deleteJobs.length,
      queued: queueJobs.length,
      promotedFromDeletion: freedColdSlots,
    });
    return;
  }

  // Group by email, merging properties (last-write wins per email)
  type UpsertEntry = {
    properties: Record<string, string>;
    action: JobAction;
    existingTier: string | undefined;
  };
  const byEmail = new Map<string, UpsertEntry>();

  for (const job of upsertJobs) {
    const action = job.action as JobAction;
    const tier = determineTier(action, job.existingTier);
    const existing = byEmail.get(job.leadEmail);
    const newProps = buildProperties(job.payload, tier);
    byEmail.set(job.leadEmail, {
      properties: { ...(existing?.properties ?? {}), ...newProps },
      action,
      existingTier: job.existingTier,
    });
  }

  const inputs = Array.from(byEmail.entries()).map(([email, { properties }]) => ({
    idProperty: "email" as const,
    id: email,
    properties,
  }));

  logger.info("Batch upserting contacts to HubSpot", {
    count: inputs.length,
    contacts: inputs.map((i) => ({ email: i.id, properties: Object.keys(i.properties) })),
  });

  const response = await batchUpsertContacts({ inputs });

  // 8. Update lead_contact_map; track cold→warm/hot graduations for extra promotions
  let extraPromotions = 0;

  for (const result of response.results) {
    const email = result.properties.email;
    if (!email) continue;

    const entry = byEmail.get(email);
    const tier = entry ? determineTier(entry.action, entry.existingTier) : "cold";

    // A cold contact graduating to warm or hot frees a cold pool slot
    if (
      entry &&
      (entry.action === "upsert-warm" || entry.action === "upsert-hot") &&
      entry.existingTier === "cold"
    ) {
      extraPromotions++;
    }

    const existingRecord = contactMap.get(email);
    if (existingRecord) {
      await db
        .update(leadContactMap)
        .set({ hubspotContactId: result.id, tier, updatedAt: new Date() })
        .where(eq(leadContactMap.leadEmail, email));
    } else {
      await db.insert(leadContactMap).values({
        leadEmail: email,
        hubspotContactId: result.id,
        tier,
      });
    }
  }

  // Promote one queued lead for each cold slot freed by tier graduation
  for (let i = 0; i < extraPromotions; i++) {
    await promoteColdQueue();
  }

  logger.info("HubSpot sync batch complete", {
    upserted: response.results.length,
    deleted: deleteJobs.length,
    queued: queueJobs.length,
    promotedFromDeletion: freedColdSlots,
    promotedFromGraduation: extraPromotions,
  });
}
