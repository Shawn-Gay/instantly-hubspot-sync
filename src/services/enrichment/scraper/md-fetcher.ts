import * as cheerio from "cheerio";
import { td, MEETING_PATTERNS, FETCH_TIMEOUT_MS, BROWSER_HEADERS } from "./constants.ts";

export async function fetchPageMarkdown(url: string): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: BROWSER_HEADERS });
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

  // ── JSON-LD schema (extract before removing scripts) ──────────────────────
  const schemaParts: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const jsonStr = $(el).html();
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
        const type = parsed["@type"];
        if (type === "Organization" || type === "LocalBusiness") {
          schemaParts.push(`\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``);
        }
      } catch {
        // ignore invalid JSON
      }
    }
  });

  // ── Meta description ────────────────────────────────────────────────────────
  const metaDescription = $('meta[name="description"]').attr("content") ?? "";

  // ── Mailto/tel links ────────────────────────────────────────────────────────
  const contactLinks: string[] = [];
  $('a[href^="mailto:"], a[href^="tel:"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) contactLinks.push(href);
  });
  const uniqueContactLinks = [...new Set(contactLinks)];

  // ── Booking / meeting links ──────────────────────────────────────────────────
  const meetingLinks: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (href && MEETING_PATTERNS.test(href)) meetingLinks.push(href);
  });
  const uniqueMeetingLinks = [...new Set(meetingLinks)];

  // ── Footer extraction (before removal) ──────────────────────────────────────
  // Footers almost always contain registered business name, address, and phone
  let footerDetails = "";
  const footerText = $("footer").text().replace(/\s+/g, " ").trim();
  if (footerText && /LLC|Inc\.|Corp\.|Ltd\.|©|\d{3}[-.\s]\d{3}/.test(footerText)) {
    footerDetails = footerText.slice(0, 600);
  }

  // ── Regex email catch-all (plain text emails not wrapped in mailto:) ─────────
  const pageText = $("body").text();
  const emailRegex = /\b[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}\b/g;
  const regexEmails = [...new Set([...pageText.matchAll(emailRegex)].map((m) => m[0]!))]
    .filter((e) => !uniqueContactLinks.some((l) => l.includes(e)));

  // ── Clean up DOM ─────────────────────────────────────────────────────────────
  $("script, style, nav, noscript, iframe, svg, footer, img").remove();
  const bodyHtml = $("body").html() ?? "";
  let markdown = td.turndown(bodyHtml);

  // ── Strip images from markdown output ────────────────────────────────────────
  // Remove markdown image syntax: ![alt](src) — covers data URIs and file URLs
  markdown = markdown.replace(/!\[.*?\]\(.*?\)/g, "");
  // Remove any bare base64 data URIs that may appear outside image syntax
  markdown = markdown.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, "");

  // ── Build structured prefix (these appear before body, inside the 14k cap) ──
  const prefix: string[] = [];
  if (metaDescription)          prefix.push(`### Meta Description\n${metaDescription}`);
  if (uniqueContactLinks.length) prefix.push(`### Direct Contacts\n${uniqueContactLinks.join("\n")}`);
  if (uniqueMeetingLinks.length) prefix.push(`### Booking Links\n${uniqueMeetingLinks.join("\n")}`);
  if (regexEmails.length)        prefix.push(`### Additional Emails\n${regexEmails.join("\n")}`);
  if (footerDetails)             prefix.push(`### Footer Details\n${footerDetails}`);
  if (schemaParts.length)        prefix.push(`### Schema Data\n${schemaParts.join("\n\n")}`);
  if (prefix.length) markdown = prefix.join("\n\n") + "\n\n" + markdown;

  return markdown.slice(0, 14_000).trim();
}
