# Project: Instantly → HubSpot Sync

This service syncs Instantly cold outreach leads into HubSpot CRM using webhooks and a background poller.

## Key Reference

**Before making any decision about when to sync, upgrade, or delete HubSpot contacts — read:**
`docs/lead-lifecycle.md`

This document is the authoritative source for:
- Which events trigger HubSpot contact creation vs. queuing vs. deletion
- The 3-tier cold/warm/hot system and the ~200 cold contact cap
- Instantly status code meanings (`status` and `lt_interest_status`)
- JustCall call outcome routing (planned)
- All HubSpot properties maintained and their sources

---

## Stack

- **Runtime**: Bun
- **Framework**: Hono (HTTP server)
- **ORM**: Drizzle + PostgreSQL (Railway)
- **Deployment**: Railway

## Project Structure

```
src/
  config.ts                         # Env var config
  index.ts                          # App entrypoint, startup sequence
  db/
    schema.ts                       # Drizzle table definitions
    client.ts                       # DB connection
    migrate.ts                      # Migration runner
  lib/
    errors.ts                       # ApiError class
    logger.ts                       # Structured logger
    rate-limiter.ts                 # Rate limiters for HubSpot + Instantly APIs
  queue/
    processor.ts                    # dequeueJobs / markCompleted / markFailed
  routes/
    health.ts                       # GET /health
    webhooks.ts                     # POST /webhooks/instantly
  services/
    sync-engine.ts                  # Batch dequeue loop (setInterval)
    instantly/
      client.ts                     # Instantly API calls (leads, campaigns, webhooks)
      types.ts                      # Instantly TypeScript types
      poller.ts                     # Poll loop for lead status changes
      webhook-processor.ts          # Dedup + enqueue webhook events
    hubspot/
      client.ts                     # HubSpot API calls (upsert, delete, properties)
      types.ts                      # HubSpot TypeScript types
      properties.ts                 # ensureCustomProperties() — run on boot
      sync.ts                       # buildProperties() + syncToHubSpot()
docs/
  lead-lifecycle.md                 # Lifecycle rules (READ THIS FIRST)
```

## Key Design Decisions

- **Webhooks are primary**: Instantly fires events in real-time. The poller is a fallback.
- **Queue-based sync**: Webhook events → `sync_jobs` table → sync-engine dequeues in batches of 10.
- **Idempotent dedup**: `processed_events` table prevents the same event from being queued twice.
- **Cold pool cap**: Only ~200 cold (email-only) contacts in HubSpot. Others wait in `cold_queue`.
- **Tier system**: Contacts are tagged `cold`/`warm`/`hot`. Warm/hot always take priority.
- **Property migration**: `ensureCustomProperties()` patches existing HubSpot properties on every boot to keep schema in sync.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (Railway format) |
| `HUBSPOT_ACCESS_TOKEN` | HubSpot private app token |
| `INSTANTLY_API_KEY` | Instantly API v2 key |
| `WEBHOOK_BASE_URL` | Public URL of this service (must include https://) |
| `PORT` | HTTP port (default 3000) |
| `SYNC_INTERVAL_MS` | How often sync engine runs in ms (default 5000) |
| `POLL_ENABLED` | Whether to run the Instantly poller (true/false) |
| `POLL_INTERVAL_MS` | How often poller runs in ms |

## Common Commands

```bash
bun run dev          # Start with hot reload
bun run start        # Production start
bun run db:migrate   # Run pending migrations
bun run db:generate  # Generate migration from schema changes
```

## Pending Known Issues

1. **Webhook event type name**: One event type in `WEBHOOK_EVENT_TYPES` may be wrong for v2
   (likely `email_clicked` → `email_link_clicked`). Check startup logs for the error.
2. **Cold pool not yet implemented**: The ~200 cold contact cap and `cold_queue` table are
   designed but not yet built. Currently all events sync to HubSpot without gating.
3. **`instantly_lead_tier` property**: Not yet created in HubSpot or populated by the sync logic.
