import { Hono } from "hono";
import { triggerBatch } from "../services/sync-engine.ts";
import { getQueueStats } from "../queue/processor.ts";
import { logger } from "../lib/logger.ts";

export const adminRoutes = new Hono();

/**
 * POST /admin/sync
 * Manually trigger a single sync batch (up to 10 jobs).
 */
adminRoutes.post("/sync", async (c) => {
  try {
    const { jobsProcessed, skipped } = await triggerBatch();
    const stats = await getQueueStats();

    return c.json({
      status: "ok",
      skipped,
      jobsProcessed,
      queue: stats,
    });
  } catch (error) {
    logger.error("Manual sync trigger failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json({ status: "error", message: "Sync failed" }, 500);
  }
});
