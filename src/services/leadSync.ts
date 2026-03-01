import { eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { syncedLeads } from "../db/schema.ts";
import { logger } from "../lib/logger.ts";
import { getAllLeads } from "./instantly/client.ts";
import { batchUpsertLeads } from "./zoho/client.ts";
import type { InstantlyLead } from "./instantly/types.ts";

export interface LeadSyncResult {
  total: number;
  created: number;
  skipped: number;
  errors: number;
}


export async function runLeadSync(limit?: number): Promise<LeadSyncResult> {
  const leads = await getAllLeads(limit);
  logger.info("Starting lead sync", { total: leads.length });

  // Single DB fetch — used for dedup and backfill
  const syncedRows = await db.select({ email: syncedLeads.email, website: syncedLeads.website })
    .from(syncedLeads);
  const syncedEmails = new Set(syncedRows.map(r => r.email));

  const { toSync, skipped } = filterLeadsToSync(leads, syncedEmails);

  let created = 0;
  let errors = 0;
  if (toSync.length > 0) {
    ({ created, errors } = await upsertAndPersist(toSync));
  }

  await backfillWebsites(leads, syncedRows);

  const result = { total: leads.length, created, skipped, errors };
  logger.info("Lead sync complete", result);
  return result;
}

function buildZohoFields(lead: InstantlyLead): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    Email: lead.email,
    Lead_Status: "Not Contacted",
  };
  if (lead.first_name) fields.First_Name = lead.first_name;
  // Last_Name is mandatory in Zoho — fall back to company name for B2B leads with no personal name
  fields.Last_Name = lead.last_name || lead.company_name || lead.email.split("@")[0];
  if (lead.company_name) fields.Company = lead.company_name;
  if (lead.phone) fields.Phone = lead.phone;
  return fields;
}

/** Validates leads and removes ones already in the DB. Returns leads ready to sync and skip count. */
function filterLeadsToSync(
  leads: InstantlyLead[],
  syncedEmails: Set<string>,
): { toSync: InstantlyLead[]; skipped: number } {
  const toSync: InstantlyLead[] = [];
  let skipped = 0;

  for (const lead of leads) {
    if (!lead.email) {
      logger.warn("Lead has no email, skipping", { id: lead.id });
      skipped++;
      continue;
    }
    if (!lead.phone) {
      logger.debug("Lead has no phone number, skipping", { email: lead.email });
      skipped++;
      continue;
    }
    if (syncedEmails.has(lead.email)) {
      logger.debug("Lead already synced, skipping", { email: lead.email });
      skipped++;
      continue;
    }
    toSync.push(lead);
  }

  return { toSync, skipped };
}

/**
 * Batch-upserts leads to Zoho then bulk-inserts successes into the DB.
 * Partial Zoho failures are logged per-record; the successful ones still persist.
 */
async function upsertAndPersist(toSync: InstantlyLead[]): Promise<{ created: number; errors: number }> {
  const { successes, errors: zohoErrors } = await batchUpsertLeads(
    toSync.map(l => buildZohoFields(l))
  );

  for (const err of zohoErrors) {
    logger.error("Zoho upsert failed for lead", { ...err });
  }

  if (successes.length > 0) {
    const leadByEmail = new Map(toSync.map(l => [l.email, l]));
    // Bulk insert. onConflictDoNothing guards against concurrent sync calls.
    await db.insert(syncedLeads)
      .values(successes.map(s => ({
        email: s.email,
        instantlyId: leadByEmail.get(s.email)?.id,
        zohoId: s.zohoId,
        website: leadByEmail.get(s.email)?.website ?? null,
      })))
      .onConflictDoNothing();

    logger.info("Zoho batch upsert complete", {
      inserted: successes.filter(s => s.action === "insert").length,
      updated: successes.filter(s => s.action === "update").length,
    });
  }

  return { created: successes.length, errors: zohoErrors.length };
}

/**
 * Updates existing DB records where website was null but Instantly now has one.
 * Uses rows already fetched from the DB — no extra queries per lead.
 */
async function backfillWebsites(
  leads: InstantlyLead[],
  syncedRows: Array<{ email: string; website: string | null }>,
): Promise<void> {
  const syncedWithoutWebsite = new Set(
    syncedRows.filter(r => r.website === null).map(r => r.email)
  );

  let updated = 0;
  for (const lead of leads) {
    if (!lead.email || !lead.website) continue;
    if (!syncedWithoutWebsite.has(lead.email)) continue;
    await db.update(syncedLeads)
      .set({ website: lead.website })
      .where(eq(syncedLeads.email, lead.email));
    updated++;
  }

  if (updated > 0) logger.info("Backfilled website for existing leads", { updated });
}
