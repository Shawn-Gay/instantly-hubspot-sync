// ─── Webhook Event Types ─────────────────────────────────

export type InstantlyEventType =
  | "email_sent"
  | "email_opened"
  | "email_link_clicked"
  | "email_bounced"
  | "reply_received"
  | "lead_unsubscribed";

export interface InstantlyWebhookPayload {
  event_type: InstantlyEventType;
  timestamp?: string;
  data: {
    email?: string;
    lead_email?: string;
    campaign_id?: string;
    campaign_name?: string;
    status?: string | number;
    lt_interest_status?: number;
    open_count?: number;
    click_count?: number;
    reply_text?: string;
    subject?: string;
    [key: string]: unknown;
  };
}

// ─── API Response Types ──────────────────────────────────

export interface InstantlyLead {
  id: string;
  email?: string; // v2 API omits email from list responses
  campaign_id?: string; // v2 uses list_id instead
  list_id?: string;
  campaign_name?: string;
  status: number | string;
  lt_interest_status?: number;
  email_open_count?: number;
  email_click_count?: number;
  email_reply_count?: number;
  timestamp_created?: string;
  timestamp_updated?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface InstantlyLeadListResponse {
  items: InstantlyLead[];
  next_starting_after?: string;
}

export interface InstantlyCampaign {
  id: string;
  name: string;
}

export interface InstantlyWebhook {
  id: string;
  event_type: string;
  target_hook_url: string;
}

export interface InstantlyWebhookListResponse {
  items: InstantlyWebhook[];
}
