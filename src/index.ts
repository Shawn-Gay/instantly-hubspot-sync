import { Hono } from "hono";
import { config } from "./config.ts";
import { logger } from "./lib/logger.ts";
import { runMigrations } from "./db/migrate.ts";
import { resetStaleJobs } from "./queue/processor.ts";
import { ensureCustomProperties } from "./services/hubspot/properties.ts";
import { registerWebhooks } from "./services/instantly/client.ts";
import { startSyncEngine } from "./services/sync-engine.ts";
import { startPoller } from "./services/instantly/poller.ts";
import { webhookRoutes } from "./routes/webhooks.ts";
import { healthRoutes } from "./routes/health.ts";

const app = new Hono();

// ─── Routes ──────────────────────────────────────────────
app.route("/webhooks", webhookRoutes);
app.route("/health", healthRoutes);

// Root redirect to health
app.get("/", (c) => c.redirect("/health"));

// ─── Boot Sequence ───────────────────────────────────────
async function boot(): Promise<void> {
  logger.info("Starting Instantly -> HubSpot sync service...");

  // 1. Env vars already validated by config.ts import
  logger.info("Configuration loaded");

  // 2. Run database migrations
  await runMigrations();

  // 3. Reset stale processing jobs
  await resetStaleJobs();

  // 4. Ensure HubSpot custom properties exist
  await ensureCustomProperties();

  // 5. Auto-register Instantly webhooks
  if (config.autoRegisterWebhooks) {
    try {
      await registerWebhooks(config.webhookBaseUrl);
    } catch (error) {
      logger.error("Failed to register webhooks (non-fatal)", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // 6. Start sync engine
  startSyncEngine();

  // 7. Start poller
  startPoller();

  // 8. Start HTTP server
  logger.info(`Server starting on port ${config.port}`);
}

// Run boot sequence then start server
boot().catch((error) => {
  logger.error("Fatal boot error", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});

export default {
  port: config.port,
  fetch: app.fetch,
};
