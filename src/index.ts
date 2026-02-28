import chalk from "chalk";
import { Hono } from "hono";
import { config } from "./config.ts";
import { logger } from "./lib/logger.ts";
import { printBanner, step, stepSync } from "./lib/banner.ts";
import { runMigrations } from "./db/migrate.ts";
import { resetStaleJobs } from "./queue/processor.ts";
import { ensureCustomProperties } from "./services/hubspot/properties.ts";
import { registerWebhooks } from "./services/instantly/client.ts";
import { startSyncEngine } from "./services/sync-engine.ts";
import { startPoller } from "./services/instantly/poller.ts";
import { webhookRoutes } from "./routes/webhooks.ts";
import { healthRoutes } from "./routes/health.ts";
import { adminRoutes } from "./routes/admin.ts";

const app = new Hono();

// ─── Routes ──────────────────────────────────────────────
app.route("/webhooks", webhookRoutes);
app.route("/health", healthRoutes);
app.route("/admin", adminRoutes);

// Root redirect to health
app.get("/", (c) => c.redirect("/health"));

// ─── Boot Sequence ───────────────────────────────────────
async function boot(): Promise<void> {
  printBanner();

  // 1. Run database migrations
  await step("Database migrations", runMigrations);

  // 2. Reset stale processing jobs
  await step(
    "Reset stale jobs",
    resetStaleJobs,
    (count) =>
      count > 0
        ? `Reset stale jobs ${chalk.yellow(`(${count} recovered)`)}`
        : `Reset stale jobs ${chalk.dim("(none)")}`,
  );

  // 3. Ensure HubSpot custom properties exist
  await step(
    "Verify HubSpot properties",
    ensureCustomProperties,
    ({ created, patched }) =>
      created > 0
        ? `HubSpot properties ready ${chalk.yellow(`(+${created} new, ${patched} patched)`)}`
        : `HubSpot properties verified ${chalk.dim(`(${patched} up to date)`)}`,
  );

  // 4. Auto-register Instantly webhooks
  if (config.autoRegisterWebhooks) {
    await step(
      "Register Instantly webhooks",
      () => registerWebhooks(config.webhookBaseUrl),
      ({ registered, skipped, failed }) => {
        const parts: string[] = [];
        if (registered > 0) parts.push(chalk.yellow(`+${registered} new`));
        if (skipped > 0) parts.push(chalk.dim(`${skipped} already registered`));
        if (failed > 0) parts.push(chalk.red(`${failed} failed`));
        return `Webhooks ${registered > 0 ? "registered" : "verified"} ${chalk.dim("(" + parts.join(", ") + ")")}`;
      },
    );
  }

  // 5. Start sync engine
  if (config.syncEnabled) {
    stepSync("Start sync engine", startSyncEngine);
  } else {
    console.log(chalk.yellow("  ⚠  Sync engine disabled") + chalk.dim(" (SYNC_ENABLED=false)"));
  }

  // 6. Start poller
  if (config.pollEnabled) {
    stepSync("Start poller", startPoller);
  } else {
    console.log(chalk.yellow("  ⚠  Poller disabled") + chalk.dim(" (POLL_ENABLED=false)"));
  }

  // 7. Start server + ready
  Bun.serve({ port: config.port, fetch: app.fetch });
  console.log(
    "\n" +
    chalk.bold.greenBright("  ✔  Ready") +
    chalk.dim("  →  ") +
    chalk.cyan(`http://localhost:${config.port}`) +
    "\n"
  );
}

boot().catch((error) => {
  logger.error("Fatal boot error", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
