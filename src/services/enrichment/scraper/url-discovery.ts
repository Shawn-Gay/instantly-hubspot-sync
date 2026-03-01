import * as cheerio from "cheerio";
import { KEYWORD_PATTERNS, FETCH_TIMEOUT_MS, MAX_PAGES, BROWSER_HEADERS } from "./constants.ts";

/** Normalize a raw website URL to a clean base (https, no trailing slash) */
export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/** Derive a human-readable label from a URL path */
export function getLabelForUrl(url: string, base: string): string {
  try {
    const path = new URL(url).pathname.replace(/^\/|\/$/g, "");
    if (!path) return "Homepage";
    const segment = path.split("/").pop() ?? path;
    return segment.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return url === base ? "Homepage" : url;
  }
}

/** Try to extract relevant page URLs from /sitemap.xml */
export async function getUrlsFromSitemap(base: string): Promise<string[]> {
  try {
    const res = await fetch(`${base}/sitemap.xml`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: BROWSER_HEADERS,
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const baseUrl = new URL(base);
    const matches = [...xml.matchAll(/<loc>(.*?)<\/loc>/gi)];
    return matches
      .map((m) => m[1]?.trim() ?? "")
      .filter((url) => {
        try {
          const parsed = new URL(url);
          return parsed.hostname === baseUrl.hostname && KEYWORD_PATTERNS.test(url);
        } catch {
          return false;
        }
      })
      .slice(0, MAX_PAGES - 1); // Leave room for homepage
  } catch {
    return [];
  }
}

/** Fetch the homepage and extract internal links that match keyword patterns */
export async function discoverUrlsFromHomepage(base: string): Promise<string[]> {
  try {
    const res = await fetch(base, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: BROWSER_HEADERS,
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const baseUrl = new URL(base);
    const links = new Set<string>();

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      try {
        const parsed = new URL(href, base);
        if (parsed.hostname !== baseUrl.hostname) return;
        const normalized = `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "");
        if (normalized && normalized !== base && KEYWORD_PATTERNS.test(normalized)) {
          links.add(normalized);
        }
      } catch {
        // invalid URL — skip
      }
    });

    return [...links].slice(0, MAX_PAGES - 1);
  } catch {
    return [];
  }
}
