import { Hono } from "hono";
import { logger } from "../lib/logger.ts";
import { runLeadSync } from "../services/leadSync.ts";

export const syncRoutes = new Hono();

let syncRunning = false;

/**
 * POST /sync/leads
 * Kicks off a background lead sync and returns 202 immediately.
 * Returns 409 if a sync is already in progress.
 * Pass ?limit=N to cap the number of leads processed.
 */
syncRoutes.post("/leads", (c) => {
  if (syncRunning) {
    return c.json({ status: "busy", message: "Sync already in progress" }, 409);
  }

  const limitParam = c.req.query("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  syncRunning = true;
  runLeadSync(limit)
    .catch(err => logger.error("Lead sync failed", { error: err instanceof Error ? err.message : String(err) }))
    .finally(() => { syncRunning = false; });

  return c.json({ status: "started" }, 202);
});
