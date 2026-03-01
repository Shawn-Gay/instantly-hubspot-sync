import chalk from "chalk";
import { Hono } from "hono";
import { config } from "./config.ts";
import { logger } from "./lib/logger.ts";
import { printBanner, step } from "./lib/banner.ts";
import { registerWebhooks } from "./services/instantly/client.ts";
import { webhookRoutes } from "./routes/webhooks.ts";
import { healthRoutes } from "./routes/health.ts";
import { syncRoutes } from "./routes/sync.ts";
import { enrichRoutes } from "./routes/enrich.ts";
import { runMigrations } from "./db/migrate.ts";

const app = new Hono();

// ─── Routes ──────────────────────────────────────────────
app.route("/webhooks", webhookRoutes);
app.route("/health", healthRoutes);
app.route("/sync", syncRoutes);
app.route("/enrich", enrichRoutes);

// Root redirect to health
app.get("/", (c) => c.redirect("/health"));

// ─── Boot Sequence ───────────────────────────────────────
async function boot(): Promise<void> {
  printBanner();

  // 1. Run DB migrations
  await step("Run DB migrations", () => runMigrations());

  // 2. Auto-register Instantly webhooks
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
  } else {
    console.log(chalk.yellow("  ⚠  Webhook registration disabled") + chalk.dim(" (AUTO_REGISTER_WEBHOOKS=false)"));
  }

  // 3. Start server
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
