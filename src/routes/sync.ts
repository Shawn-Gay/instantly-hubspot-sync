import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { syncedLeads } from "../db/schema.ts";
import { logger } from "../lib/logger.ts";
import { getAllLeads } from "../services/instantly/client.ts";
import { createLead, findLeadByEmail } from "../services/zoho/client.ts";
import type { InstantlyLead } from "../services/instantly/types.ts";

export const syncRoutes = new Hono();

function buildZohoFields(lead: InstantlyLead): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    Email: lead.email,
    Lead_Status: "Not Contacted",
  };
  if (lead.first_name) fields.First_Name = lead.first_name;
  if (lead.last_name) fields.Last_Name = lead.last_name;
  if (lead.company_name) fields.Company = lead.company_name;
  if (lead.phone) fields.Phone = lead.phone;
  return fields;
}

/**
 * POST /sync/leads
 * Fetches all leads from Instantly and creates matching Zoho Leads
 * for any that haven't been synced yet (tracked by email in the DB).
 * Returns a summary of the operation.
 */
syncRoutes.post("/leads", async (c) => {
  const results = { total: 0, created: 0, skipped: 0, errors: 0 };

  try {
    const limitParam = c.req.query("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    let leads = await getAllLeads(limit);
    if (limit && limit > 0) leads = leads.slice(0, limit);
    results.total = leads.length;
    logger.info("Starting lead sync", { total: leads.length });

    for (const lead of leads) {
      if (!lead.email) {
        logger.warn("Lead has no email, skipping", { id: lead.id });
        results.skipped++;
        continue;
      }

      if (!lead.phone) {
        logger.debug("Lead has no phone number, skipping", { email: lead.email });
        results.skipped++;
        continue;
      }

      try {
        // Check if already synced in our DB
        const existing = await db.select()
          .from(syncedLeads)
          .where(eq(syncedLeads.email, lead.email))
          .limit(1);

        if (existing.length > 0) {
          logger.debug("Lead already synced, skipping", { email: lead.email });
          results.skipped++;
          continue;
        }

        // Check if a Zoho Lead already exists (defensive — may have been created outside this sync)
        let zohoId: string | null = null;
        const zohoLead = await findLeadByEmail(lead.email);

        if (zohoLead) {
          zohoId = zohoLead.id;
          logger.info("Zoho lead already exists, recording", { email: lead.email, zohoId });
        } else {
          zohoId = await createLead(buildZohoFields(lead));
          logger.info("Zoho lead created", { email: lead.email, zohoId });
        }

        await db.insert(syncedLeads).values({
          email: lead.email,
          instantlyId: lead.id,
          zohoId,
        });

        results.created++;
      } catch (err) {
        logger.error("Failed to sync lead", {
          email: lead.email,
          error: err instanceof Error ? err.message : String(err),
        });
        results.errors++;
      }
    }

    logger.info("Lead sync complete", results);
    return c.json({ status: "ok", ...results });
  } catch (err) {
    logger.error("Lead sync failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json({ status: "error", message: err instanceof Error ? err.message : String(err) }, 500);
  }
});
