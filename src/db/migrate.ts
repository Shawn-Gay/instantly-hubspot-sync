import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./client.ts";
import { logger } from "../lib/logger.ts";

export async function runMigrations(): Promise<void> {
  logger.info("Running database migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  logger.info("Database migrations completed");
}
