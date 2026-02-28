import { config } from "../../config.ts";
import { ApiError } from "../../lib/errors.ts";
import { logger } from "../../lib/logger.ts";
import { hubspotLimiter } from "../../lib/rate-limiter.ts";
import type {
  HubSpotBatchUpsertRequest,
  HubSpotBatchUpsertResponse,
  HubSpotPropertyDefinition,
  HubSpotPropertyGroup,
} from "./types.ts";

const BASE_URL = "https://api.hubapi.com";
const MAX_ATTEMPTS = 4;

/**
 * Executes a fetch against the HubSpot API with rate-limiter gating and
 * automatic retry on 429 (up to MAX_ATTEMPTS total tries, honouring Retry-After).
 */
async function fetchWithRetry(
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await hubspotLimiter.acquire();

    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.hubspotAccessToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status !== 429) return res;

    if (attempt === MAX_ATTEMPTS) {
      const responseBody = await res.text().catch(() => "");
      throw new ApiError("HubSpot rate limit exceeded after retries", 429, responseBody);
    }

    const retryAfterSec = parseInt(res.headers.get("Retry-After") ?? "10", 10);
    logger.warn("HubSpot rate limited, retrying", { attempt, retryAfterSec, path });
    await Bun.sleep(retryAfterSec * 1_000);
  }

  // Unreachable, but satisfies TypeScript
  throw new ApiError("HubSpot request failed", 500, "");
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetchWithRetry(method, path, body);

  if (!res.ok) {
    const responseBody = await res.text().catch(() => "");
    logger.error("HubSpot API error", { status: res.status, path, responseBody });
    throw new ApiError(
      `HubSpot API error: ${res.status} ${res.statusText}`,
      res.status,
      responseBody,
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * Same as request() but returns null for 409 Conflict (already exists).
 */
async function requestIgnoreConflict<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T | null> {
  const res = await fetchWithRetry(method, path, body);

  if (res.status === 409) return null;

  if (!res.ok) {
    const responseBody = await res.text().catch(() => "");
    throw new ApiError(
      `HubSpot API error: ${res.status} ${res.statusText}`,
      res.status,
      responseBody,
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Contact Endpoints ───────────────────────────────────

export async function batchUpsertContacts(
  req: HubSpotBatchUpsertRequest,
): Promise<HubSpotBatchUpsertResponse> {
  return request<HubSpotBatchUpsertResponse>(
    "POST",
    "/crm/v3/objects/contacts/batch/upsert",
    req,
  );
}

export async function deleteContact(contactId: string): Promise<void> {
  await request<void>("DELETE", `/crm/v3/objects/contacts/${contactId}`);
}

/**
 * Permanently deletes a contact (bypasses the recycling bin).
 * Requires GDPR features enabled on the HubSpot account.
 */
export async function gdprDeleteContact(contactId: string): Promise<void> {
  await request<void>("POST", "/crm/v3/objects/contacts/gdpr-delete", {
    objectId: contactId,
  });
}

// ─── Property Endpoints ──────────────────────────────────

export async function createPropertyGroup(
  group: HubSpotPropertyGroup,
): Promise<HubSpotPropertyGroup | null> {
  return requestIgnoreConflict<HubSpotPropertyGroup>(
    "POST",
    "/crm/v3/properties/contacts/groups",
    group,
  );
}

export async function createProperty(
  property: HubSpotPropertyDefinition,
): Promise<HubSpotPropertyDefinition | null> {
  return requestIgnoreConflict<HubSpotPropertyDefinition>(
    "POST",
    "/crm/v3/properties/contacts",
    property,
  );
}

export async function patchProperty(
  name: string,
  updates: Partial<HubSpotPropertyDefinition>,
): Promise<void> {
  await request<HubSpotPropertyDefinition>(
    "PATCH",
    `/crm/v3/properties/contacts/${name}`,
    updates,
  );
}
