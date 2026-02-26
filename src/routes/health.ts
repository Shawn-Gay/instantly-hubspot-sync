import { Hono } from "hono";
import { getQueueStats } from "../queue/processor.ts";
import { logger } from "../lib/logger.ts";

export const healthRoutes = new Hono();

healthRoutes.get("/", async (c) => {
  try {
    const stats = await getQueueStats();
    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      queue: stats,
    });
  } catch (error) {
    logger.error("Health check failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json({ status: "error", message: "Database unreachable" }, 503);
  }
});
