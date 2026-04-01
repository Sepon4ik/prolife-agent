import { inngest } from "@agency/queue";
import { prisma } from "@agency/db";
import { classifyCompany } from "@agency/ai";

/**
 * Enrich Company
 * Takes a RAW company, scrapes its website,
 * classifies it with AI, and updates the record.
 */
export const enrichCompany = inngest.createFunction(
  {
    id: "prolife-enrich-company",
    throttle: { limit: 5, period: "1s" },
    retries: 3,
  },
  { event: "prolife/enrich.started" },
  async ({ event, step }) => {
    const { tenantId, companyId } = event.data;

    // Step 1: Get company
    const company = await step.run("get-company", async () => {
      return prisma.company.findUniqueOrThrow({
        where: { id: companyId },
      });
    });

    // Step 2: Scrape website (if available) — fetch + cheerio
    let websiteContent = "";
    if (company.website) {
      websiteContent = await step.run("scrape-website", async () => {
        try {
          const { crawlPages } = await import("@agency/scraping");
          const results = await crawlPages([company.website!], {
            maxRequests: 5,
          });
          return results
            .map((r) => r.text)
            .join("\n")
            .slice(0, 10_000);
        } catch (e) {
          console.error(`Failed to scrape ${company.website}:`, e);
          return "";
        }
      });
    }

    // Step 3: Classify with AI
    const classification = await step.run("classify-with-ai", async () => {
      const content = websiteContent || company.description || company.name;
      return classifyCompany(content, company.name, company.country);
    });

    // Step 4: Update company with enrichment data
    await step.run("update-company", async () => {
      const typeMap: Record<string, any> = {
        distributor: "DISTRIBUTOR",
        pharmacy_chain: "PHARMACY_CHAIN",
        retail: "RETAIL",
        hybrid: "HYBRID",
        unknown: "UNKNOWN",
      };

      await prisma.company.update({
        where: { id: companyId },
        data: {
          type: typeMap[classification.type] ?? "UNKNOWN",
          categories: classification.categories,
          estimatedRevenue: classification.estimatedRevenue,
          hasEcommerce: classification.hasEcommerce,
          hasSalesTeam: classification.hasSalesTeam,
          hasMarketingTeam: classification.hasMarketingTeam,
          hasMedReps: classification.hasMedReps,
          pharmacyCount: classification.pharmacyCount,
          portfolioBrands: classification.portfolioBrands,
          activelySeekingBrands: classification.activelySeekingBrands,
          status: "ENRICHED",
        },
      });
    });

    // Step 5: Trigger scoring
    await step.sendEvent("trigger-scoring", {
      name: "prolife/score.calculate",
      data: { tenantId, companyId },
    });

    return { companyId, classification };
  }
);
