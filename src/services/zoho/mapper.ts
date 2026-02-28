/**
 * Maps Instantly webhook events to Zoho Lead field updates.
 *
 * Lead_Status progression (native Zoho picklist):
 *   Not Contacted → Attempted to Contact → Warm → Replied → Meeting Booked
 *
 * Rules:
 * - Status never downgrades (e.g. a new email_sent won't overwrite "Warm").
 * - Junk Lead (bounce/unsubscribe) is applied unless the lead is already "Meeting Booked".
 * - email_opened is intentionally ignored (unreliable due to Apple MPP and bots).
 */

export type MapResult = {
  /** New value for Lead_Status, subject to priority check. */
  newStatus?: string;
  /** Increment the Emails_Sent counter by 1. */
  incrementEmailsSent?: boolean;
  /** Additional fields to set unconditionally alongside the status change. */
  extraFields?: Record<string, unknown>;
} | null;

/** Priority order for Lead_Status. Higher = further along in the sales funnel. */
export const STATUS_PRIORITY: Record<string, number> = {
  "Not Contacted": 0,
  "Attempted to Contact": 1,
  "Warm": 2,
  "Replied": 3,
  "Meeting Booked": 4,
};

export function mapEventToZohoUpdates(eventType: string): MapResult {
  switch (eventType) {
    case "email_sent":
      return { incrementEmailsSent: true, newStatus: "Attempted to Contact" };

    case "email_link_clicked":
      return { newStatus: "Warm" };

    case "reply_received":
      return { newStatus: "Replied" };

    case "email_bounced":
    case "lead_unsubscribed":
      // Mark opt-out and move to junk — checked against "Meeting Booked" in handler
      return { newStatus: "Junk Lead", extraFields: { Email_Opt_Out: true } };

    case "email_opened":   // ignored — open tracking is not reliable
    case "lead_status_change":
    default:
      return null;
  }
}
