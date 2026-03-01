import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.ts";
import { rawScrapedWebsites, enrichedLeads } from "../../db/schema.ts";
import { logger } from "../../lib/logger.ts";

const BATCH_SIZE = 10;
const MODEL = "gemini-2.5-flash-lite";

const LeadEnrichmentSchema = z.object({
  // ── Core Company Identity ──
  companySummary: z.string().describe("A concise 2-sentence summary of the company's core offering."),
  valueProposition: z.string().describe("The main problem they solve or the primary benefit they provide to their customers."),
  businessType: z.enum(["B2B", "B2C", "E-commerce", "SaaS", "Agency", "Local Business", "Other"])
    .describe("The primary business model."),
  targetAudience: z.string().describe("The specific industries, job roles, or demographics they sell to."),

  // ── Sales Intelligence / Buying Signals ──
  primaryCTA: z.string().describe("The main Call to Action on the site (e.g., 'Book a Demo', 'Get a Quote', 'Start Free Trial')."),
  hiringSignals: z.array(z.string()).describe("Mentions of open job roles, 'we are hiring' sections, or specific careers listed."),
  recentNews: z.array(z.string()).describe("Recent events, product updates, or blog post titles."),

  // ── Contact & Outreach Data ──
  contacts: z.array(
    z.object({
      name: z.string().optional(),
      role: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      linkedIn: z.string().optional(),
    }),
  ).describe("Named individuals, leadership team members, or specific departmental contacts."),
  socialLinks: z.array(z.string()).describe("Links to the company's social media profiles (LinkedIn, Twitter, YouTube, etc.)."),
  bookingLinks: z.array(z.string()).describe("Any calendar or scheduling URLs (e.g., Calendly, HubSpot, Acuity) found in the text."),
});

export interface ExtractorResult {
  total: number;
  extracted: number;
  failed: number;
}

export async function runLLMExtraction(limit = 20): Promise<ExtractorResult> {
  // Get emails already enriched
  const processedRows = await db
    .select({ email: enrichedLeads.email })
    .from(enrichedLeads);
  const processedEmails = new Set(processedRows.map((r) => r.email));

  // Get done scrapes not yet enriched
  const allDone = await db
    .select()
    .from(rawScrapedWebsites)
    .where(eq(rawScrapedWebsites.status, "done"))
    .limit(limit);

  const toProcess = allDone.filter((s) => !processedEmails.has(s.email) && s.markdownContent);

  logger.info("LLM extraction starting", {
    total: allDone.length,
    toProcess: toProcess.length,
    alreadyEnriched: allDone.length - toProcess.length,
  });

  let extracted = 0;
  let failed = 0;

  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (scrape) => {
        try {
          const { object } = await generateObject({
            model: google(MODEL),
            schema: LeadEnrichmentSchema,
            prompt: [
              "You are an expert B2B Sales Researcher. Your job is to analyze the following website content and extract structured intelligence for our sales team.",
              "",
              "INSTRUCTIONS:",
              "1. Read the 'Prefix' sections at the top (Meta Description, Booking Links, Direct Contacts) carefully. These contain highly accurate technical data.",
              "2. Infer the 'targetAudience' and 'businessType' based on the language they use (e.g., enterprise jargon means B2B SaaS, shopping carts mean E-commerce).",
              "3. Look for 'Hiring Signals'. If a company is hiring, it means they have budget and are growing—this is a critical sales trigger.",
              "4. If a piece of information is entirely missing, return an empty string or empty array. DO NOT hallucinate or guess data.",
              "",
              "===================",
              "WEBSITE CONTENT:",
              scrape.markdownContent,
            ].join("\n"),
          });

          await db
            .insert(enrichedLeads)
            .values({
              email: scrape.email,
              companySummary: object.companySummary,
              valueProposition: object.valueProposition,
              businessType: object.businessType,
              targetAudience: object.targetAudience,
              primaryCta: object.primaryCTA,
              contactsJson: JSON.stringify(object.contacts),
              socialLinksJson: JSON.stringify(object.socialLinks),
              bookingLinksJson: JSON.stringify(object.bookingLinks),
              hiringSignalsJson: JSON.stringify(object.hiringSignals),
              recentNewsJson: JSON.stringify(object.recentNews),
            })
            .onConflictDoNothing();

          logger.debug("Enriched lead", { email: scrape.email });
          extracted++;
        } catch (err) {
          logger.error("LLM extraction failed for lead", {
            email: scrape.email,
            error: err instanceof Error ? err.message : String(err),
          });
          failed++;
        }
      }),
    );
  }

  const result: ExtractorResult = { total: toProcess.length, extracted, failed };
  logger.info("LLM extraction complete", {...result});
  return result;
}
