function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

function optionalBool(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return value === "true" || value === "1";
}

function optionalInt(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number, got: ${value}`);
  }
  return parsed;
}

export const config = {
  databaseUrl: required("DATABASE_URL"),
  instantlyApiKey: required("INSTANTLY_API_KEY"),
  hubspotAccessToken: required("HUBSPOT_ACCESS_TOKEN"),
  webhookBaseUrl: required("WEBHOOK_BASE_URL"),
  port: optionalInt("PORT", 3000),
  pollIntervalMs: optionalInt("POLL_INTERVAL_MS", 300_000),
  pollEnabled: optionalBool("POLL_ENABLED", true),
  syncIntervalMs: optionalInt("SYNC_INTERVAL_MS", 10_000),
  webhookSecret: optional("WEBHOOK_SECRET", ""),
  autoRegisterWebhooks: optionalBool("AUTO_REGISTER_WEBHOOKS", true),
  coldPoolMax: optionalInt("COLD_POOL_MAX", 200),
} as const;

export type Config = typeof config;
