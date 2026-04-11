import { inngest } from "@agency/queue";
import { prisma } from "@agency/db";
import { normalizeCompanyName } from "@agency/intel";

/**
 * News → Company Enrichment Pipeline
 *
 * When news items mention companies we don't have in our DB,
 * this function creates them and triggers the full enrichment flow.
 *
 * Flow:
 * 1. Load news items with their entities
 * 2. For each unmatched entity, check if a company already exists
 * 3. If not, create the company from news context
 * 4. Link the news item to the company
 * 5. Trigger enrich-company for each new company
 */
export const newsEnrichCompanies = inngest.createFunction(
  {
    id: "prolife-news-enrich-companies",
    retries: 2,
    concurrency: { limit: 1 },
  },
  { event: "prolife/news.enrich-companies" },
  async ({ event, step }) => {
    const { tenantId, newsItemIds } = event.data;

    // Step 1: Load news items that don't have a company linked yet
    const unlinkedItems = await step.run("load-unlinked-items", async () => {
      return prisma.newsItem.findMany({
        where: {
          id: { in: newsItemIds },
          companyId: null,
          entities: { isEmpty: false },
        },
        select: {
          id: true,
          title: true,
          entities: true,
          countries: true,
          category: true,
          source: true,
          url: true,
          summary: true,
        },
      });
    });

    if (unlinkedItems.length === 0) {
      return { success: true, created: 0, linked: 0 };
    }

    // Step 2: Load existing companies for fuzzy matching
    const existingCompanies = await step.run("load-existing", async () => {
      const companies = await prisma.company.findMany({
        where: { tenantId },
        select: { id: true, name: true, country: true },
      });
      return companies;
    });

    // Build normalized lookup
    const normalizedMap = new Map<string, string>();
    for (const c of existingCompanies) {
      normalizedMap.set(normalizeCompanyName(c.name), c.id);
    }

    // Step 3: Process each unlinked item
    let created = 0;
    let linked = 0;
    const newCompanyIds: string[] = [];

    for (const item of unlinkedItems) {
      const result = await step.run(`process-${item.id}`, async () => {
        // Try each entity — find or create a company
        for (const entityName of item.entities) {
          const normalized = normalizeCompanyName(entityName);
          if (!normalized || normalized.length < 3) continue;

          // Skip generic entities that aren't real companies
          if (isGenericEntity(entityName)) continue;

          // Check if this entity already maps to an existing company
          let companyId = normalizedMap.get(normalized);

          if (!companyId) {
            // Check DB with contains match (in case normalizedMap is stale)
            const fuzzyMatch = await prisma.company.findFirst({
              where: {
                tenantId,
                name: { contains: entityName, mode: "insensitive" },
              },
              select: { id: true },
            });

            if (fuzzyMatch) {
              companyId = fuzzyMatch.id;
            }
          }

          if (!companyId) {
            // Create a new company from news context
            const country = item.countries[0] ?? "Unknown";
            try {
              const newCompany = await prisma.company.create({
                data: {
                  tenantId,
                  name: entityName,
                  country,
                  source: "NEWS_INTENT",
                  sourceUrl: item.url,
                  status: "RAW",
                  description: item.summary
                    ? `Discovered from news: ${item.summary.slice(0, 200)}`
                    : `Mentioned in ${item.source}: ${item.title}`,
                },
                select: { id: true },
              });
              companyId = newCompany.id;
              normalizedMap.set(normalized, companyId);
              return { companyId, isNew: true };
            } catch {
              // Unique constraint violation — company was just created by another run
              const existing = await prisma.company.findFirst({
                where: { tenantId, name: entityName },
                select: { id: true },
              });
              if (existing) {
                companyId = existing.id;
              } else {
                continue;
              }
            }
          }

          // Link news item to company
          if (companyId) {
            await prisma.newsItem.update({
              where: { id: item.id },
              data: { companyId },
            });
            return { companyId, isNew: false };
          }
        }

        return null;
      });

      if (result) {
        linked++;
        if (result.isNew) {
          created++;
          newCompanyIds.push(result.companyId);
        }
      }
    }

    // Step 4: Trigger enrichment for each new company
    if (newCompanyIds.length > 0) {
      const enrichEvents = newCompanyIds.map((companyId) => ({
        name: "prolife/enrich.started" as const,
        data: { tenantId, companyId },
      }));

      await step.sendEvent("trigger-enrichment", enrichEvents);
    }

    return {
      success: true,
      processed: unlinkedItems.length,
      created,
      linked,
      enrichmentTriggered: newCompanyIds.length,
    };
  }
);

/** Filter out generic entities that aren't real companies */
function isGenericEntity(name: string): boolean {
  const lower = name.toLowerCase().trim();

  // Too short
  if (lower.length < 3) return true;

  // Common false positives from AI entity extraction
  const generics = new Set([
    // Regulatory agencies
    "fda", "ema", "who", "nih", "cdc", "mhra", "tga", "pmda", "anvisa", "cfda", "nmpa",
    "eu", "us", "uk", "uae",
    "united states", "european union", "united kingdom",
    "world health organization", "food and drug administration",
    "ministry of health", "department of health",
    "government", "congress", "parliament", "senate",
    // News & media outlets
    "reuters", "bloomberg", "cnbc", "bbc", "associated press", "ap news",
    "fierce pharma", "fiercepharma", "endpoints news", "stat news",
    "pharma intelligence", "pharmaphorum",
    // Analytics / research firms (false positives from AI entity extraction)
    "indexbox", "statista", "iqvia", "globaldata", "evaluate", "grand view research",
    "mordor intelligence", "fortune business insights", "marketsandmarkets",
    "coherent market insights", "precedence research", "vantage market research",
    // Generic terms
    "pharma", "pharmaceutical", "healthcare", "medical",
    "market", "industry", "sector", "report",
  ]);

  if (generics.has(lower)) return true;

  // Single common word
  if (lower.split(/\s+/).length === 1 && lower.length < 6) return true;

  return false;
}
