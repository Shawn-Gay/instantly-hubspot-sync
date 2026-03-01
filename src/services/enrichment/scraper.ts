import * as cheerio from "cheerio";
import TurndownService from "turndown";
import { eq, isNotNull } from "drizzle-orm";
import { db } from "../../db/client.ts";
import { syncedLeads, rawScrapedWebsites } from "../../db/schema.ts";
import { logger } from "../../lib/logger.ts";

const td = new TurndownService({ headingStyle: "atx", bulletListMarker: "-" });

const SUBPAGES = ["", "/about", "/contact", "/blog"];
const FETCH_TIMEOUT_MS = 10_000;

export interface ScraperResult {
  total: number;
  scraped: number;
  skipped: number;
  failed: number;
}

export async function runScraperPipeline(limit = 50): Promise<ScraperResult> {
  // Get emails already successfully scraped
  const doneRows = await db
    .select({ email: rawScrapedWebsites.email })
    .from(rawScrapedWebsites)
    .where(eq(rawScrapedWebsites.status, "done"));
  const doneEmails = new Set(doneRows.map((r) => r.email));

  // Get leads that have a website, up to limit
  const candidates = await db
    .select({ email: syncedLeads.email, website: syncedLeads.website })
    .from(syncedLeads)
    .where(isNotNull(syncedLeads.website))
    .limit(limit);

  const toScrape = candidates.filter((l) => !doneEmails.has(l.email));

  logger.info("Scraper pipeline starting", {
    candidates: candidates.length,
    toScrape: toScrape.length,
    alreadyDone: candidates.length - toScrape.length,
  });

  let scraped = 0;
  let failed = 0;

  for (const lead of toScrape) {
    try {
      const markdown = await scrapeWebsite(lead.website!);
      await db
        .insert(rawScrapedWebsites)
        .values({ email: lead.email, markdownContent: markdown, status: "done" })
        .onConflictDoUpdate({
          target: rawScrapedWebsites.email,
          set: { markdownContent: markdown, status: "done", error: null, scrapedAt: new Date() },
        });
      logger.debug("Scraped website", { email: lead.email, website: lead.website });
      scraped++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn("Failed to scrape website", { email: lead.email, website: lead.website, error: message });
      await db
        .insert(rawScrapedWebsites)
        .values({ email: lead.email, status: "failed", error: message })
        .onConflictDoUpdate({
          target: rawScrapedWebsites.email,
          set: { status: "failed", error: message, scrapedAt: new Date() },
        });
      failed++;
    }
  }

  const result: ScraperResult = {
    total: candidates.length,
    scraped,
    skipped: candidates.length - toScrape.length,
    failed,
  };
  logger.info("Scraper pipeline complete", result);
  return result;
}

async function scrapeWebsite(rawUrl: string): Promise<string> {
  const base = normalizeBaseUrl(rawUrl);
  const sections: string[] = [];

  const results = await Promise.allSettled(
    SUBPAGES.map((path) => fetchPageMarkdown(base, path)),
  );

  const labels = ["Homepage", "About", "Contact", "Blog"];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled" && result.value) {
      sections.push(`# ${labels[i]}\n\n${result.value}`);
    }
  }

  if (sections.length === 0) {
    throw new Error("No pages could be fetched");
  }

  return sections.join("\n\n---\n\n");
}

async function fetchPageMarkdown(base: string, path: string): Promise<string | null> {
  const url = `${base}${path}`;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return null;

  const html = await res.text();
  return htmlToMarkdown(html);
}

function htmlToMarkdown(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, nav, footer, noscript, iframe, svg").remove();
  const bodyHtml = $("body").html() ?? "";
  const markdown = td.turndown(bodyHtml);
  // Trim to avoid token bloat — cap at ~8000 chars per page
  return markdown.slice(0, 8_000).trim();
}

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}
