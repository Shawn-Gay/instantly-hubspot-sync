# Lead Lifecycle

This document defines the authoritative rules for how leads move through the system —
from Instantly cold outreach into HubSpot CRM and eventually into long-term storage or deletion.

---

## HubSpot Contact Tiers

HubSpot is capped at ~1,000 contacts. We use a 3-tier system to keep it focused on actionable leads.

| Tier | Trigger | HubSpot Cap | Calling Priority |
|------|---------|-------------|-----------------|
| **HOT** | Replied to an email | Unlimited (within 1,000 total) | Highest |
| **WARM** | Opened or clicked an email | Unlimited (within 1,000 total) | High |
| **COLD** | Email sent only, no engagement | Max ~200 | Fallback only |

The cold pool exists so there are always contacts to call when there are no warm/hot leads.
When warm/hot leads exist, cold leads are deprioritized for calling but remain in HubSpot.

---

## Instantly Status Code Reference

### `status` — Sequence/Campaign Status
Sent on `lead_status_change` webhook events and returned by the List Leads API.

| Value | Meaning |
|-------|---------|
| `1` | Active (in sequence) |
| `2` | Paused |
| `3` | Completed (finished sequence) |
| `-1` | Bounced |
| `-2` | Unsubscribed |
| `-3` | Skipped |

### `lt_interest_status` — Interest/Qualification Status
Set manually in Instantly after a human reviews the lead. This is the primary signal
for whether a lead is qualified.

| Value | Meaning | Action |
|-------|---------|--------|
| `1` | Interested | Keep in HubSpot, high priority |
| `2` | Meeting Booked | Keep in HubSpot, top priority |
| `3` | Meeting Completed | Keep in HubSpot |
| `4` | Won | Archive to Postgres, remove from HubSpot |
| `0` | Out of Office | Keep in HubSpot, follow up later |
| `-1` | Not Interested | Delete from HubSpot |
| `-2` | Wrong Person | Delete from HubSpot |
| `-3` | Lost | Delete from HubSpot |
| `-4` | No Show | Keep in HubSpot, retry call |

---

## Entry into HubSpot (Gating Logic)

Not every Instantly event creates a HubSpot contact. Entry is gated by engagement.

```
Instantly webhook fires
        │
        ├─ email_sent
        │     Cold pool < 200?  → Upsert to HubSpot (tier: cold)
        │     Cold pool ≥ 200?  → Add to cold_queue table (hold in Postgres)
        │
        ├─ email_opened
        │     → Upsert to HubSpot (tier: warm)
        │     Was cold?  → Promotes a queued lead from cold_queue to fill slot
        │
        ├─ email_clicked / email_link_clicked
        │     → Upsert to HubSpot (tier: warm)
        │     Was cold?  → Promotes a queued lead from cold_queue to fill slot
        │
        ├─ email_replied
        │     → Upsert to HubSpot (tier: hot)
        │     Was cold?  → Promotes a queued lead from cold_queue to fill slot
        │
        ├─ email_bounced
        │     → Delete from HubSpot (if present)
        │     Was cold?  → Promotes a queued lead from cold_queue to fill slot
        │
        ├─ email_unsubscribed
        │     → Delete from HubSpot (if present)
        │     Was cold?  → Promotes a queued lead from cold_queue to fill slot
        │
        └─ lead_status_change
              status = -1 (Bounced)         → Delete from HubSpot
              status = -2 (Unsubscribed)    → Delete from HubSpot
              lt_interest_status = -1/-2/-3 → Delete from HubSpot (not interested/wrong person/lost)
              lt_interest_status = 4 (Won)  → Archive to Postgres, delete from HubSpot
              All others                    → Update HubSpot properties, no tier change
```

---

## Tier Graduation (Cold → Warm → Hot)

A contact can only move **up** in tier, never down.

```
cold  ──(email_opened or email_clicked)──→  warm
cold  ──(email_replied)──────────────────→  hot
warm  ──(email_replied)──────────────────→  hot
```

When a cold contact graduates to warm or hot:
1. Their tier is updated in HubSpot (property: `instantly_lead_tier`)
2. Their slot in the cold pool is freed
3. The oldest lead in `cold_queue` is promoted: synced to HubSpot as tier: cold

---

## Deletion from HubSpot

A contact is deleted (hard-deleted via HubSpot API) when:

- Email bounced (`email_bounced` event OR `status = -1`)
- Email unsubscribed (`email_unsubscribed` event OR `status = -2`)
- Interest status = Not Interested (`lt_interest_status = -1`)
- Interest status = Wrong Person (`lt_interest_status = -2`)
- Interest status = Lost (`lt_interest_status = -3`)
- Interest status = Won (`lt_interest_status = 4`) — also archived to Postgres first

Deletion uses the `hubspot_contact_id` from the `lead_contact_map` table.
After deletion, the row is removed from `lead_contact_map` and, if the contact was cold,
the next entry in `cold_queue` is promoted.

---

## JustCall Integration (Planned)

JustCall is used for outbound calls to HubSpot contacts. Call outcomes are received
via JustCall webhooks and route to our `/webhooks/justcall` endpoint.

| Call Outcome | Action |
|-------------|--------|
| Interested / Meeting booked | Keep in HubSpot, update `instantly_lead_status` |
| No answer / Voicemail | Keep in HubSpot, no change |
| Not interested | Delete from HubSpot, add to Postgres archive |
| Wrong number | Delete from HubSpot |
| Closed / Won | Archive to Postgres, delete from HubSpot |

---

## HubSpot Properties Maintained

All properties live in the `instantly_integration` property group.

| Property Name | Type | Source | Description |
|--------------|------|--------|-------------|
| `instantly_campaign_name` | string | webhook/poll | Name of the Instantly campaign |
| `instantly_campaign_id` | string | webhook/poll | UUID of the Instantly campaign |
| `instantly_lead_status` | string | webhook/poll | Sequence status (Active, Completed, Bounced, etc.) |
| `instantly_lead_tier` | string | system | `cold`, `warm`, or `hot` |
| `instantly_last_email_sent_date` | datetime | `email_sent` webhook | Timestamp of last email sent |
| `instantly_email_open_count` | number | `email_opened` webhook | Total opens tracked |
| `instantly_email_click_count` | number | `email_clicked` webhook | Total clicks tracked |
| `instantly_reply_received` | boolean | `email_replied` webhook | Whether lead has replied |
| `instantly_reply_snippet` | string | `email_replied` webhook | First 500 chars of reply |
| `instantly_email_bounced` | boolean | `email_bounced` webhook | Whether email bounced |
| `instantly_unsubscribed` | boolean | `email_unsubscribed` webhook | Whether lead unsubscribed |
| `instantly_last_activity_date` | datetime | all events | Most recent event timestamp |

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `processed_events` | Dedup store — prevents the same event from creating multiple jobs |
| `sync_jobs` | Queue of pending HubSpot sync operations (with retry logic) |
| `lead_contact_map` | Maps Instantly email → HubSpot contact ID + tier |
| `cold_queue` | Leads waiting for a cold pool slot to open up |
| `poll_state` | Cursor state for the Instantly poller per campaign |
| `sync_errors` | Log of failed sync attempts with request/response payloads |

---

## Poller vs. Webhooks

**Webhooks** (primary path): Instantly fires events in real-time for every email action.
These are the authoritative source of truth for engagement events.

**Poller** (fallback/supplemental): Polls the Instantly `POST /leads/list` API on a schedule.
Used to catch leads that may have been missed by webhooks (e.g., during downtime).
The v2 API returns `email` as a nullable field — leads without email are skipped.
The poller can use `filter: "FILTER_VAL_CONTACTED"` to populate cold pool,
or `filter: "FILTER_VAL_REPLIED"` / `filter: "FILTER_VAL_OPENED_NO_REPLY"` for warm/hot tiers.

---

## Webhook Event Types (Instantly v2)

Valid event types registered with Instantly:

- `email_sent`
- `email_opened`
- `email_replied`
- `email_bounced`
- `email_unsubscribed`
- `lead_status_change`

> Note: `email_clicked` may be named `email_link_clicked` in Instantly v2 — verify against
> webhook registration errors on startup. Check logs for `body/event_type must be equal to
> one of the allowed values` to identify the correct name.
