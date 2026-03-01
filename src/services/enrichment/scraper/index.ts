import { eq, isNotNull } from "drizzle-orm";
import { db } from "../../../db/client.ts";
import { syncedLeads, rawScrapedWebsites } from "../../../db/schema.ts";
import { logger } from "../../../lib/logger.ts";
import { FALLBACK_PATHS, MAX_PAGES, PAGE_DELAY_MS } from "./constants.ts";
import { normalizeBaseUrl, getLabelForUrl, getUrlsFromSitemap, discoverUrlsFromHomepage } from "./url-discovery.ts";
import { fetchPageMarkdown } from "./md-fetcher.ts";

// Testing mode: when true, only scrapes the homepage + 1 subpage per lead
// so you can validate the full pipeline without hammering every site.
const isTesting = false;
const MAX_TEST_PAGES = 2;

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
  logger.info("Scraper pipeline complete", {...result});
  return result;
}

async function scrapeWebsite(rawUrl: string): Promise<string> {
  const base = normalizeBaseUrl(rawUrl);

  // Strategy 1: Parse sitemap.xml for the real page URLs
  let urlsToFetch = await getUrlsFromSitemap(base);

  // Strategy 2: Discover internal links from the homepage nav/footer
  if (urlsToFetch.length === 0) {
    urlsToFetch = await discoverUrlsFromHomepage(base);
  }

  // Strategy 3: Fall back to guessing known paths
  if (urlsToFetch.length === 0) {
    urlsToFetch = FALLBACK_PATHS.map((p) => `${base}${p.path}`);
  }

  // Homepage is always first; deduplicate
  const pageLimit = isTesting ? MAX_TEST_PAGES : MAX_PAGES;
  const allUrls = [base, ...urlsToFetch.filter((u) => u !== base)].slice(0, pageLimit);

  const sections: string[] = [];
  const visited = new Set<string>();

  for (const url of allUrls) {
    if (visited.has(url)) continue;
    visited.add(url);

    const label = getLabelForUrl(url, base);
    const content = await fetchPageMarkdown(url);
    if (content) {
      sections.push(`# ${label}\n\n${content}`);
    }
    await new Promise<void>((r) => setTimeout(r, PAGE_DELAY_MS));
  }

  if (sections.length === 0) {
    throw new Error("No pages could be fetched");
  }

  return sections.join("\n\n---\n\n");
}
