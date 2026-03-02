# Sales Tooling: Future Ideas & Enhancements

Ideas for making the Instantly → HubSpot pipeline smarter, more personalized, and more actionable.
Most of these apply to roofing-focused outreach but the patterns generalize.

---

## 1. Roofer-Specific LLM Schema

Replace the generic `LeadEnrichmentSchema` in `src/services/enrichment/extractor.ts` with a vertical-specific one that hunts for the exact pain points a roofing business has.

**New fields to add:**

| Field | Type | What to extract |
|---|---|---|
| `serviceAreas` | `string[]` | Cities, counties, or regions they explicitly serve |
| `servicesOffered` | `enum[]` | Residential, Commercial, Storm Damage, Gutters, Solar, etc. |
| `emergencyServices` | `boolean` | Claims 24/7 / emergency / fast-response |
| `freeEstimateOffered` | `boolean` | "Free Estimate / Inspection / Quote" |
| `currentLeadCapture` | `string` | Phone only? Basic form? Online scheduling? Chat widget? |
| `financingOffered` | `boolean` | Mentions payment plans or financing |
| `trustSignals` | `string[]` | BBB, licensed & insured, years in business, warranties |
| `marketingGaps` | `string[]` | No reviews, no financing, outdated copyright, no clear guarantee |
| `stormMentions` | `string[]` | Recent storms, hail/wind damage, insurance claim assistance |
| `ownerOrLeaders` | `string[]` | Founder/owner names, especially family-owned businesses |

**Updated LLM prompt angle:** Frame Gemini as an SDR selling AI Receptionists to roofers — not a generic B2B researcher. The prompt should emphasize: roofers lose $15k+ jobs from missed calls, high-value triggers are emergency services and free inspections, and insurance/storm damage is the most lucrative category.

**Email angles unlocked by this schema:**

- **Ladder / Missed Call** → target leads where `currentLeadCapture` is phone-only. Subject: `missed calls in {{serviceAreas[0]}}`
- **Emergency / Storm** → target leads where `emergencyServices = true` or `stormMentions` is non-empty. Lead with call-volume-spike angle.
- **Premium Marketing + AI** → target leads with `marketingGaps` but strong `trustSignals`. Lead with financing gap angle.

---

## 2. Weather Event Trigger Campaign

Hook up a weather / news API to detect major hail or wind storms by metro area. When a storm hits:

1. Query `enrichedLeads` where `serviceAreas` overlaps with the affected city/region.
2. Auto-generate a targeted campaign in Instantly the next morning.
3. Subject line: `"Saw the hail in {{city}} last night — we can help"`

This is a high-urgency, high-relevance touch that competitors won't have. The window to close is 24–72 hours post-storm before the roofer is already overwhelmed.

**Potential integrations:**
- [Tomorrow.io](https://www.tomorrow.io/) or [OpenWeatherMap](https://openweathermap.org/) for weather alerts
- NOAA storm reports API (free)
- PivotalTracker / Google Alerts as a cheaper manual trigger

---

## 3. Family-Owned Business Personalization

When `ownerOrLeaders` contains names (e.g., "Bob and his sons"), swap the email opener:

> _"Love seeing family-owned businesses like yours dominating the [City] area."_

vs. the generic opener for corporate/unknown leads. This dramatically reduces the "mass email" feel for the highest-value segment of the roofing market.

Tag these leads in HubSpot with a `family_owned: true` property so you can filter and sequence them separately.

---

## 4. DB Schema Additions for Roofing Fields

When the roofer schema is ready, extend the `enrichedLeads` table with new JSON columns:

```
serviceAreasJson         text
servicesOfferedJson      text
emergencyServices        boolean
freeEstimateOffered      boolean
currentLeadCapture       text
financingOffered         boolean
trustSignalsJson         text
marketingGapsJson        text
stormMentionsJson        text
ownerOrLeadersJson       text
```

Then run `bun run db:generate` to create the migration.

---

## 5. Segment-Based Campaign Routing

Instead of dumping all enriched leads into one Instantly sequence, route them to different campaigns based on extracted signals:

| Segment | Condition | Campaign |
|---|---|---|
| Emergency Roofer | `emergencyServices = true` | AI Receptionist — Storm Angle |
| Phone-Only Lead Capture | `currentLeadCapture` contains "phone" | AI Receptionist — Missed Call Angle |
| Marketing Gap | `marketingGaps.length > 0` | Premium Marketing Angle |
| Family Owned | `ownerOrLeaders.length > 0` | Warm / Personal Angle |
| High Trust, No Financing | `trustSignals.length > 2 && !financingOffered` | Financing Upsell Angle |

This turns a single enrichment pipeline into a multi-track outreach machine without adding manual work.

---

## 6. HubSpot Lead Scoring from Enrichment Data

Populate a `hs_lead_score` or custom `outreach_score` HubSpot property based on signal strength at sync time:

| Signal | Points |
|---|---|
| `emergencyServices = true` | +20 |
| `freeEstimateOffered = true` | +10 |
| `stormMentions.length > 0` | +25 |
| `currentLeadCapture` = phone only | +15 |
| `ownerOrLeaders.length > 0` | +10 |
| `marketingGaps.length > 2` | +10 |
| `financingOffered = false` | +5 |

Sort your HubSpot views by this score to prioritize follow-up calls to the hottest prospects.

---

## 7. Enrichment Freshness / Re-scrape Cadence

Scraped website content goes stale. Build a re-scrape job that:

1. Queries `rawScrapedWebsites` for records where `scrapedAt < NOW() - interval '90 days'`
2. Re-queues them through the scraper
3. Re-runs LLM extraction if the markdown content changed (diff check)
4. Overwrites `enrichedLeads` with updated values

Trigger this weekly via a cron in the sync engine alongside the existing poller.

---

## 8. Cold Email Preview / Debug Endpoint

Add a `GET /enrich/preview?email=...` route that:
- Fetches the enriched JSON for a lead
- Renders a filled-in cold email template for each applicable angle
- Returns HTML or JSON so you can QA personalization before a campaign goes live

Useful for spot-checking that variable injection (`{{ownerOrLeaders[0]}}`, `{{serviceAreas[0]}}`, etc.) is working correctly before blasting a sequence.

---

## 9. "No Website" Fallback Handling

A non-trivial % of small roofers have no website or a broken one. Currently these just fail silently in the scraper. Instead:

1. Mark them in `rawScrapedWebsites` with `status = 'no_site'`
2. Still create an `enrichedLeads` row with minimal data (company name from Instantly, phone from Instantly)
3. Route them to a separate "no website" sequence — this is actually a strong marketing angle ("We noticed you don't have a website — here's why that's costing you jobs")

---

## 10. Slack / Webhook Alerts for High-Score Leads

When a lead is enriched with a score above a threshold (e.g., 50+), fire a Slack notification or webhook with a summary card:

```
🔥 High-Intent Lead Enriched
Company: Dallas Roofing Pros
Owner: Mike Torres
Score: 75
Signals: Storm damage page, phone-only capture, no financing
Angle: Emergency / Storm
→ [View in HubSpot]
```

So your sales rep can prioritize a manual call instead of waiting for the email sequence to run its course.
