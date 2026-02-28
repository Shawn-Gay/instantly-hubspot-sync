// ─── Webhook Event Types ─────────────────────────────────

export type InstantlyEventType =
  | "email_sent"
  | "email_opened"
  | "email_link_clicked"
  | "email_bounced"
  | "reply_received"
  | "lead_unsubscribed"
  | "lead_status_change";

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

// ─── API Types ────────────────────────────────────────────

export interface InstantlyLead {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  phone?: string;
  website?: string;
  status: number | string;
  [key: string]: unknown;
}

export interface InstantlyLeadListResponse {
  items: InstantlyLead[];
  next_starting_after?: string;
}

export interface InstantlyWebhook {
  id: string;
  event_type: string;
  target_hook_url: string;
}

export interface InstantlyWebhookListResponse {
  items: InstantlyWebhook[];
}
