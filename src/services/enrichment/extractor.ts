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
  companySummary: z.string().describe("A 2-sentence summary of what this company does"),
  targetAudience: z.string().describe("Who does this company sell to?"),
  contacts: z.array(
    z.object({
      name: z.string().optional(),
      role: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
    }),
  ).describe("Any named contacts found on the website"),
  recentNews: z.array(z.string()).describe("Recent events, news items, or blog post titles mentioned"),
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
              "Analyze the following website content and extract the requested information.",
              "If information is not present, return empty strings or empty arrays.",
              "",
              "Website Content:",
              scrape.markdownContent,
            ].join("\n"),
          });

          await db
            .insert(enrichedLeads)
            .values({
              email: scrape.email,
              companySummary: object.companySummary,
              targetAudience: object.targetAudience,
              contactsJson: JSON.stringify(object.contacts),
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
  logger.info("LLM extraction complete", result);
  return result;
}
