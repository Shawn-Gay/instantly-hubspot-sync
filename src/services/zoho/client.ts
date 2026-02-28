import { config } from "../../config.ts";
import { ApiError } from "../../lib/errors.ts";
import { logger } from "../../lib/logger.ts";
import { zohoLimiter } from "../../lib/rate-limiter.ts";
import type { ZohoContact, ZohoSearchResponse, ZohoTokenResponse } from "./types.ts";

// ─── OAuth2 Token Cache ──────────────────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.zohoClientId,
    client_secret: config.zohoClientSecret,
    refresh_token: config.zohoRefreshToken,
  });

  const res = await fetch(`${config.zohoAccountsUrl}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(`Zoho token refresh failed: ${res.status}`, res.status, body);
  }

  const data = (await res.json()) as ZohoTokenResponse & { error?: string };
  console.log("Zoho token response:", JSON.stringify(data));

  if (data.error || !data.access_token) {
    throw new ApiError(`Zoho token refresh error: ${data.error ?? "no access_token"}`, 401, JSON.stringify(data));
  }

  cachedToken = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1_000,
  };

  logger.debug("Zoho access token refreshed");
  return cachedToken.token;
}

// ─── Request Helper ──────────────────────────────────────

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string>,
): Promise<T> {
  await zohoLimiter.acquire();
  const token = await getAccessToken();

  const url = new URL(`${config.zohoApiBaseUrl}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const responseBody = await res.text().catch(() => "");
    logger.error("Zoho API error", { status: res.status, path, responseBody });
    throw new ApiError(`Zoho API error: ${res.status} ${res.statusText}`, res.status, responseBody);
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

// ─── Lead Endpoints ───────────────────────────────────────

/**
 * Find a Zoho Lead by email address.
 * Returns the first match, or null if not found.
 */
export async function findLeadByEmail(email: string): Promise<ZohoContact | null> {
  try {
    const res = await request<ZohoSearchResponse>("GET", "/Leads/search", undefined, {
      criteria: `(Email:equals:${email})`,
      fields: "id,Email",
    });
    return res?.data?.[0] ?? null;
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 204) return null;
    throw err;
  }
}

/**
 * Fetch one or more field values from a Zoho Lead in a single GET.
 * Returns a record keyed by field name.
 */
export async function getLeadFields(id: string, fieldNames: string[]): Promise<Record<string, unknown>> {
  const res = await request<{ data?: Array<Record<string, unknown>> }>(
    "GET",
    `/Leads/${id}`,
    undefined,
    { fields: fieldNames.join(",") },
  );
  return res?.data?.[0] ?? {};
}

/**
 * Update one or more fields on a Zoho Lead.
 */
export async function updateLead(id: string, fields: Record<string, unknown>): Promise<void> {
  await request("PUT", "/Leads", { data: [{ id, ...fields }] });
  logger.debug("Zoho lead updated", { id, fields: Object.keys(fields) });
}

/**
 * Create a new Zoho Lead. Returns the new lead's ID.
 */
export async function createLead(fields: Record<string, unknown>): Promise<string> {
  const res = await request<{ data: Array<{ details: { id: string }; code: string }> }>(
    "POST",
    "/Leads",
    { data: [fields] },
  );
  const record = res.data?.[0];
  if (!record || record.code !== "SUCCESS") {
    throw new Error(`Zoho createLead failed: ${JSON.stringify(record)}`);
  }
  return record.details.id;
}
