import { config } from "../../config.ts";
import { ApiError } from "../../lib/errors.ts";
import { logger } from "../../lib/logger.ts";
import { instantlyLimiter } from "../../lib/rate-limiter.ts";
import type {
  InstantlyLeadListResponse,
  InstantlyWebhook,
  InstantlyWebhookListResponse,
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

export async function listWebhookEventTypes(): Promise<string[]> {
  const res = await request<unknown>("GET", "/webhooks/event-types");
  if (Array.isArray(res)) return res as string[];
  if (res && typeof res === "object" && "items" in res && Array.isArray((res as { items: unknown }).items)) {
    return (res as { items: string[] }).items;
  }
  return [];
}

export async function registerWebhooks(baseUrl: string): Promise<{ registered: number; skipped: number; failed: number }> {
  const [existing, eventTypes] = await Promise.all([
    listWebhooks(),
    listWebhookEventTypes(),
  ]);
  const webhookUrl = `${baseUrl}/webhooks/instantly`;

  const existingUrls = new Set(
    existing.items.map((w: InstantlyWebhook) => `${w.event_type}:${w.target_hook_url}`),
  );

  let registered = 0;
  let skipped = 0;
  let failed = 0;

  for (const eventType of eventTypes) {
    const key = `${eventType}:${webhookUrl}`;
    if (existingUrls.has(key)) {
      skipped++;
      continue;
    }

    try {
      await request("POST", "/webhooks", {
        event_type: eventType,
        target_hook_url: webhookUrl,
      });
      logger.info("Registered webhook", { eventType });
      registered++;
    } catch (err) {
      logger.warn("Failed to register webhook", {
        eventType,
        error: err instanceof Error ? err.message : String(err),
      });
      failed++;
    }
  }

  return { registered, skipped, failed };
}
