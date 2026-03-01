import { config } from "../../config.ts";
import { ApiError } from "../../lib/errors.ts";
import { logger } from "../../lib/logger.ts";
import { instantlyLimiter } from "../../lib/rate-limiter.ts";
import type {
  InstantlyLead,
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

/**
 * Find a lead by email address.
 * Uses POST /leads/list with email filter (Instantly v2).
 * Returns the lead, or null if not found.
 */
export async function findLeadByEmail(email: string): Promise<InstantlyLead | null> {
  try {
    const res = await request<{ items?: InstantlyLead[] }>("POST", "/leads/list", { email, limit: 1 });
    return res.items?.[0] ?? null;
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 404) return null;
    throw err;
  }
}

/**
 * Pause a lead by setting its status to 2.
 * Uses PATCH /leads/{id}.
 */
export async function pauseLead(leadId: string): Promise<void> {
  await request("PATCH", `/leads/${leadId}`, { status: 2 });
  logger.info("Lead paused in Instantly", { leadId });
}

/**
 * Fetch all leads across all campaigns, paginated.
 * Uses POST /leads/list (Instantly v2 — GET /leads does not exist).
 */
export async function getAllLeads(limit = 100): Promise<InstantlyLead[]> {
  const all: InstantlyLead[] = [];
  let cursor: string | undefined;

  const pageSize = Math.min(limit, 100);

  while (true) {
    const body: Record<string, unknown> = { limit: pageSize, in_campaign: true };
    if (cursor) body.starting_after = cursor;

    const res = await request<InstantlyLeadListResponse>("POST", "/leads/list", body);
    const items = res.items ?? [];
    all.push(...items);

    if (!res.next_starting_after || items.length < pageSize) break;
    cursor = res.next_starting_after;
  }

  return all;
}

// ─── Webhook Endpoints ───────────────────────────────────

export async function listWebhooks(): Promise<InstantlyWebhookListResponse> {
  return request<InstantlyWebhookListResponse>("GET", "/webhooks");
}

export async function listWebhookEventTypes(): Promise<string[]> {
  const res = await request<string[] | { items: string[] }>("GET", "/webhooks/event-types");
  return Array.isArray(res) ? res : (res?.items ?? []);
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
