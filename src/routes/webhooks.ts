import { Hono } from "hono";
import { config } from "../config.ts";
import { logger } from "../lib/logger.ts";
import type { InstantlyWebhookPayload } from "../services/instantly/types.ts";
import { findLeadByEmail as findInstantlyLead, pauseLead } from "../services/instantly/client.ts";
import { findLeadByEmail as findZohoLead, getLeadFields, updateLead } from "../services/zoho/client.ts";
import { mapEventToZohoUpdates, STATUS_PRIORITY } from "../services/zoho/mapper.ts";

// Note: the JustCall → Zoho update is handled by JustCall's native Zoho integration.
// Our /webhooks/justcall endpoint only handles what JustCall can't do: pausing the lead in Instantly.

export const webhookRoutes = new Hono();

// ─── Instantly → Zoho ────────────────────────────────────

/**
 * POST /webhooks/instantly
 * Receives Instantly engagement events and updates the matching Zoho Lead.
 *
 * Status priority: Not Contacted < Attempted to Contact < Warm < Replied < Meeting Booked
 * Status never downgrades. Junk Lead (bounce/unsubscribe) is applied unless
 * the lead is already "Meeting Booked".
 *
 * Always returns 200 to prevent Instantly retry storms.
 */
webhookRoutes.post("/instantly", async (c) => {
  try {
    let payload: InstantlyWebhookPayload;

    if (config.webhookSecret) {
      const body = await c.req.text();
      const signature = c.req.header("x-instantly-signature") || "";
      const hmac = new Bun.CryptoHasher("sha256")
        .update(config.webhookSecret + body)
        .digest("hex");

      if (hmac !== signature) {
        logger.warn("Invalid Instantly webhook signature");
        return c.json({ status: "ok" });
      }

      payload = JSON.parse(body) as InstantlyWebhookPayload;
    } else {
      payload = await c.req.json<InstantlyWebhookPayload>();
    }

    const email = payload.data.lead_email || payload.data.email || "";
    if (!email) {
      logger.warn("Instantly webhook missing email, skipping", { eventType: payload.event_type });
      return c.json({ status: "ok" });
    }

    const mapping = mapEventToZohoUpdates(payload.event_type);
    if (!mapping) {
      logger.debug("Instantly event skipped (no Zoho update)", { eventType: payload.event_type, email });
      return c.json({ status: "ok" });
    }

    const lead = await findZohoLead(email);
    if (!lead) {
      logger.warn("Zoho lead not found for Instantly event", { email, eventType: payload.event_type });
      return c.json({ status: "ok" });
    }

    const updates: Record<string, unknown> = { ...mapping.extraFields };

    // Fetch current field values in one call
    const fieldsToFetch = ["Lead_Status"];
    if (mapping.incrementEmailsSent) fieldsToFetch.push(config.zohoEmailsSentField);
    const current = await getLeadFields(lead.id, fieldsToFetch);

    const currentStatus = (current["Lead_Status"] as string) ?? "";

    // Emails sent increment
    if (mapping.incrementEmailsSent) {
      const count = (current[config.zohoEmailsSentField] as number) ?? 0;
      updates[config.zohoEmailsSentField] = count + 1;
    }

    // Status update
    if (mapping.newStatus) {
      if (mapping.newStatus === "Junk Lead") {
        // Apply junk/opt-out unless the lead already booked a meeting
        if (currentStatus !== "Meeting Booked") {
          updates["Lead_Status"] = "Junk Lead";
        } else {
          logger.debug("Skipping Junk Lead status — lead already has Meeting Booked", { email });
          // Email_Opt_Out (from extraFields) still applies
        }
      } else {
        // Only advance status, never downgrade
        const currentPriority = STATUS_PRIORITY[currentStatus] ?? -1;
        const newPriority = STATUS_PRIORITY[mapping.newStatus] ?? -1;
        if (newPriority > currentPriority) {
          updates["Lead_Status"] = mapping.newStatus;
        } else {
          logger.debug("Skipping status update — would downgrade lead", {
            email,
            currentStatus,
            newStatus: mapping.newStatus,
          });
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      await updateLead(lead.id, updates);
      logger.info("Zoho lead updated", { email, eventType: payload.event_type, updates });
    }

    return c.json({ status: "ok" });
  } catch (error) {
    logger.error("Instantly webhook processing error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json({ status: "ok" });
  }
});

// ─── JustCall → Instantly + Zoho ─────────────────────────

/**
 * POST /webhooks/justcall
 * Receives JustCall call outcome events. When "Meeting Booked" is detected,
 * pauses the lead in Instantly so cold emails stop.
 * Zoho is updated by JustCall's native CRM integration — no need to do it here.
 * Always returns 200.
 */
webhookRoutes.post("/justcall", async (c) => {
  try {
    const payload = await c.req.json<Record<string, unknown>>();

    // JustCall sends call outcome in `data.disposition` or `disposition` depending on version
    const data = (payload.data ?? payload) as Record<string, unknown>;
    const outcome = (data.disposition ?? data.call_disposition ?? data.outcome ?? "") as string;
    const email = (data.contact_email ?? data.email ?? "") as string;

    if (!outcome || outcome !== config.justcallMeetingBookedOutcome) {
      logger.debug("JustCall event skipped (not meeting booked)", { outcome });
      return c.json({ status: "ok" });
    }

    if (!email) {
      logger.warn("JustCall webhook missing email, skipping");
      return c.json({ status: "ok" });
    }

    const lead = await findInstantlyLead(email);
    if (!lead) {
      logger.warn("Instantly lead not found for JustCall contact", { email });
      return c.json({ status: "ok" });
    }

    await pauseLead(lead.id);
    logger.info("Lead paused in Instantly after meeting booked", { email, leadId: lead.id });

    return c.json({ status: "ok" });
  } catch (error) {
    logger.error("JustCall webhook processing error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json({ status: "ok" });
  }
});
