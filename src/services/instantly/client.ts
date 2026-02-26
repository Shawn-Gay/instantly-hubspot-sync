import { config } from "../../config.ts";
import { ApiError } from "../../lib/errors.ts";
import { logger } from "../../lib/logger.ts";
import { instantlyLimiter } from "../../lib/rate-limiter.ts";
import type {
  InstantlyLeadListResponse,
  InstantlyWebhook,
  InstantlyWebhookListResponse,
  InstantlyEventType,
} from "./types.ts";

const BASE_URL = "https://api.instantly.ai/api/v2";

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string>,
): Promise<T> {
  await instantlyLimiter.acquire();

  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.instantlyApiKey}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const responseBody = await res.text().catch(() => "");
    logger.error("Instantly API error", {
      status: res.status,
      path,
      responseBody,
    });
    throw new ApiError(
      `Instantly API error: ${res.status} ${res.statusText}`,
      res.status,
      responseBody,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Lead Endpoints ──────────────────────────────────────

export async function getLeads(
  campaignId: string,
  limit = 100,
  startingAfter?: string,
): Promise<InstantlyLeadListResponse> {
  const body: Record<string, unknown> = {
    campaign_id: campaignId,
    limit,
  };
  if (startingAfter) {
    body.starting_after = startingAfter;
  }
  return request<InstantlyLeadListResponse>("POST", "/leads/list", body);
}

// ─── Campaign Endpoints ──────────────────────────────────

export async function getCampaigns(): Promise<{ items: { id: string; name: string }[] }> {
  return request("GET", "/campaigns", undefined, { limit: "100" });
}

// ─── Webhook Endpoints ───────────────────────────────────

export async function listWebhooks(): Promise<InstantlyWebhookListResponse> {
  return request<InstantlyWebhookListResponse>("GET", "/webhooks");
}

const WEBHOOK_EVENT_TYPES: InstantlyEventType[] = [
  "email_sent",
  "email_opened",
  "email_clicked",
  "email_bounced",
  "email_replied",
  "lead_status_change",
  "email_unsubscribed",
];

export async function registerWebhooks(baseUrl: string): Promise<void> {
  const existing = await listWebhooks();
  const webhookUrl = `${baseUrl}/webhooks/instantly`;

  const existingUrls = new Set(
    existing.items.map((w: InstantlyWebhook) => `${w.event_type}:${w.target_hook_url}`),
  );

  for (const eventType of WEBHOOK_EVENT_TYPES) {
    const key = `${eventType}:${webhookUrl}`;
    if (existingUrls.has(key)) {
      logger.info("Webhook already registered", { eventType, webhookUrl });
      continue;
    }

    logger.info("Registering webhook", { eventType, webhookUrl });
    await request("POST", "/webhooks", {
      event_type: eventType,
      target_hook_url: webhookUrl,
    });
    logger.info("Registered webhook", { eventType, webhookUrl });
  }
}
