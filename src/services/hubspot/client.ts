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

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  await hubspotLimiter.acquire();

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.hubspotAccessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const responseBody = await res.text().catch(() => "");
    logger.error("HubSpot API error", {
      status: res.status,
      path,
      responseBody,
    });
    throw new ApiError(
      `HubSpot API error: ${res.status} ${res.statusText}`,
      res.status,
      responseBody,
    );
  }

  // Some endpoints return 204 No Content
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
  await hubspotLimiter.acquire();

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.hubspotAccessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

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
