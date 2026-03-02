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
  // ── Company Profile ──
  companyName: z.string().describe("The name of the roofing company."),
  serviceAreas: z.array(z.string()).describe("Specific cities, counties, or regions they explicitly state they serve."),
  servicesOffered: z.array(z.enum(["Residential", "Commercial", "Storm Damage/Hail", "Gutters", "Siding", "Solar", "Repairs", "Other"]))
    .describe("The types of services they offer. Categorize them based on the text."),

  // ── AI Receptionist Selling Angles ──
  emergencyServices: z.boolean().describe("Do they claim to offer 24/7, emergency, or fast-response leak repair?"),
  freeEstimateOffered: z.boolean().describe("Do they offer a 'Free Estimate', 'Free Inspection', or 'Free Quote'?"),
  currentLeadCapture: z.string().describe("How do they currently ask for leads? (e.g., 'Phone number only', 'Basic Contact Form', 'Online Scheduling', 'Chat Widget'). If no chat widget is mentioned, note that."),

  // ── Premium Marketing Selling Angles ──
  financingOffered: z.boolean().describe("Do they explicitly mention offering financing or payment plans?"),
  trustSignals: z.array(z.string()).describe("Mentions of awards, BBB accreditation, 'licensed & insured', years in business, or guarantees/warranties."),
  marketingGaps: z.array(z.string()).describe("Look for weaknesses: No reviews mentioned, no financing offered, outdated copyright year, or lack of a clear guarantee."),

  // ── News & Triggers ──
  stormMentions: z.array(z.string()).describe("Any mentions of recent storms, hail damage, wind damage, or insurance claims assistance."),

  // ── Contact Data ──
  ownerOrLeaders: z.array(z.string()).describe("Names of founders, owners, or family members if it's a family-owned business."),

  // ── Advanced AI Receptionist Angles ──
  bilingualSupportMentioned: z.boolean().describe("Do they explicitly mention speaking Spanish or bilingual support ('Se Habla Español')? false = huge selling point for bilingual AI."),
  responseTimePromise: z.string().describe("Any explicit promise about response/callback time (e.g., 'Same day response', '1-hour call back'). Empty string if none."),
  isHiring: z.boolean().describe("Do they have a 'Careers' or 'Join Our Team' page, or any mention of hiring?"),

  // ── Advanced Premium Marketing Angles ──
  targetMarket: z.enum(["Residential", "Commercial", "Both"]).describe("Who do they primarily target?"),
  manufacturerCertifications: z.array(z.string()).describe("Elite manufacturer certifications like 'GAF Master Elite', 'Owens Corning Platinum Preferred'. Empty array if none."),
  highTicketMaterials: z.array(z.string()).describe("Premium/high-ticket materials they work with: Metal, Slate, Tile, TPO, EPDM, etc. Empty array if none."),
  hasProjectGallery: z.boolean().describe("Do they have a visual gallery or portfolio of past work (photos of completed jobs)?"),
  websiteOutdatedSignals: z.string().describe("Any signals the website is outdated: old copyright year, broken layout mentions, etc. Empty string if none."),
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
              "You are an expert Sales Development Rep selling AI Receptionists and Marketing Services to Roofing Contractors.",
              "Your job is to analyze their website content and extract structured data to help write hyper-personalized cold emails.",
              "",
              "INSTRUCTIONS:",
              "1. ROOFER CONTEXT: Roofers lose $15k+ jobs when they miss phone calls because they are on ladders or driving. Look closely at how they currently capture leads (phone only vs. forms).",
              "2. AI RECEPTIONIST TRIGGERS: If they offer '24/7 Emergency Service' or 'Free Inspections', they have high call volume. Note this.",
              "3. MARKETING TRIGGERS: If they don't mention financing, or lack strong trust signals (BBB, warranties), flag this in 'marketingGaps'.",
              "4. STORM DAMAGE: Insurance claims for hail/wind damage are the most lucrative roofing jobs. Extract any mentions of storms or insurance.",
              "5. If a piece of info is missing, use an empty string or array. DO NOT guess.",
              "6. BILINGUAL GAP: Check if they explicitly mention speaking Spanish ('Se Habla Español'). If not, flag bilingualSupportMentioned as false (huge selling point for bilingual AI).",
              "7. RESPONSE TIME EGO: Extract any promises they make about response times (e.g., 'Same day response', '1-hour call back').",
              "8. LABOR PAIN: Note if they have a 'Careers' page or mention hiring. Busy owners answering phones hate dealing with hiring.",
              "9. PREMIUM TARGETS: Determine their targetMarket ('Residential', 'Commercial', or 'Both'). Also list highTicketMaterials like Metal, Slate, Tile, or TPO. Missing a $50k commercial metal roof lead hurts more than a shingle lead.",
              "10. TRUST & BRAND: Look for elite manufacturer certifications (GAF Master Elite, Owens Corning Platinum) and add them to manufacturerCertifications.",
              "11. MARKETING GAPS II: Check if they actually have a visual gallery/portfolio of past work (hasProjectGallery). Also, note any websiteOutdatedSignals (like an old copyright year or broken text indicators).",
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
              companyName: object.companyName,
              serviceAreasJson: JSON.stringify(object.serviceAreas),
              servicesOfferedJson: JSON.stringify(object.servicesOffered),
              emergencyServices: object.emergencyServices,
              freeEstimateOffered: object.freeEstimateOffered,
              currentLeadCapture: object.currentLeadCapture,
              financingOffered: object.financingOffered,
              trustSignalsJson: JSON.stringify(object.trustSignals),
              marketingGapsJson: JSON.stringify(object.marketingGaps),
              stormMentionsJson: JSON.stringify(object.stormMentions),
              ownerOrLeadersJson: JSON.stringify(object.ownerOrLeaders),
              bilingualSupportMentioned: object.bilingualSupportMentioned,
              responseTimePromise: object.responseTimePromise,
              isHiring: object.isHiring,
              targetMarket: object.targetMarket,
              manufacturerCertificationsJson: JSON.stringify(object.manufacturerCertifications),
              highTicketMaterialsJson: JSON.stringify(object.highTicketMaterials),
              hasProjectGallery: object.hasProjectGallery,
              websiteOutdatedSignals: object.websiteOutdatedSignals,
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
