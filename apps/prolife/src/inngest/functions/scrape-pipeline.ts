import { inngest } from "@agency/queue";
import { prisma } from "@agency/db";

/**
 * Scrape Pipeline
 * Triggered when a scraping job is started.
 * Supports two modes:
 * - "exhibition": Crawls exhibition pages and extracts exhibitor data
 * - "google_search": Searches Google for distributors and crawls result pages
 */
export const scrapePipeline = inngest.createFunction(
  {
    id: "prolife-scrape-pipeline",
    throttle: { limit: 3, period: "1s" },
    retries: 3,
  },
  { event: "prolife/scrape.started" },
  async ({ event, step }) => {
    const { tenantId, jobId, sourceUrl, sourceType, sourceName } = event.data;

    // Step 1: Update job status
    await step.run("update-job-running", async () => {
      await prisma.scrapingJob.update({
        where: { id: jobId },
        data: { status: "running", startedAt: new Date() },
      });
    });

    // Step 2: Crawl or Search
    const rawData = await step.run("crawl-source", async () => {
      if (sourceType === "google_search") {
        // Google Search mode: search query is in sourceUrl field
        const { searchAndCrawl } = await import("@agency/scraping");
        const result = await searchAndCrawl(sourceUrl, {
          maxResults: 20,
          maxCrawlPages: 15,
        });

        // Combine search snippets with crawled page data
        return result.crawledPages.map((page) => {
          const matchingSearch = result.searchResults.find(
            (sr) =>
              page.url.includes(new URL(sr.url).hostname) ||
              sr.url === page.url
          );
          return {
            ...page,
            searchSnippet: matchingSearch?.snippet ?? "",
            searchTitle: matchingSearch?.title ?? "",
          };
        });
      } else {
        // Exhibition/direct crawl mode
        const { crawlPages } = await import("@agency/scraping");
        const results = await crawlPages([sourceUrl], {
          maxRequests: 100,
          maxConcurrency: 3,
        });
        return results;
      }
    });

    // Step 3: Extract and save companies
    const savedCount = await step.run("extract-and-save", async () => {
      let count = 0;

      if (sourceType === "google_search") {
        // For Google search: each crawled page is likely a company website
        const { extractCompanyWebsite } = await import("@agency/scraping");

        for (const item of rawData) {
          try {
            const extracted = extractCompanyWebsite(item);
            // Use page title as company name, cleaned up
            const name = (item as any).searchTitle ||
              item.title?.replace(/\s*[-|–].*$/, "").trim();
            if (!name || name.length < 2) continue;

            // Extract domain as identifier
            const domain = new URL(item.url).hostname.replace("www.", "");

            await prisma.company.upsert({
              where: {
                tenantId_name_country: {
                  tenantId,
                  name,
                  country: sourceName ?? "Unknown",
                },
              },
              create: {
                tenantId,
                name,
                country: sourceName ?? "Unknown",
                website: `https://${domain}`,
                description:
                  (item as any).searchSnippet ||
                  extracted.description?.slice(0, 500),
                contactEmail: extracted.contactEmails?.[0],
                contactPhone: extracted.contactPhones?.[0],
                source: "GOOGLE_SEARCH",
                sourceUrl: item.url,
                hasEcommerce: extracted.hasEcommerce,
                status: "RAW",
              },
              update: {},
            });
            count++;
          } catch (e) {
            console.error(`Skip ${item.url}:`, e);
          }
        }
      } else {
        // Exhibition mode: extract exhibitor data
        const { extractExhibitorData } = await import("@agency/scraping");

        for (const item of rawData) {
          const extracted = extractExhibitorData(item);
          if (!extracted.name) continue;

          try {
            await prisma.company.upsert({
              where: {
                tenantId_name_country: {
                  tenantId,
                  name: extracted.name,
                  country: extracted.country ?? "Unknown",
                },
              },
              create: {
                tenantId,
                name: extracted.name,
                country: extracted.country ?? "Unknown",
                city: extracted.city,
                website: extracted.website,
                description: extracted.description,
                source: sourceType.toUpperCase() as any,
                sourceUrl,
                sourceExhibition: sourceName,
                status: "RAW",
              },
              update: {},
            });
            count++;
          } catch (e) {
            console.error(`Skip ${extracted.name}:`, e);
          }
        }
      }

      return count;
    });

    // Step 4: Update job as completed
    await step.run("update-job-completed", async () => {
      await prisma.scrapingJob.update({
        where: { id: jobId },
        data: {
          status: "completed",
          totalFound: rawData.length,
          totalNew: savedCount,
          finishedAt: new Date(),
        },
      });
    });

    // Step 5: Trigger enrichment for all new RAW companies
    await step.run("trigger-enrichment", async () => {
      const rawCompanies = await prisma.company.findMany({
        where: { tenantId, status: "RAW" },
        select: { id: true },
        take: 100,
      });

      for (const company of rawCompanies) {
        await inngest.send({
          name: "prolife/enrich.started",
          data: { tenantId, companyId: company.id },
        });
      }
    });

    return { crawled: rawData.length, saved: savedCount };
  }
);
