import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config.ts";

export async function runMigrations(): Promise<void> {
  // Separate connection with notices suppressed to avoid "already exists" noise on boot
  const client = postgres(config.databaseUrl, { onnotice: () => {} });
  const db = drizzle(client);
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
  } finally {
    await client.end();
  }
}
