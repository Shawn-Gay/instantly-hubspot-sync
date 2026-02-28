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
  // Server
  port: optionalInt("PORT", 3000),

  // Database
  databaseUrl: required("DATABASE_URL"),

  // Instantly
  instantlyApiKey: required("INSTANTLY_API_KEY"),
  webhookBaseUrl: required("WEBHOOK_BASE_URL"),
  webhookSecret: optional("WEBHOOK_SECRET", ""),
  autoRegisterWebhooks: optionalBool("AUTO_REGISTER_WEBHOOKS", true),

  // Zoho CRM
  zohoClientId: required("ZOHO_CLIENT_ID"),
  zohoClientSecret: required("ZOHO_CLIENT_SECRET"),
  zohoRefreshToken: required("ZOHO_REFRESH_TOKEN"),
  zohoAccountsUrl: optional("ZOHO_ACCOUNTS_URL", "https://accounts.zoho.com"),
  zohoApiBaseUrl: optional("ZOHO_API_BASE_URL", "https://www.zohoapis.com/crm/v2"),
  zohoEmailsSentField: required("ZOHO_EMAILS_SENT_FIELD"),

  // JustCall
  justcallMeetingBookedOutcome: optional("JUSTCALL_MEETING_BOOKED_OUTCOME", "Meeting Booked"),
} as const;

export type Config = typeof config;
