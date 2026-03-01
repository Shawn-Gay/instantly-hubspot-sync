import { Hono } from "hono";
import { desc } from "drizzle-orm";
import { logger } from "../lib/logger.ts";
import { db } from "../db/client.ts";
import { enrichedLeads } from "../db/schema.ts";
import { runScraperPipeline } from "../services/enrichment/scraper/index.ts";
import { runLLMExtraction } from "../services/enrichment/extractor.ts";

export const enrichRoutes = new Hono();

let scrapeRunning = false;
let extractRunning = false;

/**
 * GET /enrich/leads
 * Returns all enriched leads as JSON.
 */
enrichRoutes.get("/leads", async (c) => {
  const rows = await db
    .select()
    .from(enrichedLeads)
    .orderBy(desc(enrichedLeads.processedAt));

  const leads = rows.map((r) => ({
    ...r,
    contacts: JSON.parse(r.contactsJson ?? "[]"),
    socialLinks: JSON.parse(r.socialLinksJson ?? "[]"),
    bookingLinks: JSON.parse(r.bookingLinksJson ?? "[]"),
    hiringSignals: JSON.parse(r.hiringSignalsJson ?? "[]"),
    recentNews: JSON.parse(r.recentNewsJson ?? "[]"),
  }));

  return c.json(leads);
});

/**
 * POST /enrich/scrape?limit=N
 * Scrapes company websites for unprocessed leads and stores Markdown.
 * Returns 409 if already running.
 */
enrichRoutes.post("/scrape", (c) => {
  if (scrapeRunning) {
    return c.json({ status: "busy", message: "Scrape already in progress" }, 409);
  }

  const limitParam = c.req.query("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 50;

  scrapeRunning = true;
  runScraperPipeline(limit)
    .catch((err) =>
      logger.error("Scraper pipeline failed", { error: err instanceof Error ? err.message : String(err) }),
    )
    .finally(() => {
      scrapeRunning = false;
    });

  return c.json({ status: "started" }, 202);
});

/**
 * POST /enrich/extract?limit=N
 * Runs LLM extraction on scraped Markdown and stores structured data.
 * Returns 409 if already running.
 */
enrichRoutes.post("/extract", (c) => {
  if (extractRunning) {
    return c.json({ status: "busy", message: "Extraction already in progress" }, 409);
  }

  const limitParam = c.req.query("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 20;

  extractRunning = true;
  runLLMExtraction(limit)
    .catch((err) =>
      logger.error("LLM extraction failed", { error: err instanceof Error ? err.message : String(err) }),
    )
    .finally(() => {
      extractRunning = false;
    });

  return c.json({ status: "started" }, 202);
});
