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
  primaryCity: z.string().describe("The single main city or metro area they operate in, e.g., 'Pensacola'. Do NOT list multiple cities."),
  serviceAreas: z.array(z.string()).describe("Specific cities, counties, or regions they explicitly state they serve."),
  servicesOffered: z.array(z.enum(["Residential", "Commercial", "Storm Damage/Hail", "Gutters", "Siding", "Solar", "Repairs", "Other"]))
    .describe("The types of services they offer. Categorize them based on the text."),
  yearsInBusiness: z.number().optional().describe("Extract the number of years in business if explicitly mentioned. Omit if not found."),

  // ── AI Receptionist Selling Angles ──
  emergencyServices: z.boolean().describe("Do they claim to offer 24/7, emergency, or fast-response leak repair?"),
  freeEstimateOffered: z.boolean().describe("Do they offer a 'Free Estimate', 'Free Inspection', or 'Free Quote'?"),
  currentLeadCapture: z.string().describe("How do they currently ask for leads? (e.g., 'Phone number only', 'Basic Contact Form', 'Online Scheduling', 'Chat Widget'). If no chat widget is mentioned, note that."),
  hasWebChat: z.boolean().describe("Do they currently have a live chat or chat widget on their site? true only if explicitly present."),
  hasOnlineBooking: z.boolean().describe("Can a user book an appointment directly on a calendar/scheduler on the site? true only if explicitly present."),

  // ── Premium Marketing Selling Angles ──
  financingOffered: z.boolean().describe("Do they explicitly mention offering financing or payment plans?"),
  trustSignals: z.array(z.string()).describe("Mentions of awards, BBB accreditation, 'licensed & insured', years in business, or guarantees/warranties."),
  marketingGaps: z.array(z.string()).describe("Look for weaknesses: No reviews mentioned, no financing offered, outdated copyright year, or lack of a clear guarantee."),

  // ── News & Triggers ──
  stormMentions: z.array(z.string()).describe("Mentions of recent storms or hail damage. Summarize each in 3-5 words only (e.g., 'Recent hail storm damage'). Do NOT copy full sentences."),

  // ── Contact Data ──
  ownerOrLeaders: z.array(z.string()).describe("Names of founders, owners, or family members if it's a family-owned business."),

  // ── Advanced AI Receptionist Angles ──
  bilingualSupportMentioned: z.boolean().describe("Do they explicitly mention speaking Spanish or bilingual support ('Se Habla Español')? false = huge selling point for bilingual AI."),
  responseTimePromise: z.string().describe("Extract ONLY the specific time promise (e.g., '24 hours', 'Same day'). Ignore customer reviews mentioning time. Empty string if none."),
  isHiring: z.boolean().describe("Do they have a 'Careers' or 'Join Our Team' page, or any mention of hiring?"),

  // ── Advanced Premium Marketing Angles ──
  targetMarket: z.enum(["Residential", "Commercial", "Both"]).describe("Who do they primarily target?"),
  manufacturerCertifications: z.array(z.string()).describe("Elite manufacturer certifications like 'GAF Master Elite', 'Owens Corning Platinum Preferred'. Empty array if none."),
  highTicketMaterials: z.array(z.string()).describe("Premium/high-ticket materials they work with: Metal, Slate, Tile, TPO, EPDM, etc. Empty array if none."),
  hasProjectGallery: z.boolean().describe("Do they have a visual gallery or portfolio of past work (photos of completed jobs)?"),
  websiteOutdatedSignals: z.string().describe("Any signals the website is outdated: old copyright year, broken layout mentions, etc. Empty string if none."),

  // ── Sales-Ready Fields ──
  painPointAngle: z.enum(["Storm/Emergency Calls", "High-Ticket Commercial", "Bilingual Support", "Outdated Conversion Funnel"])
    .describe("The best sales angle based on their site. 'Storm/Emergency Calls' if they push 24/7 or storm repair. 'High-Ticket Commercial' if they push Metal/TPO/Commercial. 'Bilingual Support' if they serve a Spanish-speaking area but have no bilingual mention. 'Outdated Conversion Funnel' if site lacks modern trust signals or conversion tools."),
  generatedIcebreaker: z.string().describe("A casual, hyper-personalized 1-sentence compliment or observation to open a cold email. Example: 'Saw you guys have been serving the Greeley area for over 2 decades—love the focus on GAF materials.'"),
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
              "You are an expert SDR selling AI Receptionists and Marketing Services to Roofing Contractors.",
              "Your job is to extract strict, concise data from their website to build hyper-personalized cold outreach.",
              "",
              "CRITICAL EXTRACTION RULES:",
              "1. PRIMARY CITY: Do not list every city. Pick the ONE main city or metro area they focus on.",
              "2. LEAD CAPTURE TRAPS: A 'Basic Contact Form' is terrible for conversion. Specifically check: Do they have a chat widget? Do they have an online booking calendar? If no, set hasWebChat and hasOnlineBooking to false.",
              "3. ICEBREAKER GENERATION: Write a 1-sentence personalized opening line for a cold email. Example: 'Saw you guys have been serving the Greeley area for over 2 decades—love the focus on GAF materials.'",
              "4. PAIN POINT ANGLE: Choose the best sales angle. If they offer 24/7 emergency/storm repair, choose 'Storm/Emergency Calls'. If they push Metal/TPO/Commercial, choose 'High-Ticket Commercial'. If they lack a modern site or reviews, choose 'Outdated Conversion Funnel'.",
              "5. STORM MENTIONS: Do not extract whole paragraphs. Summarize in 3-5 words (e.g., 'Recent hail storm damage').",
              "6. BILINGUAL GAP: If they don't explicitly say 'Se Habla Español', flag bilingualSupportMentioned as false.",
              "7. RESPONSE TIME: Extract ONLY the specific time promise (e.g., '24 hours', 'Same day'). If it's just a customer review mentioning time, ignore it.",
              "8. MARKETING GAPS: Look for lack of trust signals (No BBB, no reviews widget), lack of financing, or broken/outdated website elements (e.g., 'Copyright 2021').",
              "9. If a piece of info is missing, use an empty string or array. DO NOT guess.",
              "",
              "WEBSITE CONTENT:",
              scrape.markdownContent,
            ].join("\n"),
          });

          await db
            .insert(enrichedLeads)
            .values({
              email: scrape.email,
              companyName: object.companyName,
              primaryCity: object.primaryCity,
              serviceAreasJson: JSON.stringify(object.serviceAreas),
              servicesOfferedJson: JSON.stringify(object.servicesOffered),
              yearsInBusiness: object.yearsInBusiness ?? null,
              emergencyServices: object.emergencyServices,
              freeEstimateOffered: object.freeEstimateOffered,
              currentLeadCapture: object.currentLeadCapture,
              hasWebChat: object.hasWebChat,
              hasOnlineBooking: object.hasOnlineBooking,
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
              painPointAngle: object.painPointAngle,
              generatedIcebreaker: object.generatedIcebreaker,
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
