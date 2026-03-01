export interface ZohoContact {
  id: string;
  [key: string]: unknown;
}

export interface ZohoSearchResponse {
  data?: ZohoContact[];
  info?: { count: number; more_records: boolean };
}

export interface ZohoTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

// ─── Upsert Types ─────────────────────────────────────────

/** Shape of each item in the Zoho /upsert response data array (positional, parallel to input). */
export interface ZohoUpsertRecordResult {
  code: string;
  action?: "insert" | "update";
  details?: { id: string; [key: string]: unknown };
  message?: string;
  status?: string;
}

export interface ZohoUpsertResult {
  email: string;
  zohoId: string;
  action: "insert" | "update";
}

export interface ZohoUpsertError {
  email: string;
  code: string;
  message: string;
}
