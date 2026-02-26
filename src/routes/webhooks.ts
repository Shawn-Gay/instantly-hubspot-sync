import { Hono } from "hono";
import { config } from "../config.ts";
import { logger } from "../lib/logger.ts";
import { processWebhookEvent } from "../services/instantly/webhook-processor.ts";
import type { InstantlyWebhookPayload } from "../services/instantly/types.ts";

export const webhookRoutes = new Hono();

/**
 * POST /webhooks/instantly
 * Always returns 200 to prevent Instantly retry storms.
 * Polling catches any missed events.
 */
webhookRoutes.post("/instantly", async (c) => {
  try {
    // Optional HMAC verification
    if (config.webhookSecret) {
      const signature = c.req.header("x-instantly-signature") || "";
      const body = await c.req.text();

      const hmac = new Bun.CryptoHasher("sha256")
        .update(config.webhookSecret + body)
        .digest("hex");

      if (hmac !== signature) {
        logger.warn("Invalid webhook signature");
        // Still return 200 to avoid retry storms
        return c.json({ status: "ok", processed: false, reason: "invalid_signature" });
      }

      // Parse body since we already consumed the stream
      const payload = JSON.parse(body) as InstantlyWebhookPayload;
      const result = await processWebhookEvent(payload);
      return c.json({
        status: "ok",
        processed: !result.duplicate,
        duplicate: result.duplicate,
      });
    }

    const payload = await c.req.json<InstantlyWebhookPayload>();
    const result = await processWebhookEvent(payload);

    return c.json({
      status: "ok",
      processed: !result.duplicate,
      duplicate: result.duplicate,
    });
  } catch (error) {
    logger.error("Webhook processing error", {
      error: error instanceof Error ? error.message : String(error),
    });

    // Always return 200
    return c.json({ status: "ok", processed: false, error: "processing_failed" });
  }
});
