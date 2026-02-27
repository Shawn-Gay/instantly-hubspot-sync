# Project Memory: Instantly → HubSpot Sync

## Key Reference Files
- `docs/lead-lifecycle.md` — authoritative rules for contact lifecycle (always read before modifying sync logic)
- `CLAUDE.md` — project overview, structure, env vars, known issues

## Architecture
- Bun + Hono + Drizzle ORM + PostgreSQL on Railway
- Webhooks are primary (Instantly → our endpoint → sync_jobs queue → sync-engine)
- Poller is fallback (polls Instantly /leads/list API on schedule)
- HubSpot capped at ~1,000 contacts; cold tier capped at ~200

## 3-Tier Contact System
- HOT: replied, unlimited slots, highest call priority
- WARM: opened or clicked, unlimited slots
- COLD: email sent only, max ~200, calling fallback
- Cold contacts waiting for a slot → `cold_queue` table (not yet built)

## Instantly v2 API Notes
- Leads endpoint: POST /leads/list (not GET /leads)
- Webhook field: `target_hook_url` (not `webhook_url`)
- `email` field is nullable in list responses (skip leads with null email)
- `status` = sequence status (1=Active, 3=Completed, -1=Bounced, -2=Unsubscribed)
- `lt_interest_status` = qualification status (1=Interested, -1=Not Interested, -3=Lost, 4=Won)
- One webhook event type name may be wrong for v2 (check logs for event_type validation error)

## HubSpot Notes
- Property group: `instantly_integration`
- `instantly_lead_status` is type:string/fieldType:text (was changed from enumeration — numeric statuses from v2)
- `ensureCustomProperties()` patches existing properties on every boot
- `patchProperty()` exists in hubspot/client.ts

## Pending Implementation
1. Cold pool gating (email_sent → check cold count → HubSpot or cold_queue)
2. Tier graduation logic (cold→warm→hot on open/click/reply)
3. HubSpot contact deletion on bounce/unsubscribe/lost
4. `cold_queue` DB table + `tier` column on `lead_contact_map`
5. `instantly_lead_tier` HubSpot property
6. JustCall webhook handler (/webhooks/justcall)
7. Fix invalid webhook event type name in WEBHOOK_EVENT_TYPES

## DB Schema Tables
- processed_events: dedup store
- sync_jobs: queue with retry logic
- lead_contact_map: email → hubspot_contact_id (+ tier column needed)
- cold_queue: waiting leads (not yet created)
- poll_state: poller cursor per campaign
- sync_errors: failed sync log
